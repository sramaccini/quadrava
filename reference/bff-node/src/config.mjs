// Configuration from environment variables. The defaults are those of local development (the realm of idp/, the
// runtime on 4200, the demo back end on 8084): `developmentDefaults` lists the ones in use, so that the start-up log
// says so.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {object} Route
 * @property {string} prefix  path prefix, such as `/api`: it matches `/api` and `/api/...`
 * @property {string} target  address of the service, without a final slash
 *
 * @typedef {object} Config
 * @property {number} port
 * @property {string | undefined} host
 * @property {string} issuer             OpenID Connect issuer (discovery)
 * @property {string} clientId
 * @property {string} clientSecret
 * @property {string} scope
 * @property {string} callbackPath       path of the login callback, registered at the identity provider
 * @property {string | undefined} publicUrl  public origin of the BFF; unset: taken from the request
 * @property {boolean} trustProxy        read `X-Forwarded-Proto` and `X-Forwarded-Host` (behind a proxy only)
 * @property {string[]} allowedOrigins   origins of the applications: return pages and `Origin` of writes
 * @property {string} home               after a login without a return page and after the logout
 * @property {Route[]} routes
 * @property {string} permissionsFile
 * @property {string} rolesClaim         path of the roles in the access token, such as `realm_access.roles`
 * @property {number} idleSeconds        inactivity limit of a session
 * @property {number} maxSeconds         absolute limit of a session
 * @property {number} maxBodyBytes       largest request body forwarded
 * @property {string[]} developmentDefaults
 */

const DEFAULTS = {
  BFF_PORT: '8080',
  BFF_ISSUER: 'http://localhost:8180/realms/quadrava',
  BFF_CLIENT_ID: 'quadrava-bff',
  // The development secret of idp/realm-quadrava.json, as in the reference BFF.
  BFF_CLIENT_SECRET: 'dev-only-secret',
  BFF_SCOPE: 'openid profile email',
  // The callback registered for the quadrava-bff client of the development realm.
  BFF_CALLBACK_PATH: '/login/oauth2/code/keycloak',
  BFF_ALLOWED_ORIGINS: 'http://localhost:4200,http://localhost:4201,http://localhost:8090',
  BFF_HOME: 'http://localhost:4200/',
  BFF_ROUTES: '/api=http://localhost:8084',
  BFF_PERMISSIONS_FILE: join(here, '..', 'permissions.json'),
  BFF_ROLES_CLAIM: 'realm_access.roles',
  BFF_SESSION_IDLE_MINUTES: '30',
  BFF_SESSION_MAX_HOURS: '10',
  BFF_MAX_BODY_BYTES: String(100 * 1024 * 1024),
};

/** Variables whose default only makes sense on a developer's machine. */
const DEVELOPMENT = ['BFF_ISSUER', 'BFF_CLIENT_SECRET', 'BFF_ALLOWED_ORIGINS', 'BFF_HOME', 'BFF_ROUTES'];

/**
 * Reads the configuration; throws with a readable message when a value is wrong.
 * @param {Record<string, string | undefined>} [env]
 * @returns {Config}
 */
export function loadConfig(env = process.env) {
  const value = (/** @type {keyof typeof DEFAULTS} */ name) => (env[name] !== undefined && env[name] !== '' ? String(env[name]) : DEFAULTS[name]);
  const number = (/** @type {keyof typeof DEFAULTS} */ name) => {
    const n = Number(value(name));
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, not "${value(name)}"`);
    return n;
  };
  const origin = (/** @type {string} */ text, /** @type {string} */ name) => {
    let url;
    try {
      url = new URL(text);
    } catch {
      throw new Error(`${name}: "${text}" is not an address`);
    }
    if (!/^https?:$/.test(url.protocol)) throw new Error(`${name}: "${text}" is not an http(s) address`);
    return url;
  };

  const allowedOrigins = value('BFF_ALLOWED_ORIGINS').split(',').map((o) => o.trim()).filter(Boolean)
    .map((o) => origin(o, 'BFF_ALLOWED_ORIGINS').origin);
  const routes = value('BFF_ROUTES').split(',').map((r) => r.trim()).filter(Boolean).map((r) => {
    const at = r.indexOf('=');
    const prefix = r.slice(0, at).replace(/\/+$/, '');
    if (at < 0 || !/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(prefix)) throw new Error(`BFF_ROUTES: "${r}" is not prefix=address`);
    if (/^\/(bff|authz|logout)$/.test(prefix)) throw new Error(`BFF_ROUTES: ${prefix} is answered by the BFF itself`);
    return { prefix, target: origin(r.slice(at + 1), 'BFF_ROUTES').href.replace(/\/+$/, '') };
  });
  const callbackPath = value('BFF_CALLBACK_PATH');
  if (!/^\/[A-Za-z0-9._~/-]*$/.test(callbackPath)) throw new Error(`BFF_CALLBACK_PATH: "${callbackPath}" is not a path`);
  const publicUrl = env.BFF_PUBLIC_URL ? origin(env.BFF_PUBLIC_URL, 'BFF_PUBLIC_URL').origin : undefined;
  const trustProxy = (env.BFF_TRUST_PROXY ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(trustProxy)) throw new Error(`BFF_TRUST_PROXY must be true or false, not "${env.BFF_TRUST_PROXY}"`);

  return {
    port: number('BFF_PORT'),
    host: env.BFF_HOST || undefined,
    issuer: origin(value('BFF_ISSUER'), 'BFF_ISSUER').href.replace(/\/+$/, ''),
    clientId: value('BFF_CLIENT_ID'),
    clientSecret: value('BFF_CLIENT_SECRET'),
    scope: value('BFF_SCOPE'),
    callbackPath,
    publicUrl,
    trustProxy: trustProxy === 'true',
    allowedOrigins,
    home: origin(value('BFF_HOME'), 'BFF_HOME').href,
    routes,
    permissionsFile: value('BFF_PERMISSIONS_FILE'),
    rolesClaim: value('BFF_ROLES_CLAIM'),
    idleSeconds: number('BFF_SESSION_IDLE_MINUTES') * 60,
    maxSeconds: number('BFF_SESSION_MAX_HOURS') * 3600,
    maxBodyBytes: number('BFF_MAX_BODY_BYTES'),
    developmentDefaults: DEVELOPMENT.filter((name) => !env[name]),
  };
}
