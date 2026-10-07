import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, Notifier, ScreenComponent, ScreenNavigator, UserProvider, type DataRequest } from 'core';
import type { ScreenDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'ordini-elenco',
  title: 'Ordini',
  requires: 'ordini.ordine.leggi',
  dataSources: {
    ordini: { type: 'rest', method: 'GET', url: '/api/ordini', params: { stato: '{{state.filtri.stato}}', page: '{{state.page}}' }, paging: 'server' },
    approvaOrdine: { type: 'rest', method: 'POST', url: '/api/ordini/{{id}}/approva' },
  },
  components: [
    { type: 'filterBar', bind: 'state.filtri', fields: [{ name: 'stato', type: 'select', label: 'Stato', options: ['bozza', 'inviato'] }] },
    {
      type: 'table',
      source: 'ordini',
      columns: [{ field: 'numero' }, { field: 'stato' }],
      rowActions: [
        {
          label: 'Approva',
          visibleIf: "{{can('ordini.ordine.approva') && row.stato == 'inviato'}}",
          onClick: [
            { call: 'approvaOrdine', args: { id: '{{row.id}}' }, onError: { toast: 'Approvazione non riuscita' } },
            { refresh: 'ordini' },
            { toast: 'Ordine {{row.numero}} approvato' },
          ],
        },
      ],
    },
  ],
};

const rows = [
  { id: 1, numero: 'A-1', stato: 'bozza' },
  { id: 2, numero: 'A-2', stato: 'inviato' },
];

describe('ScreenComponent + catalogo standard', () => {
  // Come l'implementazione reale di Authorization, i permessi sono un signal: un cambio ridisegna la schermata.
  const permissions = signal(new Set<string>());
  const grant = (p: string): void => permissions.update((s) => new Set(s).add(p));
  let requests: DataRequest[];
  let toasts: string[];

  async function render(): Promise<{ fixture: ComponentFixture<ScreenComponent>; el: HTMLElement }> {
    permissions.set(new Set(['ordini.ordine.leggi']));
    requests = [];
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: (p: string) => permissions().has(p) } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'u' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
        {
          provide: DataClient,
          useValue: {
            request: async (r: DataRequest) => {
              requests.push(r);
              return r.method === 'GET' ? { items: rows, total: 2, size: 10 } : {};
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', screen);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const buttons = (el: HTMLElement): string[] => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');

  it('mostra titolo e righe caricate', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent).toBe('Ordini');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(requests[0]).toEqual({ method: 'GET', url: '/api/ordini', query: { page: 0 } });
  });

  it('senza il permesso di approvazione non mostra il pulsante', async () => {
    const { el } = await render();
    expect(buttons(el)).not.toContain('Approva');
  });

  it('con il permesso mostra Approva solo sulle righe inviate', async () => {
    const { fixture, el } = await render();
    grant('ordini.ordine.approva');
    await settle(fixture);
    expect(buttons(el).filter((b) => b === 'Approva')).toHaveLength(1);
    expect(el.querySelectorAll('tbody tr')[1]?.textContent).toContain('Approva');
  });

  it('il click esegue la chiamata, ricarica la tabella e avvisa', async () => {
    const { fixture, el } = await render();
    grant('ordini.ordine.approva');
    await settle(fixture);
    const approva = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Approva') as HTMLButtonElement;
    approva.click();
    // I passi sono asincroni: attende la fine della sequenza (l'ultimo è il messaggio).
    for (let i = 0; i < 20 && toasts.length === 0; i++) await new Promise((r) => setTimeout(r));
    await settle(fixture);
    expect(requests.some((r) => r.method === 'POST' && r.url === '/api/ordini/2/approva')).toBe(true);
    expect(requests.filter((r) => r.method === 'GET').length).toBeGreaterThanOrEqual(2);
    expect(toasts).toEqual(['Ordine A-2 approvato']);
  });

  it('cambiare un filtro ricarica con il parametro', async () => {
    const { fixture, el } = await render();
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'inviato';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(requests.at(-1)?.query).toEqual({ stato: 'inviato', page: 0 });
  });

  it('senza il permesso della schermata mostra il rifiuto e non chiama il backend', async () => {
    const { fixture, el } = await render();
    permissions.set(new Set());
    requests.length = 0;
    await settle(fixture);
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Non hai i permessi');
    expect(requests).toHaveLength(0);
  });
});
