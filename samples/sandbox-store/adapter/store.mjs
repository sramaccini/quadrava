// Store adapter: the back end the sandbox-store screens call (/api/store/...), in front of the API Learning Sandbox
// (https://demo.totalshiftleft.ai/api/v1). It turns the sandbox's contract into the one Quadrava expects:
//
//   sandbox                                     Quadrava
//   { success, data: [...], pagination }   →    { items, total, size }            (server-paged lists)
//   { success, data: {...} }               →    the record                         (detail, forms)
//   page 1-based, limit, sort, order       →    page 0-based, size, sort, direction
//   snake_case (user_id, created_at)       →    camelCase (userId, createdAt)
//   order + ?expand=user,product           →    flat row: userName, productName, unitPrice, amount, number
//   400 { details: [{ field, message }] }  →    422 Problem { errors: [{ path, code }] } (contracts/problem.yaml)
//   x-session-id header (30 min, per data) →    one sandbox session per signed-in user, renewed when it expires
//
// It also holds the business rules the sandbox does not enforce: order status transitions, stock check on new orders,
// no deletion of users and products that orders refer to, unique e-mail (also checked by the sandbox).
//
// The class has no HTTP server and no globals: `fetch` is injected, so the tests run it against a mock of the sandbox.

export const PAGE_SIZE_MAX = 100;
export const LOW_STOCK = 10;
const ALL_PAGES_MAX = 20; // 20 × 100 rows: above the sandbox's per-session record limit

