import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { Backend, watchErrors } from './server.js';
import type { RoomView } from '../packages/protocol/index.js';
import { actionInput } from '../packages/intrilex/actionIdentity.js';

mkdirSync('artifacts/screens', { recursive: true });

async function create(page: Page, backend: Backend, profile: RegExp = /Intrilex · First Contact/) {
  await page.goto(backend.url + '/#/create');
  await page.getByRole('radio', { name: profile }).check();
  await page.getByLabel('Your nickname').fill('Ada'); await page.getByRole('button', { name: 'Create table' }).click();
  await expect(page.getByRole('heading', { name: 'Invite people' })).toBeVisible();
  const invite = await page.getByLabel('Player invitation').inputValue(), spectator = await page.getByLabel('Spectator invitation (read-only)').inputValue();
  await page.keyboard.press('Escape'); return { invite, spectator, roomId: page.url().split('/').pop()! };
}
async function join(page: Page, invite: string, nickname: string) {
  await page.goto(invite); await page.getByLabel('Your nickname').fill(nickname); await page.getByRole('button', { name: 'Join table' }).click(); await expect(page.locator('.you-are')).toBeVisible();
}
const trigger = (page: Page) => page.getByRole('button', { name: /^Room chat/ });
async function openChat(page: Page) { if (await trigger(page).getAttribute('aria-expanded') !== 'true') await trigger(page).click(); await expect(page.getByText('Room chat is temporary:', { exact: false })).toBeVisible(); }
async function send(page: Page, text: string) { await page.getByLabel('Message the room').fill(text); await page.getByRole('button', { name: 'Send message', exact: true }).click(); await expect(page.getByLabel('Message the room')).toHaveValue(''); }
async function pages(browser: Browser, count: number, viewport = { width: 1440, height: 900 }) {
  const contexts: BrowserContext[] = [], result: Page[] = [];
  for (let i = 0; i < count; i++) { const context = await browser.newContext({ viewport }); contexts.push(context); result.push(await context.newPage()); }
  return { contexts, pages: result };
}

