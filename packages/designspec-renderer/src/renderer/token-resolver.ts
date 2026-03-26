/**
 * @module @agentforge/designspec-renderer/renderer/token-resolver
 * Resolves semantic color tokens to hex values.
 */
import type { RendererTokens } from '../types/tokens.js';

/** Flat map of token name -> hex color. */
export type TokenColorMap = Readonly<Record<string, string>>;

/**
 * Build a flat color map from RendererTokens.
 * Maps both primitive names and semantic names to hex values.
 * Semantic names resolve through their primitive reference.
 */
export function buildTokenMap(tokens: RendererTokens): TokenColorMap {
  const map: Record<string, string> = {};

  // First, add all primitives: name -> hex
  for (const [name, hex] of Object.entries(tokens.colors.primitive)) {
    map[name] = hex;
  }

  // Then, resolve semantics: semantic name -> primitive name -> hex
  for (const [role, ref] of Object.entries(tokens.colors.semantic)) {
    // Direct values (hex or rgba) pass through
    if (ref.startsWith('#') || ref.startsWith('rgba')) {
      map[role] = ref;
    } else {
      // Look up the primitive
      const hex = tokens.colors.primitive[ref];
      if (hex) {
        map[role] = hex;
      }
      // If primitive not found, skip (validation catches this)
    }
  }

  return map;
}

/**
 * Resolve a color reference to a hex value.
 * Accepts: semantic token name, primitive token name, or raw hex (#RRGGBB / #RGB).
 * Returns the hex string, or undefined if not found.
 */
export function resolveColor(ref: string, colorMap: TokenColorMap): string | undefined {
  // Raw hex passthrough
  if (ref.startsWith('#')) {
    return ref;
  }
  // Special values
  if (ref === 'transparent' || ref === 'none') {
    return ref;
  }
  return colorMap[ref];
}
