import { test, expect } from '@playwright/test';
import { Backend, watchErrors } from './server.js';
import { playOnce } from './fc.js';

let backend: Backend;
test.beforeAll(async () => { backend = new Backend(); await backend.start(); });
test.afterAll(async () => { await backend.stop(); });

/**
 * "What happened?" game log (local practice vs the bot): semantic styling is on by default, the
 * Stylized Text toggle produces a neutral feed without losing information, and the preference
 * survives a reload (localStorage).
 */
test('game log stylized toggle: default on, neutral off, persisted', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(backend.url + '/#/practice/first-contact');

  const log = page.locator('.fc-history');
  await expect(log).toBeVisible();
  await expect(log.locator('[role="log"]')).toBeAttached();
  await expect(log.locator('.glog-item').first()).toBeAttached();

  // Play until a turn boundary exists so grouping is exercised against real output.
  for (let i = 0; i < 15 && !(await log.locator('.glog-k-turn').count()); i++) {
    if (!(await playOnce(page))) await page.waitForTimeout(700);
  }
  await expect(log.locator('.glog-k-turn').first()).toBeAttached();

  const toggle = page.getByLabel('Stylized Text');
  await expect(toggle).toBeChecked();
  // Player identity reaches the log: "Player 1" renders as the seat's display name with seat styling.
  await expect(log.locator('.glog-p0').first()).toHaveText('You');

  // OFF: neutral presentation — no token spans, and the underlying event prose is preserved verbatim.
  await toggle.uncheck();
  await expect(log).toHaveClass(/is-plain/);
  await expect(log.locator('.glog-p')).toHaveCount(0);
  const plain = await log.locator('.glog-item').allTextContents();
  expect(plain.length).toBeGreaterThan(0);
  expect(plain.some(t => t.includes('First Contact'))).toBeTruthy();
  expect(plain.some(t => /Turn \d+: Player \d/.test(t))).toBeTruthy();

  // The preference persists across a reload.
  await page.reload();
  await expect(page.getByLabel('Stylized Text')).not.toBeChecked();
  await expect(page.locator('.fc-history')).toHaveClass(/is-plain/);

  // Back on: semantic spans return.
  await page.getByLabel('Stylized Text').check();
  await expect(page.locator('.fc-history')).not.toHaveClass(/is-plain/);
  await expect(page.locator('.fc-history .glog-p0').first()).toBeAttached();
  expect(errors).toEqual([]);
});
