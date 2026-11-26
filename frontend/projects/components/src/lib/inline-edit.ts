import { formatValue, type FormatLabels } from 'core';
import type { FieldDefinition } from 'schema';

/** Types of field that an inline form shows as text and opens one at a time; the others stay open controls. */
const INLINE_TYPES: ReadonlySet<FieldDefinition['type']> = new Set(['text', 'number', 'textarea', 'richtext', 'select', 'radio', 'multiselect', 'tags', 'date', 'datetime']);

export function isInlineType(field: FieldDefinition): boolean {
  return INLINE_TYPES.has(field.type);
}

/** Fields edited on several lines: Save and Cancel under them, Ctrl+Enter saves; the others have ✓ and ✕, Enter confirms. */
export function isMultiLine(field: FieldDefinition): boolean {
  return field.type === 'textarea' || field.type === 'richtext';
}

/** The value is empty: nothing, empty text or an empty list. */
export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
}

/**
 * The text of a value in the read view of an inline form: options by their label (from the data, or translated with
 * `optionKeys` / `optionKey`), dates in the format of the language, lists separated by commas. Formatted text (richtext)
 * is drawn by `lc-markdown`, not here.
 */
export function inlineText(field: FieldDefinition, value: unknown, locale: string, labels: FormatLabels, optionLabels: Readonly<Record<string, string>> | null): string {
  if (isEmptyValue(value)) return '';
  const own = (option: unknown): unknown => (optionLabels && typeof option === 'string' && Object.hasOwn(optionLabels, option) ? optionLabels[option] : option);
  const shown = optionLabels ? (Array.isArray(value) ? value.map(own) : own(value)) : value;
  const format = field.type === 'date' || field.type === 'datetime' ? field.type : field.type === 'number' ? 'number' : undefined;
  return formatValue(shown, { format, decimals: field.decimals, valueKey: optionLabels ? undefined : field.optionKey, valueKeys: optionLabels ? undefined : field.optionKeys }, locale, labels).text;
}

/** Two values are the same for an inline save: a confirm without changes closes the editor without running the steps. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}
