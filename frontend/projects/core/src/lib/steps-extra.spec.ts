import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition } from 'schema';
import { vi } from 'vitest';
import { runSteps } from './action-engine';
import { csvFileName, rowsOf, toCsv } from './csv';
import { Fakes } from './testing';

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'prova',
  dataSources: { invoices: { type: 'rest', method: 'GET', url: '/api/invoices', params: { status: '{{ status }}' } } },
  components: [],
};

describe('CSV', () => {
  it('semicolons, BOM, quotes when needed and neutralised formulas', () => {
    const csv = toCsv(['Number', 'Notes'], [
      ['FT-1', 'semplice'],
      ['FT-2', 'con; punto e virgola'],
      ['FT-3', 'con "virgolette"'],
      ['=1+1', '@SOMMA(A1)'],
      [-5, null],
      [true, { a: 1 }],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Number;Notes',
      'FT-1;semplice',
      'FT-2;"con; punto e virgola"',
      'FT-3;"con ""virgolette"""',
      "'=1+1;'@SOMMA(A1)",
      "'-5;",
      'true;"{""a"":1}"',
      '',
    ]);
  });

  it('safe file names and rows from lists or pages', () => {
    expect(csvFileName(undefined)).toBe('export.csv');
    expect(csvFileName('invoices 2026')).toBe('invoices 2026.csv');
    expect(csvFileName('../../x<y>.CSV')).toBe('....xy.CSV');
    expect(rowsOf([{ a: 1 }, 2, null])).toEqual([{ a: 1 }]);
    expect(rowsOf({ items: [{ a: 1 }], total: 1 })).toEqual([{ a: 1 }]);
    expect(rowsOf('x')).toEqual([]);
  });
});

describe('validate, print and export steps', () => {
  let fakes: Fakes;
  let injector: Injector;
  beforeEach(() => {
    fakes = new Fakes();
    injector = TestBed.inject(Injector);
  });
  afterEach(() => vi.restoreAllMocks());

  it('validate checks all the fields of the group (without stopping at the first) and stops the sequence if one is not valid', async () => {
    const rt = fakes.runtime(screen, injector);
    const checked: string[] = [];
    let nomeOk = false;
    rt.registerValidator('ordine', () => (checked.push('nome'), nomeOk));
    rt.registerValidator('ordine', () => (checked.push('email'), true));
    const off = rt.registerValidator('altro', () => (checked.push('altro'), false));
    expect(await runSteps(rt, [{ validate: 'ordine' }, { toast: 'inviato' }])).toBe(false);
    expect(checked).toEqual(['nome', 'email']);
    expect(fakes.toasts).toEqual([{ message: 'Check the highlighted fields', kind: 'error' }]);
    nomeOk = true;
    expect(await runSteps(rt, [{ validate: 'ordine' }, { toast: 'inviato' }])).toBe(true);
    // * = all the groups; a removed field no longer counts.
    expect(await runSteps(rt, [{ validate: '*' }])).toBe(false);
    off();
    expect(await runSteps(rt, [{ validate: '*' }])).toBe(true);
    // A group without fields is valid.
    expect(await runSteps(rt, [{ validate: 'vuoto' }])).toBe(true);
    rt.destroy();
  });

  it('print opens the browser print dialog', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ print: true }])).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    rt.destroy();
  });

  it('export downloads the CSV of the data source rows with translated headers', async () => {
    const saved: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => (saved.push(blob as Blob), 'blob:x'));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    fakes.respond = () => ({ items: [{ number: 'FT-1', amount: 10.5, customer: 'Smith' }], total: 1 });
    const rt = fakes.runtime(screen, injector);
    const ok = await runSteps(rt, [{ export: { source: 'invoices', fileName: 'invoices', args: { status: 'draft' }, columns: [{ field: 'number', label: "{{ t('x', 'Number') }}" }, { field: 'amount' }] } }]);
    expect(ok).toBe(true);
    expect(fakes.requests.at(-1)).toEqual({ method: 'GET', url: '/api/invoices', query: { status: 'draft' } });
    expect(clicks).toEqual(['invoices.csv']);
    // The BOM is in the bytes (text() removes it while decoding).
    expect([...new Uint8Array(await saved[0].arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await saved[0].text()).toBe('Number;amount\r\nFT-1;10.5\r\n');
    rt.destroy();
  });

  it('export: if the data source fails the sequence stops with a generic message', async () => {
    fakes.respond = () => {
      throw new Error('500');
    };
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ export: { source: 'invoices', columns: [{ field: 'number' }] } }, { toast: 'after' }])).toBe(false);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Operation failed']);
    rt.destroy();
  });
});
