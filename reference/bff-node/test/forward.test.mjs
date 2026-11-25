// Forwarding of /api to a fake upstream: token, headers, bodies, event streams, renewal of the token, errors.
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { safePath } from '../src/forward.mjs';
import { fakeProvider, listen, problem, startBff } from './helpers.mjs';

/** @type {{ method?: string, url?: string, headers: import('node:http').IncomingHttpHeaders, body: string }[]} */
const seen = [];
/** @type {(() => void) | null} */
let sendSecondEvent = null;

const upstream = await listen(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
  if (req.url === '/api/streams/tasks') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('event: tasks.changed\ndata: {}\n\n');
    sendSecondEvent = () => res.end('event: tasks.changed\ndata: {}\n\n');
    return;
  }
  if (req.url === '/api/fail') {
    res.writeHead(422, { 'Content-Type': 'application/problem+json', 'Set-Cookie': 'upstream=1', 'X-Permissions-Version': 'other' });
    return res.end(JSON.stringify({ title: 'Invalid data', status: 422, errors: [{ path: '/name', code: 'required' }] }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"v1"', 'X-Internal': 'secret' });
  res.end(JSON.stringify({ ok: true }));
});

describe('forwarding of /api', () => {
  /** @type {Awaited<ReturnType<typeof startBff>>} */
  let bff;
  before(async () => (bff = await startBff({ env: { BFF_ROUTES: `/api=${upstream.url}`, BFF_MAX_BODY_BYTES: '1000' } })));
  after(async () => {
    await bff.close();
    await upstream.close();
  });

  it('adds the access token and passes only the allowed headers both ways', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.fetch('/api/orders?status=open', { headers: { 'Accept-Language': 'it', Authorization: 'Bearer from-the-page', traceparent: '00-abc-def-01' } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(r.headers.get('etag'), '"v1"');
    assert.equal(r.headers.get('x-internal'), null);
    const call = seen.at(-1);
    assert.equal(call?.url, '/api/orders?status=open');
    assert.equal(call?.headers.authorization, 'Bearer access-1');
    assert.equal(call?.headers['accept-language'], 'it');
    assert.equal(call?.headers.traceparent, '00-abc-def-01');
    assert.equal(call?.headers.cookie, undefined);
  });

  it('forwards a write with its body once the CSRF token is checked', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.write('/api/orders', { name: 'x' });
    assert.equal(r.status, 200);
    assert.equal(seen.at(-1)?.method, 'POST');
    assert.equal(seen.at(-1)?.body, '{"name":"x"}');
    const before = seen.length;
    assert.ok(await problem(await browser.write('/api/orders', { name: 'x' }, { 'X-XSRF-TOKEN': '' }), 403));
    assert.equal(seen.length, before, 'a refused write does not reach the service');
  });

  it('passes the Problem of the service with its status, without its cookies or permissions version', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.fetch('/api/fail');
    assert.equal(r.status, 422);
    assert.equal(r.headers.get('content-type'), 'application/problem+json');
    assert.equal((await r.json()).errors[0].code, 'required');
    assert.ok(!r.headers.getSetCookie().some((c) => c.startsWith('upstream=')));
    assert.notEqual(r.headers.get('x-permissions-version'), 'other');
  });

  it('passes every event of a stream as it arrives', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.fetch('/api/streams/tasks', { headers: { Accept: 'text/event-stream' } });
    assert.equal(r.headers.get('content-type'), 'text/event-stream');
    const reader = /** @type {ReadableStreamDefaultReader<Uint8Array>} */ (r.body?.getReader());
    // The first event arrives while the service keeps the stream open.
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /event: tasks\.changed/);
    sendSecondEvent?.();
    let rest = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value);
    assert.match(rest, /event: tasks\.changed/);
  });

  it('refuses paths with relative segments and bodies over the limit', async () => {
    const browser = bff.client();
    await browser.login();
    // fetch would resolve the dots itself: the path goes out as written with node:http.
    const cookies = [...browser.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    for (const path of ['/api/%2e%2e/admin', '/api/..%2fadmin', '/api/a%5c..']) {
      const status = await new Promise((resolve, reject) => {
        const { hostname, port } = new URL(bff.url);
        request({ hostname, port, path, headers: { Cookie: cookies } }, (res) => resolve(res.resume().statusCode)).on('error', reject).end();
      });
      assert.equal(status, 400, path);
    }
    assert.ok(await problem(await browser.write('/api/orders', { text: 'x'.repeat(2000) }), 413));
    assert.equal(safePath('/api/a..b'), false);
    assert.equal(safePath('/api/orders?q=..'), true);
  });

  it('does not forward a path that only starts like the prefix', async () => {
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.fetch('/apiary'), 404));
  });
});

describe('token renewal', () => {
  it('renews an access token about to expire once, for concurrent calls', async () => {
    const server = await listen((req, res) => res.end(String(req.headers.authorization)));
    const provider = fakeProvider({ expiresIn: 10 });
    const bff = await startBff({ env: { BFF_ROUTES: `/api=${server.url}` }, provider });
    const browser = bff.client();
    await browser.login();
    const answers = await Promise.all([browser.fetch('/api/a'), browser.fetch('/api/b')].map(async (p) => (await p).text()));
    assert.deepEqual(answers, ['Bearer access-2', 'Bearer access-2']);
    assert.equal(provider.calls.refresh, 1);
    await bff.close();
    await server.close();
  });

  it('closes the session with 401 when the renewal fails', async () => {
    const server = await listen((_req, res) => res.end('ok'));
    const provider = fakeProvider({ expiresIn: 10, refresh: () => Promise.reject(new Error('invalid_grant')) });
    const bff = await startBff({ env: { BFF_ROUTES: `/api=${server.url}` }, provider });
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.fetch('/api/a'), 401));
    assert.equal((await browser.fetch('/bff/user')).status, 401);
    await bff.close();
    await server.close();
  });
});

describe('service down', () => {
  it('answers 502 in Problem format', async () => {
    const bff = await startBff({ env: { BFF_ROUTES: '/api=http://127.0.0.1:9' } });
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.fetch('/api/orders'), 502));
    await bff.close();
  });
});
