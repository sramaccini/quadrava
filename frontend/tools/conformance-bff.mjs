// Conformance kit for the BFF contract (contracts/bff.yaml): checks over HTTP that a BFF (the reference one or another)
// behaves as the runtime expects.
//
//   node tools/conformance-bff.mjs --bff http://localhost:8080 --return http://localhost:4200/
//        [--cookie "<session cookies of a signed-in browser>" | --user <user> --password <password>]
//        [--session-url /bff/user] [--login-url /bff/login] [--logout-url /logout] [--tenant-url /bff/tenant]
//        [--role-url /bff/role] [--app demo]
//
// Without --cookie only the checks that need no session run. With it (copied from a signed-in browser, for example
// "JSESSIONID=…"), or with --user and --password (the kit signs in through the Keycloak login page, local realm only),
// the checks of the user and, last, of the logout run too: that session ends. The checks of the
// tenants and of the operational roles (optional parts of the contract) run only if the user of the session lists
// them; those of the roles read the permissions of the application --app through the BFF (/authz/capabilities) and,
// with two roles or more, switch to another one and back.
// Exits with code 1 if a check fails.
import { bffLogin, expect, isProblem, parseArgs, suite } from './conformance-lib.mjs';

const args = parseArgs();
const base = (args.bff ?? 'http://localhost:8080').replace(/\/+$/, '');
const returnTo = args.return ?? 'http://localhost:4200/';
const sessionUrl = args['session-url'] ?? '/bff/user';
const loginUrl = args['login-url'] ?? '/bff/login';
const logoutUrl = args['logout-url'] ?? '/logout';
const tenantUrl = args['tenant-url'] ?? '/bff/tenant';
const roleUrl = args['role-url'] ?? '/bff/role';
const app = args.app ?? 'demo';
const session = args.cookie ?? (args.user ? await bffLogin(base, args.user, args.password, returnTo) : null);
const { check, report } = suite();

/** A call as the browser makes it: cookies by hand, redirects not followed. */
async function call(method, path, { cookie, headers = {}, accept = 'application/json', body } = {}) {
  const json = body === undefined ? {} : { 'Content-Type': 'application/json' };
  const response = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { Accept: accept, ...json, ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // body is not JSON
  }
  return { status: response.status, headers: response.headers, json: parsed, text, cookies: response.headers.getSetCookie() };
}

/** The `XSRF-TOKEN` cookie set by a response: its value and whether the page can read it. */
function csrfCookie(r) {
  const line = r.cookies.find((c) => c.startsWith('XSRF-TOKEN='));
  if (!line) return null;
  return { value: decodeURIComponent(line.split(';')[0].slice('XSRF-TOKEN='.length)), httpOnly: /;\s*httponly/i.test(line) };
}

await check('current user without a session: 401', async () => {
  const r = await call('GET', sessionUrl);
  expect(r.status === 401, `expected 401, got ${r.status}`);
});

// As a new visitor: the cookies of a session already hold the token, so the BFF rightly does not send it again.
await check('the CSRF token arrives in a cookie the page can read', async () => {
  const r = await call('GET', sessionUrl);
  const token = csrfCookie(r);
  expect(token, 'no XSRF-TOKEN cookie in the response');
  expect(!token.httpOnly, 'the XSRF-TOKEN cookie is HttpOnly: the page cannot read it');
});

await check('login with a return page of the applications: redirect', async () => {
  const r = await call('GET', `${loginUrl}?return=${encodeURIComponent(returnTo)}`, { accept: 'text/html' });
  expect(r.status >= 300 && r.status < 400, `expected a redirect, got ${r.status}`);
  expect(r.headers.get('location'), 'redirect without Location');
});