/** Allowed order status changes (the sandbox accepts any). Same status = no change. */
export const TRANSITIONS = {
  pending: ['processing', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Writable fields per entity, in the adapter's (camelCase) names → the sandbox's names. */
const WRITABLE = {
  users: { create: { name: 'name', email: 'email', role: 'role', age: 'age' } },
  products: { create: { name: 'name', price: 'price', description: 'description', stock: 'stock', category: 'category' } },
  orders: {
    create: { userId: 'user_id', productId: 'product_id', quantity: 'quantity', status: 'status', notes: 'notes' },
    update: { quantity: 'quantity', status: 'status', notes: 'notes' },
  },
};
/** Fields a list can be sorted by (adapter name → sandbox name); anything else is refused, not passed on. */
const SORTABLE = {
  users: { name: 'name', email: 'email', role: 'role', age: 'age', createdAt: 'created_at' },
  products: { name: 'name', category: 'category', price: 'price', stock: 'stock', createdAt: 'created_at' },
  orders: { quantity: 'quantity', status: 'status', createdAt: 'created_at', userName: 'user_id' },
};

export class HttpError extends Error {
  constructor(status, title, errors) {
    super(title);
    this.status = status;
    this.errors = errors;
  }
}

const notFound = () => new HttpError(404, 'Not found');
const invalid = (errors) => new HttpError(422, 'Invalid data', errors);

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const round2 = (n) => Math.round(n * 100) / 100;
const text = (v) => (v === undefined || v === null ? '' : String(v).trim());

// ------------------------------------------------------------------ mapping of the records

export function toUser(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, age: u.age ?? null,
    createdAt: u.created_at, updatedAt: u.updated_at,
    label: `${u.name} <${u.email}>`,
  };
}

export function stockLevel(stock) {
  return stock <= 0 ? 'out' : stock < LOW_STOCK ? 'low' : 'ok';
}

export function toProduct(p) {
  if (!p) return null;
  return {
    id: p.id, name: p.name, price: p.price, description: p.description ?? '', stock: p.stock ?? 0,
    category: p.category ?? '', stockLevel: stockLevel(p.stock ?? 0),
    createdAt: p.created_at, updatedAt: p.updated_at,
    label: p.name,
  };
}

/** An order with its user and product (from ?expand=user,product, or looked up in the given maps). */
export function toOrder(o, users = new Map(), products = new Map()) {
  if (!o) return null;
  const user = o.user ?? users.get(o.user_id) ?? null;
  const product = o.product ?? products.get(o.product_id) ?? null;
  const unitPrice = product ? Number(product.price) : null;
  const amount = unitPrice === null ? null : round2(unitPrice * o.quantity);
  return {
    id: o.id,
    number: `ORD-${String(o.id).slice(0, 8).toUpperCase()}`,
    userId: o.user_id ?? null, productId: o.product_id ?? null,
    userName: user?.name ?? '—', userEmail: user?.email ?? '',
    productName: product?.name ?? '—',
    quantity: o.quantity, status: o.status, notes: o.notes ?? '',
    unitPrice, amount,
    // Kanban footers are plain values: the amount already formatted.
    amountText: amount === null ? '' : `${amount.toFixed(2)} €`,
    createdAt: o.created_at, updatedAt: o.updated_at,
  };
}

/** The adapter's body → the sandbox's body: only the writable fields, empty values left out. */
export function toSandboxBody(entity, kind, body) {
  const fields = WRITABLE[entity][kind] ?? WRITABLE[entity].create;
  const out = {};
  for (const [from, to] of Object.entries(fields)) {
    const v = body?.[from];
    if (v === undefined || v === null || v === '') continue;
    out[to] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/** 400 of the sandbox → field errors (paths in the names the front end sent). */
export function fieldErrorsOf(details) {
  if (!Array.isArray(details)) return [];
  return details.slice(0, 50).map((d) => {
    const field = camel(String(d.field ?? '').replace(/^\/?(body\.)?/, '').replace(/^\//, '')) || 'value';
    const message = String(d.message ?? '').toLowerCase();
    const code = /required|must have required/.test(message) ? 'required'
      : /email/.test(message) ? 'email'
        : /(maximum|<=|max|longer|fewer)/.test(message) ? 'max'
          : /(minimum|>=|min|shorter|more than|> 0|greater)/.test(message) ? 'min'
            : 'invalid';
    return { path: `/${field === 'userId' || field === 'user_id' ? 'userId' : field === 'productId' || field === 'product_id' ? 'productId' : field}`, code };
  });
}

// ------------------------------------------------------------------ the adapter

export class StoreAdapter {
  /**
   * @param {{ upstream: string, fetch?: typeof fetch, timeoutMs?: number, log?: (msg: string) => void }} options
   */
  constructor({ upstream, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15_000, log = () => {} }) {
    this.base = upstream.replace(/\/+$/, '');
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.log = log;
    /** subject → sandbox session id ('new' until the sandbox gives one). */
    this.sessions = new Map();
    /** subject → promise of the request in flight that is creating the session (no two sessions for one user). */
    this.creating = new Map();
  }

  // -------------------------------------------------------------- calls to the sandbox

  /** One call to the sandbox in the session of `subject`; returns the parsed body (null for 204). */
  async call(subject, method, path, { query, body } = {}) {
    const pending = this.creating.get(subject);
    if (pending) await pending.catch(() => {});
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const known = this.sessions.get(subject);
    const run = (async () => {
      let response;
      try {
        response = await this.fetch(url, {
          method,
          headers: {
            accept: 'application/json',
            'x-session-id': known ?? 'new',
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        this.log(`sandbox unreachable: ${method} ${path}: ${e?.name ?? e}`);
        throw new HttpError(502, 'Sandbox unreachable');
      }
      // The sandbox answers with the session it used: a new one when ours expired (30 minutes without requests).
      const session = response.headers.get('x-session-id');
      if (session && session !== known) {
        if (known) this.log(`session of ${subject} renewed (the previous one expired)`);
        this.sessions.set(subject, session);
      }
      return response;
    })();
    if (!known) {
      this.creating.set(subject, run);
      run.finally(() => this.creating.get(subject) === run && this.creating.delete(subject)).catch(() => {});
    }
    const response = await run;
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => null);
    if (response.ok) return payload;
    if (response.status === 404) throw notFound();
    if (response.status === 400 || response.status === 422) throw invalid(fieldErrorsOf(payload?.details));
    // The only uniqueness rule of the sandbox is the e-mail of a user: shown next to the field.
    if (response.status === 409 && path.startsWith('/api/v1/users')) throw invalid([{ path: '/email', code: 'taken' }]);
    if (response.status === 409) throw new HttpError(409, 'Conflict');
    if (response.status === 429) throw new HttpError(503, 'Sandbox busy');
    this.log(`sandbox error ${response.status}: ${method} ${path}`);
    throw new HttpError(502, 'Sandbox error');
  }

  /** Every row of an entity, page after page (the sandbox caps a page at 100). */
  async all(subject, entity, query = {}) {
    const rows = [];
    for (let page = 1; page <= ALL_PAGES_MAX; page++) {
      const res = await this.call(subject, 'GET', `/api/v1/${entity}`, { query: { ...query, page, limit: PAGE_SIZE_MAX } });
      rows.push(...(res?.data ?? []));
      if (!res?.pagination?.hasNext) break;
    }
    return rows;
  }

  async one(subject, entity, id, query) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw notFound();
    const res = await this.call(subject, 'GET', `/api/v1/${entity}/${id}`, { query });
    return res?.data ?? null;
  }

  /**
   * One page, with exact filters as query parameters and rich ones (contains, ranges) through the QUERY method,
   * which the sandbox implements on every entity path (same path, JSON body).
   */
  async page(subject, entity, q, { exact = {}, rich = {}, expand } = {}) {
    const page = Math.max(0, Number.parseInt(q.page ?? '0', 10) || 0);
    const size = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(q.size ?? '10', 10) || 10));
    const sortField = SORTABLE[entity][q.sort] ?? 'created_at';
    const order = q.direction === 'asc' ? 'asc' : 'desc';
    let res;
    if (Object.keys(rich).length) {
      const filters = { ...rich };
      for (const [k, v] of Object.entries(exact)) filters[k] = { eq: v };
      res = await this.call(subject, 'QUERY', `/api/v1/${entity}`, {
        query: expand ? { expand } : undefined,
        body: { filters, sort: sortField, order, limit: size, page: page + 1 },
      });
    } else {
      res = await this.call(subject, 'GET', `/api/v1/${entity}`, { query: { ...exact, page: page + 1, limit: size, sort: sortField, order, expand } });
    }
    const data = res?.data ?? [];
    return { rows: data, total: res?.pagination?.total ?? data.length, size };
  }

  // -------------------------------------------------------------- routing

  /**
   * Handles one request of the front end. `req` = { method, path (after /api/store), query, body }.
   * Returns the body to send (undefined → 204), or throws HttpError.
   */
  async handle(subject, req) {
    const { method, query: q = {}, body } = req;
    const parts = req.path.split('/').filter(Boolean);
    const [entity, id, extra] = parts;

    if (entity === 'summary' && method === 'GET' && parts.length === 1) return this.summary(subject);
    if (entity === 'stats' && method === 'GET' && id === 'orders-by-status') return this.ordersByStatus(subject);
    if (entity === 'stats' && method === 'GET' && id === 'stock-by-category') return this.stockByCategory(subject);
    if (entity === 'session') return this.session(subject, method, id);
    if (!['users', 'products', 'orders'].includes(entity) || extra !== undefined) throw notFound();

    if (method === 'GET' && id === undefined) return this.list(subject, entity, q);
    if (method === 'GET' && id === 'all') return this.listAll(subject, entity, q);
    if (method === 'GET' && id === 'search' && entity !== 'orders') return this.search(subject, entity, q);
    if (method === 'GET' && id === 'categories' && entity === 'products') return this.categories(subject, q);
    if (method === 'GET') return this.get(subject, entity, id);
    if (method === 'POST' && id === undefined) return this.create(subject, entity, body ?? {});
    if ((method === 'PATCH' || method === 'PUT') && id) return this.update(subject, entity, id, body ?? {});
    if (method === 'DELETE' && id) return this.remove(subject, entity, id);
    throw new HttpError(405, 'Method not allowed');
  }

  async list(subject, entity, q) {
    if (entity === 'users') {
      const term = text(q.q);
      const rich = term ? { [term.includes('@') ? 'email' : 'name']: { contains: term } } : {};
      const exact = q.role ? { role: q.role } : {};
      const r = await this.page(subject, 'users', q, { exact, rich });
      return { items: r.rows.map(toUser), total: r.total, size: r.size };
    }
    if (entity === 'products') {
      const rich = {};
      if (text(q.q)) rich.name = { contains: text(q.q) };
      if (q.lowStock === 'true') rich.stock = { lt: LOW_STOCK };
      const exact = text(q.category) ? { category: text(q.category) } : {};
      const r = await this.page(subject, 'products', q, { exact, rich });
      return { items: r.rows.map(toProduct), total: r.total, size: r.size };
    }
    const exact = {};
    if (q.status) exact.status = q.status;
    if (q.userId) exact.user_id = q.userId;
    if (q.productId) exact.product_id = q.productId;
    const r = await this.page(subject, 'orders', q, { exact, expand: 'user,product' });
    return { items: r.rows.map((o) => toOrder(o)), total: r.total, size: r.size };
  }

  async listAll(subject, entity, q) {
    if (entity === 'users') return (await this.all(subject, 'users', { sort: 'name', order: 'asc' })).map(toUser);
    if (entity === 'products') return (await this.all(subject, 'products', { sort: 'name', order: 'asc' })).map(toProduct);
    const exact = {};
    if (q.userId) exact.user_id = q.userId;
    if (q.productId) exact.product_id = q.productId;
    const limit = Number.parseInt(q.limit ?? '', 10);
    if (limit > 0) {
      const res = await this.call(subject, 'GET', '/api/v1/orders', {
        query: { ...exact, page: 1, limit: Math.min(limit, PAGE_SIZE_MAX), sort: 'created_at', order: 'desc', expand: 'user,product' },
      });
      return (res?.data ?? []).map((o) => toOrder(o));
    }
    const rows = await this.all(subject, 'orders', { ...exact, sort: 'created_at', order: 'desc', expand: 'user,product' });
    return rows.map((o) => toOrder(o));
  }

  /** Lookup: by id (lookupKey) or by the text typed (search), at most 20 rows. */
  async search(subject, entity, q) {
    const map = entity === 'users' ? toUser : toProduct;
    if (q.id) {
      const row = await this.one(subject, entity, q.id).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      return row ? [map(row)] : [];
    }
    const term = text(q.q);
    const field = entity === 'users' && term.includes('@') ? 'email' : 'name';
    const res = await this.call(subject, 'QUERY', `/api/v1/${entity}`, {
      body: { filters: term ? { [field]: { contains: term } } : {}, sort: 'name', order: 'asc', limit: 20, page: 1 },
    });
    return (res?.data ?? []).map(map);
  }

  async categories(subject, q) {
    const prefix = text(q.q).toLowerCase();
    const names = new Set((await this.all(subject, 'products')).map((p) => p.category).filter(Boolean));
    return [...names].filter((c) => c.toLowerCase().includes(prefix)).sort().slice(0, 20).map((value) => ({ value }));
  }

  async get(subject, entity, id) {
    if (entity === 'orders') return toOrder(await this.one(subject, 'orders', id, { expand: 'user,product' }));
    const row = await this.one(subject, entity, id);
    return entity === 'users' ? toUser(row) : toProduct(row);
  }

  async create(subject, entity, body) {
    const payload = toSandboxBody(entity, 'create', body);
    if (entity === 'users') await this.checkEmail(subject, payload.email);
    if (entity === 'orders') await this.checkOrder(subject, payload);
    const res = await this.call(subject, 'POST', `/api/v1/${entity}`, { body: payload });
    return this.get(subject, entity, res.data.id);
  }

  async update(subject, entity, id, body) {
    const payload = toSandboxBody(entity, 'update', body);
    if (entity === 'users' && payload.email) await this.checkEmail(subject, payload.email, id);
    if (entity === 'orders') {
      const current = await this.one(subject, 'orders', id);
      if (payload.status && payload.status !== current.status && !TRANSITIONS[current.status]?.includes(payload.status)) {
        throw new HttpError(409, 'Status change not allowed', [{ path: '/status', code: 'transition', params: { from: current.status } }]);
      }
      if (['completed', 'cancelled'].includes(current.status) && (payload.quantity !== undefined && payload.quantity !== current.quantity)) {
        throw new HttpError(409, 'Closed order', [{ path: '/quantity', code: 'closed' }]);
      }
    }
    if (!Object.keys(payload).length) return this.get(subject, entity, id);
    await this.call(subject, 'PATCH', `/api/v1/${entity}/${id}`, { body: payload });
    return this.get(subject, entity, id);
  }

  async remove(subject, entity, id) {
    if (entity !== 'orders') {
      const key = entity === 'users' ? 'user_id' : 'product_id';
      const res = await this.call(subject, 'GET', '/api/v1/orders', { query: { [key]: id, limit: 1 } });
      if ((res?.pagination?.total ?? res?.data?.length ?? 0) > 0) throw new HttpError(409, 'Referenced by orders');
    }
    await this.call(subject, 'DELETE', `/api/v1/${entity}/${id}`);
    return undefined;
  }

  // -------------------------------------------------------------- business rules

  async checkEmail(subject, email, exceptId) {
    if (!email) return;
    const res = await this.call(subject, 'GET', '/api/v1/users', { query: { email, limit: 2 } });
    if ((res?.data ?? []).some((u) => u.email?.toLowerCase() === email.toLowerCase() && u.id !== exceptId)) {
      throw invalid([{ path: '/email', code: 'taken' }]);
    }
  }

  async checkOrder(subject, payload) {
    const errors = [];
    const [user, product] = await Promise.all([
      payload.user_id ? this.one(subject, 'users', payload.user_id).catch(() => null) : null,
      payload.product_id ? this.one(subject, 'products', payload.product_id).catch(() => null) : null,
    ]);
    if (!payload.user_id) errors.push({ path: '/userId', code: 'required' });
    else if (!user) errors.push({ path: '/userId', code: 'notFound' });
    if (!payload.product_id) errors.push({ path: '/productId', code: 'required' });
    else if (!product) errors.push({ path: '/productId', code: 'notFound' });
    const quantity = payload.quantity ?? 1;
    if (product && quantity > (product.stock ?? 0)) errors.push({ path: '/quantity', code: 'stock', params: { available: product.stock ?? 0 } });
    if (payload.status && !['pending', 'processing'].includes(payload.status)) errors.push({ path: '/status', code: 'invalid' });
    if (errors.length) throw invalid(errors);
  }

  // -------------------------------------------------------------- indicators

  async snapshot(subject) {
    const [users, products, orders] = await Promise.all([
      this.all(subject, 'users'), this.all(subject, 'products'), this.all(subject, 'orders'),
    ]);
    const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
    const u = byId(users);
    const p = byId(products);
    return { users, products, orders: orders.map((o) => toOrder(o, u, p)) };
  }

  async summary(subject) {
    const { users, products, orders } = await this.snapshot(subject);
    const count = (s) => orders.filter((o) => o.status === s).length;
    const sum = (rows) => round2(rows.reduce((t, o) => t + (o.amount ?? 0), 0));
    return {
      users: users.length,
      products: products.length,
      lowStock: products.filter((x) => (x.stock ?? 0) < LOW_STOCK).length,
      orders: orders.length,
      pending: count('pending'), processing: count('processing'), completed: count('completed'), cancelled: count('cancelled'),
      open: count('pending') + count('processing'),
      revenue: sum(orders.filter((o) => o.status === 'completed')),
      openValue: sum(orders.filter((o) => ['pending', 'processing'].includes(o.status))),
    };
  }

  async ordersByStatus(subject) {
    const orders = (await this.snapshot(subject)).orders;
    // Order chosen for the colours of the pie (theme palette: primary, success, danger, then lighter tones):
    // processing blue, completed green, cancelled red, pending light.
    return ['processing', 'completed', 'cancelled', 'pending'].map((status) => {
      const rows = orders.filter((o) => o.status === status);
      return { status, count: rows.length, amount: round2(rows.reduce((t, o) => t + (o.amount ?? 0), 0)) };
    });
  }

  async stockByCategory(subject) {
    const products = await this.all(subject, 'products');
    const groups = new Map();
    for (const x of products) {
      const g = groups.get(x.category || 'general') ?? { category: x.category || 'general', products: 0, stock: 0, value: 0 };
      g.products += 1;
      g.stock += x.stock ?? 0;
      g.value = round2(g.value + (x.stock ?? 0) * Number(x.price));
      groups.set(g.category, g);
    }
    return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category));
  }

  // -------------------------------------------------------------- session

  async session(subject, method, action) {
    if (method === 'GET' && action === undefined) {
      const res = await this.call(subject, 'GET', '/session');
      const d = res?.data ?? {};
      return {
        sessionId: d.session_id, createdAt: d.created_at, expiresAt: d.expires_at,
        recordsPerEntity: d.limits?.records_per_entity ?? null,
      };
    }
    if (method === 'POST' && action === 'reset') {
      await this.call(subject, 'POST', '/api/v1/demo/reset');
      return { done: true };
    }
    if (method === 'POST' && action === 'new') {
      this.sessions.delete(subject);
      const res = await this.call(subject, 'POST', '/session/new');
      const id = res?.data?.session_id;
      if (id) this.sessions.set(subject, id);
      return { done: true };
    }
    throw notFound();
  }
}
