import { BoundedCache, ExpressionEngine } from './engine';
import { formatMessage } from './message-format';
import { parseTemplate } from './template';
import type { EvalContext } from './types';

const granted = new Set(['orders.order.read', 'orders.order.approve']);
const errors: { source: string; error: string }[] = [];
const engine = new ExpressionEngine({ can: (p) => granted.has(p) }, { onError: (e) => errors.push(e) });

const ctx: EvalContext = {
  user: { username: 'manager' },
  row: { id: 7, status: 'submitted', _perm: { update: true, delete: false } },
  form: { tipo: 'business' },
  value: 15,
  state: { filters: { status: 'draft' } },
};

beforeEach(() => {
  errors.length = 0;
});

describe('ExpressionEngine.evaluate', () => {
  it('combines permissions and row data', () => {
    expect(engine.evaluate("can('orders.order.approve') && row.status == 'submitted'", ctx)).toEqual({ ok: true, value: true });
  });

  it('denies a missing permission', () => {
    expect(engine.evaluate("can('ordini.iban.leggi')", ctx)).toEqual({ ok: true, value: false });
  });

  it('reads per-row permissions', () => {
    expect(engine.evaluate('row._perm.update', ctx)).toEqual({ ok: true, value: true });
    expect(engine.evaluate('row._perm.delete', ctx)).toEqual({ ok: true, value: false });
  });

  it('compares JSON numbers with integer literals', () => {
    expect(engine.evaluate('value <= 20', ctx)).toEqual({ ok: true, value: true });
    expect(engine.evaluate('row.id == 7', ctx)).toEqual({ ok: true, value: true });
  });

  it('adds, subtracts, multiplies and divides JSON numbers with integer literals', () => {
    const c = { state: { n: 3, prezzo: 2.5 } };
    expect(engine.evaluate('state.n + 1', c)).toEqual({ ok: true, value: 4 });
    expect(engine.evaluate('1 + state.n', c)).toEqual({ ok: true, value: 4 });
    expect(engine.evaluate('state.n - 1', c)).toEqual({ ok: true, value: 2 });
    expect(engine.evaluate('state.prezzo * 2', c)).toEqual({ ok: true, value: 5 });
    expect(engine.evaluate('state.n / 2', c)).toEqual({ ok: true, value: 1.5 });
  });

  it('converts CEL integers into numbers', () => {
    expect(engine.evaluate('1 + 2', ctx)).toEqual({ ok: true, value: 3 });
  });

  it('usa in, ternario e has()', () => {
    expect(engine.evaluate("row.status in ['submitted', 'approvato']", ctx)).toEqual({ ok: true, value: true });
    expect(engine.evaluate("form.tipo == 'privato' ? 'P' : 'B'", ctx)).toEqual({ ok: true, value: 'B' });
    expect(engine.evaluate("has(row.inesistente) && row.inesistente == 'x'", ctx)).toEqual({ ok: true, value: false });
  });

  it('reports a missing key without throwing', () => {
    const result = engine.evaluate("row.inesistente == 'x'", ctx);
    expect(result.ok).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('reports a variable not available in the context', () => {
    expect(engine.evaluate('form.tipo == 1', { row: {} }).ok).toBe(false);
  });

  it('rifiuta funzioni diverse da can', () => {
    expect(engine.evaluate("evil('x')", ctx).ok).toBe(false);
  });

  it('rejects the $ syntax (not a CEL identifier)', () => {
    expect(engine.evaluate("$can('orders.order.approve')", ctx).ok).toBe(false);
  });

  it('applies the depth limits', () => {
    const deep = '('.repeat(60) + '1' + ')'.repeat(60);
    expect(engine.evaluate(deep, ctx).ok).toBe(false);
  });

  it('does not expose inherited object properties', () => {
    const result = engine.evaluate('row.constructor', ctx);
    expect(result.ok).toBe(false);
  });
});

describe('ExpressionEngine.interpolate', () => {
  it('returns the typed value if the template is a single expression', () => {
    expect(engine.interpolate('{{row.id}}', ctx)).toEqual({ ok: true, value: 7 });
    expect(engine.interpolate("{{can('orders.order.read')}}", ctx)).toEqual({ ok: true, value: true });
  });

  it('combines text and values', () => {
    expect(engine.interpolate("Order {{row.id}} ({{row.status}})", ctx)).toEqual({ ok: true, value: 'Order 7 (submitted)' });
  });

  it('leaves text without expressions unchanged', () => {
    expect(engine.interpolate('Nessuna espressione', ctx)).toEqual({ ok: true, value: 'Nessuna espressione' });
  });

  it('does not close the expression on }} inside a string', () => {
    expect(engine.interpolate("{{'a}}b'}}", ctx)).toEqual({ ok: true, value: 'a}}b' });
  });

  it('reports an unclosed expression', () => {
    expect(engine.interpolate('{{row.id', ctx).ok).toBe(false);
  });
});

describe('ExpressionEngine.evaluateCondition', () => {
  it('uses whenMissing if there is no condition', () => {
    expect(engine.evaluateCondition(undefined, ctx, { whenMissing: true })).toBe(true);
    expect(engine.evaluateCondition(undefined, ctx, { whenMissing: false })).toBe(false);
  });

  it('evaluates a condition', () => {
    expect(engine.evaluateCondition("{{can('orders.order.approve')}}", ctx, { whenMissing: true })).toBe(true);
  });

  it('fails closed if the evaluation gives an error', () => {
    expect(engine.evaluateCondition("{{row.inesistente == 'x'}}", ctx, { whenMissing: true })).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('fails closed if the result is not a boolean', () => {
    expect(engine.evaluateCondition('{{row.status}}', ctx, { whenMissing: true })).toBe(false);
    expect(errors[0]?.error).toContain('boolean');
  });
});

describe('ExpressionEngine.check', () => {
  it('accetta espressioni valide', () => {
    expect(engine.check("can('a.b') && row.status == 'x'")).toEqual({ valid: true });
  });

  it('reports syntax errors', () => {
    const result = engine.check("can('x' &&");
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('reports unknown functions and arguments of the wrong type', () => {
    expect(engine.check("evil('x')").valid).toBe(false);
    expect(engine.check('can(1)').valid).toBe(false);
  });

  it('checks every expression of a template', () => {
    expect(engine.checkTemplate("Totale {{row.id}} - {{can('a.b')}}").valid).toBe(true);
    expect(engine.checkTemplate('{{can(1)}}').valid).toBe(false);
    expect(engine.checkTemplate('{{non chiusa').valid).toBe(false);
  });
});

describe('parseTemplate', () => {
  it('splits text and expressions', () => {
    expect(parseTemplate('a {{x}} b')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'expr', source: 'x' },
      { kind: 'text', text: ' b' },
    ]);
  });
});

describe('presentation functions', () => {
  const none = { can: () => false };
  const withI18n = (locale: string, catalog: Record<string, string> = {}) =>
    new ExpressionEngine(none, {
      i18n: { locale: () => locale, translate: (key, fallback, params) => formatMessage(catalog[key] ?? fallback ?? key, params, locale) },
    });

  it('t() without a service uses the fallback, otherwise the key', () => {
    const engine = new ExpressionEngine(none);
    expect(engine.evaluate("t('a.b', 'Ciao {n}', {'n': 2})")).toEqual({ ok: true, value: 'Ciao 2' });
    expect(engine.evaluate("t('a.b')")).toEqual({ ok: true, value: 'a.b' });
  });

  it('t() uses the catalogue of the active language', () => {
    const engine = withI18n('en-GB', { 'a.b': 'Hello {nome}' });
    expect(engine.interpolate("{{ t('a.b', 'Ciao {nome}', {'nome': state.n}) }}!", { state: { n: 'Ann' } })).toEqual({ ok: true, value: 'Hello Ann!' });
  });

  it('formats amounts, numbers and dates according to the language', () => {
    const it = withI18n('it-IT');
    const en = withI18n('en-GB');
    expect(it.evaluate("fmtNumber(1234.5)")).toEqual({ ok: true, value: '1234,5' });
    expect(en.evaluate("fmtNumber(1234.5)")).toEqual({ ok: true, value: '1,234.5' });
    expect(it.evaluate("fmtCurrency(1234.5, 'EUR')")).toMatchObject({ ok: true, value: expect.stringContaining('1234,50') });
    expect(en.evaluate("fmtDate('2026-10-09')")).toEqual({ ok: true, value: '09/10/2026' });
    expect(it.evaluate("fmtDate('2026-10-09')")).toEqual({ ok: true, value: '09/10/26' });
  });

  it('a value that cannot be formatted becomes empty text', () => {
    const engine = withI18n('it-IT');
    expect(engine.evaluate('fmtCurrency(state.x, "EUR")', { state: { x: null } })).toEqual({ ok: true, value: '' });
    expect(engine.evaluate('fmtDate("not a date")')).toEqual({ ok: true, value: '' });
  });

  it('plural() chooses the form and replaces {n}', () => {
    const engine = withI18n('it-IT');
    expect(engine.evaluate("plural(1, 'one row', '{n} rows')")).toEqual({ ok: true, value: 'one row' });
    expect(engine.evaluate("plural(state.n, 'one row', '{n} rows')", { state: { n: 3 } })).toEqual({ ok: true, value: '3 rows' });
  });

  it('check() knows the presentation functions', () => {
    expect(new ExpressionEngine(none).check("t('a', 'b')").valid).toBe(true);
    expect(new ExpressionEngine(none).check("t(1)").valid).toBe(false);
  });
});

describe('expression cache', () => {
  const engine = new ExpressionEngine({ can: (p) => p === 'a.b.c' });
  const value = (r: ReturnType<ExpressionEngine['evaluate']>): unknown => (r.ok ? r.value : r.error);

  it('the same compiled expression works with different contexts', () => {
    expect(value(engine.interpolate('{{ state.n * 2 }}', { state: { n: 2 } }))).toBe(4);
    expect(value(engine.interpolate('{{ state.n * 2 }}', { state: { n: 5 } }))).toBe(10);
    expect(value(engine.interpolate('Totale {{ state.n }}', { state: { n: 7 } }))).toBe('Totale 7');
    expect(value(engine.evaluate("can('a.b.c')"))).toBe(true);
  });

  it('a syntax error stays an error from the cache too', () => {
    const errors: string[] = [];
    const reporting = new ExpressionEngine({ can: () => false }, { onError: (e) => errors.push(e.source) });
    expect(reporting.evaluate('1 +').ok).toBe(false);
    expect(reporting.evaluate('1 +').ok).toBe(false);
    expect(errors).toEqual(['1 +', '1 +']);
  });

  it('the cache keeps at most the given number of entries, dropping the least used', () => {
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

describe('isValid', () => {
  const calls: { name: string; value: unknown; params: Record<string, unknown> }[] = [];
  const validating = new ExpressionEngine(
    { can: () => false },
    {
      onError: (e) => errors.push(e),
      validate: (name, value, params) => {
        calls.push({ name, value, params });
        if (name === 'even') return typeof value === 'number' && value % 2 === 0;
        if (name === 'longer') return typeof value === 'string' && value.length > Number(params['than']);
        throw new Error(`unknown validator ${name}`);
      },
    },
  );

  beforeEach(() => (calls.length = 0));

  it('asks the validator, with plain values and parameters', () => {
    expect(validating.evaluate("isValid('even', form.n)", { form: { n: 4 } })).toEqual({ ok: true, value: true });
    expect(validating.evaluate("isValid('longer', 'abc', {'than': 2})")).toEqual({ ok: true, value: true });
    expect(calls[1]).toEqual({ name: 'longer', value: 'abc', params: { than: 2 } });
  });

  it('is an error for an unknown validator, so a condition fails closed', () => {
    expect(validating.evaluateCondition("{{isValid('nope', 1)}}", {}, { whenMissing: true })).toBe(false);
    expect(errors.at(-1)?.error).toContain('unknown validator nope');
  });

  it('is an error without validators, and the static check accepts it anyway', () => {
    expect(engine.evaluate("isValid('iban', 'x')").ok).toBe(false);
    expect(engine.check("isValid('anything', form.x, {'country': 'DE'})")).toEqual({ valid: true });
  });
});
