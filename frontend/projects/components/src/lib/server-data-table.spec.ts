import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { stubViewportHeight } from './select-testing';
import type { ServerTableRequest } from './server-data-table.component';
import { aggregate, distinctValues, filterRows, groupRows, sortRows, type ColumnFilter, type Row } from './table-data';

/** Fake service honouring the serverDataTable contract, computed with the pure functions of the datatable. */
function fakeServer(rows: Row[]): (r: DataRequest) => unknown {
  return (r) => {
    const req = r.body as unknown as ServerTableRequest;
    const filters = Object.fromEntries(req.filters.map(({ field, ...f }) => [field, f as ColumnFilter]));
    let matching = filterRows(rows, filters, (row, f) => String(row[f] ?? ''));
    for (const { field, value } of req.groupPath) matching = matching.filter((row) => row[field] === value);
    if (req.distinct) return { values: distinctValues(matching, req.distinct) };
    const totals = { amount: aggregate(matching, 'amount', 'sum') };
    const slice = <T,>(items: T[]): T[] => items.slice(req.page * req.size, req.page * req.size + req.size);
    if (req.groupPath.length < req.groupBy.length) {
      const groups = groupRows(matching, [req.groupBy[req.groupPath.length]]).map((g) => ({ value: g.value, count: g.rows.length, aggregates: { amount: aggregate(g.rows, 'amount', 'sum') } }));
      return { groups: slice(groups), total: groups.length, totals };
    }
    const sorted = sortRows(matching, req.sort);
    return { items: slice(sorted), total: sorted.length, totals };
  };
}

