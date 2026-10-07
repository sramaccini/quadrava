import Ajv2020 from 'ajv/dist/2020.js';
import { SCREEN_SCHEMA } from './screen.schema';
import type { ScreenDefinition } from './types';

export interface ValidationIssue {
  /** Posizione nel documento, per esempio `/components/0/columns`. */
  path: string;
  message: string;
}

export type ValidationResult =
  | { valid: true; value: ScreenDefinition }
  | { valid: false; issues: ValidationIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validator = ajv.compile(SCREEN_SCHEMA);

/** Valida una definizione di schermata contro lo schema del nucleo. Non lancia eccezioni. */
export function validateScreen(document: unknown): ValidationResult {
  if (validator(document)) {
    return { valid: true, value: document as ScreenDefinition };
  }
  const issues = (validator.errors ?? [])
    // I messaggi "must match then schema" duplicano l'errore specifico che li segue.
    .filter((e) => e.keyword !== 'if')
    .map((e) => ({ path: e.instancePath || '/', message: describe(e.keyword, e.message ?? 'non valido', e.params) }));
  return { valid: false, issues };
}

function describe(keyword: string, message: string, params: Record<string, unknown>): string {
  if (keyword === 'unevaluatedProperties') return `proprietà non prevista: ${String(params['unevaluatedProperty'])}`;
  if (keyword === 'required') return `proprietà obbligatoria mancante: ${String(params['missingProperty'])}`;
  return message;
}
