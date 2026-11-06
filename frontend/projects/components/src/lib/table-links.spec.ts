import type { NodeDefinition } from 'schema';
import { columnTexts, plain, renderScreen } from './screen-testing';
import { stubViewportHeight } from './select-testing';

describe('links of the rows (href)', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  const rows = [{ id: 7, filename: 'report.pdf', status: 'open' }];
  const dataSources = { data: { type: 'rest' as const, method: 'GET' as const, url: '/api/data' } };
  const download = '/api/issues/QD-1/attachments/{{ row.id }}/content';
  const node = (type: string): NodeDefinition =>
    ({
      type,
      source: 'data',
      columns: [{ field: 'filename', label: 'File', href: download }, { field: 'status', label: 'Status' }],
      rowActions: [
        { label: 'Download', href: download },
        { label: 'Closed only', enabledIf: "{{ row.status == 'closed' }}", href: download },
        { label: 'Open', onClick: [{ toast: 'opened {{ row.id }}' }] },
      ],
    }) as NodeDefinition;
  const links = (el: HTMLElement): string[] => [...el.querySelectorAll<HTMLAnchorElement>('td a.cell-link')].map((a) => a.getAttribute('href') ?? '');

  for (const type of ['table', 'dataTable', 'serverDataTable']) {
    it(`${type}: the value of a column with href is a link to the path of the row, the actions with href are links`, async () => {
      const server = type === 'serverDataTable';
      const h = await renderScreen({
        components: [node(type)],
        dataSources: server ? { data: { type: 'rest', method: 'POST', url: '/api/search', body: '{{ request }}' } } : dataSources,
        respond: () => (server ? { items: rows, total: 1, totals: {} } : rows),
      });
      await h.until(() => links(h.el).length === 1, 'rows');
      expect(links(h.el)).toEqual(['/api/issues/QD-1/attachments/7/content']);
      expect(plain(h.el.querySelector('td a.cell-link')?.textContent)).toBe('report.pdf');
      // The column without href stays text.
      expect(h.el.querySelectorAll('td a.cell-link')).toHaveLength(1);
      const actions = [...h.el.querySelectorAll<HTMLElement>('td .actions > span > *')];
      expect(actions.map((a) => [a.tagName, plain(a.textContent)])).toEqual([
        ['A', 'Download'],
        ['BUTTON', 'Closed only'],
        ['BUTTON', 'Open'],
      ]);
      expect(actions[0].getAttribute('href')).toBe('/api/issues/QD-1/attachments/7/content');
      // A disabled action with href opens nothing.
      expect((actions[1] as HTMLButtonElement).disabled).toBe(true);
      (actions[2] as HTMLButtonElement).click();
      await h.until(() => h.toasts.length === 1, 'action with steps');
      expect(h.toasts).toEqual(['opened 7']);
      expect(h.reports).toEqual([]);
    });
  }

  it('an address that does not resolve to a path of the same origin leaves the value as text, and is reported', async () => {
    const h = await renderScreen({
      components: [{ type: 'table', source: 'data', columns: [{ field: 'filename', label: 'File', href: '/files/{{ row.missing }}' }] } as NodeDefinition],
      dataSources,
      respond: () => rows,
    });
    await h.until(() => columnTexts(h.el, 0).length === 1, 'rows');
    expect(links(h.el)).toEqual([]);
    expect(columnTexts(h.el, 0)).toEqual(['report.pdf']);
    await h.until(() => h.reports.some((r) => r.source === 'href'), 'reported');
  });
});
