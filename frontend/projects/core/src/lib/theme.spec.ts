import type { ThemeDefinition } from 'schema';
import { themeToCssVars } from './theme';

const theme: ThemeDefinition = {
  schemaVersion: '1.0',
  theme: 'prova',
  mode: 'dark',
  tokens: {
    colors: { primary: '#111', onPrimary: '#fff', background: '#000', surface: '#222', onSurface: '#eee', border: '#333' },
    typography: { fontFamily: 'Roboto, sans-serif', baseSize: 14 },
    shape: { radius: 2 },
    density: 'compact',
  },
};

describe('themeToCssVars', () => {
  it('traduce i token in variabili CSS', () => {
    const vars = themeToCssVars(theme);
    expect(vars['--lc-color-primary']).toBe('#111');
    expect(vars['--lc-font-size']).toBe('14px');
    expect(vars['--lc-radius']).toBe('2px');
    expect(vars['--lc-gap']).toBe('6px');
    expect(vars['--lc-control-height']).toBe('30px');
  });

  it('usa valori di ripiego per i token facoltativi', () => {
    const vars = themeToCssVars({ ...theme, tokens: { colors: theme.tokens.colors } });
    expect(vars['--lc-font-size']).toBe('15px');
    expect(vars['--lc-gap']).toBe('12px');
    expect(vars['--lc-color-muted']).toBe('#eee');
  });
});
