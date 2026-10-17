import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('indicators (KPI)', () => {
  const stats: NodeDefinition = {
    type: 'stats',
    source: 'summary',
    items: [
      { label: 'Revenue', field: 'revenue', format: 'currency', tone: 'success', tooltip: 'Invoices issued' },
      { label: 'Open invoices', field: 'open', format: 'number', decimals: 0, caption: 'of {{ row.total }} in total' },
      { label: 'Average receipt', value: '{{ row.revenue / row.total }}', format: 'currency' },
      { label: 'Managers only', field: 'restricted', visibleIf: "{{ can('dashboard.data.restricted') }}" },
      { label: 'No data', field: 'missing' },
    ],
  };
  const dataSources = { summary: { type: 'rest' as const, method: 'GET' as const, url: '/api/summary' } };
  const values = (el: HTMLElement): string[] => [...el.querySelectorAll('lc-stats .value')].map((v) => plain(v.textContent));

  it('shows labels and values formatted from a field or an expression, with tone, caption and visibility', async () => {
    const h = await renderScreen({ components: [stats], dataSources, respond: () => ({ revenue: 12000, open: 7, total: 20, restricted: 'x' }) });
    await h.until(() => values(h.el)[0] !== '…', 'values');
    expect([...h.el.querySelectorAll('lc-stats dt')].map((d) => plain(d.textContent))).toEqual(['Revenue', 'Open invoices', 'Average receipt', 'No data']);
    expect(values(h.el)).toEqual(['€12,000.00', '7', '€600.00', '—']);
    expect(plain(h.el.querySelector('lc-stats .caption')?.textContent)).toBe('of 20 in total');
    expect((h.el.querySelector('lc-stats .value') as HTMLElement).style.color).toContain('--lc-color-success');
    expect(h.el.querySelector('lc-stats dt .help')?.getAttribute('aria-label')).toBe('Invoices issued');
  });

  it('a service error becomes a message, not a wrong indicator', async () => {
    const h = await renderScreen({
      components: [stats],
      dataSources,
      respond: () => {
        throw new Error('500');
      },
    });
    await h.until(() => !!h.el.querySelector('lc-stats [role="alert"]'), 'error');
    expect(h.el.querySelector('lc-stats dl')).toBeNull();
  });
});
