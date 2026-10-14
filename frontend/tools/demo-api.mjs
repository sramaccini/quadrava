// Backend di esempio della demo, per l'avvio con il BFF: espone come vere API REST (/api/...) lo stesso backend in
// memoria che la demo usa nel browser (projects/runtime/src/demo/demo-backend.ts). Solo per lo sviluppo locale.
//
//   node tools/demo-api.mjs [--port 8084] [--issuer http://localhost:8180/realms/lowcode] [--senza-auth]
//
// Ogni richiesta deve portare un token di Keycloak valido (Authorization: Bearer, lo aggiunge il BFF): firma RS256
// verificata con le chiavi pubblicate dal realm, emittente e scadenza. Con --senza-auth il controllo è spento (avviso
// nel log). Gli errori del backend tornano come Problem (RFC 9457) con il solo stato, mai con dettagli.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createPublicKey, createVerify } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, i, all) => {
    if (!value.startsWith('--')) return pairs;
    const next = all[i + 1];
    return [...pairs, [value.slice(2), next && !next.startsWith('--') ? next : true]];
  }, []),
);
const port = Number(args.port ?? 8084);
const issuer = String(args.issuer ?? process.env.KEYCLOAK_ISSUER_URI ?? 'http://localhost:8180/realms/lowcode').replace(/\/+$/, '');
const withoutAuth = args['senza-auth'] === true;

// Il backend TypeScript, impacchettato al volo.
const here = dirname(fileURLToPath(import.meta.url));
const bundle = await build({
  entryPoints: [join(here, '../projects/runtime/src/demo/demo-backend.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
});
const { DemoBackend } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const backend = new DemoBackend();

// Chiavi pubbliche del realm, per kid; si ricaricano quando arriva un kid sconosciuto.
let keys = new Map();
async function keyFor(kid) {
  if (!keys.has(kid)) {
    const response = await fetch(`${issuer}/protocol/openid-connect/certs`);
    if (!response.ok) throw new Error('chiavi non disponibili');
    const { keys: list } = await response.json();
    keys = new Map(list.filter((k) => k.kty === 'RSA').map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
  }
  return keys.get(kid) ?? null;
}

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Il token è valido? Firma RS256 del realm, emittente atteso, non scaduto. */
async function verify(authorization) {
  const match = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(authorization ?? '');
  if (!match) return false;
  const [, header, payload, signature] = match;
  try {
    const { alg, kid } = decode(header);
    if (alg !== 'RS256') return false;
    const key = await keyFor(kid);
    if (!key) return false;
    const valid = createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(key, Buffer.from(signature, 'base64url'));
    if (!valid) return false;
    const claims = decode(payload);
    return claims.iss === issuer && typeof claims.exp === 'number' && claims.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

/** Le parti di testo di un multipart: JSON se si può (numeri, oggetti), altrimenti testo. */
function textValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function readRequest(req, url) {
  const query = {};
  for (const [key, value] of url.searchParams) {
    query[key] = key in query ? [].concat(query[key], value) : value;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const type = req.headers['content-type'] ?? '';
  let body;
  let file;
  if (raw.length && type.startsWith('multipart/form-data')) {
    const form = await new Request(url, { method: 'POST', headers: { 'content-type': type }, body: raw }).formData();
    body = {};
    for (const [key, value] of form) {
      if (typeof value === 'string') body[key] = textValue(value);
      else file = { field: key, name: value.name, type: value.type, blob: value };
    }
  } else if (raw.length) {
    body = JSON.parse(raw.toString('utf8'));
  }
  return { method: req.method, url: url.pathname, query, body, file };
}

function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' });
  res.end(json);
}

const problem = (res, status, title) => send(res, status, { title, status });

// Descrizione OpenAPI delle API, come la pubblica springdoc in Spring Boot: l'editor la importa nei data source.
const openApi = readFileSync(join(here, 'demo-api.openapi.json'), 'utf8');

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  // /v3/api-docs: la sola descrizione (nessun dato), senza token e leggibile da altre origini, come springdoc con CORS
  // abilitato in sviluppo; dietro il BFF la stessa descrizione è anche su /api/v3/api-docs, con il token.
  if (url.pathname === '/v3/api-docs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(openApi);
  }
  if (!url.pathname.startsWith('/api/')) return problem(res, 404, 'Non trovato');
  if (!withoutAuth && !(await verify(req.headers['authorization']))) return problem(res, 401, 'Token mancante o non valido');
  if (url.pathname === '/api/v3/api-docs' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(openApi);
  }
  try {
    const request = await readRequest(req, url);
    const result = await backend.handle(request);
    if (result === undefined) return problem(res, 404, 'Non trovato');
    send(res, 200, result);
  } catch (e) {
    const status = Number(e instanceof Error ? e.message : NaN);
    if (status >= 400 && status < 600) problem(res, status, 'Richiesta non riuscita');
    else {
      console.error('[demo-api]', e instanceof Error ? e.message : e);
      problem(res, 500, 'Errore interno');
    }
  }
}).listen(port, '127.0.0.1', () => {
  if (withoutAuth) console.warn('[demo-api] AVVIATO SENZA AUTENTICAZIONE (--senza-auth): solo per lo sviluppo locale.');
  console.log(`[demo-api] http://localhost:${port}/api — token verificati con ${withoutAuth ? '(nessuno)' : issuer}`);
});
