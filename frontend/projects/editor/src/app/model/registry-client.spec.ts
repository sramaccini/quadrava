import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RegistryClient, RegistryError, documentRef } from './registry-client';

describe('client del registro', () => {
  let calls: { url: string; method: string; body?: string }[];
  let reply: (url: string) => { status: number; body?: unknown };
  let client: RegistryClient;

  beforeEach(() => {
    calls = [];
    reply = () => ({ status: 200, body: [] });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined });
      const { status, body } = reply(url);
      return { ok: status < 400, status, json: async () => body };
    });
    client = TestBed.inject(RegistryClient);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('documenti separati: percorsi per tipo e identificativo, valori codificati', async () => {
    await client.versions('gestione ordini', 'screen', 'ordini-elenco');
    reply = () => ({ status: 201, body: { hash: 'abc', createdAt: '2026-10-13T08:00:00Z', author: 'mario' } });
    await client.save('ordini', 'navigation', 'ordini', { schemaVersion: '1.0', navigation: 'ordini' });
    reply = () => ({ status: 204 });
    await client.publish('ordini', 'theme', 'chiaro', 'pre produzione', 'abc');
    expect(calls).toEqual([
      { url: '/registry/apps/gestione%20ordini/documents/screen/ordini-elenco/versions', method: 'GET', body: undefined },
      { url: '/registry/apps/ordini/documents/navigation/ordini/versions', method: 'POST', body: '{"schemaVersion":"1.0","navigation":"ordini"}' },
      { url: '/registry/apps/ordini/documents/theme/chiaro/published?env=pre%20produzione', method: 'PUT', body: '{"hash":"abc"}' },
    ]);
  });

  it('errori: stato e titolo del Problem; rete assente', async () => {
    reply = () => ({ status: 400, body: { title: "L'identificativo non coincide", detail: 'stack interno' } });
    await expect(client.save('a', 'screen', 'x', {})).rejects.toEqual(new RegistryError(400, "L'identificativo non coincide"));
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('rete');
    });
    await expect(client.documents('a')).rejects.toMatchObject({ status: 0 });
  });

  it('il documento si riconosce dalla sua proprietà identificativo', () => {
    expect(documentRef('screen', { screen: 'ordini-elenco' })).toEqual({ kind: 'screen', id: 'ordini-elenco' });
    expect(documentRef('theme', { theme: 'Scuro' })).toBeNull();
    expect(documentRef('navigation', { screen: 'x' })).toBeNull();
  });
});
