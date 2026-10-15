import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Authorization, DataClient, RuntimeDiagnostics, RuntimeTracer, UserProvider } from 'core';
import { HttpAuthorization } from './authorization';
import { LOWCODE_REDIRECT, LOWCODE_SERVICES_CONFIG, resolveConfig } from './config';
import { HttpDiagnostics, redact } from './diagnostics';
import { DataError } from './errors';
import { HttpDataClient } from './http-data-client';
import { lowcodeHttpInterceptor } from './interceptor';
import { provideLowcodeServices } from './provide';
import { HttpSession } from './session';
import { isSameOriginRelative, newSpanContext, traceparent } from './trace';
import { HttpTracer } from './tracer';

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
    expect(traceparent(newSpanContext())).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(traceparent(newSpanContext(undefined, false)).endsWith('-00')).toBe(true);
  });
  it('un figlio resta nella traccia del padre, con il suo campionamento', () => {
    const parent = newSpanContext(undefined, false);
    const child = newSpanContext(parent, true);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.spanId).not.toBe(parent.spanId);
    expect(child.sampled).toBe(false);
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
    expect(redirects).toEqual(['/bff/login?return=' + encodeURIComponent(location.href)]);
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
  it('l’uscita chiama il BFF e poi va all’indirizzo di fine sessione del provider', async () => {
    const { http, redirects } = setup();
    const done = TestBed.inject(HttpSession).logout();
    const request = http.expectOne('/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Accept')).toBe('application/json');
    request.flush({ redirect: 'http://idp.test/logout?id_token_hint=x' });
    await done;
    expect(redirects).toEqual(['http://idp.test/logout?id_token_hint=x']);
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

describe('HttpDataClient: annullamento', () => {
  it('un segnale annullato interrompe la chiamata HTTP e rifiuta con AbortError', async () => {
    const { http } = setup();
    const controller = new AbortController();
    const p = TestBed.inject(HttpDataClient).request({ method: 'GET', url: '/api/lenta' }, { signal: controller.signal });
    const req = http.expectOne('/api/lenta');
    controller.abort();
    expect(req.cancelled).toBe(true);
    const err = (await p.catch((e: unknown) => e)) as DOMException;
    expect(err.name).toBe('AbortError');
  });

  it('un segnale già annullato non fa partire la chiamata', async () => {
    const { http } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(TestBed.inject(HttpDataClient).request({ method: 'GET', url: '/api/x' }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    http.verify();
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

describe('HttpTracer', () => {
  const spansOf = (body: { resourceSpans: { scopeSpans: { spans: Record<string, unknown>[] }[] }[] }) => body.resourceSpans[0].scopeSpans[0].spans;
  const attrs = (span: Record<string, unknown>) =>
    Object.fromEntries((span['attributes'] as { key: string; value: Record<string, unknown> }[]).map((a) => [a.key, Object.values(a.value)[0]]));

  it('la chiamata di un data source è uno span client figlio dello span di partenza, senza URL', async () => {
    const { http } = setup();
    const tracer = TestBed.inject(HttpTracer);
    const action = tracer.start('action.run', { 'lowcode.action': 'call approva' });
    const p = TestBed.inject(HttpDataClient).request({ method: 'POST', url: '/api/ordini/4242/approva', body: {} }, { source: 'approva', trace: action.context });
    const req = http.expectOne('/api/ordini/4242/approva');
    const header = req.request.headers.get('traceparent')!;
    expect(header.startsWith(`00-${action.context.traceId}-`)).toBe(true);
    expect(header).not.toContain(action.context.spanId);
    req.flush({}, { status: 409, statusText: 'Conflict' });
    await p.catch(() => undefined);
    action.end(false);
    void tracer.flush();
    const sent = http.expectOne('/telemetry/v1/traces');
    expect(sent.request.headers.has('traceparent')).toBe(false);
    const [httpSpan, actionSpan] = spansOf(sent.request.body);
    expect(httpSpan).toMatchObject({ name: 'http.client', kind: 3, traceId: action.context.traceId, parentSpanId: action.context.spanId, status: { code: 2 } });
    expect(header).toContain(httpSpan['spanId'] as string);
    expect(attrs(httpSpan)).toEqual({ 'http.request.method': 'POST', 'lowcode.datasource': 'approva', 'http.response.status_code': '409' });
    expect(actionSpan).toMatchObject({ name: 'action.run', kind: 1, status: { code: 2 } });
    expect(JSON.stringify(sent.request.body)).not.toContain('4242');
    expect(sent.request.body.resourceSpans[0].resource.attributes).toContainEqual({ key: 'lowcode.app', value: { stringValue: 'demo' } });
  });

  it('le chiamate di piattaforma riportano il percorso senza query; quelle alla telemetria non si tracciano', () => {
    const { http } = setup();
    const client = TestBed.inject(HttpClient);
    client.get('/registry/screens/elenco?utente=mario.rossi@example.com').subscribe();
    http.expectOne((r) => r.url.startsWith('/registry/')).flush({});
    void TestBed.inject(HttpTracer).flush();
    const sent = http.expectOne('/telemetry/v1/traces');
    const spans = spansOf(sent.request.body);
    expect(spans).toHaveLength(1);
    expect(attrs(spans[0])).toMatchObject({ 'url.path': '/registry/screens/elenco', 'http.response.status_code': '200' });
    expect(spans[0]['status']).toEqual({});
  });

  it('con il campionamento a zero invia solo gli span in errore, e lo dice nel traceparent', () => {
    const { http } = setup({ traceSampleRatio: 0 });
    const client = TestBed.inject(HttpClient);
    client.get('/api/a').subscribe();
    client.get('/api/b').subscribe({ error: () => undefined });
    const a = http.expectOne('/api/a');
    expect(a.request.headers.get('traceparent')!.endsWith('-00')).toBe(true);
    a.flush({});
    http.expectOne('/api/b').flush({}, { status: 500, statusText: 'x' });
    void TestBed.inject(HttpTracer).flush();
    expect(spansOf(http.expectOne('/telemetry/v1/traces').request.body).map((s) => attrs(s)['url.path'])).toEqual(['/api/b']);
  });

  it('una chiamata annullata non è un errore', () => {
    const { http } = setup();
    const subscription = TestBed.inject(HttpClient).get('/api/lenta').subscribe();
    http.expectOne('/api/lenta');
    subscription.unsubscribe();
    void TestBed.inject(HttpTracer).flush();
    const [span] = spansOf(http.expectOne('/telemetry/v1/traces').request.body);
    expect(span['status']).toEqual({});
    expect(attrs(span)['lowcode.cancelled']).toBe(true);
  });

  it('quando la pagina si chiude svuota la coda con keepalive', () => {
    const { http } = setup();
    TestBed.inject(HttpTracer).start('screen.open', { 'lowcode.screen': 'elenco' }).end(true);
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(http.expectOne('/telemetry/v1/traces').request.keepalive).toBe(true);
  });

  it('con la telemetria disattivata non invia nulla', () => {
    const { http } = setup({ telemetry: false });
    TestBed.inject(HttpTracer).start('action.run', {}).end(false);
    void TestBed.inject(HttpTracer).flush();
    http.expectNone('/telemetry/v1/traces');
  });
});

describe('provideLowcodeServices', () => {
  it('all’avvio carica la sessione e poi i permessi', async () => {
    TestBed.configureTestingModule({
      providers: [provideLowcodeServices({ appId: 'demo' }), provideHttpClientTesting(), { provide: LOWCODE_REDIRECT, useValue: () => undefined }],
    });
    const http = TestBed.inject(HttpTestingController);
    const ready = TestBed.inject(ApplicationInitStatus).donePromise;
    http.expectOne('/bff/user').flush({ name: 'Mario Rossi', username: 'mrossi' });
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne((r) => r.url === '/authz/capabilities').flush(caps(['ordini.ordine.leggi'], 'v1'));
    await ready;
    expect(TestBed.inject(Authorization).can('ordini.ordine.leggi')).toBe(true);
    expect(TestBed.inject(HttpAuthorization).count()).toBe(1);
    expect(TestBed.inject(RuntimeTracer)).toBe(TestBed.inject(HttpTracer));
  });
});
