import { inject, Injectable, InjectionToken, type Provider } from '@angular/core';
import type { FieldDefinition } from 'schema';
import { FORMAT_COUNTRIES, isAlphanumeric, isBic, isCompanyId, isEmail, isIban, isPhone, isPostalCode, isTaxCode, isUrl, isUuid, isVatNumber } from './formats';

export type FieldType = FieldDefinition['type'];

/** What a validator knows besides the value: the fields next to it (the form, or the row of a repeater). */
export interface ValidatorContext {
  /** Values of the fields next to the checked one, itself included. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Readable label of a field of `values`, for the messages. */
  label(name: string): string;
}

/** A value that does not pass: the parameters fill the message (`{min}`, `{date, date}`…). Never the value itself. */
export interface ValidationFailure {
  readonly params?: Record<string, unknown>;
}

/**
 * A validator: a pure check registered by name, used by the fields (`format`, flat constraints, `validation` rules),
 * by expressions (`isValid(name, value, params)`) and by the editor. The parameters are those of the rule: for a
 * keyed rule such as `{ "minLength": 3 }` they include the key itself (`params.minLength`).
 */
export interface ValidatorDescriptor {
  readonly name: string;
  /** Field types it can check (all if absent). Used elsewhere, the field is invalid and the problem is reported. */
  readonly appliesTo?: readonly FieldType[];
  /** Translation key of the default message (`lc.validation.<name>` if absent). */
  readonly messageKey?: string;
  /** It also checks empty values (`required`, `atLeastOne`); the others pass on an empty field. */
  readonly checksEmpty?: boolean;
  /** Keyboard and autocomplete of the text box (HTML `inputmode` and `autocomplete`). */
  readonly hints?: { readonly inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal'; readonly autocomplete?: string };
  /**
   * Null if the value is valid, otherwise a failure. Parameters that make no sense (a missing limit, a country not
   * supported) are a mistake of the definition: throw `InvalidValidatorParams`, never with the value in the message.
   */
  validate(value: unknown, params: Readonly<Record<string, unknown>>, context: ValidatorContext): ValidationFailure | null;
}

/** Parameters of a rule that a validator cannot use: the field becomes invalid and the reason is reported. */
export class InvalidValidatorParams extends Error {}

/** A value counts as «missing»: null, empty text or empty list. */
export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

const FAIL: ValidationFailure = {};
const TEXT: readonly FieldType[] = ['text', 'textarea', 'richtext'];
const PLAIN_TEXT: readonly FieldType[] = ['text', 'textarea'];
const NUMBER: readonly FieldType[] = ['number'];
const DATES: readonly FieldType[] = ['date', 'datetime'];

/** A numeric parameter, or an error of the definition. */
function numberParam(params: Readonly<Record<string, unknown>>, name: string, check: (n: number) => boolean = Number.isFinite): number {
  const n = params[name];
  if (typeof n !== 'number' || !check(n)) throw new InvalidValidatorParams(`${name} must be a valid number`);
  return n;
}

function textParam(params: Readonly<Record<string, unknown>>, name: string): string {
  const text = params[name];
  if (typeof text !== 'string' || text === '') throw new InvalidValidatorParams(`${name} is missing`);
  return text;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

function dateParam(params: Readonly<Record<string, unknown>>, name: string): string {
  const date = params[name];
  if (typeof date !== 'string' || !ISO_DATE.test(date)) throw new InvalidValidatorParams(`${name} must be a date YYYY-MM-DD`);
  return date;
}

/** Compares two ISO dates, also of different precision (a day against a day and time): on the common part. */
function compareDates(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  const x = a.slice(0, length);
  const y = b.slice(0, length);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Length in Unicode characters (an emoji counts as one). */
const length = (value: unknown): number => [...String(value)].length;

const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Regular expressions of the definitions, compiled once (Unicode, anchored to the whole value). */
const patterns = new Map<string, RegExp | null>();
const MAX_PATTERN = 500;
/** Longer values are not tested against a pattern from the JSON (they do not match): a bound on slow expressions. */
export const MAX_PATTERN_INPUT = 1000;

/** The expression of a `pattern`, or null if it does not compile (or is too long). */
export function compilePattern(pattern: string): RegExp | null {
  let compiled = patterns.get(pattern);
  if (compiled === undefined) {
    try {
      compiled = pattern.length > MAX_PATTERN ? null : new RegExp(`^(?:${pattern})$`, 'u');
    } catch {
      compiled = null;
    }
    if (patterns.size >= 500) patterns.delete(patterns.keys().next().value!);
    patterns.set(pattern, compiled);
  }
  return compiled;
}

/** A format: a check of the text, with its hints for the text box. */
function format(name: string, check: (text: string) => boolean, hints?: ValidatorDescriptor['hints']): ValidatorDescriptor {
  return { name, appliesTo: PLAIN_TEXT, hints, validate: (value) => (check(String(value)) ? null : FAIL) };
}

/**
 * A national format. The country comes from the `country` parameter (fixed or from an expression): empty, the value
 * cannot be checked yet and does not pass; not supported, the definition is wrong.
 */
function nationalFormat(name: keyof typeof FORMAT_COUNTRIES, check: (text: string, country: string) => boolean | null, hints?: ValidatorDescriptor['hints']): ValidatorDescriptor {
  return {
    name,
    appliesTo: PLAIN_TEXT,
    hints,
    validate: (value, params) => {
      const country = params['country'];
      if (country === undefined || country === null || country === '') return FAIL;
      const result = check(String(value), String(country).toUpperCase());
      if (result === null) throw new InvalidValidatorParams(`country not supported by ${name}`);
      return result ? null : FAIL;
    },
  };
}

/** Rows of a repeater (objects only). */
function rowsOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r)) : [];
}

