import type { FieldDefinition } from 'schema';

type Row = Record<string, unknown>;

/** Where the suggestions come from and what they insert (the `suggest` of a text field). */
export type SuggestSpec = NonNullable<FieldDefinition['suggest']>;

export interface Suggestion {
  /** Text inserted. */
  value: string;
  /** Text shown in the list. */
  label: string;
  description: string | null;
}

export interface WordSpan {
  start: number;
  end: number;
  word: string;
}

/** Characters that end a word: spaces, brackets and commas. */
const BOUNDARY = /[\s()[\]{},]/;

/**
 * The word the cursor is in, or at the end of: from the boundary before the cursor to the one after it. An empty
 * word at the start of the text, after a space or between two boundaries.
 */
export function wordAt(text: string, caret: number): WordSpan {
  const at = Math.max(0, Math.min(caret, text.length));
  let start = at;
  while (start > 0 && !BOUNDARY.test(text[start - 1])) start--;
  let end = at;
  while (end < text.length && !BOUNDARY.test(text[end])) end++;
  return { start, end, word: text.slice(start, end) };
}

/**
 * The text with a suggestion in place of the word at the cursor (or of the whole text with `all`), and the position of
 * the cursor right after the inserted text. The suggestion is inserted as it is: a service that wants a space after it
 * includes it.
 */
export function insertSuggestion(text: string, caret: number, value: string, replace: 'word' | 'all' = 'word'): { text: string; caret: number } {
  if (replace === 'all') return { text: value, caret: value.length };
  const { start, end } = wordAt(text, caret);
  return { text: text.slice(0, start) + value + text.slice(end), caret: start + value.length };
}

/**
 * The suggestions in the response of the data source (a list, or `items`): rows without a value are left out, and so are
 * values already listed. Texts from the data are shown as they are.
 */
export function suggestionsOf(data: unknown, spec: SuggestSpec): Suggestion[] {
  const rows = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const row of rows as unknown[]) {
    if (row === null || typeof row !== 'object') continue;
    const r = row as Row;
    const value = textOf(r[spec.valueField ?? 'value']);
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    const description = spec.descriptionField ? textOf(r[spec.descriptionField]) : '';
    out.push({ value, label: (spec.labelField && textOf(r[spec.labelField])) || value, description: description || null });
  }
  return out;
}

function textOf(value: unknown): string {
  return value === null || value === undefined || typeof value === 'object' ? '' : String(value);
}
