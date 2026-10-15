// Draws the full logos (icon + name) as PNG, with the Sora font embedded: they are needed where the SVG cannot load
// the font (the README on GitHub, documents, presentations). Usage: node tools/brand-png.mjs
// Writes assets/brand/png/<logo>.png (transparent background, 4x, cropped to the drawing).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const brand = join(here, '../../assets/brand');
const fonts = join(here, '../node_modules/@fontsource/sora/files');
const font = (weight) => readFileSync(join(fonts, `sora-latin-${weight}-normal.woff2`)).toString('base64');
const fontFaces = [300, 600]
  .map((w) => `@font-face { font-family: Sora; font-weight: ${w}; src: url(data:font/woff2;base64,${font(w)}) format('woff2'); }`)
  .join('\n');
const SCALE = 4;

const browser = await chromium.launch();
try {
  for (const name of ['kinetix-logo', 'kinetix-logo-dark', 'kinetix-studio-logo', 'kinetix-studio-logo-dark']) {
    const svg = readFileSync(join(brand, 'svg', `${name}.svg`), 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
    const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: SCALE });
    await page.setContent(`<style>${fontFaces} html, body { margin: 0; background: transparent; } svg { display: block; }</style>${svg}`);
    await page.evaluate(() => document.fonts.ready);
    if (!(await page.evaluate(() => document.fonts.check('600 44px Sora')))) throw new Error('Sora not loaded');
    // Crop to the drawing: the viewBox leaves empty space to the right of the name.
    const box = await page.evaluate(() => {
      const b = document.querySelector('svg').getBBox();
      return { x: 0, y: 0, width: Math.ceil(b.x + b.width) + 1, height: Number(document.querySelector('svg').getAttribute('height')) };
    });
    await page.screenshot({ path: join(brand, 'png', `${name}.png`), omitBackground: true, clip: box });
    await page.close();
    console.log(`${name}.png`);
  }
} finally {
  await browser.close();
}
