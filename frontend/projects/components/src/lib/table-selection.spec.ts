import type { NodeDefinition } from 'schema';
import { columnTexts, plain, renderScreen } from './screen-testing';

describe('row selection and bulk actions', () => {
  const rows = [
    { id: 1, number: 'F-1', status: 'draft' },
    { id: 2, number: 'F-2', status: 'sent' },
    { id: 3, number: 'F-3', status: 'draft' },
  ];
  const table: NodeDefinition = {
    type: 'table',
    source: 'data',
    selection: { bind: 'state.chosen' },
    columns: [{ field: 'number', label: 'Number' }],
    bulkActions: [
      {
        label: 'Send {{ size(selection) }}',
        enabledIf: "{{ size(selection) > 0 && selection.all(r, r.status == 'draft') }}",
        onClick: [{ call: 'send', args: { ids: '{{ selection.map(r, r.id) }}' } }, { toast: 'Sent' }],
      },
    ],
  };
  const dataSources = {
    data: { type: 'rest' as const, method: 'GET' as const, url: '/api/data' },
    send: { type: 'rest' as const, method: 'POST' as const, url: '/api/send', body: { ids: '{{ids}}' } },
  };
  const boxes = (el: HTMLElement): HTMLInputElement[] => [...el.querySelectorAll<HTMLInputElement>('nz-table input[type="checkbox"]')];
  const bulkButton = (el: HTMLElement): HTMLButtonElement => el.querySelector('.bulk button') as HTMLButtonElement;

  it('a checkbox per row and one for all; the actions see the chosen rows', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: (r) => (r.method === 'GET' ? rows : {}) });
    await h.until(() => columnTexts(h.el, 1).length === 3, 'rows');
    // 1 checkbox in the header + 3 in the rows
    expect(boxes(h.el)).toHaveLength(4);
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('Nessuna riga selezionata');
    expect(bulkButton(h.el).disabled).toBe(true);
    boxes(h.el)[1].click();
    boxes(h.el)[3].click();
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('2 righe selezionate');
    expect(plain(bulkButton(h.el).textContent)).toBe('Send 2');
    expect(bulkButton(h.el).disabled).toBe(false);
    expect(h.el.querySelectorAll('tr.ant-table-row-selected')).toHaveLength(2);
    bulkButton(h.el).click();
    await h.until(() => h.toasts.length > 0, 'action run');
    expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ ids: [1, 3] });
  });

  it('the header checkbox chooses all or nothing and the action is disabled when the rule does not hold', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 1).length === 3, 'rows');
    boxes(h.el)[0].click();
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('3 righe selezionate');
    // F-2 is not a draft: the action stays disabled.
    expect(bulkButton(h.el).disabled).toBe(true);
    boxes(h.el)[0].click();
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('Nessuna riga selezionata');
  });

  it('keys of rows that are no longer there leave the selection', async () => {
    let data = rows;
    const h = await renderScreen({
      components: [table, { type: 'button', label: 'Reload', onClick: [{ refresh: 'data' }] }],
      dataSources,
      respond: () => data,
    });
    await h.until(() => columnTexts(h.el, 1).length === 3, 'rows');
    boxes(h.el)[1].click();
    boxes(h.el)[2].click();
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('2 righe selezionate');
    data = rows.slice(1);
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Reload')) as HTMLButtonElement).click();
    await h.until(() => columnTexts(h.el, 1).length === 2, 'rows reloaded');
    await h.settle();
    expect(plain(h.el.querySelector('.bulk .count')?.textContent)).toBe('1 riga selezionata');
  });
});
