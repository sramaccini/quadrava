import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RegistryClient, RegistryError, csrfToken, documentRef, loginUrl } from './registry-client';

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

  it('CSRF del BFF: le scritture mandano il token del cookie; senza cookie, al 403 si riprova una volta con il token', async () => {
    const sent: (string | null)[] = [];
    let status = 403;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(((init.headers ?? {}) as Record<string, string>)['X-XSRF-TOKEN'] ?? null);
      // Il BFF crea il cookie insieme al primo 403.
      if (status === 403) document.cookie = 'XSRF-TOKEN=abc%3D1';
      const reply = { ok: status < 400, status, json: async () => ({ hash: 'h', createdAt: '', author: 'a' }) };
      status = 201;
      return reply;
    });
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    await client.save('a', 'screen', 'x', {});
    expect(sent).toEqual([null, 'abc=1']);
    // Con il token già presente un 403 è un vero divieto: niente seconda prova.
    sent.length = 0;
    status = 403;
    await expect(client.publish('a', 'screen', 'x', 'prod', 'h')).rejects.toMatchObject({ status: 403 });
    expect(sent).toEqual(['abc=1']);
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('il token CSRF si legge dal cookie; il login torna alla pagina indicata', () => {
    expect(csrfToken('a=1; XSRF-TOKEN=x%2By; b=2')).toBe('x+y');
    expect(csrfToken('a=1')).toBeNull();
    expect(loginUrl('http://localhost:4201/?x=1')).toBe('/bff/login?return=http%3A%2F%2Flocalhost%3A4201%2F%3Fx%3D1');
  });

  it('il documento si riconosce dalla sua proprietà identificativo', () => {
    expect(documentRef('screen', { screen: 'ordini-elenco' })).toEqual({ kind: 'screen', id: 'ordini-elenco' });
    expect(documentRef('theme', { theme: 'Scuro' })).toBeNull();
    expect(documentRef('navigation', { screen: 'x' })).toBeNull();
  });
});
