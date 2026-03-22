# Lessons Learned

## Clean Code Discipline
**Context:** Monorepo-wide code quality  
**Rule:** Never leave dead code (unused imports, variables, etc.) even if pre-existing. Fix all issues across the full codebase, not just the files you touched.  
**Why:** Production-quality, push-ready code is the baseline. Unused imports and skipped test runs violate software design principles and block clean pushes.  
**How to apply:** After any change, run full typecheck + tests across the entire monorepo. Fix all errors — not just in changed files. Do not declare done until `nx run-many -t typecheck` and all tests pass clean.

---

## Engine Test Strategy
**Context:** `services/engine` — orchestration engine tests  
**Rule:** Always test through real server API endpoints, never by compiling LangGraph graphs directly.  
**Why:** Direct graph compilation bypasses server-level logic (request parsing, phase config lookup, graph compilation, async task management) and can mask bugs like the hardcoded `interrupt_before` issue. Tests must validate real behavior, not workarounds.  
**How to apply:**
- Use the `client` fixture (`httpx AsyncClient` + `ASGITransport`) to call endpoints: `/phase/start`, `/gate/approve`, `/status`, etc.
- Use `asyncio.sleep()` to wait for async graph execution between `start`/`approve` calls.
- Use `load_tasks()` to verify state transitions on disk.
- Add regression tests in `TestPerPhaseInterruptRegression` for any new phase-specific fixes.

---

## ADR-021: Single on_complete Emission Rule
**Context:** `packages/core/src/agent-runtime/base-agent.ts`
**Rule:** workFn implementations must NOT manually emit the `on_complete` event type. `runAgent()` is the single source of on_complete emission.
**Why:** Double emission produces duplicate audit entries, triggers downstream subscribers twice (orchestrator, V3 dashboard WebSocket), and violates PRD Section 10.1 which specifies on_complete fires once per task completion.
**How to apply:** When writing agent work functions, return detailed data via `Ok(output)`. Never call `ctx.eventBus.publish({ type: contract.on_complete, ... })` inside workFn. For intermediate progress, emit a *different* event type (e.g. progress events).

---

## ADR-022: TypeScript-Only Engine
**Context:** PRD Section 4.3 specifies Python/LangGraph engine
**Rule:** The implementation uses TypeScript-only orchestration. No Python process, no REST/gRPC bridge.
**Why:** All behavioral requirements pass in TypeScript. Single-process simplicity, better type safety, simpler deployment. LangGraph features (graph persistence, visualization) deferred to V3 Dashboard and Phase 2 Redis migration.
**How to apply:** When referencing architecture, use the TypeScript package names (@agentforge/core, @agentforge/governance). Do not assume a Python sidecar exists.

---

## Phase C: Visual Self-Correction Loop — Issue Tracker

**Context:** `packages/agents-ux/src/ux-design/design-fixer.ts` + `ux-dashboard-design.ts`
**File:** The self-correction loop (Phase C) captures a Figma screenshot, evaluates it with vision LLM, generates fix steps, and executes them via TalkToFigma bridge.

### Resolved Issues

