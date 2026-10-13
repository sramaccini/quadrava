import { navigationValidator, screenValidator, themeValidator } from './validators.generated';
import type { NavigationDefinition, ScreenDefinition, ThemeDefinition } from './types';

export interface ValidationIssue {
  /** Posizione nel documento, per esempio `/components/0/columns`. */
  path: string;
  message: string;
}

export type ValidationResult<T = ScreenDefinition> = { valid: true; value: T } | { valid: false; issues: ValidationIssue[] };

/** Errore di un validatore precompilato (stessa forma degli errori di Ajv). */
interface SchemaError {
  keyword: string;
  instancePath: string;
  message?: string;
  params: Record<string, unknown>;
}

/** Validatore precompilato da `tools/sync-schema.mjs` (Ajv standalone): nessuna compilazione nel browser. */
type ValidateFunction = ((data: unknown) => boolean) & { errors?: SchemaError[] | null };

/** Valida una definizione di schermata contro lo schema del nucleo. Non lancia eccezioni. */
export function validateScreen(document: unknown): ValidationResult<ScreenDefinition> {
  return run<ScreenDefinition>(screenValidator, document);
}

/** Valida un tema (design token) contro lo schema dei temi. Non lancia eccezioni. */
export function validateTheme(document: unknown): ValidationResult<ThemeDefinition> {
  return run<ThemeDefinition>(themeValidator, document);
}

/** Valida un documento di navigazione (casi d'uso e menu a tre livelli). Non lancia eccezioni. */
export function validateNavigation(document: unknown): ValidationResult<NavigationDefinition> {
  return run<NavigationDefinition>(navigationValidator, document);
}

function run<T>(validator: ValidateFunction, document: unknown): ValidationResult<T> {
  if (validator(document)) {
    return { valid: true, value: document as T };
  }
  const errors = (validator.errors ?? [])
    // I messaggi "must match then schema" duplicano l'errore specifico che li segue.
    .filter((e) => e.keyword !== 'if');
  // Un errore dentro un oggetto fa fallire il ramo `then` che ne valuta le proprietà: Ajv segnala allora come «non
  // previste» proprietà del tutto lecite. Se c'è un errore più preciso più in profondità, quelle segnalazioni si tolgono.
  const deeper = (path: string): boolean => errors.some((e) => e.keyword !== 'unevaluatedProperties' && e.instancePath.startsWith(path + '/'));
  const issues = errors
    .filter((e) => e.keyword !== 'unevaluatedProperties' || !deeper(e.instancePath))
    .map((e) => ({ path: e.instancePath || '/', message: describe(e.keyword, e.message ?? 'non valido', e.params) }));
  return { valid: false, issues };
}

function describe(keyword: string, message: string, params: Record<string, unknown>): string {
  if (keyword === 'unevaluatedProperties' || keyword === 'additionalProperties') {
    return `proprietà non prevista: ${String(params['unevaluatedProperty'] ?? params['additionalProperty'])}`;
  }
  if (keyword === 'required') return `proprietà obbligatoria mancante: ${String(params['missingProperty'])}`;
  return message;
}
