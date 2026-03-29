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
 * Convert kebab-case token name to camelCase JS identifier.
 * e.g., 'cta-primary' -> 'ctaPrimary', 'text-on-cta' -> 'textOnCta'
 */
function toCamelCase(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
