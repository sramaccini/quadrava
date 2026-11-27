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

  test('inline form: from the keyboard a field opens, Escape closes its list before the editor, Enter saves', async ({ page }) => {
    await page.goto('/showcase/showcase-form');
    const form = page.locator('[data-node-id="inline-form"]');
    const priority = form.getByRole('button', { name: /^Priority/ });
    await expect(priority).toHaveText('High');
    await priority.focus();
    await page.keyboard.press('Enter');
    // The search input of the select has no role of its own: it is found by its label.
    const select = form.getByLabel('Priority', { exact: true });
    await expect(select).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('nz-option-item').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('nz-option-item')).toHaveCount(0);
    await expect(select).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(priority).toBeFocused();

    const summary = form.getByRole('button', { name: /Summary/ });
    await summary.click();
    const input = form.getByRole('textbox');
    await expect(input).toBeFocused();
    await input.fill('Login fails with SSO');
    await page.keyboard.press('Enter');
    await expect(summary).toHaveText('Login fails with SSO');
    await expect(summary).toBeFocused();
  });
  test('copy link from a button and copy key from a menu item write to the clipboard', async ({ page, context, browserName }) => {
    // Only Chromium lets a test grant the clipboard permissions.
    test.skip(browserName !== 'chromium', 'clipboard permissions');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/showcase/showcase-form');
    const clipboard = (): Promise<string> => page.evaluate(() => navigator.clipboard.readText());
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByText('Link copied')).toBeVisible();
    expect(await clipboard()).toBe(new URL('/showcase/showcase-form', page.url()).href);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Copy key' }).click();
    await expect(page.getByText('Key copied')).toBeVisible();
    expect(await clipboard()).toBe('ODT-42');
  });
});
