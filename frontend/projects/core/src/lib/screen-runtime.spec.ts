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
});
