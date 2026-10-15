// Kit di conformità al contratto del registro (contracts/registry.yaml 0.4): verifica dall'esterno, via HTTP, che un
// registro (quello di riferimento o quello di un cliente) si comporti come descrive il contratto.
//
//   node tools/conformance-registry.mjs --registry http://localhost:8081
//        [--token <JWT> | --user <utente> --password <password>]          autore (serve a salvare)
//        [--reviewer-token <JWT> | --reviewer-user <u> --reviewer-password <p>]  revisore (per approvare)
//        [--issuer http://localhost:8180/realms/lowcode] [--protected-env produzione]
//
// Lavora in un'applicazione nuova (conformita-<data>), così non tocca i dati esistenti. Senza revisore le prove di
// approvazione si saltano. Esce con codice 1 se una prova fallisce.
import { randomUUID } from 'node:crypto';
import { call as httpCall, expect, isProblem, parseArgs, suite, tokenFromArgs } from './conformance-lib.mjs';

const args = parseArgs();
const registry = (args.registry ?? 'http://localhost:8081').replace(/\/+$/, '');
const protectedEnv = args['protected-env'] ?? 'produzione';
const app = `conformita-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6)}`;
const author = await tokenFromArgs(args);
const reviewer = await tokenFromArgs(args, 'reviewer-');
const call = (method, path, { body, token = author, headers = {} } = {}) => httpCall(registry, method, path, { body, token, headers });
const { check, report } = suite();

const doc = (title) => ({ schemaVersion: '1.0', screen: 'prova', title, components: [{ type: 'text', text: title }] });
const base = `/registry/apps/${app}/documents/screen/prova`;
let first = null;
let second = null;

await check('senza token si risponde 401 (se si prova con un token)', async () => {
  const r = await call('GET', '/registry/apps', { token: null });
  expect(r.status === 401, `atteso 401, ricevuto ${r.status}`);
}, { skip: !author });

await check('elenco delle applicazioni: un array', async () => {
  const r = await call('GET', '/registry/apps');
  expect(r.status === 200 && Array.isArray(r.json), `atteso 200 con un array, ricevuto ${r.status}`);
});

await check('salvataggio: 201 con hash, data, autore e stato bozza', async () => {
  const r = await call('POST', `${base}/versions`, { body: doc('Prima') });
  expect(r.status === 201, `atteso 201, ricevuto ${r.status}`);
  expect(typeof r.json?.hash === 'string' && typeof r.json?.createdAt === 'string' && typeof r.json?.author === 'string', 'mancano hash, createdAt o author');
  expect(r.json.state === 'bozza', `stato atteso bozza, ricevuto ${r.json.state}`);
  first = r.json.hash;
});

await check('stesso contenuto, stessa versione', async () => {
  const r = await call('POST', `${base}/versions`, { body: doc('Prima') });
  expect(r.status === 201 && r.json?.hash === first, 'un contenuto identico deve restituire la stessa versione');
});

await check('documento fuori schema: 400 in formato Problem', async () => {
  const r = await call('POST', `${base}/versions`, { body: { schemaVersion: '1.0', screen: 'prova', components: [{ type: 'sconosciuto' }] } });
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
  expect(isProblem(r), 'la risposta non è un Problem (title, status)');
});

await check('identificativo diverso dal percorso: 400', async () => {
  const r = await call('POST', `${base}/versions`, { body: { ...doc('X'), screen: 'altra' } });
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
});

await check('tipo di documento sconosciuto: errore 4xx', async () => {
  const r = await call('POST', `/registry/apps/${app}/documents/sconosciuto/prova/versions`, { body: doc('X') });
  expect(r.status >= 400 && r.status < 500, `atteso 4xx, ricevuto ${r.status}`);
});

await check('If-Match con l’ultima versione: il salvataggio riesce', async () => {
  const r = await call('POST', `${base}/versions`, { body: doc('Seconda'), headers: { 'If-Match': `"${first}"` } });
  expect(r.status === 201, `atteso 201, ricevuto ${r.status}`);
  second = r.json?.hash;
});

await check('If-Match con una versione superata: 412 con latest', async () => {
  const r = await call('POST', `${base}/versions`, { body: doc('Terza'), headers: { 'If-Match': `"${first}"` } });
  expect(r.status === 412, `atteso 412, ricevuto ${r.status}`);
  expect(r.json?.latest === second, 'il Problem deve indicare latest');
});

await check('storico: dalla più recente', async () => {
  const r = await call('GET', `${base}/versions`);
  expect(r.status === 200 && Array.isArray(r.json), `atteso 200 con un array, ricevuto ${r.status}`);
  expect(r.json[0]?.hash === second && r.json.some((v) => v.hash === first), 'ordine o contenuto dello storico non corretti');
});

await check('contenuto di una versione: uguale a quello salvato', async () => {
  const r = await call('GET', `${base}/versions/${first}`);
  expect(r.status === 200 && JSON.stringify(r.json) === JSON.stringify(doc('Prima')), 'contenuto diverso da quello salvato');
});

