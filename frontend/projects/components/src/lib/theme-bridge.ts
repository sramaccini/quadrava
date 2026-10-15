import { DOCUMENT } from '@angular/common';
import { effect, inject, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { generate } from '@ant-design/colors';
import { ThemeService } from 'core';
import type { ThemeDefinition } from 'schema';

/** Name of the NG-ZORRO dark stylesheet, published as a separate file (see the style configuration of the application). */
export const NZ_DARK_STYLESHEET = 'nz-dark.css';
const DARK_LINK_ID = 'lc-nz-dark-theme';

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
 * The `base` colour made readable on `background`: it is darkened (or, on dark backgrounds, lightened) in small steps
 * until the contrast reaches 4.5:1 (normal text, WCAG AA).
 */
export function readable(base: string, background: string): string {
  const toward = luminance(background) > 0.4 ? '#000000' : '#ffffff';
  for (let t = 0; t <= 1; t += 0.05) {
    const candidate = mix(base, toward, t);
    if (contrast(candidate, background) >= 4.5) return candidate;
  }
  return toward;
}

/** NG-ZORRO CSS variables (`--ant-*`) derived from the theme colours: primary, success, error. Pure function. */
export function themeToNzVars(theme: ThemeDefinition): Record<string, string> {
  const { colors } = theme.tokens;
  const dark = theme.mode === 'dark';
  const options = dark ? { theme: 'dark' as const, backgroundColor: colors.background } : undefined;
  const vars: Record<string, string> = {};
  const family = (name: string, base: string): void => {
    const palette = generate(base, options);
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
  family('error', colors.danger ?? '#c62828');
  vars['--ant-info-color'] = colors.primary;
  return vars;
}

/** Id of the style sheet with the contrast fixes (once per document). */
const A11Y_STYLE_ID = 'lc-nz-contrast';

/**
 * Parts of NG-ZORRO with fixed colours or too light for the minimum contrast (WCAG AA): text of the coloured
 * tags, placeholders and arrows of selects, waiting steps, days outside the month in the calendar. They use the
 * theme colours (`--lc-*`), already chosen to be readable.
 */
export const NZ_CONTRAST_CSS = `
.ant-tag-success { color: var(--lc-tag-success-text) !important; }
.ant-tag-error { color: var(--lc-tag-error-text) !important; }
.ant-select-selection-placeholder, nz-select-placeholder, .ant-picker-input > input::placeholder, .ant-input::placeholder { color: var(--lc-color-muted) !important; }
.ant-select-arrow, .ant-select-clear { color: var(--lc-color-muted) !important; }
.ant-steps-item-wait .ant-steps-item-title, .ant-steps-item-wait .ant-steps-item-description, .ant-steps-item-wait .ant-steps-icon { color: var(--lc-color-muted) !important; }
.ant-picker-cell:not(.ant-picker-cell-in-view) { color: var(--lc-color-muted) !important; }
`;

/**
 * Connects the platform theme to NG-ZORRO: on every theme change it sets the `--ant-*` variables and,
 * for dark themes, loads the NG-ZORRO dark stylesheet (removed when switching to a light theme).
 */
export function provideNzThemeBridge(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const themes = inject(ThemeService);
    const doc = inject(DOCUMENT);
    if (!doc.getElementById(A11Y_STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = A11Y_STYLE_ID;
      style.textContent = NZ_CONTRAST_CSS;
      doc.head.appendChild(style);
    }
    effect(() => {
      const theme = themes.current();
      if (!theme) return;
      const root = doc.documentElement;
      for (const [name, value] of Object.entries(themeToNzVars(theme))) root.style.setProperty(name, value);
      const existing = doc.getElementById(DARK_LINK_ID);
      if (theme.mode === 'dark' && !existing) {
        const link = doc.createElement('link');
        link.id = DARK_LINK_ID;
        link.rel = 'stylesheet';
        link.href = NZ_DARK_STYLESHEET;
        doc.head.appendChild(link);
      } else if (theme.mode !== 'dark' && existing) {
        existing.remove();
      }
    });
  });
}