await check('login with a return page outside the applications: 400 in Problem format', async () => {
  const r = await call('GET', `${loginUrl}?return=${encodeURIComponent('https://not-an-application.invalid/')}`);
  expect(r.status === 400, `expected 400 (no open redirect), got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem (title, status)');
});

/** A refused write: 403 with a session; without one, 401 is a refusal too. */
const refused = (status) => (session ? status === 403 : status === 403 || status === 401);
const refusal = session ? '403' : '401 or 403';

await check(`logout without the CSRF token: ${refusal}`, async () => {
  const r = await call('POST', logoutUrl, { cookie: session ?? undefined });
  expect(refused(r.status), `expected ${refusal}, got ${r.status}`);
});

await check(`logout with a wrong CSRF token: ${refusal}`, async () => {
  const first = await call('GET', sessionUrl, { cookie: session ?? undefined });
  const token = csrfCookie(first);
  const cookie = [session, token ? `XSRF-TOKEN=${encodeURIComponent(token.value)}` : null].filter(Boolean).join('; ');
  const r = await call('POST', logoutUrl, { cookie, headers: { 'X-XSRF-TOKEN': 'not-the-token' } });
  expect(refused(r.status), `expected ${refusal}, got ${r.status}`);
});

await check('current user with the session: 200, only the fields of the contract with their types', async () => {
  const r = await call('GET', sessionUrl, { cookie: session });
  expect(r.status === 200, `expected 200, got ${r.status}`);
  const user = r.json;
  expect(user && typeof user === 'object' && !Array.isArray(user), 'the body is not a JSON object');
  for (const field of ['name', 'username', 'email', 'currentTenant', 'currentRole']) {
    expect(user[field] === undefined || typeof user[field] === 'string', `${field} is not a text`);
  }
  expect(user.roles === undefined || (Array.isArray(user.roles) && user.roles.every((x) => typeof x === 'string')), 'roles is not a list of texts');
  expect(!/token/i.test(Object.keys(user).join(' ')), 'the user carries a field named like a token');
}, { skip: !session });

/** Session cookies plus the CSRF cookie, and the header that carries it back: what the page sends with a write. */
async function withCsrf() {
  const first = await call('GET', sessionUrl, { cookie: session });
  const token = csrfCookie(first) ?? { value: /XSRF-TOKEN=([^;]+)/.exec(session ?? '')?.[1] ?? '' };
  return { cookie: `${session}; XSRF-TOKEN=${encodeURIComponent(token.value)}`, headers: { 'X-XSRF-TOKEN': token.value }, user: first.json };
}

const tenantsOf = (user) => (Array.isArray(user?.tenants) ? user.tenants : []);
const signedIn = session ? await call('GET', sessionUrl, { cookie: session }) : null;
const tenants = tenantsOf(signedIn?.json);
const noTenants = !session || tenants.length === 0;

await check('tenants of the user: id and label as text, the current one among them', async () => {
  expect(tenants.every((t) => typeof t?.id === 'string' && typeof t?.label === 'string'), 'a tenant without id or label as text');
  const current = signedIn.json.currentTenant;
  expect(current === undefined || tenants.some((t) => t.id === current), `currentTenant "${current}" is not one of the tenants`);
}, { skip: noTenants });

await check('tenant switch with a GET: refused', async () => {
  const r = await call('GET', tenantUrl, { cookie: session });
  expect(r.status >= 400, `expected a refusal (4xx), got ${r.status}: a link from another site could switch the tenant`);
}, { skip: noTenants });

await check(`tenant switch without the CSRF token: 403`, async () => {
  const r = await call('POST', tenantUrl, { cookie: session, body: { tenant: tenants[0]?.id } });
  expect(r.status === 403, `expected 403, got ${r.status}`);
}, { skip: noTenants });

await check('tenant switch to a tenant not offered: 404 in Problem format', async () => {
  const csrf = await withCsrf();
  const r = await call('POST', tenantUrl, { ...csrf, body: { tenant: 'not-a-tenant-of-this-user' } });
  expect(r.status === 404, `expected 404, got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem (title, status)');
}, { skip: noTenants });

await check('tenant switch to the current tenant: 204', async () => {
  const csrf = await withCsrf();
  const current = csrf.user?.currentTenant ?? tenants[0].id;
  const r = await call('POST', tenantUrl, { ...csrf, body: { tenant: current } });
  expect(r.status === 204, `expected 204, got ${r.status}`);
  const after = await call('GET', sessionUrl, { cookie: session });
  expect(after.json?.currentTenant === current, 'the session is no longer on the same tenant');
}, { skip: noTenants });

const rolesOf = (user) => (Array.isArray(user?.operationalRoles) ? user.operationalRoles : []);
const roles = rolesOf(signedIn?.json);
const noRoles = !session || roles.length === 0;
const capabilitiesPath = (query = '') => `/authz/capabilities?app=${encodeURIComponent(app)}${query}`;
/** The permissions of the session, sorted, and their version. */
async function permissions(query = '', headers = {}) {
  const r = await call('GET', capabilitiesPath(query), { cookie: session, headers });
  expect(r.status === 200, `/authz/capabilities: expected 200, got ${r.status}`);
  return { list: [...(r.json?.permissions ?? [])].sort(), version: r.json?.version };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Switches the role of the session; the status of the answer. */
async function switchRole(role) {
  const r = await call('POST', roleUrl, { ...(await withCsrf()), body: { role } });
  return r.status;
}

await check('operational roles of the user: id and label as text, the current one among them', async () => {
  expect(roles.every((r) => typeof r?.id === 'string' && typeof r?.label === 'string'), 'a role without id or label as text');
  const current = signedIn.json.currentRole;
  expect(typeof current === 'string' && roles.some((r) => r.id === current), `currentRole "${current}" is not one of the operational roles`);
}, { skip: noRoles });

await check('role switch with a GET: refused', async () => {
  const r = await call('GET', roleUrl, { cookie: session });
  expect(r.status >= 400, `expected a refusal (4xx), got ${r.status}: a link from another site could switch the role`);
}, { skip: noRoles });

await check('role switch without the CSRF token: 403', async () => {
  const r = await call('POST', roleUrl, { cookie: session, body: { role: roles[0]?.id } });
  expect(r.status === 403, `expected 403, got ${r.status}`);
}, { skip: noRoles });

await check('role switch to a role not offered: 404 in Problem format', async () => {
  const r = await call('POST', roleUrl, { ...(await withCsrf()), body: { role: 'not-a-role-of-this-user' } });
  expect(r.status === 404, `expected 404, got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem (title, status)');
}, { skip: noRoles });

await check('role switch with a malformed body: 400', async () => {
  const r = await call('POST', roleUrl, { ...(await withCsrf()), body: { role: 7 } });
  expect(r.status === 400, `expected 400, got ${r.status}`);
}, { skip: noRoles });

const current = signedIn?.json?.currentRole;
const other = roles.find((r) => r.id !== current)?.id;
/** The permissions of each role, read by switching to it: filled by the switch check. */
const byRole = new Map();

await check('role switch to another role: 204, currentRole and the permissions version change', async () => {
  const before = await permissions();
  expect((await switchRole(other)) === 204, 'expected 204 for an operational role of the user');
  const user = await call('GET', sessionUrl, { cookie: session });
  expect(user.json?.currentRole === other, `currentRole is "${user.json?.currentRole}", not the chosen "${other}"`);
  const after = await permissions();
  expect(after.version !== before.version, 'the permissions version did not change after the switch');
  byRole.set(current, before.list).set(other, after.list);
  expect((await switchRole(current)) === 204, 'switching back to the first role failed');
  expect(same((await permissions()).list, before.list), 'back on the first role, the permissions are not those it had');
}, { skip: noRoles || !other });

await check('a role sent by the page does not change the permissions (query, body, X-Active-Role)', async () => {
  const own = await permissions();
  for (const role of [other, 'not-a-role-of-this-user'].filter(Boolean)) {
    expect(same((await permissions(`&role=${encodeURIComponent(role)}`)).list, own.list), `?role=${role} changed the permissions of the session`);
    expect(same((await permissions('', { 'X-Active-Role': role })).list, own.list), `X-Active-Role: ${role} changed the permissions of the session`);
  }
  // A permission of the other role that the active one does not have stays denied, whatever role the body names.
  const extra = (byRole.get(other) ?? []).find((p) => !own.list.includes(p)) ?? 'conformance.missing.test';
  const csrf = await withCsrf();
  const role = other ?? 'not-a-role-of-this-user';
  const r = await call('POST', '/authz/check', { ...csrf, headers: { ...csrf.headers, 'X-Active-Role': role }, body: { role, checks: [{ permission: extra }] } });
  expect(r.status === 200, `/authz/check: expected 200, got ${r.status}`);
  expect(r.json?.results?.[0]?.allowed === false, `${extra} is granted by a role sent by the page`);
}, { skip: noRoles });

await check('logout with the session and the CSRF token: 200 with the address to go to', async () => {
  const r = await call('POST', logoutUrl, await withCsrf());
  expect(r.status === 200, `expected 200, got ${r.status}`);
  expect(typeof r.json?.redirect === 'string' && r.json.redirect.length > 0, 'the body has no "redirect" address');
}, { skip: !session });

report(`Conformance with the BFF contract (${base})`);
