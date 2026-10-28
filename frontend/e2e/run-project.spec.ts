import { expect, test } from '@playwright/test';

/**
 * «Run project» (ADR-16): Studio opens the runtime in another window, which receives the project as it is in Studio,
 * unsaved changes included. Studio on the editor port, the runtime on the port before it (its default address); the
 * demo runtime accepts the development origins of Studio.
 */
const editorPort = Number(process.env['E2E_EDITOR_PORT'] ?? 4301);
const editor = `http://localhost:${editorPort}`;
const runtime = `http://localhost:${editorPort - 1}`;
/** Start of the runtime with the project of Studio (a reload included). */
const STARTUP_MS = 20_000;

test.describe('Studio: run the project in the runtime', () => {
  test('the runtime opens in another window with the project of Studio, unsaved changes included', async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(editor);
    await page.evaluate(async () => {
      localStorage.clear();
      const root = await navigator.storage.getDirectory();
      await root.removeEntry('quadrava-projects', { recursive: true }).catch(() => undefined);
    });
    await page.reload();
    await page.getByRole('button', { name: 'New project…' }).click();
    await page.getByLabel('Name of the application').fill('E2E run');
    // click and then wait: check() verifies at once, before the radio group has drawn the choice.
    await page.getByRole('radio', { name: /In the browser/ }).click();
    await expect(page.getByRole('radio', { name: /In the browser/ })).toBeChecked();
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('button', { name: 'Screen…' }).click();
    await page.getByLabel('Title').fill('Orders');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('region', { name: 'orders — Screen' })).toBeVisible();

    // A change not saved: the runtime must show it.
    const title = page.locator('ed-inspector [data-prop="title"] textarea');
    await title.fill('Orders (not saved)');
    await expect(page.locator('header [data-unsaved]')).toBeVisible();

    const opened = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Run project' }).click();
    const popup = await opened;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(`${runtime}/?studio=${encodeURIComponent(editor)}`);
    // First the project must arrive (its menu, the one of a new project, is drawn): only then the tab remembers its Studio.
    // Moving away before would start the plain demo.
    await expect(popup.getByRole('navigation', { name: 'Menu New area' })).toBeVisible({ timeout: STARTUP_MS });
    // The screen of the project, by its route and without ?studio= (the routes drop it): the tab remembers its Studio
    // and asks again for the project.
    await popup.goto(`${runtime}/area/orders`);
    // The runtime starts, reads its configuration and asks Studio for the project before drawing: with the whole suite running
    // in parallel on the dev servers this takes longer than the default 5 seconds.
    await expect(popup.getByRole('heading', { name: 'Orders (not saved)', level: 1 })).toBeVisible({ timeout: STARTUP_MS });

    // «Run project» again after another change: the same window, reloaded with the new project.
    await title.fill('Orders (changed again)');
    await page.getByRole('button', { name: 'Run project' }).click();
    await expect(popup.getByRole('heading', { name: 'Orders (changed again)', level: 1 })).toBeVisible({ timeout: STARTUP_MS });
    expect(context.pages()).toHaveLength(2);
  });
});
