/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/shared
 * Shared utilities for Penpot component renderers.
 */
import type { LayoutSpec } from '../../../types/design-spec-v2.js';
import type { ScriptBuilder } from '../script-builder.js';
import type { RenderContext } from '../render-context.js';

/** Convert a token name to a T.xxx reference for the generated script. */
export function tokenRef(name: string): string {
  if (name === 'transparent' || name === 'none') return `'${name}'`;
  if (name.startsWith('#')) return `'${name}'`;
  if (name.startsWith('rgba')) return `'${name}'`;
  return `T.${name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())}`;
}

/** Generate a unique variable name with an incrementing suffix. */
export function makeVar(prefix: string, ctx: RenderContext): string {
  return `${prefix}${ctx.nextVarId()}`;
}

/** Emit board creation with name, resize, and optional fills. */
export function emitBoard(
  builder: ScriptBuilder,
  varName: string,
  name: string,
  width: number,
  height: number,
  fillToken?: string,
): void {
  builder.line(`const ${varName} = penpot.createBoard();`);
  builder.line(`${varName}.name = '${name}';`);
  builder.line(`${varName}.resize(${width}, ${height});`);
  if (fillToken && fillToken !== 'transparent' && fillToken !== 'none') {
    builder.line(
      `${varName}.fills = [{ fillColor: ${tokenRef(fillToken)}, fillOpacity: 1 }];`,
    );
  } else if (!fillToken || fillToken === 'transparent') {
    builder.line(`${varName}.fills = [];`);
  }
}

/** Emit flex layout setup on a board variable. */
export function emitFlex(
  builder: ScriptBuilder,
  varName: string,
  dir: 'row' | 'column',
  options?: {
    align?: string;
    justify?: string;
    gap?: number;
    px?: number;
    py?: number;
    pt?: number;
    pb?: number;
  },
): void {
  builder.line(`${varName}.addFlexLayout();`);
  builder.line(`${varName}.flex.dir = '${dir}';`);
  if (options?.align) {
    builder.line(`${varName}.flex.alignItems = '${options.align}';`);
  }
  if (options?.justify) {
    builder.line(`${varName}.flex.justifyContent = '${options.justify}';`);
  }
  if (options?.gap !== undefined) {
    if (dir === 'column') {
      builder.line(`${varName}.flex.rowGap = ${options.gap};`);
    } else {
      builder.line(`${varName}.flex.columnGap = ${options.gap};`);
    }
  }
  if (options?.px !== undefined) {
    builder.line(`${varName}.flex.leftPadding = ${options.px};`);
    builder.line(`${varName}.flex.rightPadding = ${options.px};`);
  }
  if (options?.py !== undefined) {
    builder.line(`${varName}.flex.topPadding = ${options.py};`);
    builder.line(`${varName}.flex.bottomPadding = ${options.py};`);
  }
  if (options?.pt !== undefined) {
    builder.line(`${varName}.flex.topPadding = ${options.pt};`);
  }
  if (options?.pb !== undefined) {
    builder.line(`${varName}.flex.bottomPadding = ${options.pb};`);
  }
}

/** Emit appendChild + layoutChild sizing. Always together, always in this order. */
export function emitAppendChild(
  builder: ScriptBuilder,
  parentVar: string,
  childVar: string,
  horizontalSizing: 'fill' | 'auto' | 'fix' = 'fill',
  verticalSizing?: 'fill' | 'auto' | 'fix',
): void {
  builder.line(`${parentVar}.appendChild(${childVar});`);
  builder.line(
    `${childVar}.layoutChild.horizontalSizing = '${horizontalSizing}';`,
  );
  if (verticalSizing) {
    builder.line(
      `${childVar}.layoutChild.verticalSizing = '${verticalSizing}';`,
    );
  }
}

type LayoutMargins = Pick<
  LayoutSpec,
  'my' | 'mx' | 'mt' | 'mb' | 'ml' | 'mr'
>;

/**
 * Emit layoutChild margin fields (after appendChild + sizing).
 * Uses Penpot LayoutChildProperties — must run after layoutChild.* sizing is set.
 */
export function emitLayoutChildMargins(
  builder: ScriptBuilder,
  childVar: string,
  layout: LayoutMargins | undefined,
): void {
  if (!layout) return;
  if (layout.my !== undefined) {
    builder.line(`${childVar}.layoutChild.verticalMargin = ${layout.my};`);
  } else {
    if (layout.mt !== undefined) {
      builder.line(`${childVar}.layoutChild.topMargin = ${layout.mt};`);
    }
    if (layout.mb !== undefined) {
      builder.line(`${childVar}.layoutChild.bottomMargin = ${layout.mb};`);
    }
  }
  if (layout.mx !== undefined) {
    builder.line(`${childVar}.layoutChild.horizontalMargin = ${layout.mx};`);
  } else {
    if (layout.ml !== undefined) {
      builder.line(`${childVar}.layoutChild.leftMargin = ${layout.ml};`);
    }
    if (layout.mr !== undefined) {
      builder.line(`${childVar}.layoutChild.rightMargin = ${layout.mr};`);
    }
  }
}

/** Emit border radius on a shape. */
export function emitRadius(
  builder: ScriptBuilder,
  varName: string,
  radius: number,
): void {
  if (radius > 0) {
    builder.line(`${varName}.borderRadius = ${radius};`);
  }
}

/** Emit strokes (border) on a shape. */
export function emitStroke(
  builder: ScriptBuilder,
  varName: string,
  colorToken: string,
  width: number,
  opacity?: number,
): void {
  builder.line(
    `${varName}.strokes = [{ strokeColor: ${tokenRef(colorToken)}, strokeOpacity: ${opacity ?? 1}, strokeWidth: ${width}, strokeAlignment: 'inner' }];`,
  );
}

/**
 * Emit shadow from a resolved CSS shadow string.
 * Parses "0 2px 8px rgba(15,110,86,0.06)" and converts RGB 0-255 to Penpot's 0-1 floats.
 */
export function emitShadow(
  builder: ScriptBuilder,
  varName: string,
  shadowCss: string,
): void {
  if (shadowCss === 'none') return;
  // Parse CSS shadow: "0 2px 8px rgba(R,G,B,A)" — offsetX has no unit, others have px
  const match = shadowCss.match(
    /^(\d+)\s+(\d+)px\s+(\d+)px\s+rgba\(([^)]+)\)$/,
  );
  if (match) {
    const [, offsetX, offsetY, blur, rgba] = match;
    const parts = rgba.split(',').map((s) => s.trim());
    // Penpot uses 0-1 float range for r/g/b, CSS rgba uses 0-255 integers
    const r = (parseInt(parts[0], 10) / 255).toFixed(3);
    const g = (parseInt(parts[1], 10) / 255).toFixed(3);
    const b = (parseInt(parts[2], 10) / 255).toFixed(3);
    const a = parseFloat(parts[3]);
    builder.line(
      `${varName}.shadows = [{ style: 'drop-shadow', offsetX: ${offsetX}, offsetY: ${offsetY}, blur: ${blur}, spread: 0, color: { r: ${r}, g: ${g}, b: ${b}, opacity: ${a} } }];`,
    );
  }
}
