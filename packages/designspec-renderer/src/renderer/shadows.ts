/**
 * @module @agentforge/designspec-renderer/renderer/shadows
 * Resolves shadow level names to CSS shadow strings.
 */
import type { RendererTokens } from '../types/tokens.js';

/** Shadow alias -> elevation level mapping. */
const SHADOW_ALIASES: Readonly<Record<string, number>> = {
  'none': 0,
  'sm': 1,
  'md': 2,
  'lg': 3,
};

/**
 * Resolve a shadow reference to a CSS box-shadow string.
 * Accepts: 'none', 'sm', 'md', 'lg', or a numeric level (as string).
 * Returns the shadow CSS string, or 'none' if not found.
 */
export function resolveShadow(ref: string, tokens: RendererTokens): string {
  // Try alias first
  const aliasLevel = SHADOW_ALIASES[ref];
  if (aliasLevel !== undefined) {
    const level = tokens.elevation.levels.find(l => l.level === aliasLevel);
    return level?.shadow ?? 'none';
  }

  // If it looks like a raw CSS shadow value, pass through
  if (ref.includes('px') || ref.includes('rgba')) {
    return ref;
  }

  // Try numeric level
  const numLevel = parseInt(ref, 10);
  if (!isNaN(numLevel)) {
    const level = tokens.elevation.levels.find(l => l.level === numLevel);
    return level?.shadow ?? 'none';
  }

  return 'none';
}
