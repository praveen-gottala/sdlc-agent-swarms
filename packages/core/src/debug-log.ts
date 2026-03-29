/**
 * @module debug-log
 *
 * Lightweight debug logging for silent backfills and default values.
 * No-ops when process.env.DEBUG is unset. Writes to stderr.
 */

const DIM = '\x1b[90m';
const RESET = '\x1b[0m';

/** Log a single debug message to stderr. No-op when DEBUG is unset. */
export function debugLog(message: string): void {
  if (!process.env.DEBUG) return;
  console.error(`${DIM}[DEBUG] ${message}${RESET}`);
}

/**
 * Log which fields were backfilled with defaults. Only logs fields
 * where the actual value is falsy/nullish. No-op when DEBUG is unset.
 */
export function logDefaults(
  context: string,
  defaults: Record<string, [actual: unknown, fallback: string]>,
): void {
  if (!process.env.DEBUG) return;
  for (const [field, [actual, fallback]] of Object.entries(defaults)) {
    if (!actual) {
      console.error(`${DIM}[DEBUG] ${context}: ${field} not provided → default: "${fallback}"${RESET}`);
    }
  }
}
