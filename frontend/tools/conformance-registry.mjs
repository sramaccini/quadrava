// Conformance kit for the registry contract (contracts/registry.yaml 0.6): checks from the outside, over HTTP, that a
// registry (the reference one or a customer's) behaves as the contract describes.
//
//   node tools/conformance-registry.mjs --registry http://localhost:8081
//        [--token <JWT> | --user <user> --password <password>]                  author (needed to save)
//        [--reviewer-token <JWT> | --reviewer-user <u> --reviewer-password <p>]  reviewer (to approve)
//        [--issuer http://localhost:8180/realms/lowcode] [--protected-env production]
//
// It works in a new application (conformance-<date>), so it does not touch existing data. Without a reviewer the approval
// checks are skipped. Exits with code 1 if a check fails.
import { randomUUID } from 'node:crypto';
import { call as httpCall, expect, isProblem, parseArgs, suite, tokenFromArgs } from './conformance-lib.mjs';

const args = parseArgs();
const registry = (args.registry ?? 'http://localhost:8081').replace(/\/+$/, '');
const protectedEnv = args['protected-env'] ?? 'production';
const app = `conformance-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6)}`;
const author = await tokenFromArgs(args);
const reviewer = await tokenFromArgs(args, 'reviewer-');
const call = (method, path, { body, token = author, headers = {} } = {}) => httpCall(registry, method, path, { body, token, headers });
const { check, report } = suite();

const doc = (title) => ({ schemaVersion: '1.0', screen: 'probe', title, components: [{ type: 'text', text: title }] });
const base = `/registry/apps/${app}/documents/screen/probe`;
let first = null;
let second = null;

await check('without a token the answer is 401 (when testing with a token)', async () => {
  const r = await call('GET', '/registry/apps', { token: null });
  expect(r.status === 401, `expected 401, got ${r.status}`);
}, { skip: !author });

await check('list of applications: an array', async () => {
  const r = await call('GET', '/registry/apps');
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 with an array, got ${r.status}`);
});

await check('save: 201 with hash, date, author and state draft', async () => {
  const r = await call('POST', `${base}/versions`, { body: doc('First') });
  expect(r.status === 201, `expected 201, got ${r.status}`);
  expect(typeof r.json?.hash === 'string' && typeof r.json?.createdAt === 'string' && typeof r.json?.author === 'string', 'hash, createdAt or author missing');
  expect(r.json.state === 'draft', `expected state draft, got ${r.json.state}`);
  first = r.json.hash;
});

await check('same content, same version', async () => {
  const r = await call('POST', `${base}/versions`, { body: doc('First') });
  expect(r.status === 201 && r.json?.hash === first, 'identical content must return the same version');
});

await check('document not matching the schema: 400 in Problem format', async () => {
  const r = await call('POST', `${base}/versions`, { body: { schemaVersion: '1.0', screen: 'probe', components: [{ type: 'unknown' }] } });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  expect(isProblem(r), 'the response is not a Problem (title, status)');
});

await check('identifier different from the path: 400', async () => {
  const r = await call('POST', `${base}/versions`, { body: { ...doc('X'), screen: 'other' } });
  expect(r.status === 400, `expected 400, got ${r.status}`);
});

await check('unknown document kind: 4xx error', async () => {
  const r = await call('POST', `/registry/apps/${app}/documents/unknown/probe/versions`, { body: doc('X') });
  expect(r.status >= 400 && r.status < 500, `expected 4xx, got ${r.status}`);
});

await check('If-Match with the latest version: the save succeeds', async () => {
  const r = await call('POST', `${base}/versions`, { body: doc('Second'), headers: { 'If-Match': `"${first}"` } });
  expect(r.status === 201, `expected 201, got ${r.status}`);
  second = r.json?.hash;
});

await check('If-Match with an outdated version: 412 with latest', async () => {
  const r = await call('POST', `${base}/versions`, { body: doc('Third'), headers: { 'If-Match': `"${first}"` } });
  expect(r.status === 412, `expected 412, got ${r.status}`);
  expect(r.json?.latest === second, 'the Problem must state latest');
});

await check('history: newest first', async () => {
  const r = await call('GET', `${base}/versions`);
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 with an array, got ${r.status}`);
  expect(r.json[0]?.hash === second && r.json.some((v) => v.hash === first), 'wrong order or content of the history');
});

