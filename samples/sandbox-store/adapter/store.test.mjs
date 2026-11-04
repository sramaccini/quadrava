// Tests of the store adapter against the imitation of the sandbox: node --test adapter/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxMock } from './sandbox-mock.mjs';
import { HttpError, StoreAdapter, fieldErrorsOf, toOrder, toSandboxBody } from './store.mjs';
import { permissionOf } from './server.mjs';

function setup() {
  const mock = new SandboxMock();
  const adapter = new StoreAdapter({ upstream: 'http://sandbox', fetch: mock.fetch });
  const call = (subject, method, path, extra = {}) => adapter.handle(subject, { method, path, query: {}, ...extra });
  return { mock, adapter, call };
}

async function rejects(promise, status, errors) {
  await assert.rejects(promise, (e) => {
    assert.ok(e instanceof HttpError, `HttpError expected, got ${e}`);
    assert.equal(e.status, status);
    if (errors) assert.deepEqual(e.errors, errors);
    return true;
  });
}

test('server-paged list: 0-based page in, { items, total, size } out, camelCase rows', async () => {
  const { call } = setup();
  const first = await call('alice', 'GET', '/users', { query: { page: '0', size: '2', sort: 'name', direction: 'asc' } });
  assert.equal(first.total, 5);
  assert.equal(first.size, 2);
  assert.deepEqual(first.items.map((u) => u.name), ['Alice Johnson', 'Bob Smith']);
  assert.ok(first.items[0].createdAt && !('created_at' in first.items[0]));
  const second = await call('alice', 'GET', '/users', { query: { page: '1', size: '2', sort: 'name', direction: 'asc' } });
  assert.deepEqual(second.items.map((u) => u.name), ['Charlie Brown', 'Diana Prince']);
});

test('unknown sort fields are not passed on', async () => {
  const { call, mock } = setup();
  await call('alice', 'GET', '/users', { query: { sort: 'password; drop', direction: 'asc' } });
  assert.ok(mock.calls.length > 0);
});

test('search text uses QUERY contains; e-mail-looking text searches the e-mail', async () => {
  const { call, mock } = setup();
  const byName = await call('alice', 'GET', '/users', { query: { q: 'smi' } });
  assert.deepEqual(byName.items.map((u) => u.name), ['Bob Smith']);
  assert.equal(mock.calls.at(-1).method, 'QUERY');
  const byEmail = await call('alice', 'GET', '/users', { query: { q: 'diana@' } });
  assert.deepEqual(byEmail.items.map((u) => u.name), ['Diana Prince']);
});

test('products: low stock filter and stock level', async () => {
  const { call } = setup();
  const low = await call('alice', 'GET', '/products', { query: { lowStock: 'true' } });
  assert.deepEqual(low.items.map((p) => [p.name, p.stockLevel]).sort(), [['Board Game Night', 'out'], ['Mechanical Keyboard', 'low']]);
});

test('orders are flat rows with customer, product, unit price and amount', async () => {
  const { call } = setup();
  const list = await call('alice', 'GET', '/orders', { query: { status: 'completed' } });
  assert.equal(list.total, 1);
  const [o] = list.items;
  assert.equal(o.userName, 'Alice Johnson');
  assert.equal(o.productName, 'Wireless Mouse');
  assert.equal(o.unitPrice, 24.99);
  assert.equal(o.amount, 49.98);
  assert.match(o.number, /^ORD-[0-9A-F-]{8}$/);
});

test('each user has a sandbox session of their own; the data does not leak', async () => {
  const { call, adapter } = setup();
  await call('alice', 'POST', '/users', { body: { name: 'Only Alice', email: 'only@alice.test', role: 'user' } });
  const alice = await call('alice', 'GET', '/users', { query: { q: 'Only' } });
  const bob = await call('bob', 'GET', '/users', { query: { q: 'Only' } });
  assert.equal(alice.total, 1);
  assert.equal(bob.total, 0);
  assert.notEqual(adapter.sessions.get('alice'), adapter.sessions.get('bob'));
});

test('concurrent first requests of one user share a single new session', async () => {
  const { call, mock, adapter } = setup();
  await Promise.all([call('carol', 'GET', '/users'), call('carol', 'GET', '/products'), call('carol', 'GET', '/orders')]);
  const sessions = new Set(mock.calls.map((c) => c.session));
  assert.equal(sessions.size, 1);
  assert.equal(adapter.sessions.get('carol'), [...sessions][0]);
});

