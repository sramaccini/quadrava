import { I18n } from 'core';
import { SHELL_MESSAGES } from './shell-messages';

describe('texts of the runtime shell', () => {
  it('has the same keys in English and Italian, all of the shell (app.*)', () => {
    expect(Object.keys(SHELL_MESSAGES.it).sort()).toEqual(Object.keys(SHELL_MESSAGES.en).sort());
    expect(Object.keys(SHELL_MESSAGES.en).every((k) => k.startsWith('app.'))).toBe(true);
  });

  it('leaves the keys of the application itself to the project', () => {
    expect(Object.keys(SHELL_MESSAGES.en).filter((k) => k === 'app.title' || k.startsWith('app.theme.'))).toEqual([]);
  });

  it('are used when the project catalogue lacks them, and the project overrides them', () => {
    const i18n = new I18n();
    for (const [locale, messages] of Object.entries(SHELL_MESSAGES)) i18n.addMessages(locale, messages, 'builtin');
    i18n.addMessages('it', { 'app.profile': 'Profilo demo' });
    i18n.setLocale('it');
    expect(i18n.t('app.language')).toBe('Lingua');
    expect(i18n.t('app.permissions', { n: 2 })).toBe('2 permessi');
    expect(i18n.t('app.profile')).toBe('Profilo demo');
  });

  it('can be translated by the project into a language the runtime does not ship; the rest stays in English', () => {
    const i18n = new I18n();
    for (const [locale, messages] of Object.entries(SHELL_MESSAGES)) i18n.addMessages(locale, messages, 'builtin');
    i18n.addMessages('de', { 'app.language': 'Sprache', 'app.lang.de': 'Deutsch' });
    i18n.setLocale('de');
    expect(i18n.t('app.language')).toBe('Sprache');
    expect(i18n.t('app.lang.de')).toBe('Deutsch');
    expect(i18n.t('app.theme')).toBe('Theme');
  });
});
