// In-memory imitation of the API Learning Sandbox, written from its OpenAPI (https://demo.totalshiftleft.ai/openapi.json):
// session-scoped data (x-session-id, `new` starts one), seed on the first request, envelope { success, data, pagination },
// 1-based pages, sort/order, any field as an exact filter, QUERY with filters (eq ne contains in nin gt gte lt lte),
// ?expand=user,product on orders, 400 { details } on invalid data, 409 on a duplicate e-mail, 404, /session,
// /session/new, /api/v1/demo/reset. Used by the tests of the adapter and to run the application offline:
//
//   node adapter/sandbox-mock.mjs [--port 8099]      then   node adapter/server.mjs --upstream http://localhost:8099 --no-auth
//
// What it cannot know of the real service (it is not documented) is marked "assumed" below.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = {
  users: [
    { name: 'Alice Johnson', email: 'alice@example.com', role: 'admin', age: 34 },
    { name: 'Bob Smith', email: 'bob@example.com', role: 'user', age: 28 },
    { name: 'Charlie Brown', email: 'charlie@example.com', role: 'moderator', age: 41 },
    { name: 'Diana Prince', email: 'diana@example.com', role: 'user', age: 30 },
    { name: 'Ethan Hunt', email: 'ethan@example.com', role: 'user', age: null },
  ],
  products: [
    { name: 'Wireless Mouse', price: 24.99, description: 'Ergonomic 2.4 GHz mouse', stock: 120, category: 'electronics' },
    { name: 'Mechanical Keyboard', price: 89.9, description: 'Brown switches, backlit', stock: 8, category: 'electronics' },
    { name: 'Clean Code', price: 34.5, description: 'A handbook of agile software craftsmanship', stock: 40, category: 'books' },
    { name: 'Board Game Night', price: 49, description: 'Strategy game for 2-5 players', stock: 0, category: 'games' },
    { name: 'Coffee Mug', price: 9.5, description: '350 ml ceramic mug', stock: 60, category: 'general' },
  ],
};

const RULES = {
  users: {
    required: ['name', 'email'],
    fields: { name: { type: 'string', min: 1, max: 100 }, email: { type: 'email', max: 255 }, role: { enum: ['user', 'admin', 'moderator'] }, age: { type: 'integer', min: 0, max: 150 } },
    defaults: { role: 'user', age: null },
  },
  products: {
    required: ['name', 'price'],
    fields: { name: { type: 'string', min: 1, max: 100 }, price: { type: 'number', exclusiveMin: 0 }, description: { type: 'string', max: 500 }, stock: { type: 'integer', min: 0 }, category: { type: 'string', max: 50 } },
    defaults: { description: '', stock: 0, category: 'general' },
  },
  orders: {
    required: [],
    fields: { user_id: { type: 'uuid' }, product_id: { type: 'uuid' }, quantity: { type: 'integer', min: 1 }, status: { enum: ['pending', 'processing', 'completed', 'cancelled'] }, notes: { type: 'string', max: 500 } },
    defaults: { user_id: null, product_id: null, quantity: 1, status: 'pending', notes: '' },
    patchable: ['quantity', 'status', 'notes'],
  },
};

const now = () => new Date().toISOString();

export class SandboxMock {
  constructor() {
    this.sessions = new Map();
    /** Requests seen (method, path, session), for the tests. */
    this.calls = [];
  }

  newSession() {
    const id = `sess_${randomUUID().slice(0, 12)}`;
    const s = { id, created_at: now(), data: { users: [], products: [], orders: [] }, seeded: false };
    this.sessions.set(id, s);
    return s;
  }

  seed(s) {
    s.data = { users: [], products: [], orders: [] };
    for (const entity of ['users', 'products']) for (const r of SEED[entity]) s.data[entity].push({ id: randomUUID(), ...r, created_at: now(), updated_at: now() });
    const [u, p] = [s.data.users, s.data.products];
    const orders = [[0, 0, 2, 'completed'], [1, 2, 1, 'pending'], [2, 1, 1, 'processing'], [3, 4, 4, 'pending'], [1, 0, 1, 'cancelled']];
    for (const [ui, pi, quantity, status] of orders) s.data.orders.push({ id: randomUUID(), user_id: u[ui].id, product_id: p[pi].id, quantity, status, notes: '', created_at: now(), updated_at: now() });
    s.seeded = true;
  }

