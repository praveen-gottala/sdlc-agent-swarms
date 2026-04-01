# Lessons Learned

## DesignSpec browser renderer — regression prevention
**Context:** `packages/designspec-renderer` — `DesignSpecRenderer.tsx`, catalog resolver, Vite iframe  
**Rule:** Catalog ID normalization must be shared (`normalizeCatalogIdToKebab` in `catalog/catalog-id.ts`). Color token names in `overrides` must not be applied as raw CSS — resolve via `resolveTokenColor` or filter non-CSS values in `getOverrideStyles`. After changing the renderer, hard-refresh the design page; restart port 4100 if the iframe still shows stale UI.  
**Why:** PascalCase-only `.toLowerCase()` broke `NavigationBar` → `navigation-bar` matching; unresolved token strings made chips look empty. Playwright often looked “correct” while a cached browser tab did not.  
**How to apply:** See `docs/design-review-session-handoff.md` section **Catching regressions next time**. Run `nx test designspec-renderer` including `catalog-id.test.ts`.  

---

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
| 16 | **Env var naming mismatch** | Phase C skipped — token/fileId not found | Set `AGENTFORGE_MCP_FIGMA_TOKEN` and `AGENTFORGE_MCP_FIGMA_FILE_ID` (no alternate names) |
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

---

## Test Fixtures Must Be Generic, Not App-Specific

**Context:** `packages/designspec-renderer` — DesignSpec v2 test fixtures
**Rule:** Test fixtures in platform packages must be generic and self-documenting. Never use app-specific data (app names, domain-specific content, branding) as test fixtures in a platform-level package.
**Why:** AgentForge is a generic SDLC platform that generates arbitrary applications. Fixtures tied to a specific app (e.g., "SplitEase", "bill-entry") create false coupling, confuse future contributors about the package's scope, and will need replacement when that app is removed.
**How to apply:**
- Use generic screen names: "settings-form", "dashboard-detail" — not "bill-entry", "split-breakdown"
- Use generic content: "AppName", "Account Settings" — not app-specific branding
- Use generic token names: `SAMPLE_TOKENS` — not `SPLITEASE_TOKENS`
- Token *values* can come from real projects for realism, but naming must be generic

---

## Override Key Naming: Check Both Aliases

**Context:** `packages/designspec-renderer/src/catalog/resolver.ts` — `resolveNode()`
**Rule:** When resolving overrides against catalog entries, check BOTH the node-level key name AND the catalog-level key name. Users write `overrides: { weight: 500 }` (node convention) but the catalog stores `text_weight: 600` (catalog convention).
**Why:** The resolver initially only checked `overrides.text_weight`, silently ignoring `overrides.weight`. This meant catalog components with `overrides: { weight: 500 }` would render with the catalog default weight instead.
**How to apply:** For any property where the node schema uses one name and the catalog uses another, the resolution chain must be: `overrides.nodeKey ?? overrides.catalogKey ?? node.nodeKey ?? entry.catalogKey`.

---

## Fixture Token Values Must Match Real Source of Truth

**Context:** `packages/designspec-renderer/src/__fixtures__/design-tokens.ts`
**Rule:** When a test fixture mirrors real project data (e.g., design tokens), it must be verified against the actual source file. Never hand-write token values from memory or plan documents.
**Why:** The initial fixture had wrong primitive names (e.g., `sage-green` instead of `deep-teal`), wrong typography weights (`heading-2: 600` instead of `700`), wrong shadow values, and wrong border radius values. All tests passed with wrong data — proving the tests validated code paths, not correctness.
**How to apply:** Always read the actual source file (e.g., `agentforge/spec/design-tokens.yaml`) and copy values directly. When the fixture is generic, document which real project it was derived from for future updates.

---

## Verify Renderer Output Against Real Working Scripts

**Context:** `packages/designspec-renderer/src/renderer/penpot/components/` — Penpot component renderers
**Rule:** When building a renderer that replaces an existing working pipeline, cross-reference every component renderer against the actual generated scripts (e.g., `split-easy/.agentforge/previews/*/scripts/design.js`). Do not implement from type signatures and assumptions alone.

