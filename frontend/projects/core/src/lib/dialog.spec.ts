import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition, Step } from 'schema';
import { runSteps } from './action-engine';
import { ScreenRuntime } from './screen-runtime';
import { Fakes } from './testing';

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'order-list',
  dataSources: { note: { type: 'rest', method: 'POST', url: '/api/orders/{{id}}/note', body: { text: '{{ form.text }}' } } },
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
        title: 'Note for {{ row.number }}',
        fields: [{ name: 'text', type: 'textarea', required: true }],
        initial: { text: '{{ row.note }}' },
        onSubmit: [{ call: 'note', args: { id: '{{ row.id }}' } }],
      },
    },
    { toast: 'Nota salvata' },
  ];
  const scope = { row: { id: 7, number: 'ORD-0007', note: 'old' } };

  it('opens the window with resolved title, form and submit action; if the submit succeeds the sequence goes on', async () => {
    fakes.dialogValues.push({ text: 'new' });
    expect(await runSteps(rt, steps, scope)).toBe(true);
    const request = fakes.dialogs[0];
    expect(request.title).toBe('Note for ORD-0007');
    expect(request.form.fields.map((f) => f.name)).toEqual(['text']);
    expect(request.form.initial).toEqual({ text: '{{ row.note }}' });
    expect(request.form.actions?.[0].label).toBe('Confirm');
    expect(request.scope).toEqual(scope);
    expect(fakes.requests).toEqual([{ method: 'POST', url: '/api/orders/7/note', body: { text: 'new' } }]);
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
