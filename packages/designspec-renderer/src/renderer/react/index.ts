/**
 * @module @agentforge/designspec-renderer/renderer/react
 * Main React/JSX renderer — converts DesignSpecV2 to a TSX component string.
 */
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap, TreeNode } from '../../types/catalog.js';
import type { ReactRenderContext } from './render-context.js';
import { JsxBuilder } from './jsx-builder.js';
import { buildTokenMap } from '../token-resolver.js';
import { buildTree } from '../tree-builder.js';
import { resolveNode } from '../../catalog/resolver.js';
import { getAcceleratorRenderer, getCatalogRenderer } from './components/index.js';
import { screenToPascalCase } from './components/shared.js';

/** Result of rendering a DesignSpec to JSX. */
export interface JsxRenderResult {
  /** Complete TSX file content (imports + component function). */
  readonly jsx: string;
  /** Warnings encountered during rendering (non-fatal). */
  readonly warnings: readonly string[];
  /** Node IDs that were rendered. */
  readonly nodeIds: readonly string[];
}

/**
 * Render a DesignSpecV2 to a React/TSX component string.
 *
 * Steps:
 * 1. Build token color map (used internally, not in output — React uses CSS vars)
 * 2. Build tree from flat adjacency list
 * 3. Walk tree depth-first, resolve each node, render via component renderer
 * 4. Collect imports during walk
 * 5. Produce complete TSX file with imports + exported function
 */
export function renderToJSX(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
): JsxRenderResult {
  const colorMap = buildTokenMap(tokens);
  const tree = buildTree(spec.nodes);

  const builder = new JsxBuilder();
  const warnings: string[] = [];
  const renderedNodeIds: string[] = [];

  const ctx: ReactRenderContext = {
    builder,
    colorMap,
    tokens,
    catalog,
    screenWidth: spec.width,
  };

  function walkNode(treeNode: TreeNode): void {
    const resolved = resolveNode(treeNode.id, spec.nodes[treeNode.id], catalog);

    // Find renderer — accelerator types get a direct lookup,
    // catalog nodes fall back to their catalogEntry.type or container.
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
      renderer = getCatalogRenderer(resolved.catalogId);
      if (!renderer) {
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

    renderedNodeIds.push(treeNode.id);

    // Render the node — pass a renderChildren callback for JSX nesting
    renderer(resolved, ctx, () => {
      for (const child of treeNode.children) {
        walkNode(child);
      }
    });
  }

  walkNode(tree);

  const componentName = screenToPascalCase(spec.screen);
  const jsx = builder.build(componentName);

  return {
    jsx,
    warnings,
    nodeIds: renderedNodeIds,
  };
}
