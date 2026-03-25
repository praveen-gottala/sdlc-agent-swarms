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

**Context:** `packages/agents-ux/src/ux-design/design-fixer.ts` + `ux-design.ts`
**File:** The self-correction loop (Phase C) captures a Figma screenshot, evaluates it with vision LLM, generates fix steps, and executes them via TalkToFigma bridge.

### Resolved Issues

| # | Issue | Symptom | Root Cause | Fix | Files |
|---|-------|---------|------------|-----|-------|
| 1 | **`set_text_content` missing nodeId** | `ERR: Missing nodeId parameter` | `create_text` returns a new node ID but fixer didn't pass it to the follow-up `set_text_content` | Added `$step:N` reference syntax + auto-link from preceding `create_text` | `design-fixer.ts` |
| 2 | **`set_item_spacing` wrong param name** | `ERR: At least one of itemSpacing or counterAxisSpacing must be provided` | LLM generates `spacing` instead of `itemSpacing` | Normalize `spacing` → `itemSpacing` in fixer | `design-fixer.ts` |
| 3 | **`set_padding`/`set_item_spacing` before `set_layout_mode`** | `ERR: Padding can only be set on auto-layout frames` | LLM generates steps in wrong order; Figma requires `layoutMode != NONE` first | Added `reorderStepsForLayoutDeps()` to auto-sort | `design-fixer.ts` |
| 4 | **`move_node` missing coordinates** | `ERR: Missing x or y parameters` | LLM omits x/y from move_node params | Pre-flight validation skips move_node without both x and y | `design-fixer.ts` |
| 5 | **Fixer creates duplicates instead of modifying** | Score stays at 72/100 across all corrections; duplicate nodes pile up | System prompt didn't instruct to modify existing nodes | Rewrote prompt: "ALWAYS modify EXISTING nodes. DO NOT create duplicates." | `design-fixer.ts` |
| 6 | **`set_layout_mode` on RECTANGLE** | `ERR: Node type RECTANGLE does not support layoutMode` | Fixer has no knowledge of Figma node types | Track node types during Phase B creation; pass to fixer; pre-flight `checkToolCompatibility()` skips incompatible ops | `design-fixer.ts`, `ux-design.ts` |
| 7 | **`set_text_content` on FRAME** | `ERR: Node is not a text node` | Same as #6 — no node type awareness | `checkToolCompatibility()` blocks TEXT-only tools on non-TEXT nodes | `design-fixer.ts` |
| 8 | **`create_frame` inside RECTANGLE** | `ERR: Parent node does not support children` | RECTANGLE nodes can't have children | `checkParentCompatibility()` blocks create ops with non-FRAME parents | `design-fixer.ts` |
| 9 | **`$step:N` cascading failures** | 5+ ERR lines when one create fails | Failed create → subsequent steps reference `$step:N` that doesn't exist → each fails individually | `hasBrokenDependency` flag silently skips all downstream `$step:N` dependents | `design-fixer.ts` |
| 10 | **Deleted nodes stay in nodeMap** | Correction 2 tries to delete already-deleted node → ERR | `delete_node` success not reflected in `figmaNodeIds`/`figmaNodeTypes` | `FixResult` returns `deletedNodeIds`; loop removes them from both maps | `design-fixer.ts`, `ux-design.ts` |
| 11 | **nodeTypes stale after delete+recreate** | Fixer still thinks node is RECTANGLE after it was replaced with FRAME | `figmaNodeTypes` not updated when fixer creates replacement nodes | `FixResult` returns `createdNodeTypes`; loop merges them | `design-fixer.ts`, `ux-design.ts` |
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

