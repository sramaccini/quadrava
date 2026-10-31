// Sample back end of the demo, for running with the BFF: it exposes as real REST APIs (/api/...) the same in-memory back
// end the demo uses in the browser (projects/runtime/src/demo/demo-backend.ts). For local development only.
//
//   node tools/demo-api.mjs [--port 8084] [--issuer http://localhost:8180/realms/lowcode] [--no-auth]
//
// Every request must carry a valid Keycloak token (Authorization: Bearer, added by the BFF): RS256 signature checked
// with the keys published by the realm, issuer and expiry. With --no-auth the check is off (warning in the log). Back-end
// errors come back as Problem (RFC 9457) with the status only, never with details; invalid data also with the field errors
// (paths and codes, contracts/problem.yaml). /api/streams/tasks is an event stream (ADR-19): `tasks.changed` after
// every change of the tasks, for the live boards of the showcase.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createPublicKey, createVerify } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => {
    if (!value.startsWith('--')) return pairs;
    const next = all[i + 1];
    return [...pairs, [value.slice(2), next && !next.startsWith('--') ? next : true]];
  }, []),
);
const port = Number(args.port ?? 8084);
const issuer = String(args.issuer ?? process.env.KEYCLOAK_ISSUER_URI ?? 'http://localhost:8180/realms/lowcode').replace(/\/+$/, '');
const withoutAuth = args['no-auth'] === true;

// The TypeScript back end, bundled on the fly.
const here = dirname(fileURLToPath(import.meta.url));
const bundle = await build({
  entryPoints: [join(here, '../projects/runtime/src/demo/demo-backend.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
});
const { DemoBackend } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

// Event streams (ADR-19): the open responses by address. An event only says that something changed; the boards read
// their data source again.
const streams = new Map([['/api/streams/tasks', new Set()]]);
function emit(url, event) {
  for (const res of streams.get(url) ?? []) res.write(`event: ${event}\ndata: {}\n\n`);
}
const backend = new DemoBackend(emit);

// Public keys of the realm, by kid; reloaded when an unknown kid arrives.
let keys = new Map();
async function keyFor(kid) {
  if (!keys.has(kid)) {
    const response = await fetch(`${issuer}/protocol/openid-connect/certs`);
    if (!response.ok) throw new Error('keys not available');
    const { keys: list } = await response.json();
    keys = new Map(list.filter((k) => k.kty === 'RSA').map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
  }
  return keys.get(kid) ?? null;
}

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Is the token valid? RS256 signature of the realm, expected issuer, not expired. */
async function verify(authorization) {
  const match = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(authorization ?? '');
  if (!match) return false;
  const [, header, payload, signature] = match;
  try {
    const { alg, kid } = decode(header);
    if (alg !== 'RS256') return false;
    const key = await keyFor(kid);
    if (!key) return false;
    const valid = createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(key, Buffer.from(signature, 'base64url'));
    if (!valid) return false;
    const claims = decode(payload);
    return claims.iss === issuer && typeof claims.exp === 'number' && claims.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/** The text parts of a multipart: JSON when possible (numbers, objects), otherwise text. */
function textValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function readRequest(req, url) {
  const query = {};
  for (const [key, value] of url.searchParams) {
    query[key] = key in query ? [].concat(query[key], value) : value;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const type = req.headers['content-type'] ?? '';
  let body;
  let file;
  if (raw.length && type.startsWith('multipart/form-data')) {
    const form = await new Request(url, { method: 'POST', headers: { 'content-type': type }, body: raw }).formData();
    body = {};
    for (const [key, value] of form) {
      if (typeof value === 'string') body[key] = textValue(value);
      else file = { field: key, name: value.name, type: value.type, blob: value };
    }
  } else if (raw.length) {
    body = JSON.parse(raw.toString('utf8'));
  }
  return { method: req.method, url: url.pathname, query, body, file };
}

function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' });
  res.end(json);
}

const problem = (res, status, title) => send(res, status, { title, status });

// OpenAPI description of the APIs, as springdoc publishes it in Spring Boot: the editor imports it into data sources.
const openApi = readFileSync(join(here, 'demo-api.openapi.json'), 'utf8');

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  // /v3/api-docs: the description only (no data), without a token and readable from other origins, like springdoc with
  // CORS enabled in development; behind the BFF the same description is also on /api/v3/api-docs, with the token.
  if (url.pathname === '/v3/api-docs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(openApi);
  }
  if (!url.pathname.startsWith('/api/')) return problem(res, 404, 'Not found');
  if (!withoutAuth && !(await verify(req.headers['authorization']))) return problem(res, 401, 'Missing or invalid token');
  if (url.pathname === '/api/v3/api-docs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(openApi);
  }
  const stream = streams.get(url.pathname);
  if (stream && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(': connected\n\n');
    // A comment now and then keeps proxies from closing a quiet stream.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    stream.add(res);
    req.on('close', () => {
      clearInterval(heartbeat);
      stream.delete(res);
    });
    return;
  }
  try {
    const request = await readRequest(req, url);
    const result = await backend.handle(request);
    if (result === undefined) return problem(res, 404, 'Not found');
    send(res, 200, result);
    // Behind the BFF several users share this back end: a change of the tasks reaches the boards of the others too.
    // The colleague's move announces itself when it happens.
    if (req.method !== 'GET' && url.pathname.startsWith('/api/tasks') && url.pathname !== '/api/tasks/colleague') emit('/api/streams/tasks', 'tasks.changed');
  } catch (e) {
    const status = Number(e instanceof Error ? e.message : NaN);
    // Invalid data: the field errors of the back end (paths and codes, contracts/problem.yaml).
    const fieldErrors = Array.isArray(e?.fieldErrors) ? e.fieldErrors : [];
    if (status >= 400 && status < 600 && fieldErrors.length) send(res, status, { title: 'Invalid data', status, errors: fieldErrors });
    else if (status >= 400 && status < 600) problem(res, status, 'Request failed');
    else {
      console.error('[demo-api]', e instanceof Error ? e.message : e);
      problem(res, 500, 'Internal error');
    }
  }
}).listen(port, '127.0.0.1', () => {
  if (withoutAuth) console.warn('[demo-api] STARTED WITHOUT AUTHENTICATION (--no-auth): for local development only.');
  console.log(`[demo-api] http://localhost:${port}/api — tokens checked against ${withoutAuth ? '(none)' : issuer}`);
});
