import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DataRequest } from './ports';
import type { ScreenDefinition } from 'schema';
import { runSteps } from './action-engine';
import { Fakes } from './testing';

/** Error like the one of the services data client: with the HTTP code and without the server text. */
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

describe('steps before and after a call', () => {
  let fakes: Fakes;
  let injector: Injector;
  beforeEach(() => {
    fakes = new Fakes();
    injector = TestBed.inject(Injector);
  });

  it('as: the response of the call is visible to the following steps (and only to them)', async () => {
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

  it('if: then or else according to the condition; a condition that cannot be evaluated stops everything (fail-closed)', async () => {
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
    const ok = await runSteps(rt, [{ if: '{{ missing.field }}', then: { toast: 'no' }, else: { toast: 'neither' } }, { toast: 'after' }]);
    expect(ok).toBe(false);
    expect(fakes.toasts).toEqual([{ message: 'Operation failed', kind: 'error' }]);
    // The value must be true or false: a string is not enough.
    fakes.toasts = [];
    expect(await runSteps(rt, [{ if: "{{ 'yes' }}", then: { toast: 'no' } }])).toBe(false);
    expect(fakes.reports.map((r) => r.error)).toContain('the condition is neither true nor false');
  });

  it('run: named sequences with the variables of the point where they are called; unknown or cyclic ones stop', async () => {
    fakes.respond = () => ({ id: 3 });
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ run: 'salvaOrdine' }, { run: 'avvisa' }], { form: { cliente: 'Bianchi' } })).toBe(true);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Ordine 3 salvato', 'Ciao Bianchi']);
    // The variables of a named sequence stay its own.
    fakes.toasts = [];
    await runSteps(rt, [{ run: 'salvaOrdine' }, { toast: '{{ has(creato) }}' }]);
    expect(fakes.toasts.at(-1)?.message).toBe('{{ has(creato) }}');

    fakes.toasts = [];
    expect(await runSteps(rt, [{ run: 'manca' }, { toast: 'after' }])).toBe(false);
    expect(await runSteps(rt, [{ run: 'ciclo' }])).toBe(false);
    expect(fakes.toasts.map((t) => t.kind)).toEqual(['error', 'error']);
    expect(fakes.reports.map((r) => r.error)).toEqual(expect.arrayContaining(['unknown sequence', 'sequences called one inside the other too many times']));
  });

  it('onError sees error.status (from the services client or from the code at the start of the message), never the server message', async () => {
    const rt = fakes.runtime(screen, injector);
    const handler = [
      { if: '{{ error.status == 409 }}', then: { toast: 'Already approved' }, else: { toast: 'Error {{ error.status }}' } },
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
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Already approved', 'false', 'Error 404', 'false', 'Error 0', 'false']);
  });
});