| 22 | **`create_ellipse` unsupported by bridge** | `ERR: Unknown command: create_ellipse` | Tool is in `TALK_TO_FIGMA_TOOLS` list but bridge doesn't implement it; LLM generates it for chart data points | **Root cause fix (ADR-027):** Removed `create_ellipse` from `TALK_TO_FIGMA_TOOLS`, agent contract, and `ALLOWED_TOOLS`. Added `GET /tools` endpoint to bridge patch for dynamic tool discovery. `discoverTools()` queries bridge at runtime and filters `TALK_TO_FIGMA_TOOLS` in `listTools()`. Prompt suggests `create_rectangle` + `set_corner_radius` as alternative. | `talk-to-figma-transport.ts`, `ux-design.ts`, `design-fixer.ts`, `figma-preflight.ts`, `patch-channels-endpoint.js` |

| 23 | **`set_corner_radius` missing `radius` param** | `ERR: TalkToFigma: Missing radius parameter` | LLM generates `set_corner_radius` without `radius` or uses `cornerRadius` instead | Pre-flight validation: normalize `cornerRadius` → `radius`, skip if still missing | `design-fixer.ts` |
| 24 | **`set_fill_color`/`set_corner_radius` SKIP after create** | `SKIP: no valid nodeId` | LLM generates mutation tool after `create_*` but doesn't use `$step:N` — nodeId is empty | Auto-link: if mutation tool has no nodeId, find the most recent preceding `create_*` step's output | `design-fixer.ts` |
| 25 | **4 phantom tools never worked** | `create_component`, `create_instance`, `set_name`, `set_opacity` listed in TALK_TO_FIGMA_TOOLS but not implemented by upstream plugin | **ADR-028:** Removed all 4. Real upstream tool is `create_component_instance`. Full tool list aligned with upstream (39 tools). | `talk-to-figma-transport.ts`, `ux-design.ts`, `design-fixer.ts`, `design-collaboration.ts` |
| 26 | **17 upstream tools missing** | Agent had no access to `get_node_info`, `scan_nodes_by_types`, `export_node_as_image`, batch tools, etc. | **ADR-028:** Added all 21 upstream tools we were missing. Fixer now has `scan_nodes_by_types` (find existing nodes) and `get_node_info` (inspect before modify). | All tool files |

### Known Remaining Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 19 | **Score plateau at 72-75** | Mitigated | Previously: fixer was blind — couldn't inspect nodes. Now has `get_node_info`, `scan_nodes_by_types`, `set_effects` (shadows), `set_font_properties`. Re-test needed. |
| 20 | **Table duplicate headers** | Mitigated | Previously: fixer couldn't find existing text nodes. Now has `scan_text_nodes` and `scan_nodes_by_types`. Prompt updated with TIP to scan before creating. Re-test needed. |
| 21 | **Chart area mostly empty** | Fixed | **ADR-029:** Patched plugin with `create_vector` (SVG paths for trend lines), `create_line` (axes/grid), `create_ellipse` (data points). Design prompt updated with chart drawing instructions. Re-test needed. |

### Design Principles Learned

1. **Always pass node types to LLM** — Without knowing FRAME vs RECTANGLE vs TEXT, the LLM generates impossible operations.
2. **Pre-flight validation > post-failure logging** — Skip bad operations before they hit Figma. Reduces noise and API calls.
3. **Track all state changes** — Deletes, creates, and type changes must all flow back to the caller's nodeMap.
4. **Cap LLM output** — Hard limits on step count prevent runaway fix generation.
5. **Dependency chains need explicit tracking** — When step 2 depends on step 0's output, failure of step 0 must cascade cleanly.

---

## No Shortcuts — Ever

**Context:** Penpot design tool integration (ADR-030)
**Rule:** Never take shortcuts to get something "working". If a design is wrong, fix it properly — don't patch around it.

### Shortcuts taken (and regretted):
1. **Manual `cp` of prompt files** — The build system (`tsc`) doesn't copy `.md` files. Instead of fixing the build pipeline properly, we manually ran `cp -r src/prompts dist/prompts` and forgot it across runs. This caused the LLM to use a stale prompt and generate Figma-style output for Penpot.
2. **Copy-pasted self-correction loop** — Phase C was copy-pasted from the Figma pipeline with quick edits instead of building a shared `DesignCorrectionLoop` that takes an adapter. This led to duplicated logic, inconsistent error handling, and the fixer LLM using `createFrame` (Figma) instead of `createBoard` (Penpot).
3. **Many micro-steps instead of one script** — Generated 57-107 individual `execute_code` calls instead of one consolidated script. Each micro-step adds network overhead, storage reference fragility, and makes debugging harder.
4. **Hardcoded API docs in prompt** — Instead of dynamically fetching the actual Penpot API via `high_level_overview` and `penpot_api_info` tools, we hand-wrote API docs in the prompt. The LLM then hallucinated methods that don't exist.