/** Indexes of the rows whose `column` repeats the value of another row (empty cells do not count). */
export function duplicateRows(value: unknown, column: string): Set<number> {
  const seen = new Map<string, number[]>();
  rowsOf(value).forEach((row, i) => {
    const cell = row[column];
    if (isEmptyValue(cell)) return;
    const key = typeof cell === 'string' ? cell.trim().toLowerCase() : JSON.stringify(cell);
    seen.set(key, [...(seen.get(key) ?? []), i]);
  });
  return new Set([...seen.values()].filter((rows) => rows.length > 1).flat());
}

/** The built-in validators. Applications add theirs with `provideValidators`. */
export const STANDARD_VALIDATORS: readonly ValidatorDescriptor[] = [
  { name: 'required', messageKey: 'lc.required', checksEmpty: true, validate: (value) => (isEmptyValue(value) ? FAIL : null) },
  {
    name: 'minLength',
    appliesTo: TEXT,
    validate: (value, params) => {
      const min = numberParam(params, 'minLength', (n) => Number.isInteger(n) && n >= 0);
      return length(value) < min ? { params: { min } } : null;
    },
  },
  {
    name: 'maxLength',
    appliesTo: TEXT,
    validate: (value, params) => {
      const max = numberParam(params, 'maxLength', (n) => Number.isInteger(n) && n >= 1);
      return length(value) > max ? { params: { max } } : null;
    },
  },
  {
    name: 'pattern',
    appliesTo: PLAIN_TEXT,
    validate: (value, params) => {
      const regex = compilePattern(textParam(params, 'pattern'));
      if (!regex) throw new InvalidValidatorParams('pattern does not compile');
      const text = String(value);
      return text.length <= MAX_PATTERN_INPUT && regex.test(text) ? null : FAIL;
    },
  },
  {
    name: 'min',
    appliesTo: NUMBER,
    validate: (value, params) => {
      const min = numberParam(params, 'min');
      const n = asNumber(value);
      return n === null || n < min ? { params: { min } } : null;
    },
  },
  {
    name: 'max',
    appliesTo: NUMBER,
    validate: (value, params) => {
      const max = numberParam(params, 'max');
      const n = asNumber(value);
      return n === null || n > max ? { params: { max } } : null;
    },
  },
  {
    name: 'step',
    appliesTo: NUMBER,
    validate: (value, params) => {
      const step = numberParam(params, 'step', (n) => Number.isFinite(n) && n > 0);
      const base = typeof params['min'] === 'number' ? params['min'] : 0;
      const n = asNumber(value);
      if (n === null) return { params: { step } };
      const steps = (n - base) / step;
      // Decimal steps (0.1) are not exact in binary: a tolerance relative to the number of steps.
      return Math.abs(steps - Math.round(steps)) <= 1e-9 * Math.max(1, Math.abs(steps)) ? null : { params: { step } };
    },
  },
  {
    name: 'decimals',
    appliesTo: NUMBER,
    validate: (value, params) => {
      const decimals = numberParam(params, 'decimals', (n) => Number.isInteger(n) && n >= 0 && n <= 10);
      const n = asNumber(value);
      return n !== null && Number(n.toFixed(decimals)) === n ? null : { params: { decimals } };
    },
  },
  { name: 'integer', appliesTo: NUMBER, validate: (value) => (Number.isInteger(value) ? null : FAIL) },
  {
    name: 'minDate',
    appliesTo: DATES,
    validate: (value, params) => {
      const date = dateParam(params, 'minDate');
      return ISO_DATE.test(String(value)) && compareDates(String(value), date) >= 0 ? null : { params: { date } };
    },
  },
  {
    name: 'maxDate',
    appliesTo: DATES,
    validate: (value, params) => {
      const date = dateParam(params, 'maxDate');
      return ISO_DATE.test(String(value)) && compareDates(String(value), date) <= 0 ? null : { params: { date } };
    },
  },
  {
    name: 'sameAs',
    validate: (value, params, context) => {
      const other = textParam(params, 'sameAs');
      return JSON.stringify(value) === JSON.stringify(context.values[other] ?? null) ? null : { params: { field: context.label(other) } };
    },
  },
  {
    name: 'after',
    appliesTo: DATES,
    validate: (value, params, context) => {
      const other = textParam(params, 'after');
      const limit = context.values[other];
      if (typeof limit !== 'string' || !ISO_DATE.test(limit)) return null;
      const order = compareDates(String(value), limit);
      return order > 0 || (order === 0 && params['inclusive'] === true) ? null : { params: { field: context.label(other) } };
    },
  },
  {
    name: 'before',
    appliesTo: DATES,
    validate: (value, params, context) => {
      const other = textParam(params, 'before');
      const limit = context.values[other];
      if (typeof limit !== 'string' || !ISO_DATE.test(limit)) return null;
      const order = compareDates(String(value), limit);
      return order < 0 || (order === 0 && params['inclusive'] === true) ? null : { params: { field: context.label(other) } };
    },
  },
  {
    name: 'atLeastOne',
    checksEmpty: true,
    validate: (value, params, context) => {
      const others = params['atLeastOne'];
      if (!Array.isArray(others) || others.length === 0 || !others.every((o) => typeof o === 'string')) throw new InvalidValidatorParams('atLeastOne must list fields');
      if (!isEmptyValue(value) || others.some((o) => !isEmptyValue(context.values[o]))) return null;
      return { params: { fields: others.map((o) => context.label(o)).join(', ') } };
    },
  },
  {
    name: 'unique',
    appliesTo: ['repeater'],
    validate: (value, params) => (duplicateRows(value, textParam(params, 'unique')).size > 0 ? FAIL : null),
  },
  format('email', isEmail, { inputMode: 'email', autocomplete: 'email' }),
  format('url', isUrl, { inputMode: 'url', autocomplete: 'url' }),
  format('phone', isPhone, { inputMode: 'tel', autocomplete: 'tel' }),
  format('iban', isIban),
  format('bic', isBic),
  format('uuid', isUuid),
  format('alphanumeric', isAlphanumeric),
  {
    name: 'vatNumber',
    appliesTo: PLAIN_TEXT,
    validate: (value, params) => {
      // Without a country the prefix of the number decides; a country given by an expression and still empty does the same.
      const country = params['country'];
      const result = isVatNumber(String(value), typeof country === 'string' && country !== '' ? country.toUpperCase() : undefined);
      if (result === null) throw new InvalidValidatorParams('country not supported by vatNumber');
      return result ? null : FAIL;
    },
  },
  nationalFormat('taxCode', isTaxCode),
  nationalFormat('companyId', isCompanyId),
  nationalFormat('postalCode', isPostalCode, { autocomplete: 'postal-code' }),
];

