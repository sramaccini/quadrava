// HTTP server of the store adapter (see store.mjs), meant to sit behind the Quadrava BFF like tools/demo-api.mjs:
// the BFF forwards /api/... with the user's token; the adapter checks the token, checks the permission of the route
// with the authorization service, and calls the sandbox in the user's own sandbox session.
//
//   node adapter/server.mjs [--port 8085] [--upstream https://demo.totalshiftleft.ai]
//                           [--issuer http://localhost:8180/realms/quadrava] [--authz http://localhost:8082] [--app sandbox-store]
//                           [--no-auth]
//
// --no-auth: no token and no permission checks, every caller is the same user (local development only, warned in the log).
// Without --authz the token is checked but the permissions are not (warned in the log): the screens hide what the user
// cannot do, but only the back end is a boundary.
import { createServer } from 'node:http';
import { createPublicKey, createVerify } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, StoreAdapter } from './store.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => {
    if (!value.startsWith('--')) return pairs;
    const next = all[i + 1];
    return [...pairs, [value.slice(2), next && !next.startsWith('--') ? next : true]];
  }, []),
);
const port = Number(args.port ?? process.env.STORE_ADAPTER_PORT ?? 8085);
const upstream = String(args.upstream ?? process.env.SANDBOX_URL ?? 'https://demo.totalshiftleft.ai');
const issuer = String(args.issuer ?? process.env.KEYCLOAK_ISSUER_URI ?? 'http://localhost:8180/realms/quadrava').replace(/\/+$/, '');
const authzUrl = args.authz === true ? 'http://localhost:8082' : args.authz ?? process.env.AUTHZ_URL ?? null;
const appId = String(args.app ?? 'sandbox-store');
const withoutAuth = args['no-auth'] === true;
const PREFIX = '/api/store';

const log = (msg) => console.log(`[store-adapter] ${msg}`);
const adapter = new StoreAdapter({ upstream, log });

// ------------------------------------------------------------------ permissions of the routes

const ACTIONS = { GET: 'read', POST: 'create', PATCH: 'update', PUT: 'update', DELETE: 'delete' };
const RESOURCE = { users: 'user', products: 'product', orders: 'order' };

/** Permission a request needs (domain.resource.action), or null if the route does not exist. */
export function permissionOf(method, path) {
  const [first] = path.split('/').filter(Boolean);
  if (first === 'summary' || first === 'stats') return method === 'GET' ? 'store.dashboard.read' : null;
  if (first === 'session') return 'store.session.manage';
  if (RESOURCE[first] && ACTIONS[method]) return `store.${RESOURCE[first]}.${ACTIONS[method]}`;
  return null;
}

// ------------------------------------------------------------------ token (RS256, keys of the realm)

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

/** The subject of a valid token (signature of the realm, issuer, expiry), or null. */
async function subjectOf(authorization) {
  const match = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(authorization ?? '');
  if (!match) return null;
  const [, header, payload, signature] = match;
  try {
    const { alg, kid } = decode(header);
    if (alg !== 'RS256') return null;
    const key = await keyFor(kid);
    if (!key) return null;
    if (!createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(key, Buffer.from(signature, 'base64url'))) return null;
    const claims = decode(payload);
    if (claims.iss !== issuer || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null;
    // With tenants (ADR-18) the same person has one sandbox session per tenant.
    return typeof claims.sub === 'string' ? `${claims.sub}${claims.tenant ? `@${claims.tenant}` : ''}` : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ permissions (authorization service, cached)

const capabilities = new Map(); // token → { permissions: Set, until }
async function permissionsOf(authorization) {
  const cached = capabilities.get(authorization);
  if (cached && cached.until > Date.now()) return cached.permissions;
  const response = await fetch(`${authzUrl.replace(/\/+$/, '')}/authz/capabilities?app=${encodeURIComponent(appId)}`, {
    headers: { authorization, accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new HttpError(response.status === 401 ? 401 : 503, 'Permissions not available');
  const body = await response.json();
  const permissions = new Set(Array.isArray(body.permissions) ? body.permissions : []);
  const ttl = Math.min(Math.max(Number(body.ttlSeconds ?? 60), 0), 300);
  capabilities.set(authorization, { permissions, until: Date.now() + ttl * 1000 });
  if (capabilities.size > 5000) capabilities.delete(capabilities.keys().next().value);
  return permissions;
}

// ------------------------------------------------------------------ HTTP

function send(res, status, body) {
  if (status === 204 || body === undefined) {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' });
  res.end(JSON.stringify(body));
}
const problem = (res, status, title, errors) => send(res, status, { type: 'about:blank', title, status, ...(errors?.length ? { errors } : {}) });

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new HttpError(413, 'Body too large');
    chunks.push(chunk);
  }
  if (!size) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  if (url.pathname === '/health') return send(res, 200, { status: 'up' });
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return problem(res, 404, 'Not found');
  const path = url.pathname.slice(PREFIX.length) || '/';
  try {
    const permission = permissionOf(req.method, path);
    if (!permission) throw new HttpError(404, 'Not found');
    let subject = 'local';
    if (!withoutAuth) {
      subject = await subjectOf(req.headers.authorization);
      if (!subject) throw new HttpError(401, 'Missing or invalid token');
      if (authzUrl && !(await permissionsOf(req.headers.authorization)).has(permission)) throw new HttpError(403, 'Forbidden');
    }
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : undefined;
    const result = await adapter.handle(subject, { method: req.method, path, query: Object.fromEntries(url.searchParams), body });
    send(res, req.method === 'POST' && result && !result.done ? 201 : 200, result);
  } catch (e) {
    if (e instanceof HttpError) return problem(res, e.status, e.message, e.errors);
    console.error('[store-adapter]', e instanceof Error ? e.stack : e);
    problem(res, 500, 'Internal error');
  }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => {
    if (withoutAuth) console.warn('[store-adapter] STARTED WITHOUT AUTHENTICATION (--no-auth): for local development only.');
    else if (!authzUrl) console.warn('[store-adapter] permissions NOT checked (no --authz): the screens hide commands, but only the back end is a boundary.');
    log(`http://localhost:${port}${PREFIX} → ${upstream}`);
  });
}
