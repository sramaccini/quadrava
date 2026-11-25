// Login, return address, session cookie, user, CSRF and logout (contracts/bff.yaml), with a fake identity provider.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { fakeProvider, problem, startBff } from './helpers.mjs';

describe('without a session', () => {
  /** @type {Awaited<ReturnType<typeof startBff>>} */
  let bff;
  before(async () => (bff = await startBff()));
  after(() => bff.close());

  it('answers 401 in Problem format on the user, the permissions and the routes, never a redirect', async () => {
    for (const path of ['/bff/user', '/authz/capabilities?app=demo', '/api/orders', '/unknown']) {
      const r = await bff.client().fetch(path, { headers: { Accept: 'text/html' } });
      assert.ok(await problem(r, 401), path);
    }
  });

  it('gives a CSRF token in a cookie the page can read', async () => {
    const r = await bff.client().fetch('/bff/user');
    const line = r.headers.getSetCookie().find((c) => c.startsWith('XSRF-TOKEN='));
    assert.ok(line);
    assert.doesNotMatch(line, /HttpOnly/i);
    assert.match(line, /Path=\//);
  });

  it('does not send the CSRF token again when the browser has one', async () => {
    const browser = bff.client();
    await browser.fetch('/bff/user');
    const r = await browser.fetch('/bff/user');
    assert.equal(r.headers.getSetCookie().length, 0);
  });

  it('refuses a write with 401', async () => {
    const r = await bff.client().write('/logout');
    assert.ok(await problem(r, 401));
  });
});

describe('login', () => {
  /** @type {Awaited<ReturnType<typeof startBff>>} */
  let bff;
  before(async () => (bff = await startBff()));
  after(() => bff.close());

  it('goes to the provider with PKCE state and the callback on the address of the BFF', async () => {
    const r = await bff.client().fetch('/bff/login?return=' + encodeURIComponent('http://app.test/a?b=1'));
    assert.equal(r.status, 302);
    const location = new URL(String(r.headers.get('location')));
    assert.equal(location.origin, 'https://idp.test');
    assert.equal(location.searchParams.get('redirect_uri'), `${bff.url}/login/oauth2/code/keycloak`);
    assert.ok((location.searchParams.get('state') ?? '').length >= 40);
  });

  it('refuses a return page outside the applications with 400 in Problem format', async () => {
    for (const target of ['https://evil.test/', 'http://app.test.evil.test/', 'javascript:alert(1)', '//evil.test/', '/relative']) {
      const r = await bff.client().fetch('/bff/login?return=' + encodeURIComponent(target));
      assert.ok(await problem(r, 400), target);
    }
  });

  it('passes max_age to the provider, even inside a session', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.fetch('/bff/login?max_age=0&return=' + encodeURIComponent('http://app.test/'));
    assert.equal(new URL(String(r.headers.get('location'))).searchParams.get('max_age'), '0');
  });

  it('refuses a max_age that is not a number of seconds', async () => {
    for (const value of ['-1', 'abc', '1e3', '9999999999']) {
      assert.ok(await problem(await bff.client().fetch(`/bff/login?max_age=${value}`), 400), value);
    }
  });

  it('goes back to the return page with a session cookie HttpOnly and SameSite=Lax, and a new CSRF token', async () => {
    const browser = bff.client();
    await browser.fetch('/bff/user');
    const visitorToken = browser.csrf;
    const r = await browser.login();
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'http://app.test/orders');
    const session = r.headers.getSetCookie().find((c) => c.startsWith('BFF_SESSION='));
    assert.match(String(session), /HttpOnly/);
    assert.match(String(session), /SameSite=Lax/);
    assert.doesNotMatch(String(session), /Secure/);
    assert.notEqual(browser.csrf, visitorToken);
  });

  it('without a return page lands on the home', async () => {
    const r = await bff.client().login('');
    assert.equal(r.headers.get('location'), 'http://app.test/');
  });

  it('with a session and no max_age goes straight back', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.fetch('/bff/login?return=' + encodeURIComponent('http://app.test/x'));
    assert.equal(r.headers.get('location'), 'http://app.test/x');
  });

  it('refuses a callback from another browser (login CSRF) and a state used twice', async () => {
    const victim = bff.client();
    const start = await victim.fetch('/bff/login');
    const state = new URL(String(start.headers.get('location'))).searchParams.get('state');
    const attacker = bff.client();
    assert.ok(await problem(await attacker.fetch(`/login/oauth2/code/keycloak?code=good-code&state=${state}`), 400));
    // The state is spent: the right browser cannot use it either.
    assert.ok(await problem(await victim.fetch(`/login/oauth2/code/keycloak?code=good-code&state=${state}`), 400));
  });

  it('answers 400 when the provider refuses the code or reports an error', async () => {
    assert.ok(await problem(await bff.client().login(undefined, 'bad-code'), 400));
    const browser = bff.client();
    const start = await browser.fetch('/bff/login');
    const state = new URL(String(start.headers.get('location'))).searchParams.get('state');
    assert.ok(await problem(await browser.fetch(`/login/oauth2/code/keycloak?error=access_denied&state=${state}`), 400));
  });
});

