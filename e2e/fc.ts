import { expect, type Page } from '@playwright/test';

/** Helpers for driving the First Contact board purely through the visible UI. */
// While a command is in flight the previous view's buttons stay rendered but disabled; only enabled
// buttons are real choices, and every click waits for the save to settle before the next decision.
export const actions = (page: Page) => page.locator('.fc-actions button:enabled');
export async function waitSaved(page: Page) {
  const state = page.locator('.save-state');
  if (await state.count()) await expect(state).toHaveText(/Saved/, { timeout: 15_000 });
}
export async function click(page: Page, name: RegExp) {
  const b = actions(page).filter({ hasText: name }).first();
  await expect(b).toBeVisible();
  await b.click();
  await waitSaved(page);
}
export async function hasAction(page: Page, name: RegExp) { await waitSaved(page); return (await actions(page).filter({ hasText: name }).count()) > 0; }

/** Collapse the room chat dock when it auto-opened, so board clicks are not covered; no-op on narrow viewports where it stays a closed modal. */
export async function collapseChat(page: Page) {
  const c = page.getByRole('button', { name: 'Collapse room chat' });
  if (await c.count()) await c.click();
}

/** Whoever must respond declines, until nobody is being asked to respond. */
export async function settle(pages: Page[]) {
  for (let i = 0; i < 20; i++) {
    let acted = false;
    for (const p of pages) {
      await p.waitForTimeout(150);
      if (await hasAction(p, /^Decline/)) { await click(p, /^Decline/); acted = true; }
      else if (await p.locator('.fc-actions button.action-choose:enabled').count()) { await p.locator('.fc-actions button.action-choose:enabled').first().click(); await waitSaved(p); acted = true; }
    }
    if (!acted) return;
  }
}

/** Picks a sensible legal action for a UI-driven complete game (never constructs an action itself). */
export async function playOnce(page: Page): Promise<boolean> {
  const order = [/^Decline/, /^Score .* for/, /^Draw/, /^End turn/, /Forced Exhausted Pass/];
  const choose = page.locator('.fc-actions button.action-choose:enabled');
  if (await choose.count()) { await choose.first().click(); return true; }
  for (const r of order) if (await hasAction(page, r)) { await click(page, r); return true; }
  const any = actions(page).first();
  if (await any.count()) { await any.click(); return true; }
  return false;
}
