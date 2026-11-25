// The glue of the light BFF (contracts/bff.yaml), in njs: what oauth2-proxy does not give. The CSRF double submit, the
// login with a checked return address, the user and the permissions from the claims of the access token, the logout.
// The token comes from oauth2-proxy (auth_request), which has checked it when it received it from Keycloak: this
// script only reads its claims.
import fs from 'fs';
import crypto from 'crypto';
import qs from 'querystring';

/** Permissions per role, read again at every call: editing the file needs no restart. */
const PERMISSIONS_FILE = '/etc/quadrava/role-permissions.json';
/** Format of a permission (contracts/authz.yaml). */
const PERMISSION = /^[a-z0-9]+\.[a-z0-9]+\.[a-z0-9]+$/;
const MAX_CHECKS = 200;
const TTL_SECONDS = 300;
const WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'];
/** Roles Keycloak gives every user: not roles of the application. */
const KEYCLOAK_ROLES = /^(default-roles-.*|offline_access|uma_authorization)$/;

function send(r, status, type, body, headers) {
  r.headersOut['Content-Type'] = type;
  r.headersOut['Cache-Control'] = 'no-store';
  for (const name in headers || {}) r.headersOut[name] = headers[name];
  r.return(status, body === undefined ? '' : JSON.stringify(body));
}

const json = (r, status, body, headers) => send(r, status, 'application/json', body, headers);

/** Error in Problem format (RFC 9457, contracts/problem.yaml). */
function problem(r, status, title, headers) {
  send(r, status, 'application/problem+json', { type: 'about:blank', title: title, status: status }, headers);
}

/** Value of a cookie of the request (the first, if repeated), or ''. */
function cookie(r, name) {
  const header = r.headersIn.Cookie || '';
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return '';
}

// --- CSRF --------------------------------------------------------------------------------------------------------

/** The XSRF-TOKEN cookie to set when the browser has none: readable by the page (not HttpOnly), random. */
function xsrfSetCookie(r) {
  if (cookie(r, 'XSRF-TOKEN')) return '';
  const secure = r.variables.bff_origin.startsWith('https:') ? '; Secure' : '';
  return `XSRF-TOKEN=${r.variables.request_id}; Path=/; SameSite=Lax${secure}`;
}

/** '1' for a write whose X-XSRF-TOKEN header is missing or differs from the cookie. */
function csrfRefused(r) {
  if (!WRITES.includes(r.method)) return '';
  const expected = cookie(r, 'XSRF-TOKEN');
  const sent = r.headersIn['X-XSRF-TOKEN'] || '';
  try {
    return expected && sent === decodeURIComponent(expected) ? '' : '1';
  } catch (e) {
    return '1'; // a malformed cookie
  }
}

// --- Session -----------------------------------------------------------------------------------------------------

/** Claims of the user's access token (its payload, not checked again here). */
function claims(r) {
  const token = r.variables.access_token || '';
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch (e) {
    return null;
  }
}

/** Roles of the user: the realm roles of Keycloak (realm_access.roles), without the built-in ones. */
function rolesOf(c) {
  const roles = c && c.realm_access && Array.isArray(c.realm_access.roles) ? c.realm_access.roles : [];
  return roles.filter((role) => typeof role === 'string' && !KEYCLOAK_ROLES.test(role));
}

function user(r) {
  const c = claims(r);
  if (!c) return problem(r, 401, 'Session missing or expired');
  const body = { roles: rolesOf(c) };
  if (typeof c.name === 'string') body.name = c.name;
  if (typeof c.preferred_username === 'string') body.username = c.preferred_username;
  if (typeof c.email === 'string') body.email = c.email;
  json(r, 200, body);
}

/**
 * The path of a return address of the applications (same origin as the BFF), or null. Only the path goes to
 * oauth2-proxy, so the login can only come back here.
 */
function returnPath(address, origin) {
  if (address.slice(0, origin.length).toLowerCase() !== origin.toLowerCase()) return null;
  let rest = address.slice(origin.length);
  if (rest !== '' && !'/?#'.includes(rest[0])) return null; // http://localhost:8091.evil.test
  if (rest === '' || rest[0] !== '/') rest = '/' + rest;
  if (rest.startsWith('//') || /[\\\x00-\x1f]/.test(rest)) return null;
  return rest;
}

