import { checkField, uniqueCellErrors, type CompiledRule, type FieldCheck, type I18n, type ScreenRuntime, type Scope, type ValidationEnv } from 'core';
import type { FieldDefinition } from 'schema';

/**
 * Where fields are checked: the runtime, the scope of the expressions, the values next to the field (the form, or the
 * row of a repeater) and the labels of `fields`, used by the messages of the rules across fields.
 */
export function validationEnv(runtime: ScreenRuntime, i18n: I18n, scope: Scope, values: Record<string, unknown>, fields: readonly FieldDefinition[]): ValidationEnv {
  return {
    runtime,
    i18n,
    scope,
    values,
    label: (name) => {
      const field = Array.isArray(fields) ? fields.find((f) => f?.name === name) : undefined;
      return field ? runtime.text(field.label, scope) || field.name : name;
    },
  };
}

/** Rows of a `repeater` field: always a list of objects. */
export function repeaterRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r)) : [];
}

/**
 * Problems of every cell of a `repeater` field (by row, by field name): the rules of the cells, which see the row in
 * `item` and compare it with the other cells of the same row, and the `unique` rules of the field.
 */
export function repeaterCellChecks(field: FieldDefinition, value: unknown, env: ValidationEnv): Record<string, FieldCheck>[] {
  const rows = repeaterRows(value);
  const repeated = uniqueCellErrors(field, rows, env);
  const fields = Array.isArray(field.fields) ? field.fields : [];
  return rows.map((item, i) => {
    const cellEnv = validationEnv(env.runtime, env.i18n, { ...env.scope, item }, item, fields);
    const checks: Record<string, FieldCheck> = {};
    for (const sub of fields) {
      const own = checkField(sub, item[sub.name], cellEnv);
      const duplicate = repeated.get(i)?.[sub.name];
      const result = !own.error && duplicate ? { error: duplicate, warning: null } : own;
      if (result.error || result.warning) checks[sub.name] = result;
    }
    return checks;
  });
}

/**
 * Problem of a field, `extra` being the rules of the form that concern it. For a `repeater`: required, number of rows,
 * its own rules, then the invalid cells.
 */
export function checkValue(field: FieldDefinition, value: unknown, env: ValidationEnv, extra: readonly CompiledRule[] = []): FieldCheck {
  if (field.type !== 'repeater') return checkField(field, value, env, extra);
  const rows = repeaterRows(value);
  const own = checkField(field, rows, env, extra);
  if (own.error && rows.length === 0) return own;
  const min = field.minRows ?? 0;
  const max = field.maxRows ?? 50;
  if (rows.length < min) return { error: env.i18n.t('lc.minRows', { n: min }), warning: null };
  if (rows.length > max) return { error: env.i18n.t('lc.maxRows', { n: max }), warning: null };
  if (own.error) return own;
  if (repeaterCellChecks(field, rows, env).some((cells) => Object.values(cells).some((c) => c.error))) return { error: env.i18n.t('lc.rowsInvalid'), warning: null };
  return own;
}
