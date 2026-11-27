import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('relative dates and the narrow detail', () => {
  const hoursAgo = (n: number): string => new Date(Date.now() - n * 3_600_000).toISOString();
  const dataSources = {
    issue: { type: 'rest' as const, method: 'GET' as const, url: '/api/issue' },
    issues: { type: 'rest' as const, method: 'GET' as const, url: '/api/issues' },
  };

  it('a table cell with format relative shows the distance, the full date as tooltip and, for screen readers, as text', async () => {
    const h = await renderScreen({
      components: [{ type: 'table', source: 'issues', columns: [{ field: 'key', label: 'Key' }, { field: 'created', label: 'Created', format: 'relative' }] } as NodeDefinition],
      dataSources,
      respond: () => [{ key: 'ODT-1', created: hoursAgo(3) }],
    });
    await h.until(() => h.el.querySelectorAll('tbody tr').length === 1, 'rows');
    const cell = h.el.querySelectorAll('tbody td')[1];
    const shown = cell.querySelector('lc-formatted-value span[title]')!;
    expect(shown.textContent).toBe('3 hours ago');
    expect(shown.getAttribute('title')).toMatch(/\d{4}/);
    expect(plain(cell.querySelector('.visually-hidden')?.textContent)).toBe(`(${shown.getAttribute('title')})`);
    expect(h.reports).toEqual([]);
  });

  it('the detail uses the same format; under 480 px of its own width it has one column, the label above the value', async () => {
    // jsdom has no ResizeObserver: a stand-in that reports the width the panel would have in a side column.
    const original = globalThis.ResizeObserver;
    let report: (width: number) => void = () => undefined;
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(): void {
        report = (width) => this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect(): void {}
      unobserve(): void {}
    } as unknown as typeof ResizeObserver;
    try {
      const h = await renderScreen({
        components: [{ type: 'detail', source: 'issue', fields: [{ field: 'key', label: 'Key' }, { field: 'updated', label: 'Updated', format: 'relative' }] } as NodeDefinition],
        dataSources,
        respond: () => ({ key: 'ODT-1', updated: hoursAgo(2) }),
      });
      await h.until(() => h.el.querySelectorAll('.ant-descriptions-item-label').length === 2, 'detail');
      expect(plain(h.el.querySelector('lc-formatted-value span[title]')?.textContent)).toBe('2 hours ago');

      report(300);
      await h.until(() => h.el.querySelectorAll('.ant-descriptions-row').length === 4, 'one column, vertical');
      // Vertical: every label is in a row of its own, and each row has a single cell.
      const rows = [...h.el.querySelectorAll('.ant-descriptions-row')];
      expect(rows.map((r) => r.children.length)).toEqual([1, 1, 1, 1]);
      expect(plain(rows[0].textContent)).toBe('Key');

      report(1000);
      await h.until(() => h.el.querySelectorAll('.ant-descriptions-row').length === 1, 'three columns, side by side');
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
