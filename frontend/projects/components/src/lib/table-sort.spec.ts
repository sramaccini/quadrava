import type { NodeDefinition } from 'schema';
import { columnTexts, renderScreen } from './screen-testing';
import { compareValues, sortRows } from './table-data';

describe('table sorting', () => {
  describe('comparison functions', () => {
    it('numbers as numbers, texts in natural order, empty values last', () => {
      expect(compareValues(2, 10)).toBeLessThan(0);
      expect(compareValues('FT-2', 'FT-10')).toBeLessThan(0);
      expect(compareValues('àbaco', 'Zeta')).toBeLessThan(0);
      expect(compareValues(null, 'a')).toBeGreaterThan(0);
      expect(compareValues(false, true)).toBeLessThan(0);
    });

    it('sorts stably and keeps empty values last even when descending', () => {
      const rows = [{ n: 2, id: 'a' }, { n: null, id: 'b' }, { n: 1, id: 'c' }, { n: 2, id: 'd' }];
      expect(sortRows(rows, { field: 'n', direction: 'asc' }).map((r) => r['id'])).toEqual(['c', 'a', 'd', 'b']);
      expect(sortRows(rows, { field: 'n', direction: 'desc' }).map((r) => r['id'])).toEqual(['a', 'd', 'c', 'b']);
      expect(rows.map((r) => r['id'])).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  const rows = [
    { number: 'B-2', amount: 30 },
    { number: 'A-10', amount: 5 },
    { number: 'A-9', amount: 120 },
  ];
  const header = (el: HTMLElement, text: string): HTMLElement =>
    [...el.querySelectorAll<HTMLElement>('nz-table th')].find((th) => th.textContent?.trim() === text)!;
  const clickSorter = (th: HTMLElement): void => th.click();

  it('without server-side paging it sorts in the page and cycles ascending, descending, none', async () => {
    const table: NodeDefinition = {
      type: 'table',
      source: 'data',
      columns: [{ field: 'number', label: 'Number', sortable: true }, { field: 'amount', label: 'Amount', sortable: true }, { field: 'note', label: 'Notes' }],
    };
    const h = await renderScreen({ components: [table], dataSources: { data: { type: 'rest', method: 'GET', url: '/api/data' } }, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 3, 'rows');
    expect(columnTexts(h.el, 0)).toEqual(['B-2', 'A-10', 'A-9']);
    const number = header(h.el, 'Number');
    expect(number.getAttribute('aria-sort')).toBe('none');
    expect(header(h.el, 'Notes').getAttribute('aria-sort')).toBeNull();
    clickSorter(number);
    await h.settle();
    expect(columnTexts(h.el, 0)).toEqual(['A-9', 'A-10', 'B-2']);
    expect(number.getAttribute('aria-sort')).toBe('ascending');
    clickSorter(number);
    await h.settle();
    expect(columnTexts(h.el, 0)).toEqual(['B-2', 'A-10', 'A-9']);
    expect(number.getAttribute('aria-sort')).toBe('descending');
    clickSorter(header(h.el, 'Amount'));
    await h.settle();
    expect(columnTexts(h.el, 1)).toEqual(['5', '30', '120']);
    expect(number.getAttribute('aria-sort')).toBe('none');
    // A single request: sorting in the page does not reload the data.
    expect(h.requests).toHaveLength(1);
  });

  it('with server-side paging it writes the sorting to the state, the service receives it and the first page is shown again', async () => {
    const table: NodeDefinition = {
      type: 'table',
      source: 'data',
      sort: { bind: 'state.sorting', default: { field: 'number', direction: 'desc' } },
      columns: [{ field: 'number', label: 'Number', sortable: true }, { field: 'amount', label: 'Amount', sortable: true }],
    };
    const h = await renderScreen({
      components: [table],
      dataSources: {
        data: {
          type: 'rest', method: 'GET', url: '/api/data', paging: 'server',
          params: { sort: '{{state.sorting.field}}', dir: '{{state.sorting.direction}}', page: '{{state.page}}' },
        },
      },
      respond: () => ({ items: rows, total: 30, size: 3 }),
    });
    await h.until(() => columnTexts(h.el, 0).length === 3, 'rows');
    // The first load already has the default sorting; the order of the rows is the service's.
    expect(h.requests[0].query).toEqual({ sort: 'number', dir: 'desc', page: 0 });
    expect(columnTexts(h.el, 0)).toEqual(['B-2', 'A-10', 'A-9']);
    expect(header(h.el, 'Number').getAttribute('aria-sort')).toBe('descending');
    // Page 2, then a new sorting: back to the first page.
    (h.el.querySelectorAll('.ant-pagination-item')[1] as HTMLElement).click();
    await h.until(() => h.requests.at(-1)?.query?.['page'] === 1, 'second page');
    clickSorter(header(h.el, 'Amount'));
    await h.until(() => h.requests.at(-1)?.query?.['sort'] === 'amount', 'new sorting');
    expect(h.requests.at(-1)?.query).toEqual({ sort: 'amount', dir: 'asc', page: 0 });
    expect(h.reports).toEqual([]);
  });
});
