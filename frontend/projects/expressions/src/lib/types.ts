/**
 * Variables available to expressions. All optional: they depend on where the expression appears
 * (for example `row` exists only in row actions, `value` only in validations).
 */
export interface EvalContext {
  /** Utente corrente. */
  user?: Record<string, unknown>;
  /** State of the screen (filters, selection). */
  state?: Record<string, unknown>;
  /** Navigation parameters. */
  params?: Record<string, unknown>;
  /** Current row (tables). It can contain `_perm` with the per-row permissions. */
  row?: Record<string, unknown>;
  /** Current values of the form. */
  form?: Record<string, unknown>;
  /** Value of the field being validated. */
  value?: unknown;
  /** Text searched in a lookup field (in the parameters of its data source). */
  search?: string | null;
  /** Value of a lookup field whose text is needed (in the parameters of its data source). */
  lookupKey?: unknown;
  /** Word at the cursor of a text field with suggestions (in the parameters of its data source). */
  word?: string | null;
  /** Request of a serverDataTable (page, sorting, filters, groups), to pass to the service. */
  request?: Record<string, unknown> | null;
  /** Current row of a repeatable-rows field (in its validation rules). */
  item?: Record<string, unknown>;
  /** Selected rows of a table (in bulk actions). */
  selection?: Record<string, unknown>[];
}

/** Source of the user's permissions: in the runtime it is the authorization service. */
export interface PermissionChecker {
  can(permission: string): boolean;
}

export type EvalResult<T = unknown> = { ok: true; value: T } | { ok: false; error: string };

export interface ExpressionCheck {
  valid: boolean;
  error?: string;
}

/** Notified on every evaluation error: in the runtime it feeds telemetry. It never receives data values. */
export type ExpressionErrorHandler = (info: { source: string; error: string }) => void;

export interface ExpressionEngineOptions {
  onError?: ExpressionErrorHandler;
  /** If absent, `t()` returns the fallback text (or the key) and formats use `en-GB`. */
  i18n?: ExpressionI18n;
  /** Implementation of `isValid(name, value[, params])`. If absent, `isValid` is an evaluation error (fail-closed). */
  validate?: ValueValidator;
}

/**
 * Check of a value with a registered validator: true if valid. It throws for an unknown validator or invalid
 * parameters (the expression fails, so the condition is false). In the runtime it is the validator registry.
 */
export type ValueValidator = (name: string, value: unknown, params: Record<string, unknown>) => boolean;

/** Internationalisation hook: the active language and the lookup of translations. In the runtime it is the core `I18n` service. */
export interface ExpressionI18n {
  /** Active language as a BCP 47 tag (for `Intl`), for example `en-GB`. */
  locale(): string;
  /** Translated text of a key; if missing everywhere `fallback`, and without it the key itself. */
  translate(key: string, fallback: string | undefined, params: Record<string, unknown>): string;
}
