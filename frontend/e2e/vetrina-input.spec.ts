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
});
