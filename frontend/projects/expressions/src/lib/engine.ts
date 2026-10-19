import { Environment } from '@marcbachmann/cel-js';
import { formatMessage } from './message-format';
import { parseTemplate } from './template';
import type {
  EvalContext,
  EvalResult,
  ExpressionCheck,
  ExpressionEngineOptions,
  ExpressionErrorHandler,
  ExpressionI18n,
  PermissionChecker,
  ValueValidator,
} from './types';

/**
 * Evaluator of the expressions of the language (CEL). Principles:
 * - no access to network, DOM or arbitrary code: the only exposed functions are `can(permission)`, `isValid(name, value[, params])` and the presentation ones (`t`, `fmt*`, `plural`), without side effects;
 * - structural limits on the expression (depth, nodes, arguments);
 * - it never throws: it returns an outcome, and conditions fail "closed" (fallback value).
 */
export class ExpressionEngine {
  private readonly env: Environment;
  private readonly onError?: ExpressionErrorHandler;
  private readonly i18n?: ExpressionI18n;
  private readonly validate?: ValueValidator;
  /** Expressions already compiled and templates already split, by text: the same conditions are evaluated at every render. */
  private readonly compiled = new BoundedCache<string, CompiledExpression>(CACHE_SIZE);
  private readonly templates = new BoundedCache<string, Segments>(CACHE_SIZE);

  constructor(
    private readonly permissions: PermissionChecker,
    options: ExpressionEngineOptions = {},
  ) {
    this.onError = options.onError;
    this.i18n = options.i18n;
    this.validate = options.validate;
    this.env = new Environment({
      unlistedVariablesAreDyn: true,
      limits: { maxAstNodes: 1000, maxDepth: 32, maxListElements: 100, maxMapEntries: 100, maxCallArguments: 8 },
    }).registerFunction('can(string): bool', (permission: string) => this.permissions.can(permission));
    this.registerPresentation();
    this.registerValidation();
    // Numbers coming from JSON (state, rows, form) are "double" for CEL, while literals such as 1 are "int":
    // without these rules `state.page + 1` would be an error. The result is a decimal number.
    const arithmetic: Record<string, (a: number, b: number) => number> = {
      '+': (a, b) => a + b,
      '-': (a, b) => a - b,
      '*': (a, b) => a * b,
      '/': (a, b) => a / b,
    };
    for (const [op, fn] of Object.entries(arithmetic)) {
      for (const [left, right] of [['double', 'int'], ['int', 'double']]) {
        this.env.registerOperator(`${left} ${op} ${right}`, (a: unknown, b: unknown) => fn(Number(a), Number(b)));
      }
    }
  }

