/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/switch
 * Renderer for the `switch` catalog component — toggle switch for binary on/off settings.
 */
import type { ComponentRenderer } from './types.js';
import {
  makeVar,
  tokenRef,
  emitBoard,
  emitFlex,
  emitAppendChild,
  emitRadius,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveTypography } from '../../typography.js';

/** Render a toggle switch with label. */
export const renderSwitch: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('sw', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.effectiveWidth;
  const minHeight = (cat?.min_height as number | undefined) ?? 44;
  const trackWidth = (cat?.track_width as number | undefined) ?? 44;
  const trackHeight = (cat?.track_height as number | undefined) ?? 24;
  const thumbSize = (cat?.thumb_size as number | undefined) ?? 20;
  const trackRadius = (cat?.track_radius as number | undefined) ?? 12;
  const trackBg = node.background ?? (cat?.track_color as string | undefined) ?? 'surface-secondary';
  const thumbBg = (cat?.thumb_color as string | undefined) ?? 'surface-primary';
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-primary';

  // Label typography
  const bodyTypo = resolveTypography('body', ctx.tokens);
  const bodySize = bodyTypo?.fontSize ?? 14;
  const bodyWeight = bodyTypo?.fontWeight ?? 400;

  b.comment(`Switch: ${node.id}`);

  // Outer row: label on left, track on right
  emitBoard(b, v, node.id, width, minHeight, 'transparent');
  emitFlex(b, v, 'row', { align: 'center', justify: 'space-between', gap: 12, px: 4 });

  // Label text
  const label = node.label ?? '';
  const tv = makeVar('swtxt', ctx);
  b.line(
    `const ${tv} = makeText(${JSON.stringify(label)}, ${bodySize}, ${bodyWeight}, ${tokenRef(textColor)}, 1, ${width - trackWidth - 24});`,
  );
  b.line(`${tv}.name = '${node.id}_label';`);
  emitAppendChild(b, v, tv, 'fill');

  // Track board
  const trackVar = makeVar('swtrk', ctx);
  emitBoard(b, trackVar, `${node.id}_track`, trackWidth, trackHeight, trackBg);
  emitRadius(b, trackVar, trackRadius);
  emitFlex(b, trackVar, 'row', { align: 'center', px: 2 });

  // Thumb circle (board with full border-radius)
  const thumbVar = makeVar('swthb', ctx);
  emitBoard(b, thumbVar, `${node.id}_thumb`, thumbSize, thumbSize, thumbBg);
  emitRadius(b, thumbVar, thumbSize / 2);
  emitAppendChild(b, trackVar, thumbVar, 'fix', 'fix');

  emitAppendChild(b, v, trackVar, 'fix', 'fix');

  emitAppendChild(b, parentVar, v, 'fill', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
