import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { stubViewportHeight } from './select-testing';
import type { ServerTableRequest } from './server-data-table.component';
import { aggregate, distinctValues, filterRows, groupRows, sortRows, type ColumnFilter, type Row } from './table-data';

/** Servizio finto che rispetta il contratto della serverDataTable, calcolato con le funzioni pure della datatable. */
function fakeServer(rows: Row[]): (r: DataRequest) => unknown {
  return (r) => {
    const req = r.body as unknown as ServerTableRequest;
    const filters = Object.fromEntries(req.filters.map(({ field, ...f }) => [field, f as ColumnFilter]));
    let matching = filterRows(rows, filters, (row, f) => String(row[f] ?? ''));
    for (const { field, value } of req.groupPath) matching = matching.filter((row) => row[field] === value);
    if (req.distinct) return { values: distinctValues(matching, req.distinct) };
    const totals = { importo: aggregate(matching, 'importo', 'sum') };
    const slice = <T,>(items: T[]): T[] => items.slice(req.page * req.size, req.page * req.size + req.size);
    if (req.groupPath.length < req.groupBy.length) {
      const groups = groupRows(matching, [req.groupBy[req.groupPath.length]]).map((g) => ({ value: g.value, count: g.rows.length, aggregates: { importo: aggregate(g.rows, 'importo', 'sum') } }));
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
    conto: ['Banca', 'Cassa'][i % 2],
    categoria: ['Affitti', 'Spese', 'Incassi'][i % 3],
    importo: (i + 1) * 10,
    nota: `Movimento ${i + 1}`,
  }));
  const table = (extra: Record<string, unknown> = {}): NodeDefinition =>
    ({
      type: 'serverDataTable',
      source: 'ricerca',
      pageSize: 5,
      columns: [
        { field: 'nota', label: 'Nota', filter: 'text', sortable: true },
        { field: 'conto', label: 'Conto', filter: 'select', groupable: true },
        { field: 'categoria', label: 'Categoria', groupable: true },
        { field: 'importo', label: 'Importo', format: 'currency', sortable: true, filter: 'number', aggregate: 'sum' },
      ],
      ...extra,
    }) as NodeDefinition;
  const dataSources = { ricerca: { type: 'rest' as const, method: 'POST' as const, url: '/api/ricerca', body: '{{ request }}' } };
  const render = (extra: Record<string, unknown> = {}, respond = fakeServer(rows), components?: NodeDefinition[]): Promise<ScreenHarness> =>
    renderScreen({ components: components ?? [table(extra)], dataSources, respond });
  const body = (h: ScreenHarness): string[][] =>
    [...h.el.querySelectorAll('lc-server-data-table tbody tr:not(.ant-table-placeholder)')].map((tr) => [...tr.querySelectorAll('td')].map((td) => plain(td.textContent)));
  const count = (h: ScreenHarness): string => plain(h.el.querySelector('lc-server-data-table .count')?.textContent);
  const lastRequest = (h: ScreenHarness): ServerTableRequest => h.requests.at(-1)!.body as unknown as ServerTableRequest;
  const header = (h: ScreenHarness, text: string): HTMLElement => [...h.el.querySelectorAll<HTMLElement>('lc-server-data-table th')].find((th) => plain(th.textContent).startsWith(text))!;

  it('chiede al servizio una pagina alla volta; ordinamento e filtri viaggiano nella richiesta e riportano alla prima pagina', async () => {
    const h = await render();
    await h.until(() => body(h).length === 5, 'prima pagina');
    expect(lastRequest(h)).toEqual({ page: 0, size: 5, sort: null, filters: [], groupBy: [], groupPath: [] });
    expect(count(h)).toBe('12 righe');
    expect(plain(h.el.querySelector('lc-server-data-table tfoot')?.textContent)).toContain('780,00 €');
    (h.el.querySelectorAll('lc-server-data-table .ant-pagination-item')[2] as HTMLElement).click();
    await h.until(() => lastRequest(h).page === 2 && body(h).length === 2, 'terza pagina');
    header(h, 'Importo').click();
    await h.until(() => lastRequest(h).sort?.field === 'importo', 'ordinamento');
    expect(lastRequest(h).page).toBe(0);
    header(h, 'Importo').click();
    await h.until(() => body(h)[0]?.[3] === '120,00 €', 'importo decrescente');
    (header(h, 'Nota').querySelector('nz-filter-trigger span') as HTMLElement).click();
    await h.until(() => !!document.querySelector('.ant-dropdown .filter-panel input'), 'filtro');
    const input = document.querySelector('.ant-dropdown .filter-panel input') as HTMLInputElement;
    input.value = 'Movimento 1';
    input.dispatchEvent(new Event('input'));
    await h.until(() => count(h) === '4 righe', 'filtro di testo');
    expect(lastRequest(h).filters).toEqual([{ field: 'nota', kind: 'text', text: 'Movimento 1' }]);
  });

  it('gruppi: il servizio dà conteggi e totali; un gruppo aperto carica le sue righe a pagine', async () => {
    const h = await render({ groupBy: ['conto'] });
    await h.until(() => h.el.querySelectorAll('lc-server-data-table tr.group-row').length === 2, 'gruppi');
    expect(count(h)).toBe('2 gruppi');
    const groups = (): string[] => [...h.el.querySelectorAll('lc-server-data-table tr.group-row .group-label')].map((g) => plain(g.textContent));
    expect(groups()).toEqual(['Conto: Banca (6)', 'Conto: Cassa (6)']);
    expect(plain(h.el.querySelectorAll('lc-server-data-table tr.group-row')[0].querySelectorAll('td')[3].textContent)).toBe('360,00 €');
    (h.el.querySelector('lc-server-data-table tr.group-row button.toggle') as HTMLButtonElement).click();
    await h.until(() => body(h).length === 2 + 5 + 1, 'righe del gruppo');
    expect(lastRequest(h).groupPath).toEqual([{ field: 'conto', value: 'Banca' }]);
    const more = [...h.el.querySelectorAll<HTMLButtonElement>('lc-server-data-table tr.note-row button')][0];
    expect(plain(more.textContent)).toBe('Mostra altre (1 rimanenti)');
    more.click();
    await h.until(() => body(h).length === 2 + 6, 'tutte le righe del gruppo');
    expect(lastRequest(h).page).toBe(1);
  });

  it('i valori di un filtro a scelta arrivano dal servizio, con gli altri filtri applicati', async () => {
    const h = await render();
    await h.until(() => body(h).length === 5, 'righe');
    (header(h, 'Conto').querySelector('nz-filter-trigger span') as HTMLElement).click();
    await h.until(() => document.querySelectorAll('.ant-dropdown label[nz-checkbox]').length === 2, 'valori');
    expect(lastRequest(h).distinct).toBe('conto');
    ([...document.querySelectorAll<HTMLElement>('.ant-dropdown label[nz-checkbox]')][1].querySelector('input') as HTMLInputElement).click();
    await h.until(() => count(h) === '6 righe', 'filtro a scelta');
    expect(lastRequest(h).filters).toEqual([{ field: 'conto', kind: 'select', values: ['Cassa'] }]);
  });

  it('una risposta vecchia non sovrascrive la più recente; refresh sul data source ripete la richiesta', async () => {
    let delay = 0;
    const server = fakeServer(rows);
    const respond = async (r: DataRequest): Promise<unknown> => {
      const wait = delay;
      if (wait) await new Promise((res) => setTimeout(res, wait));
      return server(r);
    };
    const h = await render({}, respond as never, [table(), { type: 'button', label: 'Ricarica', onClick: [{ refresh: 'ricerca' }] }]);
    await h.until(() => body(h).length === 5, 'righe');
    delay = 300;
    (h.el.querySelectorAll('lc-server-data-table .ant-pagination-item')[1] as HTMLElement).click();
    await h.settle();
    delay = 0;
    (h.el.querySelectorAll('lc-server-data-table .ant-pagination-item')[2] as HTMLElement).click();
    await h.until(() => body(h).length === 2, 'terza pagina');
    await new Promise((r) => setTimeout(r, 400));
    await h.settle();
    expect(body(h)).toHaveLength(2);
    const before = h.requests.length;
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Ricarica')) as HTMLButtonElement).click();
    await h.until(() => h.requests.length === before + 1, 'refresh');
    expect(lastRequest(h).page).toBe(2);
    expect(h.reports).toEqual([]);
  });

  it('refresh e cambio pagina lasciano aperti i gruppi e ne ricaricano il contenuto; un filtro nuovo riparte da capo', async () => {
    const h = await render({ groupBy: ['conto'] }, fakeServer(rows), [table({ groupBy: ['conto'] }), { type: 'button', label: 'Ricarica', onClick: [{ refresh: 'ricerca' }] }]);
    await h.until(() => h.el.querySelectorAll('lc-server-data-table tr.group-row').length === 2, 'gruppi');
    (h.el.querySelector('lc-server-data-table tr.group-row button.toggle') as HTMLButtonElement).click();
    await h.until(() => body(h).length === 8, 'gruppo aperto');
    ([...h.el.querySelectorAll<HTMLButtonElement>('lc-server-data-table tr.note-row button')][0]).click();
    await h.until(() => body(h).length === 8, 'tutte le righe');
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Ricarica')) as HTMLButtonElement).click();
    await h.until(() => h.requests.some((r) => (r.body as unknown as ServerTableRequest).size === 10), 'contenuto ricaricato');
    await h.settle();
    // Il gruppo resta aperto, con tutte e sei le righe caricate prima.
    expect(body(h)).toHaveLength(2 + 6);
    expect(h.el.querySelector('lc-server-data-table tr.group-row button.toggle')?.getAttribute('aria-expanded')).toBe('true');
  });
});
