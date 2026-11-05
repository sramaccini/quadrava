import { expect, test } from '@playwright/test';

/** The confirmation window: without a title, the first line of the message sits level with the icon. */
test('the icon of a confirmation is level with the first line of its message', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lc.language', 'en'));
  await page.goto('/');
  await page.getByRole('button', { name: /^User menu/ }).click();
  await page.locator('.ant-dropdown').getByText('Sign out').click();
  const dialog = page.getByRole('dialog');
  const message = dialog.getByText('Sign out of the application?');
  await expect(message).toBeVisible();
  const icon = await dialog.getByRole('img', { name: 'question-circle' }).boundingBox();
  const text = await message.boundingBox();
  if (!icon || !text) throw new Error('icon or message not visible');
  expect(Math.abs(icon.y - text.y)).toBeLessThan(2);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
