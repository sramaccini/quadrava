import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition, Step } from 'schema';
import { runSteps } from './action-engine';
import { ScreenRuntime } from './screen-runtime';
import { Fakes } from './testing';

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'ordini-elenco',
  dataSources: { nota: { type: 'rest', method: 'POST', url: '/api/ordini/{{id}}/nota', body: { testo: '{{ form.testo }}' } } },
  components: [],
};

describe('dialog step', () => {
  let fakes: Fakes;
  let rt: ScreenRuntime;

  beforeEach(() => {
    fakes = new Fakes();
    rt = fakes.runtime(screen, TestBed.inject(Injector));
  });
  afterEach(() => rt.destroy());

  const steps: Step[] = [
    {
      dialog: {
        title: 'Nota per {{ row.numero }}',
        fields: [{ name: 'testo', type: 'textarea', required: true }],
        initial: { testo: '{{ row.nota }}' },
        onSubmit: [{ call: 'nota', args: { id: '{{ row.id }}' } }],
      },
    },
    { toast: 'Nota salvata' },
  ];
  const scope = { row: { id: 7, numero: 'ORD-0007', nota: 'vecchia' } };

  it('opens the window with resolved title, form and submit action; if the submit succeeds the sequence goes on', async () => {
    fakes.dialogValues.push({ testo: 'nuova' });
    expect(await runSteps(rt, steps, scope)).toBe(true);
    const request = fakes.dialogs[0];
    expect(request.title).toBe('Nota per ORD-0007');
    expect(request.form.fields.map((f) => f.name)).toEqual(['testo']);
    expect(request.form.initial).toEqual({ testo: '{{ row.nota }}' });
    expect(request.form.actions?.[0].label).toBe('Confirm');
    expect(request.scope).toEqual(scope);
    expect(fakes.requests).toEqual([{ method: 'POST', url: '/api/ordini/7/nota', body: { testo: 'nuova' } }]);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Nota salvata']);
  });

  it('if the user cancels the sequence stops silently', async () => {
    expect(await runSteps(rt, steps, scope)).toBe(false);
    expect(fakes.requests).toEqual([]);
    expect(fakes.toasts).toEqual([]);
  });

  it('without a window service it does not go on and reports it', async () => {
    const plain = new ScreenRuntime(screen, { ...fakes.deps, formDialog: null }, TestBed.inject(Injector));
    expect(await runSteps(plain, steps, scope)).toBe(false);
    await Promise.resolve();
    expect(fakes.reports.map((r) => r.source)).toContain('dialog');
    plain.destroy();
  });
});
