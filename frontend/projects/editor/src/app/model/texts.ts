import { isObject, type Json, type Path } from './doc-ops';

/**
 * User-facing texts of a screen and translation keys. A text is «plain» (not translatable), a single
 * translation `{{ t('key', 'Fallback') }}` (editable here) or a more complex expression (read only).
 */

/** Properties containing text read by the user. */
export const TEXT_PROPERTIES = new Set([
  'label',
  'title',
  'text',
  'description',
  'tooltip',
  'toast',
  'confirm',
  'message',
  'addLabel',
  'nextLabel',
  'backLabel',
  'caption',
]);

export interface TextEntry {
  path: Path;
  property: string;
  value: string;
  kind: 'plain' | 'key' | 'expression';
  /** For `kind: 'key'`: the key and the fallback text. */
  key?: string;
  fallback?: string;
  /** Keys used by a more complex expression. */
  keys?: string[];
}

const SINGLE_T = /^\{\{\s*t\(\s*'((?:\\.|[^'\\])*)'\s*(?:,\s*'((?:\\.|[^'\\])*)'\s*)?(?:,\s*\{[\s\S]*\}\s*)?\)\s*\}\}$/;
const ANY_T = /\bt\(\s*'((?:\\.|[^'\\])*)'/g;

/** All the user-facing texts of the screen, in document order (data sources excluded). */
export function collectTexts(doc: Json): TextEntry[] {
  const out: TextEntry[] = [];
  const visit = (value: Json, path: Path): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, [...path, i]));
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (path.length === 0 && key === 'dataSources') continue;
      if (typeof child === 'string' && TEXT_PROPERTIES.has(key) && child.trim()) out.push(describe(child, [...path, key], key));
      else visit(child, [...path, key]);
    }
  };
  visit(doc, []);
  return out;
}

function describe(value: string, path: Path, property: string): TextEntry {
  if (!value.includes('{{')) return { path, property, value, kind: 'plain' };
  const single = SINGLE_T.exec(value.trim());
  if (single) return { path, property, value, kind: 'key', key: unescape(single[1]), fallback: single[2] !== undefined ? unescape(single[2]) : undefined };
  const keys = [...value.matchAll(ANY_T)].map((m) => unescape(m[1]));
  return { path, property, value, kind: 'expression', keys };
}

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t' };

function unescape(text: string): string {
  return text.replace(/\\(.)/g, (_, c: string) => ESCAPES[c] ?? c);
}

/**
 * The text inside a single-quoted CEL string. Line breaks become `\n`: a quoted string cannot
 * contain real ones (texts formatted in Markdown have them).
 */
function quote(text: string): string {
  return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + "'";
}

/**
 * Prefix of the keys of a screen, as in the examples: the identifier with `_` instead of `-`
 * (`showcase-layout` → `showcase_layout`).
 */
export function keyPrefix(screen: string): string {
  return (screen || 'screen').replace(/-/g, '_');
}

/** New key for a text: prefix of the screen and the first words of the text, unique among those used. */
export function makeKey(screen: string, text: string, used: Set<string>): string {
  const words = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  let slug = '';
  for (const word of words) {
    if ((slug + '_' + word).length > 32 && slug) break;
    slug = slug ? `${slug}_${word}` : word;
  }
  const base = `${keyPrefix(screen)}.${slug || 'text'}`;
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

/**
 * The plain text made translatable: `{{ t('key', 'Text') }}`. Texts with braces are not converted (in messages
 * braces mark the parameters): returns null.
 */
export function translatable(key: string, text: string): string | null {
  if (/[{}]/.test(text)) return null;
  return `{{ t(${quote(key)}, ${quote(text)}) }}`;
}

/** All the keys used by the screen. */
export function usedKeys(entries: TextEntry[]): Set<string> {
  const keys = new Set<string>();
  for (const e of entries) {
    if (e.key) keys.add(e.key);
    e.keys?.forEach((k) => keys.add(k));
  }
  return keys;
}
