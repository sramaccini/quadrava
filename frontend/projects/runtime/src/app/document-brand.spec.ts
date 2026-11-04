import { QUADRAVA_TAB, applyDocumentBrand } from './document-brand';

describe('applyDocumentBrand', () => {
  let doc: Document;
  const href = (kind: string) => doc.head.querySelector(`link[data-lc-icon="${kind}"]`)?.getAttribute('href') ?? null;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Quadrava');
    // As in index.html.
    for (const [kind, rel, address] of [
      ['svg', 'icon', 'brand/quadrava-icon-small.svg'],
      ['png32', 'icon', 'brand/quadrava-icon-32.png'],
      ['appleTouch', 'apple-touch-icon', 'brand/quadrava-icon-180.png'],
    ]) {
      const link = doc.createElement('link');
      link.rel = rel;
      link.href = address;
      link.dataset['lcIcon'] = kind;
      doc.head.appendChild(link);
    }
  });

  it('shows the name and the icons of the brand in the tab', () => {
    applyDocumentBrand(doc, { name: 'Acme Office', icons: { svg: 'images/icon.svg', png32: 'images/icon-32.png', appleTouch: 'images/icon-180.png' } });
    expect(doc.title).toBe('Acme Office');
    expect([href('svg'), href('png32'), href('appleTouch')]).toEqual(['images/icon.svg', 'images/icon-32.png', 'images/icon-180.png']);
  });

  it('leaves out the kinds of icon the brand does not give, and those with a refused address', () => {
    applyDocumentBrand(doc, { icons: { svg: 'data:image/svg+xml;base64,PHN2Zy8+', png32: 'javascript:alert(1)' } });
    expect(href('svg')).toBe('data:image/svg+xml;base64,PHN2Zy8+');
    expect(href('png32')).toBeNull();
    expect(href('appleTouch')).toBeNull();
  });

  it('keeps the Quadrava icons for a brand without icons, and its title for a brand without a name', () => {
    applyDocumentBrand(doc, { name: 'Acme Office' });
    expect(doc.title).toBe('Acme Office');
    expect(href('svg')).toBe(QUADRAVA_TAB.icons.svg);
    applyDocumentBrand(doc, { icons: { svg: 'images/icon.svg' } });
    expect(doc.title).toBe(QUADRAVA_TAB.title);
  });

  it('goes back to Quadrava, links included, when the theme has no brand', () => {
    applyDocumentBrand(doc, { name: 'Acme Office', icons: { svg: 'images/icon.svg' } });
    applyDocumentBrand(doc, null);
    expect(doc.title).toBe('Quadrava');
    expect([href('svg'), href('png32'), href('appleTouch')]).toEqual([QUADRAVA_TAB.icons.svg, QUADRAVA_TAB.icons.png32, QUADRAVA_TAB.icons.appleTouch]);
    const png = doc.head.querySelector('link[data-lc-icon="png32"]');
    expect([png?.getAttribute('rel'), png?.getAttribute('type'), png?.getAttribute('sizes')]).toEqual(['icon', 'image/png', '32x32']);
  });
});
