import { expect, test } from '@playwright/test';

/** Standalone fields in the demo: the «Tipo» list filters the table and «Urgente» makes the notes area editable. */
test.describe('Showcase: standalone fields', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lc.language', 'it'));
    await page.goto('/showcase/showcase-input');
    await expect(page.getByRole('heading', { name: 'Campi a sé', exact: true })).toBeVisible();
  });

  test('choosing «Passiva» leaves only purchase invoices in the table', async ({ page }) => {
    const table = page.locator('lc-table');
    const types = table.locator('tbody tr td:nth-child(3)');
    await expect(types.first()).toBeVisible();
    await expect(types.filter({ hasText: 'Attiva' }).first()).toBeVisible();

    await page.getByLabel('Tipo', { exact: true }).click();
    await page.locator('nz-option-item', { hasText: 'Passiva' }).click();

    await expect(types.filter({ hasText: 'Attiva' })).toHaveCount(0);
    const count = await types.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(types.nth(i)).toHaveText('Passiva');
  });

  test('switching «Urgente» on makes the notes area editable', async ({ page }) => {
    const note = page.getByLabel(/Motivo dell.urgenza/);
    await expect(note).not.toBeEditable();

    await page.getByLabel('Urgente', { exact: true }).click();

    await expect(note).toBeEditable();
    await note.fill('Customer waiting');
    await expect(note).toHaveValue('Customer waiting');
  });

  // The editing commands (bold, lists) are run by the browser: jsdom does not have them, here they are really tried.
  test('rich text editor: typing, bold and list reach the preview', async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Descrizione (testo formattato)' });
    const preview = page.locator('[data-node-id="result-formatted"]');
    await expect(editor.locator('h4')).toHaveText('Consegna');
    await expect(preview.locator('ol li')).toHaveCount(2);

    await editor.locator('blockquote').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('New line');
    await page.keyboard.press('Shift+Home');
    await page.getByRole('button', { name: 'Grassetto (Ctrl+B)' }).click();
    await page.getByRole('button', { name: 'Elenco puntato' }).click();
    await expect(page.getByRole('button', { name: 'Elenco puntato' })).toHaveAttribute('aria-pressed', 'true');

    // The value goes to the state when leaving the editor.
    await editor.blur();
    await expect(preview.locator('ul li strong')).toHaveText('New line');
    await expect(preview.locator('ol li strong')).toHaveText('magazzino');
  });

  test('rich text editor: a javascript: link is rejected', async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Descrizione (testo formattato)' });
    await editor.locator('h4').selectText();
    await page.getByRole('button', { name: 'Collegamento' }).click();
    const address = page.getByRole('textbox', { name: 'Indirizzo del collegamento' });
    await address.fill('javascript:alert(1)');
    await address.press('Enter');
    await expect(page.getByText('Solo indirizzi https://, mailto: o che cominciano con /')).toBeVisible();
    await address.fill('https://example.com/deliveries');
    await address.press('Enter');
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/deliveries');
  });
});
