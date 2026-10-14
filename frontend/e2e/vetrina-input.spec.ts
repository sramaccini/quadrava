import { expect, test } from '@playwright/test';

/** Campi a sé nella demo: l'elenco «Tipo» filtra la tabella e «Urgente» rende modificabile l'area delle note. */
test.describe('Vetrina: campi a sé', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lc.language', 'it'));
    await page.goto('/vetrina/vetrina-input');
    await expect(page.getByRole('heading', { name: 'Campi a sé', exact: true })).toBeVisible();
  });

  test('scegliere «Passiva» lascia in tabella solo le fatture passive', async ({ page }) => {
    const table = page.locator('lc-table');
    const tipi = table.locator('tbody tr td:nth-child(3)');
    await expect(tipi.first()).toBeVisible();
    await expect(tipi.filter({ hasText: 'Attiva' }).first()).toBeVisible();

    await page.getByLabel('Tipo', { exact: true }).click();
    await page.locator('nz-option-item', { hasText: 'Passiva' }).click();

    await expect(tipi.filter({ hasText: 'Attiva' })).toHaveCount(0);
    const count = await tipi.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(tipi.nth(i)).toHaveText('Passiva');
  });

  test('accendere «Urgente» rende modificabile l’area delle note', async ({ page }) => {
    const note = page.getByLabel(/Motivo dell.urgenza/);
    await expect(note).not.toBeEditable();

    await page.getByLabel('Urgente', { exact: true }).click();

    await expect(note).toBeEditable();
    await note.fill('Cliente in attesa');
    await expect(note).toHaveValue('Cliente in attesa');
  });

  // I comandi di modifica (grassetto, elenchi) li esegue il browser: jsdom non li ha, qui si provano davvero.
  test('editor di testo formattato: scrivere, grassetto ed elenco arrivano all’anteprima', async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Descrizione (testo formattato)' });
    const anteprima = page.locator('[data-node-id="risultato-formattato"]');
    await expect(editor.locator('h4')).toHaveText('Consegna');
    await expect(anteprima.locator('ol li')).toHaveCount(2);

    await editor.locator('blockquote').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Nuova riga');
    await page.keyboard.press('Shift+Home');
    await page.getByRole('button', { name: 'Grassetto (Ctrl+B)' }).click();
    await page.getByRole('button', { name: 'Elenco puntato' }).click();
    await expect(page.getByRole('button', { name: 'Elenco puntato' })).toHaveAttribute('aria-pressed', 'true');

    // Il valore va nello stato uscendo dall'editor.
    await editor.blur();
    await expect(anteprima.locator('ul li strong')).toHaveText('Nuova riga');
    await expect(anteprima.locator('ol li strong')).toHaveText('magazzino');
  });

  test('editor di testo formattato: un collegamento javascript: è rifiutato', async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Descrizione (testo formattato)' });
    await editor.locator('h4').selectText();
    await page.getByRole('button', { name: 'Collegamento' }).click();
    const indirizzo = page.getByRole('textbox', { name: 'Indirizzo del collegamento' });
    await indirizzo.fill('javascript:alert(1)');
    await indirizzo.press('Enter');
    await expect(page.getByText('Solo indirizzi https://, mailto: o che cominciano con /')).toBeVisible();
    await indirizzo.fill('https://example.com/consegne');
    await indirizzo.press('Enter');
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/consegne');
  });
});