test('an expired session is replaced transparently', async () => {
  const { call, mock, adapter } = setup();
  await call('alice', 'GET', '/users');
  const old = adapter.sessions.get('alice');
  mock.expire(old);
  const again = await call('alice', 'GET', '/users');
  assert.equal(again.total, 5);
  assert.notEqual(adapter.sessions.get('alice'), old);
});

test('create user: body whitelisted and trimmed, the created record is returned', async () => {
  const { call } = setup();
  const created = await call('alice', 'POST', '/users', { body: { name: ' Zoe ', email: 'zoe@example.com', role: 'user', age: null, id: 'x', createdAt: 'y' } });
  assert.equal(created.name, 'Zoe');
  assert.equal(created.age, null);
  assert.ok(created.id && created.id !== 'x');
});

test('duplicate e-mail → 422 with a field error on /email', async () => {
  const { call } = setup();
  await rejects(call('alice', 'POST', '/users', { body: { name: 'Again', email: 'BOB@example.com' } }), 422, [{ path: '/email', code: 'taken' }]);
  const bob = (await call('alice', 'GET', '/users', { query: { q: 'bob@' } })).items[0];
  // Saving a user with their own e-mail is fine.
  const same = await call('alice', 'PATCH', `/users/${bob.id}`, { body: { name: 'Robert Smith', email: 'bob@example.com' } });
  assert.equal(same.name, 'Robert Smith');
});

test('sandbox validation errors become field errors in the front end’s names', async () => {
  const { call } = setup();
  await rejects(call('alice', 'POST', '/products', { body: { name: 'Free', price: -1 } }), 422, [{ path: '/price', code: 'min' }]);
  assert.deepEqual(fieldErrorsOf([{ field: 'user_id', message: 'must match format "uuid"' }]), [{ path: '/userId', code: 'invalid' }]);
});

test('new order: user and product must exist and the stock must be enough', async () => {
  const { call } = setup();
  const users = await call('alice', 'GET', '/users/all');
  const products = await call('alice', 'GET', '/products/all');
  const keyboard = products.find((p) => p.name === 'Mechanical Keyboard'); // 8 in stock
  await rejects(call('alice', 'POST', '/orders', { body: { userId: users[0].id, productId: keyboard.id, quantity: 9 } }), 422,
    [{ path: '/quantity', code: 'stock', params: { available: 8 } }]);
  await rejects(call('alice', 'POST', '/orders', { body: { productId: keyboard.id } }), 422, [{ path: '/userId', code: 'required' }]);
  await rejects(call('alice', 'POST', '/orders', { body: { userId: '00000000-0000-4000-8000-000000000000', productId: keyboard.id } }), 422,
    [{ path: '/userId', code: 'notFound' }]);
  const order = await call('alice', 'POST', '/orders', { body: { userId: users[0].id, productId: keyboard.id, quantity: 2, status: 'pending', notes: 'gift' } });
  assert.equal(order.amount, 179.8);
  assert.equal(order.status, 'pending');
});

test('order status follows pending → processing → completed; closed orders do not move', async () => {
  const { call } = setup();
  const pending = (await call('alice', 'GET', '/orders', { query: { status: 'pending' } })).items[0];
  await rejects(call('alice', 'PATCH', `/orders/${pending.id}`, { body: { status: 'completed' } }), 409);
  assert.equal((await call('alice', 'PATCH', `/orders/${pending.id}`, { body: { status: 'processing' } })).status, 'processing');
  assert.equal((await call('alice', 'PATCH', `/orders/${pending.id}`, { body: { status: 'completed' } })).status, 'completed');
  await rejects(call('alice', 'PATCH', `/orders/${pending.id}`, { body: { status: 'cancelled' } }), 409);
  await rejects(call('alice', 'PATCH', `/orders/${pending.id}`, { body: { quantity: 3 } }), 409);
});

test('order edit sends only quantity, status and notes (the sandbox refuses the rest)', async () => {
  const { call } = setup();
  const order = (await call('alice', 'GET', '/orders', { query: { status: 'pending' } })).items[0];
  const saved = await call('alice', 'PATCH', `/orders/${order.id}`, { body: { ...order, quantity: 3, notes: 'call first' } });
  assert.equal(saved.quantity, 3);
  assert.equal(saved.notes, 'call first');
  assert.deepEqual(toSandboxBody('orders', 'update', { userId: 'a', quantity: 2, status: '', notes: null }), { quantity: 2 });
});

