import type { NodeDefinition } from 'schema';
import { columnTexts, plain, renderScreen } from './screen-testing';
import { aggregate } from './table-data';

describe('formato numerico, celle cliccabili e riga dei totali', () => {
  it('aggrega solo i valori numerici e non restituisce mai NaN', () => {
    const rows = [{ v: 10 }, { v: '5' }, { v: null }, { v: 'x' }, { v: 30 }];
    expect(aggregate(rows, 'v', 'sum')).toBe(45);
    expect(aggregate(rows, 'v', 'avg')).toBe(15);
    expect(aggregate(rows, 'v', 'min')).toBe(5);
    expect(aggregate(rows, 'v', 'max')).toBe(30);
    expect(aggregate(rows, 'v', 'count')).toBe(4);
    expect(aggregate([{ v: null }], 'v', 'sum')).toBeNull();
    expect(aggregate([], 'v', 'count')).toBe(0);
  });

  const rows = [
    { id: 1, numero: 'O-1', pezzi: 1200.5, importo: 100, sconto: 10 },
    { id: 2, numero: 'O-2', pezzi: 3, importo: 250.25, sconto: 20 },
  ];
  const table: NodeDefinition = {
    type: 'table',
    source: 'dati',
    columns: [
      { field: 'numero', label: 'Numero', onClick: [{ navigate: 'ordine', params: { id: '{{ row.id }}' } }] },
      { field: 'pezzi', label: 'Pezzi', format: 'number', decimals: 1, aggregate: 'sum' },
      { field: 'importo', label: 'Importo', format: 'currency', aggregate: 'sum' },
      { field: 'sconto', label: 'Sconto', format: 'percent', aggregate: 'avg' },
      { field: 'id', label: 'Righe', aggregate: 'count' },
    ],
  };
  const dataSources = { dati: { type: 'rest' as const, method: 'GET' as const, url: '/api/dati' } };

  it('numeri formattati e allineati a destra, totali con il formato della colonna', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 2, 'righe');
    expect(columnTexts(h.el, 1)).toEqual(['1200,5', '3,0']);
    expect(h.el.querySelector('tbody td:nth-child(2)')?.getAttribute('style') ?? h.el.querySelector('tbody td:nth-child(2)')?.className).toContain('right');
    const totals = [...h.el.querySelectorAll('tfoot tr.totals td')].map((td) => plain(td.textContent));
    expect(totals).toEqual(['Totale', '1203,5', '350,25 €', 'Media 15 %', 'N. 2']);
  });

  it('il valore di una colonna con onClick è un pulsante che esegue i passi con la riga', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 2, 'righe');
    const links = [...h.el.querySelectorAll<HTMLButtonElement>('tbody button.cell-link')];
    expect(links.map((b) => plain(b.textContent))).toEqual(['O-1', 'O-2']);
    links[1].click();
    await h.until(() => h.navigations.length === 1, 'navigazione');
    expect(h.navigations).toEqual([{ screen: 'ordine', params: { id: 2 } }]);
  });

  it('senza colonne aggregate non c’è la riga dei totali', async () => {
    const h = await renderScreen({
      components: [{ type: 'table', source: 'dati', columns: [{ field: 'numero' }] }],
      dataSources,
      respond: () => rows,
    });
    await h.until(() => columnTexts(h.el, 0).length === 2, 'righe');
    expect(h.el.querySelector('tfoot')).toBeNull();
  });
});
