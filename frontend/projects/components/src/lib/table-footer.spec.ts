import { renderScreen } from './screen-testing';

describe('Table footer: «Refresh», first and last page', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Row ${i + 1}` }));
  const footer = (el: HTMLElement) => el.querySelector('lc-table-footer');
  const button = (el: HTMLElement, cls: string) => footer(el)?.querySelector<HTMLButtonElement>(`button.${cls}`) ?? null;
  const firstCell = (el: HTMLElement) => el.querySelector('tbody tr:not(.ant-table-placeholder) td')?.textContent?.trim();

  it('without refreshable and with a single page there is no footer', async () => {
    const { el } = await renderScreen({
      dataSources: { rows: { type: 'rest', method: 'GET', url: '/api/rows' } },
      components: [{ type: 'dataTable', source: 'rows', columns: [{ field: 'name', label: 'Name' }] }],
      respond: () => rows(3),
    });
    expect(footer(el)).toBeNull();
  });

  it('datatable: first and last page, disabled at the ends; «Refresh» reads the data source again', async () => {
    const { el, settle, until, requests } = await renderScreen({
      dataSources: { rows: { type: 'rest', method: 'GET', url: '/api/rows' } },
      components: [{ type: 'dataTable', source: 'rows', refreshable: true, pageSize: 5, columns: [{ field: 'name', label: 'Name' }] }],
      respond: () => rows(12),
    });
    await until(() => firstCell(el) === 'Row 1', 'rows');
    expect(button(el, 'first')?.disabled).toBe(true);
    expect(button(el, 'first')?.getAttribute('aria-label')).toBe('First page');
    button(el, 'last')!.click();
    await settle();
    expect(firstCell(el)).toBe('Row 11');
    expect(button(el, 'last')?.disabled).toBe(true);
    button(el, 'first')!.click();
    await settle();
    expect(firstCell(el)).toBe('Row 1');

    // «Refresh» on the left: one more request, with the accessible name.
    const refresh = button(el, 'refresh')!;
    expect(refresh.getAttribute('aria-label')).toBe('Refresh');
    expect(footer(el)!.firstElementChild).toBe(refresh);
    const before = requests.length;
    refresh.click();
    await until(() => requests.length === before + 1, 'reload');
    // Immediate feedback: the icon turns even if the response is instant, then stops after the minimum turn.
    await settle();
    expect(refresh.classList.contains('busy')).toBe(true);
    expect(refresh.getAttribute('aria-busy')).toBe('true');
    // And the spinner in the centre of the table, with the message, appears at once (without the delay of normal loads).
    expect(el.querySelector('lc-data-table lc-busy .overlay .label')?.textContent?.trim()).toBe('Loading…');
    // A second click while turning does not repeat the request.
    refresh.click();
    await settle();
    expect(requests).toHaveLength(before + 1);
    await until(() => !refresh.classList.contains('busy'), 'end of the turn');
  });

  it('table paged by the service: «last» asks for the last page', async () => {
    const { el, until, requests } = await renderScreen({
      dataSources: { orders: { type: 'rest', method: 'GET', url: '/api/orders', paging: 'server', params: { page: '{{ state.page }}' } } },
      components: [{ type: 'table', source: 'orders', refreshable: true, columns: [{ field: 'name', label: 'Name' }] }],
      respond: (r) => {
        const page = Number(r.query?.['page'] ?? 0);
        return { items: rows(10).map((x, i) => ({ name: `P${page} ${i}` })), page, size: 10, total: 45 };
      },
    });
    await until(() => !!button(el, 'last'), 'pages');
    button(el, 'last')!.click();
    await until(() => firstCell(el) === 'P4 0', 'last page');
    expect(requests.at(-1)?.query).toMatchObject({ page: 4 });
    expect(button(el, 'last')?.disabled).toBe(true);
  });
});
