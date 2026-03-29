/**
 * @module @agentforge/designspec-renderer/renderer/penpot/script-preamble
 * Emits the token map and helper functions at the top of every Penpot script.
 */
import type { TokenColorMap } from '../token-resolver.js';
import type { ScriptBuilder } from './script-builder.js';

/**
 * Emit the token color map as a `const T = { ... }` block.
 * Converts semantic token names to camelCase JS variable names.
 */
export function emitTokenMap(builder: ScriptBuilder, colorMap: TokenColorMap): void {
  builder.comment('Design token color map (semantic name \u2192 hex)');
  builder.comment('Missing tokens resolve to magenta (#FF00FF) for visual debugging');
  builder.line('const T = new Proxy({');
  builder.indent();

  for (const [name, hex] of Object.entries(colorMap)) {
    const jsName = toCamelCase(name);
    builder.line(`${jsName}: '${hex}',`);
  }

  builder.dedent();
  builder.line('}, {');
  builder.indent();
  builder.line("get(t, p) { if (p in t) return t[p]; return '#FF00FF'; }");
  builder.dedent();
  builder.line('});');
  builder.blank();
}

/**
 * Emit the makeText helper function.
 * Handles font sizing, weight, color, opacity, and auto-height for long text.
 */
export function emitMakeTextHelper(builder: ScriptBuilder): void {
  builder.comment('Text creation helper \u2014 handles sizing, weight, color, and auto-height');
  builder.line('function makeText(content, fontSize, fontWeight, fillColor, opacity, wrapWidth) {');
  builder.indent();
  builder.comment('penpot.createText("") returns undefined — use a space for empty content');
  builder.line("const textContent = String(content) || ' ';");
  builder.line('const t = penpot.createText(textContent);');
  builder.line('t.fontSize = fontSize;');
  builder.line("t.fontWeight = String(fontWeight);");
  builder.line('t.fills = [{ fillColor: fillColor, fillOpacity: opacity !== undefined ? opacity : 1 }];');
  builder.line('if (wrapWidth && String(content).length > 18) {');
  builder.indent();
  builder.line('t.resize(wrapWidth, fontSize * 2.2);');
  builder.line("t.growType = 'auto-height';");
  builder.dedent();
  builder.line('}');
  builder.line('return t;');
  builder.dedent();
  builder.line('}');
  builder.blank();
}

/**
 * Emit the full preamble: try block, token map, makeText helper.
 */
export function emitPreamble(builder: ScriptBuilder, colorMap: TokenColorMap): void {
  builder.line('try {');
  builder.indent();
  builder.blank();
  emitTokenMap(builder, colorMap);
  emitMakeTextHelper(builder);
}

/**
 * Emit the postamble: return nodeIds, close try block, catch.
 */
export function emitPostamble(builder: ScriptBuilder, rootVar: string, nodeIdEntries: ReadonlyArray<{ varName: string; nodeId: string }>): void {
  builder.blank();

  // Auto-resize the root frame to fit its content.
  // The root board has no parent, so layoutChild.verticalSizing cannot be used.
  // Instead, walk direct children to find the max bottom edge and resize.
  builder.comment('Auto-resize root frame to fit content (no parent = no layoutChild.verticalSizing)');
  builder.line(`{`);
  builder.indent();
  builder.line(`const children = ${rootVar}.children || [];`);
  builder.line(`let maxBottom = 0;`);
  builder.line(`for (const child of children) {`);
  builder.indent();
  builder.line(`const bottom = (child.y || 0) + (child.height || 0);`);
  builder.line(`if (bottom > maxBottom) maxBottom = bottom;`);
  builder.dedent();
  builder.line(`}`);
  builder.line(`const padding = ${rootVar}.flex ? (${rootVar}.flex.bottomPadding || 0) : 0;`);
  builder.line(`const fittedHeight = maxBottom + padding + 48;`);
  builder.line(`if (fittedHeight > 100 && fittedHeight !== ${rootVar}.height) {`);
  builder.indent();
  builder.line(`${rootVar}.resize(${rootVar}.width, fittedHeight);`);
  builder.dedent();
  builder.line(`}`);
  builder.dedent();
  builder.line(`}`);
  builder.blank();

  builder.comment('Return node IDs for downstream reference');
  builder.line(`return {`);
  builder.indent();
  builder.line(`rootId: ${rootVar}.id,`);
  builder.line('nodeIds: {');
  builder.indent();
  for (const { varName, nodeId } of nodeIdEntries) {
    builder.line(`'${nodeId}': ${varName}.id,`);
  }
  builder.dedent();
  builder.line('}');
  builder.dedent();
  builder.line('};');

  // Close try block and add catch
  builder.blank();
  builder.dedent();
  builder.line('} catch (e) {');
  builder.indent();
  builder.line('return { __error: true, message: e.message || String(e), stack: e.stack };');
  builder.dedent();
  builder.line('}');
}

