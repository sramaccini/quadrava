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
  screen: 'test',
  dataSources: {
    create: { type: 'rest', method: 'POST', url: '/api/orders', body: '{{ form }}' },
    detail: { type: 'rest', method: 'GET', url: '/api/orders/{{ id }}' },
    approve: { type: 'rest', method: 'POST', url: '/api/orders/{{ id }}/approve' },
  },
  actions: {
    saveOrder: [{ call: 'create', as: 'created' }, { toast: 'Order {{ created.id }} saved' }],
    notify: { toast: 'Hello {{ form.customer }}' },
    loop: { run: 'loop' },
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
    fakes.respond = (r: DataRequest) => (r.method === 'POST' ? { id: 42, status: 'draft' } : {});
    const rt = fakes.runtime(screen, injector);
    const ok = await runSteps(rt, [
      { toast: 'before: {{ has(created) }}' },
      { call: 'create', as: 'created' },
      { toast: 'created {{ created.id }} in {{ created.status }}' },
      { call: 'detail', args: { id: '{{ created.id }}' } },
    ], { form: { customer: 'Smith' } });
    expect(ok).toBe(true);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['before: {{ has(created) }}', 'created 42 in draft']);
    expect(fakes.requests.map((r) => `${r.method} ${r.url}`)).toEqual(['POST /api/orders', 'GET /api/orders/42']);
  });

  it('if: then or else according to the condition; a condition that cannot be evaluated stops everything (fail-closed)', async () => {
    fakes.respond = () => ({ id: 7, status: 'submitted' });
    const rt = fakes.runtime(screen, injector);
    await runSteps(rt, [
      { call: 'create', as: 'created' },
      { if: "{{ created.status == 'draft' }}", then: { toast: 'draft' }, else: [{ toast: 'other status' }, { toast: 'again' }] },
      { if: '{{ created.id > 5 }}', then: { toast: 'big' } },
      { if: '{{ created.id < 5 }}', then: { toast: 'small' } },
      { toast: 'end' },
    ]);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['other status', 'again', 'big', 'end']);

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
    expect(await runSteps(rt, [{ run: 'saveOrder' }, { run: 'notify' }], { form: { customer: 'Baker' } })).toBe(true);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Order 3 saved', 'Hello Baker']);
    // The variables of a named sequence stay its own.
    fakes.toasts = [];
    await runSteps(rt, [{ run: 'saveOrder' }, { toast: '{{ has(created) }}' }]);
    expect(fakes.toasts.at(-1)?.message).toBe('{{ has(created) }}');

    fakes.toasts = [];
    expect(await runSteps(rt, [{ run: 'missing' }, { toast: 'after' }])).toBe(false);
    expect(await runSteps(rt, [{ run: 'loop' }])).toBe(false);
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
    expect(await runSteps(rt, [{ call: 'approve', args: { id: 1 }, onError: handler }, { toast: 'not reached' }])).toBe(false);
    fakes.respond = () => {
      throw new Error('404 GET /api/orders/1/approve');
    };
    await runSteps(rt, [{ call: 'approve', args: { id: 1 }, onError: handler }]);
    fakes.respond = () => {
      throw new TypeError('Failed to fetch');
    };
    await runSteps(rt, [{ call: 'approve', args: { id: 1 }, onError: handler }]);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Already approved', 'false', 'Error 404', 'false', 'Error 0', 'false']);
  });
});
