import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { Backend, watchErrors } from './server.js';
import { click, collapseChat, hasAction, settle, waitSaved } from './fc.js';

/**
 * Mandatory walkthrough (master prompt §14): genuine backend, three isolated browser contexts,
 * invitation, roles, actions from both players, rejected/stale actions, reconnect, restart, recovery.
 */
test('host, guest and spectator play First Contact across isolated browsers with restart recovery', async ({ browser }) => {
  const backend = new Backend();
  await backend.start();
  const ctx: BrowserContext[] = [];
  const page = async () => { const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }); ctx.push(c); return c.newPage(); };
  try {
    const host = await page(), guest = await page(), spec = await page();
    const errors = [host, guest, spec].map(watchErrors);

    // 1. Create a room from the First Contact template and read the genuine invitations.
    await host.goto(backend.url + '/#/create');
    await host.getByRole('radio', { name: /Intrilex · First Contact/ }).check();
    await host.getByLabel('Your nickname').fill('Ada');
    await host.getByRole('button', { name: 'Create table' }).click();
    await expect(host.getByRole('heading', { name: 'Invite people' })).toBeVisible();
    const invite = await host.getByLabel('Player invitation').inputValue();
    const spectatorInvite = await host.getByLabel('Spectator invitation (read-only)').inputValue();
    expect(invite).toMatch(/#\/join\/[\w-]{43}$/);
    expect(spectatorInvite).not.toBe(invite);
    await host.keyboard.press('Escape');
    await expect(host.getByRole('heading', { name: 'Invite people' })).toBeHidden();
    await collapseChat(host);

    // 2. Guest joins in a separate context; spectator joins in a third.
    await guest.goto(invite);
    await guest.getByLabel('Your nickname').fill('Bo');
    await guest.getByRole('button', { name: 'Join table' }).click();
    await expect(guest.locator('.you-are')).toHaveText(/Player 2/);
    await collapseChat(guest);
    await spec.goto(spectatorInvite);
    await spec.getByLabel('Your nickname').fill('Cy');
    await spec.getByRole('button', { name: 'Join table' }).click();
    await expect(spec.locator('.you-are')).toHaveText(/Spectating/);
    await collapseChat(spec);

    // 3. Roles and visibility differ: only players have hands; only the host can invite.
    await expect(host.locator('.you-are')).toHaveText(/Player 1 · host/);
    await expect(host.getByRole('button', { name: 'Invite' })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Invite' })).toHaveCount(0);
    await expect(spec.getByRole('region', { name: 'Your private hand' })).toHaveCount(0);
    const hostHand = host.getByRole('region', { name: 'Your private hand' }).locator('.card');
    const guestHand = guest.getByRole('region', { name: 'Your private hand' }).locator('.card');
    expect((await hostHand.count()) + (await guestHand.count())).toBe(11);
    const specLabels = await spec.locator('.card').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    expect(specLabels.every(l => l === 'Face-down card' || !l?.includes('in hand')), 'spectator sees only public cards').toBeTruthy();

    // 4. Actions from both players through the real UI.
    const active = async (): Promise<[Page, Page]> => ((await hasAction(host, /^Draw/)) ? [host, guest] : [guest, host]);
    for (let turn = 0; turn < 2; turn++) {
      const [me, them] = await active();
      await click(me, /^Draw/);
      await settle([me, them]);
      await click(me, /^End turn/);
      await settle([me, them]);
      await waitSaved(me);
    }
    await expect(spec.locator('.fc-status')).toContainText(/Turn 3/);

    // Rejected unauthorised action and a stale action, submitted with the browser's own credentials.
    const probe = async (p: Page, path: string, body?: unknown) => p.evaluate(async ([path, body]) => {
      const { csrf } = await (await fetch('/api/session')).json();
      const r = await fetch(path as string, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    }, [path, body] as const);
    const roomId = host.url().split('/').pop()!;
    expect((await probe(guest, `/api/rooms/${roomId}/invites`)).status).toBe(403);
    expect((await probe(spec, `/api/rooms/${roomId}/commands`, { requestId: 'spectator-attempt', revision: 0, command: { type: 'game', action: { type: 'draw' } } })).body.error).toBe('SEAT_REQUIRED');
    expect((await probe(host, `/api/rooms/${roomId}/commands`, { requestId: 'stale-attempt-1', revision: 0, command: { type: 'game', action: { type: 'end' } } })).body.error).toBe('STALE_REVISION');
    await expect(host.locator('.fc-status')).toContainText(/Turn 3/);

    // Remote presence reaches the other browser (ephemeral, not persisted).
    await host.locator('.fc-surface').hover({ position: { x: 300, y: 200 } });
    await host.mouse.move(320, 260); await host.mouse.move(340, 280);
    await expect(guest.locator('.remote-pointer .pointer-name', { hasText: 'Ada' })).toBeVisible();

    // 5. Refresh, then restart the backend and recover the accepted state.
    const beforeHand = await hostHand.evaluateAll(els => els.map(e => e.getAttribute('aria-label')).sort());
    await host.reload();
    await expect(hostHand).toHaveCount(beforeHand.length);
    await backend.stop();
    await expect(guest.locator('.save-state')).toHaveText(/Disconnected/, { timeout: 15_000 });
    await backend.start();
    await waitSaved(guest);
    await host.reload();
    await expect(host.locator('.fc-status')).toContainText(/Turn 3/);
    expect(await hostHand.evaluateAll(els => els.map(e => e.getAttribute('aria-label')).sort())).toEqual(beforeHand);
    await expect(spec.locator('.you-are')).toHaveText(/Spectating/);

    // 8. Logs and responses carry no credentials.
    const logs = backend.logs.join('');
    const cookies = (await Promise.all(ctx.map(c => c.cookies()))).flat().map(c => c.value);
    for (const secret of [invite.split('/').pop()!, spectatorInvite.split('/').pop()!, roomId, ...cookies]) expect(logs.includes(secret), 'secret in logs').toBeFalsy();
    for (const e of errors) expect(e).toEqual([]);
  } finally {
    for (const c of ctx) await c.close();
    await backend.stop();
  }
});
