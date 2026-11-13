import { expect, test } from '@playwright/test';

/** Forms in the demo, where the browser lays them out. */
test.describe('Showcase: forms', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lc.language', 'en'));
  });

  test('on a phone the buttons of a form wrap instead of widening the page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/showcase/showcase-form');
    const form = page.locator('[data-node-id="widths-form"]');
    const buttons = form.getByRole('button');
    await expect(buttons).toHaveCount(4);
    await buttons.last().scrollIntoViewIfNeeded();
    const tops = await buttons.evaluateAll((all) => all.map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBeGreaterThan(1);
    const right = await buttons.evaluateAll((all) => Math.max(...all.map((b) => b.getBoundingClientRect().right)));
    expect(right).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});
