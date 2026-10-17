import { expect, test } from '@playwright/test';

/** Standalone fields in the demo: the «Type» list filters the table and «Urgent» makes the notes area editable. */
test.describe('Showcase: standalone fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lc.language', 'en'));
    await page.goto('/showcase/showcase-input');
    await expect(page.getByRole('heading', { name: 'Standalone fields', exact: true })).toBeVisible();
  });

  test('choosing «Purchase» leaves only purchase invoices in the table', async ({ page }) => {
    const table = page.locator('lc-table');
    const types = table.locator('tbody tr td:nth-child(3)');
    await expect(types.first()).toBeVisible();
    await expect(types.filter({ hasText: 'Sales' }).first()).toBeVisible();

    await page.getByLabel('Type', { exact: true }).click();
    await page.locator('nz-option-item', { hasText: 'Purchase' }).click();

    await expect(types.filter({ hasText: 'Sales' })).toHaveCount(0);
    const count = await types.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(types.nth(i)).toHaveText('Purchase');
  });

  test('switching «Urgent» on makes the notes area editable', async ({ page }) => {
    const note = page.getByLabel(/Reason for urgency/);
    await expect(note).not.toBeEditable();

    await page.getByLabel('Urgent', { exact: true }).click();

    await expect(note).toBeEditable();
    await note.fill('Customer waiting');
    await expect(note).toHaveValue('Customer waiting');
  });

  // The editing commands (bold, lists) are run by the browser: jsdom does not have them, here they are really tried.
  test('rich text editor: typing, bold and list reach the preview', async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Description (rich text)' });
    const preview = page.locator('[data-node-id="result-formatted"]');
    await expect(editor.locator('h4')).toHaveText('Delivery');
    await expect(preview.locator('ol li')).toHaveCount(2);

    await editor.locator('blockquote').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('New line');
    await page.keyboard.press('Shift+Home');
    await page.getByRole('button', { name: 'Bold (Ctrl+B)' }).click();
    await page.getByRole('button', { name: 'Bulleted list' }).click();
    await expect(page.getByRole('button', { name: 'Bulleted list' })).toHaveAttribute('aria-pressed', 'true');

    // The value goes to the state when leaving the editor.
    await editor.blur();
    await expect(preview.locator('ul li strong')).toHaveText('New line');
    await expect(preview.locator('ol li strong')).toHaveText('warehouse');
  });

  test('rich text editor: a javascript: link is rejected', async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Description (rich text)' });
    await editor.locator('h4').selectText();
    await page.getByRole('button', { name: 'Link' }).click();
    const address = page.getByRole('textbox', { name: 'Link address' });
    await address.fill('javascript:alert(1)');
    await address.press('Enter');
    await expect(page.getByText('Only https://, mailto: or addresses starting with /')).toBeVisible();
    await address.fill('https://example.com/deliveries');
    await address.press('Enter');
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/deliveries');
  });
});
