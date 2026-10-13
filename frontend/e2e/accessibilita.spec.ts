import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibilità automatica (axe-core, regole WCAG 2.1 A e AA) sulle schermate della vetrina: nessuna violazione grave o
 * critica. Le regole automatiche trovano solo una parte dei problemi: restano necessarie le prove a mano (tastiera,
 * lettore di schermo).
 */
const SCREENS = [
  'vetrina-base',
  'vetrina-form',
  'vetrina-attivita',
  'vetrina-contenitori',
  'vetrina-input',
  'vetrina-campi',
  'vetrina-tabelle',
  'vetrina-tabelle-avanzate',
  'vetrina-datatable',
  'vetrina-layout',
  'vetrina-cruscotto',
  'vetrina-viste',
];

for (const screen of SCREENS) {
  test(`accessibilità: ${screen}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lc.language', 'it'));
    await page.goto(`/vetrina/${screen}`);
    await expect(page.locator('main lc-screen')).toBeVisible();
    // I dati simulati arrivano dopo un breve ritardo: si aspetta che nessun componente stia ancora caricando.
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 10_000 }).catch(() => undefined);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
    expect(report, report.join('\n')).toEqual([]);
  });
}
