import { test, expect } from '@playwright/test';
import { Backend, watchErrors } from './server.js';
import { collapseChat } from './fc.js';

/**
 * Viewport-fit regression: the HybriX gameboard must live entirely inside the
 * browser viewport at 100% zoom — no document-level scrolling, no gameplay
 * element below the fold. Driven against the local First Contact practice game
 * (same GameBoard component as online rooms) served by the real backend.
 */
let backend: Backend;
test.beforeAll(async () => { backend = new Backend(); await backend.start(); });
test.afterAll(async () => { await backend.stop(); });

const RESOLUTIONS = [
  [1024, 576], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1920, 1080], [2560, 1440],
] as const;

const FIT_SELECTORS = ['.fc-status', '.hx-left', '.hx-stack', '.fc-surface', '.fc-center', '.fc-hand', '.hx-right', '.hx-ophand', '.fc-panel'];

for (const [w, h] of RESOLUTIONS) {
  test(`gameboard fits viewport at ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const errors = watchErrors(page);
    await page.goto(backend.url + '/#/practice/first-contact');
    await expect(page.getByRole('region', { name: 'Your private hand' })).toBeVisible();
    await collapseChat(page);

    const doc = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight,
    }));
    expect(doc.sw, 'document must not scroll horizontally').toBeLessThanOrEqual(doc.cw + 2);
    expect(doc.sh, 'document must not scroll vertically').toBeLessThanOrEqual(doc.ch + 2);

    for (const sel of FIT_SELECTORS) {
      const box = await page.locator(sel).boundingBox();
      expect(box, `${sel} should be laid out`).not.toBeNull();
      expect(box!.y, sel).toBeGreaterThanOrEqual(-1);
      expect(box!.x, sel).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height, `${sel} bottom must stay inside the viewport`).toBeLessThanOrEqual(h + 1);
      expect(box!.x + box!.width, `${sel} right edge must stay inside the viewport`).toBeLessThanOrEqual(w + 1);
    }

    const rows = page.locator('.fc-row');
    expect(await rows.count(), 'all four battlefield rows').toBe(4);
    for (const row of await rows.all()) {
      const box = await row.boundingBox();
      expect(box, 'battlefield row').not.toBeNull();
      expect(box!.y + box!.height, 'battlefield row bottom').toBeLessThanOrEqual(h + 1);
      expect(box!.height, 'battlefield row must keep a usable height').toBeGreaterThan(20);
    }
    const scrim = await page.locator('.hx-scrimmage').boundingBox();
    expect(scrim).not.toBeNull();
    expect(scrim!.y + scrim!.height, 'Line of Scrimmage bottom').toBeLessThanOrEqual(h + 1);

    expect(errors).toEqual([]);
  });
}
