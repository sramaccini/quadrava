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
    TestBed.inject(I18n).addMessages('it', EDITOR_MESSAGES['it']);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('il registro c’è se GET /registry/apps risponde, chiede l’accesso con 401, manca altrimenti', async () => {
    let answer = respond(200, [{ id: 'ordini', name: 'Ordini' }]);
    vi.stubGlobal('fetch', async () => answer);
    const session = TestBed.inject(RegistrySession);
    expect(await session.check()).toBe('available');
    expect(session.apps()).toEqual([{ id: 'ordini', name: 'Ordini' }]);
    expect(session.usable()).toBe(true);
    answer = respond(401);
    expect(await session.check()).toBe('login');
    expect(session.usable()).toBe(true);
    answer = respond(404);
    expect(await session.check()).toBe('unavailable');
    expect(session.usable()).toBe(false);
  });

  it('senza servizio (o con una pagina HTML al posto del JSON) il registro non è disponibile', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => JSON.parse('<!doctype html>') }));
    expect(await TestBed.inject(RegistrySession).check()).toBe('unavailable');
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('rete');
    });
    expect(await TestBed.inject(RegistrySession).check()).toBe('unavailable');
  });

  it('la versione di partenza vale solo per il documento da cui viene; salvare la aggiorna', async () => {
    const calls: { url: string; ifMatch?: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, ifMatch: (init.headers as Record<string, string>)['If-Match'] });
      return url.endsWith('/versions') ? respond(201, { hash: 'bbbbbbbbbbbb', createdAt: '', author: 'mario' }) : respond(200, []);
    });
    const session = TestBed.inject(RegistrySession);
    session.appId.set('ordini');
    session.setOrigin({ kind: 'screen', id: 'elenco' }, 'aaaaaaaaaaaa');
    expect(session.basedOn({ kind: 'screen', id: 'altra' })).toBeNull();
    expect(session.basedOn({ kind: 'screen', id: 'elenco' })).toBe('aaaaaaaaaaaa');
    const version = await session.save('screen', { schemaVersion: '1.0', screen: 'elenco', components: [] });
    expect(version?.hash).toBe('bbbbbbbbbbbb');
    expect(calls.at(-1)?.ifMatch).toContain('aaaaaaaaaaaa');
    expect(session.basedOn({ kind: 'screen', id: 'elenco' })).toBe('bbbbbbbbbbbb');
    expect(toasts.at(-1)).toContain('bbbbbbbbbb');
  });

  it('le schermate dell’applicazione scelta si leggono dal registro raggiungibile; salvarne una la aggiunge', async () => {
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      if (url === '/registry/apps') return respond(200, []);
      if (url === '/registry/apps/ordini/documents') return respond(200, [{ kind: 'screen', id: 'ordini-elenco' }, { kind: 'navigation', id: 'menu' }]);
      if (init.method === 'POST') return respond(201, { hash: 'cccccccccccc', createdAt: '', author: 'mario' });
      return respond(200, []);
    });
    const session = TestBed.inject(RegistrySession);
    session.appId.set('ordini');
    TestBed.tick();
    expect(session.screens()).toEqual([]);
    await session.check();
    TestBed.tick();
    await vi.waitFor(() => expect(session.screens()).toEqual(['ordini-elenco']));
    await session.save('screen', { schemaVersion: '1.0', screen: 'ordine-dettaglio', components: [] });
    expect(session.screens()).toEqual(['ordini-elenco', 'ordine-dettaglio']);
    session.appId.set('');
    TestBed.tick();
    expect(session.screens()).toEqual([]);
  });

  it('i problemi di validazione del registro restano in issues; un 401 chiede l’accesso', async () => {
    let answer = respond(400, { title: 'Non valido', errors: [{ path: '/title', message: 'manca' }] });
    vi.stubGlobal('fetch', async (url: string) => (url.endsWith('/apps') ? respond(200, []) : answer));
    const session = TestBed.inject(RegistrySession);
    session.appId.set('ordini');
    expect(await session.save('screen', { screen: 'elenco' })).toBeNull();
    expect(session.issues()).toEqual([{ path: '/title', message: 'manca' }]);
    answer = respond(401);
    expect(await session.save('screen', { screen: 'elenco' })).toBeNull();
    expect(session.status()).toBe('login');
  });
});
