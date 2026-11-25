// Permissions of the roles, from a JSON file ({ "role": ["domain.resource.action", ...] }), and the answers of
// /authz/capabilities and /authz/check (contracts/authz.yaml).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const PERMISSION = /^[a-z0-9]+\.[a-z0-9]+\.[a-z0-9]+$/;
const MAX_CHECKS = 200;

/**
 * Reads and checks the file of the permissions per role.
 * @param {string} file
 * @returns {Map<string, string[]>}
 */
export function loadRolePermissions(file) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`permissions file ${file}: ${e instanceof Error ? e.message : e}`);
  }
  return rolePermissions(data, file);
}

/**
 * @param {unknown} data
 * @param {string} [source]
 * @returns {Map<string, string[]>}
 */
export function rolePermissions(data, source = 'permissions') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${source}: an object of roles is expected`);
  const roles = new Map();
  for (const [role, list] of Object.entries(data)) {
    if (!Array.isArray(list) || !list.every((p) => typeof p === 'string' && PERMISSION.test(p))) {
      throw new Error(`${source}: the permissions of role "${role}" must be a list in the format domain.resource.action`);
    }
    roles.set(role, [...new Set(list)]);
  }
  return roles;
}

/**
 * The roles of the user that the file knows, and their permissions, sorted, with a version that changes with them.
 * @param {string[]} roles  roles from the token
 * @param {Map<string, string[]>} table
 */
export function grantsFor(roles, table) {
  const known = [...new Set(roles)].filter((r) => table.has(r)).sort();
  const permissions = [...new Set(known.flatMap((r) => table.get(r) ?? []))].sort();
  const version = createHash('sha256').update(permissions.join('\n')).digest('base64url').slice(0, 16);
  return { roles: known, permissions, version };
}

/**
 * The answer of /authz/check, or the reason the request is invalid.
 * @param {unknown} body
 * @param {Set<string>} granted
 * @returns {{ results: { permission: string, resource?: unknown, allowed: boolean }[] } | { invalid: string }}
 */
export function check(body, granted) {
  const checks = /** @type {{ checks?: unknown }} */ (body ?? {}).checks;
  if (!Array.isArray(checks)) return { invalid: 'checks must be a list' };
  if (checks.length > MAX_CHECKS) return { invalid: `at most ${MAX_CHECKS} checks in a batch` };
  const results = [];
  for (const [i, item] of checks.entries()) {
    const { permission, resource } = item ?? {};
    if (typeof permission !== 'string' || !PERMISSION.test(permission)) return { invalid: `check ${i}: permission in the format domain.resource.action expected` };
    if (resource !== undefined && (typeof resource !== 'object' || typeof resource?.type !== 'string' || typeof resource?.id !== 'string')) {
      return { invalid: `check ${i}: resource needs type and id` };
    }
    // The permissions of a role hold for every resource: a finer rule belongs to the service that owns the resource.
    results.push({ permission, ...(resource ? { resource: { type: resource.type, id: resource.id } } : {}), allowed: granted.has(permission) });
  }
  return { results };
}

/**
 * The roles in a claim of the token, at a dotted path such as `realm_access.roles`.
 * @param {Record<string, unknown>} claims
 * @param {string} path
 * @returns {string[]}
 */
export function rolesFromClaims(claims, path) {
  /** @type {unknown} */
  let value = claims;
  for (const key of path.split('.')) value = value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value)[key] : undefined;
  return Array.isArray(value) ? value.filter((r) => typeof r === 'string') : [];
}