test('real room social journey: unread, identity mention, reply, literal HTML, local mute, rules, read-only and reconnect', async ({ browser }) => {
  const backend = new Backend(); await backend.start(); const clients = await pages(browser, 3); const [host, guest, spectator] = clients.pages;
  const errors = clients.pages.map(watchErrors);
  try {
    const room = await create(host!, backend); await join(guest!, room.invite, 'Bo'); await join(spectator!, room.spectator, 'Reader');
    await openChat(host!); const guestId = await guest!.evaluate(async id => { const view: RoomView = await (await fetch(`/api/rooms/${id}`)).json(); return view.you.id; }, room.roomId);
    await host!.getByLabel('Mention participant').selectOption(guestId); await host!.getByLabel('Attach rules reference').selectOption('guard');
    await send(host!, '<script>window.socialExploit=true</script>\nHello Bo');
    await expect(trigger(guest!)).toHaveText(/1 unread/);
    await expect(guest!.locator('.notice-mention')).toContainText('mentioned you');
    await guest!.getByRole('button', { name: 'Dismiss mention notification' }).click(); await expect(guest!.locator('.notice-mention')).toHaveCount(0);
    await openChat(guest!); await expect(trigger(guest!)).not.toHaveText(/unread/);
    const incoming = guest!.locator('.chat-entry').filter({ hasText: 'Hello Bo' });
    await expect(incoming.locator('.chat-body')).toContainText('<script>window.socialExploit=true</script>'); await expect(incoming.locator('.chat-mention')).toHaveText(/@Bo/);
    expect(await guest!.evaluate(() => Object.hasOwn(window, 'socialExploit'))).toBe(false); await expect(incoming.locator('script')).toHaveCount(0);
    await incoming.getByRole('button', { name: 'Guard', exact: true }).click(); await expect(guest!.getByRole('dialog', { name: 'Guard', exact: true })).toBeVisible(); await expect(guest!.getByRole('dialog', { name: 'Guard', exact: true })).toContainText('never blocks Scuttle'); await guest!.keyboard.press('Escape');
    await incoming.getByRole('button', { name: 'Reply', exact: true }).click(); await send(guest!, 'Reply from Bo');
    const reply = host!.locator('.chat-entry').filter({ hasText: 'Reply from Bo' }); await expect(reply.locator('blockquote')).toContainText('Hello Bo');
    await openChat(spectator!); await expect(spectator!.getByText(/Read-only spectator —/)).toBeVisible(); await expect(spectator!.getByLabel('Message the room')).toHaveCount(0); await expect(spectator!.locator('.chat-entry')).toHaveCount(2);
    const refusal = await spectator!.evaluate(async id => {
      return await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws?room=${id}`);
        const timer = setTimeout(() => { ws.close(); reject(new Error('missing read-only refusal')); }, 5000);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'chat-send', requestId: 'readonly-forged1', parts: [{ type: 'text', text: 'forged' }] }));
        ws.onmessage = e => { const message = JSON.parse(e.data); if (message.type === 'chat-result') { clearTimeout(timer); ws.close(); resolve(message.code); } };
      });
    }, room.roomId); expect(refusal).toBe('CHAT_READ_ONLY');
    await incoming.getByRole('button', { name: 'Mute', exact: true }).click(); await guest!.getByRole('button', { name: 'Collapse room chat' }).click();
    await host!.getByLabel('Mention participant').selectOption(guestId); await send(host!, 'Muted follow-up');
    await expect(trigger(guest!)).not.toHaveText(/unread/); await expect(guest!.locator('.notice-mention')).toHaveCount(0);
    await openChat(guest!); await expect(guest!.getByText('Muted follow-up', { exact: true })).toHaveCount(0);
    await guest!.locator('.chat-entry').first().getByRole('button', { name: 'Unmute', exact: true }).click(); await expect(guest!.locator('.chat-body').filter({ hasText: 'Muted follow-up' })).toBeVisible();
    await guest!.reload(); await openChat(guest!); await expect(guest!.locator('.chat-entry')).toHaveCount(3); await expect(guest!.locator('.notice-mention')).toHaveCount(0);
    await backend.restart(); await expect(guest!.getByText(/Earlier chat is unavailable:/)).toBeVisible({ timeout: 20_000 }); await expect(guest!.locator('.chat-entry')).toHaveCount(0);
    expect(errors).toEqual([[], [], []]);
  } finally { for (const context of clients.contexts) await context.close(); await backend.stop(); }
});

test('suggested move uses current exact legal action over HTTP; pending and disconnected execution are disabled', async ({ browser }) => {
  const backend = new Backend(); await backend.start(); const clients = await pages(browser, 2); const [host, guest] = clients.pages;
  try {
    const room = await create(host!, backend); await join(guest!, room.invite, 'Bo');
    const view = await host!.evaluate(async id => { const v: RoomView = await (await fetch(`/api/rooms/${id}`)).json(); return v; }, room.roomId);
    const actor = view.game!.activePlayer === view.you.seat ? host! : guest!;
    const current = await actor.evaluate(async id => { const v: RoomView = await (await fetch(`/api/rooms/${id}`)).json(); return v; }, room.roomId);
    const suggestions = actor.getByRole('region', { name: 'Suggested Moves' }); await expect(suggestions).toBeVisible(); expect(await suggestions.locator('button.suggested-action').count()).toBeLessThanOrEqual(2);
    const suggestion = suggestions.locator('button.suggested-action').first();
    const label = (await suggestion.getAttribute('aria-label'))!.replace(/^Suggested move \d+: /, '');
    const legal = current.game!.legalActions.find(action => action.label === label); expect(legal).toBeDefined();
    await expect(actor.locator('.fc-actions button').filter({ hasText: label }).first()).toBeVisible();
    expect(await actor.locator('.fc-suggestions').evaluate(el => { const possible = document.querySelector('.fc-possible-heading'); return !!possible && !!(el.compareDocumentPosition(possible) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
    let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; }); let payload: unknown;
    await actor.route(`**/api/rooms/${room.roomId}/commands`, async route => { payload = route.request().postDataJSON(); await gate; await route.continue(); });
    await suggestion.click(); await expect(suggestion).toBeDisabled(); await expect(actor.locator('.fc-actions button:enabled')).toHaveCount(0);
    expect(payload).toMatchObject({ revision: current.revision, command: { type: 'game', action: actionInput(legal!) } });
    release(); await expect(actor.locator('.save-state')).toHaveText(/Saved/);
    await actor.unroute(`**/api/rooms/${room.roomId}/commands`);
    await backend.stop(); await expect(actor.locator('.save-state')).toHaveText(/Disconnected/, { timeout: 15_000 }); await expect(actor.locator('.fc-actions button:enabled')).toHaveCount(0); await expect(actor.locator('.suggested-action:enabled')).toHaveCount(0);
  } finally { for (const context of clients.contexts) await context.close(); await backend.stop(); }
});

test('scroll position, unread watermark and same-epoch reconnect survive live chat; rejected draft retries explicitly', async ({ browser }) => {
  const backend = new Backend(); await backend.start(); const clients = await pages(browser, 2); const [host, guest] = clients.pages;
  try {
    await guest!.addInitScript(() => {
      const connections: WebSocket[] = []; const Original = window.WebSocket;
      window.WebSocket = class extends Original { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); connections.push(this); } };
      Object.defineProperty(window, 'socialTestSockets', { value: connections });
    });
    const room = await create(host!, backend); await join(guest!, room.invite, 'Bo'); await openChat(host!); await openChat(guest!);
    for (let i = 0; i < 4; i++) await send(host!, `Long entry ${i}\n${'A line to create real scroll overflow.\n'.repeat(15)}`);
    await expect(guest!.locator('.chat-entry')).toHaveCount(4);
    const list = guest!.locator('.chat-messages'); expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await list.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
    await send(host!, 'Scroll remains where you left it'); await expect(trigger(guest!)).toHaveText(/1 unread/); expect(await list.evaluate(el => el.scrollTop)).toBeLessThan(10);
    await guest!.getByRole('button', { name: /^Jump to latest/ }).click(); await expect(trigger(guest!)).not.toHaveText(/unread/); expect(await list.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(30);
    await guest!.getByRole('button', { name: 'Collapse room chat' }).click(); await send(host!, 'Unread through socket reconnect'); await expect(trigger(guest!)).toHaveText(/1 unread/);
    const connectionCount = await guest!.evaluate(() => { const connections: unknown = Reflect.get(window, 'socialTestSockets'); if (!Array.isArray(connections)) throw new Error('socket tracking missing'); for (const socket of connections) if (socket instanceof WebSocket && socket.readyState === WebSocket.OPEN) socket.close(); return connections.length; });
    await expect.poll(() => guest!.evaluate(() => { const connections: unknown = Reflect.get(window, 'socialTestSockets'); return Array.isArray(connections) ? connections.length : 0; })).toBeGreaterThan(connectionCount);
    await expect(guest!.locator('.save-state')).toHaveText(/Saved/, { timeout: 15_000 }); await expect(trigger(guest!)).toHaveText(/1 unread/); await openChat(guest!); await expect(guest!.locator('.chat-entry')).toHaveCount(6);
    await host!.getByLabel('Message the room').fill('Rate-limited draft preserved'); await host!.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(host!.getByText('Message failed.', { exact: true })).toBeVisible(); await expect(host!.getByLabel('Message the room')).toHaveValue('Rate-limited draft preserved'); await expect(host!.locator('.save-state')).toHaveText(/Saved/);
    await host!.waitForTimeout(10_100); await host!.getByRole('button', { name: 'Retry same message', exact: true }).click();
    await expect(host!.getByLabel('Message the room')).toHaveValue(''); await expect(guest!.locator('.chat-entry')).toHaveCount(7); await expect(guest!.locator('.chat-body').filter({ hasText: 'Rate-limited draft preserved' })).toHaveCount(1);
  } finally { for (const context of clients.contexts) await context.close(); await backend.stop(); }
});

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
  test(`chat keyboard, IME, focus and accessibility coexist with board at ${width}×${height}`, async ({ page }, testInfo) => {
    const backend = new Backend(); await backend.start();
    try {
      await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'reduce' }); await create(page, backend); await openChat(page);
      const draft = page.getByLabel('Message the room'); await draft.fill('composition stays draft');
      await draft.dispatchEvent('compositionstart'); await draft.press('Enter'); await expect(page.locator('.chat-entry')).toHaveCount(0); await expect(draft).toHaveValue(/composition stays draft/); await draft.dispatchEvent('compositionend'); await draft.fill('composition stays draft');
      await draft.press('Shift+Enter'); await expect(draft).toHaveValue('composition stays draft\n'); await draft.press('Enter'); await expect(page.locator('.chat-entry')).toHaveCount(1); await expect(draft).toHaveValue('');
      await draft.fill('draft while collapsed');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze(); expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id)).toEqual([]);
      await page.screenshot({ path: `artifacts/screens/social-${width}-${testInfo.project.name}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      if (width < 860) { await expect(page.getByRole('dialog', { name: 'Room chat', exact: true })).toBeVisible(); await page.keyboard.press('Escape'); }
      else await page.getByRole('button', { name: 'Collapse room chat' }).click();
      await expect(trigger(page)).toBeFocused(); await openChat(page); await expect(draft).toHaveValue('draft while collapsed');
      if (width < 860) { await page.keyboard.press('Escape'); await expect(page.locator('.fc-panel')).toBeInViewport(); await page.screenshot({ path: `artifacts/screens/social-${width}-${testInfo.project.name}-board.png` }); }
    } finally { await backend.stop(); }
  });
}

test('Full offers projected Start suggestions and live chat; Core keeps chat with manual actions only', async ({ browser }) => {
  const backend = new Backend(); await backend.start(); const clients = await pages(browser, 2); const [host, guest] = clients.pages;
  try {
    for (const profile of [/Intrilex · Full/, /Intrilex · Core sandbox/]) {
      const room = await create(host!, backend, profile); await join(guest!, room.invite, 'Bo');
      const view = await host!.evaluate(async id => { const v: RoomView = await (await fetch(`/api/rooms/${id}`)).json(); return v; }, room.roomId);
      if (view.game) {
        const actor = view.game.activePlayer === view.you.seat ? host! : guest!;
        await expect(actor.getByRole('region', { name: 'Suggested Moves' })).toBeVisible();
        const own = await actor.evaluate(async id => { const v: RoomView = await (await fetch(`/api/rooms/${id}`)).json(); return v; }, room.roomId);
        expect(own.game!.phase).toBe('start');
        const phaseTransition = own.game!.legalActions.find(a => a.type === 'start-action'); expect(phaseTransition).toBeDefined();
        await expect(actor.locator('.fc-actions').getByRole('button', { name: phaseTransition!.label, exact: false })).toBeVisible();
        for (const button of await actor.locator('.suggested-action').all()) {
          const label = (await button.getAttribute('aria-label'))!.replace(/^Suggested move \d+: /, '');
          expect(own.game!.legalActions.some(a => a.label === label)).toBe(true);
        }
        await expect(actor.locator('.fc-actions button').first()).toBeVisible();
      } else {
        await expect(host!.getByRole('region', { name: 'Suggested Moves' })).toHaveCount(0);
        await expect(guest!.getByRole('region', { name: 'Suggested Moves' })).toHaveCount(0);
      }
      await openChat(host!); await openChat(guest!); await send(host!, `Hello ${view.profile}`);
      await expect(guest!.locator('.chat-body')).toContainText(`Hello ${view.profile}`);
    }
  } finally { for (const context of clients.contexts) await context.close(); await backend.stop(); }
});
