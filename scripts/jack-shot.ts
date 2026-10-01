import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** One-off visual check: attach the lesson Jack to 9♣ and screenshot the board. */
const base = process.argv[2] ?? 'http://127.0.0.1:3000';
mkdirSync('artifacts/shots', { recursive: true });
const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base + '/#/learn/generic-effect');
  await page.getByRole('button', { name: /Jack enemy PR card → 9♣/ }).click();
  await page.waitForTimeout(900);
  await page.locator('.fc-field.is-mine').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `artifacts/shots/jack-attach-${w}.png` });
  await page.close();
  console.log(`shot ${w}x${h}`);
}
await browser.close();
