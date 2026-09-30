import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { Backend } from '../e2e/server.js';
import { collapseChat } from '../e2e/fc.js';

/** Visual check of the Action-Family Possible Moves panel in a Full room → artifacts/shots/panel-*.png */
const out = 'artifacts/shots';
mkdirSync(out, { recursive: true });
const backend = new Backend();
await backend.start();
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const host = await ctx.newPage();
  const guest = await ctx2.newPage();
  await host.goto(backend.url + '/#/create');
  await host.getByRole('radio', { name: /Intrilex · Full/ }).check();
  await host.getByLabel('Your nickname').fill('Ada');
  await host.getByRole('button', { name: 'Create table' }).click();
  const invite = await host.getByLabel('Player invitation').inputValue();
  await host.keyboard.press('Escape');
  await guest.goto(invite);
  await guest.getByLabel('Your nickname').fill('Bo');
  await guest.getByRole('button', { name: 'Join table' }).click();
  await collapseChat(guest);
  await collapseChat(host);
  // Active player's start phase: Swap Bar family row should be visible.
  const actor = (await host.locator('.fc-actions .action-swap-down').count()) ? host : guest;
  for (let i = 0; i < 3 && await actor.locator('.chat-dock').count(); i++) await collapseChat(actor);
  await expect(actor.locator('.fc-actions .action-family.action-swap-down')).toBeVisible();
  await actor.screenshot({ path: `${out}/panel-list.png` });
  const swap = actor.locator('.fc-actions .action-family.action-swap-down');
  await swap.click();
  await expect(actor.locator('.fc-composer')).toBeVisible();
  await actor.screenshot({ path: `${out}/panel-composer.png` });
  // Pick the first slot option, then a give card — board pick routing via slot button also covered here.
  const slotOpt = actor.locator('.fc-param').nth(0).locator('.fc-opt').first();
  await slotOpt.click();
  const giveOpt = actor.locator('.fc-param').nth(1).locator('.fc-opt').first();
  await giveOpt.click();
  await actor.waitForTimeout(250);
  await actor.screenshot({ path: `${out}/panel-resolved.png` });
  console.log('preview:', await actor.locator('.fc-preview').innerText());
  await actor.locator('.fc-back').click();
  // Keyboard: reopen via Enter, leave via Escape.
  await actor.locator('.fc-actions .action-family.action-swap-down').focus();
  await actor.keyboard.press('Enter');
  await expect(actor.locator('.fc-composer')).toBeVisible();
  await actor.keyboard.press('Escape');
  await expect(actor.locator('.fc-composer')).toHaveCount(0);
  const narrow = await ctx.newPage();
  await narrow.setViewportSize({ width: 390, height: 844 });
  await narrow.goto(invite);
  await narrow.getByLabel('Your nickname').fill('Spec');
  await narrow.getByRole('button', { name: 'Join table' }).click();
  console.log('done');
} finally {
  await browser.close();
  await backend.stop();
}
