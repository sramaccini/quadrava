// Pubblica gli esempi (../examples) in un registro: ogni schermata, la navigazione, ogni tema e ogni catalogo delle
// traduzioni come documenti separati (contracts/registry.yaml 0.5). Serve a provare il runtime che carica dal registro.
//
//   node tools/publish-examples.mjs [--registry http://localhost:8081] [--app demo] [--env development]
//                                   [--token <JWT> | --user <utente> --password <password> [--issuer <realm>]]
//
// Con il registro di riferimento avviato con il profilo no-auth il token non serve. Con --user e --password lo
// script chiede il token a Keycloak con il client di sviluppo lowcode-tools (solo per il realm locale).
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
    console.error(`Token non ottenuto da ${issuer}: HTTP ${response.status}`);
    process.exit(1);
  }
  token = (await response.json()).access_token;
}
const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '../../examples');
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

const documents = [];
for (const file of readdirSync(examples).filter((f) => f.endsWith('.json'))) {
  const doc = read(join(examples, file));
  if (typeof doc.screen === 'string') documents.push({ kind: 'screen', id: doc.screen, doc });
  else if (typeof doc.navigation === 'string') documents.push({ kind: 'navigation', id: doc.navigation, doc });
}
for (const file of readdirSync(join(examples, 'themes')).filter((f) => f.endsWith('.json'))) {
  const doc = read(join(examples, 'themes', file));
  documents.push({ kind: 'theme', id: doc.theme, doc });
}
// Cataloghi delle traduzioni: un documento messages per lingua (i file degli esempi sono solo chiave → testo).
for (const file of readdirSync(join(examples, 'i18n')).filter((f) => f.endsWith('.json'))) {
  const locale = file.replace(/\.json$/, '');
  documents.push({ kind: 'messages', id: locale, doc: { schemaVersion: '1.0', messages: locale, texts: read(join(examples, 'i18n', file)) } });
}

let failed = 0;
for (const { kind, id, doc } of documents) {
  const base = `${registry}/registry/apps/${encodeURIComponent(app)}/documents/${kind}/${encodeURIComponent(id)}`;
  try {
    const saved = await fetch(`${base}/versions`, { method: 'POST', headers, body: JSON.stringify(doc) });
    if (!saved.ok) throw new Error(`salvataggio: HTTP ${saved.status}`);
    const { hash } = await saved.json();
    const published = await fetch(`${base}/published?env=${encodeURIComponent(env)}`, { method: 'PUT', headers, body: JSON.stringify({ hash }) });
    if (!published.ok) throw new Error(`pubblicazione: HTTP ${published.status}`);
    console.log(`${kind} ${id} → ${hash.slice(0, 10)} pubblicato in ${env}`);
  } catch (e) {
    failed++;
    console.error(`${kind} ${id}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`${documents.length - failed} documenti pubblicati nell'applicazione «${app}», ambiente «${env}» (${registry}).`);
process.exit(failed ? 1 : 0);
