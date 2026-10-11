import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('indicatori (KPI)', () => {
  const stats: NodeDefinition = {
    type: 'stats',
    source: 'riepilogo',
    items: [
      { label: 'Fatturato', field: 'fatturato', format: 'currency', tone: 'success', tooltip: 'Fatture emesse' },
      { label: 'Fatture aperte', field: 'aperte', format: 'number', decimals: 0, caption: 'su {{ row.totale }} totali' },
      { label: 'Incasso medio', value: '{{ row.fatturato / row.totale }}', format: 'currency' },
      { label: 'Solo per i responsabili', field: 'riservato', visibleIf: "{{ can('cruscotto.dati.riservati') }}" },
      { label: 'Senza dato', field: 'mancante' },
    ],
  };
  const dataSources = { riepilogo: { type: 'rest' as const, method: 'GET' as const, url: '/api/riepilogo' } };
  const values = (el: HTMLElement): string[] => [...el.querySelectorAll('lc-stats .value')].map((v) => plain(v.textContent));

  it('mostra etichette e valori formattati da campo o da espressione, con tono, nota e visibilità', async () => {
    const h = await renderScreen({ components: [stats], dataSources, respond: () => ({ fatturato: 12000, aperte: 7, totale: 20, riservato: 'x' }) });
    await h.until(() => values(h.el)[0] !== '…', 'valori');
    expect([...h.el.querySelectorAll('lc-stats dt')].map((d) => plain(d.textContent))).toEqual(['Fatturato', 'Fatture aperte', 'Incasso medio', 'Senza dato']);
    expect(values(h.el)).toEqual(['12.000,00 €', '7', '600,00 €', '—']);
    expect(plain(h.el.querySelector('lc-stats .caption')?.textContent)).toBe('su 20 totali');
    expect((h.el.querySelector('lc-stats .value') as HTMLElement).style.color).toContain('--lc-color-success');
    expect(h.el.querySelector('lc-stats dt .help')?.getAttribute('aria-label')).toBe('Fatture emesse');
  });

  it('un errore del servizio diventa un messaggio, non un indicatore sbagliato', async () => {
    const h = await renderScreen({
      components: [stats],
      dataSources,
      respond: () => {
        throw new Error('500');
      },
    });
    await h.until(() => !!h.el.querySelector('lc-stats [role="alert"]'), 'errore');
    expect(h.el.querySelector('lc-stats dl')).toBeNull();
  });
});