| # | Issue | Symptom | Root Cause | Fix | Files |
|---|-------|---------|------------|-----|-------|
| 1 | **`set_text_content` missing nodeId** | `ERR: Missing nodeId parameter` | `create_text` returns a new node ID but fixer didn't pass it to the follow-up `set_text_content` | Added `$step:N` reference syntax + auto-link from preceding `create_text` | `design-fixer.ts` |
| 2 | **`set_item_spacing` wrong param name** | `ERR: At least one of itemSpacing or counterAxisSpacing must be provided` | LLM generates `spacing` instead of `itemSpacing` | Normalize `spacing` → `itemSpacing` in fixer | `design-fixer.ts` |
| 3 | **`set_padding`/`set_item_spacing` before `set_layout_mode`** | `ERR: Padding can only be set on auto-layout frames` | LLM generates steps in wrong order; Figma requires `layoutMode != NONE` first | Added `reorderStepsForLayoutDeps()` to auto-sort | `design-fixer.ts` |
| 4 | **`move_node` missing coordinates** | `ERR: Missing x or y parameters` | LLM omits x/y from move_node params | Pre-flight validation skips move_node without both x and y | `design-fixer.ts` |
| 5 | **Fixer creates duplicates instead of modifying** | Score stays at 72/100 across all corrections; duplicate nodes pile up | System prompt didn't instruct to modify existing nodes | Rewrote prompt: "ALWAYS modify EXISTING nodes. DO NOT create duplicates." | `design-fixer.ts` |
| 6 | **`set_layout_mode` on RECTANGLE** | `ERR: Node type RECTANGLE does not support layoutMode` | Fixer has no knowledge of Figma node types | Track node types during Phase B creation; pass to fixer; pre-flight `checkToolCompatibility()` skips incompatible ops | `design-fixer.ts`, `ux-dashboard-design.ts` |
| 7 | **`set_text_content` on FRAME** | `ERR: Node is not a text node` | Same as #6 — no node type awareness | `checkToolCompatibility()` blocks TEXT-only tools on non-TEXT nodes | `design-fixer.ts` |
| 8 | **`create_frame` inside RECTANGLE** | `ERR: Parent node does not support children` | RECTANGLE nodes can't have children | `checkParentCompatibility()` blocks create ops with non-FRAME parents | `design-fixer.ts` |
| 9 | **`$step:N` cascading failures** | 5+ ERR lines when one create fails | Failed create → subsequent steps reference `$step:N` that doesn't exist → each fails individually | `hasBrokenDependency` flag silently skips all downstream `$step:N` dependents | `design-fixer.ts` |
| 10 | **Deleted nodes stay in nodeMap** | Correction 2 tries to delete already-deleted node → ERR | `delete_node` success not reflected in `figmaNodeIds`/`figmaNodeTypes` | `FixResult` returns `deletedNodeIds`; loop removes them from both maps | `design-fixer.ts`, `ux-dashboard-design.ts` |
| 11 | **nodeTypes stale after delete+recreate** | Fixer still thinks node is RECTANGLE after it was replaced with FRAME | `figmaNodeTypes` not updated when fixer creates replacement nodes | `FixResult` returns `createdNodeTypes`; loop merges them | `design-fixer.ts`, `ux-dashboard-design.ts` |
| 12 | **nodeId resolves to `undefined`** | `ERR: Node with ID undefined not found` (15+ times) | LLM targets child nodes (table rows/cells) not in nodeMap; auto-resolve fails silently | Pre-flight validation skips any mutation tool where nodeId is missing/undefined | `design-fixer.ts` |
| 13 | **LLM generates 20+ steps per issue** | Excessive API calls, most failing | Prompt says "1-5 steps" but LLM ignores it for complex components | Hard cap `MAX_STEPS_PER_ISSUE = 10` | `design-fixer.ts` |
| 14 | **`set_text_content` missing `text` param** | `ERR: Missing text parameter` | LLM puts text in wrong param or omits it | Validate `text` param exists before executing | `design-fixer.ts` |
| 15 | **`set_fill_color` with non-object color** | `ERR: cannot convert to object` | LLM generates color as string instead of `{r,g,b,a}` object | Validate color is an object before executing | `design-fixer.ts` |

### Env Var Issues

| # | Issue | Symptom | Fix |
|---|-------|---------|-----|
| 16 | **Env var naming mismatch** | Phase C skipped — token/fileId not found | Fall back to `FIGMA_ACCESS_TOKEN` / `FIGMA_TEST_FILE_ID` when `AGENTFORGE_MCP_FIGMA_*` not set |
| 17 | **No plugin connection prompt** | Bridge connects to random channel; Figma plugin on different channel | Added channel discovery via `/channels` endpoint + user prompt to connect plugin |
| 18 | **Screenshot returns null** | `Figma returned null image URL after 2 attempts` | Increased retries to 4 with progressive delay (3s, 6s, 9s); added 5s pre-screenshot delay |

### Known Remaining Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 19 | **Score plateau at 72-75** | Open | Corrections execute successfully but score barely improves. The evaluator may report the same issues even after valid fixes. Possible causes: (a) fixes create new nodes in wrong position, (b) evaluator doesn't see the fixed nodes, (c) chart/table components need structural changes the fixer can't do with available tools |
| 20 | **Table duplicate headers** | Open | CostDataTable gets duplicate column headers (Agent/Model/Tokens/Cost appears twice). Fixer creates new text nodes instead of modifying existing ones for sub-components |
| 21 | **Chart area mostly empty** | Open | CostTrendChart placeholder is a rectangle — fixer replaces it with a frame but can't draw actual chart lines/bars with available Figma tools |

### Design Principles Learned

1. **Always pass node types to LLM** — Without knowing FRAME vs RECTANGLE vs TEXT, the LLM generates impossible operations.
2. **Pre-flight validation > post-failure logging** — Skip bad operations before they hit Figma. Reduces noise and API calls.
3. **Track all state changes** — Deletes, creates, and type changes must all flow back to the caller's nodeMap.
4. **Cap LLM output** — Hard limits on step count prevent runaway fix generation.
5. **Dependency chains need explicit tracking** — When step 2 depends on step 0's output, failure of step 0 must cascade cleanly.
