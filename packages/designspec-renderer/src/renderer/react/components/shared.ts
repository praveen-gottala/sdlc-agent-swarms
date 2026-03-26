/**
 * @module @agentforge/designspec-renderer/renderer/react/components/shared
 * Shared Tailwind CSS class generation utilities for React renderers.
 */
import type { RendererTokens } from '../../../types/tokens.js';
import type { LayoutSpec } from '../../../types/design-spec-v2.js';
import { resolveTypography } from '../../typography.js';
import { resolveShadow } from '../../shadows.js';

/**
 * Resolve a semantic color token name to a CSS variable class.
 * e.g., resolveColorToClass('cta-primary', 'bg') → 'bg-[var(--cta-primary)]'
 *
 * If the token name is 'transparent', returns the Tailwind transparent class.
 * If undefined/empty, returns undefined.
 */
export function resolveColorToClass(
  tokenName: string | undefined,
  prefix: 'bg' | 'text' | 'border',
): string | undefined {
  if (!tokenName) return undefined;
  if (tokenName === 'transparent') return `${prefix}-transparent`;
  return `${prefix}-[var(--${tokenName})]`;
}

/**
 * Build flex + spacing Tailwind classes from a LayoutSpec.
 * Returns a single space-separated class string.
 */
export function flexClasses(
  layout: LayoutSpec | undefined,
  defaults?: Partial<LayoutSpec>,
): string {
  const dir = layout?.dir ?? defaults?.dir ?? 'column';
  const parts: string[] = ['flex'];

  if (dir === 'column') parts.push('flex-col');

  const align = layout?.align ?? defaults?.align;
  if (align === 'center') parts.push('items-center');
  else if (align === 'end') parts.push('items-end');
  else if (align === 'stretch') parts.push('items-stretch');
  else if (align === 'start') parts.push('items-start');

  const justify = layout?.justify ?? defaults?.justify;
  if (justify === 'center') parts.push('justify-center');
  else if (justify === 'space-between') parts.push('justify-between');
  else if (justify === 'end') parts.push('justify-end');

  const gap = layout?.gap ?? defaults?.gap;
  if (gap !== undefined && gap > 0) parts.push(`gap-[${gap}px]`);

  // Padding
  const pxVal = layout?.px ?? defaults?.px;
  const pyVal = layout?.py ?? defaults?.py;
  const ptVal = layout?.pt ?? defaults?.pt;
  const pbVal = layout?.pb ?? defaults?.pb;

  if (pxVal !== undefined && pxVal > 0) parts.push(`px-[${pxVal}px]`);
  if (pyVal !== undefined && pyVal > 0) parts.push(`py-[${pyVal}px]`);
  if (ptVal !== undefined && ptVal > 0) parts.push(`pt-[${ptVal}px]`);
  if (pbVal !== undefined && pbVal > 0) parts.push(`pb-[${pbVal}px]`);

  return parts.join(' ');
}

/**
 * Build typography Tailwind classes from a typography role.
 * Returns font-size, font-weight, and line-height classes.
 */
export function typographyClasses(
  role: string | undefined,
  tokens: RendererTokens,
  weightOverride?: number,
): string {
  if (!role) return '';
  const typo = resolveTypography(role, tokens);
  if (!typo) return '';

  const parts: string[] = [];
  parts.push(`text-[${typo.fontSize}px]`);

  const weight = weightOverride ?? typo.fontWeight;
  if (weight >= 700) parts.push('font-bold');
  else if (weight >= 600) parts.push('font-semibold');
  else if (weight >= 500) parts.push('font-medium');
  // 400 is default, no class needed

  if (typo.lineHeight !== 1.5) {
    parts.push(`leading-[${typo.lineHeight}]`);
  }

  return parts.join(' ');
}

/**
 * Build shadow Tailwind class from an elevation level name.
 * Returns e.g. 'shadow-[0_2px_8px_rgba(15,110,86,0.06)]' or '' for none/flat.
 */
export function shadowClass(shadowRef: string | number | undefined, tokens: RendererTokens): string {
  if (shadowRef === undefined || shadowRef === null) return '';
  const ref = String(shadowRef);
  if (ref === 'none') return '';

  // Resolve via the shared resolveShadow helper (handles 'sm', 'md', 'lg', numeric, raw CSS)
  const resolved = resolveShadow(ref, tokens);
  if (!resolved || resolved === 'none') return '';

  // Convert spaces to underscores for Tailwind arbitrary values
  const twShadow = resolved.replace(/ /g, '_');
  return `shadow-[${twShadow}]`;
}

/**
 * Build border-radius Tailwind class.
 */
export function radiusClass(radius: number | undefined): string {
  if (radius === undefined || radius === 0) return '';
  if (radius >= 9999) return 'rounded-full';
  return `rounded-[${radius}px]`;
}

/**
 * Build size classes (width + height) as Tailwind arbitrary values.
 */
export function sizeClasses(
  width: number | 'fill' | undefined,
  height: number | undefined,
  screenWidth?: number,
): string {
  const parts: string[] = [];

  if (width === 'fill') {
    parts.push('w-full');
  } else if (width !== undefined && width > 0) {
    parts.push(`w-[${width}px]`);
  }

  if (height !== undefined && height > 0) {
    parts.push(`h-[${height}px]`);
  }

  return parts.join(' ');
}

/**
 * Convert kebab-case screen name to PascalCase + 'Screen' suffix.
 * e.g., 'settings-form' → 'SettingsFormScreen'
 */
export function screenToPascalCase(screen: string): string {
  const pascal = screen
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  return `${pascal}Screen`;
}

/**
 * Escape text for safe JSX rendering.
 * Handles &, <, >, {, } characters.
 */
export function escapeJsx(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;');
}

/**
 * Join class strings, filtering out empty/undefined values.
 */
export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
