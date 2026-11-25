// Permissions per role and the answers of /authz (contracts/authz.yaml).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { check, grantsFor, rolePermissions, rolesFromClaims } from '../src/permissions.mjs';
import { fakeProvider, problem, ROLES, startBff } from './helpers.mjs';

describe('permissions file', () => {
  it('refuses a permission outside the domain.resource.action format', () => {
    assert.throws(() => rolePermissions({ operator: ['Orders.Read'] }), /domain\.resource\.action/);
    assert.throws(() => rolePermissions(['operator']), /object of roles/);
  });

  it('joins the permissions of the known roles, with a version that changes with them', () => {
    const table = rolePermissions(ROLES);
    const operator = grantsFor(['operator', 'unknown'], table);
    const both = grantsFor(['manager', 'operator'], table);
    assert.deepEqual(operator.roles, ['operator']);
    assert.deepEqual(both.permissions, ['orders.order.approve', 'orders.order.read']);
    assert.notEqual(operator.version, both.version);
    assert.equal(grantsFor(['manager', 'operator'], table).version, grantsFor(['manager'], table).version);
  });

  it('reads the roles at a path of the token', () => {
    assert.deepEqual(rolesFromClaims({ realm_access: { roles: ['a', 1, 'b'] } }, 'realm_access.roles'), ['a', 'b']);
    assert.deepEqual(rolesFromClaims({}, 'realm_access.roles'), []);
    assert.deepEqual(rolesFromClaims({ groups: ['x'] }, 'groups'), ['x']);
  });

  it('checks a batch in order, echoing the resource', () => {
    const outcome = check({ checks: [{ permission: 'a.b.c' }, { permission: 'x.y.z', resource: { type: 'order', id: '7' } }] }, new Set(['x.y.z']));
    assert.deepEqual(outcome, { results: [{ permission: 'a.b.c', allowed: false }, { permission: 'x.y.z', resource: { type: 'order', id: '7' }, allowed: true }] });
    assert.ok('invalid' in check({}, new Set()));
    assert.ok('invalid' in check({ checks: [{ permission: 'Bad' }] }, new Set()));
    assert.ok('invalid' in check({ checks: Array.from({ length: 201 }, () => ({ permission: 'a.b.c' })) }, new Set()));
  });
});

describe('/authz', () => {
  /** @type {Awaited<ReturnType<typeof startBff>>} */
  let bff;
  before(async () => (bff = await startBff({ provider: fakeProvider({ claims: { realm_access: { roles: ['manager'] } } }) })));
  after(() => bff.close());

  it('capabilities: the permissions of the roles and the version, also in the header', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.fetch('/authz/capabilities?app=demo');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(body.permissions, ['orders.order.approve', 'orders.order.read']);
    assert.equal(r.headers.get('x-permissions-version'), body.version);
  });

  it('capabilities without app: 400', async () => {
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.fetch('/authz/capabilities'), 400));
  });

  it('check: needs the CSRF token like any write, and answers 400 on a wrong body', async () => {
    const browser = bff.client();
    await browser.login();
    const ok = await browser.write('/authz/check', { checks: [{ permission: 'orders.order.approve' }, { permission: 'orders.iban.read' }] });
    assert.deepEqual((await ok.json()).results.map((/** @type {any} */ r) => r.allowed), [true, false]);
    assert.ok(await problem(await browser.write('/authz/check', { checks: [] }, { 'X-XSRF-TOKEN': 'wrong' }), 403));
    assert.ok(await problem(await browser.write('/authz/check', { checks: [{ permission: 'Orders.Approve' }] }), 400));
    const notJson = await browser.fetch('/authz/check', { method: 'POST', headers: { 'X-XSRF-TOKEN': browser.csrf, 'Content-Type': 'application/json' }, body: '{not json' });
    assert.ok(await problem(notJson, 400));
  });
});
