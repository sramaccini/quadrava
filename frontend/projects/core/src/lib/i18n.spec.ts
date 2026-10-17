import { I18n, loadMessages, loadCatalogs } from './i18n';

describe('I18n', () => {
  function make(): I18n {
    const i18n = new I18n();
    i18n.addMessages('en', { 'a.save': 'Save', 'lc.ok': 'OK en' });
    i18n.addMessages('it', { 'a.save': 'Salva', 'a.only_it': 'Solo italiano' });
    i18n.addMessages('en', { 'lc.ok': 'OK builtin en', 'lc.other': 'Other' }, 'builtin');
    return i18n;
  }

  it('starts in English, the default language', () => {
    const i18n = make();
    expect(i18n.locale()).toBe('en');
    expect(i18n.defaultLocale()).toBe('en');
    expect(i18n.t('a.save')).toBe('Save');
  });

  it('looks in the active language, then in the default one, then in the fallback, then the key', () => {
    const i18n = make();
    i18n.setLocale('it');
    expect(i18n.lookup('a.save')).toEqual({ text: 'Salva', found: true });
    expect(i18n.lookup('lc.other')).toEqual({ text: 'Other', found: true });
    expect(i18n.lookup('x.new', 'New text')).toEqual({ text: 'New text', found: true });
    expect(i18n.lookup('x.new')).toEqual({ text: 'x.new', found: false });
  });

  it('the messages of the application win over the built-in ones', () => {
    expect(make().t('lc.ok')).toBe('OK en');
  });

  it('formats with the parameters according to the language, and the language changes the texts', () => {
    const i18n = make();
    i18n.addMessages('en', { 'a.n': '{n, plural, one {# row} other {# rows}}' });
    expect(i18n.t('a.n', { n: 3 })).toBe('3 rows');
    expect(i18n.intlLocale()).toBe('en-GB');
    i18n.setLocale('it');
    expect(i18n.intlLocale()).toBe('it-IT');
    expect(i18n.t('a.save')).toBe('Salva');
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
      return l === 'it' ? { greeting: 'Ciao', n: 3 } : { greeting: 'Hello' };
    });
    expect(problems).toEqual(['it: the key n is not a text', 'fr: catalogue not loaded (HTTP 404)']);
    expect(i18n.raw('greeting', 'it')).toBe('Ciao');
    expect(i18n.raw('greeting', 'en')).toBe('Hello');
  });
});