/**
 * Emit postamble for chunk 0: stores rootId, returns it for subsequent chunks.
 */
export function emitChunkSetupPostamble(builder: ScriptBuilder, rootVar: string, nodeIdEntries: ReadonlyArray<{ varName: string; nodeId: string }>): void {
  builder.blank();
  builder.comment('Chunk 0: return rootId for subsequent chunks to recover');
  builder.line(`return {`);
  builder.indent();
  builder.line(`rootId: ${rootVar}.id,`);
  builder.line('nodeIds: {');
  builder.indent();
  for (const { varName, nodeId } of nodeIdEntries) {
    builder.line(`'${nodeId}': ${varName}.id,`);
  }
  builder.dedent();
  builder.line('}');
  builder.dedent();
  builder.line('};');

  builder.blank();
  builder.dedent();
  builder.line('} catch (e) {');
  builder.indent();
  builder.line('return { __error: true, message: e.message || String(e), stack: e.stack };');
  builder.dedent();
  builder.line('}');
}

/**
 * Emit preamble for continuation chunks: recovers root board by ID.
 */
export function emitChunkRecoveryPreamble(builder: ScriptBuilder, colorMap: TokenColorMap): void {
  builder.line('try {');
  builder.indent();
  builder.blank();
  emitTokenMap(builder, colorMap);
  emitMakeTextHelper(builder);
  builder.comment('Recover root board from previous chunk');
  builder.line('const __rootId = arguments[0];');
  builder.line('const __root = penpot.currentPage.getShapeById(__rootId);');
  builder.line('if (!__root) return { __error: true, message: "Root shape not found: " + __rootId };');
  builder.blank();
}

/**
 * Emit postamble for continuation chunks: returns nodeIds, auto-resize on last chunk.
 */
export function emitChunkContinuationPostamble(
  builder: ScriptBuilder,
  nodeIdEntries: ReadonlyArray<{ varName: string; nodeId: string }>,
  isLast: boolean,
): void {
  builder.blank();

  if (isLast) {
    // Auto-resize root frame on the last chunk
    builder.comment('Auto-resize root frame to fit content (last chunk)');
    builder.line(`{`);
    builder.indent();
    builder.line(`const children = __root.children || [];`);
    builder.line(`let maxBottom = 0;`);
    builder.line(`for (const child of children) {`);
    builder.indent();
    builder.line(`const bottom = (child.y || 0) + (child.height || 0);`);
    builder.line(`if (bottom > maxBottom) maxBottom = bottom;`);
    builder.dedent();
    builder.line(`}`);
    builder.line(`const padding = __root.flex ? (__root.flex.bottomPadding || 0) : 0;`);
    builder.line(`const fittedHeight = maxBottom + padding + 48;`);
    builder.line(`if (fittedHeight > 100 && fittedHeight !== __root.height) {`);
    builder.indent();
    builder.line(`__root.resize(__root.width, fittedHeight);`);
    builder.dedent();
    builder.line(`}`);
    builder.dedent();
    builder.line(`}`);
    builder.blank();
  }

  builder.comment('Return node IDs for this chunk');
  builder.line(`return {`);
  builder.indent();
  builder.line('nodeIds: {');
  builder.indent();
  for (const { varName, nodeId } of nodeIdEntries) {
    builder.line(`'${nodeId}': ${varName}.id,`);
  }
  builder.dedent();
  builder.line('}');
  builder.dedent();
  builder.line('};');

  builder.blank();
  builder.dedent();
  builder.line('} catch (e) {');
  builder.indent();
  builder.line('return { __error: true, message: e.message || String(e), stack: e.stack };');
  builder.dedent();
  builder.line('}');
}

/**
 * Convert kebab-case token name to camelCase JS identifier.
 * e.g., 'cta-primary' -> 'ctaPrimary', 'text-on-cta' -> 'textOnCta'
 */
function toCamelCase(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
