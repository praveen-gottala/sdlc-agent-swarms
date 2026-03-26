/**
 * @module avatar — Circular avatar with initials (React).
 * Emits shadcn <Avatar> + <AvatarFallback>.
 */
import type { ReactComponentRenderer } from './types.js';
import { cn } from './shared.js';

/** Render an avatar circle with initials. */
export const renderAvatar: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Avatar', '@/components/ui/avatar');
  ctx.builder.addImport('AvatarFallback', '@/components/ui/avatar');

  const cat = node.catalogEntry as Record<string, unknown> | undefined;
  const size = (cat?.size as number | undefined) ?? 36;
  const initials = node.label ?? node.content ?? '?';

  ctx.builder.open('Avatar', `className="${cn(`w-[${size}px] h-[${size}px]`)}"`);
  ctx.builder.open('AvatarFallback');
  ctx.builder.text(initials);
  ctx.builder.close('AvatarFallback');
  ctx.builder.close('Avatar');
};
