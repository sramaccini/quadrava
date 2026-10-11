/**
 * Variabili disponibili alle espressioni. Tutte opzionali: dipendono da dove l'espressione compare
 * (per esempio `row` esiste solo nelle azioni di riga, `value` solo nelle validazioni).
 */
export interface EvalContext {
  /** Utente corrente. */
  user?: Record<string, unknown>;
  /** Stato della schermata (filtri, selezione). */
  state?: Record<string, unknown>;
  /** Parametri di navigazione. */
  params?: Record<string, unknown>;
  /** Riga corrente (tabelle). Può contenere `_perm` con i permessi per riga. */
  row?: Record<string, unknown>;
  /** Valori correnti del form. */
  form?: Record<string, unknown>;
  /** Valore del campo in validazione. */
  value?: unknown;
  /** Riga corrente di un campo a righe ripetibili (nelle sue regole di validazione). */
  item?: Record<string, unknown>;
  /** Righe selezionate di una tabella (nelle azioni multiple). */
  selection?: Record<string, unknown>[];
}

/** Fonte dei permessi dell'utente: nel runtime è il servizio di autorizzazione. */
export interface PermissionChecker {
  can(permission: string): boolean;
}

export type EvalResult<T = unknown> = { ok: true; value: T } | { ok: false; error: string };

export interface ExpressionCheck {
  valid: boolean;
  error?: string;
}

/** Notificata a ogni errore di valutazione: nel runtime alimenta la telemetria. Non riceve mai i valori dei dati. */
export type ExpressionErrorHandler = (info: { source: string; error: string }) => void;

export interface ExpressionEngineOptions {
  onError?: ExpressionErrorHandler;
  /** Se assente, `t()` restituisce il testo di ripiego (o la chiave) e i formati usano `it-IT`. */
  i18n?: ExpressionI18n;
}

/** Aggancio dell'internazionalizzazione: la lingua attiva e la ricerca delle traduzioni. Nel runtime lo fornisce il servizio `I18n` del core. */
export interface ExpressionI18n {
  /** Lingua attiva come tag BCP 47 (per `Intl`), per esempio `it-IT`. */
  locale(): string;
  /** Testo tradotto di una chiave; se manca ovunque `fallback`, e in sua assenza la chiave stessa. */
  translate(key: string, fallback: string | undefined, params: Record<string, unknown>): string;
}
