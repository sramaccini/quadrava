import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Authorization, DataClient, RuntimeDiagnostics, UserProvider } from 'core';
import { HttpAuthorization } from './authorization';
import { LOWCODE_REDIRECT, LOWCODE_SERVICES_CONFIG, resolveConfig } from './config';
import { HttpDiagnostics, redact } from './diagnostics';
import { DataError } from './errors';
import { HttpDataClient } from './http-data-client';
import { lowcodeHttpInterceptor } from './interceptor';
import { HttpSession } from './session';
import { isSameOriginRelative, newTraceparent } from './trace';

function setup(overrides: Partial<Parameters<typeof resolveConfig>[0]> = {}) {
  const redirects: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([lowcodeHttpInterceptor])),
      provideHttpClientTesting(),
      { provide: LOWCODE_SERVICES_CONFIG, useValue: resolveConfig({ appId: 'demo', ...overrides }) },
      { provide: LOWCODE_REDIRECT, useValue: (url: string) => redirects.push(url) },
      { provide: Authorization, useExisting: HttpAuthorization },
      { provide: UserProvider, useExisting: HttpSession },
      { provide: DataClient, useExisting: HttpDataClient },
      { provide: RuntimeDiagnostics, useExisting: HttpDiagnostics },
    ],
  });
  return { http: TestBed.inject(HttpTestingController), redirects };
}

const caps = (permissions: string[], version: string, ttlSeconds?: number) => ({ permissions, version, ttlSeconds });

describe('trace', () => {
  it('genera un traceparent W3C valido', () => {
    expect(newTraceparent().header).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(newTraceparent(false).header.endsWith('-00')).toBe(true);
  });
  it('considera sicuri solo gli URL relativi', () => {
    expect(isSameOriginRelative('/api/x')).toBe(true);
    for (const bad of ['https://evil.test/x', '//evil.test/x', 'api/x', '/a\\b']) expect(isSameOriginRelative(bad)).toBe(false);
  });
});

describe('interceptor', () => {
  it('aggiunge traceparent alla stessa origine e non a terzi', () => {
    const { http } = setup();
    const client = TestBed.inject(HttpClient);
    client.get('/api/a').subscribe();
    client.get('https://terzi.test/b').subscribe();
    expect(http.expectOne('/api/a').request.headers.get('traceparent')).toMatch(/^00-/);
    expect(http.expectOne('https://terzi.test/b').request.headers.has('traceparent')).toBe(false);
  });

  it('su 401 svuota la sessione e rimanda al login una volta sola', async () => {
    const { http, redirects } = setup();
    const client = TestBed.inject(HttpClient);
    client.get('/api/a').subscribe({ error: () => undefined });
    client.get('/api/b').subscribe({ error: () => undefined });
    http.expectOne('/api/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/b').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(TestBed.inject(HttpSession).state()).toBe('expired');
    expect(redirects).toEqual(['/oauth2/authorization/keycloak']);
  });
});

describe('HttpSession', () => {
  it('carica l\'utente dal BFF', async () => {
    const { http } = setup();
    const session = TestBed.inject(HttpSession);
    const p = session.load();
    http.expectOne('/bff/user').flush({ name: 'Mario Rossi', username: 'mrossi' });
    await p;
    expect(session.state()).toBe('authenticated');
    expect(session.user()).toEqual({ name: 'Mario Rossi', username: 'mrossi', roles: [] });
  });
  it('se il BFF non risponde considera la sessione scaduta', async () => {
    const { http, redirects } = setup();
    const p = TestBed.inject(HttpSession).load();
    http.expectOne('/bff/user').flush({}, { status: 500, statusText: 'x' });
    await p;
    expect(redirects).toHaveLength(1);
    expect(TestBed.inject(HttpSession).user()).toEqual({});
  });
});

describe('HttpAuthorization', () => {
  it('carica i permessi per l\'applicazione e li espone', async () => {
    const { http } = setup();
    const authz = TestBed.inject(HttpAuthorization);
    const p = authz.load();
    const req = http.expectOne((r) => r.url === '/authz/capabilities');
    expect(req.request.params.get('app')).toBe('demo');
    req.flush(caps(['ordini.ordine.leggi'], 'v1'));
    await p;
    expect(authz.can('ordini.ordine.leggi')).toBe(true);
    expect(authz.can('ordini.ordine.approva')).toBe(false);
    expect(authz.version()).toBe('v1');
  });

  it('in caso di errore o risposta non valida nega tutto', async () => {
    const { http } = setup();
    const authz = TestBed.inject(HttpAuthorization);
    let p = authz.load();
    http.expectOne((r) => r.url === '/authz/capabilities').flush(caps(['a.b.c'], 'v1'));
    await p;
    p = authz.load();
    http.expectOne((r) => r.url === '/authz/capabilities').flush({ nope: true });
    await p;
    expect(authz.can('a.b.c')).toBe(false);
    expect(authz.status()).toBe('error');
  });

  it('ricarica quando una risposta porta una nuova X-Permissions-Version', async () => {
    const { http } = setup();
    const authz = TestBed.inject(HttpAuthorization);
    let p = authz.load();
    http.expectOne((r) => r.url === '/authz/capabilities').flush(caps(['a.b.c'], 'v1'));
    await p;
    TestBed.inject(HttpClient).get('/api/x').subscribe();
    http.expectOne('/api/x').flush({}, { headers: { 'X-Permissions-Version': 'v2' } });
    p = Promise.resolve();
    http.expectOne((r) => r.url === '/authz/capabilities').flush(caps(['a.b.c', 'd.e.f'], 'v2'));
    await new Promise((r) => setTimeout(r));
    expect(authz.can('d.e.f')).toBe(true);
    // Stessa versione: nessun nuovo caricamento.
    TestBed.inject(HttpClient).get('/api/y').subscribe();
    http.expectOne('/api/y').flush({}, { headers: { 'X-Permissions-Version': 'v2' } });
    http.expectNone((r) => r.url === '/authz/capabilities');
    await p;
  });

  it('check: vero solo se il server lo dice; errore = negato', async () => {
    const { http } = setup();
    const authz = TestBed.inject(HttpAuthorization);
    const ok = authz.check('ordini.ordine.approva', { type: 'ordine', id: '7' });
    const req = http.expectOne('/authz/check');
    expect(req.request.body).toEqual({ checks: [{ permission: 'ordini.ordine.approva', resource: { type: 'ordine', id: '7' } }] });
    req.flush({ results: [{ permission: 'ordini.ordine.approva', allowed: true }] });
    expect(await ok).toBe(true);
    const ko = authz.check('ordini.ordine.approva');
    http.expectOne('/authz/check').flush({}, { status: 500, statusText: 'x' });
    expect(await ko).toBe(false);
  });
});

