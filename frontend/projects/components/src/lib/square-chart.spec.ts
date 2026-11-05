import { plain, renderScreen } from './screen-testing';

describe('square chart', () => {
  it('draws square columns with values and an equivalent accessible table', async () => {
    const h = await renderScreen({
      components: [{ type: 'squareChart', source: 'activity', categoryField: 'day', valueField: 'count', caption: 'Activity' }],
      dataSources: { activity: { type: 'rest', method: 'GET', url: '/api/activity' } },
      respond: () => [{ day: '2026-05-01', count: 4 }, { day: '2026-05-02', count: 10 }],
    });
    await h.until(() => h.el.querySelectorAll('lc-square-chart rect').length === 24, 'square columns');
    expect(h.el.querySelector('lc-square-chart table caption')?.textContent).toBe('Activity');
    expect(plain(h.el.querySelector('lc-square-chart table tbody')?.textContent)).toContain('10');
    expect(h.reports).toEqual([]);
  });
});
