import { expect, test } from '@playwright/test';

/** The confirmation window: without a title, the first line of the message sits level with the icon. */
test('the icon of a confirmation is level with the first line of its message', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lc.language', 'en'));
  await page.goto('/');
  await page.getByRole('button', { name: /^User menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  const dialog = page.getByRole('dialog');
  const message = dialog.getByText('Sign out of the application?');
  await expect(message).toBeVisible();
  // Measured again until the opening animation (a zoom) has ended.
  const icon = dialog.getByRole('img', { name: 'question-circle' });
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([icon.boundingBox(), message.boundingBox()]);
      return a && b ? Math.abs(a.y - b.y) : Infinity;
    })
    .toBeLessThan(2);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
