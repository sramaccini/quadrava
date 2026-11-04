import { safeImageSrc } from 'components';
import type { ThemeBrand, ThemeBrandIcons } from 'schema';

/** Title and icons of the browser tab when the theme has no brand: those of `index.html`. */
export const QUADRAVA_TAB: { title: string; icons: Required<ThemeBrandIcons> } = {
  title: 'Quadrava',
  icons: { svg: 'brand/quadrava-icon-small.svg', png32: 'brand/quadrava-icon-32.png', appleTouch: 'brand/quadrava-icon-180.png' },
};

/** The `link` element of each kind of icon, as written in `index.html`. */
const LINKS: Record<keyof ThemeBrandIcons, { rel: string; type?: string; sizes?: string }> = {
  svg: { rel: 'icon', type: 'image/svg+xml' },
  png32: { rel: 'icon', type: 'image/png', sizes: '32x32' },
  appleTouch: { rel: 'apple-touch-icon' },
};

/**
 * Shows the brand of the theme in the browser tab: the name as title and its icons. Without a name or without icons, the
 * Quadrava ones. With icons, a kind the theme does not give (or with an address the image rules refuse) is left out, so
 * the tab never mixes the application's icons with Quadrava's.
 */
export function applyDocumentBrand(doc: Document, brand: ThemeBrand | null | undefined): void {
  doc.title = brand?.name ?? QUADRAVA_TAB.title;
  const icons: ThemeBrandIcons = brand?.icons ?? QUADRAVA_TAB.icons;
  for (const kind of Object.keys(LINKS) as (keyof ThemeBrandIcons)[]) {
    const raw = icons[kind];
    const href = raw ? safeImageSrc(raw) : null;
    let link = doc.head.querySelector<HTMLLinkElement>(`link[data-lc-icon="${kind}"]`);
    if (!href) {
      link?.remove();
      continue;
    }
    if (!link) {
      const { rel, type, sizes } = LINKS[kind];
      link = doc.createElement('link');
      link.rel = rel;
      if (type) link.type = type;
      if (sizes) link.setAttribute('sizes', sizes);
      link.dataset['lcIcon'] = kind;
      doc.head.appendChild(link);
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }
}
