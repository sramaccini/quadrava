import type { NodeDefinition } from 'schema';
import { niceScale, pieSlices } from './chart-geometry';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('grafici', () => {
  it('scala tonda che comprende lo zero', () => {
    expect(niceScale([12, 87])).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(niceScale([1200, 5300])).toEqual({ min: 0, max: 6000, ticks: [0, 2000, 4000, 6000] });
    expect(niceScale([-30, 40]).min).toBeLessThan(0);
    expect(niceScale([])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it('fette della torta proporzionali; zeri e negativi senza fetta; una sola fetta è un cerchio intero', () => {
    const slices = pieSlices([1, 3, 0, -2], 100, 100, 80, 40);
    expect(slices.map((s) => s.share)).toEqual([0.25, 0.75, 0, 0]);
    expect(slices[0].path).toMatch(/^M100\.00,20\.00 A80,80 0 0 1 180\.00,100\.00/);
    expect(slices[2].path).toBe('');
    expect(pieSlices([5], 100, 100, 80, 40)[0].path).toContain('A80,80 0 1 1');
  });

  const rows = [
    { mese: '2026-01', attive: 1200, passive: 800 },
    { mese: '2026-02', attive: 1500, passive: null },
    { mese: '2026-03', attive: 900, passive: 1100 },
  ];
  const chart = (kind: 'bar' | 'line' | 'pie'): NodeDefinition => ({
    type: 'chart',
    kind,
    source: 'vendite',
    categoryField: 'mese',
    categoryFormat: 'month',
    series: [{ field: 'attive', label: 'Attive' }, { field: 'passive', label: 'Passive', tone: 'danger' }],
    format: 'currency',
    caption: 'Vendite per mese',
  });
  const dataSources = { vendite: { type: 'rest' as const, method: 'GET' as const, url: '/api/vendite' } };
  const render = (kind: 'bar' | 'line' | 'pie'): Promise<ScreenHarness> => renderScreen({ components: [chart(kind)], dataSources, respond: () => rows });

  it('barre: una per valore, con colore della serie, valore al passaggio del mouse, legenda e tabella equivalente', async () => {
    const h = await render('bar');
    await h.until(() => h.el.querySelectorAll('lc-chart rect.mark').length > 0, 'barre');
    // 3 attive + 2 passive (un valore manca)
    const bars = [...h.el.querySelectorAll('lc-chart rect.mark')];
    expect(bars).toHaveLength(5);
    expect(plain(bars[0].querySelector('title')?.textContent)).toBe('gen 26 · Attive: 1200,00 €');
    expect(bars[3].getAttribute('fill')).toContain('--lc-color-danger');
    expect(h.el.querySelector('lc-chart svg')?.getAttribute('aria-hidden')).toBe('true');
    expect([...h.el.querySelectorAll('lc-chart .legend li')].map((li) => plain(li.textContent))).toEqual(['Attive', 'Passive']);
    const table = h.el.querySelector('lc-chart table') as HTMLTableElement;
    expect(plain(table.caption?.textContent)).toBe('Vendite per mese');
    expect([...table.tBodies[0].rows].map((r) => [...r.cells].map((c) => plain(c.textContent)).join(' | '))).toEqual(['gen 26 | 1200,00 € | 800,00 €', 'feb 26 | 1500,00 € | —', 'mar 26 | 900,00 € | 1100,00 €']);
    // Le barre più alte partono più in alto: la scala è coerente.
    const height = (i: number): number => Number(bars[i].getAttribute('height'));
    expect(height(1)).toBeGreaterThan(height(0));
  });

  it('linee: una spezzata per serie con i punti', async () => {
    const h = await render('line');
    await h.until(() => h.el.querySelectorAll('lc-chart polyline').length === 2, 'linee');
    expect(h.el.querySelectorAll('lc-chart circle')).toHaveLength(5);
    expect(h.el.querySelectorAll('lc-chart polyline')[0].getAttribute('points')?.split(' ')).toHaveLength(3);
  });

  it('torta: fette della prima serie, totale al centro e legenda delle categorie', async () => {
    const h = await render('pie');
    await h.until(() => h.el.querySelectorAll('lc-chart path.mark').length === 3, 'fette');
    expect(plain(h.el.querySelector('lc-chart text.total')?.textContent)).toBe('3600,00 €');
    expect(plain(h.el.querySelector('lc-chart path.mark title')?.textContent)).toBe('gen 26: 1200,00 € (33,3%)');
    expect([...h.el.querySelectorAll('lc-chart .legend li')].map((li) => plain(li.textContent))).toEqual(['gen 26', 'feb 26', 'mar 26']);
  });
});
