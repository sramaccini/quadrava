import type { I18n, ScreenRuntime, Scope } from 'core';
import type { FieldDefinition } from 'schema';

/** A value counts as «missing»: null, empty text or empty list. */
export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Error of a simple field, or `null`: required check (checkbox and switch are never required) and the `validate`
 * rule evaluated with `value` and the given scope. A rule that cannot be evaluated makes the field invalid (fail-closed).
 */
export function fieldError(field: FieldDefinition, value: unknown, runtime: ScreenRuntime, scope: Scope, i18n: I18n): string | null {
  const empty = isEmptyValue(value);
  if (field.required && empty && field.type !== 'checkbox' && field.type !== 'switch') return i18n.t('lc.required');
  if (field.validate && !empty) {
    const result = runtime.engine.interpolate(field.validate.rule, { ...runtime.context(scope), value });
    if (!result.ok || result.value !== true) return runtime.text(field.validate.message, scope) || i18n.t('lc.invalid');
  }
  return null;
}

/** Rows of a `repeater` field: always a list of objects. */
export function repeaterRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r)) : [];
}

/** Errors of every cell of a `repeater` field (by row, by field name). The rules see the row in `item`. */
export function repeaterCellErrors(field: FieldDefinition, value: unknown, runtime: ScreenRuntime, scope: Scope, i18n: I18n): Record<string, string>[] {
  return repeaterRows(value).map((item) => {
    const errors: Record<string, string> = {};
    for (const sub of field.fields ?? []) {
      const error = fieldError(sub, item[sub.name], runtime, { ...scope, item }, i18n);
      if (error) errors[sub.name] = error;
    }
    return errors;
  });
}

/** Overall error of a `repeater` field: number of rows and invalid cells. */
export function repeaterError(field: FieldDefinition, value: unknown, runtime: ScreenRuntime, scope: Scope, i18n: I18n): string | null {
  const rows = repeaterRows(value);
  const min = field.minRows ?? 0;
  const max = field.maxRows ?? 50;
  if (field.required && rows.length === 0) return i18n.t('lc.required');
  if (rows.length < min) return i18n.t('lc.minRows', { n: min });
  if (rows.length > max) return i18n.t('lc.maxRows', { n: max });
  return repeaterCellErrors(field, rows, runtime, scope, i18n).some((e) => Object.keys(e).length > 0) ? i18n.t('lc.rowsInvalid') : null;
}
