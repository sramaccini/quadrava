import type { NodeDefinition } from 'schema';
import { niceScale, pieSlices } from './chart-geometry';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('charts', () => {
  it('round scale including zero', () => {
    expect(niceScale([12, 87])).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(niceScale([1200, 5300])).toEqual({ min: 0, max: 6000, ticks: [0, 2000, 4000, 6000] });
    expect(niceScale([-30, 40]).min).toBeLessThan(0);
    expect(niceScale([])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it('pie slices proportional; zeros and negatives without a slice; a single slice is a full circle', () => {
    const slices = pieSlices([1, 3, 0, -2], 100, 100, 80, 40);
    expect(slices.map((s) => s.share)).toEqual([0.25, 0.75, 0, 0]);
    expect(slices[0].path).toMatch(/^M100\.00,20\.00 A80,80 0 0 1 180\.00,100\.00/);
    expect(slices[2].path).toBe('');
    expect(pieSlices([5], 100, 100, 80, 40)[0].path).toContain('A80,80 0 1 1');
  });

  const rows = [
    { period: '2026-01', incoming: 1200, outgoing: 800 },
    { period: '2026-02', incoming: 1500, outgoing: null },
    { period: '2026-03', incoming: 900, outgoing: 1100 },
  ];
  const chart = (kind: 'bar' | 'line' | 'pie'): NodeDefinition => ({
    type: 'chart',
    kind,
    source: 'sales',
    categoryField: 'period',
    categoryFormat: 'month',
    series: [{ field: 'incoming', label: 'Incoming' }, { field: 'outgoing', label: 'Outgoing', tone: 'danger' }],
    format: 'currency',
    caption: 'Sales by month',
  });
  const dataSources = { sales: { type: 'rest' as const, method: 'GET' as const, url: '/api/sales' } };
  const render = (kind: 'bar' | 'line' | 'pie'): Promise<ScreenHarness> => renderScreen({ components: [chart(kind)], dataSources, respond: () => rows });

  it('bars: one per value, with the series colour, value on hover, legend and equivalent table', async () => {
    const h = await render('bar');
    await h.until(() => h.el.querySelectorAll('lc-chart rect.mark').length > 0, 'bars');
    // 3 incoming + 2 outgoing (one value is missing)
    const bars = [...h.el.querySelectorAll('lc-chart rect.mark')];
    expect(bars).toHaveLength(5);
    expect(plain(bars[0].querySelector('title')?.textContent)).toBe('Jan 26 · Incoming: €1,200.00');
    expect(bars[3].getAttribute('fill')).toContain('--lc-color-danger');
    expect(h.el.querySelector('lc-chart svg')?.getAttribute('aria-hidden')).toBe('true');
    expect([...h.el.querySelectorAll('lc-chart .legend li')].map((li) => plain(li.textContent))).toEqual(['Incoming', 'Outgoing']);
    const table = h.el.querySelector('lc-chart table') as HTMLTableElement;
    expect(plain(table.caption?.textContent)).toBe('Sales by month');
    expect([...table.tBodies[0].rows].map((r) => [...r.cells].map((c) => plain(c.textContent)).join(' | '))).toEqual(['Jan 26 | €1,200.00 | €800.00', 'Feb 26 | €1,500.00 | —', 'Mar 26 | €900.00 | €1,100.00']);
    // Taller bars start higher: the scale is consistent.
    const height = (i: number): number => Number(bars[i].getAttribute('height'));
    expect(height(1)).toBeGreaterThan(height(0));
  });

  it('lines: one polyline per series with its points', async () => {
    const h = await render('line');
    await h.until(() => h.el.querySelectorAll('lc-chart polyline').length === 2, 'lines');
    expect(h.el.querySelectorAll('lc-chart circle')).toHaveLength(5);
    expect(h.el.querySelectorAll('lc-chart polyline')[0].getAttribute('points')?.split(' ')).toHaveLength(3);
  });

  it('pie: slices of the first series, total in the centre and legend of the categories', async () => {
    const h = await render('pie');
    await h.until(() => h.el.querySelectorAll('lc-chart path.mark').length === 3, 'slices');
    expect(plain(h.el.querySelector('lc-chart text.total')?.textContent)).toBe('€3,600.00');
    expect(plain(h.el.querySelector('lc-chart path.mark title')?.textContent)).toBe('Jan 26: €1,200.00 (33.3%)');
    expect([...h.el.querySelectorAll('lc-chart .legend li')].map((li) => plain(li.textContent))).toEqual(['Jan 26', 'Feb 26', 'Mar 26']);
  });

  describe('stacked, dual axis, combined', () => {
    const data = [
      { period: '2026-01', a: 100, b: 50, margin: 12.5 },
      { period: '2026-02', a: 200, b: -40, margin: 8 },
    ];
    const renderWith = (extra: Record<string, unknown>): Promise<ScreenHarness> =>
      renderScreen({
        components: [{ type: 'chart', kind: 'bar', source: 'sales', categoryField: 'period', categoryFormat: 'month', format: 'currency', ...extra } as NodeDefinition],
        dataSources,
        respond: () => data,
      });
    const rect = (el: Element): { y: number; h: number; x: number } => ({ x: Number(el.getAttribute('x')), y: Number(el.getAttribute('y')), h: Number(el.getAttribute('height')) });

    it('stacked bars: one column per category, pieces one on top of the other and negatives downwards', async () => {
      const h = await renderWith({ stacked: true, series: [{ field: 'a', label: 'To' }, { field: 'b', label: 'B' }] });
      await h.until(() => h.el.querySelectorAll('lc-chart rect.mark').length === 4, 'bars');
      const [a1, b1, a2, b2] = [...h.el.querySelectorAll('lc-chart rect.mark')].map(rect);
      // Same column for the two series of the same category.
      expect(b1.x).toBe(a1.x);
      // B (positive) sits on top of A: it ends where A begins.
      expect(Math.abs(b1.y + b1.h - a1.y)).toBeLessThan(0.01);
      // B negative in the second month starts from zero and goes down: it begins where A ends (starting from zero).
      expect(Math.abs(b2.y - (a2.y + a2.h))).toBeLessThan(0.01);
      // The scale includes the stacked sum (100 + 50) and the negative.
      expect([...h.el.querySelectorAll('lc-chart text.axis')].map((t) => plain(t.textContent))).toContain('-€100');
    });

    it('combined chart with right axis: bars in euro and a line in percent', async () => {
      const h = await renderWith({
        rightFormat: 'percent',
        series: [{ field: 'a', label: 'Revenue' }, { field: 'margin', label: 'Margin', kind: 'line', axis: 'right', tone: 'success' }],
      });
      await h.until(() => h.el.querySelectorAll('lc-chart rect.mark').length === 2, 'bars');
      expect(h.el.querySelectorAll('lc-chart polyline')).toHaveLength(1);
      const right = [...h.el.querySelectorAll('lc-chart text.axis.right')].map((t) => plain(t.textContent));
      expect(right[0]).toBe('0 %');
      expect(right.at(-1)).toMatch(/^\d+ %$/);
      expect([...h.el.querySelectorAll('lc-chart .legend li')].map((li) => plain(li.textContent))).toEqual(['Revenue', 'Margin (right axis)']);
      expect(plain(h.el.querySelector('lc-chart circle title')?.textContent)).toBe('Jan 26 · Margin: 12.5 %');
      expect([...(h.el.querySelector('lc-chart table') as HTMLTableElement).tBodies[0].rows[0].cells].map((c) => plain(c.textContent))).toEqual(['Jan 26', '€100.00', '12.5 %']);
    });
  });
});
