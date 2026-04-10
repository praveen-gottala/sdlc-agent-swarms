/**
 * @module @agentforge/core/utils/safe-parse
 *
 * Utility for safely parsing JSON strings with Zod schema validation.
 * Replaces bare JSON.parse + unsafe `as` casts across the codebase.
 */

import type { ZodType, ZodError } from 'zod';
import type { Result } from '../types/result.js';
import { Ok, Err } from '../types/result.js';

/**
 * Extract JSON from a string that may be wrapped in markdown code fences.
 */
export function extractJson(raw: string): string {
  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(raw);
  return fenceMatch ? fenceMatch[1].trim() : raw.trim();
}

/**
 * Safely parse a JSON string and validate against a Zod schema.
 * Returns a Result with the validated data or a descriptive error.
 */
export function safeParse<T>(
  raw: string,
  schema: ZodType<T>,
  label?: string,
): Result<T> {
  const jsonStr = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `${label ?? 'Output'}: invalid JSON — ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = (result.error as ZodError).issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `${label ?? 'Output'}: validation failed — ${issues}`,
      recoverable: true,
    });
  }

  return Ok(result.data);
}