### The proper approach:
1. **Fix the build system** — Non-TS assets must be part of the build pipeline, not manual steps.
2. **Dynamic API discovery** — Feed the LLM the real API from the tool's own documentation endpoint, not handwritten summaries.
3. **Single script generation** — One `execute_code` call with the full design script. No storage fragility, no 100+ network calls.
4. **Shared abstractions** — The correction loop, evaluator, and screenshot capture should be adapter-aware and shared, not copy-pasted per tool.
5. **Tests first** — Parser tests, transport tests, and integration tests before shipping.

---

## Mock-Only Tests Hide Wiring Bugs

**Context:** `design:figma` pipeline — PRD not passed, design system not wired
**Rule:** Mock-only tests are insufficient for multi-stage pipelines. Every file-loading path and stage-to-stage data handoff needs at least one test that verifies real data flows through.

### Bugs that went undetected:
1. **PRD not passed** — Research stage received `["home"]` instead of full PRD content. Every test mocked the LLM provider, so nobody noticed the prompt contained one word instead of a full document.
2. **Design system not wired** — `buildDesignSystemContextFromSpec` was exported, tested in isolation, but never called from `design:figma`. Every test mocked the filesystem, so nobody noticed design tokens were never loaded.

### What we added to prevent recurrence:
1. **CLI file-loading integration tests** — Use `mkdtempSync` + real files on disk. See `design-figma-integration.test.ts`.
2. **Pipeline wiring smoke test** — Spy provider captures prompts; asserts that PRD content, design tokens, and design system prompt actually appear in LLM calls. See `pipeline-wiring-smoke.test.ts`. Runs in CI, no API key needed.
3. **Runtime input validation guards** — Each pipeline stage now validates its inputs and warns/errors on degenerate data (e.g., `prdRequirements` with only short labels).
4. **Dead-code detection script** — `scripts/check-unused-exports.sh` finds exported symbols with zero external consumers.
5. **CLAUDE.md rules** — "CLI Command File-Loading Tests" and "Data Flow Coverage" sections codify the testing requirements.

---

## Mocks Belong Only in Test Files (*.test.ts)

**Context:** `design-figma.ts`, `design-penpot.ts`, `design-penpot-browser.ts`, `design-penpot-all.ts`, `run-module-pipeline.ts`
**Rule:** `createMock*()` functions and fake/stub implementations must only exist in `*.test.ts` files. Every other file must use real implementations.

### The bug:
Agent contexts in CLI commands were created with `createMockFs()` — a fake filesystem where `exists()` always returns `false` and `readFile()` always returns `Err`. When the planning stage called `loadDesignTokens(context.projectRoot, context.fs)`, it used this mock filesystem, silently failing to find design tokens that existed on disk. The warning said "no design tokens found" — a plausible message that hid the real cause.

### Why it went undetected:
- The mock satisfied the TypeScript compiler — no type errors.
- `exists()` returning `false` is a valid "file not found" response, not a crash.
- The warning message blamed missing files, not a fake filesystem.
- `createRealFs()` was already imported in every affected file but wasn't used in context creation.

### Rules to prevent recurrence:
1. **Mocks belong in `*.test.ts` files only.** If you see `createMock*()` in any other file, it's a bug.
2. **If an interface dependency isn't needed yet, make it optional** — don't fill it with a fake.
3. **A stub that returns "not found" is worse than a crash** — crashes get fixed immediately, silent degradation gets shipped.
4. **When creating contexts/configs, use real implementations** — `createRealFs()`, not `createMockFs()`.
