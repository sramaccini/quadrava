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

describe('passo confirm', () => {
  let fakes: Fakes;
  let rt: ScreenRuntime;

  beforeEach(() => {
    fakes = new Fakes();
    rt = fakes.runtime(screen, TestBed.inject(Injector));
  });
  afterEach(() => rt.destroy());

  const steps = [{ confirm: "Approvare l'ordine {{row.numero}}?" }, { call: 'approva', args: { id: '{{row.id}}' } }, { toast: 'Fatto' }] as const;
  const scope = { row: { id: 7, numero: 'ORD-0007' } };

  it('se l’utente conferma, mostra il testo con i valori e prosegue', async () => {
    fakes.confirmAnswers.push(true);
    expect(await runSteps(rt, [...steps], scope)).toBe(true);
    expect(fakes.confirmations).toEqual(["Approvare l'ordine ORD-0007?"]);
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Fatto']);
  });

  it('se l’utente rinuncia, ferma la sequenza senza chiamate e senza messaggi di errore', async () => {
    fakes.confirmAnswers.push(false);
    expect(await runSteps(rt, [...steps], scope)).toBe(false);
    expect(fakes.requests).toEqual([]);
    expect(fakes.toasts).toEqual([]);
    expect(fakes.reports).toEqual([]);
  });

  it('senza servizio di conferma non procede e lo segnala (fail-closed)', async () => {
    const bare = new ScreenRuntime(screen, { ...fakes.deps, confirmation: null }, TestBed.inject(Injector));
    expect(await runSteps(bare, [...steps], scope)).toBe(false);
    expect(fakes.requests).toEqual([]);
    await Promise.resolve();
    expect(fakes.reports.map((r) => r.source)).toContain('confirm');
    bare.destroy();
  });

  it('una conferma è richiesta ogni volta che il passo viene eseguito', async () => {
    fakes.confirmAnswers.push(true, true);
    await runSteps(rt, [{ confirm: 'Sicuro?' }], {});
    await runSteps(rt, [{ confirm: 'Sicuro?' }], {});
    expect(fakes.confirmations).toHaveLength(2);
  });
});

describe('stato iniziale dei filtri', () => {
  it('i filtri dentro le schede esistono nello stato fin dall’inizio', () => {
    const fakes = new Fakes();
    const rt = fakes.runtime(screen, TestBed.inject(Injector));
    expect(rt.getState('state.filtri.stato')).toBeNull();
    expect(rt.getState('state.altri.cliente')).toBeNull();
    rt.destroy();
  });
});
