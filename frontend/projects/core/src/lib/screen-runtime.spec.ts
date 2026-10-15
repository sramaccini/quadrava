import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition } from 'schema';
import { runSteps } from './action-engine';
import { Fakes } from './testing';

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'ordini-elenco',
  requires: 'ordini.ordine.leggi',
  dataSources: {
    ordini: { type: 'rest', method: 'GET', url: '/api/ordini', params: { stato: '{{state.filtri.stato}}', page: '{{state.page}}' } },
    approva: { type: 'rest', method: 'POST', url: '/api/ordini/{{id}}/approva' },
  },
  components: [],
};

describe('ScreenRuntime', () => {
  let fakes: Fakes;
  let injector: Injector;

  beforeEach(() => {
    fakes = new Fakes();
    fakes.permissions.add('ordini.ordine.leggi');
    injector = TestBed.inject(Injector);
  });

  async function settle(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.tick();
  }

  it('loads GET data sources by itself, leaving out null parameters', async () => {
    const rt = fakes.runtime({ ...screen }, injector);
    rt.setState('filtri', { stato: null });
    await settle();
    expect(fakes.requests).toEqual([{ method: 'GET', url: '/api/ordini', query: { page: 0 } }]);
    expect(rt.source('ordini').status).toBe('ready');
    rt.destroy();
  });

  it('reloads when a value it depends on changes', async () => {
    const rt = fakes.runtime(screen, injector);
    rt.setState('filtri', { stato: null });
    await settle();
    rt.setState('filtri.stato', 'inviato');
    await settle();
    expect(fakes.requests.at(-1)?.query).toEqual({ stato: 'inviato', page: 0 });
    rt.destroy();
  });

  it('does not reload if a part of the state that does not touch the request changes', async () => {
    const rt = fakes.runtime(screen, injector);
    rt.setState('filtri', { stato: null });
    await settle();
    const before = fakes.requests.length;
    rt.setState('selezione', [1, 2]);
    rt.setState('passo', 2);
    await settle();
    expect(fakes.requests).toHaveLength(before);
    // The refresh step reloads anyway.
    await rt.refresh('ordini');
    expect(fakes.requests).toHaveLength(before + 1);
    rt.destroy();
  });

  it('refresh on a non-GET data source gives no error: it notifies the components that query it themselves', async () => {
    const rt = fakes.runtime(screen, injector);
    await settle();
    const before = fakes.requests.length;
    expect(await rt.refresh('approva')).toEqual({ ok: true, data: null });
    expect(rt.refreshCount()).toEqual({ approva: 1 });
    expect(fakes.requests).toHaveLength(before);
    expect((await rt.refresh('sconosciuto')).ok).toBe(false);
    rt.destroy();
  });

  it('loads nothing if the permission required by the screen is missing', async () => {
    fakes.permissions.clear();
    const rt = fakes.runtime(screen, injector);
    await settle();
    expect(rt.allowed()).toBe(false);
    expect(fakes.requests).toHaveLength(0);
    rt.destroy();
  });

  it('reports a loading error without showing the server message', async () => {
    fakes.respond = () => { throw new Error('stack interno 500'); };
    const rt = fakes.runtime(screen, injector);
    rt.setState('filtri', { stato: null });
    await settle();
    expect(rt.source('ordini')).toEqual({ status: 'error', data: null, error: 'Loading failed' });
    expect(fakes.reports.some((r) => r.error.includes('stack interno'))).toBe(true);
    rt.destroy();
  });

  it('encodes the values inserted in the URL', async () => {
    const rt = fakes.runtime(screen, injector);
    const result = await rt.execute('approva', { id: 'a/b ?x' });
    expect(result.ok).toBe(true);
    expect(fakes.requests.at(-1)).toEqual({ method: 'POST', url: '/api/ordini/a%2Fb%20%3Fx/approva', body: {} });
    rt.destroy();
  });

  it('rejects absolute URLs or URLs with relative segments', async () => {
    for (const url of ['https://evil.example/x', '//evil.example/x', '/api/../admin']) {
      const rt = fakes.runtime({ ...screen, dataSources: { d: { type: 'rest', method: 'POST', url } } }, injector);
      const result = await rt.execute('d');
      expect(result.ok).toBe(false);
      rt.destroy();
    }
    expect(fakes.requests).toHaveLength(0);
  });

  it('does not allow writing into __proto__ through the state', () => {
    const rt = fakes.runtime(screen, injector);
    rt.setState('__proto__.polluted', true);
    rt.setState('filtri.constructor', 1);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(rt.getState('filtri')).toBeUndefined();
    rt.destroy();
  });

  it('fail-closed visibility: an error in hiddenIf hides, an error in visibleIf hides', () => {
    const rt = fakes.runtime(screen, injector);
    expect(rt.isVisible({})).toBe(true);
    expect(rt.isVisible({ visibleIf: "{{can('ordini.ordine.approva')}}" })).toBe(false);
    expect(rt.isVisible({ visibleIf: "{{can('ordini.ordine.leggi')}}" })).toBe(true);
    expect(rt.isVisible({ hiddenIf: '{{row.inesistente == 1}}' })).toBe(false);
    expect(rt.isVisible({ visibleIf: '{{row.inesistente == 1}}' })).toBe(false);
    expect(rt.isReadOnly({ readOnlyIf: '{{row.inesistente == 1}}' })).toBe(true);
    expect(rt.isEnabled({})).toBe(true);
    rt.destroy();
  });

  it('uses the per-row permissions in the scope', () => {
    const rt = fakes.runtime(screen, injector);
    expect(rt.isVisible({ visibleIf: '{{row._perm.update}}' }, { row: { _perm: { update: true } } })).toBe(true);
    expect(rt.isVisible({ visibleIf: '{{row._perm.update}}' }, { row: { _perm: { update: false } } })).toBe(false);
    rt.destroy();
  });
});

