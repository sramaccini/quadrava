// The request handler of the BFF: contracts/bff.yaml (login, callback, user, operational roles, logout, CSRF), the
// /authz part of contracts/authz.yaml, and the forwarding of the configured routes.
import { addCookie, BodyError, cookie, readCookies, readJson, redirect, sendJson, sendProblem } from './http.mjs';
import { forward, routeFor, safePath } from './forward.mjs';
import { check, grantsFor, rolesOf, rolesFromClaims } from './permissions.mjs';
import { randomId, sameSecret } from './sessions.mjs';
import { randomVerifier } from './oidc.mjs';

export const SESSION_COOKIE = 'BFF_SESSION';
export const LOGIN_COOKIE = 'BFF_LOGIN';
export const CSRF_COOKIE = 'XSRF-TOKEN';
export const CSRF_HEADER = 'x-xsrf-token';
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** An access token closer than this to its expiry is renewed before a call. */
const RENEW_BEFORE_MS = 30_000;
const MAX_CHECK_BODY = 256 * 1024;
const MAX_ROLE_BODY = 4 * 1024;
const HOST = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;

/**
 * @param {{
 *   config: import('./config.mjs').Config,
 *   provider: import('./oidc.mjs').Provider,
 *   store: import('./sessions.mjs').SessionStore,
 *   rolePermissions: Map<string, import('./permissions.mjs').Role>,
 *   fetch?: typeof fetch,
 *   log?: (line: string) => void,
 * }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createBff({ config, provider, store, rolePermissions, fetch: fetchImpl = fetch, log = console.error }) {
  const allowed = new Set(config.allowedOrigins);
  /** The last operational role chosen by each user, for their next login (in memory: forgotten at restart). */
  const lastRole = new Map();

  /**
   * The public origin of the BFF for this request: configured, or from the request (with the forwarded headers only
   * behind a trusted proxy). Null if the request names a host that is not a host.
   * @param {import('node:http').IncomingMessage} req
   */
  function publicOrigin(req) {
    if (config.publicUrl) return config.publicUrl;
    const first = (/** @type {string | string[] | undefined} */ v) => (Array.isArray(v) ? v[0] : v)?.split(',')[0].trim();
    const proto = (config.trustProxy ? first(req.headers['x-forwarded-proto']) : undefined)
      ?? (/** @type {import('node:tls').TLSSocket} */ (req.socket).encrypted ? 'https' : 'http');
    const host = (config.trustProxy ? first(req.headers['x-forwarded-host']) : undefined) ?? req.headers.host;
    if (!['http', 'https'].includes(proto) || !host || !HOST.test(host)) return null;
    return `${proto}://${host}`;
  }

  /**
   * The access token of the session, renewed with the refresh token when it is about to expire; null when the session
   * can no longer get one (it is then closed).
   * @param {import('./sessions.mjs').Session} session
   */
  async function accessToken(session) {
    if (session.tokens.expiresAt - Date.now() > RENEW_BEFORE_MS) return session.tokens.accessToken;
    if (!session.tokens.refreshToken) {
      store.delete(session.id);
      return null;
    }
    // Concurrent calls of the same page share one renewal: a refresh token may be valid only once.
    session.refreshing ??= provider.refresh(session.tokens).then(
      (tokens) => {
        session.tokens = tokens;
        return true;
      },
      (e) => {
        log(`token renewal failed, session closed: ${e instanceof Error ? e.message : e}`);
        store.delete(session.id);
        return false;
      },
    ).finally(() => {
      session.refreshing = null;
    });
    return (await session.refreshing) ? session.tokens.accessToken : null;
  }

  return async function handle(req, res) {
    // URL resolves `..` and `%2e%2e` while the forwarding passes the raw path on: such a path is refused before either.
    if (!safePath(req.url ?? '/')) return sendProblem(res, 400, 'Invalid path');
    const url = new URL(req.url ?? '/', 'http://bff.invalid');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const cookies = readCookies(req);
    const origin = publicOrigin(req);
    const secure = origin?.startsWith('https:') ?? false;
    let session = store.get(cookies.get(SESSION_COOKIE));

    // The CSRF token, readable by the page, at the latest with the first answer: the one of the session, or a
    // placeholder for a visitor without one (a write without a session is refused anyway).
    if (session ? cookies.get(CSRF_COOKIE) !== session.csrf : !cookies.has(CSRF_COOKIE)) {
      addCookie(res, cookie(CSRF_COOKIE, session?.csrf ?? randomId(), { httpOnly: false, secure }));
    }
    if (session) res.setHeader('X-Permissions-Version', session.permissionsVersion);

    const unauthorized = () => sendProblem(res, 401, 'Session missing or expired');

    if (WRITES.has(method)) {
      if (!session) return unauthorized();
      const from = req.headers.origin;
      if (from && from !== origin && !allowed.has(from)) return sendProblem(res, 403, 'Origin not allowed');
      const header = req.headers[CSRF_HEADER];
      if (!sameSecret(typeof header === 'string' ? header : undefined, session.csrf)) return sendProblem(res, 403, 'CSRF token missing or wrong');
    }

    try {
      if (path === '/bff/login') {
        if (method !== 'GET') return notAllowed(res, 'GET');
        return await login(req, res, url, session, origin, secure, cookies);
      }
      if (path === config.callbackPath) {
        if (method !== 'GET') return notAllowed(res, 'GET');
        return await callback(req, res, url, cookies, secure);
      }
      if (path === '/bff/user') {
        if (method !== 'GET') return notAllowed(res, 'GET');
        if (!session) return unauthorized();
        const { name, username, email, roles } = session.user;
        // The operational roles only when the user has some (optional part of the contract).
        const choice = session.operationalRoles.length ? { operationalRoles: session.operationalRoles, currentRole: session.currentRole } : {};
        return sendJson(res, 200, { ...(name ? { name } : {}), ...(username ? { username } : {}), ...(email ? { email } : {}), roles, ...choice });
      }
      if (path === '/bff/role') {
        if (method !== 'POST') return notAllowed(res, 'POST');
        return await switchRole(req, res, /** @type {import('./sessions.mjs').Session} */ (session));
      }
      if (path === '/logout') {
        if (method !== 'POST') return notAllowed(res, 'POST');
        return logout(req, res, /** @type {import('./sessions.mjs').Session} */ (session), secure);
      }
      if (path === '/authz/capabilities') {
        if (method !== 'GET') return notAllowed(res, 'GET');
        if (!session) return unauthorized();
        if (!url.searchParams.get('app')) return sendProblem(res, 400, 'Parameter app missing');
        // The permissions of the roles hold for every application the BFF serves. A `role` in the query is not read:
        // the answer is for the active role of the session, so the page cannot widen its own permissions.
        return sendJson(res, 200, { permissions: [...session.permissions], version: session.permissionsVersion });
      }
      if (path === '/authz/roles') {
        if (method !== 'GET') return notAllowed(res, 'GET');
        if (!session) return unauthorized();
        if (!url.searchParams.get('app')) return sendProblem(res, 400, 'Parameter app missing');
        return sendJson(res, 200, rolesOf(session.user.roles, rolePermissions));
      }
      if (path === '/authz/check') {
        if (method !== 'POST') return notAllowed(res, 'POST');
        const outcome = check(await readJson(req, MAX_CHECK_BODY), /** @type {import('./sessions.mjs').Session} */ (session).permissions);
        if ('invalid' in outcome) return sendProblem(res, 400, 'Invalid check request', { detail: outcome.invalid });
        return sendJson(res, 200, outcome);
      }
      const route = routeFor(path, config.routes);
      if (route) {
        if (!session) return unauthorized();
        const token = await accessToken(session);
        if (!token) {
          addCookie(res, cookie(SESSION_COOKIE, '', { secure, maxAge: 0 }));
          return unauthorized();
        }
        return await forward(req, res, { route, token, activeRole: session.currentRole, maxBodyBytes: config.maxBodyBytes, fetch: fetchImpl, log });
      }
      // Without a session every call answers 401, as the runtime expects; with one, an unknown path is just unknown.
      return session ? sendProblem(res, 404, 'Not found') : unauthorized();
    } catch (e) {
      if (e instanceof BodyError) return sendProblem(res, e.status, e.message);
      log(`${method} ${path}: ${e instanceof Error ? e.stack ?? e.message : e}`);
      if (!res.headersSent) return sendProblem(res, 500, 'Internal error');
      res.destroy();
    }
  };

  /**
   * GET /bff/login?return=…&max_age=…: to the identity provider, or straight back when a session exists.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} url
   * @param {import('./sessions.mjs').Session | null} session
   * @param {string | null} origin
   * @param {boolean} secure
   * @param {Map<string, string>} cookies
   */
  async function login(req, res, url, session, origin, secure, cookies) {
    const returnTo = returnAddress(url.searchParams.get('return'));
    if (returnTo === null) return sendProblem(res, 400, 'Return address not allowed', { detail: 'The return page must belong to one of the applications.' });
    const rawMaxAge = url.searchParams.get('max_age');
    if (rawMaxAge !== null && !/^\d{1,9}$/.test(rawMaxAge)) return sendProblem(res, 400, 'Invalid max_age');
    const maxAge = rawMaxAge === null ? undefined : Number(rawMaxAge);
    // With max_age the provider decides whether the login is recent enough, even inside a session.
    if (session && maxAge === undefined) return redirect(res, returnTo);
    if (!origin) return sendProblem(res, 400, 'Invalid host');

    const browser = cookies.get(LOGIN_COOKIE) || randomId();
    const state = randomId();
    const nonce = randomId();
    const verifier = randomVerifier();
    const redirectUri = origin + config.callbackPath;
    store.startLogin(state, { browser, verifier, nonce, returnTo, maxAge, redirectUri });
    addCookie(res, cookie(LOGIN_COOKIE, browser, { secure, maxAge: 600 }));
    return redirect(res, await provider.authorizationUrl({ redirectUri, state, nonce, verifier, maxAge }));
  }

  /**
   * The page to go back to: the return address if it belongs to an application, the home without it; null when it
   * is outside the applications (no open redirect).
   * @param {string | null} value
   */
  function returnAddress(value) {
    if (value === null || value === '') return config.home;
    let target;
    try {
      target = new URL(value);
    } catch {
      return null;
    }
    return /^https?:$/.test(target.protocol) && allowed.has(target.origin) ? target.href : null;
  }

  /**
   * GET <callback>?code=…&state=…: the tokens, a new session, back to the return page.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {URL} url
   * @param {Map<string, string>} cookies
   * @param {boolean} secure
   */
  async function callback(req, res, url, cookies, secure) {
    const pending = store.finishLogin(url.searchParams.get('state') ?? undefined, cookies.get(LOGIN_COOKIE));
    if (!pending) return sendProblem(res, 400, 'Login not started in this browser, or expired');
    const error = url.searchParams.get('error');
    if (error) return sendProblem(res, 400, 'Login failed', { detail: `The identity provider answered ${error.slice(0, 64)}.` });

    let result;
    try {
      // openid-client checks state, PKCE, nonce, the ID token and, with max_age, the time of the authentication.
      result = await provider.exchange({ url: new URL(pending.redirectUri + url.search), redirectUri: pending.redirectUri, state: url.searchParams.get('state') ?? '',
        nonce: pending.nonce, verifier: pending.verifier, maxAge: pending.maxAge });
    } catch (e) {
      log(`login failed: ${e instanceof Error ? e.message : e}`);
      return sendProblem(res, 400, 'Login failed');
    }
    const { claims, tokens } = result;
    const text = (/** @type {unknown} */ v) => (typeof v === 'string' && v ? v : undefined);
    const username = text(claims.preferred_username) ?? text(claims.sub);
    // The session opens on an operational role chosen here, never asked: the last one the user worked as, or the first.
    const grants = grantsFor(rolesFromClaims(claims, config.rolesClaim), rolePermissions, username === undefined ? undefined : lastRole.get(username));
    const previous = cookies.get(SESSION_COOKIE);
    if (previous) store.delete(previous);
    const session = store.create({
      user: { name: text(claims.name), username, email: text(claims.email), roles: grants.roles },
      operationalRoles: grants.operationalRoles,
      currentRole: grants.currentRole,
      permissions: new Set(grants.permissions),
      permissionsVersion: grants.version,
      tokens,
    });
    // Only the cookies of the new session: the placeholder CSRF token of the visitor is replaced.
    res.removeHeader('Set-Cookie');
    addCookie(res, cookie(SESSION_COOKIE, session.id, { secure }));
    addCookie(res, cookie(CSRF_COOKIE, session.csrf, { httpOnly: false, secure }));
    addCookie(res, cookie(LOGIN_COOKIE, '', { secure, maxAge: 0 }));
    res.setHeader('X-Permissions-Version', session.permissionsVersion);
    return redirect(res, pending.returnTo);
  }

  /**
   * POST /bff/role (session and CSRF already checked): the session works as another of the user's operational roles
   * (ADR-28). Its permissions and their version change at once; the role is remembered for the next login.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {import('./sessions.mjs').Session} session
   */
  async function switchRole(req, res, session) {
    const body = await readJson(req, MAX_ROLE_BODY);
    const role = /** @type {{ role?: unknown }} */ (body ?? {}).role;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof role !== 'string') {
      return sendProblem(res, 400, 'Invalid role selection', { detail: 'The body is { "role": "<id>" }.' });
    }
    if (!session.operationalRoles.some((r) => r.id === role)) return sendProblem(res, 404, 'Role not offered to the user');
    const grants = grantsFor(session.user.roles, rolePermissions, role);
    session.currentRole = grants.currentRole;
    session.permissions = new Set(grants.permissions);
    session.permissionsVersion = grants.version;
    if (session.user.username !== undefined) lastRole.set(session.user.username, role);
    res.setHeader('X-Permissions-Version', session.permissionsVersion);
    res.statusCode = 204;
    res.end();
  }

  /**
   * POST /logout (session and CSRF already checked): closes the session here and at the identity provider.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {import('./sessions.mjs').Session} session
   * @param {boolean} secure
   */
  function logout(req, res, session, secure) {
    store.delete(session.id);
    res.removeHeader('X-Permissions-Version');
    addCookie(res, cookie(SESSION_COOKIE, '', { secure, maxAge: 0 }));
    // Back to the application that asked, when it is one of those served; the home otherwise.
    const from = req.headers.origin;
    const back = from && allowed.has(from) ? `${from}/` : config.home;
    const target = provider.logoutUrl({ idToken: session.tokens.idToken, postLogoutRedirectUri: back });
    if ((req.headers.accept ?? '').includes('application/json')) return sendJson(res, 200, { redirect: target });
    return redirect(res, target);
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} allow
 */
function notAllowed(res, allow) {
  res.setHeader('Allow', allow);
  sendProblem(res, 405, 'Method not allowed');
}
