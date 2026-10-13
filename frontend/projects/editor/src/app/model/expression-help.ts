import { getIn, isObject, type Json, type Path } from './doc-ops';

/**
 * Aiuto alla scrittura delle espressioni: variabili e funzioni disponibili in un punto del documento. Le variabili
 * dipendono dal contesto (in una colonna c'è `row` con i campi della tabella, in un form `form` con i suoi campi,
 * in una regola di validazione `value`…); lo stato e i parametri sono quelli già usati nel documento.
 */

export interface Hint {
  /** Testo mostrato. */
  label: string;
  /** Testo inserito nell'espressione. */
  insert: string;
  kind: 'variable' | 'function';
}

const TABLES = new Set(['table', 'dataTable', 'serverDataTable']);
/** Proprietà di una tabella in cui le espressioni vedono la riga. */
const ROW_SCOPES = new Set(['columns', 'rowActions', 'expand']);

const FUNCTIONS: Hint[] = [
  { label: "can('…')", insert: "can('')", kind: 'function' },
  { label: "t('chiave', 'Testo')", insert: "t('', '')", kind: 'function' },
  { label: 'has(…)', insert: 'has()', kind: 'function' },
  { label: 'fmtNumber(…)', insert: 'fmtNumber()', kind: 'function' },
  { label: "fmtCurrency(…, 'EUR')", insert: "fmtCurrency(, 'EUR')", kind: 'function' },
  { label: 'fmtDate(…)', insert: 'fmtDate()', kind: 'function' },
  { label: "plural(n, 'uno', 'molti')", insert: "plural(, '', '')", kind: 'function' },
];

export function expressionHints(doc: Json, path: Path): Hint[] {
  const variables = new Set<string>(['user.username', 'user.displayName', 'user.locale']);
  const add = (name: string): void => {
    variables.add(name);
  };

  // Contesto: si scende dalla radice al punto, guardando i nodi attraversati.
  for (let i = 0; i < path.length; i++) {
    const value = getIn(doc, path.slice(0, i));
    const next = path[i];
    if (!isObject(value)) continue;
    if (i === 0 && next === 'dataSources') ['search', 'lookupKey', 'request'].forEach(add);
    if (typeof value['type'] === 'string' && TABLES.has(value['type']) && typeof next === 'string' && ROW_SCOPES.has(next)) {
      fieldsOf(value['columns'], 'field').forEach((f) => add(`row.${f}`));
    }
    if (value['type'] === 'form' && (next === 'actions' || next === 'fields')) fieldsOf(value['fields'], 'name').forEach((f) => add(`form.${f}`));
    if (next === 'dialog' && isObject(value['dialog'])) fieldsOf(value['dialog']['fields'], 'name').forEach((f) => add(`form.${f}`));
    if (next === 'validate') add('value');
  }

  // Stato e parametri già usati nel documento.
  const strings: string[] = [];
  collectStrings(doc, strings);
  for (const text of strings) {
    if (/^state(\.[A-Za-z][A-Za-z0-9]*)+$/.test(text)) add(text);
    for (const match of text.matchAll(/\b(state|params)(\.[A-Za-z_][A-Za-z0-9_]*)+/g)) add(match[0]);
  }

  const sorted = [...variables].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return [...sorted.map((name) => ({ label: name, insert: name, kind: 'variable' as const })), ...FUNCTIONS];
}

/** Le variabili del contesto vengono prima: riga e form, poi stato e parametri, poi l'utente. */
function rank(name: string): number {
  const root = name.split('.')[0];
  return ['row', 'form', 'value', 'search', 'lookupKey', 'request'].includes(root) ? 0 : root === 'state' || root === 'params' ? 1 : 2;
}

function fieldsOf(list: Json | undefined, key: string): string[] {
  return Array.isArray(list) ? list.map((item) => (isObject(item) && typeof item[key] === 'string' ? item[key] : '')).filter(Boolean) : [];
}

function collectStrings(value: Json, into: string[]): void {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, into));
  else if (isObject(value)) Object.values(value).forEach((v) => collectStrings(v, into));
}

/**
 * Inserisce un testo in un'espressione alla posizione del cursore. Un campo vuoto diventa `{{ testo }}`.
 * Restituisce il nuovo valore e la posizione del cursore dopo l'inserimento.
 */
export function insertHint(value: string, start: number, end: number, text: string): { value: string; caret: number } {
  if (!value.trim()) return { value: `{{ ${text} }}`, caret: 3 + text.length };
  const next = value.slice(0, start) + text + value.slice(end);
  return { value: next, caret: start + text.length };
}

/** Suggerimenti mentre si scrive: dove comincia la parola da completare e le voci che la continuano. */
export interface Completion {
  /** Posizione in cui comincia la parola scritta (da sostituire con la voce scelta). */
  from: number;
  items: Hint[];
}

/** Voci mostrate al massimo mentre si scrive. */
const MAX_COMPLETIONS = 8;

/**
 * Completamento alla posizione del cursore: solo dentro `{{ … }}` e dopo almeno un carattere di un nome (`sta`,
 * `row.cl`, `fmt`). Propone le variabili e le funzioni che cominciano con quanto scritto, senza ripetere la parola
 * già completa; `null` se non c'è niente da proporre.
 */
export function completionAt(value: string, caret: number, hints: Hint[]): Completion | null {
  const before = value.slice(0, caret);
  const open = before.lastIndexOf('{{');
  if (open < 0 || before.indexOf('}}', open) >= 0) return null;
  const word = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(before.slice(open + 2))?.[0];
  if (!word) return null;
  const items = hints.filter((h) => h.insert.startsWith(word) && h.insert !== word).slice(0, MAX_COMPLETIONS);
  return items.length ? { from: caret - word.length, items } : null;
}

/**
 * Sostituisce la parola scritta con la voce scelta. Per le funzioni il cursore va dentro le parentesi (o dentro il
 * primo testo tra apici: `can('|')`), così si continua a scrivere l'argomento.
 */
export function applyCompletion(value: string, from: number, caret: number, hint: Hint): { value: string; caret: number } {
  const next = value.slice(0, from) + hint.insert + value.slice(caret);
  let offset = hint.insert.length;
  if (hint.kind === 'function') {
    const quote = hint.insert.indexOf("''");
    const paren = hint.insert.indexOf('(');
    offset = quote >= 0 ? quote + 1 : paren >= 0 ? paren + 1 : offset;
  }
  return { value: next, caret: from + offset };
}
