/**
 * @module section — Titled section renderer (React).
 * Emits a <section> with optional <h3> title and flex children.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, flexClasses, typographyClasses, cn } from './shared.js';

/** Render a section node as a semantic <section> element. */
export const renderSection: ReactComponentRenderer = (node, ctx, renderChildren) => {
  const flex = flexClasses(node.layout, { dir: 'column', gap: 16 });
  const bg = resolveColorToClass(node.background, 'bg');
  const classes = cn(flex, bg);

  ctx.builder.open('section', `className="${classes}"`);

  const heading = node.label ?? node.title;
  if (heading) {
    const titleTypo = typographyClasses('heading-3', ctx.tokens);
    const titleColor = resolveColorToClass('text-primary', 'text');
    const titleClasses = cn(titleTypo, titleColor);
    ctx.builder.open('h3', `className="${titleClasses}"`);
    ctx.builder.text(heading);
    ctx.builder.close('h3');
  }

  renderChildren();
  ctx.builder.close('section');
};
