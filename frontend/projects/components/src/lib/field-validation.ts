import type { I18n, ScreenRuntime, Scope } from 'core';
import type { FieldDefinition } from 'schema';

/** Un valore conta come «mancante»: nullo, testo vuoto o elenco vuoto. */
export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Errore di un campo semplice, oppure `null`: obbligatorietà (checkbox e switch non sono mai obbligatori) e regola
 * `validate` valutata con `value` e lo scope dato. Una regola che non si può valutare rende il campo non valido (fail-closed).
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

/** Righe di un campo `repeater`: sempre un elenco di oggetti. */
export function repeaterRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r)) : [];
}

/** Errori di ogni cella di un campo `repeater` (per riga, per nome del campo). Le regole vedono la riga in `item`. */
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

/** Errore complessivo di un campo `repeater`: numero di righe e celle non valide. */
export function repeaterError(field: FieldDefinition, value: unknown, runtime: ScreenRuntime, scope: Scope, i18n: I18n): string | null {
  const rows = repeaterRows(value);
  const min = field.minRows ?? 0;
  const max = field.maxRows ?? 50;
  if (field.required && rows.length === 0) return i18n.t('lc.required');
  if (rows.length < min) return i18n.t('lc.minRows', { n: min });
  if (rows.length > max) return i18n.t('lc.maxRows', { n: max });
  return repeaterCellErrors(field, rows, runtime, scope, i18n).some((e) => Object.keys(e).length > 0) ? i18n.t('lc.rowsInvalid') : null;
}