describe('with a session', () => {
  /** @type {Awaited<ReturnType<typeof startBff>>} */
  let bff;
  before(async () => (bff = await startBff()));
  after(() => bff.close());

  it('gives the user with the roles the permissions file knows, and no tokens', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.fetch('/bff/user');
    assert.equal(r.status, 200);
    const user = await r.json();
    assert.deepEqual(user, { name: 'Demo Operator', username: 'operator', email: 'operator@example.test', roles: ['operator'] });
    assert.ok(r.headers.get('x-permissions-version'));
  });

  it('refuses a write without the CSRF header, or with a wrong one, with 403', async () => {
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.write('/logout', undefined, { 'X-XSRF-TOKEN': '' }), 403));
    assert.ok(await problem(await browser.write('/logout', undefined, { 'X-XSRF-TOKEN': 'not-the-token' }), 403));
    assert.equal((await browser.fetch('/bff/user')).status, 200, 'the session is still open');
  });

  it('refuses a write from an origin that is not an application', async () => {
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.write('/logout', undefined, { Origin: 'https://evil.test' }), 403));
    assert.equal((await browser.write('/logout', undefined, { Origin: 'http://app.test' })).status, 200);
  });

  it('logout closes the session and answers the logout address of the provider', async () => {
    const browser = bff.client();
    await browser.login();
    const r = await browser.write('/logout', undefined, { Origin: 'http://app.test' });
    assert.equal(r.status, 200);
    const { redirect } = await r.json();
    const target = new URL(redirect);
    assert.equal(target.origin, 'https://idp.test');
    assert.equal(target.searchParams.get('id_token_hint'), 'id-1');
    assert.equal(target.searchParams.get('post_logout_redirect_uri'), 'http://app.test/');
    assert.equal((await browser.fetch('/bff/user')).status, 401);
  });

  it('logout with GET is not allowed', async () => {
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.fetch('/logout'), 405));
  });

  it('an unknown path answers 404', async () => {
    const browser = bff.client();
    await browser.login();
    assert.ok(await problem(await browser.fetch('/nothing-here'), 404));
  });
});

describe('sessions in time', () => {
  it('end after the inactivity limit', async () => {
    let now = Date.now();
    const bff = await startBff();
    bff.store.now = () => now;
    const browser = bff.client();
    await browser.login();
    now += 31 * 60_000;
    assert.equal((await browser.fetch('/bff/user')).status, 401);
    await bff.close();
  });
});

describe('behind a TLS proxy', () => {
  it('marks the cookies Secure and builds the callback on the forwarded address, only when trusted', async () => {
    const trusted = await startBff({ env: { BFF_TRUST_PROXY: 'true' } });
    const headers = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'app.example' };
    const r = await trusted.client().fetch('/bff/login', { headers });
    assert.equal(new URL(String(r.headers.get('location'))).searchParams.get('redirect_uri'), 'https://app.example/login/oauth2/code/keycloak');
    assert.ok(r.headers.getSetCookie().every((c) => /;\s*Secure/.test(c)));
    await trusted.close();

    const direct = await startBff();
    const d = await direct.client().fetch('/bff/login', { headers });
    assert.match(String(new URL(String(d.headers.get('location'))).searchParams.get('redirect_uri')), /^http:\/\/127\.0\.0\.1:/);
    await direct.close();
  });
});

describe('provider claims', () => {
  it('a user without known roles signs in with no roles and no permissions', async () => {
    const bff = await startBff({ provider: fakeProvider({ claims: { realm_access: { roles: ['offline_access'] } } }) });
    const browser = bff.client();
    await browser.login();
    assert.deepEqual((await (await browser.fetch('/bff/user')).json()).roles, []);
    assert.deepEqual((await (await browser.fetch('/authz/capabilities?app=demo')).json()).permissions, []);
    await bff.close();
  });
});
