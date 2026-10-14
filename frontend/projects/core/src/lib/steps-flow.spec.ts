import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DataRequest } from './ports';
import type { ScreenDefinition } from 'schema';
import { runSteps } from './action-engine';
import { Fakes } from './testing';

/** Errore come quello del client dati dei servizi: con il codice HTTP e senza il testo del server. */
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Richiesta fallita (${status})`);
  }
}

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'prova',
  dataSources: {
    crea: { type: 'rest', method: 'POST', url: '/api/ordini', body: '{{ form }}' },
    dettaglio: { type: 'rest', method: 'GET', url: '/api/ordini/{{ id }}' },
    approva: { type: 'rest', method: 'POST', url: '/api/ordini/{{ id }}/approva' },
  },
  actions: {
    salvaOrdine: [{ call: 'crea', as: 'creato' }, { toast: 'Ordine {{ creato.id }} salvato' }],
    avvisa: { toast: 'Ciao {{ form.cliente }}' },
    ciclo: { run: 'ciclo' },
  },
  components: [],
};

describe('passi prima e dopo una chiamata', () => {
  let fakes: Fakes;
  let injector: Injector;
  beforeEach(() => {
    fakes = new Fakes();
    injector = TestBed.inject(Injector);
  });

  it('as: la risposta della chiamata è visibile ai passi seguenti (e solo a loro)', async () => {
    fakes.respond = (r: DataRequest) => (r.method === 'POST' ? { id: 42, stato: 'bozza' } : {});
    const rt = fakes.runtime(screen, injector);
    const ok = await runSteps(rt, [
      { toast: 'prima: {{ has(creato) }}' },
      { call: 'crea', as: 'creato' },
      { toast: 'creato {{ creato.id }} in {{ creato.stato }}' },
      { call: 'dettaglio', args: { id: '{{ creato.id }}' } },
    ], { form: { cliente: 'Rossi' } });
    expect(ok).toBe(true);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['prima: {{ has(creato) }}', 'creato 42 in bozza']);
    expect(fakes.requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/ordini', 'GET /api/ordini/42']);
  });

  it('if: then o else secondo la condizione; una condizione non valutabile ferma tutto (fail-closed)', async () => {
    fakes.respond = () => ({ id: 7, stato: 'inviato' });
    const rt = fakes.runtime(screen, injector);
    await runSteps(rt, [
      { call: 'crea', as: 'creato' },
      { if: "{{ creato.stato == 'bozza' }}", then: { toast: 'bozza' }, else: [{ toast: 'altro stato' }, { toast: 'ancora' }] },
      { if: '{{ creato.id > 5 }}', then: { toast: 'grande' } },
      { if: '{{ creato.id < 5 }}', then: { toast: 'piccolo' } },
      { toast: 'fine' },
    ]);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['altro stato', 'ancora', 'grande', 'fine']);

    fakes.toasts = [];
    const ok = await runSteps(rt, [{ if: '{{ nonEsiste.campo }}', then: { toast: 'no' }, else: { toast: 'nemmeno' } }, { toast: 'dopo' }]);
    expect(ok).toBe(false);
    expect(fakes.toasts).toEqual([{ message: 'Operazione non riuscita', kind: 'error' }]);
    // Il valore deve essere vero o falso: una stringa non basta.
    fakes.toasts = [];
    expect(await runSteps(rt, [{ if: "{{ 'sì' }}", then: { toast: 'no' } }])).toBe(false);
    expect(fakes.reports.map((r) => r.error)).toContain('la condizione non è vera né falsa');
  });

  it('run: sequenze con nome con le variabili del punto in cui si richiamano; sconosciute o in ciclo si fermano', async () => {
    fakes.respond = () => ({ id: 3 });
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ run: 'salvaOrdine' }, { run: 'avvisa' }], { form: { cliente: 'Bianchi' } })).toBe(true);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Ordine 3 salvato', 'Ciao Bianchi']);
    // Le variabili di una sequenza con nome restano sue.
    fakes.toasts = [];
    await runSteps(rt, [{ run: 'salvaOrdine' }, { toast: '{{ has(creato) }}' }]);
    expect(fakes.toasts.at(-1)?.message).toBe('{{ has(creato) }}');

    fakes.toasts = [];
    expect(await runSteps(rt, [{ run: 'manca' }, { toast: 'dopo' }])).toBe(false);
    expect(await runSteps(rt, [{ run: 'ciclo' }])).toBe(false);
    expect(fakes.toasts.map((t) => t.kind)).toEqual(['error', 'error']);
    expect(fakes.reports.map((r) => r.error)).toEqual(expect.arrayContaining(['sequenza sconosciuta', "sequenze richiamate una dentro l'altra troppe volte"]));
  });

  it('onError vede error.status (dal client dei servizi o dal codice in testa al messaggio), mai il messaggio del server', async () => {
    const rt = fakes.runtime(screen, injector);
    const handler = [
      { if: '{{ error.status == 409 }}', then: { toast: 'Già approvato' }, else: { toast: 'Errore {{ error.status }}' } },
      { toast: '{{ has(error.message) }}' },
    ];
    fakes.respond = () => {
      throw new HttpError(409);
    };
    expect(await runSteps(rt, [{ call: 'approva', args: { id: 1 }, onError: handler }, { toast: 'non arriva' }])).toBe(false);
    fakes.respond = () => {
      throw new Error('404 GET /api/ordini/1/approva');
    };
    await runSteps(rt, [{ call: 'approva', args: { id: 1 }, onError: handler }]);
    fakes.respond = () => {
      throw new TypeError('Failed to fetch');
    };
    await runSteps(rt, [{ call: 'approva', args: { id: 1 }, onError: handler }]);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Già approvato', 'false', 'Errore 404', 'false', 'Errore 0', 'false']);
  });
});