describe('serverDataTable', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    account: ['Bank', 'Cash'][i % 2],
    category: ['Rent', 'Expenses', 'Receipts'][i % 3],
    amount: (i + 1) * 10,
    note: `Transaction ${i + 1}`,
  }));
  const table = (extra: Record<string, unknown> = {}): NodeDefinition =>
    ({
      type: 'serverDataTable',
      source: 'search',
      pageSize: 5,
      columns: [
        { field: 'note', label: 'Note', filter: 'text', sortable: true },
        { field: 'account', label: 'Account', filter: 'select', groupable: true },
        { field: 'category', label: 'Category', groupable: true },
        { field: 'amount', label: 'Amount', format: 'currency', sortable: true, filter: 'number', aggregate: 'sum' },
      ],
      ...extra,
    }) as NodeDefinition;
  const dataSources = { search: { type: 'rest' as const, method: 'POST' as const, url: '/api/search', body: '{{ request }}' } };
  const render = (extra: Record<string, unknown> = {}, respond = fakeServer(rows), components?: NodeDefinition[]): Promise<ScreenHarness> =>
    renderScreen({ components: components ?? [table(extra)], dataSources, respond });
  const body = (h: ScreenHarness): string[][] =>
    [...h.el.querySelectorAll('lc-server-data-table tbody tr:not(.ant-table-placeholder)')].map((tr) => [...tr.querySelectorAll('td')].map((td) => plain(td.textContent)));
  const count = (h: ScreenHarness): string => plain(h.el.querySelector('lc-server-data-table .count')?.textContent);
  const lastRequest = (h: ScreenHarness): ServerTableRequest => h.requests.at(-1)!.body as unknown as ServerTableRequest;
  const header = (h: ScreenHarness, text: string): HTMLElement => [...h.el.querySelectorAll<HTMLElement>('lc-server-data-table th')].find((th) => plain(th.textContent).startsWith(text))!;

  it('asks the service for one page at a time; sorting and filters travel in the request and go back to the first page', async () => {
    const h = await render();
    await h.until(() => body(h).length === 5, 'first page');
    expect(lastRequest(h)).toEqual({ page: 0, size: 5, sort: null, filters: [], groupBy: [], groupPath: [] });
    expect(count(h)).toBe('12 righe');
    expect(plain(h.el.querySelector('lc-server-data-table tfoot')?.textContent)).toContain('780,00 €');
    (h.el.querySelectorAll('lc-server-data-table .ant-pagination-item')[2] as HTMLElement).click();
    await h.until(() => lastRequest(h).page === 2 && body(h).length === 2, 'third page');
    header(h, 'Amount').click();
    await h.until(() => lastRequest(h).sort?.field === 'amount', 'sorting');
    expect(lastRequest(h).page).toBe(0);
    header(h, 'Amount').click();
    await h.until(() => body(h)[0]?.[3] === '120,00 €', 'amount descending');
    (header(h, 'Note').querySelector('nz-filter-trigger span') as HTMLElement).click();
    await h.until(() => !!document.querySelector('.ant-dropdown .filter-panel input'), 'filter');
    const input = document.querySelector('.ant-dropdown .filter-panel input') as HTMLInputElement;
    input.value = 'Transaction 1';
    input.dispatchEvent(new Event('input'));
    await h.until(() => count(h) === '4 righe', 'text filter');
    expect(lastRequest(h).filters).toEqual([{ field: 'note', kind: 'text', text: 'Transaction 1' }]);
  });

  it('groups: the service gives counts and totals; an open group loads its rows in pages', async () => {
    const h = await render({ groupBy: ['account'] });
    await h.until(() => h.el.querySelectorAll('lc-server-data-table tr.group-row').length === 2, 'groups');
    expect(count(h)).toBe('2 gruppi');
    const groups = (): string[] => [...h.el.querySelectorAll('lc-server-data-table tr.group-row .group-label')].map((g) => plain(g.textContent));
    expect(groups()).toEqual(['Account: Bank (6)', 'Account: Cash (6)']);
    expect(plain(h.el.querySelectorAll('lc-server-data-table tr.group-row')[0].querySelectorAll('td')[3].textContent)).toBe('360,00 €');
    (h.el.querySelector('lc-server-data-table tr.group-row button.toggle') as HTMLButtonElement).click();
    await h.until(() => body(h).length === 2 + 5 + 1, 'rows of the group');
    expect(lastRequest(h).groupPath).toEqual([{ field: 'account', value: 'Bank' }]);
    const more = [...h.el.querySelectorAll<HTMLButtonElement>('lc-server-data-table tr.note-row button')][0];
    expect(plain(more.textContent)).toBe('Mostra altre (1 rimanenti)');
    more.click();
    await h.until(() => body(h).length === 2 + 6, 'all the rows of the group');
    expect(lastRequest(h).page).toBe(1);
  });

  it('the values of a choice filter come from the service, with the other filters applied', async () => {
    const h = await render();
    await h.until(() => body(h).length === 5, 'rows');
    (header(h, 'Account').querySelector('nz-filter-trigger span') as HTMLElement).click();
    await h.until(() => document.querySelectorAll('.ant-dropdown label[nz-checkbox]').length === 2, 'values');
    expect(lastRequest(h).distinct).toBe('account');
    ([...document.querySelectorAll<HTMLElement>('.ant-dropdown label[nz-checkbox]')][1].querySelector('input') as HTMLInputElement).click();
    await h.until(() => count(h) === '6 righe', 'choice filter');
    expect(lastRequest(h).filters).toEqual([{ field: 'account', kind: 'select', values: ['Cash'] }]);
  });

  it('an old response does not overwrite the most recent one; refresh on the data source repeats the request', async () => {
    let delay = 0;
    const server = fakeServer(rows);
    const respond = async (r: DataRequest): Promise<unknown> => {
      const wait = delay;
      if (wait) await new Promise((res) => setTimeout(res, wait));
      return server(r);
    };
    const h = await render({}, respond as never, [table(), { type: 'button', label: 'Reload', onClick: [{ refresh: 'search' }] }]);
    await h.until(() => body(h).length === 5, 'rows');
    delay = 300;
    (h.el.querySelectorAll('lc-server-data-table .ant-pagination-item')[1] as HTMLElement).click();
    await h.settle();
    delay = 0;
    (h.el.querySelectorAll('lc-server-data-table .ant-pagination-item')[2] as HTMLElement).click();
    await h.until(() => body(h).length === 2, 'third page');
    await new Promise((r) => setTimeout(r, 400));
    await h.settle();
    expect(body(h)).toHaveLength(2);
    const before = h.requests.length;
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Reload')) as HTMLButtonElement).click();
    await h.until(() => h.requests.length === before + 1, 'refresh');
    expect(lastRequest(h).page).toBe(2);
    expect(h.reports).toEqual([]);
  });

  it('refresh and page change leave groups open and reload their content; a new filter starts over', async () => {
    const h = await render({ groupBy: ['account'] }, fakeServer(rows), [table({ groupBy: ['account'] }), { type: 'button', label: 'Reload', onClick: [{ refresh: 'search' }] }]);
    await h.until(() => h.el.querySelectorAll('lc-server-data-table tr.group-row').length === 2, 'groups');
    (h.el.querySelector('lc-server-data-table tr.group-row button.toggle') as HTMLButtonElement).click();
    await h.until(() => body(h).length === 8, 'open group');
    ([...h.el.querySelectorAll<HTMLButtonElement>('lc-server-data-table tr.note-row button')][0]).click();
    await h.until(() => body(h).length === 8, 'all the rows');
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Reload')) as HTMLButtonElement).click();
    await h.until(() => h.requests.some((r) => (r.body as unknown as ServerTableRequest).size === 10), 'content reloaded');
    await h.settle();
    // The group stays open, with all six rows loaded before.
    expect(body(h)).toHaveLength(2 + 6);
    expect(h.el.querySelector('lc-server-data-table tr.group-row button.toggle')?.getAttribute('aria-expanded')).toBe('true');
  });
});
