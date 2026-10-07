import { Injectable, signal } from '@angular/core';
import type { ThemeDefinition } from 'schema';

/**
 * Traduce un tema in variabili CSS (--lc-*). Funzione pura: i valori sono già vincolati dallo schema dei temi
 * (colori e font con caratteri ammessi), quindi non possono iniettare CSS arbitrario.
 */
export function themeToCssVars(theme: ThemeDefinition): Record<string, string> {
  const { colors, typography, shape, density } = theme.tokens;
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
    '--lc-font-family': typography?.fontFamily ?? 'system-ui, sans-serif',
    '--lc-font-size': `${typography?.baseSize ?? 15}px`,
    '--lc-radius': `${shape?.radius ?? 6}px`,
  };
  const compact = density === 'compact';
  vars['--lc-gap'] = compact ? '6px' : '12px';
  vars['--lc-control-height'] = compact ? '30px' : '38px';
  return vars;
}

/** Applica il tema corrente a un elemento (di norma il root del documento) e permette di cambiarlo a runtime. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly current = signal<ThemeDefinition | null>(null);

  apply(theme: ThemeDefinition, host: HTMLElement = document.documentElement): void {
    for (const [name, value] of Object.entries(themeToCssVars(theme))) host.style.setProperty(name, value);
    host.style.setProperty('color-scheme', theme.mode ?? 'light');
    this.current.set(theme);
  }
}
