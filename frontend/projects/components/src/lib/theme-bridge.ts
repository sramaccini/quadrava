import { DOCUMENT } from '@angular/common';
import { CSP_NONCE, effect, inject, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { generate } from '@ant-design/colors';
import { ThemeService } from 'core';
import type { ThemeDefinition } from 'schema';
import { NZ_DARK_THEME_CSS } from './nz-dark-theme.generated';

/** Name of the NG-ZORRO dark stylesheet, published as a separate file (see the style configuration of the application). */
export const NZ_DARK_STYLESHEET = 'nz-dark.css';
const DARK_LINK_ID = 'lc-nz-dark-theme';
const DARK_SURFACES_ID = 'lc-nz-dark-surfaces';
const DARK_THEME_ID = 'lc-nz-dark-theme-colours';

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Mixes two hex colours: `t` is the share of `other` (0 = only `hex`, 1 = only `other`). */
function mix(hex: string, other: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const channel = (shift: number): string => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Relative luminance (WCAG) of a hex colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number): number => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** Contrast ratio (WCAG) between two hex colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The `base` colour darkened (or, on dark backgrounds, lightened) in small steps until its contrast with each of the
 * `backgrounds` reaches `minimum`. The first background decides the direction.
 */
function standOut(base: string, backgrounds: readonly string[], minimum: number): string {
  const toward = luminance(backgrounds[0]) > 0.4 ? '#000000' : '#ffffff';
  for (let t = 0; t <= 1; t += 0.05) {
    const candidate = mix(base, toward, t);
    if (backgrounds.every((background) => contrast(candidate, background) >= minimum)) return candidate;
  }
  return toward;
}

/** The `base` colour made readable on `background`: contrast 4.5:1 (normal text, WCAG AA). */
export function readable(base: string, background: string): string {
  return standOut(base, [background], 4.5);
}

/** Text on a background of colour `base`: `preferred` if it reaches 4.5:1, otherwise black or white, whichever reads better. */
export function onColour(base: string, preferred?: string): string {
  if (preferred && contrast(preferred, base) >= 4.5) return preferred;
  return contrast('#000000', base) >= contrast('#ffffff', base) ? '#000000' : '#ffffff';
}

/**
 * Colour of the focus ring: the primary colour, changed if needed so that it stands out (3:1, WCAG «Non-text contrast») on
 * both the background of the page and the surfaces (cards, tables, dialogs).
 */
export function focusRing(primary: string, background: string, surface: string): string {
  return standOut(primary, [background, surface], 3);
}

/** NG-ZORRO CSS variables (`--ant-*`) derived from the theme colours: primary, success, warning, error. Pure function. */
export function themeToNzVars(theme: ThemeDefinition): Record<string, string> {
  const { colors } = theme.tokens;
  const dark = theme.mode === 'dark';
  const options = dark ? { theme: 'dark' as const, backgroundColor: colors.background } : undefined;
  const vars: Record<string, string> = {};
  const family = (name: string, base: string): void => {
    const palette = generate(base, options);
    // Text in this colour, readable on the background and on the surfaces, and text on a background of this colour.
    vars[`--lc-text-${name}`] = standOut(base, [colors.background, colors.surface], 4.5);
    vars[`--lc-on-${name}`] = onColour(base, name === 'primary' ? colors.onPrimary : undefined);
    vars[`--ant-${name}-color`] = base;
    vars[`--ant-${name}-color-hover`] = palette[4];
    vars[`--ant-${name}-color-active`] = palette[6];
    vars[`--ant-${name}-color-outline`] = rgba(base, 0.2);
    if (name === 'primary') palette.slice(0, 7).forEach((c, i) => (vars[`--ant-primary-${i + 1}`] = c));
    else {
      // On light themes the Ant scale muddies dark colours (a dark green becomes grey): better to lighten them towards white.
      const bg = dark ? palette[0] : mix(base, '#ffffff', 0.9);
      vars[`--ant-${name}-color-deprecated-bg`] = bg;
      vars[`--ant-${name}-color-deprecated-border`] = dark ? palette[2] : mix(base, '#ffffff', 0.6);
      // Text of the coloured tags (nz-tag) readable on their background.
      vars[`--lc-tag-${name}-text`] = readable(base, bg);
    }
  };
  family('primary', colors.primary);
  family('success', colors.success ?? '#2e7d32');
  family('warning', colors.warning ?? '#ad6800');
  family('error', colors.danger ?? '#c62828');
  vars['--ant-info-color'] = colors.primary;
  // Text on a fill of the muted colour (the neutral tone of kanban badges).
  vars['--lc-on-muted'] = onColour(colors.mutedText ?? colors.onSurface);
  vars['--lc-focus-ring'] = focusRing(colors.primary, colors.background, colors.surface);
  return vars;
}

/** Id of the style sheet with the contrast fixes (once per document). */
const A11Y_STYLE_ID = 'lc-nz-contrast';

/**
 * Parts of NG-ZORRO with fixed colours or too light for the minimum contrast (WCAG AA): text of the coloured
 * tags, placeholders and arrows of selects, waiting steps, days outside the month in the calendar. They use the
 * theme colours (`--lc-*`), already chosen to be readable.
 *
 * Also the focus ring: NG-ZORRO removes the outline and shows the focus with a pale shadow, hard to see. Whatever takes the
 * focus from the keyboard gets a ring in `--lc-focus-ring`; fields with a frame (selects, dates, numbers, fields with
 * icons) show it on the frame, and checkboxes and radios on the box they draw instead of their hidden input.
 */
export const NZ_CONTRAST_CSS = `
.ant-tag-success { color: var(--lc-tag-success-text) !important; }
.ant-tag-error { color: var(--lc-tag-error-text) !important; }
.ant-select-selection-placeholder, nz-select-placeholder, .ant-picker-input > input::placeholder, .ant-input::placeholder { color: var(--lc-color-muted) !important; }
.ant-select-arrow, .ant-select-clear { color: var(--lc-color-muted) !important; }
.ant-steps-item-wait .ant-steps-item-title, .ant-steps-item-wait .ant-steps-item-description, .ant-steps-item-wait .ant-steps-icon { color: var(--lc-color-muted) !important; }
.ant-picker-cell:not(.ant-picker-cell-in-view) { color: var(--lc-color-muted) !important; }
html:root :focus-visible, html:root .ant-checkbox-input:focus-visible + .ant-checkbox-inner,
html:root .ant-radio-input:focus-visible + .ant-radio-inner, html:root .ant-radio-button-wrapper:has(input:focus-visible) {
  outline: 2px solid var(--lc-focus-ring, var(--lc-color-primary, #1f5fbf)); outline-offset: 2px; }
html:root .ant-select-focused:not(.ant-select-disabled) .ant-select-selector, html:root .ant-input-affix-wrapper-focused,
html:root .ant-picker-focused, html:root .ant-input-number-focused {
  outline: 2px solid var(--lc-focus-ring, var(--lc-color-primary, #1f5fbf)); outline-offset: 1px; }
html:root .ant-select-selection-search-input:focus-visible, html:root .ant-input-affix-wrapper input:focus-visible,
html:root .ant-picker input:focus-visible, html:root .ant-input-number-input:focus-visible { outline: none; }
`;

/**
 * The dark stylesheet of NG-ZORRO paints cards, tables, dialogs, drawers and pop-ups with its own greys (#141414,
 * #1f1f1f, #1d1d1d) and borders (#303030), and the page with black: with a dark theme they ignore its background, surface and
 * border colours. Loaded after that stylesheet, only with dark themes; `:root` gives these rules the weight to win over the
 * library's. Its fixed blue, red, green and gold are replaced by `NZ_DARK_THEME_CSS` (generated, `npm run nz:dark`); the links
 * and icons of a selected menu item, white in a rule of their own, take the colour of the item.
 *
 * That stylesheet also carries an old copy of the CDK overlay rules: loaded after the CDK's own, its
 * `.cdk-overlay-connected-position-bounding-box { position: absolute }` won over `.cdk-overlay-popover { position: fixed }`.
 * Overlays shown as popovers (menus, drop-downs, filters) sit in the top layer, where an absolute box is placed on the
 * document and not on the viewport: on a scrolled page they opened higher by the scroll. The CDK rule is restored here.
 */
export const NZ_DARK_SURFACES_CSS = `
:root .cdk-overlay-popover { position: fixed; }
:root body { background-color: var(--lc-color-background); }
:root .ant-menu-dark .ant-menu-item-selected > a, :root .ant-menu-dark .ant-menu-item-selected > a:hover,
:root .ant-menu-dark .ant-menu-item-selected > span > a, :root .ant-menu-dark .ant-menu-item-selected > span > a:hover,
:root .ant-menu-dark .ant-menu-item-selected .anticon, :root .ant-menu-dark .ant-menu-item-selected .ant-menu-item-icon { color: inherit; }
:root .ant-card, :root .ant-card-actions, :root .ant-collapse-content, :root .ant-collapse-panel, :root .ant-table, :root .ant-table-summary,
:root .ant-table-cell-fix-left, :root .ant-table-cell-fix-right, :root .ant-table-sticky-holder, :root .ant-picker-calendar,
:root .ant-picker-calendar .ant-picker-panel, :root .ant-picker-panel-container, :root .ant-picker-panel, :root .ant-drawer-content,
:root .ant-dropdown-menu, :root .ant-select-dropdown, :root .ant-message-notice-content, :root .ant-notification-notice,
:root .ant-modal-content, :root .ant-modal-header, :root .ant-popover-inner, :root .ant-popover-arrow-content,
:root .ant-timeline-item-head, :root .ant-tree-show-line .ant-tree-switcher, :root .ant-modal .ant-table, :root .ant-drawer .ant-table,
:root .ant-tabs-card > .ant-tabs-nav .ant-tabs-tab-active { background-color: var(--lc-color-surface); }
:root .ant-table-thead > tr > th, :root tr.ant-table-expanded-row > td, :root .ant-modal .ant-table.ant-table-small thead > tr > th,
:root .ant-drawer .ant-table.ant-table-small thead > tr > th { background-color: color-mix(in srgb, var(--lc-color-on-surface) 6%, var(--lc-color-surface)); }
:root .ant-table-tbody > tr.ant-table-row:hover > td, :root .ant-table-thead th.ant-table-column-sort,
:root .ant-modal .ant-table tbody > tr.ant-table-row:hover > td, :root .ant-drawer .ant-table tbody > tr.ant-table-row:hover > td {
  background-color: color-mix(in srgb, var(--lc-color-on-surface) 10%, var(--lc-color-surface)); }
:root .ant-card-bordered, :root .ant-card-head, :root .ant-card-actions, :root .ant-table-thead > tr > th, :root .ant-table-tbody > tr > td,
:root .ant-table-summary > tr > td, :root .ant-modal-header, :root .ant-modal-footer, :root .ant-drawer-header, :root .ant-drawer-footer,
:root .ant-descriptions-bordered .ant-descriptions-view, :root .ant-descriptions-bordered .ant-descriptions-row,
:root .ant-descriptions-bordered .ant-descriptions-item-label, :root .ant-descriptions-bordered .ant-descriptions-item-content,
:root .ant-list-split .ant-list-item, :root .ant-list-split .ant-list-header, :root .ant-picker-panel, :root .ant-popover-title,
:root .ant-collapse, :root .ant-collapse > .ant-collapse-item, :root .ant-collapse-content { border-color: var(--lc-color-border); }
`;

/**
 * Connects the platform theme to NG-ZORRO: on every theme change it sets the `--ant-*` variables and,
 * for dark themes, loads the NG-ZORRO dark stylesheet (removed when switching to a light theme). Its style elements carry
 * the nonce of the page (`ngCspNonce` on the root element, `CSP_NONCE`), so a policy without 'unsafe-inline' allows them.
 */
export function provideNzThemeBridge(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const themes = inject(ThemeService);
    const doc = inject(DOCUMENT);
    const nonce = inject(CSP_NONCE, { optional: true });
    const addStyle = (id: string, css: string): void => {
      const style = doc.createElement('style');
      style.id = id;
      if (nonce) style.nonce = nonce;
      style.textContent = css;
      doc.head.appendChild(style);
    };
    if (!doc.getElementById(A11Y_STYLE_ID)) addStyle(A11Y_STYLE_ID, NZ_CONTRAST_CSS);
    effect(() => {
      const theme = themes.current();
      if (!theme) return;
      const root = doc.documentElement;
      for (const [name, value] of Object.entries(themeToNzVars(theme))) root.style.setProperty(name, value);
      const existing = doc.getElementById(DARK_LINK_ID);
      if (theme.mode === 'dark') {
        if (!existing) {
          const link = doc.createElement('link');
          link.id = DARK_LINK_ID;
          link.rel = 'stylesheet';
          link.href = NZ_DARK_STYLESHEET;
          doc.head.appendChild(link);
        }
        if (!doc.getElementById(DARK_THEME_ID)) addStyle(DARK_THEME_ID, NZ_DARK_THEME_CSS);
        if (!doc.getElementById(DARK_SURFACES_ID)) addStyle(DARK_SURFACES_ID, NZ_DARK_SURFACES_CSS);
      } else {
        existing?.remove();
        doc.getElementById(DARK_THEME_ID)?.remove();
        doc.getElementById(DARK_SURFACES_ID)?.remove();
      }
    });
  });
}
