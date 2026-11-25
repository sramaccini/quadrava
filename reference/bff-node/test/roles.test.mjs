// Operational roles (ADR-28): the role of the session, POST /bff/role, /authz with the active role, X-Active-Role.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { grantsFor, rolePermissions } from '../src/permissions.mjs';
import { fakeProvider, listen, problem, startBff } from './helpers.mjs';

/** A base role and two operational ones, the separation of duties of the ADR. */
const ROLES = {
  user: { label: 'User', base: true, permissions: ['profile.profile.read'] },
  clerk: { label: 'Clerk', permissions: ['orders.order.create'] },
  approver: { label: 'Approver', permissions: ['orders.order.approve'] },
};
const claims = { realm_access: { roles: ['user', 'clerk', 'approver', 'offline_access'] } };

describe('permissions of a role', () => {
  it('reads labels and base flags, and keeps the lists of permissions of the earlier format', () => {
    const table = rolePermissions({ ...ROLES, auditor: ['audit.log.read'] });
    assert.deepEqual(table.get('user'), { label: 'User', base: true, permissions: ['profile.profile.read'] });
    assert.deepEqual(table.get('auditor'), { label: 'auditor', base: false, permissions: ['audit.log.read'] });
    assert.throws(() => rolePermissions({ user: { base: 'yes', permissions: [] } }), /base as true or false/);
    assert.throws(() => rolePermissions({ user: { label: 'User' } }), /domain\.resource\.action/);
  });

  it('the base roles plus the active one; the wanted role only if the user holds it, otherwise the first', () => {
    const table = rolePermissions(ROLES);
    const roles = ['user', 'clerk', 'approver'];
    const approver = grantsFor(roles, table, 'approver');
    assert.equal(approver.currentRole, 'approver');
    assert.deepEqual(approver.permissions, ['orders.order.approve', 'profile.profile.read']);
    assert.deepEqual(approver.operationalRoles, [{ id: 'approver', label: 'Approver' }, { id: 'clerk', label: 'Clerk' }]);
    assert.equal(grantsFor(roles, table, 'admin').currentRole, 'approver');
    // Same permissions for two roles would still give two versions: the version follows the role too.
    const both = rolePermissions({ a: ['x.y.z'], b: ['x.y.z'] });
    assert.notEqual(grantsFor(['a', 'b'], both, 'a').version, grantsFor(['a', 'b'], both, 'b').version);
    // Without operational roles: all the roles, no current one.
    const base = grantsFor(['user'], table);
    assert.equal(base.currentRole, undefined);
    assert.deepEqual(base.operationalRoles, []);
  });
});

/** @type {{ headers: import('node:http').IncomingHttpHeaders }[]} */
const seen = [];
const upstream = await listen((req, res) => {
  seen.push({ headers: req.headers });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{}');
});

