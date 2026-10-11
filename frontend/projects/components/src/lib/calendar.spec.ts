import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { dayKey, parseMonth, rowDay } from './calendar.component';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('calendario', () => {
  it('giorni e mesi: conversioni senza fuso orario', () => {
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
    const m = String(r.query?.['mese']);
    return [
      { id: 1, data: `${m}-10`, titolo: 'Fattura A', stato: 'scaduta' },
      { id: 2, data: `${m}-10T09:00`, titolo: 'Fattura B', stato: 'pagata' },
      { id: 3, data: `${m}-10`, titolo: 'Fattura C' },
      { id: 4, data: `${m}-20`, titolo: 'Riunione' },
    ];
  };
  const calendar: NodeDefinition = {
    type: 'calendar',
    source: 'scadenze',
    dateField: 'data',
    labelField: 'titolo',
    badgeField: 'stato',
    badges: { scaduta: 'danger', pagata: 'success' },
    bind: 'state.mese',
    maxPerDay: 2,
    onSelect: [{ toast: 'aperta {{ row.titolo }}' }],
  };
  const dataSources = { scadenze: { type: 'rest' as const, method: 'GET' as const, url: '/api/scadenze', params: { mese: '{{ state.mese }}' } } };
  const eventButtons = (h: ScreenHarness): HTMLButtonElement[] => [...h.el.querySelectorAll<HTMLButtonElement>('lc-calendar button.event')];

  it('parte dal mese corrente, mostra gli eventi nei giorni con colore e «+n», e il clic esegue onSelect', async () => {
    const h = await renderScreen({ components: [calendar], dataSources, respond: events });
    expect(h.requests[0].query).toEqual({ mese: month });
    await h.until(() => eventButtons(h).length > 0, 'eventi');
    // Il giorno 10 ha tre eventi: due visibili e «+1 altri».
    expect(eventButtons(h).map((b) => plain(b.textContent))).toEqual(['Fattura A', 'Fattura B', 'Riunione']);
    expect(plain(h.el.querySelector('lc-calendar .more')?.textContent)).toBe('+1 altri');
    expect((eventButtons(h)[0].querySelector('.dot') as HTMLElement).style.background).toContain('--lc-color-danger');
    expect(eventButtons(h)[0].getAttribute('aria-label')).toMatch(/^Fattura A, 10 /);
    eventButtons(h)[1].click();
    await h.until(() => h.toasts.length === 1, 'evento aperto');
    expect(h.toasts).toEqual(['aperta Fattura B']);
  });

  it('i pulsanti del mese cambiano lo stato e il data source carica il mese nuovo', async () => {
    const h = await renderScreen({ components: [calendar], dataSources, respond: events });
    const title = (): string => plain(h.el.querySelector('lc-calendar .header h3')?.textContent);
    const first = title();
    (h.el.querySelector('lc-calendar .header button[aria-label="Mese successivo"]') as HTMLButtonElement).click();
    await h.until(() => h.requests.at(-1)?.query?.['mese'] === nextMonth, 'mese successivo');
    expect(title()).not.toBe(first);
    ([...h.el.querySelectorAll<HTMLButtonElement>('lc-calendar .header button')].find((b) => plain(b.textContent) === 'Oggi'))!.click();
    await h.until(() => h.requests.at(-1)?.query?.['mese'] === month, 'mese corrente');
    expect(title()).toBe(first);
  });
});