await check('content of a version: equal to the one saved', async () => {
  const r = await call('GET', `${base}/versions/${first}`);
  expect(r.status === 200 && JSON.stringify(r.json) === JSON.stringify(doc('First')), 'content different from the one saved');
});

await check('publish in development and read with ETag; If-None-Match → 304', async () => {
  const p = await call('PUT', `${base}/published?env=development`, { body: { hash: second } });
  expect(p.status === 204, `publish: expected 204, got ${p.status}`);
  const r = await call('GET', `${base}/published?env=development`);
  const etag = r.headers.get('etag');
  expect(r.status === 200 && r.json?.title === 'Second' && etag, 'published version or ETag missing');
  const again = await call('GET', `${base}/published?env=development`, { headers: { 'If-None-Match': etag } });
  expect(again.status === 304, `expected 304, got ${again.status}`);
});

await check('publishing a version that does not exist: 400', async () => {
  const r = await call('PUT', `${base}/published?env=development`, { body: { hash: 'missing' } });
  expect(r.status === 400, `expected 400, got ${r.status}`);
});

await check(`protected environment (${protectedEnv}): a draft is not published (409)`, async () => {
  const r = await call('PUT', `${base}/published?env=${protectedEnv}`, { body: { hash: second } });
  expect(r.status === 409, `expected 409, got ${r.status}`);
});

await check('review: request → in-review; a draft cannot be approved', async () => {
  const r = await call('POST', `${base}/versions/${second}/review`, { body: { action: 'request' } });
  expect(r.status === 200 && r.json?.state === 'in-review', `expected 200 in-review, got ${r.status} ${r.json?.state}`);
  const draft = await call('POST', `${base}/versions/${first}/review`, { body: { action: 'approve' } , token: reviewer ?? author });
  expect([403, 409].includes(draft.status), `approving a draft: expected 409 (or 403), got ${draft.status}`);
});

await check('the author does not approve their own version (403)', async () => {
  const r = await call('POST', `${base}/versions/${second}/review`, { body: { action: 'approve' } });
  expect(r.status === 403, `expected 403, got ${r.status}`);
}, { skip: !author });

await check('the reviewer approves; then the version is published in the protected environment', async () => {
  const r = await call('POST', `${base}/versions/${second}/review`, { body: { action: 'approve', note: 'ok' }, token: reviewer });
  expect(r.status === 200 && r.json?.state === 'approved' && typeof r.json?.reviewedBy === 'string', `expected 200 approved, got ${r.status}`);
  const p = await call('PUT', `${base}/published?env=${protectedEnv}`, { body: { hash: second } });
  expect(p.status === 204, `expected 204, got ${p.status}`);
}, { skip: !reviewer });

const menu = {
  schemaVersion: '1.0',
  navigation: 'menu',
  areas: [{ id: 'probes', label: 'Probes', items: [{ id: 'probe', label: 'Probe', screen: 'probe' }, { id: 'absent', label: 'Absent', screen: 'absent' }] }],
};
const nav = `/registry/apps/${app}/documents/navigation/menu`;
let menuHash = null;

await check('references: the navigation cites the screens; the one not published in the environment is missing', async () => {
  const s = await call('POST', `${nav}/versions`, { body: menu });
  expect(s.status === 201, `save: expected 201, got ${s.status}`);
  menuHash = s.json?.hash;
  const r = await call('GET', `${nav}/versions/${menuHash}/references?env=development`);
  expect(r.status === 200 && Array.isArray(r.json?.references) && Array.isArray(r.json?.missing), `expected 200 with references and missing, got ${r.status}`);
  expect(r.json.references.length === 2, `expected 2 references, got ${r.json.references.length}`);
  const missing = r.json.missing.map((m) => `${m.screen} ${m.path}`);
  expect(missing.length === 1 && missing[0] === 'absent /areas/0/items/1/screen', `expected «absent» to be missing, got ${JSON.stringify(missing)}`);
});

