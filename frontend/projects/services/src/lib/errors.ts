/** Errore di una chiamata dati. Non contiene mai il testo di errore del server, che non va mostrato all'utente. */
export class DataError extends Error {
  constructor(
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(`Richiesta fallita (${status})`);
    this.name = 'DataError';
  }
}
