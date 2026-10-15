import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { dayKey, parseMonth, rowDay } from './calendar.component';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('calendar', () => {
  it('days and months: conversions without time zone', () => {
    expect(dayKey(new Date(2026, 9, 7))).toBe('2026-10-07');
    expect(rowDay('2026-10-07T14:30')).toBe('2026-10-07');
    expect(rowDay('7 ottobre')).toBeNull();
    expect(parseMonth('2026-10')?.getMonth()).toBe(9);
    expect(parseMonth('2026-13')).toBeNull();
  });

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  const events = (r: DataRequest) => {
    const m = String(r.query?.['month']);
    return [
      { id: 1, data: `${m}-10`, title: 'Invoice A', status: 'overdue' },
      { id: 2, data: `${m}-10T09:00`, title: 'Invoice B', status: 'paid' },
      { id: 3, data: `${m}-10`, title: 'Invoice C' },
      { id: 4, data: `${m}-20`, title: 'Meeting' },
    ];
  };
  const calendar: NodeDefinition = {
    type: 'calendar',
    source: 'deadlines',
    dateField: 'data',
    labelField: 'title',
    badgeField: 'status',
    badges: { overdue: 'danger', paid: 'success' },
    bind: 'state.month',
    maxPerDay: 2,
    onSelect: [{ toast: 'opened {{ row.title }}' }],
  };
  const dataSources = { deadlines: { type: 'rest' as const, method: 'GET' as const, url: '/api/deadlines', params: { month: '{{ state.month }}' } } };
  const eventButtons = (h: ScreenHarness): HTMLButtonElement[] => [...h.el.querySelectorAll<HTMLButtonElement>('lc-calendar button.event')];

  it('starts from the current month, shows the events in the days with colour and «+n», and a click runs onSelect', async () => {
    const h = await renderScreen({ components: [calendar], dataSources, respond: events });
    expect(h.requests[0].query).toEqual({ month: month });
    await h.until(() => eventButtons(h).length > 0, 'events');
    // Day 10 has three events: two visible and «+1 altri».
    expect(eventButtons(h).map((b) => plain(b.textContent))).toEqual(['Invoice A', 'Invoice B', 'Meeting']);
    expect(plain(h.el.querySelector('lc-calendar .more')?.textContent)).toBe('+1 altri');
    expect((eventButtons(h)[0].querySelector('.dot') as HTMLElement).style.background).toContain('--lc-color-danger');
    expect(eventButtons(h)[0].getAttribute('aria-label')).toMatch(/^Invoice A, 10 /);
    eventButtons(h)[1].click();
    await h.until(() => h.toasts.length === 1, 'event opened');
    expect(h.toasts).toEqual(['opened Invoice B']);
  });

  it('the month buttons change the state and the data source loads the new month', async () => {
    const h = await renderScreen({ components: [calendar], dataSources, respond: events });
    const title = (): string => plain(h.el.querySelector('lc-calendar .header h3')?.textContent);
    const first = title();
    (h.el.querySelector('lc-calendar .header button[aria-label="Mese successivo"]') as HTMLButtonElement).click();
    await h.until(() => h.requests.at(-1)?.query?.['month'] === nextMonth, 'next month');
    expect(title()).not.toBe(first);
    ([...h.el.querySelectorAll<HTMLButtonElement>('lc-calendar .header button')].find((b) => plain(b.textContent) === 'Oggi'))!.click();
    await h.until(() => h.requests.at(-1)?.query?.['month'] === month, 'current month');
    expect(title()).toBe(first);
  });
});
