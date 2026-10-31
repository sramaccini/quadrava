// Conformance kit for the BFF contract (contracts/bff.yaml): checks over HTTP that a BFF (the reference one or another)
// behaves as the runtime expects.
//
//   node tools/conformance-bff.mjs --bff http://localhost:8080 --return http://localhost:4200/
//        [--cookie "<session cookies of a signed-in browser>"]
//        [--session-url /bff/user] [--login-url /bff/login] [--logout-url /logout] [--tenant-url /bff/tenant]
//
// Without --cookie only the checks that need no session run. With it (copied from a signed-in browser, for example
// "JSESSIONID=…"), the checks of the user and, last, of the logout run too: that session ends. The checks of the
// tenants (optional part of the contract) run only if the user of the session lists them.
// Exits with code 1 if a check fails.
import { expect, isProblem, parseArgs, suite } from './conformance-lib.mjs';

const args = parseArgs();
const base = (args.bff ?? 'http://localhost:8080').replace(/\/+$/, '');
const returnTo = args.return ?? 'http://localhost:4200/';
const sessionUrl = args['session-url'] ?? '/bff/user';
const loginUrl = args['login-url'] ?? '/bff/login';
const logoutUrl = args['logout-url'] ?? '/logout';
const tenantUrl = args['tenant-url'] ?? '/bff/tenant';
const session = args.cookie ?? null;
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

await check('the CSRF token arrives in a cookie the page can read', async () => {
  const r = await call('GET', sessionUrl, { cookie: session ?? undefined });
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
  for (const field of ['name', 'username', 'email', 'currentTenant']) {
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

await check('logout with the session and the CSRF token: 200 with the address to go to', async () => {
  const r = await call('POST', logoutUrl, await withCsrf());
  expect(r.status === 200, `expected 200, got ${r.status}`);
  expect(typeof r.json?.redirect === 'string' && r.json.redirect.length > 0, 'the body has no "redirect" address');
}, { skip: !session });

report(`Conformance with the BFF contract (${base})`);
