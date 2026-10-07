import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { SCREEN_SCHEMA } from './screen.schema';
import { THEME_SCHEMA } from './theme.schema';
import { NAVIGATION_SCHEMA } from './navigation.schema';
import type { NavigationDefinition, ScreenDefinition, ThemeDefinition } from './types';

export interface ValidationIssue {
  /** Posizione nel documento, per esempio `/components/0/columns`. */
  path: string;
  message: string;
}

export type ValidationResult<T = ScreenDefinition> = { valid: true; value: T } | { valid: false; issues: ValidationIssue[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
const screenValidator = ajv.compile(SCREEN_SCHEMA);
const themeValidator = ajv.compile(THEME_SCHEMA);
const navigationValidator = ajv.compile(NAVIGATION_SCHEMA);

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
  const issues = (validator.errors ?? [])
    // I messaggi "must match then schema" duplicano l'errore specifico che li segue.
    .filter((e) => e.keyword !== 'if')
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
