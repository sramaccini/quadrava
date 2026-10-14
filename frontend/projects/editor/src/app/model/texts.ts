import { isObject, type Json, type Path } from './doc-ops';

/**
 * Testi per l'utente di una schermata e chiavi di traduzione. Un testo è «semplice» (non traducibile), una sola
 * traduzione `{{ t('chiave', 'Ripiego') }}` (modificabile qui) oppure un'espressione più complessa (solo da leggere).
 */

/** Proprietà che contengono testo letto dall'utente. */
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
  /** Per `kind: 'key'`: la chiave e il testo di ripiego. */
  key?: string;
  fallback?: string;
  /** Chiavi usate da un'espressione più complessa. */
  keys?: string[];
}

const SINGLE_T = /^\{\{\s*t\(\s*'((?:\\.|[^'\\])*)'\s*(?:,\s*'((?:\\.|[^'\\])*)'\s*)?(?:,\s*\{[\s\S]*\}\s*)?\)\s*\}\}$/;
const ANY_T = /\bt\(\s*'((?:\\.|[^'\\])*)'/g;

/** Tutti i testi per l'utente della schermata, nell'ordine del documento (i data source esclusi). */
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
 * Il testo dentro una stringa CEL tra apici singoli. Gli a capo diventano `\n`: una stringa tra apici non può
 * contenerne di veri (i testi formattati in Markdown ne hanno).
 */
function quote(text: string): string {
  return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + "'";
}

/**
 * Prefisso delle chiavi di una schermata, come negli esempi: l'identificativo con `_` al posto di `-`
 * (`vetrina-layout` → `vetrina_layout`).
 */
export function keyPrefix(screen: string): string {
  return (screen || 'schermata').replace(/-/g, '_');
}

/** Chiave nuova per un testo: prefisso della schermata e le prime parole del testo, unica tra quelle usate. */
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
  const base = `${keyPrefix(screen)}.${slug || 'testo'}`;
  let key = base;
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`;
  return key;
}

/**
 * Il testo semplice reso traducibile: `{{ t('chiave', 'Testo') }}`. I testi con graffe non si convertono (nei messaggi
 * le graffe indicano i parametri): restituisce null.
 */
export function translatable(key: string, text: string): string | null {
  if (/[{}]/.test(text)) return null;
  return `{{ t(${quote(key)}, ${quote(text)}) }}`;
}

/** Tutte le chiavi usate dalla schermata. */
export function usedKeys(entries: TextEntry[]): Set<string> {
  const keys = new Set<string>();
  for (const e of entries) {
    if (e.key) keys.add(e.key);
    e.keys?.forEach((k) => keys.add(k));
  }
  return keys;
}
