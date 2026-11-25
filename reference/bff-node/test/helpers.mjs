// A BFF on a free port with a fake identity provider, and a client that keeps cookies like a browser.
import { createServer } from 'node:http';
import { createBff } from '../src/app.mjs';
import { loadConfig } from '../src/config.mjs';
import { rolePermissions } from '../src/permissions.mjs';
import { SessionStore } from '../src/sessions.mjs';

export const ROLES = { operator: ['orders.order.read'], manager: ['orders.order.read', 'orders.order.approve'] };

/**
 * A fake provider: the authorization address carries the parameters, the code exchange returns the given claims.
 * @param {{ claims?: Record<string, unknown>, expiresIn?: number, refresh?: () => Promise<import('../src/oidc.mjs').TokenSet> }} [options]
 */
export function fakeProvider({ claims = {}, expiresIn = 300, refresh } = {}) {
  const calls = { refresh: 0, exchanges: /** @type {any[]} */ ([]) };
  /** @type {import('../src/oidc.mjs').Provider & { calls: typeof calls }} */
  const provider = {
    calls,
    async authorizationUrl({ redirectUri, state, maxAge }) {
      const url = new URL('https://idp.test/auth');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      if (maxAge !== undefined) url.searchParams.set('max_age', String(maxAge));
      return url.href;
    },
    async exchange(callback) {
      calls.exchanges.push(callback);
      if (callback.url.searchParams.get('code') !== 'good-code') throw new Error('invalid_grant');
      return {
        tokens: { accessToken: 'access-1', refreshToken: 'refresh-1', idToken: 'id-1', expiresAt: Date.now() + expiresIn * 1000 },
        claims: { sub: 'u1', preferred_username: 'operator', name: 'Demo Operator', email: 'operator@example.test', realm_access: { roles: ['operator', 'offline_access'] }, ...claims },
      };
    },
    async refresh(tokens) {
      calls.refresh++;
      if (refresh) return refresh();
      return { ...tokens, accessToken: `access-${calls.refresh + 1}`, expiresAt: Date.now() + 300_000 };
    },
    logoutUrl({ idToken, postLogoutRedirectUri }) {
      return `https://idp.test/logout?id_token_hint=${idToken}&post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirectUri)}`;
    },
  };
  return provider;
}

/**
 * Starts a server on a free port.
 * @param {import('node:http').RequestListener} handler
 */
export async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve(undefined));
    }),
  };
}

/**
 * A BFF with the fake provider and the given environment.
 * @param {{ env?: Record<string, string>, provider?: ReturnType<typeof fakeProvider>, fetch?: typeof fetch, roles?: unknown }} [options]
 */
export async function startBff({ env = {}, provider = fakeProvider(), fetch: fetchImpl, roles = ROLES } = {}) {
  const config = loadConfig({ BFF_ALLOWED_ORIGINS: 'http://app.test', BFF_HOME: 'http://app.test/', ...env });
  const store = new SessionStore({ idleSeconds: config.idleSeconds, maxSeconds: config.maxSeconds });
  const logs = /** @type {string[]} */ ([]);
  const server = await listen(createBff({ config, provider, store, rolePermissions: rolePermissions(roles), fetch: fetchImpl, log: (l) => logs.push(l) }));
  return { ...server, config, store, provider, logs, client: () => new Browser(server.url) };
}

/** A client that keeps the cookies the BFF sets and does not follow redirects. */
export class Browser {
  /** @param {string} base */
  constructor(base) {
    this.base = base;
    /** @type {Map<string, string>} */
    this.cookies = new Map();
  }

  /**
   * @param {string} path
   * @param {RequestInit & { headers?: Record<string, string> }} [init]
   */
  async fetch(path, init = {}) {
    const cookieHeader = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(this.base + path, {
      redirect: 'manual',
      ...init,
      headers: { ...(cookieHeader ? { Cookie: cookieHeader } : {}), ...(init.headers ?? {}) },
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at);
      if (attributes.some((a) => /^\s*max-age=0$/i.test(a))) this.cookies.delete(name);
      else this.cookies.set(name, pair.slice(at + 1));
    }
    return response;
  }

  /** The CSRF token as the page reads it. */
  get csrf() {
    return decodeURIComponent(this.cookies.get('XSRF-TOKEN') ?? '');
  }

  /**
   * Signs in through the fake provider; returns the answer of the callback.
   * @param {string} [query]
   */
  async login(query = 'return=' + encodeURIComponent('http://app.test/orders'), code = 'good-code') {
    const start = await this.fetch(`/bff/login?${query}`);
    const location = new URL(String(start.headers.get('location')));
    const callback = new URL(String(location.searchParams.get('redirect_uri')));
    return this.fetch(`${callback.pathname}?code=${code}&state=${location.searchParams.get('state')}`);
  }

  /**
   * A write as the runtime sends it: JSON body and the CSRF header.
   * @param {string} path
   * @param {unknown} [body]
   * @param {Record<string, string>} [headers]
   */
  write(path, body, headers = {}) {
    return this.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': this.csrf, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}

/**
 * Is the answer a Problem with this status?
 * @param {Response} response
 * @param {number} status
 */
export async function problem(response, status) {
  const body = await response.json();
  return response.status === status && (response.headers.get('content-type') ?? '').startsWith('application/problem+json')
    && typeof body.title === 'string' && body.status === status;
}