describe('ScreenRuntime: lingua e traduzioni', () => {
  let fakes: Fakes;
  let injector: Injector;
  const screenWith = (components: ScreenDefinition['components']): ScreenDefinition => ({ schemaVersion: '1.0', screen: 'p', components });

  beforeEach(() => {
    fakes = new Fakes();
    injector = TestBed.inject(Injector);
    fakes.i18n.addMessages('it', { 'p.ciao': 'Ciao {nome}' });
    fakes.i18n.addMessages('en', { 'p.ciao': 'Hello {nome}' });
  });

  it('text() translates with the active language and follows the language change', () => {
    const rt = fakes.runtime(screenWith([]), injector);
    const template = "{{ t('p.ciao', 'Ciao {nome}', {'nome': user.username}) }}";
    expect(rt.text(template)).toBe('Ciao test');
    fakes.i18n.setLocale('en');
    expect(rt.text(template)).toBe('Hello test');
  });

  it('exposes the language as user.locale', () => {
    const rt = fakes.runtime(screenWith([]), injector);
    fakes.i18n.setLocale('en');
    expect(rt.text('{{ user.locale }}')).toBe('en');
  });

  it('a key without translation and without fallback shows the key and is reported only once', async () => {
    const rt = fakes.runtime(screenWith([]), injector);
    expect(rt.text("{{ t('p.manca') }}")).toBe('p.manca');
    expect(rt.text("{{ t('p.manca') }}")).toBe('p.manca');
    await Promise.resolve();
    expect(fakes.reports.filter((r) => r.error.includes('p.manca'))).toHaveLength(1);
  });

  it('the generic messages of the runtime follow the language', () => {
    const rt = fakes.runtime(screenWith([]), injector);
    fakes.i18n.addMessages('en', { 'lc.operationFailed': 'Operation failed' }, 'builtin');
    expect(rt.systemText('lc.operationFailed', 'Operazione non riuscita')).toBe('Operazione non riuscita');
    fakes.i18n.setLocale('en');
    expect(rt.systemText('lc.operationFailed', 'Operazione non riuscita')).toBe('Operation failed');
  });
});

