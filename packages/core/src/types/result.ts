/**
 * @module @agentforge/core/types/result
 *
 * Result pattern for explicit error handling.
 * Functions return Result<T> instead of throwing exceptions.
 */

/**
 * All error codes in the AgentForge system.
 * Grouped by subsystem for clarity.
 */
export type ErrorCode =
  // LLM Provider Errors
  | 'LLM_RATE_LIMIT'
  | 'LLM_API_ERROR'
  | 'LLM_MALFORMED_OUTPUT'
  | 'LLM_CONTEXT_OVERFLOW'
  | 'LLM_TIMEOUT'

  // Budget Errors
  | 'BUDGET_EXCEEDED_TASK'
  | 'BUDGET_EXCEEDED_PHASE'
  | 'BUDGET_EXCEEDED_PROJECT'

  // Permission Errors
  | 'PERMISSION_DENIED'
  | 'HITL_TIMEOUT'
  | 'HITL_REJECTED'

  // Git/CI Errors
  | 'GIT_CONFLICT'
  | 'GIT_PUSH_FAILED'
  | 'CI_FAILED'
  | 'CI_TIMEOUT'

  // MCP/Integration Errors
  | 'MCP_UNAVAILABLE'
  | 'MCP_SCHEMA_MISMATCH'
  | 'CHANNEL_UNAVAILABLE'

  // State Errors
  | 'SPEC_LOCK_FAILED'
  | 'SPEC_CONFLICT'
  | 'TASK_NOT_FOUND'
  | 'INVALID_STATE'

  // Agent Errors
  | 'AGENT_LOOP_DETECTED'
  | 'AGENT_ABORTED'
  | 'AGENT_UNKNOWN';

/**
 * Structured error type for all AgentForge operations.
 */
export interface AgentForgeError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly cause?: Error;
  readonly recoverable: boolean;
  readonly agentId?: string;
  readonly taskId?: string;
}

/**
 * Discriminated union representing success or failure.
 * All fallible operations return this instead of throwing.
 */
export type Result<T, E = AgentForgeError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Construct a successful Result.
 */
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/**
 * Construct a failed Result.
 */
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
