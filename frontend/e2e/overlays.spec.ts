import { expect, test, type Page } from '@playwright/test';

/** The «Move» menu of the first card of the board in lanes, further down the page, opened on the scrolled page. */
async function openMoveMenu(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: 'Move “Quote for Smith Ltd” to…' }).last();
  await trigger.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await trigger.click();
  const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toBeInViewport();
  const button = (await trigger.boundingBox())!;
  const list = (await menu.boundingBox())!;
  // Just below the button (or above it, if there is no room below), never a scroll away.
  const gap = Math.min(Math.abs(list.y - (button.y + button.height)), Math.abs(list.y + list.height - button.y));
  expect(gap).toBeLessThan(16);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lc.language', 'en');
    localStorage.setItem('lc.theme', 'light');
  });
  await page.goto('/showcase/showcase-tasks');
});

test('a menu opens under its button on a scrolled page', async ({ page }) => {
  await openMoveMenu(page);
});

test('a menu opens under its button on a scrolled page after switching to a dark theme', async ({ page }) => {
  // The user menu is an overlay too: the CDK overlay styles are in the page before the NG-ZORRO dark stylesheet, which
  // carries an old copy of them.
  await page.getByRole('button', { name: /^User menu/ }).click();
  await page.getByRole('menuitem', { name: 'Settings…' }).click();
  const dialog = page.getByRole('dialog');
  // The label names the search input inside the drop-down, which NG-ZORRO keeps hidden: the drop-down is clicked.
  await dialog.locator('nz-select', { has: page.getByLabel('Theme') }).click();
  // NG-ZORRO options have no option role.
  await page.locator('.ant-select-dropdown').getByText('Dark', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#lc-nz-dark-theme')).toHaveCount(1);
  await openMoveMenu(page);
});
