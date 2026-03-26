/**
 * @module @agentforge/designspec-renderer/renderer/typography
 * Resolves typography roles to concrete font properties.
 */
import type { RendererTokens } from '../types/tokens.js';

/** Resolved typography properties. */
export interface ResolvedTypography {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
}

/**
 * Resolve a typography role to concrete font properties.
 * Returns undefined if the role is not found in the scale.
 */
export function resolveTypography(role: string, tokens: RendererTokens): ResolvedTypography | undefined {
  const entry = tokens.typography.scale.find(e => e.role === role);
  if (!entry) return undefined;

  const fontFamily = tokens.typography.font_families[entry.family] ?? entry.family;

  return {
    fontFamily,
    fontSize: entry.size,
    fontWeight: entry.weight,
    lineHeight: entry.line_height ?? 1.5,
  };
}
