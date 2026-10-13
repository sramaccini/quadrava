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
  dataSources: { fatture: { type: 'rest', method: 'GET', url: '/api/fatture', params: { stato: '{{ stato }}' } } },
  components: [],
};

describe('CSV', () => {
  it('punto e virgola, BOM, virgolette quando servono e formule neutralizzate', () => {
    const csv = toCsv(['Numero', 'Nota'], [
      ['FT-1', 'semplice'],
      ['FT-2', 'con; punto e virgola'],
      ['FT-3', 'con "virgolette"'],
      ['=1+1', '@SOMMA(A1)'],
      [-5, null],
      [true, { a: 1 }],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Numero;Nota',
      'FT-1;semplice',
      'FT-2;"con; punto e virgola"',
      'FT-3;"con ""virgolette"""',
      "'=1+1;'@SOMMA(A1)",
      "'-5;",
      'true;"{""a"":1}"',
      '',
    ]);
  });

  it('nomi di file sicuri e righe da elenchi o pagine', () => {
    expect(csvFileName(undefined)).toBe('export.csv');
    expect(csvFileName('fatture 2026')).toBe('fatture 2026.csv');
    expect(csvFileName('../../x<y>.CSV')).toBe('....xy.CSV');
    expect(rowsOf([{ a: 1 }, 2, null])).toEqual([{ a: 1 }]);
    expect(rowsOf({ items: [{ a: 1 }], total: 1 })).toEqual([{ a: 1 }]);
    expect(rowsOf('x')).toEqual([]);
  });
});

describe('passi validate, print ed export', () => {
  let fakes: Fakes;
  let injector: Injector;
  beforeEach(() => {
    fakes = new Fakes();
    injector = TestBed.inject(Injector);
  });
  afterEach(() => vi.restoreAllMocks());

  it('validate controlla tutti i campi del gruppo (senza fermarsi al primo) e ferma la sequenza se uno non è valido', async () => {
    const rt = fakes.runtime(screen, injector);
    const checked: string[] = [];
    let nomeOk = false;
    rt.registerValidator('ordine', () => (checked.push('nome'), nomeOk));
    rt.registerValidator('ordine', () => (checked.push('email'), true));
    const off = rt.registerValidator('altro', () => (checked.push('altro'), false));
    expect(await runSteps(rt, [{ validate: 'ordine' }, { toast: 'inviato' }])).toBe(false);
    expect(checked).toEqual(['nome', 'email']);
    expect(fakes.toasts).toEqual([{ message: 'Controlla i campi evidenziati', kind: 'error' }]);
    nomeOk = true;
    expect(await runSteps(rt, [{ validate: 'ordine' }, { toast: 'inviato' }])).toBe(true);
    // * = tutti i gruppi; un campo tolto non conta più.
    expect(await runSteps(rt, [{ validate: '*' }])).toBe(false);
    off();
    expect(await runSteps(rt, [{ validate: '*' }])).toBe(true);
    // Un gruppo senza campi è valido.
    expect(await runSteps(rt, [{ validate: 'vuoto' }])).toBe(true);
    rt.destroy();
  });

  it('print apre la stampa del browser', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ print: true }])).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    rt.destroy();
  });

  it('export scarica il CSV delle righe del data source con le intestazioni tradotte', async () => {
    const saved: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => (saved.push(blob as Blob), 'blob:x'));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    fakes.respond = () => ({ items: [{ numero: 'FT-1', importo: 10.5, cliente: 'Rossi' }], total: 1 });
    const rt = fakes.runtime(screen, injector);
    const ok = await runSteps(rt, [{ export: { source: 'fatture', fileName: 'fatture', args: { stato: 'bozza' }, columns: [{ field: 'numero', label: "{{ t('x', 'Numero') }}" }, { field: 'importo' }] } }]);
    expect(ok).toBe(true);
    expect(fakes.requests.at(-1)).toEqual({ method: 'GET', url: '/api/fatture', query: { stato: 'bozza' } });
    expect(clicks).toEqual(['fatture.csv']);
    // Il BOM c'è nei byte (text() lo toglie decodificando).
    expect([...new Uint8Array(await saved[0].arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await saved[0].text()).toBe('Numero;importo\r\nFT-1;10.5\r\n');
    rt.destroy();
  });

  it('export: se il data source fallisce la sequenza si ferma con un messaggio generico', async () => {
    fakes.respond = () => {
      throw new Error('500');
    };
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ export: { source: 'fatture', columns: [{ field: 'numero' }] } }, { toast: 'dopo' }])).toBe(false);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Operazione non riuscita']);
    rt.destroy();
  });
});