### Bugs that cross-referencing would have caught:

1. **Shadow RGB 0-255 vs 0-1** — The real design.js uses `color: { r: 0.06, g: 0.43, b: 0.34, opacity: 0.06 }` (0-1 floats). The renderer emitted `r: 15, g: 110, b: 86` (raw 0-255 integers). The Penpot API uses 0-1 float range for r/g/b. Fix: divide by 255.
2. **Divider used createRectangle** — The real design.js uses `createBoard()` for everything including dividers. Rectangles may not participate in flex layouts the same way. Fix: use `emitBoard()`.
3. **Page missing x/y** — The real design.js explicitly sets `root.x = 0; root.y = 0;`. Without this, the page may appear at an arbitrary canvas position. Fix: add positioning after board creation.
4. **Stepper missing label** — The real design.js renders the label text left-aligned with controls right-aligned via `justify: space-between`. The renderer only emitted minus/count/plus with no label. Fix: add label + group controls in nested container.
5. **Shadow regex untested** — The regex was written but never tested against the actual shadow strings from design-tokens.yaml. It happened to work, but the RGB conversion was wrong.

**Root cause:** All 5 bugs share the same pattern — implementing from the plan's description and type definitions without opening the actual `design.js` file to see what working output looks like. The research agent returned this information, but the component renderer agents didn't use it as a verification checklist.

**How to apply:**
- Before implementing any component renderer, open the corresponding section in a real generated `design.js` and note the exact Penpot API calls, parameter formats, and value ranges.
- After implementing, spot-check the emitted script against the real one for at least one instance of each component type.
- For numeric values passed to Penpot APIs (colors, opacity, shadow params), verify the expected range (0-1 vs 0-255 vs pixels) from the API documentation or real scripts.
- Write at least one test that checks a specific numeric value in the output (e.g., shadow r/g/b values) against the known correct value.

---

## Catalog YAML: renderer_defaults and token_bindings both apply

**Context:** `packages/designspec-renderer/src/catalog/loader.ts` — `transformEntry()`
**Rule:** If a component entry defines `renderer_defaults`, the loader must still merge `token_bindings` (font → `text_typography`, border-radius, padding-x/y) and `spacing.internal_gap` → `gap`, same as entries without `renderer_defaults`. Early-returning after copying only `renderer_defaults` drops typography and other bindings from project catalogs (e.g. Card with `font: heading-3` in YAML).
**How to apply:** Share one `applyTokenBindings()` (and gap/min_height merge) used on both code paths.

---

## Penpot Plugin API Rules (Quick Reference)

