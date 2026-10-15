import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Automatic accessibility checks (axe-core, WCAG 2.1 A and AA rules) on the showcase screens: no serious or critical
 * violation. Automatic rules find only part of the problems: manual checks (keyboard, screen reader) are still
 * needed.
 */
const SCREENS = [
  'showcase-basics',
  'showcase-form',
  'showcase-tasks',
  'showcase-containers',
  'showcase-input',
  'showcase-fields',
  'showcase-tables',
  'showcase-advanced-tables',
  'showcase-datatable',
  'showcase-layout',
  'showcase-dashboard',
  'showcase-views',
];

for (const screen of SCREENS) {
  test(`accessibility: ${screen}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lc.language', 'it'));
    await page.goto(`/showcase/${screen}`);
    await expect(page.locator('main lc-screen')).toBeVisible();
    // The simulated data arrive after a short delay: wait until no component is still loading.
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 10_000 }).catch(() => undefined);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
    expect(report, report.join('\n')).toEqual([]);
  });
}
