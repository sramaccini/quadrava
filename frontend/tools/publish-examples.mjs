// Publishes the example project (../examples) into a registry: every screen, every data sources document, the navigation,
// every theme and every translation catalogue as separate documents (contracts/registry.yaml 0.6). Used to try the runtime that loads from the registry.
//
//   node tools/publish-examples.mjs [--registry http://localhost:8081] [--app demo] [--env development]
//                                   [--token <JWT> | --user <user> --password <password> [--issuer <realm>]]
//
// With the reference registry started with the no-auth profile no token is needed. With --user and --password the script
// asks Keycloak for the token with the development client lowcode-tools (local realm only).
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((pairs, value, i, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []),
);
const registry = (args.registry ?? 'http://localhost:8081').replace(/\/+$/, '');
const app = args.app ?? 'demo';
const env = args.env ?? 'development';
let token = args.token;
if (!token && args.user) {
  const issuer = (args.issuer ?? 'http://localhost:8180/realms/lowcode').replace(/\/+$/, '');
  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'lowcode-tools', username: args.user, password: args.password ?? '' }),
  });
  if (!response.ok) {
    console.error(`No token from ${issuer}: HTTP ${response.status}`);
    process.exit(1);
  }
  token = (await response.json()).access_token;
}
const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '../../examples');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

const documents = [];
// The data sources first: the screens refer to them.
for (const file of readdirSync(join(examples, 'datasources')).filter((f) => f.endsWith('.json'))) {
  const doc = read(join(examples, 'datasources', file));
  documents.push({ kind: 'datasources', id: doc.datasources, doc });
}
for (const file of readdirSync(join(examples, 'screens')).filter((f) => f.endsWith('.json'))) {
  const doc = read(join(examples, 'screens', file));
  documents.push({ kind: 'screen', id: doc.screen, doc });
}
const navigation = read(join(examples, 'navigation.json'));
documents.push({ kind: 'navigation', id: navigation.navigation, doc: navigation });
for (const file of readdirSync(join(examples, 'themes')).filter((f) => f.endsWith('.json'))) {
  const doc = read(join(examples, 'themes', file));
  documents.push({ kind: 'theme', id: doc.theme, doc });
}
// Translation catalogues: one messages document per language (the example files are just key → text).
for (const file of readdirSync(join(examples, 'i18n')).filter((f) => f.endsWith('.json'))) {
  const locale = file.replace(/\.json$/, '');
  documents.push({ kind: 'messages', id: locale, doc: { schemaVersion: '1.0', messages: locale, texts: read(join(examples, 'i18n', file)) } });
}

let failed = 0;
for (const { kind, id, doc } of documents) {
  const base = `${registry}/registry/apps/${encodeURIComponent(app)}/documents/${kind}/${encodeURIComponent(id)}`;
  try {
    const saved = await fetch(`${base}/versions`, { method: 'POST', headers, body: JSON.stringify(doc) });
    if (!saved.ok) throw new Error(`save: HTTP ${saved.status}`);
    const { hash } = await saved.json();
    const published = await fetch(`${base}/published?env=${encodeURIComponent(env)}`, { method: 'PUT', headers, body: JSON.stringify({ hash }) });
    if (!published.ok) throw new Error(`publish: HTTP ${published.status}`);
    console.log(`${kind} ${id} → ${hash.slice(0, 10)} published in ${env}`);
  } catch (e) {
    failed++;
    console.error(`${kind} ${id}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`${documents.length - failed} documents published in application «${app}», environment «${env}» (${registry}).`);
process.exit(failed ? 1 : 0);
