import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PreviewChannel, PreviewDataClient, matchSource } from './preview-ports';
import { previewState } from './protocol';

describe('preview: requests and data sources', () => {
  const sources = {
    list: { type: 'rest', method: 'GET', url: '/api/orders' },
    detail: { type: 'rest', method: 'GET', url: '/api/orders/{{ params.id }}' },
    approve: { type: 'rest', method: 'POST', url: '/api/orders/{{id}}/approve' },
  };

  it('recognises the data source by method and URL, with the {{ }} parts free', () => {
    expect(matchSource(sources, { method: 'GET', url: '/api/orders' })).toBe('list');
    expect(matchSource(sources, { method: 'GET', url: '/api/orders/7' })).toBe('detail');
    expect(matchSource(sources, { method: 'POST', url: '/api/orders/a%2Fb/approve' })).toBe('approve');
    expect(matchSource(sources, { method: 'DELETE', url: '/api/orders' })).toBeNull();
    expect(matchSource(sources, { method: 'GET', url: '/api/orders/7/rows' })).toBeNull();
  });
});

describe('preview: real data', () => {
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
            state: signal(previewState({ liveData: true, screen: { schemaVersion: '1.0', screen: 'x', dataSources: { list: { type: 'rest', method: 'GET', url: '/api/orders' } }, components: [] } })),
            event: (e: { kind: string; text: string }) => events.push(e),
          },
        },
      ],
    });
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return url.startsWith('/api/orders') ? { ok: true, status: 200, json: async () => [{ id: 1 }] } : { ok: false, status: 404, json: async () => ({}) };
    });
    client = TestBed.inject(PreviewDataClient);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads go to the real services, with the parameters; the log tells the outcome', async () => {
    expect(await client.request({ method: 'GET', url: '/api/orders', query: { status: ['a', 'b'], empty: null } })).toEqual([{ id: 1 }]);
    expect(calls).toEqual(['/api/orders?status=a&status=b']);
    expect(events).toEqual([{ kind: 'request', text: 'GET /api/orders → list · HTTP 200' }]);
    await expect(client.request({ method: 'GET', url: '/api/other' })).rejects.toThrow('404');
  });

  it('writes and non-relative addresses do not leave', async () => {
    await expect(client.request({ method: 'POST', url: '/api/orders', body: {} })).rejects.toThrow('403');
    expect(events.at(-1)?.text).toContain('blocked');
    await expect(client.request({ method: 'GET', url: '//evil.test/x' })).rejects.toThrow('0');
    await expect(client.request({ method: 'GET', url: '/api/../secret' })).rejects.toThrow('0');
    expect(calls).toEqual([]);
  });
});
