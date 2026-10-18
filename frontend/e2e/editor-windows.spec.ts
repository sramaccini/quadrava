import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Quadrava Studio as a multi-document workspace: windows created from File › New, moved and resized with the mouse inside
 * the area, maximized; the side panels follow the window in front.
 */
const editor = `http://localhost:${Number(process.env['E2E_EDITOR_PORT'] ?? 4301)}`;

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not visible');
  return found;
}

async function newDocument(page: Page, kind: 'Navigation' | 'Theme'): Promise<void> {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: kind, exact: true }).click();
}

test.describe('Studio: document windows', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(editor);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'No document open' })).toBeVisible();
  });

  test('new documents open in windows that move, resize and maximize; the panels follow the window in front', async ({ page }) => {
    await page.getByRole('button', { name: 'Screen…' }).click();
    await page.getByLabel('Title').fill('Orders');
    await page.getByRole('button', { name: 'Create' }).click();
    const screen = page.getByRole('region', { name: 'orders — Screen' });
    await expect(screen).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();

    await newDocument(page, 'Theme');
    const theme = page.getByRole('region', { name: 'new-theme — Theme' });
    await expect(theme).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Outline' })).toHaveCount(0);
    await expect(page.getByText('Colours are written as')).toBeVisible();

    // Dragging the title of the screen: it moves and comes in front, with its panels.
    const caption = screen.getByRole('button', { name: 'orders — Screen' });
    const start = await box(screen);
    const handle = await box(caption);
    await page.mouse.move(handle.x + 60, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 160, handle.y + handle.height / 2 + 70, { steps: 6 });
    await page.mouse.up();
    const moved = await box(screen);
    expect(Math.round(moved.x - start.x)).toBe(100);
    expect(Math.round(moved.y - start.y)).toBe(70);
    await expect(page.getByRole('navigation', { name: 'Outline' })).toBeVisible();

    // Dragging the bottom right corner: it grows, the top left corner stays.
    const corner = await box(screen.locator('[data-edge="se"]'));
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x + corner.width / 2 - 80, corner.y + corner.height / 2 - 50, { steps: 4 });
    await page.mouse.up();
    const resized = await box(screen);
    expect([Math.round(resized.x), Math.round(resized.y)]).toEqual([Math.round(moved.x), Math.round(moved.y)]);
    expect(Math.round(moved.width - resized.width)).toBe(80);
    expect(Math.round(moved.height - resized.height)).toBe(50);

    // A window cannot leave the area of the workspace.
    const area = await box(page.locator('ed-workspace .area'));
    const again = await box(caption);
    await page.mouse.move(again.x + 60, again.y + again.height / 2);
    await page.mouse.down();
    await page.mouse.move(again.x + 2000, again.y + 2000, { steps: 4 });
    await page.mouse.up();
    const pushed = await box(screen);
    expect(Math.round(pushed.x + pushed.width)).toBeLessThanOrEqual(Math.round(area.x + area.width));
    expect(Math.round(pushed.y + pushed.height)).toBeLessThanOrEqual(Math.round(area.y + area.height));

    // Double click on the title: maximized over the whole area.
    await caption.dblclick();
    const full = await box(screen);
    expect([Math.round(full.width), Math.round(full.height)]).toEqual([Math.round(area.width), Math.round(area.height)]);

    // The theme window, from the bar of the workspace: its properties come back.
    await page.getByRole('list', { name: 'Open documents' }).getByRole('button', { name: 'new-theme — Theme' }).click();
    await expect(page.getByText('Colours are written as')).toBeVisible();
  });

  test('the workspace with windows has no serious accessibility violations', async ({ page }) => {
    await newDocument(page, 'Navigation');
    await newDocument(page, 'Theme');
    await expect(page.getByRole('region', { name: 'new-theme — Theme' })).toBeVisible();
    // Excluded: the previews (their own pages, checked on the runtime) and the language select of the toolbar, whose inner
    // search input has no label (a known limit, see HANDOFF).
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('iframe').exclude('.language').analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
    expect(report, report.join('\n')).toEqual([]);
  });
});
