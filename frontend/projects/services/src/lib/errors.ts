import type { FieldError } from 'core';

/**
 * Error of a data call. It never contains the server's error text, which must not be shown to the user; of the Problem
 * it keeps only the field errors (paths and codes, contracts/problem.yaml).
 */
export class DataError extends Error {
  constructor(
    readonly status: number,
    readonly correlationId?: string,
    readonly fieldErrors: readonly FieldError[] = [],
  ) {
    super(`Richiesta fallita (${status})`);
    this.name = 'DataError';
  }
}
