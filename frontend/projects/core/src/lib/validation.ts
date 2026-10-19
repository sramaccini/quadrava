import type { FieldDefinition, FlatConstraint, FormValidationRule, TextTransform, ValidationRule } from 'schema';
import type { I18n } from './i18n';
import type { ScreenRuntime } from './screen-runtime';
import type { Scope } from './types';
import { compilePattern, duplicateRows, InvalidValidatorParams, isEmptyValue, type ValidatorDescriptor, type ValidatorRegistry } from './validators';

/**
 * Validation engine (ADR-15): the flat constraints of a field, its `validate` rule and its `validation` list become one
 * list of rules, checked in order with the registered validators. Fail-closed: a rule that cannot be checked makes the
 * field invalid and is reported once, never with the value.
 */

/** A rule ready to be checked. */
export interface CompiledRule {
  /** Name of the validator, or `rule` for a CEL rule. */
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** Some parameter holds an expression: they are resolved at every check. */
  readonly dynamic: boolean;
  /** For CEL rules: the condition that must be true. */
  readonly rule?: string;
  readonly message?: string;
  readonly when?: string;
  readonly severity: 'error' | 'warning';
}

/** Outcome of the check of a field: an error blocks, a warning only informs (shown when there is no error). */
export interface FieldCheck {
  readonly error: string | null;
  readonly warning: string | null;
}

export const NO_PROBLEM: FieldCheck = { error: null, warning: null };

/** Where a field is checked. */
export interface ValidationEnv {
  readonly runtime: ScreenRuntime;
  readonly i18n: I18n;
  /** Scope of the expressions (with `form`, or `item` in the rows of a repeater); `value` is added for every check. */
  readonly scope: Scope;
  /** Values of the fields next to the checked one: the form, or the row of a repeater. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Readable label of a field of `values`. */
  label(name: string): string;
}

/** Keys of the rules named by their own constraint (`{ "minLength": 3 }`); the others are `format`, `use` and `rule`. */
const KEYED = ['required', 'minLength', 'maxLength', 'pattern', 'min', 'max', 'step', 'decimals', 'integer', 'minDate', 'maxDate', 'sameAs', 'after', 'before', 'atLeastOne', 'unique'];
const META = new Set(['message', 'when', 'severity', 'fields']);

function hasExpression(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('{{');
  if (Array.isArray(value)) return value.some(hasExpression);
  return value !== null && typeof value === 'object' && Object.values(value).some(hasExpression);
}

/** A rule of a `validation` list. */
export function compileRule(rule: ValidationRule): CompiledRule {
  // A rule that is not an object (a definition still being written in the editor) names no validator: fail-closed.
  if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) return { name: 'unknown', params: {}, dynamic: false, severity: 'error' };
  const base = { message: rule.message, when: rule.when, severity: rule.severity === 'warning' ? ('warning' as const) : ('error' as const) };
  if (rule.rule !== undefined) return { name: 'rule', rule: rule.rule, params: {}, dynamic: false, ...base };
  const rest = Object.fromEntries(Object.entries(rule).filter(([key]) => !META.has(key)));
  let name: string;
  let params: Record<string, unknown>;
  if (rule.use !== undefined) {
    name = rule.use;
    params = rule.params ?? {};
  } else if (rule.format !== undefined) {
    name = rule.format;
    params = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'format'));
  } else {
    // Not a known key: the first one names an unknown validator, and the field fails closed.
    name = KEYED.find((key) => key in rest) ?? Object.keys(rest)[0] ?? 'unknown';
    params = rest;
  }
  return { name, params, dynamic: hasExpression(params), ...base };
}

const fieldCache = new WeakMap<FieldDefinition, readonly CompiledRule[]>();

