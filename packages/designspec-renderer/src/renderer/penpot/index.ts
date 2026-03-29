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
import { emitPreamble, emitPostamble, emitChunkSetupPostamble, emitChunkRecoveryPreamble, emitChunkContinuationPostamble } from './script-preamble.js';
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
    effectiveWidth: spec.width,
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
      // getCatalogRenderer always returns a renderer:
      // dedicated renderer → fuzzy base match → generic catalog renderer
      renderer = getCatalogRenderer(resolved.catalogId);
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

    // Narrow effectiveWidth for children when this node has an explicit numeric width
    const nodeSpec = spec.nodes[treeNode.id];
    const prevEffectiveWidth = ctx.effectiveWidth;
    if (typeof nodeSpec?.width === 'number') {
      ctx.effectiveWidth = nodeSpec.width;
    }

    // Recursively render children
    for (const child of treeNode.children) {
      walkNode(child, varName);
    }

    // Restore effective width
    ctx.effectiveWidth = prevEffectiveWidth;
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

/** Result of chunked rendering. */
export interface ChunkedRenderResult {
  /** Ordered script chunks. Chunk 0 creates the root board. */
  readonly chunks: readonly string[];
  /** Total chars across all chunks. */
  readonly totalChars: number;
  /** Warnings encountered during rendering. */
  readonly warnings: readonly string[];
  /** All node IDs that were rendered. */
  readonly nodeIds: readonly string[];
}

/** Default max chars per chunk (safe under ~100KB JSON-RPC limit after escaping). */
/** Default max chars per chunk. JSON-RPC escaping roughly doubles size, so 40K script ≈ 80K payload (under 100KB limit). */
const DEFAULT_MAX_CHUNK_CHARS = 40_000;

/**
 * Render a DesignSpecV2 to chunked Penpot scripts.
 *
 * Fast path: if total script fits in one chunk, returns a single chunk
 * identical to renderToScript().
 *
 * Slow path: renders root + each direct child subtree separately,
 * then groups subtrees into chunks using greedy bin-packing.
 * Chunk 0 creates the root board. Subsequent chunks recover the root
 * by ID and appendChild their subtrees.
 */
