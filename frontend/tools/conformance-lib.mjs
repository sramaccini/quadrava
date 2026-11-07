// Shared tools of the contract conformance kits (tools/conformance-*.mjs): arguments, Keycloak tokens, HTTP calls,
// checks and report. The checks verify from the outside, over HTTP, what the contract promises.

/** Command-line arguments `--name value`. */
export function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(argv.reduce((pairs, value, i, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs), []));
}

/** Keycloak token with the development client quadrava-tools (password grant: local realm only). */
export async function tokenFor(issuer, user, password) {
  const response = await fetch(`${issuer.replace(/\/+$/, '')}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'quadrava-tools', username: user, password: password ?? '' }),
  });
  if (!response.ok) throw new Error(`no token for ${user}: HTTP ${response.status}`);
  return (await response.json()).access_token;
}

/** The token from `--<prefix>token` or from `--<prefix>user` and `--<prefix>password`; null if they are missing. */
export async function tokenFromArgs(args, prefix = '') {
  if (args[`${prefix}token`]) return args[`${prefix}token`];
  if (!args[`${prefix}user`]) return null;
  return tokenFor(args.issuer ?? 'http://localhost:8180/realms/quadrava', args[`${prefix}user`], args[`${prefix}password`]);
}

/**
 * Signs in to a BFF as a browser does, through the Keycloak login page (local realm only): the login of the BFF, the
 * form of Keycloak with user and password, the return to the BFF. Returns the session cookies of the BFF
 * ("JSESSIONID=…"), the value that the kits otherwise take from a signed-in browser with --cookie.
 */
export async function bffLogin(bff, user, password, returnTo) {
  const jars = new Map();
  const remember = (url, response) => {
    const jar = jars.get(new URL(url).origin) ?? new Map();
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const at = pair.indexOf('=');
      jar.set(pair.slice(0, at).trim(), pair.slice(at + 1));
    }
    jars.set(new URL(url).origin, jar);
  };
  const cookies = (url) => [...(jars.get(new URL(url).origin) ?? new Map())].map(([k, v]) => `${k}=${v}`).join('; ');
  const step = async (url, init = {}) => {
    const response = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), Cookie: cookies(url) } });
    remember(url, response);
    return { response, next: response.headers.get('location') ? new URL(response.headers.get('location'), url).href : null };
  };

  let { response, next } = await step(`${bff}/bff/login?return=${encodeURIComponent(returnTo)}`, { headers: { Accept: 'text/html' } });
  // Redirects up to the login page of Keycloak.
  for (let i = 0; next && i < 5; i++) ({ response, next } = await step(next, { headers: { Accept: 'text/html' } }));
  const page = await response.text();
  const action = /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(page)?.[1];
  if (!action) throw new Error(`no Keycloak login form (HTTP ${response.status})`);
  ({ response, next } = await step(action.replaceAll('&amp;', '&'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: user, password: password ?? '' }),
  }));
  if (!next) throw new Error(`login refused for ${user} (HTTP ${response.status})`);
  // Back to the BFF (the code), which ends on the return page: only the cookies of the BFF matter.
  for (let i = 0; next && new URL(next).origin === new URL(bff).origin && i < 5; i++) ({ next } = await step(next, { headers: { Accept: 'text/html' } }));
  const session = cookies(bff);
  if (!session) throw new Error(`no session cookie from the BFF for ${user}`);
  return session;
}

/** HTTP call: status, headers and body (JSON when it is JSON). */
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
    // body is not JSON
  }
  return { status: response.status, headers: response.headers, json, text };
}

/** Error response in Problem format (RFC 9457): JSON with a title and a status equal to the HTTP one. */
export function isProblem(r) {
  return (r.headers.get('content-type') ?? '').includes('json') && typeof r.json?.title === 'string' && r.json?.status === r.status;
}

/** Collects the checks: `check(name, run, { skip })`, then `report(title)` prints and exits. */
export function suite() {
  const results = [];
  return {
    async check(name, run, { skip = false } = {}) {
      if (skip) {
        results.push({ name, outcome: 'skipped' });
        return;
      }
      try {
        await run();
        results.push({ name, outcome: 'ok' });
      } catch (e) {
        results.push({ name, outcome: 'FAILED', reason: e instanceof Error ? e.message : String(e) });
      }
    },
    report(title) {
      let failed = 0;
      console.log(`${title}\n`);
      for (const r of results) {
        if (r.outcome === 'FAILED') failed++;
        console.log(`${r.outcome === 'ok' ? '  ok     ' : r.outcome === 'skipped' ? '  skipped' : '  FAILED '}  ${r.name}${r.reason ? `\n           ${r.reason}` : ''}`);
      }
      console.log(`\n${results.length - failed} of ${results.length} checks passed${failed ? `, ${failed} failed` : ''}.`);
      process.exit(failed ? 1 : 0);
    },
  };
}

export function expect(condition, message) {
  if (!condition) throw new Error(message);
}
