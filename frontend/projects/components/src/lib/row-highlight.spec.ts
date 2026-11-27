import type { NodeDefinition } from 'schema';
import { renderScreen } from './screen-testing';

describe('highlighted rows and cards (highlight)', () => {
  const rows = [
    { id: 1, key: 'ODT-1', status: 'todo', flagged: true },
    { id: 2, key: 'ODT-2', status: 'todo', flagged: false },
  ];
  const dataSources = { data: { type: 'rest' as const, method: 'GET' as const, url: '/api/issues' } };
  const highlight = { when: '{{ row.flagged }}', icon: 'flag', label: 'Flagged {{ row.key }}' };
  const marks = (el: HTMLElement): (string | null)[] => [...el.querySelectorAll('.mark')].map((m) => m.getAttribute('aria-label'));

  it('table: the rows for which when is true take the tone and, in the first cell, an icon with a name', async () => {
    const h = await renderScreen({
      components: [{ type: 'table', source: 'data', columns: [{ field: 'key', label: 'Key' }, { field: 'status', label: 'Status' }], highlight } as NodeDefinition],
      dataSources,
      respond: () => rows,
    });
    await h.until(() => h.el.querySelectorAll('tbody tr').length === 2, 'rows');
    const [flagged, plain] = [...h.el.querySelectorAll<HTMLElement>('tbody tr')];
    expect(flagged.classList).toContain('lc-highlighted');
    expect(flagged.style.getPropertyValue('--lc-highlight-bg')).toContain('--ant-warning-color-deprecated-bg');
    expect(plain.classList).not.toContain('lc-highlighted');
    // Not by colour alone: the mark has a role and a name, and a tooltip with the same text.
    const mark = flagged.querySelector('td:first-child .mark')!;
    expect(mark.getAttribute('role')).toBe('img');
    expect(mark.getAttribute('title')).toBe('Flagged ODT-1');
    expect(mark.querySelector('[nz-icon]')?.classList).toContain('anticon-flag');
    expect(marks(h.el)).toEqual(['Flagged ODT-1']);
    expect(h.reports).toEqual([]);
  });

  it('kanban: the highlighted card takes the tone and a mark before the title', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'kanban',
          source: 'data',
          columnField: 'status',
          titleField: 'key',
          columns: [{ value: 'todo', label: 'To do' }],
          highlight: { ...highlight, tone: 'danger' },
        } as NodeDefinition,
      ],
      dataSources,
      respond: () => rows,
    });
    await h.until(() => h.el.querySelectorAll('li.card').length === 2, 'cards');
    const [flagged, plain] = [...h.el.querySelectorAll<HTMLElement>('li.card')];
    expect(flagged.classList).toContain('highlighted');
    expect(flagged.style.getPropertyValue('--lc-highlight-edge')).toContain('--ant-error-color');
    expect(plain.classList).not.toContain('highlighted');
    expect(flagged.querySelector('.headline > .mark + .title')?.textContent).toBe('ODT-1');
    expect(marks(h.el)).toEqual(['Flagged ODT-1']);
    expect(h.reports).toEqual([]);
  });

  it('an expression in error highlights nothing and is reported; an empty label falls back to «Highlighted»', async () => {
    const h = await renderScreen({
      components: [
        { type: 'table', id: 'broken', source: 'data', columns: [{ field: 'key', label: 'Key' }], highlight: { when: '{{ row.flagged + 1 }}', label: 'x' } } as NodeDefinition,
        { type: 'table', id: 'nameless', source: 'data', columns: [{ field: 'key', label: 'Key' }], highlight: { when: '{{ row.flagged }}', label: '' } } as NodeDefinition,
      ],
      dataSources,
      respond: () => rows,
    });
    await h.until(() => h.el.querySelectorAll('tbody tr').length === 4, 'rows');
    const [broken, nameless] = [...h.el.querySelectorAll<HTMLElement>('lc-table')];
    expect(broken.querySelectorAll('.lc-highlighted')).toHaveLength(0);
    expect(h.reports.length).toBeGreaterThan(0);
    expect(nameless.querySelectorAll('.lc-highlighted')).toHaveLength(1);
    // Without an icon, the warning mark.
    expect(nameless.querySelector('.mark')?.getAttribute('aria-label')).toBe('Highlighted');
    expect(nameless.querySelector('.mark [nz-icon]')?.classList).toContain('anticon-exclamation-circle');
  });
});
