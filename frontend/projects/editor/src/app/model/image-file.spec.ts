import { embeddedImageKb, imageFileToDataUrl } from './image-file';
import { definitionProperties, nodeProperties } from './schema-info';
import { THEME } from './theme-store';

describe('images loaded from the computer', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#1f5fbf"/></svg>';

  it('an image of an accepted kind becomes data:image/…;base64', async () => {
    const result = await imageFileToDataUrl(new File([svg], 'logo.svg', { type: 'image/svg+xml' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(atob(result.url.split(',')[1])).toBe(svg);
  });

  it('other kinds, and files too large for the property, are refused with the limit', async () => {
    expect(await imageFileToDataUrl(new File(['<p>x</p>'], 'page.html', { type: 'text/html' }))).toEqual({ ok: false, reason: 'unsupported' });
    const big = new File([new Uint8Array(80 * 1024)], 'photo.png', { type: 'image/png' });
    expect(await imageFileToDataUrl(big, 100_000)).toEqual({ ok: false, reason: 'tooBig', maxKb: 73 });
    expect((await imageFileToDataUrl(big, 200_000)).ok).toBe(true);
  });

  it('the size of an embedded image; an address is not one', () => {
    expect(embeddedImageKb(`data:image/png;base64,${'A'.repeat(4096)}`)).toBe(3);
    expect(embeddedImageKb('images/logo.svg')).toBeNull();
    expect(embeddedImageKb(undefined)).toBeNull();
  });

  it('the schemas mark the image properties: the brand of the theme and the image component', () => {
    const brand = THEME.rootProperties().find((p) => p.name === 'brand')!;
    const fields = THEME.objectFields(brand);
    expect(fields.filter((f) => f.image).map((f) => f.name)).toEqual(['logo', 'logoOnDark', 'icon']);
    expect(fields.find((f) => f.name === 'logo')?.maxLength).toBe(100000);
    expect(nodeProperties('image').find((p) => p.name === 'src')).toMatchObject({ kind: 'text', image: true });
    expect(definitionProperties('field').some((p) => p.image)).toBe(false);
  });
});