describe('the role of the session', () => {
  /** @type {Awaited<ReturnType<typeof startBff>>} */
  let bff;
  before(async () => (bff = await startBff({ roles: ROLES, provider: fakeProvider({ claims }), env: { BFF_ROUTES: `/api=${upstream.url}` } })));
  after(async () => {
    await bff.close();
    await upstream.close();
  });

  it('opens on an operational role and lists them in the user', async () => {
    const browser = bff.client();
    await browser.login();
    const user = await (await browser.fetch('/bff/user')).json();
    assert.deepEqual(user.roles, ['approver', 'clerk', 'user']);
    assert.deepEqual(user.operationalRoles, [{ id: 'approver', label: 'Approver' }, { id: 'clerk', label: 'Clerk' }]);
    assert.equal(user.currentRole, 'approver');
    const roles = await (await browser.fetch('/authz/roles?app=demo')).json();
    assert.deepEqual(roles, [{ id: 'approver', label: 'Approver', base: false }, { id: 'clerk', label: 'Clerk', base: false }, { id: 'user', label: 'User', base: true }]);
    assert.ok(await problem(await browser.fetch('/authz/roles'), 400));
  });

  it('switches with a POST and the CSRF token: permissions and version change, and the next login keeps the role', async () => {
    const browser = bff.client();
    await browser.login();
    const before = await (await browser.fetch('/authz/capabilities?app=demo')).json();
    const r = await browser.write('/bff/role', { role: 'clerk' });
    assert.equal(r.status, 204);
    const after = await (await browser.fetch('/authz/capabilities?app=demo')).json();
    assert.deepEqual(after.permissions, ['orders.order.create', 'profile.profile.read']);
    assert.notEqual(after.version, before.version);
    assert.equal(r.headers.get('x-permissions-version'), after.version);
    assert.equal((await (await browser.fetch('/bff/user')).json()).currentRole, 'clerk');

    const again = bff.client();
    await again.login();
    assert.equal((await (await again.fetch('/bff/user')).json()).currentRole, 'clerk');
    assert.equal((await again.write('/bff/role', { role: 'approver' })).status, 204);
  });

  it('refuses a role not offered (404), a malformed body (400), a missing CSRF token (403) and a GET', async () => {
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.write('/bff/role', { role: 'user' }), 404));
    assert.ok(await problem(await browser.write('/bff/role', { role: 'admin' }), 404));
    assert.ok(await problem(await browser.write('/bff/role', { role: 7 }), 400));
    assert.ok(await problem(await browser.write('/bff/role', { role: 'clerk', extra: true }), 400));
    assert.ok(await problem(await browser.write('/bff/role', ['clerk']), 400));
    assert.ok(await problem(await browser.write('/bff/role', { role: 'clerk' }, { 'X-XSRF-TOKEN': 'wrong' }), 403));
    assert.ok(await problem(await browser.fetch('/bff/role'), 405));
    assert.equal((await (await browser.fetch('/bff/user')).json()).currentRole, 'approver');
  });

  it('a role sent by the page does not widen the permissions of the session', async () => {
    const browser = bff.client();
    await browser.login();
    const own = await (await browser.fetch('/authz/capabilities?app=demo')).json();
    const asked = await (await browser.fetch('/authz/capabilities?app=demo&role=clerk', { headers: { 'X-Active-Role': 'clerk' } })).json();
    assert.deepEqual(asked, own);
    const checked = await (await browser.write('/authz/check', { role: 'clerk', checks: [{ permission: 'orders.order.create' }] }, { 'X-Active-Role': 'clerk' })).json();
    assert.equal(checked.results[0].allowed, false);
  });

  it('forwards the active role in X-Active-Role, never the one of the page', async () => {
    const browser = bff.client();
    await browser.login();
    await browser.fetch('/api/orders', { headers: { 'X-Active-Role': 'clerk' } });
    assert.equal(seen.at(-1)?.headers['x-active-role'], 'approver');
    await browser.write('/bff/role', { role: 'clerk' });
    await browser.fetch('/api/orders');
    assert.equal(seen.at(-1)?.headers['x-active-role'], 'clerk');
  });

  it('without operational roles the user has no role fields and the page cannot add a role header', async () => {
    const plain = await startBff({ roles: { user: { base: true, permissions: ['profile.profile.read'] } }, provider: fakeProvider({ claims: { realm_access: { roles: ['user'] } } }),
      env: { BFF_ROUTES: `/api=${upstream.url}` } });
    try {
      const browser = plain.client();
      await browser.login();
      const user = await (await browser.fetch('/bff/user')).json();
      assert.equal('operationalRoles' in user, false);
      assert.equal('currentRole' in user, false);
      assert.ok(await problem(await browser.write('/bff/role', { role: 'user' }), 404));
      await browser.fetch('/api/orders', { headers: { 'X-Active-Role': 'admin' } });
      assert.equal(seen.at(-1)?.headers['x-active-role'], undefined);
    } finally {
      await plain.close();
    }
  });
});
