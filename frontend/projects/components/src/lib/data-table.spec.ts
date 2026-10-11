import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';

describe('datatable', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const rows = [
    { id: 1, conto: 'Banca', categoria: 'Affitti', importo: -1200, data: '2026-09-01', nota: 'Ufficio Milano' },
    { id: 2, conto: 'Cassa', categoria: 'Spese', importo: -35.5, data: '2026-09-03', nota: 'Cancelleria' },
    { id: 3, conto: 'Banca', categoria: 'Incassi', importo: 4800, data: '2026-09-10', nota: 'Fattura Rossi' },
    { id: 4, conto: 'Banca', categoria: 'Spese', importo: -90, data: '2026-10-02', nota: 'Toner' },
    { id: 5, conto: 'Cassa', categoria: 'Incassi', importo: 120, data: '2026-10-05', nota: 'Vendita al banco' },
  ];
  const table = (extra: Record<string, unknown> = {}): NodeDefinition =>
    ({
      type: 'dataTable',
      source: 'movimenti',
      columns: [
        { field: 'data', label: 'Data', format: 'date', sortable: true, filter: 'date' },
        { field: 'conto', label: 'Conto', filter: 'select', groupable: true, sortable: true },
        { field: 'categoria', label: 'Categoria', filter: 'select', groupable: true },
        { field: 'nota', label: 'Nota', filter: 'text' },
        { field: 'importo', label: 'Importo', format: 'currency', sortable: true, filter: 'number', aggregate: 'sum' },
      ],
      ...extra,
    }) as NodeDefinition;
  const dataSources = { movimenti: { type: 'rest' as const, method: 'GET' as const, url: '/api/movimenti' } };
  const render = (extra: Record<string, unknown> = {}): Promise<ScreenHarness> => renderScreen({ components: [table(extra)], dataSources, respond: () => rows });
  const bodyRows = (h: ScreenHarness): string[][] =>
    [...h.el.querySelectorAll('lc-data-table tbody tr:not(.ant-table-placeholder)')].map((tr) => [...tr.querySelectorAll('td')].map((td) => plain(td.textContent)));
  const count = (h: ScreenHarness): string => plain(h.el.querySelector('lc-data-table .count')?.textContent);
  const header = (h: ScreenHarness, text: string): HTMLElement => [...h.el.querySelectorAll<HTMLElement>('lc-data-table th')].find((th) => plain(th.textContent).startsWith(text))!;
  const openFilter = async (h: ScreenHarness, column: string): Promise<HTMLElement> => {
    (header(h, column).querySelector('nz-filter-trigger .ant-dropdown-trigger, nz-filter-trigger span') as HTMLElement).click();
    const panel = (): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('.ant-dropdown .filter-panel')].find((p) => p.getAttribute('aria-label') === 'Filtra ' + column);
    await h.until(() => !!panel(), 'filtro aperto');
    return panel()!;
  };

  it('righe, conteggio, totale generale e ordinamento in pagina', async () => {
    const h = await render();
    await h.until(() => bodyRows(h).length === 5, 'righe');
    expect(count(h)).toBe('5 di 5 righe');
    expect(plain(h.el.querySelector('lc-data-table tfoot')?.textContent)).toContain('3594,50 €');
    header(h, 'Importo').click();
    await h.settle();
    expect(bodyRows(h).map((r) => r[4])).toEqual(['-1200,00 €', '-90,00 €', '-35,50 €', '120,00 €', '4800,00 €']);
  });

  it('filtri dall’intestazione: testo, scelta e intervallo; il pulsante li azzera tutti', async () => {
    const h = await render();
    await h.until(() => bodyRows(h).length === 5, 'righe');
    const text = await openFilter(h, 'Nota');
    const input = text.querySelector('input') as HTMLInputElement;
    input.value = 'banco';
    input.dispatchEvent(new Event('input'));
    await h.until(() => bodyRows(h).length === 1, 'filtro di testo (dopo la pausa)');
    expect(bodyRows(h).map((r) => r[3])).toEqual(['Vendita al banco']);
    expect(header(h, 'Nota').querySelector('nz-filter-trigger .active, nz-filter-trigger .ant-table-filter-trigger.active')).not.toBeNull();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await h.until(() => bodyRows(h).length === 5, 'filtro di testo tolto');
    const select = await openFilter(h, 'Conto');
    const options = [...select.querySelectorAll<HTMLElement>('label[nz-checkbox]')];
    expect(options.map((o) => plain(o.textContent))).toEqual(['Banca', 'Cassa']);
    (options[1].querySelector('input') as HTMLInputElement).click();
    await h.settle();
    expect(count(h)).toBe('2 di 5 righe');
    expect(plain(h.el.querySelector('lc-data-table tfoot')?.textContent)).toContain('84,50 €');
    const number = await openFilter(h, 'Importo');
    const [from] = [...number.querySelectorAll<HTMLInputElement>('input')];
    from.value = '0';
    from.dispatchEvent(new Event('input'));
    await h.settle();
    expect(bodyRows(h).map((r) => r[3])).toEqual(['Vendita al banco']);
    ([...h.el.querySelectorAll('lc-data-table .toolbar button')].find((b) => plain(b.textContent).includes('Azzera i filtri')) as HTMLButtonElement).click();
    await h.settle();
    expect(count(h)).toBe('5 di 5 righe');
  });

  it('gruppi su due livelli con conteggio e totali; i gruppi si chiudono; il raggruppamento si cambia', async () => {
    const h = await render({ groupBy: ['conto', 'categoria'], pageSize: 20 });
    await h.until(() => bodyRows(h).length > 0, 'righe');
    const groups = (): string[] => [...h.el.querySelectorAll('lc-data-table tr.group-row')].map((tr) => plain(tr.querySelector('.group-label')?.textContent));
    expect(groups()).toEqual(['Conto: Banca (3)', 'Categoria: Affitti (1)', 'Categoria: Incassi (1)', 'Categoria: Spese (1)', 'Conto: Cassa (2)', 'Categoria: Incassi (1)', 'Categoria: Spese (1)']);
    const banca = h.el.querySelector('lc-data-table tr.group-row') as HTMLElement;
    expect(plain(banca.querySelectorAll('td')[4].textContent)).toBe('3510,00 €');
    const toggle = banca.querySelector('button.toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    await h.settle();
    expect(groups()).toEqual(['Conto: Banca (3)', 'Conto: Cassa (2)', 'Categoria: Incassi (1)', 'Categoria: Spese (1)']);
    // Raggruppamento cambiato dall'utente: solo per categoria.
    const options = await openSelect(h.el.querySelector('lc-data-table .toolbar nz-select')!, () => h.settle());
    options.find((o) => plain(o.textContent) === 'Conto')!.click();
    await h.until(() => groups()[0] === 'Categoria: Affitti (1)', 'nuovo raggruppamento');
    expect(groups()).toEqual(['Categoria: Affitti (1)', 'Categoria: Incassi (2)', 'Categoria: Spese (2)']);
  });

  it('la paginazione conta anche le intestazioni dei gruppi', async () => {
    const h = await render({ groupBy: ['conto'], pageSize: 5 });
    await h.until(() => bodyRows(h).length === 5, 'prima pagina');
    // 2 gruppi + 5 righe = 7 elementi: due pagine.
    expect(h.el.querySelectorAll('lc-data-table .ant-pagination-item')).toHaveLength(2);
    (h.el.querySelectorAll('lc-data-table .ant-pagination-item')[1] as HTMLElement).click();
    await h.settle();
    expect(bodyRows(h)).toHaveLength(2);
  });

  describe('grandi volumi', () => {
    const many = Array.from({ length: 20000 }, (_, i) => ({
      id: i,
      conto: ['Banca A', 'Banca B', 'Cassa'][i % 3],
      categoria: ['Affitti', 'Utenze', 'Stipendi', 'Incassi', 'Fornitori', 'Varie'][i % 6],
      importo: ((i * 37) % 5000) - 2500,
      data: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      nota: `Movimento numero ${i}`,
    }));

    it('20.000 righe: si disegna solo la pagina; gruppi, filtri e ordinamento restano rapidi', async () => {
      const started = performance.now();
      const h = await renderScreen({ components: [table({ groupBy: ['conto', 'categoria'] })], dataSources, respond: () => many });
      await h.until(() => bodyRows(h).length === 10, 'prima pagina');
      const firstRender = performance.now() - started;
      expect(count(h)).toBe('20000 di 20000 righe');
      expect(h.el.querySelectorAll('lc-data-table tbody tr')).toHaveLength(10);
      // Filtro di testo, ordinamento e cambio di raggruppamento su tutte le righe.
      const t0 = performance.now();
      const text = await openFilter(h, 'Nota');
      const input = text.querySelector('input') as HTMLInputElement;
      input.value = 'numero 19';
      input.dispatchEvent(new Event('input'));
      await h.until(() => count(h) === '1111 di 20000 righe', 'filtro');
      header(h, 'Importo').click();
      await h.settle();
      const elapsed = performance.now() - t0;
      // Limiti larghi: jsdom è molto più lento di un browser vero; servono a cogliere un peggioramento di scala.
      expect(firstRender).toBeLessThan(8000);
      expect(elapsed).toBeLessThan(4000);
    }, 30000);
  });
});
