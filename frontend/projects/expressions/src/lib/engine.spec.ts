import { BoundedCache, ExpressionEngine } from './engine';
import { formatMessage } from './message-format';
import { parseTemplate } from './template';
import type { EvalContext } from './types';

const granted = new Set(['ordini.ordine.leggi', 'ordini.ordine.approva']);
const errors: { source: string; error: string }[] = [];
const engine = new ExpressionEngine({ can: (p) => granted.has(p) }, { onError: (e) => errors.push(e) });

const ctx: EvalContext = {
  user: { username: 'manager' },
  row: { id: 7, stato: 'inviato', _perm: { update: true, delete: false } },
  form: { tipo: 'business' },
  value: 15,
  state: { filtri: { stato: 'bozza' } },
};

beforeEach(() => {
  errors.length = 0;
});

describe('ExpressionEngine.evaluate', () => {
  it('combina permessi e dati della riga', () => {
    expect(engine.evaluate("can('ordini.ordine.approva') && row.stato == 'inviato'", ctx)).toEqual({ ok: true, value: true });
  });

  it('nega un permesso mancante', () => {
    expect(engine.evaluate("can('ordini.iban.leggi')", ctx)).toEqual({ ok: true, value: false });
  });

  it('legge i permessi per riga', () => {
    expect(engine.evaluate('row._perm.update', ctx)).toEqual({ ok: true, value: true });
    expect(engine.evaluate('row._perm.delete', ctx)).toEqual({ ok: true, value: false });
  });

  it('confronta numeri JSON con letterali interi', () => {
    expect(engine.evaluate('value <= 20', ctx)).toEqual({ ok: true, value: true });
    expect(engine.evaluate('row.id == 7', ctx)).toEqual({ ok: true, value: true });
  });

  it('somma, sottrae, moltiplica e divide numeri JSON con letterali interi', () => {
    const c = { state: { n: 3, prezzo: 2.5 } };
    expect(engine.evaluate('state.n + 1', c)).toEqual({ ok: true, value: 4 });
    expect(engine.evaluate('1 + state.n', c)).toEqual({ ok: true, value: 4 });
    expect(engine.evaluate('state.n - 1', c)).toEqual({ ok: true, value: 2 });
    expect(engine.evaluate('state.prezzo * 2', c)).toEqual({ ok: true, value: 5 });
    expect(engine.evaluate('state.n / 2', c)).toEqual({ ok: true, value: 1.5 });
  });

  it('converte gli interi CEL in numeri', () => {
    expect(engine.evaluate('1 + 2', ctx)).toEqual({ ok: true, value: 3 });
  });

  it('usa in, ternario e has()', () => {
    expect(engine.evaluate("row.stato in ['inviato', 'approvato']", ctx)).toEqual({ ok: true, value: true });
    expect(engine.evaluate("form.tipo == 'privato' ? 'P' : 'B'", ctx)).toEqual({ ok: true, value: 'B' });
    expect(engine.evaluate("has(row.inesistente) && row.inesistente == 'x'", ctx)).toEqual({ ok: true, value: false });
  });

  it('segnala una chiave mancante senza lanciare', () => {
    const result = engine.evaluate("row.inesistente == 'x'", ctx);
    expect(result.ok).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('segnala una variabile non disponibile nel contesto', () => {
    expect(engine.evaluate('form.tipo == 1', { row: {} }).ok).toBe(false);
  });

  it('rifiuta funzioni diverse da can', () => {
    expect(engine.evaluate("evil('x')", ctx).ok).toBe(false);
  });

  it('rifiuta la sintassi con $ (non è un identificatore CEL)', () => {
    expect(engine.evaluate("$can('ordini.ordine.approva')", ctx).ok).toBe(false);
  });

  it('applica i limiti di profondità', () => {
    const deep = '('.repeat(60) + '1' + ')'.repeat(60);
    expect(engine.evaluate(deep, ctx).ok).toBe(false);
  });

  it('non espone proprietà ereditate degli oggetti', () => {
    const result = engine.evaluate('row.constructor', ctx);
    expect(result.ok).toBe(false);
  });
});

describe('ExpressionEngine.interpolate', () => {
  it('restituisce il valore tipizzato se il modello è una sola espressione', () => {
    expect(engine.interpolate('{{row.id}}', ctx)).toEqual({ ok: true, value: 7 });
    expect(engine.interpolate("{{can('ordini.ordine.leggi')}}", ctx)).toEqual({ ok: true, value: true });
  });

  it('compone testo e valori', () => {
    expect(engine.interpolate("Ordine {{row.id}} ({{row.stato}})", ctx)).toEqual({ ok: true, value: 'Ordine 7 (inviato)' });
  });

  it('lascia invariato il testo senza espressioni', () => {
    expect(engine.interpolate('Nessuna espressione', ctx)).toEqual({ ok: true, value: 'Nessuna espressione' });
  });

  it('non chiude l’espressione su }} dentro una stringa', () => {
    expect(engine.interpolate("{{'a}}b'}}", ctx)).toEqual({ ok: true, value: 'a}}b' });
  });

  it('segnala un’espressione non chiusa', () => {
    expect(engine.interpolate('{{row.id', ctx).ok).toBe(false);
  });
});

describe('ExpressionEngine.evaluateCondition', () => {
  it('usa whenMissing se la condizione non c’è', () => {
    expect(engine.evaluateCondition(undefined, ctx, { whenMissing: true })).toBe(true);
    expect(engine.evaluateCondition(undefined, ctx, { whenMissing: false })).toBe(false);
  });

  it('valuta una condizione', () => {
    expect(engine.evaluateCondition("{{can('ordini.ordine.approva')}}", ctx, { whenMissing: true })).toBe(true);
  });

  it('fallisce chiusa se la valutazione dà errore', () => {
    expect(engine.evaluateCondition("{{row.inesistente == 'x'}}", ctx, { whenMissing: true })).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('fallisce chiusa se il risultato non è un booleano', () => {
    expect(engine.evaluateCondition('{{row.stato}}', ctx, { whenMissing: true })).toBe(false);
    expect(errors[0]?.error).toContain('booleano');
  });
});

describe('ExpressionEngine.check', () => {
  it('accetta espressioni valide', () => {
    expect(engine.check("can('a.b') && row.stato == 'x'")).toEqual({ valid: true });
  });

  it('segnala errori di sintassi', () => {
    const result = engine.check("can('x' &&");
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('segnala funzioni sconosciute e argomenti di tipo errato', () => {
    expect(engine.check("evil('x')").valid).toBe(false);
    expect(engine.check('can(1)').valid).toBe(false);
  });

  it('controlla ogni espressione di un modello', () => {
    expect(engine.checkTemplate("Totale {{row.id}} - {{can('a.b')}}").valid).toBe(true);
    expect(engine.checkTemplate('{{can(1)}}').valid).toBe(false);
    expect(engine.checkTemplate('{{non chiusa').valid).toBe(false);
  });
});

describe('parseTemplate', () => {
  it('divide testo ed espressioni', () => {
    expect(parseTemplate('a {{x}} b')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'expr', source: 'x' },
      { kind: 'text', text: ' b' },
    ]);
  });
});

describe('funzioni di presentazione', () => {
  const none = { can: () => false };
  const withI18n = (locale: string, catalog: Record<string, string> = {}) =>
    new ExpressionEngine(none, {
      i18n: { locale: () => locale, translate: (key, fallback, params) => formatMessage(catalog[key] ?? fallback ?? key, params, locale) },
    });

  it('t() senza servizio usa il ripiego, altrimenti la chiave', () => {
    const engine = new ExpressionEngine(none);
    expect(engine.evaluate("t('a.b', 'Ciao {n}', {'n': 2})")).toEqual({ ok: true, value: 'Ciao 2' });
    expect(engine.evaluate("t('a.b')")).toEqual({ ok: true, value: 'a.b' });
  });

  it('t() usa il catalogo della lingua attiva', () => {
    const engine = withI18n('en-GB', { 'a.b': 'Hello {nome}' });
    expect(engine.interpolate("{{ t('a.b', 'Ciao {nome}', {'nome': state.n}) }}!", { state: { n: 'Ann' } })).toEqual({ ok: true, value: 'Hello Ann!' });
  });

  it('formatta importi, numeri e date secondo la lingua', () => {
    const it = withI18n('it-IT');
    const en = withI18n('en-GB');
    expect(it.evaluate("fmtNumber(1234.5)")).toEqual({ ok: true, value: '1234,5' });
    expect(en.evaluate("fmtNumber(1234.5)")).toEqual({ ok: true, value: '1,234.5' });
    expect(it.evaluate("fmtCurrency(1234.5, 'EUR')")).toMatchObject({ ok: true, value: expect.stringContaining('1234,50') });
    expect(en.evaluate("fmtDate('2026-10-09')")).toEqual({ ok: true, value: '09/10/2026' });
    expect(it.evaluate("fmtDate('2026-10-09')")).toEqual({ ok: true, value: '09/10/26' });
  });

  it('un valore non formattabile diventa testo vuoto', () => {
    const engine = withI18n('it-IT');
    expect(engine.evaluate('fmtCurrency(state.x, "EUR")', { state: { x: null } })).toEqual({ ok: true, value: '' });
    expect(engine.evaluate('fmtDate("non è una data")')).toEqual({ ok: true, value: '' });
  });

  it('plural() sceglie la forma e sostituisce {n}', () => {
    const engine = withI18n('it-IT');
    expect(engine.evaluate("plural(1, 'una riga', '{n} righe')")).toEqual({ ok: true, value: 'una riga' });
    expect(engine.evaluate("plural(state.n, 'una riga', '{n} righe')", { state: { n: 3 } })).toEqual({ ok: true, value: '3 righe' });
  });

  it('check() conosce le funzioni di presentazione', () => {
    expect(new ExpressionEngine(none).check("t('a', 'b')").valid).toBe(true);
    expect(new ExpressionEngine(none).check("t(1)").valid).toBe(false);
  });
});

describe('cache delle espressioni', () => {
  const engine = new ExpressionEngine({ can: (p) => p === 'a.b.c' });
  const value = (r: ReturnType<ExpressionEngine['evaluate']>): unknown => (r.ok ? r.value : r.error);

  it('la stessa espressione compilata vale con contesti diversi', () => {
    expect(value(engine.interpolate('{{ state.n * 2 }}', { state: { n: 2 } }))).toBe(4);
    expect(value(engine.interpolate('{{ state.n * 2 }}', { state: { n: 5 } }))).toBe(10);
    expect(value(engine.interpolate('Totale {{ state.n }}', { state: { n: 7 } }))).toBe('Totale 7');
    expect(value(engine.evaluate("can('a.b.c')"))).toBe(true);
  });

  it('un errore di sintassi resta un errore anche dalla cache', () => {
    const errors: string[] = [];
    const reporting = new ExpressionEngine({ can: () => false }, { onError: (e) => errors.push(e.source) });
    expect(reporting.evaluate('1 +').ok).toBe(false);
    expect(reporting.evaluate('1 +').ok).toBe(false);
    expect(errors).toEqual(['1 +', '1 +']);
  });

  it('la cache tiene al massimo il numero di voci indicato, togliendo la meno usata', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);
    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});
