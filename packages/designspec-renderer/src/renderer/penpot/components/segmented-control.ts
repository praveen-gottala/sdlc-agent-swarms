/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/segmented-control
 * Renderer for the `segmented-control` catalog component.
 */
import type { ComponentRenderer } from './types.js';
import {
  makeVar,
  tokenRef,
  emitBoard,
  emitFlex,
  emitAppendChild,
  emitRadius,
  emitStroke,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';

/** Render a segmented control with pill options. */
export const renderSegmentedControl: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('seg', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.effectiveWidth;
  const height = node.height ?? (cat?.height as number | undefined) ?? 48;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 24;
  const innerRadius = (cat?.inner_radius as number | undefined) ?? 20;
  const pad = node.padding ?? (cat?.padding as number | undefined) ?? 4;

  const containerBg = node.background ?? (cat?.container_background as string | undefined) ?? 'surface-elevated';
  const containerBorderColor = node.border_color ?? (cat?.container_border_color as string | undefined);
  const containerBorderOpacity = (cat?.container_border_opacity as number | undefined) ?? 1;

  const selectedBg = (cat?.selected_bg as string | undefined) ?? 'cta-primary';
  const selectedText = (cat?.selected_text as string | undefined) ?? 'text-on-cta';
  const selectedWeight = (cat?.selected_weight as number | undefined) ?? 600;
  const unselectedBg = (cat?.unselected_bg as string | undefined) ?? 'transparent';
  const unselectedText = (cat?.unselected_text as string | undefined) ?? 'text-primary';
  const unselectedWeight = (cat?.unselected_weight as number | undefined) ?? 400;
  const textSize = (cat?.text_size as number | undefined) ?? 14;

  b.comment(`SegmentedControl: ${node.id}`);

  // Outer container
  emitBoard(b, v, node.id, width, height, containerBg);
  emitFlex(b, v, 'row', { align: 'center', gap: 2, px: pad, py: pad });
  emitRadius(b, v, radius);

  if (containerBorderColor) {
    emitStroke(b, v, containerBorderColor, 1, containerBorderOpacity);
  }

  // Option pills
  const options = node.options ?? [];
  const pillWidth = options.length > 0
    ? Math.floor((width - pad * 2) / options.length)
    : width - pad * 2;
  const pillHeight = height - pad * 2;

  for (const opt of options) {
    const pv = makeVar('pill', ctx);
    const bg = opt.selected ? selectedBg : unselectedBg;
    const textCol = opt.selected ? selectedText : unselectedText;
    const fw = opt.selected ? selectedWeight : unselectedWeight;

    emitBoard(b, pv, `${node.id}_${opt.label}`, pillWidth, pillHeight, bg);
    emitFlex(b, pv, 'row', { align: 'center', justify: 'center' });
    emitRadius(b, pv, innerRadius);

    const tv = makeVar('ptxt', ctx);
    b.line(
      `const ${tv} = makeText(${JSON.stringify(opt.label)}, ${textSize}, ${fw}, ${tokenRef(textCol)}, 1, ${pillWidth});`,
    );
    b.line(`${tv}.textAlign = 'center';`);
    emitAppendChild(b, pv, tv, 'fill');
    emitAppendChild(b, v, pv, 'fill');
  }

  emitAppendChild(b, parentVar, v, 'fill', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
