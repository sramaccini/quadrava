import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';

describe('campo lookup', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const clients = [
    { id: 1, nome: 'Rossi Srl' },
    { id: 2, nome: 'Rossetti SpA' },
    { id: 3, nome: 'Bianchi SpA' },
  ];
  const form: NodeDefinition = {
    type: 'form',
    fields: [{ name: 'cliente', type: 'lookup', label: 'Cliente', required: true, lookup: { source: 'clienti', labelField: 'nome', minChars: 2 } }],
    actions: [{ label: 'Salva', onClick: [{ call: 'salva' }] }],
  };
  const dataSources = {
    clienti: { type: 'rest' as const, method: 'GET' as const, url: '/api/clienti', params: { q: '{{ search }}' } },
    salva: { type: 'rest' as const, method: 'POST' as const, url: '/api/salva', body: '{{form}}' },
  };
  /** Risponde filtrando per `q`; le ricerche indicate in `slow` arrivano in ritardo. */
  const respondWith = (slow: string[] = []) => async (r: DataRequest) => {
    const q = String(r.query?.['q'] ?? '').toLowerCase();
    if (slow.includes(q)) await new Promise((res) => setTimeout(res, 600));
    return r.method === 'GET' ? clients.filter((c) => c.nome.toLowerCase().includes(q)) : {};
  };
  const options = (): string[] => [...document.querySelectorAll('.ant-select-item-option')].map((o) => plain(o.textContent));
  const typeSearch = (h: ScreenHarness, text: string): void => {
    const input = h.el.querySelector('lc-lookup input.ant-select-selection-search-input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };

  it('propone le righe caricate, cerca dopo una pausa e salva il valore della riga scelta', async () => {
    const h = await renderScreen({ components: [form], dataSources, respond: respondWith() });
    // Il caricamento automatico non ha testo: `search` vale null e non diventa un parametro.
    expect(h.requests[0].query).toEqual({});
    expect(h.reports).toEqual([]);
    await openSelect(h.el.querySelector('lc-lookup nz-select')!, () => h.settle());
    await h.until(() => options().length === 3, 'righe iniziali');
    typeSearch(h, 'r');
    await new Promise((r) => setTimeout(r, 400));
    // Un solo carattere: sotto la soglia, nessuna richiesta.
    expect(h.requests.filter((r) => r.query?.['q'])).toEqual([]);
    typeSearch(h, 'ro');
    typeSearch(h, 'ros');
    await h.until(() => options().length === 2, 'risultati della ricerca');
    expect(options()).toEqual(['Rossi Srl', 'Rossetti SpA']);
    // Le battute ravvicinate diventano una sola richiesta.
    expect(h.requests.filter((r) => r.query?.['q']).map((r) => r.query?.['q'])).toEqual(['ros']);
    (document.querySelectorAll('.ant-select-item-option')[1] as HTMLElement).click();
    await h.settle();
    expect(plain(h.el.querySelector('lc-lookup .ant-select-selection-item')?.textContent)).toBe('Rossetti SpA');
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Salva')) as HTMLButtonElement).click();
    await h.until(() => h.requests.some((r) => r.method === 'POST'), 'salvataggio');
    expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ cliente: 2 });
  });

  it('una risposta più vecchia non sovrascrive quella dell’ultima ricerca', async () => {
    const h = await renderScreen({ components: [form], dataSources, respond: respondWith(['ro']) });
    await openSelect(h.el.querySelector('lc-lookup nz-select')!, () => h.settle());
    typeSearch(h, 'ro');
    await new Promise((r) => setTimeout(r, 350));
    typeSearch(h, 'bi');
    await h.until(() => options().length === 1, 'risultato di «bi»');
    await new Promise((r) => setTimeout(r, 700));
    await h.settle();
    expect(options()).toEqual(['Bianchi SpA']);
  });

  it('un valore iniziale che non è tra le righe caricate mostra il suo testo, chiesto al servizio con lookupKey', async () => {
    const many = [...clients, { id: 42, nome: 'Zeta Logistica' }];
    const h = await renderScreen({
      components: [{ ...form, initial: { cliente: 42 } } as NodeDefinition],
      dataSources: {
        ...dataSources,
        clienti: { type: 'rest', method: 'GET', url: '/api/clienti', params: { q: '{{ search }}', id: '{{ lookupKey }}' } },
      },
      // Senza filtri il servizio restituisce solo le prime righe: il cliente 42 non c'è.
      respond: (r) => {
        if (r.query?.['id'] !== undefined) return many.filter((c) => c.id === r.query?.['id']);
        return clients;
      },
    });
    await h.until(() => plain(h.el.querySelector('lc-lookup .ant-select-selection-item')?.textContent) === 'Zeta Logistica', 'testo del valore');
    // Una sola richiesta per chiave, e le righe del data source per gli altri componenti non cambiano.
    expect(h.requests.filter((r) => r.query?.['id'] === 42)).toHaveLength(1);
    expect(h.requests[0].query).toEqual({});
  });
});