  /** Forgets a session, as the 30-minute expiry would. */
  expire(id) {
    this.sessions.delete(id);
  }

  /** Handles one request; returns { status, headers, body }. */
  handle(method, url, headers, body) {
    const u = new URL(url, 'http://sandbox');
    let s = headers['x-session-id'] && headers['x-session-id'] !== 'new' ? this.sessions.get(headers['x-session-id']) : null;
    if (!s) s = this.newSession(); // assumed: an unknown or expired id silently gets a new session
    this.calls.push({ method, path: u.pathname, session: s.id });
    const out = (status, payload) => ({ status, headers: { 'x-session-id': s.id }, body: payload });
    const fail = (status, error, message, details) => out(status, { success: false, error, message, ...(details ? { details } : {}) });

    if (u.pathname === '/session' && method === 'GET') {
      return out(200, { success: true, data: { session_id: s.id, created_at: s.created_at, expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), limits: { records_per_entity: 1000, max_sessions: 10000 } } });
    }
    if (u.pathname === '/session/new' && method === 'POST') {
      s = this.newSession();
      return out(201, { success: true, data: { session_id: s.id, created_at: s.created_at } });
    }
    const m = /^\/api\/v1\/(users|products|orders)(?:\/([^/]+))?$/.exec(u.pathname);
    if (u.pathname === '/api/v1/demo/reset' && method === 'POST') {
      this.seed(s);
      return out(200, { success: true, data: { reset: true } });
    }
    if (!m) return fail(404, 'NOT_FOUND', 'Route not found');
    if (!s.seeded) this.seed(s);
    const [, entity, id] = m;
    const rows = s.data[entity];
    const expand = (o) => {
      const parts = String(u.searchParams.get('expand') ?? '').split(',');
      return entity !== 'orders' ? o : {
        ...o,
        user: parts.includes('user') ? s.data.users.find((x) => x.id === o.user_id) ?? null : undefined,
        product: parts.includes('product') ? s.data.products.find((x) => x.id === o.product_id) ?? null : undefined,
      };
    };

    if (!id && (method === 'GET' || method === 'QUERY')) {
      const q = method === 'QUERY' ? body ?? {} : Object.fromEntries(u.searchParams);
      const filters = method === 'QUERY' ? q.filters ?? {} : Object.fromEntries(Object.entries(q).filter(([k]) => !['page', 'limit', 'sort', 'order', 'expand', 'delay', 'error', 'random_fail'].includes(k)).map(([k, v]) => [k, { eq: v }]));
      let list = rows.filter((r) => Object.entries(filters).every(([f, cond]) => match(r[f], Array.isArray(cond) ? { in: cond } : typeof cond === 'object' && cond !== null ? cond : { eq: cond })));
      const sort = q.sort ?? 'created_at';
      const dir = String(q.order ?? 'desc').toLowerCase() === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => (a[sort] > b[sort] ? 1 : a[sort] < b[sort] ? -1 : 0) * dir);
      const limit = Math.min(100, Math.max(1, Number(q.limit ?? 10)));
      const page = Math.max(1, Number(q.page ?? 1)); // assumed: QUERY also takes page
      const pages = Math.max(1, Math.ceil(list.length / limit));
      const data = list.slice((page - 1) * limit, page * limit).map(expand);
      return out(200, { success: true, data, pagination: { total: list.length, page, limit, pages, hasNext: page < pages, hasPrev: page > 1 } });
    }
    if (!id && method === 'POST') {
      const errors = check(entity, body, true);
      if (errors.length) return fail(400, 'BAD_REQUEST', 'Validation failed', errors);
      if (entity === 'users' && rows.some((r) => r.email.toLowerCase() === body.email.toLowerCase())) return fail(409, 'CONFLICT', 'Email already exists'); // assumed status
      const row = { id: randomUUID(), ...RULES[entity].defaults, ...body, created_at: now(), updated_at: now() };
      rows.push(row);
      return out(201, { success: true, data: expand(row) });
    }
    const row = rows.find((r) => r.id === id);
    if (!row) return fail(404, 'NOT_FOUND', 'Record not found');
    if (method === 'GET') return out(200, { success: true, data: expand(row) });
    if (method === 'PATCH' || method === 'PUT') {
      const allowed = method === 'PATCH' ? RULES[entity].patchable : null;
      const extra = allowed ? Object.keys(body ?? {}).filter((k) => !allowed.includes(k)) : [];
      const errors = [...check(entity, body, method === 'PUT'), ...extra.map((field) => ({ field, message: 'must NOT have additional properties' }))];
      if (errors.length) return fail(400, 'BAD_REQUEST', 'Validation failed', errors);
      if (entity === 'users' && body.email && rows.some((r) => r.id !== id && r.email.toLowerCase() === body.email.toLowerCase())) return fail(409, 'CONFLICT', 'Email already exists');
      Object.assign(row, method === 'PUT' ? { ...RULES[entity].defaults, ...body } : body, { updated_at: now() });
      return out(200, { success: true, data: expand(row) });
    }
    if (method === 'DELETE') {
      rows.splice(rows.indexOf(row), 1);
      return { status: 204, headers: { 'x-session-id': s.id }, body: null };
    }
    return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  /** A `fetch` that answers from this mock (for the tests: no network). */
  fetch = async (url, init = {}) => {
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const r = this.handle(init.method ?? 'GET', String(url), headers, init.body ? JSON.parse(init.body) : undefined);
    return new Response(r.status === 204 ? null : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...r.headers } });
  };
}

