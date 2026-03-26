/**
 * @module @agentforge/designspec-renderer/renderer/penpot/plugin-data
 * Emits setPluginData() calls to tag Penpot shapes with DesignSpec metadata.
 */
import type { ScriptBuilder } from './script-builder.js';
import type { ResolvedNode } from '../../types/catalog.js';

/**
 * Emit setPluginData calls for a rendered node.
 * Tags the shape with ds_id, ds_type or ds_catalog, token references, and overrides.
 */
export function emitPluginData(builder: ScriptBuilder, varName: string, node: ResolvedNode): void {
  builder.line(`${varName}.setPluginData('ds_id', '${node.id}');`);

  if (node.type) {
    builder.line(`${varName}.setPluginData('ds_type', '${node.type}');`);
  }
  if (node.catalogId) {
    builder.line(`${varName}.setPluginData('ds_catalog', '${node.catalogId}');`);
  }
  if (node.background) {
    builder.line(`${varName}.setPluginData('ds_token_bg', '${node.background}');`);
  }
  if (node.color) {
    builder.line(`${varName}.setPluginData('ds_token_text', '${node.color}');`);
  }
  if (node.border_color) {
    builder.line(`${varName}.setPluginData('ds_token_border', '${node.border_color}');`);
  }
  if (node.overrides) {
    builder.line(`${varName}.setPluginData('ds_overrides', ${JSON.stringify(JSON.stringify(node.overrides))});`);
  }
}
