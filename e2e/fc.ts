import { expect, type Page } from '@playwright/test';

/** Helpers for driving the First Contact board purely through the visible UI. */
// While a command is in flight the previous view's buttons stay rendered but disabled; only enabled
// buttons are real choices, and every click waits for the save to settle before the next decision.
export const actions = (page: Page) => page.locator('.fc-actions button:enabled');
/** Direct (non-family) legal-action buttons only — family rows carry `action-<type>` too. */
const flatActions = (page: Page) => page.locator('.fc-actions button:enabled:not(.action-family)');
export async function waitSaved(page: Page) {
  const state = page.locator('.save-state');
  if (await state.count()) await expect(state).toHaveText(/Saved/, { timeout: 15_000 });
}

/**
 * Clicks the legal action whose engine label matches — direct rows first, then inside action
 * families: family rows advertise their variant labels (`data-labels`); an expanded quick-option
 * chip carries the resolved action's accessible name; the composer resolves via parameter picks.
 */
export async function click(page: Page, name: RegExp) {
  const direct = flatActions(page).filter({ hasText: name }).first();
  if (await direct.count()) { await direct.click(); await waitSaved(page); return; }
  const tried = new Set<string>();
  for (let round = 0; round < 16; round++) {
    const fams = page.locator('.fc-actions .action-family:enabled');
    let opened = false;
    for (let i = 0, n = await fams.count(); i < n; i++) {
      const fam = fams.nth(i);
      const labels = (await fam.getAttribute('data-labels') ?? '').split('||');
      if (tried.has(labels.join()) || !labels.some(l => name.test(l))) continue;
      tried.add(labels.join());
      await fam.click();
      opened = true;
      const quick = fam.locator('xpath=..').locator('.fc-inline-opts').getByRole('button', { name });
      if (await quick.count()) { await quick.first().click(); await waitSaved(page); return; }
      if (await page.locator('.fc-composer').count() && await composerPick(page, name)) return;
      const back = page.locator('.fc-back');
      if (await back.count()) await back.click(); // no match inside — leave the composer and keep looking
      break;
    }
    if (!opened) break;
  }
  const fallback = flatActions(page).filter({ hasText: name }).first();
  await expect(fallback).toBeVisible();
  await fallback.click();
  await waitSaved(page);
}

/** Depth-first walk of an open Action Composer until the live preview matches the engine label. */
async function composerPick(page: Page, name: RegExp): Promise<boolean> {
  const preview = page.locator('.fc-preview');
  const confirm = page.locator('.fc-confirm');
  const done = async () => (await confirm.count()) > 0 && (await confirm.isEnabled()) && name.test(await preview.innerText());
  const step = async (i: number): Promise<boolean> => {
    if (await done()) { await confirm.click(); await waitSaved(page); return true; }
    const sections = page.locator('.fc-param');
    if (i >= (await sections.count())) return false;
    const opts = () => sections.nth(i).locator('.fc-opt:enabled');
    for (let j = 0, n = await opts().count(); j < n; j++) {
      await opts().nth(j).click();
      if (await step(i + 1)) return true;
      // Clear this section's picks before trying the next branch (scalar picks self-replace;
      // multi picks accumulate and must be toggled off explicitly).
      for (let k = 0; k < 8; k++) {
        const on = sections.nth(i).locator('.fc-opt[aria-pressed="true"]');
        if (!(await on.count())) break;
        await on.first().click();
      }
      if (await done()) { await confirm.click(); await waitSaved(page); return true; }
    }
    return false;
  };
  return step(0);
}

export async function hasAction(page: Page, name: RegExp) { await waitSaved(page); return (await actions(page).filter({ hasText: name }).count()) > 0; }

/** Collapse the room chat dock when it auto-opened, so board clicks are not covered; no-op on narrow viewports where it stays a closed modal. */
export async function collapseChat(page: Page) {
  const c = page.getByRole('button', { name: 'Collapse room chat' });
  if (await c.count()) await c.click();
}

/** Greedy in-composer progress: pick the first unpicked option, or confirm once resolved. */
async function resolveComposer(page: Page): Promise<boolean> {
  const confirm = page.locator('.fc-confirm:enabled');
  if (await confirm.count()) { await confirm.first().click(); await waitSaved(page); return true; }
  const opt = page.locator('.fc-composer .fc-opt:enabled:not([aria-pressed="true"])');
  if (await opt.count()) { await opt.first().click(); return true; }
  return false;
}

/** Whoever must respond declines, until nobody is being asked to respond. */
export async function settle(pages: Page[]) {
  for (let i = 0; i < 20; i++) {
    let acted = false;
    for (const p of pages) {
      await p.waitForTimeout(150);
      const chooseChip = p.locator('.fc-fam:has(.action-family.action-choose) .fc-inline-opts .fc-opt:enabled');
      const chooseRow = p.locator('.fc-fam > .action-family.action-choose:enabled');
      const chooseComposer = p.locator('.fc-composer[data-family^="choose:"]');
      if (await hasAction(p, /^Decline/)) { await click(p, /^Decline/); acted = true; }
      else if (await p.locator('.fc-actions button.action-choose:enabled:not(.action-family)').count()) { await p.locator('.fc-actions button.action-choose:enabled:not(.action-family)').first().click(); await waitSaved(p); acted = true; }
      else if (await chooseChip.count()) { await chooseChip.first().click(); await waitSaved(p); acted = true; }
      else if (await chooseComposer.count()) { acted = await resolveComposer(p) || acted; }
      else if (await chooseRow.count()) { await chooseRow.first().click(); acted = true; }
    }
    if (!acted) return;
  }
}

/** Picks a sensible legal action for a UI-driven complete game (never constructs an action itself). */
export async function playOnce(page: Page): Promise<boolean> {
  const order = [/^Decline/, /^Score .* for/, /^Draw/, /^End turn/, /Forced Exhausted Pass/];
  const choose = page.locator('.fc-actions button.action-choose:enabled:not(.action-family)');
  if (await choose.count()) { await choose.first().click(); return true; }
  for (const r of order) if (await hasAction(page, r)) { await click(page, r); return true; }
  const inline = page.locator('.fc-inline-opts .fc-opt:enabled');
  if (await inline.count()) { await inline.first().click(); await waitSaved(page); return true; }
  if (await page.locator('.fc-composer').count()) {
    if (await resolveComposer(page)) return true;
    const back = page.locator('.fc-back');
    if (await back.count()) { await back.click(); return true; }
    return false;
  }
  const fam = page.locator('.fc-actions .action-family:enabled').first();
  if (await fam.count()) { await fam.click(); return true; }
  const any = actions(page).first();
  if (await any.count()) { await any.click(); return true; }
  return false;
}
