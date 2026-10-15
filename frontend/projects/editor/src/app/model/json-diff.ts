import type { Json } from './doc-ops';

/** A difference between two documents: where (JSON Pointer) and the two values, as short text. */
export interface JsonChange {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: string;
  after?: string;
}

/** Differences shown at most: beyond that, the comparison stops and says so. */
export const MAX_CHANGES = 100;

/**
 * Differences between two JSON documents, in document order. Objects are compared key by key and lists
 * position by position (an element inserted in the middle shows as several changes: fine to see what changes,
 * it does not claim to be a minimal diff). Values are reported as shortened JSON, always and only as text.
 */
export function jsonDiff(before: Json | undefined, after: Json | undefined, limit = MAX_CHANGES): { changes: JsonChange[]; truncated: boolean } {
  const changes: JsonChange[] = [];
  let truncated = false;
  const push = (change: JsonChange): boolean => {
    if (changes.length >= limit) {
      truncated = true;
      return false;
    }
    changes.push(change);
    return true;
  };
  const visit = (a: Json | undefined, b: Json | undefined, path: string): boolean => {
    if (a === undefined && b === undefined) return true;
    if (a === undefined) return push({ path: path || '/', kind: 'added', after: short(b) });
    if (b === undefined) return push({ path: path || '/', kind: 'removed', before: short(a) });
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (!visit(a[i], b[i], `${path}/${i}`)) return false;
      return true;
    }
    if (isObject(a) && isObject(b)) {
      const keys = [...Object.keys(a), ...Object.keys(b).filter((k) => !(k in a))];
      for (const key of keys) if (!visit(a[key], b[key], `${path}/${escape(key)}`)) return false;
      return true;
    }
    return JSON.stringify(a) === JSON.stringify(b) ? true : push({ path: path || '/', kind: 'changed', before: short(a), after: short(b) });
  };
  visit(before, after, '');
  return { changes, truncated };
}

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Key in a JSON Pointer (RFC 6901). */
function escape(key: string): string {
  return key.replaceAll('~', '~0').replaceAll('/', '~1');
}

function short(value: Json | undefined): string {
  const text = JSON.stringify(value) ?? '';
  return text.length > 80 ? text.slice(0, 79) + '…' : text;
}