/** The rules of a field, in order: flat constraints, `validate`, `validation`. Compiled once per definition. */
export function fieldRules(field: FieldDefinition): readonly CompiledRule[] {
  // A definition that is not an object (being written in the editor) has no rules; the schema reports it.
  if (field === null || typeof field !== 'object') return [];
  let rules = fieldCache.get(field);
  if (rules) return rules;
  const list: CompiledRule[] = [];
  const add = (constraint: FlatConstraint, name: string, params: Record<string, unknown>): void => {
    list.push({ name, params, dynamic: hasExpression(params), message: field.messages?.[constraint], severity: 'error' });
  };
  // Checkbox and switch are never required (a box that must be ticked is a rule: {{value == true}}).
  if (field.required && field.type !== 'checkbox' && field.type !== 'switch') add('required', 'required', {});
  for (const key of ['minLength', 'maxLength', 'pattern'] as const) if (field[key] !== undefined) add(key, key, { [key]: field[key] });
  if (field.format) add('format', field.format, field.country !== undefined ? { country: field.country } : {});
  for (const key of ['min', 'max'] as const) if (field[key] !== undefined) add(key, key, { [key]: field[key] });
  if (field.step !== undefined) add('step', 'step', field.min !== undefined ? { step: field.step, min: field.min } : { step: field.step });
  if (field.decimals !== undefined) add('decimals', 'decimals', { decimals: field.decimals });
  if (field.integer) add('integer', 'integer', {});
  for (const key of ['minDate', 'maxDate'] as const) if (field[key] !== undefined) add(key, key, { [key]: field[key] });
  if (field.validate) list.push({ name: 'rule', rule: field.validate.rule, message: field.validate.message, params: {}, dynamic: false, severity: 'error' });
  if (Array.isArray(field.validation)) for (const rule of field.validation) list.push(compileRule(rule));
  rules = list;
  fieldCache.set(field, rules);
  return rules;
}

const formCache = new WeakMap<readonly FormValidationRule[], ReadonlyMap<string, readonly CompiledRule[]>>();

/** The rules of a form across its fields, by the field they check (`fields`, or the fields of `atLeastOne`). */
export function formRules(rules: readonly FormValidationRule[] | undefined): ReadonlyMap<string, readonly CompiledRule[]> {
  if (!Array.isArray(rules)) return new Map();
  let byField = formCache.get(rules);
  if (byField) return byField;
  const map = new Map<string, CompiledRule[]>();
  for (const rule of rules) {
    const compiled = compileRule(rule);
    const targets = rule?.fields ?? rule?.atLeastOne;
    for (const target of Array.isArray(targets) ? targets : []) map.set(String(target), [...(map.get(String(target)) ?? []), compiled]);
  }
  byField = map;
  formCache.set(rules, byField);
  return byField;
}

const TRANSFORMS: Record<TextTransform, (text: string) => string> = {
  trim: (text) => text.trim(),
  uppercase: (text) => text.toUpperCase(),
  lowercase: (text) => text.toLowerCase(),
  removeSpaces: (text) => text.replace(/\s+/g, ''),
};

/** The value after the `transform` of the field (texts only; the rest as it is). */
export function transformValue(field: FieldDefinition, value: unknown): unknown {
  if (typeof value !== 'string' || !Array.isArray(field?.transform)) return value;
  return field.transform.reduce((text, name) => TRANSFORMS[name]?.(text) ?? text, value);
}

/** Problems already reported, by runtime: a broken rule is reported once, not at every check. */
const reported = new WeakMap<ScreenRuntime, Set<string>>();

/** A rule that cannot be checked: reported once (field, rule, reason; never the value) and the field is invalid. */
function misconfigured(field: Pick<FieldDefinition, 'name'>, rule: CompiledRule, reason: string, env: ValidationEnv): string {
  const seen = reported.get(env.runtime) ?? new Set<string>();
  reported.set(env.runtime, seen);
  const key = `${field.name}/${rule.name}/${reason}`;
  if (!seen.has(key)) {
    seen.add(key);
    env.runtime.report(`validation ${field.name}.${rule.name}`, reason);
  }
  return env.i18n.t('lc.invalid');
}

function messageOf(rule: CompiledRule, key: string, params: Record<string, unknown>, scope: Scope, env: ValidationEnv): string {
  return (rule.message !== undefined ? env.runtime.text(rule.message, scope) : '') || env.i18n.t(key, params);
}

/** The validator of a rule for this field, or the reason why it cannot be used. */
function validatorFor(rule: CompiledRule, field: Pick<FieldDefinition, 'type'>, registry: ValidatorRegistry): ValidatorDescriptor | string {
  const validator = registry.get(rule.name);
  if (!validator) return 'unknown validator';
  if (validator.appliesTo && !validator.appliesTo.includes(field.type)) return `not for ${field.type} fields`;
  return validator;
}

/** The rule applies (no condition, a true one, or one that cannot be evaluated: fail-closed keeps the rule). */
function applies(rule: CompiledRule, scope: Scope, env: ValidationEnv): boolean {
  return rule.when === undefined || env.runtime.engine.evaluateCondition(rule.when, env.runtime.context(scope), { whenMissing: true, fallback: true });
}

