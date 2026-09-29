import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { RoomView } from '../packages/protocol/index.js';
import { Backend, watchErrors } from './server.js';
import { settle, waitSaved } from './fc.js';

test('Full table preserves public/private zones through play, reconnect and reset on mobile', async ({ browser }) => {
  const backend = new Backend();
  await backend.start();
  const contexts: BrowserContext[] = [];
  const makePage = async () => { const c = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(c); return c.newPage(); };
  try {
    const host = await makePage(), guest = await makePage(), observer = await makePage();
    const errors = [host, guest, observer].map(watchErrors);
    await host.goto(`${backend.url}/#/create`);
    await host.getByRole('radio', { name: /Intrilex · Full/ }).check();
    await host.getByLabel('Your nickname').fill('Full host');
    await host.getByRole('button', { name: 'Create table', exact: true }).click();
    await expect(host.getByRole('heading', { name: 'Invite people' })).toBeVisible();
    const playerInvite = await host.getByLabel('Player invitation').inputValue();
    const spectatorInvite = await host.getByLabel('Spectator invitation (read-only)').inputValue();
    await host.keyboard.press('Escape');
    for (const [page, invite, name] of [[guest, playerInvite, 'Full guest'], [observer, spectatorInvite, 'Full observer']] as const) {
      await page.goto(invite);
      await page.getByLabel('Your nickname').fill(name);
      await page.getByRole('button', { name: 'Join table', exact: true }).click();
      await expect(page.locator('.fc-status')).toContainText('Intrilex Full');
    }
    const roomId = host.url().split('/').pop()!;
    const snapshot = (p: Page): Promise<RoomView> => p.evaluate(async id => (await fetch(`/api/rooms/${id}`)).json(), roomId);
    const initial = await Promise.all([host, guest, observer].map(snapshot));
    expect(initial.map(v => v.game!.profile)).toEqual(['intrilex-full', 'intrilex-full', 'intrilex-full']);
    expect(initial[0]!.seats).toBe(2);
    expect(initial.slice(0, 2).map(v => v.game!.hand.length).sort()).toEqual([5, 6]);
    expect(initial[0]!.game!.players.map(p => p.goal)).toEqual([21, 21]);
    expect(initial[0]!.game!.deckCount).toBe(40);
    const hiddenIds = initial.slice(0, 2).map(v => v.game!.hand.map(c => c.id));
    for (let i = 0; i < initial.length; i++) {
      const v = initial[i]!;
      expect(v.game!.swapBar?.filter(s => !s.card)).toHaveLength(2);
      expect(v.game!.swapBar?.filter(s => !!s.card)).toHaveLength(1);
      for (const id of hiddenIds.flatMap((ids, seat) => seat === i ? [] : ids)) expect(JSON.stringify(v)).not.toContain(id);
      expect('deck' in v.game!).toBe(false);
    }
    await expect(observer.getByRole('region', { name: 'Your private hand' })).toHaveCount(0);
    await expect(observer.locator('.fc-actions button')).toHaveCount(0);
    await expect(host.getByRole('group', { name: 'Swap Bar', exact: true }).locator('.card-back')).toHaveCount(2);
    await expect(host.getByRole('group', { name: 'Exile, 0 cards' })).toBeVisible();

    // Only click engine-projected declarations; take a regular Draw through both players' turns.
    for (let turn = 0; turn < 2; turn++) {
      const current = (await snapshot(host)).game!;
      const active = current.activePlayer === 0 ? host : guest;
      if (current.phase === 'start') {
        const start = active.locator('.fc-actions button.action-start-action:enabled');
        await expect(start).toBeVisible();
        await start.click(); await waitSaved(active);
      }
      await active.locator('.fc-actions button.action-draw:enabled').first().click();
      await waitSaved(active); await settle([host, guest]);
      await active.locator('.fc-actions button.action-end:enabled').click();
      await waitSaved(active); await settle([host, guest]);
    }
    await expect(observer.locator('.fc-status')).toContainText('Turn 3');
    const before = (await snapshot(host)).game!;
    await backend.restart();
    await host.reload();
    await expect(host.locator('.fc-status')).toContainText('Turn 3');
    const after = (await snapshot(host)).game!;
    expect(after.hand).toEqual(before.hand);
    expect(after.swapBar).toEqual(before.swapBar);
    expect(after.profile).toBe('intrilex-full');
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await host.getByRole('button', { name: 'Table menu', exact: true }).click();
    await host.getByRole('button', { name: 'Reset table…', exact: true }).click();
    await host.getByRole('button', { name: 'Reset for everyone', exact: true }).click();
    await waitSaved(host);
    await expect(host.locator('.fc-status')).toContainText('Turn 1');
    const reset = (await snapshot(host)).game!;
    expect(reset.profile).toBe('intrilex-full');
    expect(reset.deckCount).toBe(40);
    expect(reset.swapBar).toHaveLength(3);
    expect(reset.players.map(p => p.goal)).toEqual([21, 21]);
    for (const error of errors) expect(error).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    await backend.stop();
  }
});
