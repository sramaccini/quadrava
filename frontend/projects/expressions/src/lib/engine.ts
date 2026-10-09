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
} from './types';

/**
 * Valutatore delle espressioni del linguaggio (CEL). Principi:
 * - nessun accesso a rete, DOM o codice arbitrario: le uniche funzioni esposte sono `can(permesso)` e quelle di presentazione (`t`, `fmt*`, `plural`), senza effetti collaterali;
 * - limiti strutturali sull'espressione (profondità, nodi, argomenti);
 * - non lancia mai eccezioni: restituisce un esito, e le condizioni falliscono "chiuse" (valore di ripiego).
 */
export class ExpressionEngine {
  private readonly env: Environment;
  private readonly onError?: ExpressionErrorHandler;
  private readonly i18n?: ExpressionI18n;

  constructor(
    private readonly permissions: PermissionChecker,
    options: ExpressionEngineOptions = {},
  ) {
    this.onError = options.onError;
    this.i18n = options.i18n;
    this.env = new Environment({
      unlistedVariablesAreDyn: true,
      limits: { maxAstNodes: 1000, maxDepth: 32, maxListElements: 100, maxMapEntries: 100, maxCallArguments: 8 },
    }).registerFunction('can(string): bool', (permission: string) => this.permissions.can(permission));
    this.registerPresentation();
    // I numeri che arrivano da JSON (stato, righe, form) sono "double" per CEL, mentre i letterali come 1 sono "int":
    // senza queste regole `state.pagina + 1` darebbe errore. Il risultato è un numero decimale.
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
   * Funzioni di presentazione, senza effetti collaterali e che seguono la lingua attiva:
   * `t(chiave[, ripiego[, parametri]])`, `fmtCurrency(v, 'EUR')`, `fmtNumber(v)`, `fmtDate(v)`, `plural(n, 'una riga', '{n} righe')`.
   * Un valore non formattabile (null, testo non numerico) diventa testo vuoto: la presentazione non fa fallire la schermata.
   */
  private registerPresentation(): void {
    const locale = (): string => this.i18n?.locale() ?? 'it-IT';
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

  /** Valuta un'espressione CEL "nuda", senza doppie graffe. */
  evaluate(source: string, context: EvalContext = {}): EvalResult {
    try {
      const value = this.env.evaluate(source, context as Record<string, unknown>);
      return { ok: true, value: toPlain(value) };
    } catch (e) {
      return this.fail(source, e);
    }
  }

  /**
   * Valuta un modello di testo con espressioni tra doppie graffe.
   * Se il modello è una sola espressione restituisce il valore con il suo tipo; altrimenti una stringa.
   */
  interpolate(template: string, context: EvalContext = {}): EvalResult {
    let segments;
    try {
      segments = parseTemplate(template);
    } catch (e) {
      return this.fail(template, e);
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
   * Valuta una condizione (visibleIf, enabledIf, ...). Se manca restituisce `whenMissing`;
   * se la valutazione fallisce o non dà un booleano restituisce `fallback` (di norma `false`: fail-closed).
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
      this.onError?.({ source: template, error: 'la condizione non restituisce un booleano' });
    }
    return options.fallback ?? false;
  }

  /** Controllo statico per editor e pubblicazione: sintassi, funzioni e tipi noti. Non esegue l'espressione. */
  check(source: string): ExpressionCheck {
    try {
      const result = this.env.check(source);
      return result.valid ? { valid: true } : { valid: false, error: firstLine(result.error?.message) };
    } catch (e) {
      return { valid: false, error: firstLine(e instanceof Error ? e.message : String(e)) };
    }
  }

  /** Controllo statico di un modello: verifica ogni espressione tra doppie graffe. */
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
  return (message ?? 'errore sconosciuto').split('\n')[0];
}

/** Converte i valori CEL in valori JavaScript semplici: interi grandi (bigint) in numeri, mappe e liste ricorsivamente. */
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
