import { formatValue, type FormatLabels } from 'core';
import type { FieldDefinition } from 'schema';

/**
 * Types of field that an inline form shows as text and opens one at a time. Checkboxes and switches stay controls that
 * save at every change ({@link isToggle}); the other types (file, password, repeater) stay open controls.
 */
const INLINE_TYPES: ReadonlySet<FieldDefinition['type']> = new Set(['text', 'number', 'textarea', 'richtext', 'select', 'radio', 'multiselect', 'tags', 'date', 'datetime', 'lookup']);

export function isInlineType(field: FieldDefinition): boolean {
  return INLINE_TYPES.has(field.type);
}

/** A single choice from a list (select, lookup): in an inline form choosing the value confirms it, with no ✓. */
export function confirmsOnPick(field: FieldDefinition): boolean {
  return field.type === 'select' || field.type === 'lookup';
}

/** Checkbox and switch: in an inline form always drawn as the control, saved at every change. */
export function isToggle(field: FieldDefinition): boolean {
  return field.type === 'checkbox' || field.type === 'switch';
}

/** Fields edited on several lines: Save and Cancel under them, Ctrl+Enter saves; the others have ✓ and ✕, Enter confirms. */
export function isMultiLine(field: FieldDefinition): boolean {
  return field.type === 'textarea' || field.type === 'richtext';
}

/** Types whose empty value is empty text; for the others an emptied value is saved as null. */
const TEXT_TYPES: ReadonlySet<FieldDefinition['type']> = new Set(['text', 'textarea', 'richtext', 'password']);

/** The value a form keeps: an emptied number (and any other non-text field) is null, not empty text. */
export function emptyAsNull(field: FieldDefinition, value: unknown): unknown {
  return value === '' && !TEXT_TYPES.has(field.type) ? null : value;
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
