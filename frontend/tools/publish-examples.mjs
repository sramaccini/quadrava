// Pubblica gli esempi (../examples) in un registro: ogni schermata, la navigazione e ogni tema come documenti separati
// (contracts/registry.yaml 0.2). Serve a provare il runtime che carica dal registro.
//
//   node tools/publish-examples.mjs [--registry http://localhost:8081] [--app demo] [--env sviluppo] [--token <JWT>]
//
// Con il registro di riferimento avviato con il profilo senza-auth il token non serve.
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
const env = args.env ?? 'sviluppo';
const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(args.token ? { Authorization: `Bearer ${args.token}` } : {}) };

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
