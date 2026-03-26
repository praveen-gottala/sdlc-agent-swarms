/**
 * @module @agentforge/designspec-renderer/types/result
 * Standalone Result type for the designspec-renderer package.
 * Mirrors @agentforge/core's Result pattern but with zero cross-package deps.
 */

/** Error descriptor for failed operations. */
export interface ResultError {
  readonly code: string;
  readonly message: string;
  readonly recoverable?: boolean;
}

/** A successful result. */
export interface OkResult<T> {
  readonly ok: true;
  readonly value: T;
}

/** A failed result. */
export interface ErrResult {
  readonly ok: false;
  readonly error: ResultError;
}

/** Discriminated union for success/failure. */
export type Result<T> = OkResult<T> | ErrResult;

/** Create a successful result. */
export const Ok = <T>(value: T): OkResult<T> => ({ ok: true, value });

/** Create a failed result. */
export const Err = (error: ResultError): ErrResult => ({ ok: false, error });