describe('runSteps', () => {
  let fakes: Fakes;
  let injector: Injector;

  beforeEach(() => {
    fakes = new Fakes();
    fakes.permissions.add('ordini.ordine.leggi');
    injector = TestBed.inject(Injector);
  });

  const approvaSteps = [
    { call: 'approva', args: { id: '{{row.id}}' }, onError: { toast: 'Approvazione non riuscita' } },
    { refresh: 'ordini' },
    { toast: 'Ordine {{row.numero}} approvato' },
  ];

  it('runs the steps in order using the row as scope', async () => {
    const rt = fakes.runtime(screen, injector);
    rt.setState('filtri', { stato: null });
    const ok = await runSteps(rt, approvaSteps, { row: { id: 7, numero: 'A-7' } });
    expect(ok).toBe(true);
    expect(fakes.requests.map((r) => `${r.method} ${r.url}`)).toContain('POST /api/ordini/7/approva');
    expect(fakes.requests.at(-1)?.method).toBe('GET');
    expect(fakes.toasts).toEqual([{ message: 'Ordine A-7 approvato', kind: 'info' }]);
    rt.destroy();
  });

  it('stops at the first error and runs onError', async () => {
    fakes.respond = (r) => { if (r.method === 'POST') throw new Error('409'); return {}; };
    const rt = fakes.runtime(screen, injector);
    const ok = await runSteps(rt, approvaSteps, { row: { id: 7, numero: 'A-7' } });
    expect(ok).toBe(false);
    expect(fakes.toasts).toEqual([{ message: 'Approvazione non riuscita', kind: 'info' }]);
    expect(fakes.requests.filter((r) => r.method === 'GET')).toHaveLength(0);
    rt.destroy();
  });

  it('shows a generic message if onError is missing', async () => {
    fakes.respond = () => { throw new Error('dettaglio interno'); };
    const rt = fakes.runtime(screen, injector);
    await runSteps(rt, [{ call: 'approva', args: { id: 1 } }], {});
    expect(fakes.toasts).toEqual([{ message: 'Operation failed', kind: 'info' }]);
    rt.destroy();
  });

  it('navigates and sets the state', async () => {
    const rt = fakes.runtime(screen, injector);
    await runSteps(rt, [{ set: { path: 'state.selezione', value: '{{row.id}}' } }, { navigate: 'ordine-dettaglio', params: { id: '{{row.id}}' } }], { row: { id: 9 } });
    expect(rt.getState('selezione')).toBe(9);
    expect(fakes.navigations).toEqual([{ screen: 'ordine-dettaglio', params: { id: 9 } }]);
    rt.destroy();
  });

  it('does not throw if the data source does not exist', async () => {
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ call: 'inesistente' }])).toBe(false);
    rt.destroy();
  });
});

describe('ScreenRuntime: request bodies', () => {
  it('uses body with the whole form and passes the scope of the call', async () => {
    const fakes = new Fakes();
    fakes.permissions.add('ordini.ordine.leggi');
    const injector = TestBed.inject(Injector);
    const rt = fakes.runtime(
      { ...screen, dataSources: { salva: { type: 'rest', method: 'PUT', url: '/api/ordini/{{params.id}}', body: '{{form}}' } } },
      injector,
      { id: 5 },
    );
    const ok = await runSteps(rt, [{ call: 'salva' }], { form: { cliente: 'ACME', sconto: 10 } });
    expect(ok).toBe(true);
    expect(fakes.requests).toEqual([{ method: 'PUT', url: '/api/ordini/5', body: { cliente: 'ACME', sconto: 10 } }]);
    rt.destroy();
  });

  describe('richieste superate e ripetute', () => {
    let fakes: Fakes;
    let injector: Injector;
    beforeEach(() => {
      fakes = new Fakes();
      fakes.permissions.add('ordini.ordine.leggi');
      injector = TestBed.inject(Injector);
    });
    async function settle(): Promise<void> {
      TestBed.tick();
      await Promise.resolve();
      await Promise.resolve();
      TestBed.tick();
    }

    /** A client that leaves the responses pending and records the cancellations. */
    function pending() {
      const calls: { request: { method: string; query?: unknown }; signal?: AbortSignal; resolve: (v: unknown) => void }[] = [];
      fakes.deps.data = {
        request: (request: never, options?: { signal?: AbortSignal }) =>
          new Promise((resolve, reject) => {
            calls.push({ request, signal: options?.signal, resolve });
            options?.signal?.addEventListener('abort', () => reject(new DOMException('annullata', 'AbortError')));
          }),
      } as never;
      return calls;
    }

    it('a new read cancels the one in progress, without reporting errors or changing the data', async () => {
      const calls = pending();
      const rt = fakes.runtime(screen, injector);
      rt.setState('filtri', { stato: null });
      await settle();
      rt.setState('filtri.stato', 'inviato');
      await settle();
      expect(calls.length).toBe(2);
      expect(calls[0].signal?.aborted).toBe(true);
      expect(calls[1].signal?.aborted).toBe(false);
      calls[1].resolve({ items: [1], total: 1 });
      await settle();
      expect(rt.source('ordini')).toEqual({ status: 'ready', data: { items: [1], total: 1 } });
      expect(fakes.reports).toEqual([]);
      rt.destroy();
      expect(calls[1].signal?.aborted).toBe(false);
    });

    it('writes are not cancelled; leaving the screen cancels the reads in progress', async () => {
      const calls = pending();
      const rt = fakes.runtime(screen, injector);
      rt.setState('filtri', { stato: null });
      await settle();
      void rt.execute('approva', { id: 1 });
      void rt.execute('approva', { id: 2 });
      expect(calls.filter((c) => c.request.method === 'POST').map((c) => c.signal)).toEqual([undefined, undefined]);
      rt.destroy();
      expect(calls[0].signal?.aborted).toBe(true);
    });

    it('identical concurrent service reads make a single call', async () => {
      const calls = pending();
      const rt = fakes.runtime({ ...screen, dataSources: { clienti: { type: 'rest', method: 'POST', url: '/api/x' }, cerca: { type: 'rest', method: 'GET', url: '/api/clienti', params: { q: '{{ search }}' } } } }, injector);
      // Only the searches (the automatic load without text has no q).
      const searches = () => calls.filter((c) => (c.request.query as { q?: string } | undefined)?.q);
      const a = rt.query('cerca', {}, { search: 'ro' });
      const b = rt.query('cerca', {}, { search: 'ro' });
      const c = rt.query('cerca', {}, { search: 'bi' });
      expect(searches().length).toBe(2);
      searches()[0].resolve(['Rossi']);
      searches()[1].resolve(['Bianchi']);
      expect(await a).toEqual({ ok: true, data: ['Rossi'] });
      expect(await b).toEqual({ ok: true, data: ['Rossi'] });
      expect(await c).toEqual({ ok: true, data: ['Bianchi'] });
      // Once finished, the same read is made again.
      void rt.query('cerca', {}, { search: 'ro' });
      expect(searches().length).toBe(3);
      rt.destroy();
    });
  });
});

