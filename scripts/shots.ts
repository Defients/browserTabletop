import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Manual visual inspection helper: `node --import tsx scripts/shots.ts [baseUrl]` → artifacts/shots/*.png */
const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const out = 'artifacts/shots';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const shot = async (name: string) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${w}-${name}.png`, fullPage: process.argv.includes('--full') }); };
  await page.goto(base + '/#/'); await shot('home');
  await page.goto(base + '/#/create'); await page.getByLabel('Your nickname').fill('Ada'); await page.getByRole('button', { name: 'Create table' }).click();
  await page.waitForSelector('.room-head'); await shot('room-invite');
  await page.keyboard.press('Escape'); await shot('room-fc');
  await page.goto(base + '/#/learn/orientation'); await shot('lesson');
  await page.goto(base + '/#/practice/table/standard-54'); await shot('practice-table');
  await page.goto(base + '/#/templates/copy-counter-lab'); await shot('editor');
  console.log(w, errors.length ? errors : 'no console errors');
  await page.close();
}
await browser.close();
