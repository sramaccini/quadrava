// Permissions of the roles, from a JSON file, and the answers of /authz/capabilities, /authz/check and /authz/roles
// (contracts/authz.yaml). Each role is a list of permissions ("domain.resource.action"), or an object with them and,
// optionally, a label and the base flag (ADR-28): { "user": { "label": "User", "base": true, "permissions": [...] } }.
// A base role always applies; the others are operational roles, of which the session works as one at a time.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const PERMISSION = /^[a-z0-9]+\.[a-z0-9]+\.[a-z0-9]+$/;
const MAX_CHECKS = 200;

/**
 * @typedef {object} Role
 * @property {string} label        shown to the user, as text; the identifier when the file gives none
 * @property {boolean} base        always applies, never offered as a choice
 * @property {string[]} permissions
 */

/**
 * Reads and checks the file of the permissions per role.
 * @param {string} file
 * @returns {Map<string, Role>}
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
 * @returns {Map<string, Role>}
 */
export function rolePermissions(data, source = 'permissions') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${source}: an object of roles is expected`);
  const roles = new Map();
  for (const [role, entry] of Object.entries(data)) {
    const described = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
    const list = described ? entry.permissions : entry;
    if (!Array.isArray(list) || !list.every((p) => typeof p === 'string' && PERMISSION.test(p))) {
      throw new Error(`${source}: the permissions of role "${role}" must be a list in the format domain.resource.action`);
    }
    if (described && ((entry.label !== undefined && typeof entry.label !== 'string') || (entry.base !== undefined && typeof entry.base !== 'boolean'))) {
      throw new Error(`${source}: role "${role}" needs label as a text and base as true or false`);
    }
    roles.set(role, { label: (described && entry.label) || role, base: described && entry.base === true, permissions: [...new Set(list)] });
  }
  return roles;
}

/**
 * The roles of the user that the file knows and the permissions of a session (ADR-28): without operational roles those
 * of all the roles; with them, those of the base roles plus the active one, which is `wanted` if it is one of them (the
 * last one used), otherwise the first. Sorted, with a version that changes with the permissions and with the role.
 * @param {string[]} roles  roles from the token
 * @param {Map<string, Role>} table
 * @param {string} [wanted]  operational role to work as
 */
export function grantsFor(roles, table, wanted) {
  const known = [...new Set(roles)].filter((r) => table.has(r)).sort();
  const operational = known.filter((r) => !table.get(r)?.base);
  const active = wanted !== undefined && operational.includes(wanted) ? wanted : operational[0];
  const applying = active === undefined ? known : known.filter((r) => r === active || table.get(r)?.base);
  const permissions = [...new Set(applying.flatMap((r) => table.get(r)?.permissions ?? []))].sort();
  const version = createHash('sha256').update([active ?? '', ...permissions].join('\n')).digest('base64url').slice(0, 16);
  return {
    roles: known,
    operationalRoles: operational.map((id) => ({ id, label: table.get(id)?.label ?? id })),
    currentRole: active,
    permissions,
    version,
  };
}

/**
 * The answer of /authz/roles: the roles of the user that the file knows, with their label and base flag.
 * @param {string[]} known  roles of the session, as `grantsFor` gives them
 * @param {Map<string, Role>} table
 */
export function rolesOf(known, table) {
  return known.map((id) => ({ id, label: table.get(id)?.label ?? id, base: table.get(id)?.base ?? false }));
}

/**
 * The answer of /authz/check, or the reason the request is invalid. A `role` in the body is not read: the session
 * answers for its own role.
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
