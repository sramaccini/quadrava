import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

/** Sorting and filters of the tables from the keyboard: buttons with a name, a panel that opens and closes with the focus. */
describe('tables from the keyboard', () => {
  afterEach(() => document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove()));

  const rows = [
    { id: 1, number: 'B-2', status: 'open' },
    { id: 2, number: 'A-1', status: 'closed' },
  ];
  const columns = [
    { field: 'number', label: 'Number', sortable: true },
    { field: 'status', label: 'Status', filter: 'text' },
  ];
  const header = (h: ScreenHarness, text: string): HTMLElement => [...h.el.querySelectorAll<HTMLElement>('th')].find((th) => plain(th.textContent).startsWith(text))!;
  const firstCells = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('tbody tr:not(.ant-table-placeholder)')].map((tr) => plain(tr.querySelector('td')?.textContent));
  const escape = (): void => {
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  };

  it('in a table, the title of a sortable column is a button and the header says the order', async () => {
    const h = await renderScreen({
      components: [{ type: 'table', source: 'data', columns: [{ field: 'number', label: 'Number', sortable: true }, { field: 'status', label: 'Status' }] }],
      dataSources: { data: { type: 'rest', method: 'GET', url: '/api/data' } },
      respond: () => rows,
    });
    await h.until(() => firstCells(h).length === 2, 'rows');
    expect(header(h, 'Status').querySelector('button')).toBeNull();
    const sort = header(h, 'Number').querySelector<HTMLButtonElement>('button.lc-sort')!;
    expect(plain(sort.textContent)).toBe('Number');
    sort.click();
    await h.until(() => header(h, 'Number').getAttribute('aria-sort') === 'ascending', 'sorted');
    expect(firstCells(h)).toEqual(['A-1', 'B-2']);
  });

  it('in a dataTable, the filter is a named button: its panel opens with the focus inside and Esc brings it back', async () => {
    const h = await renderScreen({
      components: [{ type: 'dataTable', source: 'data', columns } as NodeDefinition],
      dataSources: { data: { type: 'rest', method: 'GET', url: '/api/data' } },
      respond: () => rows,
    });
    await h.until(() => firstCells(h).length === 2, 'rows');
    header(h, 'Number').querySelector<HTMLButtonElement>('button.lc-sort')!.click();
    await h.until(() => header(h, 'Number').getAttribute('aria-sort') === 'ascending', 'sorted');
    const trigger = header(h, 'Status').querySelector<HTMLButtonElement>('button.lc-filter-trigger')!;
    expect(trigger.getAttribute('aria-label')).toBe('Filter Status');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // Opening the filter does not sort the column.
    trigger.focus();
    trigger.click();
    await h.until(() => document.activeElement?.closest('.filter-panel') != null, 'focus in the panel');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)?.getAttribute('aria-label')).toBe('Filter Status');
    expect(header(h, 'Status').hasAttribute('aria-sort')).toBe(false);
    escape();
    await h.until(() => trigger.getAttribute('aria-expanded') === 'false', 'panel closed');
    expect(document.activeElement).toBe(trigger);
  });

  it('in a serverDataTable, the same', async () => {
    const h = await renderScreen({
      components: [{ type: 'serverDataTable', source: 'search', columns } as NodeDefinition],
      dataSources: { search: { type: 'rest', method: 'POST', url: '/api/search', body: '{{ request }}' } },
      respond: () => ({ items: rows, total: 2 }),
    });
    await h.until(() => firstCells(h).length === 2, 'rows');
    expect(header(h, 'Number').querySelector('button.lc-sort')).not.toBeNull();
    const trigger = header(h, 'Status').querySelector<HTMLButtonElement>('button.lc-filter-trigger')!;
    expect(trigger.getAttribute('aria-label')).toBe('Filter Status');
    trigger.focus();
    trigger.click();
    await h.until(() => document.activeElement?.closest('.filter-panel') != null, 'focus in the panel');
    escape();
    await h.until(() => trigger.getAttribute('aria-expanded') === 'false', 'panel closed');
    expect(document.activeElement).toBe(trigger);
  });
});
