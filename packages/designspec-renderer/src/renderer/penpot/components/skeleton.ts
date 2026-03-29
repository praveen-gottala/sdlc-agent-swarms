/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/skeleton
 * Renderer for the `skeleton` catalog component — loading placeholder.
 */
import type { ComponentRenderer } from './types.js';
import {
  makeVar,
  tokenRef,
  emitBoard,
  emitAppendChild,
  emitRadius,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';

/** Render a skeleton loading placeholder. */
export const renderSkeleton: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('skel', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const bg = node.background ?? (cat?.background as string | undefined) ?? 'surface-secondary';
  const bgOpacity = (cat?.opacity as number | undefined) ?? 0.6;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 4;
  const width = typeof node.width === 'number' ? node.width : ctx.effectiveWidth;
  const height = node.height ?? (cat?.height as number | undefined) ?? 20;
  const hSizing = node.width === 'fill' ? 'fill' : 'fix';

  b.comment(`Skeleton: ${node.id}`);

  emitBoard(b, v, node.id, width, height);
  b.line(
    `${v}.fills = [{ fillColor: ${tokenRef(bg)}, fillOpacity: ${bgOpacity} }];`,
  );
  emitRadius(b, v, radius);

  emitAppendChild(b, parentVar, v, hSizing, 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
