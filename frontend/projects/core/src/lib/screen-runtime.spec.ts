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

  it('carica da solo i data source GET, omettendo i parametri nulli', async () => {
    const rt = fakes.runtime({ ...screen }, injector);
    rt.setState('filtri', { stato: null });
    await settle();
    expect(fakes.requests).toEqual([{ method: 'GET', url: '/api/ordini', query: { page: 0 } }]);
    expect(rt.source('ordini').status).toBe('ready');
    rt.destroy();
  });

  it('ricarica quando cambia un valore da cui dipende', async () => {
    const rt = fakes.runtime(screen, injector);
    rt.setState('filtri', { stato: null });
    await settle();
    rt.setState('filtri.stato', 'inviato');
    await settle();
    expect(fakes.requests.at(-1)?.query).toEqual({ stato: 'inviato', page: 0 });
    rt.destroy();
  });

  it('non ricarica se cambia una parte dello stato che non tocca la richiesta', async () => {
    const rt = fakes.runtime(screen, injector);
    rt.setState('filtri', { stato: null });
    await settle();
    const before = fakes.requests.length;
    rt.setState('selezione', [1, 2]);
    rt.setState('passo', 2);
    await settle();
    expect(fakes.requests).toHaveLength(before);
    // Il passo refresh ricarica comunque.
    await rt.refresh('ordini');
    expect(fakes.requests).toHaveLength(before + 1);
    rt.destroy();
  });

  it('refresh su un data source non GET non dà errore: avvisa i componenti che lo interrogano da sé', async () => {
    const rt = fakes.runtime(screen, injector);
    await settle();
    const before = fakes.requests.length;
    expect(await rt.refresh('approva')).toEqual({ ok: true, data: null });
    expect(rt.refreshCount()).toEqual({ approva: 1 });
    expect(fakes.requests).toHaveLength(before);
    expect((await rt.refresh('sconosciuto')).ok).toBe(false);
    rt.destroy();
  });

  it('non carica nulla se manca il permesso richiesto dalla schermata', async () => {
    fakes.permissions.clear();
    const rt = fakes.runtime(screen, injector);
    await settle();
    expect(rt.allowed()).toBe(false);
    expect(fakes.requests).toHaveLength(0);
    rt.destroy();
  });

  it('segnala un errore di caricamento senza mostrare il messaggio del server', async () => {
    fakes.respond = () => { throw new Error('stack interno 500'); };
    const rt = fakes.runtime(screen, injector);
    rt.setState('filtri', { stato: null });
    await settle();
    expect(rt.source('ordini')).toEqual({ status: 'error', data: null, error: 'Caricamento non riuscito' });
    expect(fakes.reports.some((r) => r.error.includes('stack interno'))).toBe(true);
    rt.destroy();
  });

  it('codifica i valori inseriti nell’URL', async () => {
    const rt = fakes.runtime(screen, injector);
    const result = await rt.execute('approva', { id: 'a/b ?x' });
    expect(result.ok).toBe(true);
    expect(fakes.requests.at(-1)).toEqual({ method: 'POST', url: '/api/ordini/a%2Fb%20%3Fx/approva', body: {} });
    rt.destroy();
  });

  it('rifiuta URL assoluti o con percorsi relativi', async () => {
    for (const url of ['https://evil.example/x', '//evil.example/x', '/api/../admin']) {
      const rt = fakes.runtime({ ...screen, dataSources: { d: { type: 'rest', method: 'POST', url } } }, injector);
      const result = await rt.execute('d');
      expect(result.ok).toBe(false);
      rt.destroy();
    }
    expect(fakes.requests).toHaveLength(0);
  });

  it('non permette di scrivere in __proto__ tramite lo stato', () => {
    const rt = fakes.runtime(screen, injector);
    rt.setState('__proto__.polluted', true);
    rt.setState('filtri.constructor', 1);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(rt.getState('filtri')).toBeUndefined();
    rt.destroy();
  });

  it('visibilità fail-closed: errore in hiddenIf nasconde, errore in visibleIf nasconde', () => {
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

  it('usa i permessi per riga nello scope', () => {
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

  it('text() traduce con la lingua attiva e segue il cambio di lingua', () => {
    const rt = fakes.runtime(screenWith([]), injector);
    const template = "{{ t('p.ciao', 'Ciao {nome}', {'nome': user.username}) }}";
    expect(rt.text(template)).toBe('Ciao test');
    fakes.i18n.setLocale('en');
    expect(rt.text(template)).toBe('Hello test');
  });

  it('espone la lingua come user.locale', () => {
    const rt = fakes.runtime(screenWith([]), injector);
    fakes.i18n.setLocale('en');
    expect(rt.text('{{ user.locale }}')).toBe('en');
  });

  it('una chiave senza traduzione e senza ripiego mostra la chiave e viene segnalata una sola volta', async () => {
    const rt = fakes.runtime(screenWith([]), injector);
    expect(rt.text("{{ t('p.manca') }}")).toBe('p.manca');
    expect(rt.text("{{ t('p.manca') }}")).toBe('p.manca');
    await Promise.resolve();
    expect(fakes.reports.filter((r) => r.error.includes('p.manca'))).toHaveLength(1);
  });

  it('i messaggi generici del runtime seguono la lingua', () => {
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

  it('esegue i passi in ordine usando la riga come scope', async () => {
    const rt = fakes.runtime(screen, injector);
    rt.setState('filtri', { stato: null });
    const ok = await runSteps(rt, approvaSteps, { row: { id: 7, numero: 'A-7' } });
    expect(ok).toBe(true);
    expect(fakes.requests.map((r) => `${r.method} ${r.url}`)).toContain('POST /api/ordini/7/approva');
    expect(fakes.requests.at(-1)?.method).toBe('GET');
    expect(fakes.toasts).toEqual([{ message: 'Ordine A-7 approvato', kind: 'info' }]);
    rt.destroy();
  });

  it('si ferma al primo errore ed esegue onError', async () => {
    fakes.respond = (r) => { if (r.method === 'POST') throw new Error('409'); return {}; };
    const rt = fakes.runtime(screen, injector);
    const ok = await runSteps(rt, approvaSteps, { row: { id: 7, numero: 'A-7' } });
    expect(ok).toBe(false);
    expect(fakes.toasts).toEqual([{ message: 'Approvazione non riuscita', kind: 'info' }]);
    expect(fakes.requests.filter((r) => r.method === 'GET')).toHaveLength(0);
    rt.destroy();
  });

  it('mostra un messaggio generico se manca onError', async () => {
    fakes.respond = () => { throw new Error('dettaglio interno'); };
    const rt = fakes.runtime(screen, injector);
    await runSteps(rt, [{ call: 'approva', args: { id: 1 } }], {});
    expect(fakes.toasts).toEqual([{ message: 'Operazione non riuscita', kind: 'info' }]);
    rt.destroy();
  });

  it('naviga e imposta lo stato', async () => {
    const rt = fakes.runtime(screen, injector);
    await runSteps(rt, [{ set: { path: 'state.selezione', value: '{{row.id}}' } }, { navigate: 'ordine-dettaglio', params: { id: '{{row.id}}' } }], { row: { id: 9 } });
    expect(rt.getState('selezione')).toBe(9);
    expect(fakes.navigations).toEqual([{ screen: 'ordine-dettaglio', params: { id: 9 } }]);
    rt.destroy();
  });

  it('non lancia se il data source non esiste', async () => {
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ call: 'inesistente' }])).toBe(false);
    rt.destroy();
  });
});

