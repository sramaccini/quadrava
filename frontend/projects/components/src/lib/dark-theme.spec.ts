import { TestBed } from '@angular/core/testing';
import { ThemeService } from 'core';
import type { ThemeDefinition } from 'schema';
import { NZ_DARK_THEME_CSS } from './nz-dark-theme.generated';
import { provideLcComponents } from './provide';
import { contrast, themeToNzVars } from './theme-bridge';

/** A dark theme whose colours differ from the fixed ones of the NG-ZORRO dark stylesheet. */
const dark: ThemeDefinition = {
  schemaVersion: '1.0',
  theme: 'night',
  mode: 'dark',
  tokens: {
    colors: { primary: '#6aa6ff', onPrimary: '#ffffff', background: '#0f1720', surface: '#17212b', onSurface: '#e6e6e6', border: '#2b3742', danger: '#c62828', success: '#2e7d32', warning: '#ad6800' },
  },
};

describe('dark themes', () => {
  afterEach(() => {
    for (const id of ['lc-nz-dark-theme', 'lc-nz-dark-theme-colours', 'lc-nz-dark-surfaces']) document.getElementById(id)?.remove();
    document.documentElement.removeAttribute('style');
  });

  it('the fixed colours of the NG-ZORRO dark stylesheet become the variables of the theme', () => {
    // No blue, red, green or gold of the library is left in the declarations.
    expect(NZ_DARK_THEME_CSS).not.toMatch(/:\s*#(177ddc|a61d24|49aa19|d89614)/i);
    expect(NZ_DARK_THEME_CSS).toContain('.ant-btn-primary{color:var(--lc-on-primary);border-color:var(--ant-primary-color);background:var(--ant-primary-color)}');
    expect(NZ_DARK_THEME_CSS).toContain('.ant-form-item-explain-error{color:var(--lc-text-error)}');
  });

  it('text on the primary colour, and texts in the colours of the theme, keep 4.5:1', () => {
    const vars = themeToNzVars(dark);
    // White on this light blue would read badly: the text on it turns dark.
    expect(contrast(vars['--lc-on-primary'], '#6aa6ff')).toBeGreaterThanOrEqual(4.5);
    for (const name of ['primary', 'error', 'success', 'warning']) {
      for (const background of ['#0f1720', '#17212b']) expect(contrast(vars[`--lc-text-${name}`], background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('text on the fills of the tones (kanban badges) keeps 4.5:1, also on the light fills of a dark theme', () => {
    const vars = themeToNzVars({ ...dark, tokens: { colors: { ...dark.tokens.colors, mutedText: '#94a3b8', danger: '#f87171', success: '#4ade80' } } });
    expect(contrast(vars['--lc-on-muted'], '#94a3b8')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars['--lc-on-error'], '#f87171')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars['--lc-on-success'], '#4ade80')).toBeGreaterThanOrEqual(4.5);
  });

  it('a dark theme loads, after the dark stylesheet, its colours and its surfaces; a light one removes them', () => {
    TestBed.configureTestingModule({ providers: [provideLcComponents()] });
    const themes = TestBed.inject(ThemeService);
    themes.apply(dark);
    TestBed.tick();
    const ids = [...document.head.querySelectorAll('#lc-nz-dark-theme, #lc-nz-dark-theme-colours, #lc-nz-dark-surfaces')].map((e) => e.id);
    expect(ids).toEqual(['lc-nz-dark-theme', 'lc-nz-dark-theme-colours', 'lc-nz-dark-surfaces']);
    expect(document.getElementById('lc-nz-dark-surfaces')?.textContent).toContain('body { background-color: var(--lc-color-background); }');
    themes.apply({ ...dark, mode: 'light', tokens: { colors: { ...dark.tokens.colors, background: '#f4f6f9', surface: '#ffffff', onSurface: '#111111' } } });
    TestBed.tick();
    expect(document.getElementById('lc-nz-dark-theme-colours')).toBeNull();
  });
});
