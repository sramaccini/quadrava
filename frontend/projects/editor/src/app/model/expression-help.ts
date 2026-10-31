import { getIn, isObject, type Json, type Path } from './doc-ops';

/**
 * Help in writing expressions: variables and functions available at a point of the document. The variables
 * depend on the context (in a column there is `row` with the fields of the table, in a form `form` with its fields,
 * in a validation rule `value`…); state and parameters are those already used in the document.
 */

export interface Hint {
  /** Text shown. */
  label: string;
  /** Text inserted in the expression. */
  insert: string;
  kind: 'variable' | 'function';
}

const TABLES = new Set(['table', 'dataTable', 'serverDataTable']);
/** Properties of a table in which expressions see the row. */
const ROW_SCOPES = new Set(['columns', 'rowActions', 'expand']);

const FUNCTIONS: Hint[] = [
  { label: "can('…')", insert: "can('')", kind: 'function' },
  { label: "t('key', 'Text')", insert: "t('', '')", kind: 'function' },
  { label: 'has(…)', insert: 'has()', kind: 'function' },
  { label: 'fmtNumber(…)', insert: 'fmtNumber()', kind: 'function' },
  { label: "fmtCurrency(…, 'EUR')", insert: "fmtCurrency(, 'EUR')", kind: 'function' },
  { label: 'fmtDate(…)', insert: 'fmtDate()', kind: 'function' },
  { label: "plural(n, 'uno', 'molti')", insert: "plural(, '', '')", kind: 'function' },
  { label: "isValid('iban', …)", insert: "isValid('', )", kind: 'function' },
];

/** `settings`: the names of the settings of the project (`settings.<name>` in the expressions). */
export function expressionHints(doc: Json, path: Path, settings: readonly string[] = []): Hint[] {
  const variables = new Set<string>(['user.username', 'user.displayName', 'user.locale', ...settings.map((name) => `settings.${name}`)]);
  const add = (name: string): void => {
    variables.add(name);
  };

  // Context: going down from the root to the point, looking at the nodes crossed.
  for (let i = 0; i < path.length; i++) {
    const value = getIn(doc, path.slice(0, i));
    const next = path[i];
    // In a sequence of steps: the responses of the previous calls with `as`.
    if (Array.isArray(value) && typeof next === 'number') {
      for (const step of value.slice(0, next)) if (isObject(step) && typeof step['call'] === 'string' && typeof step['as'] === 'string') add(step['as']);
    }
    if (!isObject(value)) continue;
    // In the onError steps: the HTTP code of the error.
    if (next === 'onError') add('error.status');
    if (i === 0 && next === 'dataSources') ['search', 'lookupKey', 'word', 'request'].forEach(add);
    if (typeof value['type'] === 'string' && TABLES.has(value['type']) && typeof next === 'string' && ROW_SCOPES.has(next)) {
      fieldsOf(value['columns'], 'field').forEach((f) => add(`row.${f}`));
    }
    if (value['type'] === 'form' && (next === 'actions' || next === 'fields' || next === 'validation')) fieldsOf(value['fields'], 'name').forEach((f) => add(`form.${f}`));
    // The rules of a standalone field see the fields of its validation group in `form`.
    if (value['type'] === 'input' && next === 'field') groupFields(doc, value['group']).forEach((f) => add(`form.${f}`));
    if (next === 'dialog' && isObject(value['dialog'])) fieldsOf(value['dialog']['fields'], 'name').forEach((f) => add(`form.${f}`));
    // In the rules of a field (and of a form, which check the fields they name): the value being checked.
    if (next === 'validate' || next === 'validation' || next === 'messages') add('value');
  }

  // State and parameters already used in the document.
  const strings: string[] = [];
  collectStrings(doc, strings);
  for (const text of strings) {
    if (/^state(\.[A-Za-z][A-Za-z0-9]*)+$/.test(text)) add(text);
    for (const match of text.matchAll(/\b(state|params)(\.[A-Za-z_][A-Za-z0-9_]*)+/g)) add(match[0]);
  }

  const sorted = [...variables].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return [...sorted.map((name) => ({ label: name, insert: name, kind: 'variable' as const })), ...FUNCTIONS];
}

/** The context variables come first: row and form, then state and parameters, then the user. */
function rank(name: string): number {
  const root = name.split('.')[0];
  return ['row', 'form', 'value', 'search', 'lookupKey', 'word', 'request'].includes(root) ? 0 : root === 'state' || root === 'params' ? 1 : 2;
}

/** Names of the standalone fields of a validation group (`default` without one), anywhere in the screen. */
function groupFields(doc: Json, group: Json | undefined): string[] {
  const wanted = typeof group === 'string' ? group : 'default';
  const names: string[] = [];
  const walk = (value: Json): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (isObject(value)) {
      const field = value['field'];
      if (value['type'] === 'input' && (typeof value['group'] === 'string' ? value['group'] : 'default') === wanted && isObject(field) && typeof field['name'] === 'string') names.push(field['name']);
      Object.values(value).forEach(walk);
    }
  };
  walk(doc);
  return names;
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
 * Inserts a text into an expression at the cursor position. An empty field becomes `{{ text }}`.
 * Returns the new value and the cursor position after the insertion.
 */
export function insertHint(value: string, start: number, end: number, text: string): { value: string; caret: number } {
  if (!value.trim()) return { value: `{{ ${text} }}`, caret: 3 + text.length };
  const next = value.slice(0, start) + text + value.slice(end);
  return { value: next, caret: start + text.length };
}

/** Suggestions while typing: where the word to complete starts and the items continuing it. */
export interface Completion {
  /** Position where the typed word starts (to replace with the chosen item). */
  from: number;
  items: Hint[];
}

/** Items shown at most while typing. */
const MAX_COMPLETIONS = 8;

/**
 * Completion at the cursor position: only inside `{{ … }}` and after at least one character of a name (`sta`,
 * `row.cl`, `fmt`). Offers the variables and functions starting with what was typed, without repeating the word
 * already complete; `null` if there is nothing to offer.
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
 * Replaces the typed word with the chosen item. For functions the cursor goes inside the parentheses (or inside the
 * first quoted text: `can('|')`), so one keeps typing the argument.
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
