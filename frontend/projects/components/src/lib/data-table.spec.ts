import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';

describe('datatable', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const rows = [
    { id: 1, account: 'Bank', category: 'Rent', amount: -1200, data: '2026-09-01', note: 'Milan office' },
    { id: 2, account: 'Cash', category: 'Supplies', amount: -35.5, data: '2026-09-03', note: 'Stationery' },
    { id: 3, account: 'Bank', category: 'Sales', amount: 4800, data: '2026-09-10', note: 'Invoice Smith' },
    { id: 4, account: 'Bank', category: 'Supplies', amount: -90, data: '2026-10-02', note: 'Toner' },
    { id: 5, account: 'Cash', category: 'Sales', amount: 120, data: '2026-10-05', note: 'Counter sale' },
  ];
  const table = (extra: Record<string, unknown> = {}): NodeDefinition =>
    ({
      type: 'dataTable',
      source: 'transactions',
      columns: [
        { field: 'data', label: 'Date', format: 'date', sortable: true, filter: 'date' },
        { field: 'account', label: 'Account', filter: 'select', groupable: true, sortable: true },
        { field: 'category', label: 'Category', filter: 'select', groupable: true },
        { field: 'note', label: 'Note', filter: 'text' },
        { field: 'amount', label: 'Amount', format: 'currency', sortable: true, filter: 'number', aggregate: 'sum' },
      ],
      ...extra,
    }) as NodeDefinition;
  const dataSources = { transactions: { type: 'rest' as const, method: 'GET' as const, url: '/api/transactions' } };
  const render = (extra: Record<string, unknown> = {}): Promise<ScreenHarness> => renderScreen({ components: [table(extra)], dataSources, respond: () => rows });
  const bodyRows = (h: ScreenHarness): string[][] =>
    [...h.el.querySelectorAll('lc-data-table tbody tr:not(.ant-table-placeholder)')].map((tr) => [...tr.querySelectorAll('td')].map((td) => plain(td.textContent)));
  const count = (h: ScreenHarness): string => plain(h.el.querySelector('lc-data-table .count')?.textContent);
  const header = (h: ScreenHarness, text: string): HTMLElement => [...h.el.querySelectorAll<HTMLElement>('lc-data-table th')].find((th) => plain(th.textContent).startsWith(text))!;
  const openFilter = async (h: ScreenHarness, column: string): Promise<HTMLElement> => {
    (header(h, column).querySelector('nz-filter-trigger .ant-dropdown-trigger, nz-filter-trigger span') as HTMLElement).click();
    const panel = (): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('.ant-dropdown .filter-panel')].find((p) => p.getAttribute('aria-label') === 'Filtra ' + column);
    await h.until(() => !!panel(), 'filter open');
    return panel()!;
  };

  it('rows, count, grand total and in-page sorting', async () => {
    const h = await render();
    await h.until(() => bodyRows(h).length === 5, 'rows');
    expect(count(h)).toBe('5 di 5 righe');
    expect(plain(h.el.querySelector('lc-data-table tfoot')?.textContent)).toContain('3594,50 €');
    header(h, 'Amount').click();
    await h.settle();
    expect(bodyRows(h).map((r) => r[4])).toEqual(['-1200,00 €', '-90,00 €', '-35,50 €', '120,00 €', '4800,00 €']);
  });

  it('filters from the header: text, choice and range; the button clears them all', async () => {
    const h = await render();
    await h.until(() => bodyRows(h).length === 5, 'rows');
    const text = await openFilter(h, 'Note');
    const input = text.querySelector('input') as HTMLInputElement;
    input.value = 'counter';
    input.dispatchEvent(new Event('input'));
    await h.until(() => bodyRows(h).length === 1, 'text filter (after the pause)');
    expect(bodyRows(h).map((r) => r[3])).toEqual(['Counter sale']);
    expect(header(h, 'Note').querySelector('nz-filter-trigger .active, nz-filter-trigger .ant-table-filter-trigger.active')).not.toBeNull();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await h.until(() => bodyRows(h).length === 5, 'text filter removed');
    const select = await openFilter(h, 'Account');
    const options = [...select.querySelectorAll<HTMLElement>('label[nz-checkbox]')];
    expect(options.map((o) => plain(o.textContent))).toEqual(['Bank', 'Cash']);
    (options[1].querySelector('input') as HTMLInputElement).click();
    await h.settle();
    expect(count(h)).toBe('2 di 5 righe');
    expect(plain(h.el.querySelector('lc-data-table tfoot')?.textContent)).toContain('84,50 €');
    const number = await openFilter(h, 'Amount');
    const [from] = [...number.querySelectorAll<HTMLInputElement>('input')];
    from.value = '0';
    from.dispatchEvent(new Event('input'));
    await h.settle();
    expect(bodyRows(h).map((r) => r[3])).toEqual(['Counter sale']);
    ([...h.el.querySelectorAll('lc-data-table .toolbar button')].find((b) => plain(b.textContent).includes('Azzera i filtri')) as HTMLButtonElement).click();
    await h.settle();
    expect(count(h)).toBe('5 di 5 righe');
  });

  it('groups on two levels with count and totals; groups close; the grouping can be changed', async () => {
    const h = await render({ groupBy: ['account', 'category'], pageSize: 20 });
    await h.until(() => bodyRows(h).length > 0, 'rows');
    const groups = (): string[] => [...h.el.querySelectorAll('lc-data-table tr.group-row')].map((tr) => plain(tr.querySelector('.group-label')?.textContent));
    expect(groups()).toEqual(['Account: Bank (3)', 'Category: Rent (1)', 'Category: Sales (1)', 'Category: Supplies (1)', 'Account: Cash (2)', 'Category: Sales (1)', 'Category: Supplies (1)']);
    const banca = h.el.querySelector('lc-data-table tr.group-row') as HTMLElement;
    expect(plain(banca.querySelectorAll('td')[4].textContent)).toBe('3510,00 €');
    const toggle = banca.querySelector('button.toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    await h.settle();
    expect(groups()).toEqual(['Account: Bank (3)', 'Account: Cash (2)', 'Category: Sales (1)', 'Category: Supplies (1)']);
    // Grouping changed by the user: by category only.
    const options = await openSelect(h.el.querySelector('lc-data-table .toolbar nz-select')!, () => h.settle());
    options.find((o) => plain(o.textContent) === 'Account')!.click();
    await h.until(() => groups()[0] === 'Category: Rent (1)', 'new grouping');
    expect(groups()).toEqual(['Category: Rent (1)', 'Category: Sales (2)', 'Category: Supplies (2)']);
  });

  it('paging also counts the group headers', async () => {
    const h = await render({ groupBy: ['account'], pageSize: 5 });
    await h.until(() => bodyRows(h).length === 5, 'first page');
    // 2 groups + 5 rows = 7 elements: two pages.
    expect(h.el.querySelectorAll('lc-data-table .ant-pagination-item')).toHaveLength(2);
    (h.el.querySelectorAll('lc-data-table .ant-pagination-item')[1] as HTMLElement).click();
    await h.settle();
    expect(bodyRows(h)).toHaveLength(2);
  });

  describe('large volumes', () => {
    const many = Array.from({ length: 20000 }, (_, i) => ({
      id: i,
      account: ['Bank A', 'Bank B', 'Cash'][i % 3],
      category: ['Rent', 'Utilities', 'Salaries', 'Sales', 'Suppliers', 'Sundries'][i % 6],
      amount: ((i * 37) % 5000) - 2500,
      data: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      note: `Transaction number ${i}`,
    }));

    it('20,000 rows: only the page is drawn; groups, filters and sorting stay fast', async () => {
      const started = performance.now();
      const h = await renderScreen({ components: [table({ groupBy: ['account', 'category'] })], dataSources, respond: () => many });
      await h.until(() => bodyRows(h).length === 10, 'first page');
      const firstRender = performance.now() - started;
      expect(count(h)).toBe('20000 di 20000 righe');
      expect(h.el.querySelectorAll('lc-data-table tbody tr')).toHaveLength(10);
      // Text filter, sorting and change of grouping over all the rows.
      const t0 = performance.now();
      const text = await openFilter(h, 'Note');
      const input = text.querySelector('input') as HTMLInputElement;
      input.value = 'number 19';
      input.dispatchEvent(new Event('input'));
      await h.until(() => count(h) === '1111 di 20000 righe', 'filter');
      header(h, 'Amount').click();
      await h.settle();
      const elapsed = performance.now() - t0;
      // Loose limits: jsdom is much slower than a real browser; they are there to catch a change in scale.
      expect(firstRender).toBeLessThan(8000);
      expect(elapsed).toBeLessThan(4000);
    }, 30000);
  });
});
