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
  'showcase-validation',
  'showcase-tables',
  'showcase-advanced-tables',
  'showcase-datatable',
  'showcase-layout',
  'showcase-dashboard',
  'showcase-views',
];

for (const screen of SCREENS) {
  test(`accessibility: ${screen}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lc.language', 'en'));
    await page.goto(`/showcase/${screen}`);
    await expect(page.locator('main lc-screen')).toBeVisible();
    // The simulated data arrive after a short delay: wait until no component is still loading. A busy indicator that
    // was shown keeps the content dimmed for its minimum time after aria-busy is gone, then fades it back: contrast is
    // measured only once that is over.
    await page
      .waitForFunction(() => !document.querySelector('[aria-busy="true"], lc-busy .busy.on'), undefined, { timeout: 10_000 })
      .catch(() => undefined);
    // Transitions only: an endless animation (a spinner, an active progress bar) never finishes.
    await page.evaluate(() =>
      Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => undefined))),
    );
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
    expect(report, report.join('\n')).toEqual([]);
  });
}
