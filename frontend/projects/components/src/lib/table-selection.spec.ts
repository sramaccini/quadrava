import type { NodeDefinition } from 'schema';
import { columnTexts, plain, renderScreen } from './screen-testing';

describe('selezione delle righe e azioni multiple', () => {
  const rows = [
    { id: 1, numero: 'F-1', stato: 'bozza' },
    { id: 2, numero: 'F-2', stato: 'inviata' },
    { id: 3, numero: 'F-3', stato: 'bozza' },
  ];
  const table: NodeDefinition = {
    type: 'table',
    source: 'dati',
    selection: { bind: 'state.scelte' },
    columns: [{ field: 'numero', label: 'Numero' }],
    bulkActions: [
      {
        label: 'Invia {{ size(selection) }}',
        enabledIf: "{{ size(selection) > 0 && selection.all(r, r.stato == 'bozza') }}",
        onClick: [{ call: 'invia', args: { ids: '{{ selection.map(r, r.id) }}' } }, { toast: 'Inviate' }],
      },
    ],
  };
  const dataSources = {
    dati: { type: 'rest' as const, method: 'GET' as const, url: '/api/dati' },
    invia: { type: 'rest' as const, method: 'POST' as const, url: '/api/invia', body: { ids: '{{ids}}' } },
  };
  const boxes = (el: HTMLElement): HTMLInputElement[] => [...el.querySelectorAll<HTMLInputElement>('nz-table input[type="checkbox"]')];
  const bulkButton = (el: HTMLElement): HTMLButtonElement => el.querySelector('.bulk button') as HTMLButtonElement;

  it('una casella per riga e una per tutte; le azioni vedono le righe scelte', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: (r) => (r.method === 'GET' ? rows : {}) });
    await h.until(() => columnTexts(h.el, 1).length === 3, 'righe');
    // 1 casella nell'intestazione + 3 nelle righe
    expect(boxes(h.el)).toHaveLength(4);
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('Nessuna riga selezionata');
    expect(bulkButton(h.el).disabled).toBe(true);
    boxes(h.el)[1].click();
    boxes(h.el)[3].click();
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('2 righe selezionate');
    expect(plain(bulkButton(h.el).textContent)).toBe('Invia 2');
    expect(bulkButton(h.el).disabled).toBe(false);
    expect(h.el.querySelectorAll('tr.ant-table-row-selected')).toHaveLength(2);
    bulkButton(h.el).click();
    await h.until(() => h.toasts.length > 0, 'azione eseguita');
    expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ ids: [1, 3] });
  });

  it('la casella dell’intestazione sceglie tutto o niente e l’azione si disabilita se la regola non vale', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 1).length === 3, 'righe');
    boxes(h.el)[0].click();
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('3 righe selezionate');
    // F-2 non è in bozza: l'azione resta disabilitata.
    expect(bulkButton(h.el).disabled).toBe(true);
    boxes(h.el)[0].click();
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('Nessuna riga selezionata');
  });

  it('le chiavi delle righe che non ci sono più escono dalla selezione', async () => {
    let data = rows;
    const h = await renderScreen({
      components: [table, { type: 'button', label: 'Ricarica', onClick: [{ refresh: 'dati' }] }],
      dataSources,
      respond: () => data,
    });
    await h.until(() => columnTexts(h.el, 1).length === 3, 'righe');
    boxes(h.el)[1].click();
    boxes(h.el)[2].click();
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('2 righe selezionate');
    data = rows.slice(1);
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Ricarica')) as HTMLButtonElement).click();
    await h.until(() => columnTexts(h.el, 1).length === 2, 'righe ricaricate');
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('1 riga selezionata');
  });
});
