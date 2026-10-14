import type { EvalContext } from 'expressions';
import type { DataSourceDefinition } from 'schema';

export type HttpMethod = DataSourceDefinition['method'];

/** Variabili aggiuntive di un punto della schermata (per esempio `row` nella riga di una tabella). */
export type Scope = EvalContext & Record<string, unknown>;

export type DataSourceStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DataSourceState {
  status: DataSourceStatus;
  data: unknown;
  error?: string;
}

/** Esito di una chiamata. In errore `status` è il codice HTTP (0 se il servizio non risponde o la richiesta non parte). */
export type CallResult = { ok: true; data: unknown } | { ok: false; error: string; status?: number };
