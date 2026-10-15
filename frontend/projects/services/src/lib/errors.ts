/** Error of a data call. It never contains the server's error text, which must not be shown to the user. */
export class DataError extends Error {
  constructor(
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(`Richiesta fallita (${status})`);
    this.name = 'DataError';
  }
}