function login(r) {
  const args = qs.parse(r.variables.args || '');
  let rd = '/';
  if (args['return'] !== undefined) {
    rd = typeof args['return'] === 'string' ? returnPath(args['return'], r.variables.bff_origin) : null;
    if (rd === null) return problem(r, 400, 'Return address outside the applications');
  }
  // max_age (a recent login) is not supported: oauth2-proxy does not pass it to Keycloak (README).
  r.return(302, '/oauth2/start?rd=' + encodeURIComponent(rd));
}

/**
 * Closes the session of oauth2-proxy (its cookie and the tokens in Redis) and answers with the logout of Keycloak,
 * which ends its own session and comes back to the applications.
 */
async function logout(r) {
  if (r.method !== 'POST') return problem(r, 405, 'Method not allowed', { Allow: 'POST' });
  const idToken = (r.variables.id_token || '').replace(/^Bearer\s+/i, '');
  const reply = await r.subrequest('/_bff/sign-out');
  const cleared = reply.headersOut['Set-Cookie'];
  // A new CSRF token for the next session.
  r.headersOut['Set-Cookie'] = [].concat(cleared || [], 'XSRF-TOKEN=; Path=/; Max-Age=0; SameSite=Lax');
  const params = {
    client_id: r.variables.oidc_client_id,
    post_logout_redirect_uri: r.variables.bff_origin + '/',
  };
  if (idToken) params.id_token_hint = idToken;
  json(r, 200, { redirect: `${r.variables.oidc_issuer}/protocol/openid-connect/logout?${qs.stringify(params)}` });
}

/** Reports of the runtime to a telemetry service that this BFF does not have: accepted and dropped. */
function discard(r) {
  r.return(204);
}

// --- Permissions (contracts/authz.yaml) ----------------------------------------------------------------------------

/** The permissions of the roles of the user, sorted, and their version (it changes when they change). */
function permissionsOf(r) {
  const file = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
  const byRole = file.roles || {};
  const granted = {};
  for (const role of rolesOf(claims(r))) {
    for (const permission of Array.isArray(byRole[role]) ? byRole[role] : []) granted[permission] = true;
  }
  const permissions = Object.keys(granted).sort();
  const version = crypto.createHash('sha256').update(permissions.join(',')).digest('hex').slice(0, 16);
  return { permissions: permissions, version: version };
}

/** permissionsOf, or a 500 Problem (logged) when the file cannot be read. */
function permissionsOr500(r) {
  try {
    return permissionsOf(r);
  } catch (e) {
    r.error(`cannot read ${PERMISSIONS_FILE}: ${e.message}`);
    problem(r, 500, 'Permissions not available');
    return null;
  }
}

function capabilities(r) {
  if (r.method !== 'GET') return problem(r, 405, 'Method not allowed', { Allow: 'GET' });
  if (!r.args.app) return problem(r, 400, 'The app parameter is missing');
  const granted = permissionsOr500(r);
  if (!granted) return;
  json(r, 200, { permissions: granted.permissions, version: granted.version, ttlSeconds: TTL_SECONDS }, { 'X-Permissions-Version': granted.version });
}

function check(r) {
  if (r.method !== 'POST') return problem(r, 405, 'Method not allowed', { Allow: 'POST' });
  let request;
  try {
    request = JSON.parse(r.requestText || '');
  } catch (e) {
    return problem(r, 400, 'The body is not JSON');
  }
  const checks = request && request.checks;
  if (!Array.isArray(checks)) return problem(r, 400, 'The checks list is missing');
  if (checks.length > MAX_CHECKS) return problem(r, 400, `Too many checks in a batch (at most ${MAX_CHECKS})`);
  for (const item of checks) {
    if (!item || typeof item.permission !== 'string' || !PERMISSION.test(item.permission)) {
      return problem(r, 400, 'Invalid permission: the format is domain.resource.action, lower case');
    }
  }
  const granted = permissionsOr500(r);
  if (!granted) return;
  const results = checks.map((item) => {
    const result = { permission: item.permission, allowed: granted.permissions.includes(item.permission) };
    if (item.resource !== undefined) result.resource = item.resource;
    return result;
  });
  json(r, 200, { results: results }, { 'X-Permissions-Version': granted.version });
}

export default { xsrfSetCookie, csrfRefused, user, login, logout, discard, capabilities, check };
