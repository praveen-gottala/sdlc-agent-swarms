/**
 * @module @agentforge/designspec-renderer/renderer/penpot
 * Main Penpot renderer — converts DesignSpecV2 to a Penpot JavaScript string.
 */
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap, TreeNode } from '../../types/catalog.js';
import type { RenderContext } from './render-context.js';
import { ScriptBuilder } from './script-builder.js';
import { buildTokenMap } from '../token-resolver.js';
import { buildTree } from '../tree-builder.js';
import { resolveNode } from '../../catalog/resolver.js';
import { emitPreamble, emitPostamble } from './script-preamble.js';
import { getAcceleratorRenderer, getCatalogRenderer } from './components/index.js';

/** Result of rendering a DesignSpec to a Penpot script. */
export interface RenderResult {
  /** The complete JavaScript string ready for execute_code. */
  readonly script: string;
  /** Warnings encountered during rendering (non-fatal). */
  readonly warnings: readonly string[];
  /** Node IDs that were rendered. */
  readonly nodeIds: readonly string[];
}

/**
 * Render a DesignSpecV2 to a Penpot JavaScript string.
 *
 * Steps:
 * 1. Build token color map
 * 2. Build tree from flat adjacency list
 * 3. Walk tree depth-first, resolve each node, render via component renderer
 * 4. Emit preamble (try, token map, makeText) and postamble (return, catch)
 */
export function renderToScript(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
): RenderResult {
  const colorMap = buildTokenMap(tokens);
  const tree = buildTree(spec.nodes);

  const builder = new ScriptBuilder();
  const warnings: string[] = [];
  const renderedNodeIds: string[] = [];
  const nodeIdEntries: Array<{ varName: string; nodeId: string }> = [];
  let varCounter = 0;

  const ctx: RenderContext = {
    builder,
    colorMap,
    tokens,
    catalog,
    screenWidth: spec.width,
    nextVarId: () => varCounter++,
    trackNode: (varName: string, nodeId: string) => {
      nodeIdEntries.push({ varName, nodeId });
      renderedNodeIds.push(nodeId);
    },
  };

  // Emit preamble
  emitPreamble(builder, colorMap);

  // Walk tree depth-first
  let rootVar = 'root0';

  function walkNode(treeNode: TreeNode, parentVar: string | null): void {
    // Resolve node against catalog
    const resolved = resolveNode(treeNode.id, spec.nodes[treeNode.id], catalog);

    // Find renderer — accelerator types get a direct lookup,
    // catalog nodes fall back to their catalogEntry.type or 'container'.
    let renderer = resolved.type
      ? getAcceleratorRenderer(resolved.type)
      : undefined;

    if (!renderer && resolved.type) {
      warnings.push(
        `No renderer for accelerator type "${resolved.type}" (node: ${treeNode.id})`,
      );
      return;
    }

    if (!renderer && resolved.catalogId) {
      // First try the dedicated catalog renderer
      renderer = getCatalogRenderer(resolved.catalogId);
      if (!renderer) {
        // Fall back to container for unknown catalog entries
        warnings.push(
          `No renderer for catalog "${resolved.catalogId}" (node: ${treeNode.id}) — falling back to container`,
        );
        renderer = getAcceleratorRenderer('container');
        if (!renderer) return;
      }
    }

    if (!renderer) {
      warnings.push(
        `Node "${treeNode.id}" has neither type nor catalog — skipping`,
      );
      return;
    }

    // Render the node
    const varName = renderer(resolved, parentVar ?? '', ctx);

    // Track root
    if (parentVar === null) {
      rootVar = varName;
    }

    // Recursively render children
    for (const child of treeNode.children) {
      walkNode(child, varName);
    }
  }

  walkNode(tree, null);

  // Emit postamble
  emitPostamble(builder, rootVar, nodeIdEntries);

  return {
    script: builder.build(),
    warnings,
    nodeIds: renderedNodeIds,
  };
}
