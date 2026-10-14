import { renderScreen } from './screen-testing';

describe('Piede delle tabelle: «Aggiorna», prima e ultima pagina', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ nome: `Riga ${i + 1}` }));
  const footer = (el: HTMLElement) => el.querySelector('lc-table-footer');
  const button = (el: HTMLElement, cls: string) => footer(el)?.querySelector<HTMLButtonElement>(`button.${cls}`) ?? null;
  const firstCell = (el: HTMLElement) => el.querySelector('tbody tr:not(.ant-table-placeholder) td')?.textContent?.trim();

  it('senza refreshable e con una sola pagina il piede non c’è', async () => {
    const { el } = await renderScreen({
      dataSources: { righe: { type: 'rest', method: 'GET', url: '/api/righe' } },
      components: [{ type: 'dataTable', source: 'righe', columns: [{ field: 'nome', label: 'Nome' }] }],
      respond: () => rows(3),
    });
    expect(footer(el)).toBeNull();
  });

  it('datatable: prima e ultima pagina, disabilitate agli estremi; «Aggiorna» rilegge il data source', async () => {
    const { el, settle, until, requests } = await renderScreen({
      dataSources: { righe: { type: 'rest', method: 'GET', url: '/api/righe' } },
      components: [{ type: 'dataTable', source: 'righe', refreshable: true, pageSize: 5, columns: [{ field: 'nome', label: 'Nome' }] }],
      respond: () => rows(12),
    });
    await until(() => firstCell(el) === 'Riga 1', 'righe');
    expect(button(el, 'first')?.disabled).toBe(true);
    expect(button(el, 'first')?.getAttribute('aria-label')).toBe('Prima pagina');
    button(el, 'last')!.click();
    await settle();
    expect(firstCell(el)).toBe('Riga 11');
    expect(button(el, 'last')?.disabled).toBe(true);
    button(el, 'first')!.click();
    await settle();
    expect(firstCell(el)).toBe('Riga 1');

    // «Aggiorna» a sinistra: una richiesta in più, con il nome accessibile.
    const refresh = button(el, 'refresh')!;
    expect(refresh.getAttribute('aria-label')).toBe('Aggiorna');
    expect(footer(el)!.firstElementChild).toBe(refresh);
    const before = requests.length;
    refresh.click();
    await until(() => requests.length === before + 1, 'ricarica');
    // Riscontro immediato: l'icona gira anche se la risposta è istantanea, poi si ferma dopo il giro minimo.
    await settle();
    expect(refresh.classList.contains('busy')).toBe(true);
    expect(refresh.getAttribute('aria-busy')).toBe('true');
    // E lo spinner al centro della tabella, con il messaggio, compare subito (senza il ritardo dei caricamenti normali).
    expect(el.querySelector('lc-data-table lc-busy .overlay .label')?.textContent?.trim()).toBe('Caricamento…');
    // Un secondo clic mentre gira non ripete la richiesta.
    refresh.click();
    await settle();
    expect(requests).toHaveLength(before + 1);
    await until(() => !refresh.classList.contains('busy'), 'fine del giro');
  });

  it('tabella paginata dal servizio: «ultima» chiede l’ultima pagina', async () => {
    const { el, until, requests } = await renderScreen({
      dataSources: { ordini: { type: 'rest', method: 'GET', url: '/api/ordini', paging: 'server', params: { page: '{{ state.page }}' } } },
      components: [{ type: 'table', source: 'ordini', refreshable: true, columns: [{ field: 'nome', label: 'Nome' }] }],
      respond: (r) => {
        const page = Number(r.query?.['page'] ?? 0);
        return { items: rows(10).map((x, i) => ({ nome: `P${page} ${i}` })), page, size: 10, total: 45 };
      },
    });
    await until(() => !!button(el, 'last'), 'pagine');
    button(el, 'last')!.click();
    await until(() => firstCell(el) === 'P4 0', 'ultima pagina');
    expect(requests.at(-1)?.query).toMatchObject({ page: 4 });
    expect(button(el, 'last')?.disabled).toBe(true);
  });
});
