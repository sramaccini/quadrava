import { expect, test, type Locator, type Page } from '@playwright/test';

/** Border layout of the demo: regions side by side on wide screens, stacked below 768px. */
test.describe('Showcase: layout containers', () => {
  async function open(page: Page, width: number): Promise<(name: string) => Locator> {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('lc.language', 'en'));
    await page.goto('/showcase/showcase-containers');
    const border = page.locator('lc-border').first();
    await expect(border.locator('[data-region="center"] tbody tr').first()).toBeVisible();
    return (name) => border.locator(`[data-region="${name}"]`);
  }

  async function box(region: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
    const b = await region.boundingBox();
    if (!b) throw new Error('region not visible');
    return b;
  }

  test('at 1400px: north and south across the whole width, west, center and east side by side', async ({ page }) => {
    const region = await open(page, 1400);
    const [north, west, center, east, south] = await Promise.all(['north', 'west', 'center', 'east', 'south'].map((r) => box(region(r))));

    // West, center and east on the same row, in order, below the north and above the south.
    expect(Math.abs(west.y - center.y)).toBeLessThan(2);
    expect(Math.abs(east.y - center.y)).toBeLessThan(2);
    expect(west.x + west.width).toBeLessThanOrEqual(center.x);
    expect(center.x + center.width).toBeLessThanOrEqual(east.x);
    expect(north.y + north.height).toBeLessThanOrEqual(center.y);
    expect(south.y).toBeGreaterThanOrEqual(center.y + center.height);

    // The side columns have the fixed width (220px), the center takes the rest.
    expect(Math.round(west.width)).toBe(220);
    expect(Math.round(east.width)).toBe(220);
    expect(center.width).toBeGreaterThan(west.width);

    // North and south take the whole width of the border.
    const left = west.x;
    const right = east.x + east.width;
    for (const full of [north, south]) {
      expect(Math.abs(full.x - left)).toBeLessThan(2);
      expect(Math.abs(full.x + full.width - right)).toBeLessThan(2);
    }
  });

  test('at 375px: the regions stack in the order north, west, center, east, south', async ({ page }) => {
    const region = await open(page, 375);
    const boxes = await Promise.all(['north', 'west', 'center', 'east', 'south'].map((r) => box(region(r))));

    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
      expect(Math.abs(boxes[i].x - boxes[0].x)).toBeLessThan(2);
      expect(Math.abs(boxes[i].width - boxes[0].width)).toBeLessThan(2);
    }
  });
});
