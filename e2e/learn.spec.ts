import { test, expect, type Page } from '@playwright/test';
import { Backend, watchErrors } from './server.js';
import { click, playOnce, settle } from './fc.js';

let backend: Backend;
test.beforeAll(async () => { backend = new Backend(); await backend.start(); });
test.afterAll(async () => { await backend.stop(); });

const done = (page: Page) => expect(page.locator('.lesson-feedback')).toHaveClass(/is-complete/);
const card = (page: Page, label: string) => page.getByRole('region', { name: 'Your private hand' }).getByRole('button', { name: label, exact: true });

test('all lessons complete through real interactions, reject wrong moves, and persist progress', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(backend.url + '/#/learn');
  await expect(page.getByRole('heading', { name: 'Learn Intrilex' })).toBeVisible();

  // 1 · Orientation: wrong areas are rejected; the right sequence completes it.
  await page.goto(backend.url + '/#/learn/orientation');
  await page.locator('[data-zone="gy"] .zone-pick').click();
  await expect(page.locator('.lesson-feedback')).toContainText('Not quite');
  for (const z of ['hand', 'dp', 'pr', 'er', 'gy']) await page.locator(`.is-mine [data-zone="${z}"] .zone-pick, .fc-center [data-zone="${z}"] .zone-pick, .fc-hand[data-zone="${z}"] .zone-pick`).first().click();
  await card(page, '7♥').dblclick();
  await page.keyboard.press('Escape');
  await done(page);

  // 2 · Draw: an off-lesson legal move is refused; progress survives a reload mid-lesson.
  await page.goto(backend.url + '/#/learn/draw-action');
  await click(page, /^Score 4♣/);
  await expect(page.locator('.lesson-feedback')).toContainText('Draw');
  await click(page, /^Draw 1/);
  await settle([page]);
  await page.reload();
  await click(page, /^End turn/);
  await done(page);

  // 3 · Score then win only at End Phase.
  await page.goto(backend.url + '/#/learn/score-victory');
  await click(page, /^Score Q♣/);
  await settle([page]);
  await expect(page.locator('.lesson-feedback')).toContainText('End Phase');
  await click(page, /^End turn/);
  await done(page);

  // 4 · Jack on the only legal target (the immune 4♦ and A♥ are never offered).
  await page.goto(backend.url + '/#/learn/generic-effect');
  await expect(page.locator('.fc-actions button', { hasText: /Jack enemy PR card → (4♦|A♥)/ })).toHaveCount(0);
  await click(page, /Jack enemy PR card → 9♣/);
  await settle([page]);
  await done(page);

  // 5 · Guard vs Scuttle, with "Why can't I?" on the losing tie.
  await page.goto(backend.url + '/#/learn/guard-scuttle');
  await card(page, '7♦').click();
  await page.getByRole('button', { name: /Why can/ }).click();
  await expect(page.locator('.why-list')).toContainText('higher suit');
  await page.keyboard.press('Escape');
  await card(page, '7♦').click();
  await click(page, /^Scuttle 7♥ with 7♠/);
  await settle([page]);
  await done(page);

  // 6 · Counter the counter, LIFO, then end the turn.
  await page.goto(backend.url + '/#/learn/response-counter');
  await expect(page.getByText('Teaching foreknowledge')).toBeVisible();
  await click(page, /^Scuttle 7♣ with 9♦/);
  await click(page, /^A♣ · Counter/);
  await settle([page]);
  await click(page, /^End turn/);
  await done(page);

  // 7 · Board Lock.
  await page.goto(backend.url + '/#/learn/board-lock');
  await click(page, /Board Lock/);
  await settle([page]);
  await click(page, /^Score 6♠/);
  await settle([page]);
  await click(page, /^End turn/);
  await done(page);

  await page.goto(backend.url + '/#/learn');
  await expect(page.locator('.lesson-list li.is-done')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('a complete First Contact practice game against the local opponent, using only offered legal actions', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(backend.url + '/#/practice/first-contact');
  await expect(page.getByText('Local practice.')).toBeVisible();
  for (let i = 0; i < 600; i++) {
    if (await page.getByRole('heading', { name: 'Game over' }).count()) break;
    if (!(await playOnce(page))) await page.waitForTimeout(250);
  }
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeVisible();
  await expect(page.locator('.fc-status strong')).toHaveText(/win|drawn/);
  // The finished game is saved locally and survives reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeVisible();
  expect(errors).toEqual([]);
});
