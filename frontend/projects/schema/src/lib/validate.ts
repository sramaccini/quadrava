import { messagesValidator, navigationValidator, screenValidator, themeValidator } from './validators.generated';
import type { MessagesDefinition, NavigationDefinition, ScreenDefinition, ThemeDefinition } from './types';

export interface ValidationIssue {
  /** Position in the document, for example `/components/0/columns`. */
  path: string;
  message: string;
}

export type ValidationResult<T = ScreenDefinition> = { valid: true; value: T } | { valid: false; issues: ValidationIssue[] };

/** Error of a precompiled validator (same shape as Ajv errors). */
interface SchemaError {
  keyword: string;
  instancePath: string;
  message?: string;
  params: Record<string, unknown>;
}

/** Validator precompiled by `tools/sync-schema.mjs` (Ajv standalone): nothing is compiled in the browser. */
type ValidateFunction = ((data: unknown) => boolean) & { errors?: SchemaError[] | null };

/** Validates a screen definition against the screen schema. Does not throw. */
export function validateScreen(document: unknown): ValidationResult<ScreenDefinition> {
  return run<ScreenDefinition>(screenValidator, document);
}

/** Validates a theme (design tokens) against the theme schema. Does not throw. */
export function validateTheme(document: unknown): ValidationResult<ThemeDefinition> {
  return run<ThemeDefinition>(themeValidator, document);
}

/** Validates a navigation document (areas and three-level menus). Does not throw. */
export function validateNavigation(document: unknown): ValidationResult<NavigationDefinition> {
  return run<NavigationDefinition>(navigationValidator, document);
}

/** Validates a translation catalogue (one language) against the catalogue schema. Does not throw. */
export function validateMessages(document: unknown): ValidationResult<MessagesDefinition> {
  return run<MessagesDefinition>(messagesValidator, document);
}

function run<T>(validator: ValidateFunction, document: unknown): ValidationResult<T> {
  if (validator(document)) {
    return { valid: true, value: document as T };
  }
  const errors = (validator.errors ?? [])
    // The "must match then schema" messages duplicate the specific error that follows them.
    .filter((e) => e.keyword !== 'if');
  // An error inside an object makes the `then` branch that evaluates its properties fail: Ajv then reports perfectly
  // legal properties as «unexpected». If there is a more precise error deeper down, those reports are dropped.
  const deeper = (path: string): boolean => errors.some((e) => e.keyword !== 'unevaluatedProperties' && e.instancePath.startsWith(path + '/'));
  const issues = errors
    .filter((e) => e.keyword !== 'unevaluatedProperties' || !deeper(e.instancePath))
    .map((e) => ({ path: e.instancePath || '/', message: describe(e.keyword, e.message ?? 'invalid', e.params) }));
  return { valid: false, issues };
}

function describe(keyword: string, message: string, params: Record<string, unknown>): string {
  if (keyword === 'unevaluatedProperties' || keyword === 'additionalProperties') {
    return `unexpected property: ${String(params['unevaluatedProperty'] ?? params['additionalProperty'])}`;
  }
  if (keyword === 'required') return `missing required property: ${String(params['missingProperty'])}`;
  return message;
}
