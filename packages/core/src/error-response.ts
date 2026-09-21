/**
 * The single error shape every endpoint returns. README: "A malformed request
 * should be a 400 with a message naming the problem, never a 500 from a
 * destructured `undefined`."
 */
export interface ErrorResponse {
  /** Stable, machine-readable. Clients branch on this, never on `message`. */
  code: string;
  /** Human-readable, names the specific problem. Safe to show a user. */
  message: string;
  /** Present when the problem is attributable to one request field. */
  field?: string;
}

/**
 * Thrown by domain code to produce an ErrorResponse with a chosen status.
 * Anything else reaching the filter becomes a generic 500 whose internals are
 * logged but never returned.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
