import type { NodeDefinition } from 'schema';
import { columnTexts, plain, renderScreen } from './screen-testing';

describe('expandable detail rows', () => {
  const rows = [
    { id: 1, number: 'O-1', note: 'Deliver in the morning', lines: 3 },
    { id: 2, number: 'O-2', note: null, lines: 0 },
  ];
  const table: NodeDefinition = {
    type: 'table',
    source: 'data',
    columns: [{ field: 'number', label: 'Number' }],
    expand: {
      expandIf: '{{ row.lines > 0 }}',
      components: [
        { type: 'text', text: 'Notes of {{ row.number }}: {{ row.note }}' },
        { type: 'button', label: 'Flag', onClick: [{ toast: 'flagged {{ row.id }}' }] },
      ],
    },
  };
  const dataSources = { data: { type: 'rest' as const, method: 'GET' as const, url: '/api/data' } };

  it('opens and closes the area under the row; the nodes see the row; expandIf decides which rows open', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond: () => rows });
    await h.until(() => columnTexts(h.el, 1).length === 2, 'lines');
    const toggles = [...h.el.querySelectorAll<HTMLButtonElement>('button.ant-table-row-expand-icon')];
    // The second row has no lines: no button.
    expect(toggles).toHaveLength(1);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[0].getAttribute('aria-label')).toBe('Mostra i dettagli della riga');
    toggles[0].click();
    await h.settle();
    const area = h.el.querySelector('tr.lc-extra-row');
    expect(plain(area?.textContent)).toContain('Notes of O-1: Deliver in the morning');
    expect(area?.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    (area!.querySelector('button') as HTMLButtonElement).click();
    await h.until(() => h.toasts.length === 1, 'action in the area');
    expect(h.toasts).toEqual(['flagged 1']);
    toggles[0].click();
    await h.settle();
    expect(h.el.querySelector('tr.lc-extra-row')).toBeNull();
  });
});
