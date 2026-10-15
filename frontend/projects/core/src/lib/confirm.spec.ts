import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition } from 'schema';
import { runSteps } from './action-engine';
import { ScreenRuntime } from './screen-runtime';
import { Fakes } from './testing';

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'ordini-elenco',
  dataSources: { approva: { type: 'rest', method: 'POST', url: '/api/ordini/{{id}}/approva' } },
  components: [
    { type: 'filterBar', bind: 'state.filtri', fields: [{ name: 'stato', type: 'select', options: ['a'] }] },
    { type: 'tabs', tabs: [{ label: 'Uno', components: [{ type: 'filterBar', bind: 'state.altri', fields: [{ name: 'cliente', type: 'text' }] }] }] },
  ],
};

describe('confirm step', () => {
  let fakes: Fakes;
  let rt: ScreenRuntime;

  beforeEach(() => {
    fakes = new Fakes();
    rt = fakes.runtime(screen, TestBed.inject(Injector));
  });
  afterEach(() => rt.destroy());

  const steps = [{ confirm: "Approvare l'ordine {{row.numero}}?" }, { call: 'approva', args: { id: '{{row.id}}' } }, { toast: 'Fatto' }] as const;
  const scope = { row: { id: 7, numero: 'ORD-0007' } };

  it('if the user confirms, it shows the text with the values and goes on', async () => {
    fakes.confirmAnswers.push(true);
    expect(await runSteps(rt, [...steps], scope)).toBe(true);
    expect(fakes.confirmations).toEqual(["Approvare l'ordine ORD-0007?"]);
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Fatto']);
  });

  it('if the user gives up, it stops the sequence without calls and without error messages', async () => {
    fakes.confirmAnswers.push(false);
    expect(await runSteps(rt, [...steps], scope)).toBe(false);
    expect(fakes.requests).toEqual([]);
    expect(fakes.toasts).toEqual([]);
    expect(fakes.reports).toEqual([]);
  });

  it('without a confirmation service it does not go on and reports it (fail-closed)', async () => {
    const bare = new ScreenRuntime(screen, { ...fakes.deps, confirmation: null }, TestBed.inject(Injector));
    expect(await runSteps(bare, [...steps], scope)).toBe(false);
    expect(fakes.requests).toEqual([]);
    await Promise.resolve();
    expect(fakes.reports.map((r) => r.source)).toContain('confirm');
    bare.destroy();
  });

  it('a confirmation is requested every time the step runs', async () => {
    fakes.confirmAnswers.push(true, true);
    await runSteps(rt, [{ confirm: 'Sicuro?' }], {});
    await runSteps(rt, [{ confirm: 'Sicuro?' }], {});
    expect(fakes.confirmations).toHaveLength(2);
  });
});

describe('initial state of the filters', () => {
  it('filters inside tabs exist in the state from the start', () => {
    const fakes = new Fakes();
    const rt = fakes.runtime(screen, TestBed.inject(Injector));
    expect(rt.getState('state.filtri.stato')).toBeNull();
    expect(rt.getState('state.altri.cliente')).toBeNull();
    rt.destroy();
  });
});
