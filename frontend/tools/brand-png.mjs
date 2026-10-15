// Draws the brand PNGs from the SVGs in assets/brand/svg, with the Sora font embedded:
// - the icons at every size listed in assets/brand/README.md (the small SVG below 48 px);
// - the full logos (icon + name) at 4x, cropped to the drawing: they are needed where the SVG cannot load the font
//   (the README on GitHub, documents, presentations).
// Usage: node tools/brand-png.mjs [--only <name>]   Writes assets/brand/png/*.png (transparent background).
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
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const SCALE = 4;
const ICON_SIZES = [16, 24, 32, 48, 64, 76, 128, 180, 192, 256, 512, 1024];
const svg = (name) => readFileSync(join(brand, 'svg', `${name}.svg`), 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '');

const browser = await chromium.launch();
try {
  for (const product of ['quadrava', 'quadrava-studio']) {
    for (const size of ICON_SIZES) {
      const name = `${product}-icon-${size}`;
      if (only && !name.startsWith(only)) continue;
      const source = svg(size < 48 ? `${product}-icon-small` : `${product}-icon`).replace(/width="64" height="64"/, `width="${size}" height="${size}"`);
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(`<style>html, body { margin: 0; background: transparent; } svg { display: block; }</style>${source}`);
      await page.screenshot({ path: join(brand, 'png', `${name}.png`), omitBackground: true });
      await page.close();
      console.log(`${name}.png`);
    }
  }
  for (const name of ['quadrava-logo', 'quadrava-logo-dark', 'quadrava-studio-logo', 'quadrava-studio-logo-dark']) {
    if (only && !name.startsWith(only)) continue;
    const source = svg(name);
    const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(source);
    const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: SCALE });
    await page.setContent(`<style>${fontFaces} html, body { margin: 0; background: transparent; } svg { display: block; }</style>${source}`);
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
