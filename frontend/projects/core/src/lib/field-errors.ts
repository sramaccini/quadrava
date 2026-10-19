/**
 * Field errors returned by a service in its Problem (contracts/problem.yaml): `{ path, code, params? }`, where `path`
 * is a JSON Pointer into the request body. They come from outside: only well-formed entries are kept, with limits, and
 * never the text written by the service.
 */
export interface FieldError {
  /** JSON Pointer into the body that was sent, for example `/email` or `/lines/0/code`. */
  readonly path: string;
  /** Reason, translated by the front end (`validation.<code>`, then `lc.validation.<code>`). */
  readonly code: string;
  /** Values of the message (limits, counts): texts, numbers and booleans only. */
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

const MAX_ERRORS = 50;
const MAX_PARAMS = 10;
const CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const POINTER = /^(\/([^/~]|~[01])*)+$/;

function cleanParams(value: unknown): Record<string, string | number | boolean> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value)
    .filter(([key, v]) => CODE.test(key) && (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || (typeof v === 'string' && v.length <= 100)))
    .slice(0, MAX_PARAMS) as [string, string | number | boolean][];
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * The field errors of a Problem body (`errors`) or of an error that already carries them (`fieldErrors`): at most 50,
 * with a valid code and path; the rest is dropped.
 */
export function fieldErrorsOf(source: unknown): FieldError[] {
  if (source === null || typeof source !== 'object') return [];
  const list = (source as { fieldErrors?: unknown }).fieldErrors ?? (source as { errors?: unknown }).errors;
  if (!Array.isArray(list)) return [];
  const errors: FieldError[] = [];
  for (const entry of list.slice(0, MAX_ERRORS)) {
    if (entry === null || typeof entry !== 'object') continue;
    const { path, code, params } = entry as Record<string, unknown>;
    if (typeof path !== 'string' || path.length > 200 || !POINTER.test(path) || typeof code !== 'string' || !CODE.test(code)) continue;
    const clean = cleanParams(params);
    errors.push(clean ? { path, code, params: clean } : { path, code });
  }
  return errors;
}

/** The segments of a JSON Pointer (`/lines/0/code` → `['lines', '0', 'code']`). */
export function pointerSegments(path: string): string[] {
  return path
    .split('/')
    .slice(1)
    .map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'));
}
