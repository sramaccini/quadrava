import type { FieldError } from './field-errors';
import type { EvalContext } from 'expressions';
import type { DataSourceDefinition } from 'schema';

export type HttpMethod = DataSourceDefinition['method'];

/** Additional variables of a point of the screen (for example `row` in a table row). */
export type Scope = EvalContext & Record<string, unknown>;

export type DataSourceStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DataSourceState {
  status: DataSourceStatus;
  data: unknown;
  error?: string;
}

/** Outcome of a call. On error `status` is the HTTP code (0 if the service does not answer or the request does not start). */
/** Outcome of a call. A failure can carry the field errors of the service's Problem (contracts/problem.yaml). */
export type CallResult = { ok: true; data: unknown } | { ok: false; error: string; status?: number; fieldErrors?: readonly FieldError[] };
