// Conformance kit for the authorization contract (contracts/authz.yaml): checks over HTTP that an authorization service
// (the reference one or a customer's) behaves as the contract describes.
//
//   node tools/conformance-authz.mjs --authz http://localhost:8082 --app demo
//        [--token <JWT> | --user <user> --password <password> | --cookie "<session cookies>"]   main user (required)
//        [--other-token <JWT> | --other-user <u> --other-password <p> | --other-cookie "…"]    other user (optional)
//        [--issuer http://localhost:8180/realms/quadrava]
//
// The contract accepts a Bearer token (a service behind the BFF) or the session cookie (a BFF that answers /authz
// itself): with --cookie (copied from a signed-in browser) the calls carry the cookies, and the writes the CSRF token
// of the XSRF-TOKEN cookie, as the runtime sends them (contracts/bff.yaml).
// The service is not modified: the checks only read and verify. Exits with code 1 if a check fails.
import { call as httpCall, expect, isProblem, parseArgs, suite, tokenFromArgs } from './conformance-lib.mjs';

const args = parseArgs();
const base = (args.authz ?? 'http://localhost:8082').replace(/\/+$/, '');
const app = args.app ?? 'demo';
const user = { token: await tokenFromArgs(args), cookie: args.cookie ?? null };
const other = { token: await tokenFromArgs(args, 'other-'), cookie: args['other-cookie'] ?? null };
if (!user.token && !user.cookie) {
  console.error('A user is needed: --token, --user and --password, or --cookie.');
  process.exit(2);
}

/** The credentials of a user on a call: the token, or the session cookies with the CSRF token on writes. */
function credentials({ token, cookie }, method) {
  if (token) return { token };
  if (!cookie) return {};
  const csrf = /(?:^|;\s*)XSRF-TOKEN=([^;]*)/.exec(cookie)?.[1];
  return { headers: { Cookie: cookie, ...(method !== 'GET' && csrf ? { 'X-XSRF-TOKEN': decodeURIComponent(csrf) } : {}) } };
}
const call = (method, path, { as = user, ...options } = {}) => httpCall(base, method, path, { ...credentials(as, method), ...options });
const PERMISSION = /^[a-z0-9]+\.[a-z0-9]+\.[a-z0-9]+$/;
const { check, report } = suite();
let capabilities = null;

await check('without a token or a session: 401', async () => {
  const r = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`, { as: {} });
  expect(r.status === 401, `expected 401, got ${r.status}`);
});

await check('capabilities: permissions in the domain.resource.action format, version, ttl', async () => {
  const r = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`);
  expect(r.status === 200, `expected 200, got ${r.status}`);
  expect(Array.isArray(r.json?.permissions), 'permissions must be a list');
  const bad = r.json.permissions.filter((p) => typeof p !== 'string' || !PERMISSION.test(p));
  expect(bad.length === 0, `invalid permissions: ${bad.slice(0, 3).join(', ')}`);
  expect(new Set(r.json.permissions).size === r.json.permissions.length, 'repeated permissions');
  expect(typeof r.json.version === 'string' && r.json.version.length > 0, 'version missing');
  expect(r.json.ttlSeconds === undefined || (Number.isInteger(r.json.ttlSeconds) && r.json.ttlSeconds >= 0), 'ttlSeconds must be an integer ≥ 0');
  capabilities = r.json;
});

await check('X-Permissions-Version equal to the version in the body', async () => {
  const r = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`);
  expect(r.headers.get('x-permissions-version') === r.json?.version, `header ${r.headers.get('x-permissions-version')} different from ${r.json?.version}`);
});

await check('same permissions, same version (repeated calls)', async () => {
  const a = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`);
  const b = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`);
  expect(a.json?.version === b.json?.version, 'the version changes while the permissions do not');
});

await check('capabilities without app: 400 in Problem format', async () => {
  const r = await call('GET', '/authz/capabilities');
  expect(r.status === 400, `expected 400, got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem (title, status)');
});

await check('batch check: one result per request, in the same order, consistent with the capabilities', async () => {
  const granted = capabilities?.permissions?.[0];
  expect(granted, 'the user has no permissions: use a user with at least one permission');
  const denied = 'conformance.missing.test';
  const checks = [{ permission: denied }, { permission: granted, resource: { type: 'order', id: '7' } }, { permission: granted }];
  const r = await call('POST', '/authz/check', { body: { checks } });
  expect(r.status === 200, `expected 200, got ${r.status}`);
  const results = r.json?.results;
  expect(Array.isArray(results) && results.length === checks.length, 'one result is needed for every check');
  results.forEach((res, i) => {
    expect(res.permission === checks[i].permission, `result ${i}: different permission or out of order`);
    expect(typeof res.allowed === 'boolean', `result ${i}: allowed must be true or false`);
  });
  expect(results[0].allowed === false, 'a permission the user does not have must be denied');
  expect(results[2].allowed === true, 'a permission of the capabilities must be granted');
  expect(results[1].resource?.type === 'order' && results[1].resource?.id === '7', 'the resource must be echoed in the result');
  expect(r.headers.get('x-permissions-version') === capabilities.version, 'X-Permissions-Version missing or different');
});

await check('check with a permission in the wrong format: 400', async () => {
  const r = await call('POST', '/authz/check', { body: { checks: [{ permission: 'Orders.Approve' }] } });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem');
});

await check('check without checks: 400', async () => {
  const r = await call('POST', '/authz/check', { body: {} });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem');
});

await check('more than 200 checks in a batch: 400', async () => {
  const checks = Array.from({ length: 201 }, () => ({ permission: 'conformance.test.read' }));
  const r = await call('POST', '/authz/check', { body: { checks } });
  expect(r.status === 400, `expected 400, got ${r.status}`);
});

await check('body is not JSON: 400', async () => {
  const r = await call('POST', '/authz/check', { raw: '{not json' });
  expect(r.status === 400, `expected 400, got ${r.status}`);
});

await check('users with different permissions: different versions', async () => {
  const r = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`, { as: other });
  expect(r.status === 200, `expected 200, got ${r.status}`);
  const same = JSON.stringify([...r.json.permissions].sort()) === JSON.stringify([...capabilities.permissions].sort());
  expect(same ? r.json.version === capabilities.version : r.json.version !== capabilities.version, 'the version must change when the permissions change');
}, { skip: !other.token && !other.cookie });

report(`Conformance with the authorization contract (${base}, application ${app})`);
