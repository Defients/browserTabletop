import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';
import { Backend, watchErrors } from './server.js';
import { builtInTemplates } from '../packages/templates/index.js';

let backend: Backend;
test.beforeAll(async () => { backend = new Backend(); await backend.start(); });
test.afterAll(async () => { await backend.stop(); });
mkdirSync('artifacts/screens', { recursive: true });

async function createRoom(page: Page, template: RegExp, name = 'Ada') {
  await page.goto(backend.url + '/#/create');
  await page.getByRole('radio', { name: template }).check();
  await page.getByLabel('Your nickname').fill(name);
  await page.getByRole('button', { name: 'Create table' }).click();
  await page.getByRole('heading', { name: 'Invite people' }).waitFor();
  const invite = await page.getByLabel('Player invitation').inputValue();
  await page.keyboard.press('Escape');
  return invite;
}
async function axe(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map(v => `${where}: ${v.id} — ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]] as const) {
  test(`layout and automated accessibility at ${w}×${h}`, async ({ page, browserName }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = watchErrors(page);
    const shot = (n: string) => page.screenshot({ path: `artifacts/screens/${browserName}-${w}x${h}-${n}.png` });
    await page.goto(backend.url + '/#/');
    await expect(page.getByRole('link', { name: /Create table/ })).toBeVisible();
    await axe(page, 'home'); await shot('home');
    await createRoom(page, /Intrilex · First Contact/);
    await axe(page, 'first-contact room'); await shot('first-contact');
    if (w === 390) {
      await expect(page.locator('.fc-panel')).toBeInViewport();
      await expect(page.getByRole('region', { name: 'Your private hand' })).toBeAttached();
    }
    await createRoom(page, /The classic deck/);
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await expect(page.locator('.hand-tray .card')).toHaveCount(1);
    await axe(page, 'free table'); await shot('free-table');
    await page.goto(backend.url + '/#/learn/guard-scuttle');
    await axe(page, 'lesson'); await shot('lesson');
    await page.goto(backend.url + '/#/templates/copy-counter-lab');
    await shot('editor');
    await page.goto(backend.url + '/#/rules');
    await page.getByLabel('Search rules').fill('guard');
    await expect(page.locator('.rule-list li').first()).toContainText(/Guard/);
    await axe(page, 'rules');
    expect(errors).toEqual([]);
  });
}

test('keyboard-only: create a table, open and close dialogs with focus restored, play an action', async ({ page }) => {
  await page.goto(backend.url + '/#/');
  await page.keyboard.press('Tab'); // skip link
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  for (let i = 0; i < 30 && !(await page.getByRole('link', { name: /Create table/ }).evaluate(e => e === document.activeElement)); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Create a table' })).toBeVisible();
  await page.getByRole('radio', { name: /Intrilex · First Contact/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Intrilex · Full/ })).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /The classic deck/ })).toBeChecked();
  await page.getByLabel('Your nickname').focus();
  await page.keyboard.type('Keys');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Invite people' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close dialog' })).toBeVisible();
  await page.keyboard.press('Escape');
  const people = page.getByRole('button', { name: /People/ });
  await people.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'People at this table' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(people).toBeFocused();
  const draw = page.getByRole('button', { name: 'Draw', exact: true });
  await draw.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.hand-tray .card')).toHaveCount(1);
  // Select the hand card by keyboard, open the move dialog with M, submit with Enter.
  await page.locator('.hand-tray .card').first().focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('m');
  await expect(page.getByRole('heading', { name: 'Move selected cards' })).toBeVisible();
  await page.getByLabel('Destination').selectOption({ label: 'Table' });
  await page.getByRole('button', { name: 'Move', exact: true }).press('Enter');
  await expect(page.locator('.placed .card')).toHaveCount(1);
  await expect(page.locator('.save-state')).toHaveText(/Saved/);
});

test('reduced motion is honoured', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(backend.url + '/#/');
  const d = await page.locator('.path-card').first().evaluate(e => getComputedStyle(e).transitionDuration);
  expect(parseFloat(d)).toBeLessThan(0.01);
  await ctx.close();
});

test('performance: 8 seats and 108 cards; remote cursors do not re-render the durable board', async ({ page, browserName }) => {
  const base = builtInTemplates.find(t => t.id === 'standard-54')!;
  const cards = [...base.cards, ...base.cards.map(c => ({ ...c, id: `b-${c.id}` }))];
  const template = { ...structuredClone(base), id: 'perf-108', title: 'Perf 108', cards, decks: [{ id: 'd', zone: 'deck', cards: cards.map(c => c.id) }], setup: [{ op: 'shuffle', zone: 'deck' }, { op: 'place', zone: 'deck', target: 'table', count: 60, faceUp: true }] };
  await page.setViewportSize({ width: 1440, height: 900 });
  // Finish the home page's session bootstrap before the fixture's direct fetch.
  // Otherwise two cookie-less /api/session calls can create different sessions,
  // leaving the application's cached CSRF token paired with the fixture's cookie.
  const homeReady = page.waitForResponse(r => r.url() === backend.url + '/api/rooms' && r.request().method() === 'GET' && r.status() === 200);
  await page.goto(backend.url + '/#/');
  await homeReady;
  const room = await page.evaluate(async t => {
    const { csrf } = await (await fetch('/api/session')).json();
    const r = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ nickname: 'Host', template: t }) });
    return r.json();
  }, template);
  // Seven more seats join from separate sessions (Node clients) and move their cursors continuously.
  const guests: WebSocket[] = [];
  for (let i = 0; i < 7; i++) {
    const s = await fetch(backend.url + '/api/session');
    const cookie = s.headers.get('set-cookie')!.split(';')[0]!;
    const { csrf } = await s.json() as { csrf: string };
    await fetch(backend.url + '/api/join', { method: 'POST', headers: { cookie, origin: backend.url, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ invite: room.invite, nickname: `Guest${i}` }) });
    const ws = new WebSocket(`${backend.url.replace('http', 'ws')}/ws?room=${room.roomId}`, { headers: { cookie, origin: backend.url } });
    await new Promise(r => ws.once('open', r));
    guests.push(ws);
  }
  const t0 = Date.now();
  await page.goto(`${backend.url}/#/room/${room.roomId}`);
  await expect(page.locator('.placed .card')).toHaveCount(60);
  const firstRender = Date.now() - t0;
  await expect(page.getByRole('button', { name: /People \(8\)/ })).toBeVisible();
  // Count DOM mutations in the durable board while 7 cursors move for ~2 seconds.
  await page.evaluate(() => { const w = document.querySelector('.world')!; (window as unknown as { __m: number }).__m = 0; new MutationObserver(l => { (window as unknown as { __m: number }).__m += l.length; }).observe(w, { subtree: true, childList: true, attributes: true, characterData: true }); });
  const timer = setInterval(() => guests.forEach(g => g.send(JSON.stringify({ type: 'presence', x: Math.random(), y: Math.random(), surface: 'table' }))), 60);
  await page.waitForTimeout(2000);
  clearInterval(timer);
  await expect(page.locator('.remote-pointer').first()).toBeVisible();
  const boardMutations = await page.evaluate(() => (window as unknown as { __m: number }).__m);
  expect(boardMutations, 'cursor traffic must not touch the durable board DOM').toBe(0);
  // Command round-trip to rendered update, keyboard-driven moves.
  const card = page.locator('.placed .card').first();
  await card.focus(); await page.keyboard.press('Enter');
  const samples: number[] = [];
  const moving = page.locator('.placed:has(.card.is-selected)');
  await expect(moving).toHaveCount(1);
  for (let i = 0; i < 10; i++) {
    const before = await moving.getAttribute('style');
    const s = Date.now();
    await page.keyboard.press(i % 2 ? 'ArrowUp' : 'ArrowDown');
    await expect.poll(async () => moving.getAttribute('style')).not.toBe(before);
    samples.push(Date.now() - s);
  }
  guests.forEach(g => g.close());
  const result = { browser: browserName, cards: 108, seats: 8, tableCardsRendered: 60, firstRenderMs: firstRender, moveRoundTripMs: { median: samples.sort((a, b) => a - b)[5], max: Math.max(...samples) }, boardMutationsDuringCursorStorm: boardMutations, measuredAt: new Date().toISOString(), environment: `${process.platform} ${process.arch}, Node ${process.version}, local loopback` };
  writeFileSync(`artifacts/perf-${browserName}.json`, JSON.stringify(result, null, 2));
  expect(result.moveRoundTripMs.median).toBeLessThan(1000);
});
