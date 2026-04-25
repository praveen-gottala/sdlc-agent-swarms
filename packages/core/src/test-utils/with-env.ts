/**
 * @module @agentforge/core/test-utils/with-env
 *
 * Shared helper for tests that need to mutate `process.env` for the
 * duration of a single test or block. Restores the previous value
 * (or deletes the key if it was unset) after the body runs, even on
 * thrown/rejected promises.
 *
 * Use this everywhere instead of inline `try/finally` env restoration
 * — the inline version drifts across files and is easy to get wrong
 * (e.g. forgetting `delete` when the original was undefined).
 */

type EnvOverrides = Record<string, string | undefined>;

function snapshot(keys: readonly string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of keys) {
    out[key] = process.env[key];
  }
  return out;
}

function apply(overrides: EnvOverrides): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/**
 * Run `body` with the given env overrides applied, then restore the
 * previous values. Works for both sync and async bodies.
 *
 * @example
 * await withEnv({ AGENTFORGE_ENABLE_VISION_LLM: 'false' }, async () => {
 *   const result = await evaluateDesign(...);
 *   expect(result.value.summary).toContain('disabled');
 * });
 */
export async function withEnv<T>(
  overrides: EnvOverrides,
  body: () => T | Promise<T>,
): Promise<T> {
  const before = snapshot(Object.keys(overrides));
  apply(overrides);
  try {
    return await body();
  } finally {
    apply(before);
  }
}