function match(value, cond) {
  return Object.entries(cond).every(([op, v]) => {
    switch (op) {
      case 'eq': return String(value) === String(v);
      case 'ne': return String(value) !== String(v);
      case 'contains': return String(value ?? '').toLowerCase().includes(String(v).toLowerCase());
      case 'in': return v.map(String).includes(String(value));
      case 'nin': return !v.map(String).includes(String(value));
      case 'gt': return value > v;
      case 'gte': return value >= v;
      case 'lt': return value < v;
      case 'lte': return value <= v;
      default: return false;
    }
  });
}

function check(entity, body, full) {
  const rules = RULES[entity];
  const errors = [];
  if (body === null || typeof body !== 'object') return [{ field: 'body', message: 'must be object' }];
  if (full) for (const f of rules.required) if (body[f] === undefined) errors.push({ field: f, message: `must have required property '${f}'` });
  for (const [f, v] of Object.entries(body)) {
    const r = rules.fields[f];
    if (!r) {
      errors.push({ field: f, message: 'must NOT have additional properties' });
      continue;
    }
    if (r.enum && !r.enum.includes(v)) errors.push({ field: f, message: 'must be equal to one of the allowed values' });
    if (r.type === 'string' && (typeof v !== 'string' || v.length < (r.min ?? 0) || v.length > (r.max ?? Infinity))) errors.push({ field: f, message: `must NOT be longer than ${r.max} characters` });
    if (r.type === 'email' && (typeof v !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))) errors.push({ field: f, message: 'must match format "email"' });
    if (r.type === 'integer' && !(Number.isInteger(v) && v >= (r.min ?? -Infinity) && v <= (r.max ?? Infinity))) errors.push({ field: f, message: `must be >= ${r.min}` });
    if (r.type === 'number' && !(typeof v === 'number' && v > r.exclusiveMin)) errors.push({ field: f, message: 'must be > 0' });
    if (r.type === 'uuid' && !/^[0-9a-f-]{36}$/i.test(String(v))) errors.push({ field: f, message: 'must match format "uuid"' });
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8099;
  const mock = new SandboxMock();
  createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
    } catch {
      body = null;
    }
    const r = mock.handle(req.method, req.url, req.headers, body);
    res.writeHead(r.status, { 'content-type': 'application/json', ...r.headers });
    res.end(r.status === 204 ? undefined : JSON.stringify(r.body));
  }).listen(port, '127.0.0.1', () => console.log(`[sandbox-mock] http://localhost:${port}`));
}