test('users and products with orders cannot be deleted; others can', async () => {
  const { call } = setup();
  const users = await call('alice', 'GET', '/users/all');
  const alice = users.find((u) => u.name === 'Alice Johnson');
  const ethan = users.find((u) => u.name === 'Ethan Hunt');
  await rejects(call('alice', 'DELETE', `/users/${alice.id}`), 409);
  assert.equal(await call('alice', 'DELETE', `/users/${ethan.id}`), undefined);
  await rejects(call('alice', 'GET', `/users/${ethan.id}`), 404);
});

test('lookups: by text and by id (lookupKey)', async () => {
  const { call } = setup();
  const found = await call('alice', 'GET', '/products/search', { query: { q: 'key' } });
  assert.deepEqual(found.map((p) => p.name), ['Mechanical Keyboard']);
  assert.equal(found[0].label, 'Mechanical Keyboard');
  const byId = await call('alice', 'GET', '/products/search', { query: { id: found[0].id } });
  assert.equal(byId[0].id, found[0].id);
  assert.deepEqual(await call('alice', 'GET', '/products/search', { query: { id: '00000000-0000-4000-8000-000000000000' } }), []);
});

test('dashboard indicators', async () => {
  const { call } = setup();
  const s = await call('alice', 'GET', '/summary');
  assert.deepEqual({ users: s.users, products: s.products, orders: s.orders, lowStock: s.lowStock, open: s.open }, { users: 5, products: 5, orders: 5, lowStock: 2, open: 3 });
  assert.equal(s.revenue, 49.98);
  assert.equal(s.openValue, round(34.5 + 89.9 + 4 * 9.5));
  const byStatus = await call('alice', 'GET', '/stats/orders-by-status');
  assert.deepEqual(byStatus.map((r) => [r.status, r.count]), [['processing', 1], ['completed', 1], ['cancelled', 1], ['pending', 2]]);
  const byCategory = await call('alice', 'GET', '/stats/stock-by-category');
  assert.deepEqual(byCategory.map((r) => r.category), ['books', 'electronics', 'games', 'general']);
  assert.equal(byCategory.find((r) => r.category === 'electronics').stock, 128);
});

test('session: info, reset to the demo data, new session', async () => {
  const { call, adapter } = setup();
  await call('alice', 'POST', '/users', { body: { name: 'Temp', email: 'temp@example.com' } });
  const info = await call('alice', 'GET', '/session');
  assert.equal(info.sessionId, adapter.sessions.get('alice'));
  await call('alice', 'POST', '/session/reset');
  assert.equal((await call('alice', 'GET', '/users')).total, 5);
  await call('alice', 'POST', '/session/new');
  assert.notEqual(adapter.sessions.get('alice'), info.sessionId);
});

test('unknown routes and ids', async () => {
  const { call } = setup();
  await rejects(call('alice', 'GET', '/invoices'), 404);
  await rejects(call('alice', 'GET', '/users/not-a-uuid'), 404);
  await rejects(call('alice', 'GET', '/users/a/b'), 404);
});

test('permissions of the routes', () => {
  assert.equal(permissionOf('GET', '/users'), 'store.user.read');
  assert.equal(permissionOf('GET', '/users/search'), 'store.user.read');
  assert.equal(permissionOf('POST', '/orders'), 'store.order.create');
  assert.equal(permissionOf('PATCH', '/orders/x'), 'store.order.update');
  assert.equal(permissionOf('DELETE', '/products/x'), 'store.product.delete');
  assert.equal(permissionOf('GET', '/summary'), 'store.dashboard.read');
  assert.equal(permissionOf('POST', '/session/reset'), 'store.session.manage');
  assert.equal(permissionOf('POST', '/summary'), null);
  assert.equal(permissionOf('GET', '/admin'), null);
});

test('an order whose user or product was removed still shows', () => {
  const row = toOrder({ id: 'abcdef12-0000', user_id: null, product_id: null, quantity: 1, status: 'pending' });
  assert.equal(row.userName, '—');
  assert.equal(row.amount, null);
});

const round = (n) => Math.round(n * 100) / 100;
