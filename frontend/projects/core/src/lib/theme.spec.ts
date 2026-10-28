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

  it('uses fallback values for the optional tokens', () => {
    const vars = themeToCssVars({ ...theme, tokens: { colors: theme.tokens.colors } });
    expect(vars['--lc-font-size']).toBe('15px');
    expect(vars['--lc-gap']).toBe('12px');
    expect(vars['--lc-color-muted']).toBe('#eee');
  });

  it('derives the shell from the base colours if the theme does not declare the layout', () => {
    const vars = themeToCssVars({ ...theme, tokens: { colors: theme.tokens.colors } });
    expect(vars['--lc-sider-bg']).toBe('#222');
    expect(vars['--lc-sider-text']).toBe('#eee');
    expect(vars['--lc-sider-active-text']).toBe('#111');
    expect(vars['--lc-sider-width']).toBe('256px');
    expect(vars['--lc-header-height']).toBe('56px');
    expect(vars['--lc-content-padding']).toBe('24px');
  });

  it('applies the layout tokens declared by the theme', () => {
    const vars = themeToCssVars({
      ...theme,
      tokens: {
        ...theme.tokens,
        layout: { sider: { tone: 'dark', background: '#001529', text: '#fff', activeBackground: '#123456', width: 300, collapsedWidth: 64 }, header: { background: '#eee', height: 48 }, pageHeader: { background: '#fafafa' }, content: { padding: 16 } },
      },
    });
    expect(vars['--lc-sider-bg']).toBe('#001529');
    expect(vars['--lc-sider-active-bg']).toBe('#123456');
    expect(vars['--lc-sider-width']).toBe('300px');
    expect(vars['--lc-sider-collapsed-width']).toBe('64px');
    expect(vars['--lc-header-bg']).toBe('#eee');
    expect(vars['--lc-header-height']).toBe('48px');
    expect(vars['--lc-page-header-bg']).toBe('#fafafa');
    expect(vars['--lc-content-padding']).toBe('16px');
  });

  it('the secondary text of a top bar with a colour of its own follows the bar, not the muted text of the page', () => {
    const withHeader = (header: { background?: string; text?: string }) =>
      themeToCssVars({ ...theme, tokens: { ...theme.tokens, layout: { header } } })['--lc-header-muted'];
    expect(withHeader({})).toBe(themeToCssVars(theme)['--lc-color-muted']);
    expect(withHeader({ background: theme.tokens.colors.surface })).toBe(themeToCssVars(theme)['--lc-color-muted']);
    expect(withHeader({ background: '#000000', text: '#ffffff' })).toBe('color-mix(in srgb, #ffffff 80%, #000000)');
  });
});