/** Validators of the application, each `provideValidators` call adds a list. */
export const VALIDATORS = new InjectionToken<readonly (readonly ValidatorDescriptor[])[]>('VALIDATORS');

/** Registers validators of the application (one with the name of a built-in one replaces it). */
export function provideValidators(...validators: ValidatorDescriptor[]): Provider {
  return { provide: VALIDATORS, useValue: validators, multi: true };
}

/** The available validators: the built-in ones and those of the application. */
@Injectable({ providedIn: 'root', useFactory: () => new ValidatorRegistry((inject(VALIDATORS, { optional: true }) ?? []).flat()) })
export class ValidatorRegistry {
  private readonly byName = new Map<string, ValidatorDescriptor>();

  constructor(extra: readonly ValidatorDescriptor[] = []) {
    for (const validator of [...STANDARD_VALIDATORS, ...extra]) this.byName.set(validator.name, validator);
  }

  get(name: string): ValidatorDescriptor | undefined {
    return this.byName.get(name);
  }

  names(): string[] {
    return [...this.byName.keys()];
  }

  /**
   * `isValid(name, value, params)` of the expressions: true if the value passes. An empty value passes only the
   * validators that check empty values. Throws for an unknown validator or invalid parameters.
   */
  check(name: string, value: unknown, params: Record<string, unknown> = {}): boolean {
    const validator = this.byName.get(name);
    if (!validator) throw new Error(`unknown validator ${name}`);
    if (isEmptyValue(value) && !validator.checksEmpty) return false;
    return validator.validate(value, params, { values: {}, label: (field) => field }) === null;
  }
}
