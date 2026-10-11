import type { NodeDefinition } from 'schema';
import { columnTexts, renderScreen } from './screen-testing';
import { compareValues, sortRows } from './table-data';

describe('ordinamento delle tabelle', () => {
  describe('funzioni di confronto', () => {
    it('numeri come numeri, testi in ordine naturale, vuoti in fondo', () => {
      expect(compareValues(2, 10)).toBeLessThan(0);
      expect(compareValues('FT-2', 'FT-10')).toBeLessThan(0);
      expect(compareValues('àbaco', 'Zeta')).toBeLessThan(0);
      expect(compareValues(null, 'a')).toBeGreaterThan(0);
      expect(compareValues(false, true)).toBeLessThan(0);
    });

    it('ordina in modo stabile e lascia i vuoti in fondo anche in discesa', () => {
      const rows = [{ n: 2, id: 'a' }, { n: null, id: 'b' }, { n: 1, id: 'c' }, { n: 2, id: 'd' }];
      expect(sortRows(rows, { field: 'n', direction: 'asc' }).map((r) => r['id'])).toEqual(['c', 'a', 'd', 'b']);
      expect(sortRows(rows, { field: 'n', direction: 'desc' }).map((r) => r['id'])).toEqual(['a', 'd', 'c', 'b']);
      expect(rows.map((r) => r['id'])).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  const rows = [
    { numero: 'B-2', importo: 30 },
    { numero: 'A-10', importo: 5 },
    { numero: 'A-9', importo: 120 },
  ];
  const header = (el: HTMLElement, text: string): HTMLElement =>
    [...el.querySelectorAll<HTMLElement>('nz-table th')].find((th) => th.textContent?.trim() === text)!;
  const clickSorter = (th: HTMLElement): void => th.click();

  it('senza paginazione lato server ordina in pagina e alterna crescente, decrescente, nessuno', async () => {
    const table: NodeDefinition = {
      type: 'table',
      source: 'dati',
      columns: [{ field: 'numero', label: 'Numero', sortable: true }, { field: 'importo', label: 'Importo', sortable: true }, { field: 'nota', label: 'Nota' }],
    };
    const h = await renderScreen({ components: [table], dataSources: { dati: { type: 'rest', method: 'GET', url: '/api/dati' } }, respond: () => rows });
    await h.until(() => columnTexts(h.el, 0).length === 3, 'righe');
    expect(columnTexts(h.el, 0)).toEqual(['B-2', 'A-10', 'A-9']);
    const numero = header(h.el, 'Numero');
    expect(numero.getAttribute('aria-sort')).toBe('none');
    expect(header(h.el, 'Nota').getAttribute('aria-sort')).toBeNull();
    clickSorter(numero);
    await h.settle();
    expect(columnTexts(h.el, 0)).toEqual(['A-9', 'A-10', 'B-2']);
    expect(numero.getAttribute('aria-sort')).toBe('ascending');
    clickSorter(numero);
    await h.settle();
    expect(columnTexts(h.el, 0)).toEqual(['B-2', 'A-10', 'A-9']);
    expect(numero.getAttribute('aria-sort')).toBe('descending');
    clickSorter(header(h.el, 'Importo'));
    await h.settle();
    expect(columnTexts(h.el, 1)).toEqual(['5', '30', '120']);
    expect(numero.getAttribute('aria-sort')).toBe('none');
    // Una sola richiesta: l'ordinamento in pagina non ricarica i dati.
    expect(h.requests).toHaveLength(1);
  });

  it('con paginazione lato server scrive l’ordinamento nello stato, il servizio lo riceve e si torna alla prima pagina', async () => {
    const table: NodeDefinition = {
      type: 'table',
      source: 'dati',
      sort: { bind: 'state.ordinamento', default: { field: 'numero', direction: 'desc' } },
      columns: [{ field: 'numero', label: 'Numero', sortable: true }, { field: 'importo', label: 'Importo', sortable: true }],
    };
    const h = await renderScreen({
      components: [table],
      dataSources: {
        dati: {
          type: 'rest', method: 'GET', url: '/api/dati', paging: 'server',
          params: { sort: '{{state.ordinamento.field}}', dir: '{{state.ordinamento.direction}}', page: '{{state.page}}' },
        },
      },
      respond: () => ({ items: rows, total: 30, size: 3 }),
    });
    await h.until(() => columnTexts(h.el, 0).length === 3, 'righe');
    // Il primo caricamento ha già l'ordinamento predefinito; l'ordine delle righe è quello del servizio.
    expect(h.requests[0].query).toEqual({ sort: 'numero', dir: 'desc', page: 0 });
    expect(columnTexts(h.el, 0)).toEqual(['B-2', 'A-10', 'A-9']);
    expect(header(h.el, 'Numero').getAttribute('aria-sort')).toBe('descending');
    // Pagina 2, poi un nuovo ordinamento: si riparte dalla prima pagina.
    (h.el.querySelectorAll('.ant-pagination-item')[1] as HTMLElement).click();
    await h.until(() => h.requests.at(-1)?.query?.['page'] === 1, 'seconda pagina');
    clickSorter(header(h.el, 'Importo'));
    await h.until(() => h.requests.at(-1)?.query?.['sort'] === 'importo', 'nuovo ordinamento');
    expect(h.requests.at(-1)?.query).toEqual({ sort: 'importo', dir: 'asc', page: 0 });
    expect(h.reports).toEqual([]);
  });
});