**Context:** `packages/designspec-renderer/src/renderer/penpot/` — all Penpot script generation
**Crosswalk:** After changing emitters, update [designspec-renderer-penpot-api-crosswalk.md](designspec-renderer-penpot-api-crosswalk.md) (API inventory vs [doc.plugins.penpot.app](https://doc.plugins.penpot.app/) and component audit table).
**Rule:** These are hard rules about the Penpot plugin API. Violating any of them produces silent visual bugs.

### Shape creation
- Use `penpot.createBoard()` for ALL shapes — containers, dividers, spacers, buttons, badges, everything. Boards support flex layout.
- Use `penpot.createText(content)` for text only. Content goes in the constructor, NOT `shape.text = ...`.
- **NEVER** pass empty string `""` to `penpot.createText()` — it returns `undefined`. Use `" "` (space) for empty/placeholder text fields.
- **NEVER** use `createRectangle()`, `createEllipse()`, or other shape primitives — they don't support `layoutChild` properties.

### Flex layout
- Always set direction via `board.flex.dir = 'column'` (the board's `.flex` property), NEVER via the returned flex object (`const f = board.addFlexLayout(); f.dir = 'column'` — this silently fails).
- `appendChild(child)` must come BEFORE any `child.layoutChild.*` assignments. The `layoutChild` property doesn't exist until the child is in a flex parent.

### Numeric ranges
- Shadow r/g/b: **0-1 floats** (divide CSS rgba 0-255 values by 255)
- Shadow opacity (alpha): already 0-1, no conversion needed
- Fill opacity: 0-1 float
- Font weight: pass as **string** (`'700'`), not number

### Positioning and sizing
- Root page board: explicitly set `x = 0; y = 0;` after creation
- `shape.resize(width, height)` — width/height are READ-ONLY properties, use resize()
- When `width === 'fill'`, use `layoutChild.horizontalSizing = 'fill'` — the pixel width in `resize()` is just an initial hint that flex overrides

### Visual defaults from real design.js
- Divider fill opacity: `0.3` (not 1.0)
- Helper text opacity: `0.7`
- Text > 18 chars: `growType = 'auto-height'` with `resize(wrapWidth, fontSize * 2.2)`
- Every shape gets `setPluginData` calls for extraction (ds_id, ds_type/ds_catalog, ds_token_*)

---

## Penpot Text Objects Do NOT Support textAlign

**Context:** `packages/designspec-renderer/src/renderer/penpot/` — Penpot script generation
**Rule:** Penpot Text shapes are sealed objects — only pre-defined properties (`fontSize`, `fontWeight`, `fontFamily`, `fills`, `strokes`, `growType`) can be set. Setting `text.textAlign` throws `"Cannot add property textAlign, object is not extensible"`.
**Why:** Text alignment in Penpot is available via the TextRange API (`text.getRange().align = 'center'`) but NOT via direct property assignment on the Text shape. The LLM-generated scripts and the renderer both used `textAlign` incorrectly, causing runtime errors on replay.
**How to apply:**
- For the Penpot renderer, use the parent container's flex alignment (`justifyContent: 'center'`, `alignItems: 'center'`) to achieve visual centering. This works for single-line text and short labels.
- For multi-line paragraph centering, a future improvement could use the TextRange API, but this is not needed for the current renderer.
- Keep the `textAlign` field on `NodeSpec` — it's still useful for the React renderer (which uses Tailwind `text-center` class). Only the Penpot renderer should ignore it.
- When generating LLM prompts for Penpot scripts, explicitly instruct the model NOT to use `textAlign` on text shapes.

---

## Component Default Widths Should Use effectiveWidth

**Context:** `packages/designspec-renderer/src/renderer/penpot/components/` — all Penpot component renderers
**Rule:** Components inside containers should use `ctx.effectiveWidth` (the parent's constrained width) as their default width, not a hardcoded pixel value. The only exception is components with explicitly fixed dimensions (avatar circles, stepper buttons, icon containers) where the width IS the design intent.
**Why:** The stepper rendered at 160px (hardcoded default) inside a 600px content column. The working design.js renders it at CONTENT_W (600px) with `justify: space-between`, placing label left and controls right. With a narrow hardcoded width, elements stack or clip. `effectiveWidth` tracks the parent container's constrained width and narrows as the tree descends (e.g., 1440 → 600 when entering a content column).
**How to apply:**
- Default width pattern: `typeof node.width === 'number' ? node.width : ctx.effectiveWidth`
- Only use a hardcoded pixel default when the component has an inherently fixed size (avatar: 36px, stepper button: 40px, icon: 16px)
- `ctx.effectiveWidth` is set automatically by the tree walker when entering a container with an explicit numeric width
- `ctx.screenWidth` is reserved for truly full-width elements (page root, header bar)

---

## Future: Pipeline Integration Test (Phase 4)

**Context:** `packages/designspec-renderer` — validating renderer output matches real pipeline behavior
**Rule:** Before swapping the LLM script output for `renderToScript()` in `ux-penpot-design.ts`, add ONE integration test that uses actual project files.

**Test inputs (from any generated project):**
- `{project}/agentforge/spec/design-tokens.yaml` (real tokens)
- `{project}/agentforge/spec/component-catalog.yaml` (real catalog)
- A real screen spec JSON fixture (e.g., a settings or dashboard screen)

**What it validates:**
- Renderer produces output matching current `design.js` behavior — same Penpot API calls, same visual shapes, same token references.
- Separate from the generic unit tests (which use synthetic fixtures) — this crosses the package boundary.

**Location:** `packages/agents-ux/src/ux-design/__tests__/renderer-integration.test.ts`
(NOT in `packages/designspec-renderer` — this test belongs in the consumer package)

**Gate rule:** Do not swap `renderToScript()` into `ux-penpot-design.ts` until this test passes.

---

## Never Assume Coverage — Always Verify Mechanically

**Context:** Documentation audits, config completeness checks, test coverage reviews
**Rule:** Never claim something exists or is covered without mechanically verifying it. When any task involves checking completeness (documentation, configs, tests, coverage, API surface, etc.), always verify by reading the actual files or running a concrete check (grep, test run, etc.) — never rely on summaries, memory, or assumptions.
**Why:** During a CLI docs + VS Code debug config audit, 7 commands were assumed documented because they were "in the codebase." Mechanical verification (grepping docs for each command name) revealed none of the 7 had documentation.
**How to apply:** For any completeness task — doc coverage, test coverage, config completeness, feature parity, migration checklists — enumerate the full expected set, then verify each item exists with a concrete check (file read, grep, test run). Treat unverified claims as false until proven.

---

## Phase C Corrections Invalidate Phase D Node IDs

**Context:** `packages/agents-ux/src/ux-design/ux-penpot-design.ts` — V2 pipeline Phase C → Phase D handoff
**Rule:** When Phase C (self-correction loop) deletes and recreates the root shape, the new node IDs MUST be propagated to Phase D (snapshot capture). Using stale IDs from Phase B causes every export to fail with `Cannot read properties of null (reading 'export')`.
**Why:** `runV2CorrectionLoop()` calls `deleteRootShape()` + `executeRenderedScript()` on each correction iteration, producing entirely new shape IDs. But `penpotDesignWorkV2()` was passing the original `penpotNodeIds` from Phase B to `captureDesignSnapshot()`, ignoring the updated IDs.
**Symptoms:**
- `[export attempt 1/3] No image data` repeated 48+ times
- `Cannot read properties of null (reading 'export')` — null returned for deleted shape IDs
- Phase D takes 2+ minutes making 144 doomed MCP calls (48 components × 3 retries)
**Fix:**
1. `runV2CorrectionLoop()` now returns `updatedNodeIds` from the last correction iteration
2. `penpotDesignWorkV2()` uses `activeNodeIds` (updated from correction loop) for Phase D
3. `captureDesignSnapshot()` has fail-fast: stops after 5 consecutive export failures
4. `describeExportBlocks()` guards against null `exportValue` (was crashing on `Object.keys(null)`)

---

## Missing Catalog Renderers Must Be Added, Not Just Logged

**Context:** `packages/designspec-renderer/src/renderer/penpot/components/` — Penpot component registry
**Rule:** When the pipeline logs `No renderer for catalog "X" — falling back to container`, that catalog type needs a dedicated renderer. Container fallback produces a blank box with no anatomy (no track, no thumb, no label layout).
**Why:** The "switch" catalog type was defined in project YAML and in V2_BUILTIN_CATALOG but had no renderer. It rendered as a plain container — visually wrong for a toggle switch. The evaluator then flagged it as a "critical" issue, causing unnecessary correction iterations that couldn't fix the underlying missing renderer.
**How to apply:**
- After every pipeline run, check render warnings for `No renderer for catalog` messages
- Add the renderer + catalog entry + register in `components/index.ts` before re-running
- Use existing similar renderers as templates (e.g., checkbox for switch, badge for chip)

---

## Export Retry Must Fail Fast on Systemic Failures

**Context:** `packages/agents-ux/src/ux-design/capture-design-snapshot.ts` — Phase D snapshot
**Rule:** When exporting screenshots for N components, track consecutive failures. If 5+ exports fail in a row, stop immediately — the IDs are stale or the Penpot connection is broken.
**Why:** Without fail-fast, 48 components × 3 retries × 3s delay = 7+ minutes of wasted time and 144 error log lines. The root cause (stale IDs, disconnected plugin) won't be fixed by retrying.
**How to apply:** Use a `consecutiveFailures` counter. Reset on success, increment on failure, break the loop at threshold (5).

---

## Penpot MCP `export_shape` Is Broken — Use `execute_code` + `shape.export()`

**Context:** Penpot MCP server's `export_shape` tool — 0/261 successes in Docker logs
**Rule:** Never use the `export_shape` MCP tool. Always export shapes via `execute_code` with `shape.export()` directly.
**Why:** The Penpot MCP plugin's `export_shape` handler uses an internal shape lookup (`PluginBridge.handlePluginTaskResponse`, line 14232 in built server) that returns `null`, even though `execute_code` with `penpot.currentPage.getShapeById()` finds the same shapes successfully. Every call fails with `Cannot read properties of null (reading 'export')`.
**Evidence:** `docs/issues/penpot-mcp-issue.txt` — same shapeId succeeds with `execute_code` getShapeById, fails with `export_shape`. Pattern repeats for all 261 attempts, zero successes.
**Workaround code:**
```javascript
const shape = penpot.currentPage?.getShapeById(shapeId);
if (!shape) return { error: "Shape not found" };
const data = await shape.export({ type: "png", scale: 2 });
const bytes = new Uint8Array(data);
let binary = '';
for (let i = 0; i < bytes.byteLength; i++) {
  binary += String.fromCharCode(bytes[i]);
}
return { base64: btoa(binary) };
```
**Files changed:**
- `packages/agents-ux/src/ux-design/ux-penpot-design.ts` — `exportShapeViaExecuteCode()` + updated `exportShapeWithRetry()`
- `packages/agents-ux/src/ux-design/penpot-collaboration.ts` — `createPenpotReviewCallback()` uses execute_code
- `packages/core/src/mcp/penpot-adapter.ts` — `captureScreenshot()` uses execute_code
- `packages/agents-ux/src/ux-design/penpot-browser-agent.ts` — removed `export_shape` from tools list
- All agent contracts: removed `penpot:export_shape` from tools arrays

---

## DesignSpec v2: Separate WHAT from HOW

**Context:** `packages/designspec-renderer/` — DesignSpec v2 renderer pipeline
**Rule:** Separate the LLM's job (deciding WHAT to render as JSON) from the renderer's job (knowing HOW to call Penpot/React APIs). Never let the LLM generate API calls directly.
**Why:** When the LLM generated Penpot JS scripts directly, every Penpot API quirk (createBoard not createRectangle, 0-1 float colors, appendChild before layoutChild) had to be taught in the prompt. The LLM still hallucinated incorrect API calls ~30% of the time. With DesignSpec v2, the LLM outputs compact JSON (flat adjacency list of nodes with types and overrides), and the renderer deterministically translates to correct API calls. This eliminated all Penpot API bugs and reduced token usage ~89%.
**How to apply:** For any design tool integration, define an intermediate JSON schema that captures design intent without tool-specific API details. Build a deterministic renderer per target tool.

---

## Prompt Injection Order Matters: Tokens Before Examples

**Context:** `packages/agents-ux/src/prompts/ux-penpot-design-system.md` — design system prompt
**Rule:** Design tokens (colors, typography, spacing) must be injected BEFORE any examples in LLM prompts. Examples with hardcoded values placed before token injection will override the tokens.
**Why:** The planning agent's prompt had examples with hardcoded hex colors (`#1A1A2E`) placed before the `{{DESIGN_TOKENS}}` placeholder. The LLM used the example colors instead of the project's actual tokens, producing designs that ignored the user's chosen palette.
**How to apply:** In multi-section prompts, order sections as: (1) role/instructions, (2) design tokens/constraints, (3) examples (which reference token names, not hardcoded values), (4) task description.

---

## ADRs Must Describe Reality, Not Intent
**Context:** ADR-022 "TypeScript-Only Orchestration Engine"
**Rule:** An ADR with status "Accepted" must describe what IS implemented, not what SHOULD BE. If the implementation isn't complete, use status "Partially Implemented" or "Proposed."
**Why:** ADR-022 was marked Accepted but the Python engine was never removed and no TypeScript orchestrator was built. For months, docs contradicted the codebase in both directions — CLAUDE.md said Python (partially true), ADR-022 said TypeScript-only (also partially true). Neither was accurate.
**How to apply:** Before marking an ADR as Accepted, verify every claim against the actual codebase. If cleanup or migration work remains, list it explicitly in the ADR and keep status as "Partially Implemented" until done.

---

## Viewport Config: Project-Level with CLI Override

**Context:** `packages/core/src/config/viewport-resolver.ts` — viewport configuration
**Rule:** Viewport configuration should be project-level (in `agentforge.yaml`) with CLI flag override (`--viewport`). The planning agent should only generate responsive rules for configured viewports.
**Why:** Without project-level viewport config, the planning agent generated responsive rules for mobile/tablet/desktop/wide regardless of the project's target. A desktop-only dashboard app got mobile breakpoint rules that confused the design agent and wasted tokens.
**How to apply:** Use `resolveViewport(cliFlag?, projectConfig?)` which returns the effective viewport. Pass this to the planning agent so it generates rules only for relevant breakpoints.

---

## Renderer Staleness: Kill-and-Restart, Not Just Port-Check

**Context:** `packages/dashboard/src/app/api/_lib/renderer-manager.ts` — Vite renderer lifecycle
**Rule:** A TCP port check is insufficient to determine renderer health. The renderer-manager must track whether it started the process (vs an orphan from a previous session) and whether source files changed since startup.
**Why:** We spent significant debugging time on a blank iframe caused by a stale Vite process. The port was open (status: "ready"), but the running Vite was serving old code from a previous session. The dashboard had no way to detect this and no way to restart it — only "Retry" (which just re-checks the port).

### Symptoms of a stale renderer:
1. Port 4100 responds to TCP, but iframe is blank or shows old code
2. New `console.log` statements don't appear in browser console
3. Dashboard reports "ready" but `load-spec` messages have no effect

### What we added to prevent recurrence:
1. **Source mtime tracking** — `startRenderer()` records `main.tsx` mtime at spawn time. `getRendererStatus()` compares current mtime and returns `status: 'stale'` if files changed.
2. **Orphan detection** — If the port is open but `childPid` is null (process not spawned by this session), status returns `'stale'` with explanation.
3. **`restartRenderer()`** — Kills whatever is on the port (`lsof -ti:PORT | xargs kill -9`), waits 500ms for OS port release, then starts fresh.
4. **Auto-restart on stale** — `design-canvas.tsx` detects `status: 'stale'` and auto-calls `/api/renderer/restart` instead of showing a confusing "ready" state.
5. **Manual "Kill & Restart" button** — UI shows both "Retry" (soft re-check) and "Kill & Restart" (hard restart) when renderer is unavailable.
6. **`POST /api/renderer/restart` route** — Dedicated endpoint that kills + respawns.

### How to apply:
- Any time a child process is managed by a server, track: (a) who started it, (b) when, (c) what source version. Port-open alone is never enough.
- Always provide a "hard restart" escape hatch in the UI — users should never need to manually run `lsof` and `kill`.

---

## DesignSpec JSON → CSS Conversion Pipeline

**Context:** `packages/designspec-renderer/` — how DesignSpec v2 JSON becomes rendered UI
**Rule:** New layout properties must flow through ALL five layers: TypeScript types → tool schema → renderers → LLM prompts → correction adapter. Missing any layer causes silent failures.

### The conversion pipeline (data flow):

1. **LLM → DesignSpec JSON**: The LLM calls `submit_design` (tool schema in `submit-design-tool.ts`). The schema constrains output to valid `DesignSpecV2` structure. `LayoutSpec` fields like `dir`, `display`, `columns`, `wrap` are defined here.

2. **JSON → Browser CSS**: `DesignSpecRenderer.tsx` reads DesignSpec nodes and translates `LayoutSpec` properties to CSS:
   - `display: "flex"` (default) → `display: flex; flex-direction: <dir>`
   - `display: "grid"` + `columns: N` → `display: grid; grid-template-columns: repeat(N, 1fr)`
   - `wrap: true` → `flex-wrap: wrap`
   - `width: "fill"` → `flex: 1; min-width: 0` (in flex context; ignored in grid context where children auto-size to column tracks)
   - `gap`, `align`, `justify` → direct CSS equivalents
   - `px`/`py`/`pt`/`pb` → `padding-left`/`padding-right`/`padding-top`/`padding-bottom`
   - `overrides` → whitelisted keys (sizing, spacing, borders, positioning, flex-item, overflow, typography, inline-layout) are applied as CSS; unknown keys are silently dropped. See `SAFE_OVERRIDE_KEYS` in `DesignSpecRenderer.tsx`

3. **Browser → Screenshot**: Playwright captures the rendered page as a PNG screenshot for evaluation.

4. **Screenshot + DOM → Correction Patches**: A vision LLM sees the screenshot, DOM layout data, and current spec, then outputs `{ patches: { "node-id": { ...partial NodeSpec } } }`. These patches use DesignSpec property names (NOT CSS names).

5. **Patch sanitization** (`browser-correction-adapter.ts`):
   - `ALIAS_MAP` transforms CSS property names → DesignSpec equivalents (e.g. `gridTemplateColumns` → `layout.columns`, `flexWrap` → `layout.wrap`, `display` → `layout.display`)
   - `VALID_LAYOUT_KEYS` whitelist prevents unknown keys from reaching the spec
   - `validateLayoutValues()` coerces/validates types (enum, numeric, boolean)
   - Properties in `__strip__` alias are silently dropped (e.g. `position`, `opacity`)

### Bug pattern this addresses:

When the LLM generates `overrides: { display: "grid", grid_template_columns: "repeat(3, 1fr)" }` but the renderer only supports flex layout, the browser renders everything in a single row. The correction adapter then strips `display` from any LLM patches (mapped to `__strip__`), preventing the correction loop from ever fixing it.

**Fix:** Promote layout properties to first-class `LayoutSpec` fields with proper types, schema entries, renderer support, prompt documentation, and alias mappings. Never rely on unstructured `overrides` for layout — they bypass validation and correction.

### How to add a new layout property:
1. Add to `LayoutSpec` interface in `design-spec-v2.ts`
2. Add to `submit-design-tool.ts` layout properties
3. Handle in `getLayoutStyles()` in `DesignSpecRenderer.tsx` (JSON → CSS)
4. Document in V2 prompt (`ux-penpot-designspec-v2.md`) and dashboard prompt (`route.ts`)
5. Add to `VALID_LAYOUT_KEYS`, `ALIAS_MAP`, `LAYOUT_ENUM_FIELDS`, and `validateLayoutValues()` in `browser-correction-adapter.ts`
6. Add validation rule in `validate.ts` if semantic constraints exist
7. (Deferred) Handle in Penpot renderer (`shared.ts`) and React renderer (`shared.ts`)

### Override resolution bug (April 2026):

**Problem:** `SAFE_OVERRIDE_KEYS` whitelist in `getOverrideStyles()` only contained 5 CSS properties (`maxWidth`, `minWidth`, `maxHeight`, `minHeight`, `marginInline`). But LLM-generated designs use 30+ override CSS properties (`border`, `padding`, `position`, `font_size`, `flex_basis`, `overflow`, `cursor`, `z_index`, etc.). All of these were silently dropped.

Additionally, `resolveNode()` in `resolver.ts` returned a stripped-down `ResolvedNode` for unresolved/missing catalog entries — specifically, `overrides`, `layout`, `width`, `height`, `background`, `shadow` were all dropped. Combined with PascalCase → kebab-case catalog lookup mismatch (e.g., `"NavigationBar"` not finding `"navigation-bar"`), this caused many catalog components to lose ALL styling.

**Fix:**
1. Expanded `SAFE_OVERRIDE_KEYS` to cover all CSS properties used by LLM designs
2. Added `getOverrideStyles()` to `getCommonNodeStyles()` so catalog components get overrides
3. Fixed `resolveNode()` to preserve `overrides`/`layout`/`width`/`height`/etc. even for unresolved nodes
4. Added PascalCase → kebab-case normalization in catalog lookup
5. Updated fallback rendering path (`renderNode` unresolved branch) to apply full styles
