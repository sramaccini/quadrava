// Strumenti comuni dei kit di conformità ai contratti (tools/conformance-*.mjs): argomenti, token di Keycloak, chiamate
// HTTP, prove e rapporto. Le prove verificano dall'esterno, via HTTP, quello che il contratto promette.

/** Argomenti `--nome valore` della riga di comando. */
export function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(argv.reduce((pairs, value, i, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []));
}

/** Token di Keycloak con il client di sviluppo lowcode-tools (password grant: solo realm locale). */
export async function tokenFor(issuer, user, password) {
  const response = await fetch(`${issuer.replace(/\/+$/, '')}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'lowcode-tools', username: user, password: password ?? '' }),
  });
  if (!response.ok) throw new Error(`token non ottenuto per ${user}: HTTP ${response.status}`);
  return (await response.json()).access_token;
}

/** Il token da `--<prefisso>token` oppure da `--<prefisso>user` e `--<prefisso>password`; null se mancano. */
export async function tokenFromArgs(args, prefix = '') {
  if (args[`${prefix}token`]) return args[`${prefix}token`];
  if (!args[`${prefix}user`]) return null;
  return tokenFor(args.issuer ?? 'http://localhost:8180/realms/lowcode', args[`${prefix}user`], args[`${prefix}password`]);
}

/** Chiamata HTTP: stato, intestazioni e corpo (JSON se lo è). */
export async function call(base, method, path, { body, raw, token, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // corpo non JSON
  }
  return { status: response.status, headers: response.headers, json, text };
}

/** Risposta di errore in formato Problem (RFC 9457): JSON con title e status uguale a quello HTTP. */
export function isProblem(r) {
  return (r.headers.get('content-type') ?? '').includes('json') && typeof r.json?.title === 'string' && r.json?.status === r.status;
}

/** Raccolta delle prove: `check(nome, prova, { skip })`, poi `report(titolo)` stampa ed esce. */
export function suite() {
  const results = [];
  return {
    async check(name, run, { skip = false } = {}) {
      if (skip) {
        results.push({ name, outcome: 'saltata' });
        return;
      }
      try {
        await run();
        results.push({ name, outcome: 'ok' });
      } catch (e) {
        results.push({ name, outcome: 'FALLITA', reason: e instanceof Error ? e.message : String(e) });
      }
    },
    report(title) {
      let failed = 0;
      console.log(`${title}\n`);
      for (const r of results) {
        if (r.outcome === 'FALLITA') failed++;
        console.log(`${r.outcome === 'ok' ? '  ok     ' : r.outcome === 'saltata' ? '  saltata' : '  FALLITA'}  ${r.name}${r.reason ? `\n           ${r.reason}` : ''}`);
      }
      console.log(`\n${results.length - failed} su ${results.length} prove senza errori${failed ? `, ${failed} fallite` : ''}.`);
      process.exit(failed ? 1 : 0);
    },
  };
}

export function expect(condition, message) {
  if (!condition) throw new Error(message);
}
