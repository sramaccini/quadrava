import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PreviewChannel, PreviewDataClient, matchSource } from './preview-ports';
import { previewState } from './protocol';

describe('anteprima: richieste e data source', () => {
  const sources = {
    elenco: { type: 'rest', method: 'GET', url: '/api/ordini' },
    dettaglio: { type: 'rest', method: 'GET', url: '/api/ordini/{{ params.id }}' },
    approva: { type: 'rest', method: 'POST', url: '/api/ordini/{{id}}/approva' },
  };

  it('riconosce il data source dal metodo e dall’URL, con le parti {{ }} libere', () => {
    expect(matchSource(sources, { method: 'GET', url: '/api/ordini' })).toBe('elenco');
    expect(matchSource(sources, { method: 'GET', url: '/api/ordini/7' })).toBe('dettaglio');
    expect(matchSource(sources, { method: 'POST', url: '/api/ordini/a%2Fb/approva' })).toBe('approva');
    expect(matchSource(sources, { method: 'DELETE', url: '/api/ordini' })).toBeNull();
    expect(matchSource(sources, { method: 'GET', url: '/api/ordini/7/righe' })).toBeNull();
  });
});

describe('anteprima: dati veri', () => {
  const events: { kind: string; text: string }[] = [];
  const calls: string[] = [];
  let client: PreviewDataClient;

  beforeEach(() => {
    events.length = 0;
    calls.length = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PreviewChannel,
          useValue: {
            state: signal(previewState({ liveData: true, screen: { schemaVersion: '1.0', screen: 'x', dataSources: { elenco: { type: 'rest', method: 'GET', url: '/api/ordini' } }, components: [] } })),
            event: (e: { kind: string; text: string }) => events.push(e),
          },
        },
      ],
    });
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return url.startsWith('/api/ordini') ? { ok: true, status: 200, json: async () => [{ id: 1 }] } : { ok: false, status: 404, json: async () => ({}) };
    });
    client = TestBed.inject(PreviewDataClient);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('le letture vanno ai servizi veri, con i parametri; il registro dice l’esito', async () => {
    expect(await client.request({ method: 'GET', url: '/api/ordini', query: { stato: ['a', 'b'], vuoto: null } })).toEqual([{ id: 1 }]);
    expect(calls).toEqual(['/api/ordini?stato=a&stato=b']);
    expect(events).toEqual([{ kind: 'request', text: 'GET /api/ordini → elenco · HTTP 200' }]);
    await expect(client.request({ method: 'GET', url: '/api/altro' })).rejects.toThrow('404');
  });

  it('le scritture e gli indirizzi non relativi non partono', async () => {
    await expect(client.request({ method: 'POST', url: '/api/ordini', body: {} })).rejects.toThrow('403');
    expect(events.at(-1)?.text).toContain('bloccata');
    await expect(client.request({ method: 'GET', url: '//evil.test/x' })).rejects.toThrow('0');
    await expect(client.request({ method: 'GET', url: '/api/../segreto' })).rejects.toThrow('0');
    expect(calls).toEqual([]);
  });
});