describe('ScreenRuntime: corpo delle richieste', () => {
  it('usa body con l’intero form e passa lo scope della chiamata', async () => {
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

    /** Un client che lascia le risposte in sospeso e registra gli annullamenti. */
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

    it('una lettura nuova annulla quella in corso, senza segnalare errori né cambiare i dati', async () => {
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

    it('le scritture non si annullano; uscendo dalla schermata si annullano le letture in corso', async () => {
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

    it('letture di servizio identiche e contemporanee fanno una sola chiamata', async () => {
      const calls = pending();
      const rt = fakes.runtime({ ...screen, dataSources: { clienti: { type: 'rest', method: 'POST', url: '/api/x' }, cerca: { type: 'rest', method: 'GET', url: '/api/clienti', params: { q: '{{ search }}' } } } }, injector);
      // Solo le ricerche (il caricamento automatico senza testo non ha q).
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
      // Finita, la stessa lettura si rifà.
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

  it("l'apertura della schermata è uno span che si chiude dopo le prime letture, di cui è il padre", async () => {
    const rt = fakes.runtime(screen, injector);
    const open = fakes.spans[0];
    expect(open).toMatchObject({ name: 'screen.open', attributes: { 'lowcode.screen': 'ordini-elenco', 'lowcode.datasources': 1 } });
    expect(open.ok).toBeUndefined();
    await settle();
    expect(fakes.requestOptions[0]).toMatchObject({ source: 'ordini', trace: open.context });
    expect(open.ok).toBe(true);
    // Le letture successive non appartengono più all'apertura.
    rt.setState('filtri.stato', 'inviato');
    await settle();
    expect(fakes.requestOptions.at(-1)?.trace).toBeUndefined();
    rt.destroy();
  });

  it("una prima lettura fallita chiude l'apertura con esito negativo", async () => {
    fakes.respond = () => {
      throw new Error('500');
    };
    const rt = fakes.runtime(screen, injector);
    await settle();
    expect(fakes.spans[0].ok).toBe(false);
    rt.destroy();
  });

  it('senza data source GET lo span di apertura si chiude subito', () => {
    const rt = fakes.runtime({ ...screen, dataSources: { approva: { type: 'rest', method: 'POST', url: '/api/x' } } }, injector);
    expect(fakes.spans[0]).toMatchObject({ name: 'screen.open', ok: true });
    rt.destroy();
  });

  it("un'azione è uno span con i nomi dei passi, padre delle sue chiamate (anche dentro run e onError)", async () => {
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

  it("un'azione non riuscita chiude lo span con esito negativo, e gli attributi non contengono valori", async () => {
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

  it('un tracciatore che lancia errori non ferma la schermata né le azioni', async () => {
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
