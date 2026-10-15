import { I18n, loadMessages, loadCatalogs } from './i18n';

describe('I18n', () => {
  function make(): I18n {
    const i18n = new I18n();
    i18n.addMessages('it', { 'a.salva': 'Salva', 'lc.ok': 'OK it' });
    i18n.addMessages('en', { 'a.salva': 'Save', 'a.solo_en': 'Only English' });
    i18n.addMessages('it', { 'lc.ok': 'OK builtin it', 'lc.altro': 'Altro' }, 'builtin');
    return i18n;
  }

  it('looks in the active language, then in the default one, then in the fallback, then the key', () => {
    const i18n = make();
    i18n.setLocale('en');
    expect(i18n.lookup('a.salva')).toEqual({ text: 'Save', found: true });
    expect(i18n.lookup('lc.altro')).toEqual({ text: 'Altro', found: true });
    expect(i18n.lookup('x.new', 'Nuovo testo')).toEqual({ text: 'Nuovo testo', found: true });
    expect(i18n.lookup('x.new')).toEqual({ text: 'x.new', found: false });
  });

  it('i messaggi dell\'applicazione prevalgono su quelli integrati', () => {
    expect(make().t('lc.ok')).toBe('OK it');
  });

  it('formats with the parameters according to the language, and the language changes the texts', () => {
    const i18n = make();
    i18n.addMessages('it', { 'a.n': '{n, plural, one {# riga} other {# righe}}' });
    expect(i18n.t('a.n', { n: 3 })).toBe('3 righe');
    expect(i18n.intlLocale()).toBe('it-IT');
    i18n.setLocale('en');
    expect(i18n.intlLocale()).toBe('en-GB');
    expect(i18n.t('a.salva')).toBe('Save');
  });
});

describe('loadMessages', () => {
  const reply = (body: unknown, ok = true) => async () => ({ ok, status: ok ? 200 : 404, json: async () => body });

  it('loads the catalogue of every language', async () => {
    const i18n = new I18n();
    const problems = await loadMessages(i18n, ['it', 'en'], (l) => `/i18n/${l}.json`, async (url) => reply(url.includes('/it') ? { k: 'ciao' } : { k: 'hello' })());
    expect(problems).toEqual([]);
    expect(i18n.raw('k', 'en')).toBe('hello');
  });

  it('reports missing files and non-text values without throwing', async () => {
    const i18n = new I18n();
    const problems = await loadMessages(i18n, ['it', 'en'], (l) => `/i18n/${l}.json`, async (url) => (url.includes('/it') ? reply({ ok: 'x', bad: 5 })() : reply({}, false)()));
    expect(problems.join('|')).toContain('it: the key bad is not a text');
    expect(problems.join('|')).toContain('en: catalogue not loaded (HTTP 404)');
    expect(i18n.raw('ok', 'it')).toBe('x');
  });

  it('loadCatalogs: catalogues from any function; non-text entries and missing catalogues reported without blocking the others', async () => {
    const i18n = new I18n();
    const problems = await loadCatalogs(i18n, ['it', 'en', 'fr'], async (l) => {
      if (l === 'fr') throw new Error('HTTP 404');
      return l === 'it' ? { saluto: 'Ciao', n: 3 } : { saluto: 'Hello' };
    });
    expect(problems).toEqual(['it: the key n is not a text', 'fr: catalogue not loaded (HTTP 404)']);
    expect(i18n.raw('saluto', 'it')).toBe('Ciao');
    expect(i18n.raw('saluto', 'en')).toBe('Hello');
  });
});
