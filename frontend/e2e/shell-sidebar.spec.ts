import { expect, test } from '@playwright/test';

/** Side menu of the shell on a page taller than the window. */
test('the menu column runs the whole height of the page and the menu stays in view while scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => localStorage.setItem('lc.language', 'en'));
  await page.goto('/showcase/showcase-fields');
  await expect(page.getByRole('heading', { name: 'Fields and forms', level: 1 })).toBeVisible();
  const column = page.locator('lc-sidebar');
  const menu = column.getByRole('complementary');
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight).toBeGreaterThan(768);

  // The column (with the colour of the menu) is as tall as the page: a full-page capture shows no gap below the menu.
  const columnBox = await column.boundingBox();
  expect(Math.abs(columnBox!.y)).toBeLessThan(1);
  expect(Math.abs(columnBox!.height - pageHeight)).toBeLessThan(2);
  const colours = await column.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('aside')!).backgroundColor]);
  expect(colours[0]).toBe(colours[1]);

  // The round button sits on the right edge of the menu (half outside it), and the page does not get wider than the window.
  const toggle = page.getByRole('button', { name: 'Collapse the menu' });
  const toggleBox = await toggle.boundingBox();
  expect(Math.abs(toggleBox!.x + toggleBox!.width / 2 - (columnBox!.x + columnBox!.width))).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  // The menu itself is one window tall and follows the scrolling, with its button.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(async () => Math.abs((await menu.boundingBox())?.y ?? 99)).toBeLessThan(1);
  expect(Math.round((await menu.boundingBox())!.height)).toBe(768);
  expect(Math.abs((await toggle.boundingBox())!.y - toggleBox!.y)).toBeLessThan(1);
});