describe('tracce', () => {
  let fakes: Fakes;
  let injector: Injector;

  beforeEach(() => {
    fakes = new Fakes();
    fakes.permissions.add('ordini.ordine.leggi');
    injector = TestBed.inject(Injector);
  });

  async function settle(): Promise<void> {
    TestBed.tick();
    for (let i = 0; i < 4; i++) await Promise.resolve();
    TestBed.tick();
  }

  it('opening the screen is a span that closes after the first reads, of which it is the parent', async () => {
    const rt = fakes.runtime(screen, injector);
    const open = fakes.spans[0];
    expect(open).toMatchObject({ name: 'screen.open', attributes: { 'lowcode.screen': 'ordini-elenco', 'lowcode.datasources': 1 } });
    expect(open.ok).toBeUndefined();
    await settle();
    expect(fakes.requestOptions[0]).toMatchObject({ source: 'ordini', trace: open.context });
    expect(open.ok).toBe(true);
    // The later reads no longer belong to the opening.
    rt.setState('filtri.stato', 'inviato');
    await settle();
    expect(fakes.requestOptions.at(-1)?.trace).toBeUndefined();
    rt.destroy();
  });

  it('a failed first read closes the opening with a negative outcome', async () => {
    fakes.respond = () => {
      throw new Error('500');
    };
    const rt = fakes.runtime(screen, injector);
    await settle();
    expect(fakes.spans[0].ok).toBe(false);
    rt.destroy();
  });

  it('without GET data sources the opening span closes immediately', () => {
    const rt = fakes.runtime({ ...screen, dataSources: { approva: { type: 'rest', method: 'POST', url: '/api/x' } } }, injector);
    expect(fakes.spans[0]).toMatchObject({ name: 'screen.open', ok: true });
    rt.destroy();
  });

  it('an action is a span with the names of the steps, parent of its calls (also inside run and onError)', async () => {
    const rt = fakes.runtime({ ...screen, actions: { salva: [{ call: 'approva', args: { id: 1 } }] } }, injector);
    rt.setState('filtri', { stato: null });
    const ok = await runSteps(rt, [{ run: 'salva' }, { refresh: 'ordini' }, { toast: 'fatto' }]);
    const action = fakes.spans.find((s) => s.name === 'action.run')!;
    expect(ok).toBe(true);
    expect(action).toMatchObject({ attributes: { 'lowcode.screen': 'ordini-elenco', 'lowcode.action': 'run salva, refresh ordini, toast' }, ok: true });
    const fromAction = fakes.requestOptions.filter((o) => o?.trace === action.context).map((o) => o?.source);
    expect(fromAction).toEqual(['approva', 'ordini']);
    rt.destroy();
  });

  it('a failed action closes the span with a negative outcome, and the attributes contain no values', async () => {
    fakes.respond = (r) => {
      if (r.method === 'POST') throw new Error('409');
      return {};
    };
    const rt = fakes.runtime(screen, injector);
    await runSteps(rt, [{ call: 'approva', args: { id: '{{row.id}}' } }], { row: { id: 4242 } });
    const action = fakes.spans.find((s) => s.name === 'action.run')!;
    expect(action.ok).toBe(false);
    expect(JSON.stringify(fakes.spans)).not.toContain('4242');
    rt.destroy();
  });

  it('a tracer that throws errors stops neither the screen nor the actions', async () => {
    fakes.deps.tracer = {
      start: () => {
        throw new Error('rotto');
      },
    };
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ call: 'approva', args: { id: 1 } }])).toBe(true);
    rt.destroy();
  });
});
