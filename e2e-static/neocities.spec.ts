import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { Backend } from '../e2e/server.js';

let server: Server, url: string, backend: Backend;
const staticRoot = resolve('dist/neocities');

test.beforeAll(async () => {
  backend = new Backend(); await backend.start();
  server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname;
    // No API, WebSockets or SPA fallback. Serve at a subdirectory to catch absolute asset paths.
    const match = path.match(/^\/(tabletop|connected)\/(.*)$/);
    if (!match) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'");
    const name = match[2] || 'index.html';
    if (name === 'site-config.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`window.TABLETOP_CONFIG = ${JSON.stringify({ roomServerUrl: match[1] === 'connected' ? backend.url : '' })};`); return;
    }
    const file = resolve(staticRoot, name);
    if (!file.startsWith(staticRoot + sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(file)] ?? 'application/octet-stream');
      res.end(readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>(done => server.close(() => done()));
  await backend?.stop();
});

test('static subdirectory: no network service calls, local persistence, lesson and template export/import', async ({ page }) => {
  const failed: string[] = [], errors: string[] = [], serviceCalls: string[] = [];
  page.on('requestfailed', req => failed.push(req.url()));
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => { if (/\/(api\/|ready|ws\?)/.test(req.url())) serviceCalls.push(req.url()); });
  page.on('websocket', ws => serviceCalls.push(ws.url()));
  await page.goto(url + '/tabletop/');
  await expect(page.getByRole('heading', { name: 'Make room for play.' })).toBeVisible();
  await page.goto(url + '/tabletop/#/practice/table/standard-54');
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(page.locator('.hand-tray .card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.hand-tray .card')).toHaveCount(1);
  await page.goto(url + '/tabletop/#/practice/first-contact');
  await expect(page.getByRole('region', { name: 'Suggested Moves' })).toBeVisible();
  await expect(page.locator('.fc-actions button').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Room chat/ })).toHaveCount(0);
  await page.goto(url + '/tabletop/#/learn/orientation');
  await expect(page.getByRole('region', { name: 'Suggested Moves' })).toHaveCount(0);
  await page.locator('[data-zone="gy"] .zone-pick').click();
  await expect(page.locator('.lesson-feedback')).toContainText('Not quite');
  for (const zone of ['hand', 'dp', 'pr', 'er', 'gy']) await page.locator(`.is-mine [data-zone="${zone}"] .zone-pick, .fc-center [data-zone="${zone}"] .zone-pick, .fc-hand[data-zone="${zone}"] .zone-pick`).first().click();
  await page.getByRole('region', { name: 'Your private hand' }).getByRole('button', { name: '7♥', exact: true }).dblclick();
  await page.keyboard.press('Escape');
  await expect(page.locator('.lesson-feedback')).toHaveClass(/is-complete/);
  await page.goto(url + '/tabletop/#/templates/copy-standard-54');
  await page.getByLabel('Template name').fill('Neocities deck');
  await page.getByRole('button', { name: 'Save template' }).click();
  const download = page.waitForEvent('download');
  await page.locator('.template-card', { hasText: 'Neocities deck' }).getByRole('button', { name: 'Export' }).click();
  await page.getByLabel('Import template file').setInputFiles((await (await download).path())!);
  await expect(page.locator('.template-card', { hasText: 'Neocities deck' })).toHaveCount(2);
  for (const route of ['create', 'join/test-token', 'recover', 'room/test-room']) {
    await page.goto(url + '/tabletop/#/' + route);
    await expect(page.getByText('Online rooms are not connected yet.', { exact: false })).toBeVisible();
  }
  expect(serviceCalls).toEqual([]); expect(failed).toEqual([]); expect(errors).toEqual([]);
});

test('Neocities entry opens first-party multiplayer, preserves template choice and real invitations', async ({ page, browser }) => {
  await page.goto(url + '/connected/#/templates');
  await page.locator('.template-card', { has: page.getByRole('heading', { name: 'The classic deck', exact: true }) }).getByRole('link', { name: 'Start online table' }).click();
  await expect(page).toHaveURL(backend.url + '/#/create/standard-54');
  await expect(page.getByRole('radio', { name: /The classic deck/ })).toBeChecked();
  await page.getByLabel('Your nickname').fill('Neocities host');
  await page.getByRole('button', { name: 'Create table' }).click();
  const invite = await page.getByLabel('Player invitation').inputValue();
  expect(new URL(invite).origin).toBe(backend.url);
  await page.keyboard.press('Escape');
  const guestContext = await browser.newContext();
  try {
    const guest = await guestContext.newPage();
    // A copied invitation route on Neocities preserves its token at the gateway.
    await guest.goto(url + '/connected/' + new URL(invite).hash);
    await guest.getByRole('link', { name: 'Continue to online tables' }).click();
    await expect(guest).toHaveURL(invite);
    await guest.getByLabel('Your nickname').fill('Guest');
    await guest.getByRole('button', { name: 'Join table' }).click();
    await expect(guest.locator('.you-are')).toHaveText(/Seat 2/);
    await page.getByRole('button', { name: 'Draw', exact: true }).click();
    await expect(page.locator('.hand-tray .card')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.hand-tray .card')).toHaveCount(1);
  } finally { await guestContext.close(); }
});
