/**
 * @module button-shared — Shared button renderer logic (React).
 * Emits a shadcn <Button> with variant, sizing, radius, and shadow classes.
 */
import type { ResolvedNode } from '../../../types/catalog.js';
import type { ReactRenderContext } from '../render-context.js';
import { sizeClasses, radiusClass, shadowClass, cn } from './shared.js';

/**
 * Render a button node using shadcn Button component.
 *
 * Colors (bg, text) are handled by shadcn's variant system — the variant prop
 * controls the color scheme via CSS. Catalog bg/text_color are intentionally
 * not emitted as Tailwind classes here. A future adapter layer handles
 * theme-to-catalog mapping for non-shadcn libraries.
 *
 * @param variant — shadcn variant: 'default', 'outline', 'ghost'
 */
export function renderButton(
  node: ResolvedNode,
  ctx: ReactRenderContext,
  variant: string,
): void {
  ctx.builder.addImport('Button', '@/components/ui/button');

  const width = node.width ?? node.catalogEntry?.width;
  const height = node.height ?? 48;
  const radius = node.radius ?? node.catalogEntry?.radius;
  const shadow = shadowClass(node.shadow, ctx.tokens);

  const size = sizeClasses(width, height);
  const round = radiusClass(radius);
  const classes = cn(size, round, shadow);

  const label = node.label ?? 'Button';
  const variantAttr = `variant="${variant}"`;
  const classAttr = classes ? ` className="${classes}"` : '';

  ctx.builder.open('Button', `${variantAttr}${classAttr}`);
  ctx.builder.text(label);
  ctx.builder.close('Button');
}
