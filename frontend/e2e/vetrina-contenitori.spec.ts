import { expect, test, type Locator, type Page } from '@playwright/test';

/** Border layout della demo: regioni affiancate su schermi larghi, impilate sotto i 768px. */
test.describe('Vetrina: contenitori di layout', () => {
  async function open(page: Page, width: number): Promise<(name: string) => Locator> {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('lc.language', 'it'));
    await page.goto('/vetrina/vetrina-contenitori');
    const border = page.locator('lc-border').first();
    await expect(border.locator('[data-region="center"] tbody tr').first()).toBeVisible();
    return (name) => border.locator(`[data-region="${name}"]`);
  }

  async function box(region: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
    const b = await region.boundingBox();
    if (!b) throw new Error('regione non visibile');
    return b;
  }

  test('a 1400px: nord e sud su tutta la larghezza, ovest, centro ed est affiancati', async ({ page }) => {
    const region = await open(page, 1400);
    const [north, west, center, east, south] = await Promise.all(['north', 'west', 'center', 'east', 'south'].map((r) => box(region(r))));

    // Ovest, centro ed est sulla stessa riga, nell'ordine, sotto il nord e sopra il sud.
    expect(Math.abs(west.y - center.y)).toBeLessThan(2);
    expect(Math.abs(east.y - center.y)).toBeLessThan(2);
    expect(west.x + west.width).toBeLessThanOrEqual(center.x);
    expect(center.x + center.width).toBeLessThanOrEqual(east.x);
    expect(north.y + north.height).toBeLessThanOrEqual(center.y);
    expect(south.y).toBeGreaterThanOrEqual(center.y + center.height);

    // Le colonne laterali hanno la larghezza fissata (220px), il centro prende il resto.
    expect(Math.round(west.width)).toBe(220);
    expect(Math.round(east.width)).toBe(220);
    expect(center.width).toBeGreaterThan(west.width);

    // Nord e sud occupano tutta la larghezza del border.
    const left = west.x;
    const right = east.x + east.width;
    for (const full of [north, south]) {
      expect(Math.abs(full.x - left)).toBeLessThan(2);
      expect(Math.abs(full.x + full.width - right)).toBeLessThan(2);
    }
  });

  test('a 375px: le regioni si impilano nell’ordine nord, ovest, centro, est, sud', async ({ page }) => {
    const region = await open(page, 375);
    const boxes = await Promise.all(['north', 'west', 'center', 'east', 'south'].map((r) => box(region(r))));

    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
      expect(Math.abs(boxes[i].x - boxes[0].x)).toBeLessThan(2);
      expect(Math.abs(boxes[i].width - boxes[0].width)).toBeLessThan(2);
    }
  });
});
