import { DOCUMENT } from '@angular/common';
import { effect, inject, provideEnvironmentInitializer, type EnvironmentProviders } from '@angular/core';
import { generate } from '@ant-design/colors';
import { ThemeService } from 'core';
import type { ThemeDefinition } from 'schema';

/** Nome dello stylesheet scuro di NG-ZORRO, pubblicato come file a parte (vedi la configurazione degli stili dell'applicazione). */
export const NZ_DARK_STYLESHEET = 'nz-dark.css';
const DARK_LINK_ID = 'lc-nz-dark-theme';

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Miscela due colori esadecimali: `t` è la quota di `other` (0 = solo `hex`, 1 = solo `other`). */
function mix(hex: string, other: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(other.slice(1), 16);
  const channel = (shift: number): string => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Variabili CSS di NG-ZORRO (`--ant-*`) ricavate dai colori del tema: primario, successo, errore. Funzione pura. */
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
      // Sul chiaro la scala di Ant impasta i colori scuri (un verde scuro diventa grigio): meglio schiarirli verso il bianco.
      vars[`--ant-${name}-color-deprecated-bg`] = dark ? palette[0] : mix(base, '#ffffff', 0.9);
      vars[`--ant-${name}-color-deprecated-border`] = dark ? palette[2] : mix(base, '#ffffff', 0.6);
    }
  };
  family('primary', colors.primary);
  family('success', colors.success ?? '#2e7d32');
  family('error', colors.danger ?? '#c62828');
  vars['--ant-info-color'] = colors.primary;
  return vars;
}

/**
 * Collega il tema della piattaforma a NG-ZORRO: a ogni cambio di tema imposta le variabili `--ant-*` e,
 * per i temi scuri, carica lo stylesheet scuro di NG-ZORRO (rimosso passando a un tema chiaro).
 */
export function provideNzThemeBridge(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const themes = inject(ThemeService);
    const doc = inject(DOCUMENT);
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
