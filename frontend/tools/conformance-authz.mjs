// Kit di conformità al contratto di autorizzazione (contracts/authz.yaml): verifica via HTTP che un servizio di
// autorizzazione (quello di riferimento o quello di un cliente) si comporti come descrive il contratto.
//
//   node tools/conformance-authz.mjs --authz http://localhost:8082 --app demo
//        [--token <JWT> | --user <utente> --password <password>]          utente principale (obbligatorio)
//        [--other-token <JWT> | --other-user <u> --other-password <p>]    utente con permessi diversi (facoltativo)
//        [--issuer http://localhost:8180/realms/lowcode]
//
// Il servizio non viene modificato: le prove sono solo letture e verifiche. Esce con codice 1 se una prova fallisce.
import { call as httpCall, expect, isProblem, parseArgs, suite, tokenFromArgs } from './conformance-lib.mjs';

const args = parseArgs();
const base = (args.authz ?? 'http://localhost:8082').replace(/\/+$/, '');
const app = args.app ?? 'demo';
const token = await tokenFromArgs(args);
const other = await tokenFromArgs(args, 'other-');
if (!token) {
  console.error('Serve un utente: --token oppure --user e --password.');
  process.exit(2);
}
const call = (method, path, options = {}) => httpCall(base, method, path, { token, ...options });
const PERMISSION = /^[a-z0-9]+\.[a-z0-9]+\.[a-z0-9]+$/;
const { check, report } = suite();
let capabilities = null;

await check('senza token: 401', async () => {
  const r = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`, { token: null });
  expect(r.status === 401, `atteso 401, ricevuto ${r.status}`);
});

await check('capacità: permessi nel formato dominio.risorsa.azione, versione, ttl', async () => {
  const r = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`);
  expect(r.status === 200, `atteso 200, ricevuto ${r.status}`);
  expect(Array.isArray(r.json?.permissions), 'permissions deve essere un elenco');
  const bad = r.json.permissions.filter((p) => typeof p !== 'string' || !PERMISSION.test(p));
  expect(bad.length === 0, `permessi non validi: ${bad.slice(0, 3).join(', ')}`);
  expect(new Set(r.json.permissions).size === r.json.permissions.length, 'permessi ripetuti');
  expect(typeof r.json.version === 'string' && r.json.version.length > 0, 'version mancante');
  expect(r.json.ttlSeconds === undefined || (Number.isInteger(r.json.ttlSeconds) && r.json.ttlSeconds >= 0), 'ttlSeconds deve essere un intero ≥ 0');
  capabilities = r.json;
});

await check('X-Permissions-Version uguale alla versione nel corpo', async () => {
  const r = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`);
  expect(r.headers.get('x-permissions-version') === r.json?.version, `intestazione ${r.headers.get('x-permissions-version')} diversa da ${r.json?.version}`);
});

await check('stessi permessi, stessa versione (chiamate ripetute)', async () => {
  const a = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`);
  const b = await call('GET', `/authz/capabilities?app=${encodeURIComponent(app)}`);
  expect(a.json?.version === b.json?.version, 'la versione cambia senza che cambino i permessi');
});

await check('capacità senza app: 400 in formato Problem', async () => {
  const r = await call('GET', '/authz/capabilities');
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
  expect(isProblem(r), 'la risposta non è un Problem (title, status)');
});

await check('verifica a lotti: un esito per richiesta, nello stesso ordine, coerente con le capacità', async () => {
  const granted = capabilities?.permissions?.[0];
  expect(granted, 'l’utente non ha permessi: usare un utente con almeno un permesso');
  const denied = 'conformance.missing.test';
  const checks = [{ permission: denied }, { permission: granted, resource: { type: 'ordine', id: '7' } }, { permission: granted }];
  const r = await call('POST', '/authz/check', { body: { checks } });
  expect(r.status === 200, `atteso 200, ricevuto ${r.status}`);
  const results = r.json?.results;
  expect(Array.isArray(results) && results.length === checks.length, 'serve un esito per ogni verifica');
  results.forEach((res, i) => {
    expect(res.permission === checks[i].permission, `esito ${i}: permesso diverso o fuori ordine`);
    expect(typeof res.allowed === 'boolean', `esito ${i}: allowed deve essere vero o falso`);
  });
  expect(results[0].allowed === false, 'un permesso che l’utente non ha deve risultare negato');
  expect(results[2].allowed === true, 'un permesso delle capacità deve risultare concesso');
  expect(results[1].resource?.type === 'ordine' && results[1].resource?.id === '7', 'la risorsa va riportata nell’esito');
  expect(r.headers.get('x-permissions-version') === capabilities.version, 'X-Permissions-Version mancante o diversa');
});

await check('verifica con un permesso nel formato sbagliato: 400', async () => {
  const r = await call('POST', '/authz/check', { body: { checks: [{ permission: 'Ordini.Approva' }] } });
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
  expect(isProblem(r), 'la risposta non è un Problem');
});

await check('verifica senza checks: 400', async () => {
  const r = await call('POST', '/authz/check', { body: {} });
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
  expect(isProblem(r), 'la risposta non è un Problem');
});

await check('più di 200 verifiche in un lotto: 400', async () => {
  const checks = Array.from({ length: 201 }, () => ({ permission: 'conformance.test.read' }));
  const r = await call('POST', '/authz/check', { body: { checks } });
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
});

await check('corpo non JSON: 400', async () => {
  const r = await call('POST', '/authz/check', { raw: '{non json' });
  expect(r.status === 400, `atteso 400, ricevuto ${r.status}`);
});

await check('utenti con permessi diversi: versioni diverse', async () => {
  const r = await httpCall(base, 'GET', `/authz/capabilities?app=${encodeURIComponent(app)}`, { token: other });
  expect(r.status === 200, `atteso 200, ricevuto ${r.status}`);
  const same = JSON.stringify([...r.json.permissions].sort()) === JSON.stringify([...capabilities.permissions].sort());
  expect(same ? r.json.version === capabilities.version : r.json.version !== capabilities.version, 'la versione deve cambiare quando cambiano i permessi');
}, { skip: !other });

report(`Conformità al contratto di autorizzazione (${base}, applicazione ${app})`);
