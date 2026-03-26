/**
 * @module text — Text node renderer (React).
 * Emits semantic HTML tags based on typography role.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, typographyClasses, cn } from './shared.js';

/**
 * Map typography role to HTML tag.
 * Headings get <h1>-<h3>, body/label/small get <p>.
 */
function tagForRole(role: string | undefined): string {
  switch (role) {
    case 'heading-1': return 'h1';
    case 'heading-2': return 'h2';
    case 'heading-3': return 'h3';
    default: return 'p';
  }
}

/** Render a text node with appropriate semantic tag and typography classes. */
export const renderText: ReactComponentRenderer = (node, _ctx, _renderChildren) => {
  const tag = tagForRole(node.typography);
  const typo = typographyClasses(node.typography, _ctx.tokens, node.weight);
  const color = resolveColorToClass(node.color, 'text');
  const align = node.textAlign ? `text-${node.textAlign}` : undefined;
  const classes = cn(typo, color, align);
  const content = node.content ?? node.label ?? '';

  if (classes) {
    _ctx.builder.open(tag, `className="${classes}"`);
  } else {
    _ctx.builder.open(tag);
  }
  _ctx.builder.text(content);
  _ctx.builder.close(tag);
};
