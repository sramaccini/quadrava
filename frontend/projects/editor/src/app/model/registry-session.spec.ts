import { TestBed } from '@angular/core/testing';
import { Confirmation, I18n, Notifier } from 'core';
import { vi } from 'vitest';
import { EDITOR_MESSAGES } from '../messages';
import { RegistrySession } from './registry-session';

describe('RegistrySession', () => {
  const toasts: string[] = [];
  const respond = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body });

  beforeEach(() => {
    localStorage.clear();
    toasts.length = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
        { provide: Confirmation, useValue: { confirm: async () => true } },
      ],
    });
    TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('the registry is there if GET /registry/apps responds, asks for sign-in with 401, is missing otherwise', async () => {
    let answer = respond(200, [{ id: 'orders', name: 'Orders' }]);
    vi.stubGlobal('fetch', async () => answer);
    const session = TestBed.inject(RegistrySession);
    expect(await session.check()).toBe('available');
    expect(session.apps()).toEqual([{ id: 'orders', name: 'Orders' }]);
    expect(session.usable()).toBe(true);
    answer = respond(401);
    expect(await session.check()).toBe('login');
    expect(session.usable()).toBe(true);
    answer = respond(404);
    expect(await session.check()).toBe('unavailable');
    expect(session.usable()).toBe(false);
  });

  it('without a service (or with an HTML page instead of JSON) the registry is not available', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => JSON.parse('<!doctype html>') }));
    expect(await TestBed.inject(RegistrySession).check()).toBe('unavailable');
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('network');
    });
    expect(await TestBed.inject(RegistrySession).check()).toBe('unavailable');
  });

  it('the starting version applies only to the document it comes from; saving updates it', async () => {
    const calls: { url: string; ifMatch?: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, ifMatch: (init.headers as Record<string, string>)['If-Match'] });
      return url.endsWith('/versions') ? respond(201, { hash: 'bbbbbbbbbbbb', createdAt: '', author: 'mario' }) : respond(200, []);
    });
    const session = TestBed.inject(RegistrySession);
    session.appId.set('orders');
    session.setOrigin({ kind: 'screen', id: 'list' }, 'aaaaaaaaaaaa');
    expect(session.basedOn({ kind: 'screen', id: 'other' })).toBeNull();
    expect(session.basedOn({ kind: 'screen', id: 'list' })).toBe('aaaaaaaaaaaa');
    const version = await session.save('screen', { schemaVersion: '1.0', screen: 'list', components: [] });
    expect(version?.hash).toBe('bbbbbbbbbbbb');
    expect(calls.at(-1)?.ifMatch).toContain('aaaaaaaaaaaa');
    expect(session.basedOn({ kind: 'screen', id: 'list' })).toBe('bbbbbbbbbbbb');
    expect(toasts.at(-1)).toContain('bbbbbbbbbb');
  });

  it('the screens of the chosen application are read from the reachable registry; saving one adds it', async () => {
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      if (url === '/registry/apps') return respond(200, []);
      if (url === '/registry/apps/orders/documents') return respond(200, [{ kind: 'screen', id: 'order-list' }, { kind: 'navigation', id: 'menu' }]);
      if (init.method === 'POST') return respond(201, { hash: 'cccccccccccc', createdAt: '', author: 'mario' });
      return respond(200, []);
    });
    const session = TestBed.inject(RegistrySession);
    session.appId.set('orders');
    TestBed.tick();
    expect(session.screens()).toEqual([]);
    await session.check();
    TestBed.tick();
    await vi.waitFor(() => expect(session.screens()).toEqual(['order-list']));
    await session.save('screen', { schemaVersion: '1.0', screen: 'order-detail', components: [] });
    expect(session.screens()).toEqual(['order-list', 'order-detail']);
    session.appId.set('');
    TestBed.tick();
    expect(session.screens()).toEqual([]);
  });

  it('the registry validation problems stay in issues; a 401 asks for sign-in', async () => {
    let answer = respond(400, { title: 'Not valid', errors: [{ path: '/title', message: 'missing' }] });
    vi.stubGlobal('fetch', async (url: string) => (url.endsWith('/apps') ? respond(200, []) : answer));
    const session = TestBed.inject(RegistrySession);
    session.appId.set('orders');
    expect(await session.save('screen', { screen: 'list' })).toBeNull();
    expect(session.issues()).toEqual([{ path: '/title', message: 'missing' }]);
    answer = respond(401);
    expect(await session.save('screen', { screen: 'list' })).toBeNull();
    expect(session.status()).toBe('login');
  });
});