await check('pubblicazione in sviluppo e lettura con ETag; If-None-Match → 304', async () => {
  const p = await call('PUT', `${base}/published?env=sviluppo`, { body: { hash: second } });
  expect(p.status === 204, `pubblicazione: atteso 204, ricevuto ${p.status}`);
  const r = await call('GET', `${base}/published?env=sviluppo`);
  const etag = r.headers.get('etag');
  expect(r.status === 200 && r.json?.title === 'Seconda' && etag, 'versione pubblicata o ETag mancanti');
  const again = await call('GET', `${base}/published?env=sviluppo`, { headers: { 'If-None-Match': etag } });
  expect(again.status === 304, `atteso 304, ricevuto ${again.status}`);
});

await check('pubblicare una versione inesistente: 400', async () => {
  const r = await call('PUT', `${base}/published?env=sviluppo`, { body: { hash: 'inesistente' } });
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
});

await check(`ambiente protetto (${protectedEnv}): una bozza non si pubblica (409)`, async () => {
  const r = await call('PUT', `${base}/published?env=${protectedEnv}`, { body: { hash: second } });
  expect(r.status === 409, `atteso 409, ricevuto ${r.status}`);
});

await check('revisione: richiedi → in-revisione; approvare una bozza non si può', async () => {
  const r = await call('POST', `${base}/versions/${second}/review`, { body: { action: 'richiedi' } });
  expect(r.status === 200 && r.json?.state === 'in-revisione', `atteso 200 in-revisione, ricevuto ${r.status} ${r.json?.state}`);
  const bozza = await call('POST', `${base}/versions/${first}/review`, { body: { action: 'approva' } , token: reviewer ?? author });
  expect([403, 409].includes(bozza.status), `approvare una bozza: atteso 409 (o 403), ricevuto ${bozza.status}`);
});

await check('l’autore non approva la propria versione (403)', async () => {
  const r = await call('POST', `${base}/versions/${second}/review`, { body: { action: 'approva' } });
  expect(r.status === 403, `atteso 403, ricevuto ${r.status}`);
}, { skip: !author });

await check('il revisore approva; poi la versione si pubblica nell’ambiente protetto', async () => {
  const r = await call('POST', `${base}/versions/${second}/review`, { body: { action: 'approva', note: 'ok' }, token: reviewer });
  expect(r.status === 200 && r.json?.state === 'approvata' && typeof r.json?.reviewedBy === 'string', `atteso 200 approvata, ricevuto ${r.status}`);
  const p = await call('PUT', `${base}/published?env=${protectedEnv}`, { body: { hash: second } });
  expect(p.status === 204, `atteso 204, ricevuto ${p.status}`);
}, { skip: !reviewer });

const menu = {
  schemaVersion: '1.0',
  navigation: 'menu',
  useCases: [{ id: 'prove', label: 'Prove', items: [{ id: 'prova', label: 'Prova', screen: 'prova' }, { id: 'assente', label: 'Assente', screen: 'assente' }] }],
};
const nav = `/registry/apps/${app}/documents/navigation/menu`;
let menuHash = null;

await check('riferimenti: la navigazione cita le schermate; manca quella non pubblicata nell’ambiente', async () => {
  const s = await call('POST', `${nav}/versions`, { body: menu });
  expect(s.status === 201, `salvataggio: atteso 201, ricevuto ${s.status}`);
  menuHash = s.json?.hash;
  const r = await call('GET', `${nav}/versions/${menuHash}/references?env=sviluppo`);
  expect(r.status === 200 && Array.isArray(r.json?.references) && Array.isArray(r.json?.missing), `atteso 200 con references e missing, ricevuto ${r.status}`);
  expect(r.json.references.length === 2, `attesi 2 riferimenti, ricevuti ${r.json.references.length}`);
  const missing = r.json.missing.map((m) => `${m.screen} ${m.path}`);
  expect(missing.length === 1 && missing[0] === 'assente /useCases/0/items/1/screen', `mancante atteso «assente», ricevuto ${JSON.stringify(missing)}`);
});

await check('navigazione con schermate mancanti: in sviluppo si pubblica comunque', async () => {
  const r = await call('PUT', `${nav}/published?env=sviluppo`, { body: { hash: menuHash } });
  expect(r.status === 204, `atteso 204, ricevuto ${r.status}`);
});

await check(`navigazione approvata con schermate mancanti: in ${protectedEnv} 409 con missingReferences`, async () => {
  await call('POST', `${nav}/versions/${menuHash}/review`, { body: { action: 'richiedi' } });
  const a = await call('POST', `${nav}/versions/${menuHash}/review`, { body: { action: 'approva' }, token: reviewer });
  expect(a.status === 200, `approvazione: atteso 200, ricevuto ${a.status}`);
  const r = await call('PUT', `${nav}/published?env=${protectedEnv}`, { body: { hash: menuHash } });
  expect(r.status === 409 && isProblem(r), `atteso 409 in formato Problem, ricevuto ${r.status}`);
  expect(Array.isArray(r.json?.missingReferences) && r.json.missingReferences.some((m) => m.screen === 'assente'), 'il Problem deve elencare missingReferences');
}, { skip: !reviewer });

report(`Conformità al contratto del registro (${registry}, applicazione ${app})`);
