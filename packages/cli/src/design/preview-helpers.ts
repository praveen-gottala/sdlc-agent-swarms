/**
 * @module @agentforge/cli/design/preview-helpers
 *
 * Shared color utilities used across HTML preview generators for design
 * options, PRD, and app spec previews.
 */

/** Check if a hex color is light (for choosing contrast text color). */
export function isLight(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

/** Resolve a semantic color to its hex value. */
export function resolveColor(semantic: string, primitive: Readonly<Record<string, string>>): string {
  // If semantic value starts with # or rgba, it's already resolved
  if (semantic.startsWith('#') || semantic.startsWith('rgba')) return semantic;
  return primitive[semantic] ?? '#888888';
}

/** Apply opacity to a hex color by appending alpha hex digits. */
export function hexWithOpacity(hex: string, opacity: number): string {
  if (hex.startsWith('rgba')) return hex;
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return `${hex.slice(0, 7)}${alpha}`;
}