await check('navigation with missing screens: in development it is published anyway', async () => {
  const r = await call('PUT', `${nav}/published?env=development`, { body: { hash: menuHash } });
  expect(r.status === 204, `expected 204, got ${r.status}`);
});

await check(`approved navigation with missing screens: in ${protectedEnv} 409 with missingReferences`, async () => {
  await call('POST', `${nav}/versions/${menuHash}/review`, { body: { action: 'request' } });
  const a = await call('POST', `${nav}/versions/${menuHash}/review`, { body: { action: 'approve' }, token: reviewer });
  expect(a.status === 200, `approval: expected 200, got ${a.status}`);
  const r = await call('PUT', `${nav}/published?env=${protectedEnv}`, { body: { hash: menuHash } });
  expect(r.status === 409 && isProblem(r), `expected 409 in Problem format, got ${r.status}`);
  expect(Array.isArray(r.json?.missingReferences) && r.json.missingReferences.some((m) => m.screen === 'absent'), 'the Problem must list missingReferences');
}, { skip: !reviewer });

// 0.6: data sources documents and the references of the screens to them.
const sourcesDoc = { schemaVersion: '1.0', datasources: 'probes', sources: { list: { type: 'rest', method: 'GET', url: '/api/probes' } } };
const user = { schemaVersion: '1.0', screen: 'probe-user', dataSources: { probes: { ref: 'probes/list' } }, components: [{ type: 'text', text: 'Probe' }] };
let userHash = null;

await check('data sources: a valid document is saved, an incomplete data source is rejected with 400', async () => {
  const bad = await call('POST', `/registry/apps/${app}/documents/datasources/probes/versions`, { body: { ...sourcesDoc, sources: { list: { url: '/api' } } } });
  expect(bad.status === 400 && isProblem(bad), `expected 400 in Problem format, got ${bad.status}`);
  const s = await call('POST', `/registry/apps/${app}/documents/screen/probe-user/versions`, { body: user });
  expect(s.status === 201, `save of the screen: expected 201, got ${s.status}`);
  userHash = s.json?.hash;
});

await check('references: a screen lists the data sources documents it uses and those missing', async () => {
  const r = await call('GET', `/registry/apps/${app}/documents/screen/probe-user/versions/${userHash}/references`);
  expect(r.status === 200 && Array.isArray(r.json?.dataSources) && Array.isArray(r.json?.missingDataSources), `expected 200 with dataSources and missingDataSources, got ${r.status}`);
  expect(r.json.dataSources[0]?.datasources === 'probes' && r.json.dataSources[0]?.path === '/dataSources/probes/ref', `unexpected dataSources ${JSON.stringify(r.json.dataSources)}`);
  expect(r.json.missingDataSources.length === 1, 'the document not saved yet must be missing');
  const saved = await call('POST', `/registry/apps/${app}/documents/datasources/probes/versions`, { body: sourcesDoc });
  expect(saved.status === 201, `save of the data sources: expected 201, got ${saved.status}`);
  const again = await call('GET', `/registry/apps/${app}/documents/screen/probe-user/versions/${userHash}/references`);
  expect(again.json?.missingDataSources?.length === 0, 'once saved, the document is no longer missing');
});

await check(`approved screen with unpublished data sources: in ${protectedEnv} 409 with missingDataSources`, async () => {
  await call('POST', `/registry/apps/${app}/documents/screen/probe-user/versions/${userHash}/review`, { body: { action: 'request' } });
  const a = await call('POST', `/registry/apps/${app}/documents/screen/probe-user/versions/${userHash}/review`, { body: { action: 'approve' }, token: reviewer });
  expect(a.status === 200, `approval: expected 200, got ${a.status}`);
  const r = await call('PUT', `/registry/apps/${app}/documents/screen/probe-user/published?env=${protectedEnv}`, { body: { hash: userHash } });
  expect(r.status === 409 && isProblem(r), `expected 409 in Problem format, got ${r.status}`);
  expect(Array.isArray(r.json?.missingDataSources) && r.json.missingDataSources.some((m) => m.datasources === 'probes'), 'the Problem must list missingDataSources');
}, { skip: !reviewer });

report(`Conformance with the registry contract (${registry}, application ${app})`);