/** The message of a rule not met, or null. */
function runRule(rule: CompiledRule, field: Pick<FieldDefinition, 'name' | 'type'>, value: unknown, env: ValidationEnv): string | null {
  const scope: Scope = { ...env.scope, value };
  const empty = isEmptyValue(value);
  if (rule.name === 'rule') {
    // As before: a CEL rule checks only a filled-in field. A rule that cannot be evaluated does not pass.
    if (empty || !applies(rule, scope, env)) return null;
    const result = env.runtime.engine.interpolate(rule.rule!, env.runtime.context(scope));
    return result.ok && result.value === true ? null : messageOf(rule, 'lc.invalid', {}, scope, env);
  }
  const validator = validatorFor(rule, field, env.runtime.validatorRegistry);
  if (typeof validator === 'string') return misconfigured(field, rule, validator, env);
  if ((empty && !validator.checksEmpty) || !applies(rule, scope, env)) return null;
  const params = rule.dynamic ? (env.runtime.resolveValue(rule.params, scope) as Record<string, unknown>) : rule.params;
  let failure;
  try {
    failure = validator.validate(value, params ?? {}, { values: env.values, label: (name) => env.label(name) });
  } catch (e) {
    return misconfigured(field, rule, e instanceof InvalidValidatorParams ? `invalid parameters: ${e.message}` : 'the validator failed', env);
  }
  return failure ? messageOf(rule, validator.messageKey ?? `lc.validation.${validator.name}`, failure.params ?? {}, scope, env) : null;
}

/** Checks the rules in order: the first error wins; otherwise the first warning. */
export function checkRules(rules: readonly CompiledRule[], field: Pick<FieldDefinition, 'name' | 'type'>, value: unknown, env: ValidationEnv): FieldCheck {
  let warning: string | null = null;
  for (const rule of rules) {
    if (rule.severity === 'warning' && warning !== null) continue;
    const problem = runRule(rule, field, value, env);
    if (problem === null) continue;
    if (rule.severity === 'error') return { error: problem, warning: null };
    warning = problem;
  }
  return warning === null ? NO_PROBLEM : { error: null, warning };
}

/** Checks a field (its value after `transform`), with the rules of the form that concern it. */
export function checkField(field: FieldDefinition, value: unknown, env: ValidationEnv, extra: readonly CompiledRule[] = []): FieldCheck {
  const rules = extra.length ? [...fieldRules(field), ...extra] : fieldRules(field);
  return rules.length ? checkRules(rules, field, transformValue(field, value), env) : NO_PROBLEM;
}

/** The field is required now: `required`, or a `required` rule whose condition holds (for the asterisk of the label). */
export function isRequired(field: FieldDefinition, env: ValidationEnv, extra: readonly CompiledRule[] = []): boolean {
  if (field.required && field.type !== 'checkbox' && field.type !== 'switch') return true;
  const scope: Scope = { ...env.scope, value: env.values[field.name] ?? null };
  return [...fieldRules(field), ...extra].some((rule) => rule.name === 'required' && rule.severity === 'error' && applies(rule, scope, env));
}

/** Keyboard and autocomplete of the text box: those of the first validator of the field that has some. */
export function inputHints(field: FieldDefinition, registry: ValidatorRegistry): NonNullable<ValidatorDescriptor['hints']> {
  for (const rule of fieldRules(field)) {
    const hints = registry.get(rule.name)?.hints;
    if (hints) return hints;
  }
  return {};
}

/**
 * Cells of a repeater whose value repeats in another row, for every `unique` rule of the field that applies: by row,
 * the message by column.
 */
export function uniqueCellErrors(field: FieldDefinition, rows: unknown, env: ValidationEnv): Map<number, Record<string, string>> {
  const errors = new Map<number, Record<string, string>>();
  const scope: Scope = { ...env.scope, value: rows };
  for (const rule of fieldRules(field)) {
    if (rule.name !== 'unique' || rule.severity !== 'error' || typeof rule.params['unique'] !== 'string' || !applies(rule, scope, env)) continue;
    const column = rule.params['unique'];
    const message = messageOf(rule, 'lc.validation.uniqueCell', {}, scope, env);
    for (const row of duplicateRows(rows, column)) errors.set(row, { [column]: message, ...errors.get(row) });
  }
  return errors;
}


/**
 * Static check of the `pattern` constraints of a screen (fields and validation rules): the ones that do not compile with
 * the `u` flag, or are too long. Used by the editor; it runs nothing.
 */
export function checkScreenPatterns(document: unknown): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}/${i}`));
    } else if (value !== null && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        // messages.pattern is the text of the message, not an expression.
        if (key === 'messages') continue;
        if (key === 'pattern' && typeof v === 'string' && !compilePattern(v)) issues.push({ path: `${path}/pattern`, message: 'the pattern is not a valid regular expression (Unicode, at most 500 characters)' });
        else walk(v, `${path}/${key}`);
      }
    }
  };
  walk(document, '');
  return issues;
}
