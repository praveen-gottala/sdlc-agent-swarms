/**
 * @module @agentforge/core/agent-runtime/error-strategy
 *
 * Parses the `on_error` string from agent contracts into a structured
 * error-handling strategy. Example: "retry(max=3) then notify_human + pause"
 */

/** Structured error-handling strategy parsed from an agent contract's on_error field. */
export interface ErrorStrategy {
  readonly retryMax: number;
  readonly notifyHuman: boolean;
  readonly pause: boolean;
  readonly escalate: boolean;
}

/**
 * Parse an on_error string into a structured ErrorStrategy.
 *
 * @param onError - e.g. "retry(max=3) then notify_human + pause"
 * @returns Parsed strategy with defaults for missing parts
 */
export const parseErrorStrategy = (onError: string): ErrorStrategy => {
  const retryMatch = /retry\(max=(\d+)\)/.exec(onError);
  const retryMax = retryMatch ? parseInt(retryMatch[1], 10) : 0;
  const notifyHuman = /notify_human/.test(onError);
  const pause = /\bpause\b/.test(onError);
  const escalate = /\bescalate\b/.test(onError);

  return { retryMax, notifyHuman, pause, escalate };
};
