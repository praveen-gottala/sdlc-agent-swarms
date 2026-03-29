/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/loading-spinner
 * Renderer for the `loading-spinner` catalog component — spinner with optional label.
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
import { resolveTypography } from '../../typography.js';

/** Render a loading spinner with optional label. */
export const renderLoadingSpinner: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('spin', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const gap = (cat?.gap as number | undefined) ?? 8;
  const spinnerSize = (cat?.spinner_size as number | undefined) ?? 24;
  const spinnerColor = node.color ?? (cat?.spinner_color as string | undefined) ?? 'cta-primary';
  const textColor = (cat?.text_color as string | undefined) ?? 'text-secondary';

  const label = node.label ?? '';
  const bodyTypo = resolveTypography('body', ctx.tokens);
  const bodySize = bodyTypo?.fontSize ?? 14;
  const bodyWeight = bodyTypo?.fontWeight ?? 400;

  const width = typeof node.width === 'number' ? node.width : spinnerSize;
  const height = node.height ?? (spinnerSize + (label ? gap + bodySize : 0));

  b.comment(`LoadingSpinner: ${node.id}`);

  emitBoard(b, v, node.id, width, height, 'transparent');
  emitFlex(b, v, 'column', { align: 'center', gap });

  // Spinner circle (board with stroke, no fill)
  const sv = makeVar('spnr', ctx);
  emitBoard(b, sv, `${node.id}_spinner`, spinnerSize, spinnerSize, 'transparent');
  emitRadius(b, sv, spinnerSize / 2);
  emitStroke(b, sv, spinnerColor, 2);
  emitAppendChild(b, v, sv, 'fix', 'fix');

  // Optional label
  if (label) {
    const tv = makeVar('stxt', ctx);
    b.line(
      `const ${tv} = makeText(${JSON.stringify(label)}, ${bodySize}, ${bodyWeight}, ${tokenRef(textColor)}, 1, ${width});`,
    );
    b.line(`${tv}.name = '${node.id}_label';`);
    emitAppendChild(b, v, tv, 'auto');
  }

  emitAppendChild(b, parentVar, v, 'auto', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
