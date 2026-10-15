import type { NodeDefinition } from 'schema';
import { columnTexts, plain, renderScreen } from './screen-testing';
import { aggregate } from './table-data';

describe('number format, clickable cells and totals row', () => {
  it('aggregates only numeric values and never returns NaN', () => {
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
    { id: 1, number: 'O-1', pieces: 1200.5, amount: 100, discount: 10 },
    { id: 2, number: 'O-2', pieces: 3, amount: 250.25, discount: 20 },
  ];
  const table: NodeDefinition = {
    type: 'table',
    source: 'data',
    columns: [
      { field: 'number', label: 'Number', onClick: [{ navigate: 'order', params: { id: '{{ row.id }}' } }] },
      { field: 'pieces', label: 'Pieces', format: 'number', decimals: 1, aggregate: 'sum' },
      { field: 'amount', label: 'Amount', format: 'currency', aggregate: 'sum' },
      { field: 'discount', label: 'Discount', format: 'percent', aggregate: 'avg' },
      { field: 'id', label: 'Rows', aggregate: 'count' },
    ],
  };
  const dataSources = { data: { type: 'rest' as const, method: 'GET' as const, url: '/api/data' } };

  it('numbers formatted and right-aligned, totals with the format of the column', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 2, 'rows');
    expect(columnTexts(h.el, 1)).toEqual(['1200,5', '3,0']);
    expect(h.el.querySelector('tbody td:nth-child(2)')?.getAttribute('style') ?? h.el.querySelector('tbody td:nth-child(2)')?.className).toContain('right');
    const totals = [...h.el.querySelectorAll('tfoot tr.totals td')].map((td) => plain(td.textContent));
    expect(totals).toEqual(['Totale', '1203,5', '350,25 €', 'Media 15 %', 'N. 2']);
  });

  it('the value of a column with onClick is a button running the steps with the row', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 2, 'rows');
    const links = [...h.el.querySelectorAll<HTMLButtonElement>('tbody button.cell-link')];
    expect(links.map((b) => plain(b.textContent))).toEqual(['O-1', 'O-2']);
    links[1].click();
    await h.until(() => h.navigations.length === 1, 'navigation');
    expect(h.navigations).toEqual([{ screen: 'order', params: { id: 2 } }]);
  });

  it('without aggregated columns there is no totals row', async () => {
    const h = await renderScreen({
      components: [{ type: 'table', source: 'data', columns: [{ field: 'number' }] }],
      dataSources,
      respond: () => rows,
    });
    await h.until(() => columnTexts(h.el, 0).length === 2, 'rows');
    expect(h.el.querySelector('tfoot')).toBeNull();
  });
});