  /**
   * Presentation functions, without side effects and following the active language:
   * `t(key[, fallback[, params]])`, `fmtCurrency(v, 'EUR')`, `fmtNumber(v)`, `fmtDate(v)`, `plural(n, 'one row', '{n} rows')`.
   * A value that cannot be formatted (null, non-numeric text) becomes empty text: presentation does not make the screen fail.
   */
  private registerPresentation(): void {
    const locale = (): string => this.i18n?.locale() ?? 'en-GB';
    const translate = (key: string, fallback: string | undefined, params: unknown): string => {
      const plain = toParams(params);
      return this.i18n ? this.i18n.translate(key, fallback, plain) : formatMessage(fallback ?? key, plain, locale());
    };
    const num = (v: unknown): number | null => {
      const n = toPlain(v);
      if (typeof n === 'number') return Number.isFinite(n) ? n : null;
      if (typeof n === 'string' && n.trim() !== '') return Number.isFinite(Number(n)) ? Number(n) : null;
      return null;
    };
    this.env
      .registerFunction('t(string): string', (key: string) => translate(key, undefined, {}))
      .registerFunction('t(string, string): string', (key: string, fallback: string) => translate(key, fallback, {}))
      .registerFunction('t(string, string, dyn): string', (key: string, fallback: string, params: unknown) => translate(key, fallback, params))
      .registerFunction('fmtCurrency(dyn, string): string', (v: unknown, currency: string) => {
        const n = num(v);
        return n === null ? '' : new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(n);
      })
      .registerFunction('fmtNumber(dyn): string', (v: unknown) => {
        const n = num(v);
        return n === null ? '' : new Intl.NumberFormat(locale()).format(n);
      })
      .registerFunction('fmtDate(dyn): string', (v: unknown) => {
        const raw = toPlain(v);
        if (typeof raw !== 'string' && typeof raw !== 'number') return '';
        const dateOnly = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw);
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat(locale(), { dateStyle: 'short', ...(dateOnly ? { timeZone: 'UTC' } : {}) }).format(date);
      })
      .registerFunction('plural(dyn, string, string): string', (v: unknown, one: string, other: string) => {
        const n = num(v);
        if (n === null) return '';
        const text = new Intl.PluralRules(locale()).select(n) === 'one' ? one : other;
        return text.replaceAll('{n}', new Intl.NumberFormat(locale()).format(n));
      });
  }

  /**
   * `isValid(name, value)` and `isValid(name, value, params)`: the check of a registered validator, for example
   * `isValid('iban', form.iban)` or `isValid('vatNumber', form.vat, {'country': 'DE'})`. The signature is fixed, so the
   * static check accepts any validator name; an unknown one is an error when the expression runs.
   */
  private registerValidation(): void {
    const check = (name: string, value: unknown, params: unknown): boolean => {
      if (!this.validate) throw new Error('isValid: no validators available');
      return this.validate(name, toPlain(value), toParams(params));
    };
    this.env
      .registerFunction('isValid(string, dyn): bool', (name: string, value: unknown) => check(name, value, {}))
      .registerFunction('isValid(string, dyn, dyn): bool', (name: string, value: unknown, params: unknown) => check(name, value, params));
  }

  /** Evaluates a "bare" CEL expression, without double braces. */
  evaluate(source: string, context: EvalContext = {}): EvalResult {
    try {
      let compiled = this.compiled.get(source);
      if (!compiled) {
        try {
          compiled = { run: this.env.parse(source) };
        } catch (e) {
          // A syntax error is remembered too: the same broken expression is not parsed again at every render.
          compiled = { error: e };
        }
        this.compiled.set(source, compiled);
      }
      if ('error' in compiled) throw compiled.error;
      const value = compiled.run(context as Record<string, unknown>);
      return { ok: true, value: toPlain(value) };
    } catch (e) {
      return this.fail(source, e);
    }
  }

  /**
   * Evaluates a text template with expressions in double braces.
   * If the template is a single expression it returns the value with its type; otherwise a string.
   */
  interpolate(template: string, context: EvalContext = {}): EvalResult {
    let segments = this.templates.get(template);
    if (!segments) {
      try {
        segments = parseTemplate(template);
      } catch (e) {
        return this.fail(template, e);
      }
      this.templates.set(template, segments);
    }
    if (segments.length === 1 && segments[0].kind === 'expr') {
      return this.evaluate(segments[0].source, context);
    }
    let out = '';
    for (const segment of segments) {
      if (segment.kind === 'text') {
        out += segment.text;
      } else {
        const result = this.evaluate(segment.source, context);
        if (!result.ok) {
          return result;
        }
        out += result.value === null || result.value === undefined ? '' : String(result.value);
      }
    }
    return { ok: true, value: out };
  }

  /**
   * Evaluates a condition (visibleIf, enabledIf, ...). If missing it returns `whenMissing`;
   * if the evaluation fails or does not give a boolean it returns `fallback` (usually `false`: fail-closed).
   */
  evaluateCondition(template: string | undefined, context: EvalContext, options: { whenMissing: boolean; fallback?: boolean }): boolean {
    if (template === undefined) {
      return options.whenMissing;
    }
    const result = this.interpolate(template, context);
    if (result.ok && typeof result.value === 'boolean') {
      return result.value;
    }
    if (result.ok) {
      this.onError?.({ source: template, error: 'the condition does not return a boolean' });
    }
    return options.fallback ?? false;
  }

  /** Static check for the editor and publication: syntax, known functions and types. It does not run the expression. */
  check(source: string): ExpressionCheck {
    try {
      const result = this.env.check(source);
      return result.valid ? { valid: true } : { valid: false, error: firstLine(result.error?.message) };
    } catch (e) {
      return { valid: false, error: firstLine(e instanceof Error ? e.message : String(e)) };
    }
  }

  /** Static check of a template: checks every expression in double braces. */
  checkTemplate(template: string): ExpressionCheck {
    let segments;
    try {
      segments = parseTemplate(template);
    } catch (e) {
      return { valid: false, error: firstLine(e instanceof Error ? e.message : String(e)) };
    }
    for (const segment of segments) {
      if (segment.kind === 'expr') {
        const result = this.check(segment.source);
        if (!result.valid) {
          return result;
        }
      }
    }
    return { valid: true };
  }

  private fail(source: string, e: unknown): EvalResult<never> {
    const error = firstLine(e instanceof Error ? e.message : String(e));
    this.onError?.({ source, error });
    return { ok: false, error };
  }
}

function toParams(value: unknown): Record<string, unknown> {
  const plain = toPlain(value);
  return plain !== null && typeof plain === 'object' && !Array.isArray(plain) ? (plain as Record<string, unknown>) : {};
}

function firstLine(message: string | undefined): string {
  return (message ?? 'unknown error').split('\n')[0];
}

/** Converts CEL values into plain JavaScript values: big integers (bigint) into numbers, maps and lists recursively. */
export function toPlain(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(toPlain);
  }
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), toPlain(v)]));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

const CACHE_SIZE = 2000;
type Segments = ReturnType<typeof parseTemplate>;
type CompiledExpression = { run: (context?: Record<string, unknown>) => unknown } | { error: unknown };

/** Map with a maximum number of entries: beyond the limit it drops the least recently used one. */
export class BoundedCache<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // At the end: it is the most recent.
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as K);
  }

  get size(): number {
    return this.map.size;
  }
}
