import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RegistryClient, RegistryError, csrfToken, documentRef, loginUrl } from './registry-client';

describe('registry client', () => {
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

  it('separate documents: paths by type and identifier, values encoded', async () => {
    await client.versions('order management', 'screen', 'order-list');
    reply = () => ({ status: 201, body: { hash: 'abc', createdAt: '2026-10-13T08:00:00Z', author: 'mario' } });
    await client.save('orders', 'navigation', 'orders', { schemaVersion: '1.0', navigation: 'orders' });
    reply = () => ({ status: 204 });
    await client.publish('orders', 'theme', 'light', 'pre production', 'abc');
    expect(calls).toEqual([
      { url: '/registry/apps/order%20management/documents/screen/order-list/versions', method: 'GET', body: undefined },
      { url: '/registry/apps/orders/documents/navigation/orders/versions', method: 'POST', body: '{"schemaVersion":"1.0","navigation":"orders"}' },
      { url: '/registry/apps/orders/documents/theme/light/published?env=pre%20production', method: 'PUT', body: '{"hash":"abc"}' },
    ]);
  });

  it('errors: status and title of the Problem; network missing', async () => {
    reply = () => ({ status: 400, body: { title: "The identifier does not match", detail: 'internal stack' } });
    await expect(client.save('a', 'screen', 'x', {})).rejects.toEqual(new RegistryError(400, "The identifier does not match"));
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network');
    });
    await expect(client.documents('a')).rejects.toMatchObject({ status: 0 });
  });

  it('0.3: saving with If-Match, review, validation problems and author of the conflict', async () => {
    const seen: Record<string, string>[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push((init.headers ?? {}) as Record<string, string>);
      calls.push({ url, method: init.method ?? 'GET', body: init.body as string | undefined });
      const { status, body } = reply(url);
      return { ok: status < 400, status, json: async () => body };
    });
    reply = () => ({ status: 201, body: { hash: 'def', createdAt: '2026-10-13T08:00:00Z', author: 'mario', state: 'draft' } });
    await client.save('orders', 'screen', 'x', { schemaVersion: '1.0', screen: 'x' }, 'abc');
    expect(seen.at(-1)?.['If-Match']).toBe('"abc"');
    await client.save('orders', 'screen', 'x', { schemaVersion: '1.0', screen: 'x' });
    expect(seen.at(-1)?.['If-Match']).toBeUndefined();
    reply = () => ({ status: 200, body: { hash: 'def', createdAt: '2026-10-13T08:00:00Z', author: 'mario', state: 'in-review' } });
    await client.review('orders', 'screen', 'x', 'def', 'reject', 'The title is missing');
    expect(calls.at(-1)).toEqual({ url: '/registry/apps/orders/documents/screen/x/versions/def/review', method: 'POST', body: '{"action":"reject","note":"The title is missing"}' });
    reply = () => ({ status: 400, body: { title: 'The document does not follow the schema', errors: [{ path: '/components/0', message: 'unknown type' }, { path: 1 }, 'x'] } });
    const invalid = (await client.save('o', 'screen', 'x', {}).catch((e: unknown) => e)) as RegistryError;
    expect(invalid.issues).toEqual([{ path: '/components/0', message: 'unknown type' }]);
    reply = () => ({ status: 412, body: { title: 'Changed', latest: 'fff', latestAuthor: 'luisa' } });
    const conflict = (await client.save('o', 'screen', 'x', {}, 'abc').catch((e: unknown) => e)) as RegistryError;
    expect([conflict.status, conflict.latestAuthor]).toEqual([412, 'luisa']);
  });

  it('0.4: references of a version (with and without environment) and missing screens in the rejected publication', async () => {
    reply = () => ({ status: 200, body: { env: 'production', references: [], missing: [] } });
    await client.references('orders', 'navigation', 'menu', 'abc', 'production');
    await client.references('orders', 'screen', 'x', 'abc');
    expect(calls.map((c) => c.url)).toEqual([
      '/registry/apps/orders/documents/navigation/menu/versions/abc/references?env=production',
      '/registry/apps/orders/documents/screen/x/versions/abc/references',
    ]);
    const missingReferences = [{ screen: 'order-list', path: '/areas/0/items/0/screen' }, { screen: 3 }, 'x'];
    reply = () => ({ status: 409, body: { title: 'The navigation references unpublished screens', missingReferences } });
    const rejected = (await client.publish('orders', 'navigation', 'menu', 'production', 'abc').catch((e: unknown) => e)) as RegistryError;
    expect([rejected.status, rejected.missingReferences]).toEqual([409, [{ screen: 'order-list', path: '/areas/0/items/0/screen' }]]);
  });

  it('BFF CSRF: writes send the cookie token; without cookie, on 403 it tries again once with the token', async () => {
    const sent: (string | null)[] = [];
    let status = 403;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(((init.headers ?? {}) as Record<string, string>)['X-XSRF-TOKEN'] ?? null);
      // The BFF creates the cookie together with the first 403.
      if (status === 403) document.cookie = 'XSRF-TOKEN=abc%3D1';
      const reply = { ok: status < 400, status, json: async () => ({ hash: 'h', createdAt: '', author: 'a' }) };
      status = 201;
      return reply;
    });
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    await client.save('a', 'screen', 'x', {});
    expect(sent).toEqual([null, 'abc=1']);
    // With the token already there a 403 is a real refusal: no second try.
    sent.length = 0;
    status = 403;
    await expect(client.publish('a', 'screen', 'x', 'prod', 'h')).rejects.toMatchObject({ status: 403 });
    expect(sent).toEqual(['abc=1']);
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('the CSRF token is read from the cookie; the login goes back to the given page', () => {
    expect(csrfToken('a=1; XSRF-TOKEN=x%2By; b=2')).toBe('x+y');
    expect(csrfToken('a=1')).toBeNull();
    expect(loginUrl('http://localhost:4201/?x=1')).toBe('/bff/login?return=http%3A%2F%2Flocalhost%3A4201%2F%3Fx%3D1');
  });

  it('the document is recognised by its identifier property', () => {
    expect(documentRef('screen', { screen: 'order-list' })).toEqual({ kind: 'screen', id: 'order-list' });
    expect(documentRef('theme', { theme: 'Dark' })).toBeNull();
    expect(documentRef('navigation', { screen: 'x' })).toBeNull();
  });
});
