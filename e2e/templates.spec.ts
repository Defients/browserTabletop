import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Backend, watchErrors } from './server.js';

let backend: Backend;
test.beforeAll(async () => { backend = new Backend(); await backend.start(); });
test.afterAll(async () => { await backend.stop(); });

test('author a template in the editor, export it, re-import it, play it online with two browsers, export without live state', async ({ browser }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const host = await hostCtx.newPage(), guest = await guestCtx.newPage();
  const errors = [watchErrors(host), watchErrors(guest)];
  try {
    // Author: new blank template, add a pile, a 54-card deck and a shuffle step through the editor forms.
    await host.goto(backend.url + '/#/templates/new');
    await host.getByLabel('Template name').fill('Picnic cards');
    await host.getByRole('tab', { name: 'Zones' }).click();
    await host.getByRole('button', { name: 'Add pile' }).click();
    await host.getByLabel('Name', { exact: true }).fill('Basket');
    await host.getByRole('tab', { name: 'Cards' }).click();
    await host.getByLabel('Place in').selectOption({ label: 'Basket' });
    await host.getByRole('button', { name: 'Add a standard 54-card deck' }).click();
    await host.locator('.face-cell input[type=file]').first().setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
    await host.locator('.face-cell input[type=file]').nth(1).setInputFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg onload="alert(1)"/>') });
    await expect(host.getByRole('alert').filter({ hasText: 'embedded PNG' })).toBeVisible();
    await host.getByRole('tab', { name: 'Setup' }).click();
    await host.getByRole('button', { name: 'Add step' }).click();
    await expect(host.locator('.setup-list li')).toContainText('Shuffle Basket');
    await expect(host.getByText('Template is valid.')).toBeVisible();
    await host.getByRole('button', { name: 'Save template' }).click();
    await expect(host.getByRole('heading', { name: 'Picnic cards' })).toBeVisible();

    // Export → import as a new copy.
    const dl = host.waitForEvent('download');
    await host.locator('.template-card', { hasText: 'Picnic cards' }).getByRole('button', { name: 'Export' }).click();
    const file = await (await dl).path();
    const exported = readFileSync(file!, 'utf8');
    expect(JSON.parse(exported).cards).toHaveLength(54);
    expect(JSON.parse(exported).cards[0].face).toMatch(/^data:image\/png;base64,/);
    await host.getByLabel('Import template file').setInputFiles(file!);
    await expect(host.locator('.template-card', { hasText: 'Picnic cards' })).toHaveCount(2);

    // Start an online room with the imported template.
    await host.locator('.template-card', { hasText: 'Picnic cards' }).last().getByText('Start online table').click();
    await expect(host.getByRole('radio', { name: /Picnic cards/ }).last()).toBeChecked();
    await host.getByLabel('Your nickname').fill('Ada');
    await host.getByRole('button', { name: 'Create table' }).click();
    const invite = await host.getByLabel('Player invitation').inputValue();
    await host.keyboard.press('Escape');
    await guest.goto(invite);
    await guest.getByLabel('Your nickname').fill('Bo');
    await guest.getByRole('button', { name: 'Join table' }).click();
    await expect(guest.locator('.you-are')).toHaveText(/Seat 2/);

    // Concurrent draws from both browsers never duplicate cards.
    for (const p of [host, guest]) { await p.getByLabel('Pile').selectOption({ label: 'Basket (54)' }); await p.getByLabel('Count').fill('5'); }
    await Promise.all([host.getByRole('button', { name: 'Draw', exact: true }).click(), guest.getByRole('button', { name: 'Draw', exact: true }).click()]);
    await expect(host.locator('.hand-tray .card')).toHaveCount(5);
    await expect(guest.locator('.hand-tray .card')).toHaveCount(5);
    await expect(host.getByRole('button', { name: /Basket, 44 cards/ })).toBeVisible();

    // Play: drag a card from the hand onto the table; the guest sees it face-up at the dropped place.
    const handCard = host.locator('.hand-tray .card').first();
    const label = await handCard.getAttribute('aria-label');
    const box = (await host.locator('.viewport').boundingBox())!;
    await handCard.hover();
    await host.mouse.down();
    await host.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await host.mouse.up();
    await expect(guest.locator('.placed .card').first()).toHaveAttribute('aria-label', label!);
    await expect(host.locator('.hand-tray .card')).toHaveCount(4);

    // Keyboard alternative: select with Enter, flip with F; typing in a field must not trigger hotkeys.
    await guest.locator('.placed .card').first().focus();
    await guest.keyboard.press('Enter');
    await guest.keyboard.press('f');
    await expect(host.locator('.placed .card').first()).toHaveAttribute('aria-label', 'Face-down card');
    await guest.getByLabel('Count').focus();
    await guest.keyboard.press('f');
    await expect(host.locator('.placed .card').first()).toHaveAttribute('aria-label', 'Face-down card');

    // Export from the live room: template only, never live state or credentials.
    await host.getByRole('button', { name: 'Table menu' }).click();
    const dl2 = host.waitForEvent('download');
    await host.getByRole('button', { name: /Export this table/ }).click();
    const live = readFileSync((await (await dl2).path())!, 'utf8');
    for (const k of ['"handle"', '"seenBy"', '"order"', '"revision"', invite.split('/').pop()!, 'Ada']) expect(live.includes(k), k).toBeFalsy();
    for (const e of errors) expect(e).toEqual([]);
  } finally { await hostCtx.close(); await guestCtx.close(); }
});

test('malformed and oversized imports fail with useful messages and change nothing', async ({ page }) => {
  await page.goto(backend.url + '/#/templates');
  const before = await page.locator('.template-card').count();
  await page.getByLabel('Import template file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":1,"setup":[{"op":"eval"}]}') });
  await expect(page.getByRole('alert')).toContainText('Template:');
  await page.getByLabel('Import template file').setInputFiles({ name: 'huge.json', mimeType: 'application/json', buffer: Buffer.alloc(5_100_000, 32) });
  await expect(page.getByRole('alert')).toContainText('5 MB');
  await expect(page.locator('.template-card')).toHaveCount(before);
});
