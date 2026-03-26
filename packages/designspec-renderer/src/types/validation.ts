/**
 * @module @agentforge/designspec-renderer/types/validation
 * Validation result types.
 */

/** Severity of a validation issue. */
export type ValidationSeverity = 'error' | 'warning';

/** A single validation issue found in a DesignSpec. */
export interface ValidationIssue {
  /** Severity level of this issue. */
  readonly severity: ValidationSeverity;
  /** Rule identifier that triggered this issue. */
  readonly rule: string;
  /** Human-readable description of the issue. */
  readonly message: string;
  /** Node ID where the issue was found, if applicable. */
  readonly nodeId?: string;
}

/** Result of validating a DesignSpec. */
export interface ValidationResult {
  /** Whether the spec passed validation (no errors). */
  readonly valid: boolean;
  /** All error-level issues. */
  readonly errors: readonly ValidationIssue[];
  /** All warning-level issues. */
  readonly warnings: readonly ValidationIssue[];
}
