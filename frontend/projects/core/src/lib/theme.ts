import { Injectable, signal } from '@angular/core';
import type { ThemeDefinition } from 'schema';

/**
 * Turns a theme into CSS variables (--lc-*). Pure function: the values are already constrained by the theme schema
 * (colours and fonts with allowed characters), so they cannot inject arbitrary CSS.
 */
export function themeToCssVars(theme: ThemeDefinition): Record<string, string> {
  const { colors, typography, shape, density, layout } = theme.tokens;
  const vars: Record<string, string> = {
    '--lc-color-primary': colors.primary,
    '--lc-color-on-primary': colors.onPrimary,
    '--lc-color-background': colors.background,
    '--lc-color-surface': colors.surface,
    '--lc-color-on-surface': colors.onSurface,
    '--lc-color-muted': colors.mutedText ?? colors.onSurface,
    '--lc-color-border': colors.border,
    '--lc-color-danger': colors.danger ?? '#c62828',
    '--lc-color-success': colors.success ?? '#2e7d32',
    '--lc-color-warning': colors.warning ?? '#ad6800',
    '--lc-font-family': typography?.fontFamily ?? 'system-ui, sans-serif',
    '--lc-font-size': `${typography?.baseSize ?? 15}px`,
    '--lc-radius': `${shape?.radius ?? 6}px`,
  };
  // Application shell: every value has a fallback derived from the base colours, so a minimal theme stays consistent.
  const sider = layout?.sider ?? {};
  const header = layout?.header ?? {};
  const page = layout?.pageHeader ?? {};
  const muted = colors.mutedText ?? colors.onSurface;
  vars['--lc-sider-bg'] = sider.background ?? colors.surface;
  vars['--lc-sider-text'] = sider.text ?? colors.onSurface;
  vars['--lc-sider-muted'] = sider.mutedText ?? muted;
  vars['--lc-sider-active-bg'] = sider.activeBackground ?? `color-mix(in srgb, ${colors.primary} 10%, ${sider.background ?? colors.surface})`;
  vars['--lc-sider-active-text'] = sider.activeText ?? colors.primary;
  vars['--lc-sider-border'] = sider.border ?? colors.border;
  vars['--lc-sider-width'] = `${sider.width ?? 256}px`;
  vars['--lc-sider-collapsed-width'] = `${sider.collapsedWidth ?? 80}px`;
  vars['--lc-header-bg'] = header.background ?? colors.surface;
  vars['--lc-header-text'] = header.text ?? colors.onSurface;
  // Secondary text of the top bar (title, labels): the muted text of the theme, unless the bar has a colour of its own,
  // where that text may not be readable; then the text of the bar, slightly faded towards its background.
  vars['--lc-header-muted'] =
    header.background && header.background !== colors.surface
      ? `color-mix(in srgb, ${header.text ?? colors.onSurface} 80%, ${header.background})`
      : muted;
  vars['--lc-header-border'] = header.border ?? colors.border;
  vars['--lc-header-height'] = `${header.height ?? 56}px`;
  vars['--lc-page-header-bg'] = page.background ?? colors.surface;
  vars['--lc-page-header-text'] = page.text ?? colors.onSurface;
  vars['--lc-page-header-muted'] = page.mutedText ?? muted;
  vars['--lc-page-header-border'] = page.border ?? colors.border;
  vars['--lc-content-padding'] = `${layout?.content?.padding ?? 24}px`;
  const compact = density === 'compact';
  vars['--lc-gap'] = compact ? '6px' : '12px';
  vars['--lc-control-height'] = compact ? '30px' : '38px';
  return vars;
}

/** Applies the current theme to an element (usually the document root) and allows changing it at run time. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly current = signal<ThemeDefinition | null>(null);

  apply(theme: ThemeDefinition, host: HTMLElement = document.documentElement): void {
    for (const [name, value] of Object.entries(themeToCssVars(theme))) host.style.setProperty(name, value);
    host.style.setProperty('color-scheme', theme.mode ?? 'light');
    this.current.set(theme);
  }
}