export function renderToScriptChunks(
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
  maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS,
): ChunkedRenderResult {
  // First try the single-script path
  const singleResult = renderToScript(spec, tokens, catalog);
  if (singleResult.script.length <= maxChunkChars) {
    return {
      chunks: [singleResult.script],
      totalChars: singleResult.script.length,
      warnings: singleResult.warnings,
      nodeIds: singleResult.nodeIds,
    };
  }

  // Need chunking — re-render with subtree isolation
  const colorMap = buildTokenMap(tokens);
  const tree = buildTree(spec.nodes);
  const allWarnings: string[] = [];
  const allNodeIds: string[] = [];
  let varCounter = 0;

  // Helper to create a walkNode function for a given context
  function createWalker(ctx: RenderContext) {
    return function walkNode(treeNode: TreeNode, parentVar: string | null): string | undefined {
      const resolved = resolveNode(treeNode.id, spec.nodes[treeNode.id], catalog);

      let renderer = resolved.type
        ? getAcceleratorRenderer(resolved.type)
        : undefined;

      if (!renderer && resolved.type) {
        allWarnings.push(`No renderer for accelerator type "${resolved.type}" (node: ${treeNode.id})`);
        return undefined;
      }

      if (!renderer && resolved.catalogId) {
        renderer = getCatalogRenderer(resolved.catalogId);
      }

      if (!renderer) {
        allWarnings.push(`Node "${treeNode.id}" has neither type nor catalog — skipping`);
        return undefined;
      }

      const varName = renderer(resolved, parentVar ?? '', ctx);

      const nodeSpec = spec.nodes[treeNode.id];
      const prevEffectiveWidth = ctx.effectiveWidth;
      if (typeof nodeSpec?.width === 'number') {
        ctx.effectiveWidth = nodeSpec.width;
      }

      for (const child of treeNode.children) {
        walkNode(child, varName);
      }

      ctx.effectiveWidth = prevEffectiveWidth;
      return varName;
    };
  }

  // ── Pass 1: Render root board (chunk 0) ──
  const chunk0Builder = new ScriptBuilder();
  const chunk0NodeIds: Array<{ varName: string; nodeId: string }> = [];
  const chunk0Ctx: RenderContext = {
    builder: chunk0Builder,
    colorMap,
    tokens,
    catalog,
    screenWidth: spec.width,
    effectiveWidth: spec.width,
    nextVarId: () => varCounter++,
    trackNode: (varName, nodeId) => {
      chunk0NodeIds.push({ varName, nodeId });
      allNodeIds.push(nodeId);
    },
  };

  emitPreamble(chunk0Builder, colorMap);

  // Render ONLY the root node (no children)
  const rootResolved = resolveNode(tree.id, spec.nodes[tree.id], catalog);
  let rootRenderer = rootResolved.type ? getAcceleratorRenderer(rootResolved.type) : undefined;
  if (!rootRenderer && rootResolved.catalogId) rootRenderer = getCatalogRenderer(rootResolved.catalogId);
  if (!rootRenderer) {
    // Fallback: return single script even if too large
    return {
      chunks: [singleResult.script],
      totalChars: singleResult.script.length,
      warnings: [...singleResult.warnings, 'Could not chunk: no root renderer'],
      nodeIds: singleResult.nodeIds,
    };
  }
  const rootVar = rootRenderer(rootResolved, '', chunk0Ctx);

  emitChunkSetupPostamble(chunk0Builder, rootVar, chunk0NodeIds);
  const chunk0Script = chunk0Builder.build();

  // ── Pass 2: Render each direct child subtree into isolated scripts ──
  interface SubtreeScript {
    childId: string;
    script: string;
    nodeIdEntries: Array<{ varName: string; nodeId: string }>;
    chars: number;
  }

  const subtrees: SubtreeScript[] = [];

  for (const childTree of tree.children) {
    const subBuilder = new ScriptBuilder();
    const subNodeIds: Array<{ varName: string; nodeId: string }> = [];

    const subCtx: RenderContext = {
      builder: subBuilder,
      colorMap,
      tokens,
      catalog,
      screenWidth: spec.width,
      effectiveWidth: spec.width,
      nextVarId: () => varCounter++,
      trackNode: (varName, nodeId) => {
        subNodeIds.push({ varName, nodeId });
        allNodeIds.push(nodeId);
      },
    };

    const walker = createWalker(subCtx);
    walker(childTree, '__root');

    subtrees.push({
      childId: childTree.id,
      script: subBuilder.build(),
      nodeIdEntries: subNodeIds,
      chars: subBuilder.charCount(),
    });
  }

  // ── Pass 3: Split oversized subtrees ──
  // If a single subtree exceeds maxChunkChars, re-render its direct children
  // as separate subtrees (the parent becomes its own mini-subtree)
  const splitSubtrees: SubtreeScript[] = [];

  for (const sub of subtrees) {
    if (sub.chars <= maxChunkChars) {
      splitSubtrees.push(sub);
      continue;
    }

    // Find this child's TreeNode to get its grandchildren
    const childTreeNode = tree.children.find(c => c.id === sub.childId);
    if (!childTreeNode || childTreeNode.children.length === 0) {
      // Can't split further — use as-is (will create oversized chunk)
      splitSubtrees.push(sub);
      continue;
    }

    // Re-render: parent node alone (no children)
    const parentBuilder = new ScriptBuilder();
    const parentNodeIds: Array<{ varName: string; nodeId: string }> = [];
    const parentCtx: RenderContext = {
      builder: parentBuilder, colorMap, tokens, catalog,
      screenWidth: spec.width, effectiveWidth: spec.width,
      nextVarId: () => varCounter++,
      trackNode: (vn, nid) => { parentNodeIds.push({ varName: vn, nodeId: nid }); },
    };
    const parentResolved = resolveNode(childTreeNode.id, spec.nodes[childTreeNode.id], catalog);
    let parentRenderer = parentResolved.type ? getAcceleratorRenderer(parentResolved.type) : undefined;
    if (!parentRenderer && parentResolved.catalogId) parentRenderer = getCatalogRenderer(parentResolved.catalogId);
    if (parentRenderer) {
      parentRenderer(parentResolved, '__root', parentCtx);
    }
    // Parent node gets its own small subtree entry
    splitSubtrees.push({
      childId: sub.childId,
      script: parentBuilder.build(),
      nodeIdEntries: parentNodeIds,
      chars: parentBuilder.charCount(),
    });

    // Each grandchild becomes its own subtree, parented to the child via getShapeById
    for (const grandchild of childTreeNode.children) {
      const gcBuilder = new ScriptBuilder();
      const gcNodeIds: Array<{ varName: string; nodeId: string }> = [];
      const gcCtx: RenderContext = {
        builder: gcBuilder, colorMap, tokens, catalog,
        screenWidth: spec.width, effectiveWidth: spec.width,
        nextVarId: () => varCounter++,
        trackNode: (vn, nid) => { gcNodeIds.push({ varName: vn, nodeId: nid }); allNodeIds.push(nid); },
      };

      // The grandchild needs to find its parent by name in Penpot
      gcBuilder.comment(`Grandchild of ${sub.childId}: ${grandchild.id}`);
      gcBuilder.line(`const __parent_${grandchild.id.replace(/[^a-zA-Z0-9]/g, '_')} = __root.children.find(c => c.name === '${sub.childId}');`);
      gcBuilder.line(`const __gcParent = __parent_${grandchild.id.replace(/[^a-zA-Z0-9]/g, '_')} || __root;`);

      const gcWalker = createWalker(gcCtx);
      gcWalker(grandchild, '__gcParent');

      splitSubtrees.push({
        childId: grandchild.id,
        script: gcBuilder.build(),
        nodeIdEntries: gcNodeIds,
        chars: gcBuilder.charCount(),
      });
    }
  }

  // ── Pass 4: Group into chunks via greedy bin-packing ──
  const preambleEstimate = new ScriptBuilder();
  emitChunkRecoveryPreamble(preambleEstimate, colorMap);
  const preambleOverhead = preambleEstimate.charCount() + 500;

  const chunks: string[] = [chunk0Script];
  let currentSubtrees: SubtreeScript[] = [];
  let currentChars = preambleOverhead;

  function flushChunk(isLast: boolean) {
    if (currentSubtrees.length === 0) return;

    const chunkBuilder = new ScriptBuilder();
    const chunkNodeIds: Array<{ varName: string; nodeId: string }> = [];

    emitChunkRecoveryPreamble(chunkBuilder, colorMap);

    for (const sub of currentSubtrees) {
      chunkBuilder.comment(`Subtree: ${sub.childId}`);
      for (const line of sub.script.split('\n')) {
        if (line.trim()) chunkBuilder.line(line);
      }
      chunkNodeIds.push(...sub.nodeIdEntries);
    }

    emitChunkContinuationPostamble(chunkBuilder, chunkNodeIds, isLast);
    chunks.push(chunkBuilder.build());

    currentSubtrees = [];
    currentChars = preambleOverhead;
  }

  for (let i = 0; i < splitSubtrees.length; i++) {
    const sub = splitSubtrees[i];
    if (currentChars + sub.chars > maxChunkChars && currentSubtrees.length > 0) {
      flushChunk(false);
    }
    currentSubtrees.push(sub);
    currentChars += sub.chars;
  }
  flushChunk(true);

  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);

  return {
    chunks,
    totalChars,
    warnings: allWarnings,
    nodeIds: allNodeIds,
  };
}
