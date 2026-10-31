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
  it('generates a valid W3C traceparent', () => {
    expect(traceparent(newSpanContext())).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(traceparent(newSpanContext(undefined, false)).endsWith('-00')).toBe(true);
  });
  it('a child stays in the trace of the parent, with its sampling', () => {
    const parent = newSpanContext(undefined, false);
    const child = newSpanContext(parent, true);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.spanId).not.toBe(parent.spanId);
    expect(child.sampled).toBe(false);
  });
  it('considers only relative URLs safe', () => {
    expect(isSameOriginRelative('/api/x')).toBe(true);
    for (const bad of ['https://evil.test/x', '//evil.test/x', 'api/x', '/a\\b']) expect(isSameOriginRelative(bad)).toBe(false);
  });
});

describe('interceptor', () => {
  it('adds traceparent to the same origin and not to third parties', () => {
    const { http } = setup();
    const client = TestBed.inject(HttpClient);
    client.get('/api/a').subscribe();
    client.get('https://third.test/b').subscribe();
    expect(http.expectOne('/api/a').request.headers.get('traceparent')).toMatch(/^00-/);
    expect(http.expectOne('https://third.test/b').request.headers.has('traceparent')).toBe(false);
  });

  it('on 401 clears the session and redirects to the login only once', async () => {
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
  it('loads the user from the BFF', async () => {
    const { http } = setup();
    const session = TestBed.inject(HttpSession);
    const p = session.load();
    http.expectOne('/bff/user').flush({ name: 'Mario Rossi', username: 'mrossi', email: 'mrossi@example.test' });
    await p;
    expect(session.state()).toBe('authenticated');
    expect(session.user()).toEqual({ name: 'Mario Rossi', username: 'mrossi', email: 'mrossi@example.test', roles: [] });
  });
  it('if the BFF does not respond it considers the session expired', async () => {
    const { http, redirects } = setup();
    const p = TestBed.inject(HttpSession).load();
    http.expectOne('/bff/user').flush({}, { status: 500, statusText: 'x' });
    await p;
    expect(redirects).toHaveLength(1);
    expect(TestBed.inject(HttpSession).user()).toEqual({});
  });
  it('logout calls the BFF and then goes to the end-session address of the provider', async () => {
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
  it('loads the permissions for the application and exposes them', async () => {
    const { http } = setup();
    const authz = TestBed.inject(HttpAuthorization);
    const p = authz.load();
    const req = http.expectOne((r) => r.url === '/authz/capabilities');
    expect(req.request.params.get('app')).toBe('demo');
    req.flush(caps(['orders.order.read'], 'v1'));
    await p;
    expect(authz.can('orders.order.read')).toBe(true);
    expect(authz.can('orders.order.approve')).toBe(false);
    expect(authz.version()).toBe('v1');
  });

  it('on error or invalid response it denies everything', async () => {
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

  it('reloads when a response carries a new X-Permissions-Version', async () => {
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
    // Same version: no new load.
    TestBed.inject(HttpClient).get('/api/y').subscribe();
    http.expectOne('/api/y').flush({}, { headers: { 'X-Permissions-Version': 'v2' } });
    http.expectNone((r) => r.url === '/authz/capabilities');
    await p;
  });

  it('check: true only if the server says so; error = denied', async () => {
    const { http } = setup();
    const authz = TestBed.inject(HttpAuthorization);
    const ok = authz.check('orders.order.approve', { type: 'order', id: '7' });
    const req = http.expectOne('/authz/check');
    expect(req.request.body).toEqual({ checks: [{ permission: 'orders.order.approve', resource: { type: 'order', id: '7' } }] });
    req.flush({ results: [{ permission: 'orders.order.approve', allowed: true }] });
    expect(await ok).toBe(true);
    const ko = authz.check('orders.order.approve');
    http.expectOne('/authz/check').flush({}, { status: 500, statusText: 'x' });
    expect(await ko).toBe(false);
  });
});

describe('HttpDataClient', () => {
  it('serializes the query skipping null values', async () => {
    const { http } = setup();
    const p = TestBed.inject(HttpDataClient).request({ method: 'GET', url: '/api/orders', query: { status: 'sent', page: 0, x: null, t: ['a', 'b'] } });
    const req = http.expectOne((r) => r.url === '/api/orders');
    expect(req.request.params.toString()).toBe('status=sent&page=0&t=a&t=b');
    req.flush([{ id: 1 }]);
    expect(await p).toEqual([{ id: 1 }]);
  });

  it('sends the body only for the methods that allow it', async () => {
    const { http } = setup();
    const p = TestBed.inject(HttpDataClient).request({ method: 'POST', url: '/api/orders/7/approve', body: { nota: 'ok' } });
    const req = http.expectOne('/api/orders/7/approve');
    expect(req.request.body).toEqual({ nota: 'ok' });
    req.flush(null);
    await p;
  });

  it('with a file it sends a multipart body: the file in its part, the entries of the body as text', async () => {
    const { http } = setup();
    const blob = new Blob(['test'], { type: 'text/plain' });
    const p = TestBed.inject(HttpDataClient).request({
      method: 'POST',
      url: '/api/attachments',
      body: { name: 'note.txt', size: 4, extra: { a: 1 }, vuoto: null },
      file: { field: 'file', name: 'note.txt', type: 'text/plain', blob },
    });
    const req = http.expectOne('/api/attachments');
    const form = req.request.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('name')).toBe('note.txt');
    expect(form.get('size')).toBe('4');
    expect(form.get('extra')).toBe('{"a":1}');
    expect(form.has('empty')).toBe(false);
    expect((form.get('file') as File).name).toBe('note.txt');
    req.flush({ id: 9 });
    expect(await p).toEqual({ id: 9 });
  });

  it('rejects absolute URLs or URLs with ".." without making requests', async () => {
    const { http } = setup();
    const client = TestBed.inject(HttpDataClient);
    for (const url of ['https://evil.test/x', '//evil.test/x', '/api/../admin']) {
      await expect(client.request({ method: 'GET', url })).rejects.toBeInstanceOf(DataError);
    }
    http.verify();
  });

  it('on error throws DataError with status and correlationId, without the text of the server', async () => {
    const { http } = setup();
    const p = TestBed.inject(HttpDataClient).request({ method: 'GET', url: '/api/x' });
    http.expectOne('/api/x').flush({ title: 'SQL error on table customers', correlationId: 'abc-123' }, { status: 500, statusText: 'x' });
    const err = (await p.catch((e: unknown) => e)) as DataError;
    expect(err).toBeInstanceOf(DataError);
    expect(err.status).toBe(500);
    expect(err.correlationId).toBe('abc-123');
    expect(err.message).not.toContain('SQL');
    expect(err.fieldErrors).toEqual([]);
  });

  it('keeps the field errors of a Problem (paths and codes only), never their messages', async () => {
    const { http } = setup();
    const p = TestBed.inject(HttpDataClient).request({ method: 'POST', url: '/api/staff', body: {} });
    http.expectOne('/api/staff').flush(
      { title: 'Invalid data', status: 422, errors: [{ path: '/staffNumber', code: 'taken', message: 'duplicate key in table staff' }, { path: 'x', code: 'y' }] },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    const err = (await p.catch((e: unknown) => e)) as DataError;
    expect(err.status).toBe(422);
    expect(err.fieldErrors).toEqual([{ path: '/staffNumber', code: 'taken' }]);
    expect(JSON.stringify(err)).not.toContain('duplicate key');
  });
});

describe('HttpDataClient: cancellation', () => {
  it('a cancelled signal interrupts the HTTP call and rejects with AbortError', async () => {
    const { http } = setup();
    const controller = new AbortController();
    const p = TestBed.inject(HttpDataClient).request({ method: 'GET', url: '/api/slow' }, { signal: controller.signal });
    const req = http.expectOne('/api/slow');
    controller.abort();
    expect(req.cancelled).toBe(true);
    const err = (await p.catch((e: unknown) => e)) as DOMException;
    expect(err.name).toBe('AbortError');
  });

  it('an already cancelled signal does not start the call', async () => {
    const { http } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(TestBed.inject(HttpDataClient).request({ method: 'GET', url: '/api/x' }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    http.verify();
  });
});

describe('HttpDiagnostics', () => {
  it('redacts and sends OTLP logs in batches', async () => {
    const { http } = setup();
    const diag = TestBed.inject(HttpDiagnostics);
    diag.report({ screen: 'order-list', source: 'orders', error: 'GET /api/orders?customer=Smith failed for mario.rossi@example.com id 123456789' });
    void diag.flush();
    const req = http.expectOne('/telemetry/v1/logs');
    const record = req.request.body.resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(record.body.stringValue).toBe('GET /api/orders?… failed for [email] id [num]');
    expect(record.severityText).toBe('ERROR');
    expect(req.request.body.resourceLogs[0].resource.attributes).toContainEqual({ key: 'lowcode.app', value: { stringValue: 'demo' } });
    req.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('respects the per-minute cap and disabled telemetry', async () => {
    const { http } = setup({ telemetryMaxPerMinute: 2 });
    const diag = TestBed.inject(HttpDiagnostics);
    for (let i = 0; i < 5; i++) diag.report({ screen: 's', source: 'x', error: 'e' });
    void diag.flush();
    expect(http.expectOne('/telemetry/v1/logs').request.body.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(2);
  });

  it('does not throw if the endpoint is down', async () => {
    const { http } = setup();
    const diag = TestBed.inject(HttpDiagnostics);
    diag.report({ screen: 's', source: 'x', error: 'e' });
    const p = diag.flush();
    http.expectOne('/telemetry/v1/logs').flush({}, { status: 503, statusText: 'x' });
    await expect(p).resolves.toBeUndefined();
  });

  it('redact truncates long texts', () => {
    expect(redact('x'.repeat(500))).toHaveLength(200);
  });
});

describe('HttpTracer', () => {
  const spansOf = (body: { resourceSpans: { scopeSpans: { spans: Record<string, unknown>[] }[] }[] }) => body.resourceSpans[0].scopeSpans[0].spans;
  const attrs = (span: Record<string, unknown>) =>
    Object.fromEntries((span['attributes'] as { key: string; value: Record<string, unknown> }[]).map((a) => [a.key, Object.values(a.value)[0]]));

  it('the call of a data source is a client span child of the starting span, without URL', async () => {
    const { http } = setup();
    const tracer = TestBed.inject(HttpTracer);
    const action = tracer.start('action.run', { 'lowcode.action': 'call approve' });
    const p = TestBed.inject(HttpDataClient).request({ method: 'POST', url: '/api/orders/4242/approve', body: {} }, { source: 'approve', trace: action.context });
    const req = http.expectOne('/api/orders/4242/approve');
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
    expect(attrs(httpSpan)).toEqual({ 'http.request.method': 'POST', 'lowcode.datasource': 'approve', 'http.response.status_code': '409' });
    expect(actionSpan).toMatchObject({ name: 'action.run', kind: 1, status: { code: 2 } });
    expect(JSON.stringify(sent.request.body)).not.toContain('4242');
    expect(sent.request.body.resourceSpans[0].resource.attributes).toContainEqual({ key: 'lowcode.app', value: { stringValue: 'demo' } });
  });

  it('platform calls report the path without query; those to telemetry are not traced', () => {
    const { http } = setup();
    const client = TestBed.inject(HttpClient);
    client.get('/registry/screens/list?user=mario.rossi@example.com').subscribe();
    http.expectOne((r) => r.url.startsWith('/registry/')).flush({});
    void TestBed.inject(HttpTracer).flush();
    const sent = http.expectOne('/telemetry/v1/traces');
    const spans = spansOf(sent.request.body);
    expect(spans).toHaveLength(1);
    expect(attrs(spans[0])).toMatchObject({ 'url.path': '/registry/screens/list', 'http.response.status_code': '200' });
    expect(spans[0]['status']).toEqual({});
  });

  it('with sampling at zero it sends only spans in error, and says so in the traceparent', () => {
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

  it('a cancelled call is not an error', () => {
    const { http } = setup();
    const subscription = TestBed.inject(HttpClient).get('/api/slow').subscribe();
    http.expectOne('/api/slow');
    subscription.unsubscribe();
    void TestBed.inject(HttpTracer).flush();
    const [span] = spansOf(http.expectOne('/telemetry/v1/traces').request.body);
    expect(span['status']).toEqual({});
    expect(attrs(span)['lowcode.cancelled']).toBe(true);
  });

  it('when the page closes it empties the queue with keepalive', () => {
    const { http } = setup();
    TestBed.inject(HttpTracer).start('screen.open', { 'lowcode.screen': 'list' }).end(true);
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(http.expectOne('/telemetry/v1/traces').request.keepalive).toBe(true);
  });

  it('with telemetry disabled it sends nothing', () => {
    const { http } = setup({ telemetry: false });
    TestBed.inject(HttpTracer).start('action.run', {}).end(false);
    void TestBed.inject(HttpTracer).flush();
    http.expectNone('/telemetry/v1/traces');
  });
});

describe('provideLowcodeServices', () => {
  it('at start-up it loads the session and then the permissions', async () => {
    TestBed.configureTestingModule({
      providers: [provideLowcodeServices({ appId: 'demo' }), provideHttpClientTesting(), { provide: LOWCODE_REDIRECT, useValue: () => undefined }],
    });
    const http = TestBed.inject(HttpTestingController);
    const ready = TestBed.inject(ApplicationInitStatus).donePromise;
    http.expectOne('/bff/user').flush({ name: 'Mario Rossi', username: 'mrossi' });
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne((r) => r.url === '/authz/capabilities').flush(caps(['orders.order.read'], 'v1'));
    await ready;
    expect(TestBed.inject(Authorization).can('orders.order.read')).toBe(true);
    expect(TestBed.inject(HttpAuthorization).count()).toBe(1);
    expect(TestBed.inject(RuntimeTracer)).toBe(TestBed.inject(HttpTracer));
  });
});