describe('HttpDataClient', () => {
  it('serializza la query saltando i valori nulli', async () => {
    const { http } = setup();
    const p = TestBed.inject(HttpDataClient).request({ method: 'GET', url: '/api/ordini', query: { stato: 'inviato', page: 0, x: null, t: ['a', 'b'] } });
    const req = http.expectOne((r) => r.url === '/api/ordini');
    expect(req.request.params.toString()).toBe('stato=inviato&page=0&t=a&t=b');
    req.flush([{ id: 1 }]);
    expect(await p).toEqual([{ id: 1 }]);
  });

  it('invia il corpo solo per i metodi che lo prevedono', async () => {
    const { http } = setup();
    const p = TestBed.inject(HttpDataClient).request({ method: 'POST', url: '/api/ordini/7/approva', body: { nota: 'ok' } });
    const req = http.expectOne('/api/ordini/7/approva');
    expect(req.request.body).toEqual({ nota: 'ok' });
    req.flush(null);
    await p;
  });

  it('con un file invia un corpo multipart: il file nella sua parte, le voci del corpo come testo', async () => {
    const { http } = setup();
    const blob = new Blob(['ciao'], { type: 'text/plain' });
    const p = TestBed.inject(HttpDataClient).request({
      method: 'POST',
      url: '/api/allegati',
      body: { name: 'nota.txt', size: 4, extra: { a: 1 }, vuoto: null },
      file: { field: 'file', name: 'nota.txt', type: 'text/plain', blob },
    });
    const req = http.expectOne('/api/allegati');
    const form = req.request.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('name')).toBe('nota.txt');
    expect(form.get('size')).toBe('4');
    expect(form.get('extra')).toBe('{"a":1}');
    expect(form.has('vuoto')).toBe(false);
    expect((form.get('file') as File).name).toBe('nota.txt');
    req.flush({ id: 9 });
    expect(await p).toEqual({ id: 9 });
  });

  it('rifiuta URL assoluti o con ".." senza fare richieste', async () => {
    const { http } = setup();
    const client = TestBed.inject(HttpDataClient);
    for (const url of ['https://evil.test/x', '//evil.test/x', '/api/../admin']) {
      await expect(client.request({ method: 'GET', url })).rejects.toBeInstanceOf(DataError);
    }
    http.verify();
  });

  it('su errore lancia DataError con stato e correlationId, senza il testo del server', async () => {
    const { http } = setup();
    const p = TestBed.inject(HttpDataClient).request({ method: 'GET', url: '/api/x' });
    http.expectOne('/api/x').flush({ title: 'Errore SQL su tabella clienti', correlationId: 'abc-123' }, { status: 500, statusText: 'x' });
    const err = (await p.catch((e: unknown) => e)) as DataError;
    expect(err).toBeInstanceOf(DataError);
    expect(err.status).toBe(500);
    expect(err.correlationId).toBe('abc-123');
    expect(err.message).not.toContain('SQL');
  });
});

describe('HttpDiagnostics', () => {
  it('redige e invia log OTLP a lotti', async () => {
    const { http } = setup();
    const diag = TestBed.inject(HttpDiagnostics);
    diag.report({ screen: 'ordini-elenco', source: 'ordini', error: 'GET /api/ordini?cliente=Rossi fallita per mario.rossi@example.com id 123456789' });
    void diag.flush();
    const req = http.expectOne('/telemetry/v1/logs');
    const record = req.request.body.resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(record.body.stringValue).toBe('GET /api/ordini?… fallita per [email] id [num]');
    expect(record.severityText).toBe('ERROR');
    expect(req.request.body.resourceLogs[0].resource.attributes).toContainEqual({ key: 'lowcode.app', value: { stringValue: 'demo' } });
    req.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('rispetta il tetto al minuto e la telemetria disattivata', async () => {
    const { http } = setup({ telemetryMaxPerMinute: 2 });
    const diag = TestBed.inject(HttpDiagnostics);
    for (let i = 0; i < 5; i++) diag.report({ screen: 's', source: 'x', error: 'e' });
    void diag.flush();
    expect(http.expectOne('/telemetry/v1/logs').request.body.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(2);
  });

  it('non lancia se l\'endpoint è giù', async () => {
    const { http } = setup();
    const diag = TestBed.inject(HttpDiagnostics);
    diag.report({ screen: 's', source: 'x', error: 'e' });
    const p = diag.flush();
    http.expectOne('/telemetry/v1/logs').flush({}, { status: 503, statusText: 'x' });
    await expect(p).resolves.toBeUndefined();
  });

  it('redact tronca i testi lunghi', () => {
    expect(redact('x'.repeat(500))).toHaveLength(200);
  });
});
