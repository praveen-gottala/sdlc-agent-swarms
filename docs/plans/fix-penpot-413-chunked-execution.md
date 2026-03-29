# Plan: Fix HTTP 413 — Chunked Penpot Script Execution

## Context

The DesignSpec v2 renderer generates a single Penpot JavaScript script (117,566 chars for 158 shapes). When sent via `execute_code` MCP tool call, the JSON-RPC envelope + JSON escaping pushes the HTTP POST body past the Penpot MCP server's limit (~100KB), resulting in HTTP 413 (Payload Too Large).

The fix must split large scripts into a small number of chunks (2-4, NOT 50+) per `docs/lessons-learned.md` guidance against micro-step fragmentation.

## Approach: Chunked Rendering with ID-Based Recovery

Split the rendered script at the **renderer level** into self-contained chunks, using `page.getShapeById()` (already proven in `deleteRootShape()`) to recover parent references across chunks.

### Why not alternatives?
- **String splitting at execution level**: Fragile — can break variable scopes, nested blocks
- **Minification only**: 117K → ~75K still exceeds limit after JSON escaping; not durable for larger screens
- **Increase server limit**: External dependency (official Penpot MCP server), not in our control

## Implementation Steps

### Step 1: Add `charCount()` to `ScriptBuilder`
**File:** `packages/designspec-renderer/src/renderer/penpot/script-builder.ts`

Add method to estimate script size without joining:
```typescript
charCount(): number {
  let total = 0;
  for (const line of this.lines) total += line.length + 1;
  return total;
}
```

### Step 2: Add chunk-aware preamble/postamble helpers
**File:** `packages/designspec-renderer/src/renderer/penpot/script-preamble.ts`

Add:
- `emitChunkSetupPostamble(builder, rootVar)` — stores root ref in `globalThis.__af_root`, returns `{ rootId }`
- `emitChunkRecoveryPreamble(builder, rootIdVar)` — recovers root via `penpot.currentPage.getShapeById(rootId)` (safe fallback if globalThis doesn't persist)
- `emitChunkPostamble(builder, nodeIdEntries, isLast)` — returns nodeIds, cleans up `globalThis.__af_root` on last chunk

### Step 3: Implement `renderToScriptChunks()` (core logic)
**File:** `packages/designspec-renderer/src/renderer/penpot/index.ts`

**Two-pass algorithm:**

**Pass 1 — Pre-render subtrees:**
- Build tree from flat adjacency list (reuse `buildTree()`)
- For each direct child of root, render its entire subtree into an isolated `ScriptBuilder`
- Collect `{ childId, script: string, nodeIdEntries, warnings }` per subtree

**Pass 2 — Group into chunks:**
- Chunk 0: Preamble + root board creation + root's direct property setup → returns `{ rootId }`
- Greedy bin-packing: add subtrees to current chunk while `preambleSize + subtreeChars < maxChunkChars` (default 80,000)
- Each continuation chunk: Preamble + root recovery by ID + subtree scripts + `root.appendChild(subtreeRoot)` + returns `{ nodeIds }`
- Last chunk cleans up `globalThis.__af_root`

**Fast path:** If total script size <= `maxChunkChars`, return single chunk identical to `renderToScript()` output (backward compatible).

**New types:**
```typescript
export interface ChunkedRenderResult {
  readonly chunks: readonly string[];
  readonly totalChars: number;
  readonly warnings: readonly string[];
  readonly nodeIds: readonly string[];
}
```

### Step 4: Export from barrel
**File:** `packages/designspec-renderer/src/index.ts`

Export `renderToScriptChunks` and `ChunkedRenderResult`.

### Step 5: Add `executeChunkedScript()` to design agent
**File:** `packages/agents-ux/src/ux-design/ux-penpot-design.ts`

- Execute chunk 0, extract `rootId`
- Execute chunks 1..N sequentially, pass `rootId` as parameter, accumulate `nodeIds`
- If any chunk fails, return error immediately
- Log progress: `[penpot v2] Executing chunk 1/3...`

### Step 6: Update call sites
**File:** `packages/agents-ux/src/ux-design/ux-penpot-design.ts`

Two call sites:
1. **Line ~1318** (`penpotDesignWorkV2`): Replace `renderToScript` → `renderToScriptChunks`
2. **Line ~1154** (`runV2CorrectionLoop`): Same replacement for re-renders after correction

### Step 7: Tests & docs
- Unit tests for chunk rendering
- Update `docs/design-pipeline-dataflow.md`

## Critical Files

| File | Change |
|------|--------|
| `packages/designspec-renderer/src/renderer/penpot/script-builder.ts` | Add `charCount()` |
| `packages/designspec-renderer/src/renderer/penpot/script-preamble.ts` | Add chunk-aware emitters |
| `packages/designspec-renderer/src/renderer/penpot/index.ts` | Add `renderToScriptChunks()` |
| `packages/designspec-renderer/src/index.ts` | Export new function/types |
| `packages/agents-ux/src/ux-design/ux-penpot-design.ts` | Add `executeChunkedScript()`, update 2 call sites |
| `packages/designspec-renderer/src/renderer/penpot/render-to-script.test.ts` | Chunk rendering tests |

## Verification

1. `nx test designspec-renderer` — new chunk tests pass
2. `nx test agents-ux` — execution tests pass
3. `nx run-many -t typecheck` — no type errors
4. Manual: Run `design:penpot` on the pets-platform project — should execute in 2-3 chunks without 413
