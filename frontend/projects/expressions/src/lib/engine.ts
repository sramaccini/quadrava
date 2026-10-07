import { Environment } from '@marcbachmann/cel-js';
import { parseTemplate } from './template';
import type {
  EvalContext,
  EvalResult,
  ExpressionCheck,
  ExpressionEngineOptions,
  ExpressionErrorHandler,
  PermissionChecker,
} from './types';

/**
 * Valutatore delle espressioni del linguaggio (CEL). Principi:
 * - nessun accesso a rete, DOM o codice arbitrario: l'unica funzione esposta è `can(permesso)`;
 * - limiti strutturali sull'espressione (profondità, nodi, argomenti);
 * - non lancia mai eccezioni: restituisce un esito, e le condizioni falliscono "chiuse" (valore di ripiego).
 */
export class ExpressionEngine {
  private readonly env: Environment;
  private readonly onError?: ExpressionErrorHandler;

  constructor(
    private readonly permissions: PermissionChecker,
    options: ExpressionEngineOptions = {},
  ) {
    this.onError = options.onError;
    this.env = new Environment({
      unlistedVariablesAreDyn: true,
      limits: { maxAstNodes: 1000, maxDepth: 32, maxListElements: 100, maxMapEntries: 100, maxCallArguments: 8 },
    }).registerFunction('can(string): bool', (permission: string) => this.permissions.can(permission));
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
