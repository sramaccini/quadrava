import { Injector } from '@angular/core';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { FieldDefinition } from 'schema';
import { fieldErrorsOf, pointerSegments } from './field-errors';
import { remoteAnswer, RemoteChecks } from './remote-checks';
import { Fakes } from './testing';
import { checkField, codeMessage, type ValidationEnv } from './validation';

describe('remote checks', () => {
  let fakes: Fakes;
  let injector: Injector;
  /** Staff numbers already used, as the fake service knows them. */
  const taken = new Set(['S000001']);

  beforeEach(() => {
    vi.useFakeTimers();
    fakes = new Fakes();
    injector = TestBed.inject(Injector);
    fakes.respond = (request) => {
      if (request.url === '/api/staff/check') return { valid: !taken.has(String(request.query?.['number'])), code: 'taken' };
      if (request.url === '/api/broken') return 'yes';
      throw new Error('500');
    };
    fakes.i18n.addMessages('en', { 'validation.taken': 'Already used', 'lc.validation.remoteFailed': 'Could not check' }, 'app');
  });
  afterEach(() => vi.useRealTimers());

  const field = (remote: string, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({ name: remote, type: 'text', validation: [{ remote, debounce: 300 }], ...extra });
  const screen = {
    schemaVersion: '1.0',
    screen: 'remote',
    // The rules are in the screen: their data sources do not load by themselves when it opens.
    components: [{ type: 'form' as const, fields: [field('checkStaff'), field('broken'), field('failing')] }],
    dataSources: {
      checkStaff: { type: 'rest' as const, method: 'GET' as const, url: '/api/staff/check', params: { number: '{{ value }}' } },
      broken: { type: 'rest' as const, method: 'GET' as const, url: '/api/broken' },
      failing: { type: 'rest' as const, method: 'GET' as const, url: '/api/failing' },
    },
  };

  function setup(): { env: ValidationEnv; remote: RemoteChecks } {
    const runtime = fakes.runtime(screen, injector);
    const remote = new RemoteChecks(runtime);
    return { remote, env: { runtime, i18n: fakes.i18n, scope: {}, values: {}, label: (n) => n, remote } };
  }
  const flush = async (ms = 300): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('asks the service after the pause, then keeps the result for the value', async () => {
    const { env } = setup();
    const f = field('checkStaff');
    expect(checkField(f, 'S000001', env)).toEqual({ error: null, warning: null, pending: true });
    await flush(299);
    expect(fakes.requests).toHaveLength(0);
    await flush(1);
    expect(fakes.requests.map((r) => r.query)).toEqual([{ number: 'S000001' }]);
    expect(checkField(f, 'S000001', env)).toEqual({ error: 'Already used', warning: null, remote: true });
    expect(checkField(f, 'S000002', env).pending).toBe(true);
    await flush();
    expect(checkField(f, 'S000002', env)).toEqual({ error: null, warning: null });
    // Back to a value already checked: no new request.
    expect(checkField(f, 'S000001', env).error).toBe('Already used');
    expect(fakes.requests).toHaveLength(2);
  });

  it('a newer value cancels the previous check; typing quickly sends only the last one', async () => {
    const { env } = setup();
    const f = field('checkStaff');
    for (const value of ['S1', 'S12', 'S123']) {
      checkField(f, value, env);
      await flush(100);
    }
    await flush();
    expect(fakes.requests.map((r) => r.query)).toEqual([{ number: 'S123' }]);
  });

  it('runs only when the other rules pass, and not on an empty field', async () => {
    const { env } = setup();
    const f = field('checkStaff', { pattern: 'S\\d{6}' });
    expect(checkField(f, 'X', env).error).toBe('lc.validation.pattern');
    expect(checkField(f, '', env)).toEqual({ error: null, warning: null });
    await flush();
    expect(fakes.requests).toHaveLength(0);
  });

  it('settle starts the waiting checks at once and waits for them (before sending)', async () => {
    const { env, remote } = setup();
    checkField(field('checkStaff'), 'S000001', env);
    const settled = remote.settle();
    await vi.runAllTimersAsync();
    await settled;
    expect(checkField(field('checkStaff'), 'S000001', env).error).toBe('Already used');
  });

  it('fails closed: an error of the service or an answer of another shape does not pass; the latter is reported once', async () => {
    const { env } = setup();
    checkField(field('failing'), 'a', env);
    checkField(field('broken'), 'a', { ...env });
    await flush();
    expect(checkField(field('failing'), 'a', env)).toEqual({ error: 'Could not check', warning: null, remote: true });
    await vi.runAllTimersAsync();
    expect(fakes.reports.map((r) => r.source)).toContain('remote broken');
    expect(JSON.stringify(fakes.reports)).not.toContain('"a"');
  });

  it('without remote checks (rows of a repeater, filters) a remote rule fails closed', () => {
    const { env } = setup();
    expect(checkField(field('checkStaff'), 'S1', { ...env, remote: undefined }).error).toBe('lc.invalid');
  });

  it('answers: true, false, or { valid, code, params } with clean codes and simple parameters', () => {
    expect(remoteAnswer(true)).toEqual({ status: 'valid' });
    expect(remoteAnswer(false)).toEqual({ status: 'invalid' });
    expect(remoteAnswer({ valid: false, code: 'taken', params: { max: 3, bad: { x: 1 } } })).toEqual({ status: 'invalid', code: 'taken', params: { max: 3 } });
    expect(remoteAnswer({ valid: false, code: '<b>' })).toEqual({ status: 'invalid' });
    expect(remoteAnswer('yes')).toBeNull();
  });
});

describe('field errors of a Problem', () => {
  it('keeps the well-formed entries only, at most 50, with simple parameters', () => {
    const problem = {
      errors: [
        { path: '/email', code: 'taken', message: 'internal detail' },
        { path: '/lines/0/quantity', code: 'max', params: { max: 50, nested: {}, text: 'x'.repeat(101) } },
        { path: 'email', code: 'x' },
        { path: '/a', code: '<script>' },
        null,
      ],
    };
    expect(fieldErrorsOf(problem)).toEqual([
      { path: '/email', code: 'taken' },
      { path: '/lines/0/quantity', code: 'max', params: { max: 50 } },
    ]);
    expect(fieldErrorsOf({ errors: Array.from({ length: 80 }, () => ({ path: '/a', code: 'x' })) })).toHaveLength(50);
    expect(fieldErrorsOf({ fieldErrors: [{ path: '/a', code: 'x' }] })).toEqual([{ path: '/a', code: 'x' }]);
    expect(fieldErrorsOf(null)).toEqual([]);
  });

  it('pointers are split into segments', () => {
    expect(pointerSegments('/lines/0/code')).toEqual(['lines', '0', 'code']);
    expect(pointerSegments('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
  });

  it('codes become messages of the application, then of the platform', () => {
    const fakes = new Fakes();
    fakes.i18n.addMessages('en', { 'validation.taken': 'Already used', 'lc.validation.max': 'At most {max}', 'lc.invalid': 'Invalid value' }, 'builtin');
    expect(codeMessage(fakes.i18n, 'taken')).toBe('Already used');
    expect(codeMessage(fakes.i18n, 'max', { max: 5 })).toBe('At most 5');
    expect(codeMessage(fakes.i18n, 'unknownCode')).toBe('Invalid value');
  });
});
