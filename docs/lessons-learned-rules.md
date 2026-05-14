# Lessons Learned — Active Rules

!!! info "About this file"

    This file contains only **RULE** and **SUPERSEDED** entries from `docs/lessons-learned.md`. These are the actionable principles that apply to every session. For historical context (RESOLVED entries, REFERENCE entries), see the full file.

    Status markers: **RULE** = ongoing principle. **SUPERSEDED** = replaced by different approach (do NOT follow).

## Table of contents

- [Langfuse SDK Drops Raw OTel Spans](#langfuse-sdk-drops-raw-otel-spans--use-langfusetracing-sdk-only) — RULE
- [DesignSpec browser renderer — regression prevention](#designspec-browser-renderer--regression-prevention) — RULE
- [DesignSpec v2: Separate WHAT from HOW](#designspec-v2-separate-what-from-how) — RULE
- [NodeSpec Field Budget: Internal Fields Use Type Intersections](#nodespec-field-budget-internal-fields-use-type-intersections) — RULE
- [Screen Type Must Be Set BEFORE Design](#screen-type-must-be-set-before-design-generation) — RULE
- [Mocks Belong Only in Test Files](#mocks-belong-only-in-test-files-testts) — RULE
- [Test Quality Gates — One Canonical Site Per Behavior](#test-quality-gates--one-canonical-site-per-behavior) — RULE
- [Test Fixtures Must Be Generic](#test-fixtures-must-be-generic-not-app-specific) — RULE
- [Fixture Token Values Must Match Source](#fixture-token-values-must-match-real-source-of-truth) — RULE
- [Never Assume Coverage — Always Verify](#never-assume-coverage--always-verify-mechanically) — RULE
- [Clean Code Discipline](#clean-code-discipline) — RULE
- [Engine Test Strategy](#engine-test-strategy) — RULE
- [ADR-021: Single on_complete Emission Rule](#adr-021-single-on_complete-emission-rule) — RULE
- [ADR-022: TypeScript-Only Engine](#adr-022-typescript-only-engine) — RULE
- [ADRs Must Describe Reality, Not Intent](#adrs-must-describe-reality-not-intent) — RULE
- [No Shortcuts — Ever](#no-shortcuts--ever) — RULE
- [Pseudo-Screen Directories Must Be Filtered at Build Time](#pseudo-screen-directories-must-be-filtered-at-build-time) — RULE
- [Plans Must Trace Data Flows and Verify Claims](#plans-must-trace-data-flows-and-verify-claims) — RULE
- [Deferrals Must Land in a Tracking Artifact](#deferrals-must-land-in-a-tracking-artifact) — RULE
- [Vision Evaluation Token Budget — Compact Context Over Raw JSON](#vision-evaluation-token-budget--compact-context-over-raw-json) — RULE
- [Dashboard Design Spec Reload — Use the Bundle Endpoint](#dashboard-design-spec-reload--use-the-bundle-endpoint) — RULE
- [Renderer Staleness: Kill-and-Restart](#renderer-staleness-kill-and-restart-not-just-port-check-superseded-2026-04-20) — SUPERSEDED
- [Verify Renderer Output Against Working Scripts](#verify-renderer-output-against-real-working-scripts) — RULE
- [Missing Catalog Renderers Must Be Added](#missing-catalog-renderers-must-be-added-not-just-logged) — RULE
- [Future: Pipeline Integration Test (Phase 4)](#future-pipeline-integration-test-phase-4) — RULE
- [TechDocs Markdown Rendering — Python-Markdown vs CommonMark](#techdocs-markdown-rendering--python-markdown-vs-commonmark) — RULE
- [ASCII Box Diagrams Don't Render in MkDocs — Use Mermaid](#ascii-box-diagrams-dont-render-in-mkdocs--use-mermaid) — RULE
- [Collapsible Admonitions for Rationale Sections](#collapsible-admonitions-for-rationale-sections) — RULE
- [Clarifier: Known v0 Trade-Offs and Coverage Gaps](#clarifier-known-v0-trade-offs-and-coverage-gaps) — RULE
- [LangGraph Resume: updateState + stream(null)](#langgraph-resume-updatestate--streamnull) — RULE

---

## DesignSpec browser renderer — regression prevention
**Context:** `packages/designspec-renderer` — `DesignSpecRenderer.tsx`, catalog resolver, Vite iframe  
**Rule:** Catalog ID normalization must be shared (`normalizeCatalogIdToKebab` in `catalog/catalog-id.ts`). Color token names in `overrides` must not be applied as raw CSS — resolve via `resolveTokenColor` or filter non-CSS values in `getOverrideStyles`. After changing the renderer, hard-refresh the design page; restart port 4100 if the iframe still shows stale UI.  
**Why:** PascalCase-only `.toLowerCase()` broke `NavigationBar` → `navigation-bar` matching; unresolved token strings made chips look empty. Playwright often looked “correct” while a cached browser tab did not.  
**How to apply:** See `docs/design-review-session-handoff.md` section **Catching regressions next time**. Run `nx test designspec-renderer` including `catalog-id.test.ts`.  

---

---

## Clean Code Discipline
**Context:** Monorepo-wide code quality  
**Rule:** Never leave dead code (unused imports, variables, etc.) even if pre-existing. Fix all issues across the full codebase, not just the files you touched.  
**Why:** Production-quality, push-ready code is the baseline. Unused imports and skipped test runs violate software design principles and block clean pushes.  
**How to apply:** After any change, run full typecheck + tests across the entire monorepo. Fix all errors — not just in changed files. Do not declare done until `nx run-many -t typecheck` and all tests pass clean.

---

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

---

## ADR-021: Single on_complete Emission Rule
**Context:** `packages/core/src/agent-runtime/base-agent.ts`
**Rule:** workFn implementations must NOT manually emit the `on_complete` event type. `runAgent()` is the single source of on_complete emission.
**Why:** Double emission produces duplicate audit entries, triggers downstream subscribers twice (orchestrator, V3 dashboard WebSocket), and violates PRD Section 10.1 which specifies on_complete fires once per task completion.
**How to apply:** When writing agent work functions, return detailed data via `Ok(output)`. Never call `ctx.eventBus.publish({ type: contract.on_complete, ... })` inside workFn. For intermediate progress, emit a *different* event type (e.g. progress events).

---

---

## ADR-022: TypeScript-Only Engine
**Context:** PRD Section 4.3 specifies Python/LangGraph engine
**Rule:** The implementation uses TypeScript-only orchestration. No Python process, no REST/gRPC bridge.
**Why:** All behavioral requirements pass in TypeScript. Single-process simplicity, better type safety, simpler deployment. LangGraph features (graph persistence, visualization) deferred to V3 Dashboard and Phase 2 Redis migration.
**How to apply:** When referencing architecture, use the TypeScript package names (@agentforge/core, @agentforge/governance). Do not assume a Python sidecar exists.

---

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

---

## Test Quality Gates — One Canonical Site Per Behavior

**Context:** Phase 0/0.5 of unify-pipeline (2026-04-24). The scaffold extraction
moved code from `packages/cli/` to `packages/core/`, but the tests didn't
follow the code. Result: three suites asserting the same scaffold output
(`scaffold-parity.test.ts` + `init.test.ts:137-277` + the entire
`wave2-onboarding.test.ts`), 127 lines of tailwind/CSS/token tests in
`init.test.ts` exercising re-exports while `packages/core/src/design/` had
zero direct tests, three near-identical end-to-end `initCommand` runs
asserting one output line each, plus a "Criterion 8" SLA test that timed a
mocked filesystem and a tautological "design is a valid phase" check that
defined its own expected value.
**Rule (codified in CLAUDE.md §Test Quality Gates):** before adding any
unit test, verify all 8 gates: (1) ownership rule — tests live in the package
that owns the function; (2) one canonical assertion site per behavior; (3) no
"framing" duplicates (no parallel "criterion N" suites that re-run existing
checks); (4) no tautologies, no "did I call my mock" tests, no SLA-on-mocks;
(5) prefer one real-codepath integration test over six mock-heavy units;
(6) shared `withEnv` helper for `process.env` mutation, never inline
try/finally; (7) scope-header comment on any test file whose ownership
boundary is non-obvious; (8) ~10s wall-time budget per `*.test.ts` file —
collapse repeated end-to-end runs.

### Cleanups applied:
- Deleted `packages/cli/src/commands/wave2-onboarding.test.ts` — every
  substantive assertion was already in `init.test.ts` or
  `scaffold-parity.test.ts`.
- Moved tailwind/CSS/token tests from `init.test.ts:410-536` to
  `packages/core/src/design/__tests__/tailwind-generator.test.ts`.
- Trimmed `init.test.ts` to CLI-extras-only assertions; collapsed three
  end-to-end `initCommand` runs into one.
- Added `packages/core/src/test-utils/with-env.ts` (exported as
  `withEnv` from `@agentforge/core`); refactored
  `constants.test.ts` and `design-evaluator.test.ts` to use it.
- Added scope-header comments to `init.test.ts` and
  `dashboard/src/app/api/projects/route.test.ts`.

### Heuristic for catching this earlier:
Any time you move or rename a function across packages, treat the test files
as part of the move. If the receiving package has no tests for the function,
the move isn't done.

---

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

---

## Fixture Token Values Must Match Real Source of Truth

**Context:** `packages/designspec-renderer/src/__fixtures__/design-tokens.ts`
**Rule:** When a test fixture mirrors real project data (e.g., design tokens), it must be verified against the actual source file. Never hand-write token values from memory or plan documents.
**Why:** The initial fixture had wrong primitive names (e.g., `sage-green` instead of `deep-teal`), wrong typography weights (`heading-2: 600` instead of `700`), wrong shadow values, and wrong border radius values. All tests passed with wrong data — proving the tests validated code paths, not correctness.
**How to apply:** Always read the actual source file (e.g., `agentforge/spec/design-tokens.yaml`) and copy values directly. When the fixture is generic, document which real project it was derived from for future updates.

---

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

---

## Never Assume Coverage — Always Verify Mechanically

**Context:** Documentation audits, config completeness checks, test coverage reviews
**Rule:** Never claim something exists or is covered without mechanically verifying it. When any task involves checking completeness (documentation, configs, tests, coverage, API surface, etc.), always verify by reading the actual files or running a concrete check (grep, test run, etc.) — never rely on summaries, memory, or assumptions.
**Why:** During a CLI docs + VS Code debug config audit, 7 commands were assumed documented because they were "in the codebase." Mechanical verification (grepping docs for each command name) revealed none of the 7 had documentation.
**How to apply:** For any completeness task — doc coverage, test coverage, config completeness, feature parity, migration checklists — enumerate the full expected set, then verify each item exists with a concrete check (file read, grep, test run). Treat unverified claims as false until proven.

---

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

---

## DesignSpec v2: Separate WHAT from HOW

**Context:** `packages/designspec-renderer/` — DesignSpec v2 renderer pipeline
**Rule:** Separate the LLM's job (deciding WHAT to render as JSON) from the renderer's job (knowing HOW to call Penpot/React APIs). Never let the LLM generate API calls directly.
**Why:** When the LLM generated Penpot JS scripts directly, every Penpot API quirk (createBoard not createRectangle, 0-1 float colors, appendChild before layoutChild) had to be taught in the prompt. The LLM still hallucinated incorrect API calls ~30% of the time. With DesignSpec v2, the LLM outputs compact JSON (flat adjacency list of nodes with types and overrides), and the renderer deterministically translates to correct API calls. This eliminated all Penpot API bugs and reduced token usage ~89%.
**How to apply:** For any design tool integration, define an intermediate JSON schema that captures design intent without tool-specific API details. Build a deterministic renderer per target tool.

---

---

## NodeSpec Field Budget: Internal Fields Use Type Intersections

**Context:** `packages/designspec-renderer/src/types/design-spec-v2.ts` — NodeSpec field budget management
**Rule:** Internal-only fields (set programmatically at runtime, never produced by the LLM) must NOT consume NodeSpec optional field slots. Use local type intersections (`NodeSpec & { fieldName?: Type }`) in the file that sets them.
**Why:** Anthropic's structured output grammar compiler has a hard 24-optional-field limit per schema. NodeSpec's `submit_design` tool schema is the LLM-facing contract. The `active` field was on NodeSpec (consuming a slot) despite being set only by `spec-split.ts:applyChromeActiveForPage` and never by the LLM. `spec-split.ts` already had `type MutableNode = NodeSpec & { active?: boolean }` — the NodeSpec field was redundant. Removing it freed a slot with zero behavioral change.
**How to apply:** Before adding a field to NodeSpec, check: does the LLM produce this field via `submit_design`? If no — if it's set programmatically by pipeline code — use a local type intersection in the file that writes it. The renderer reads these fields from untyped item arrays or the node object at runtime regardless of the TypeScript type. See `spec-split.ts:204` for the canonical pattern.

---

---

## ADRs Must Describe Reality, Not Intent
**Context:** ADR-022 "TypeScript-Only Orchestration Engine"
**Rule:** An ADR with status "Accepted" must describe what IS implemented, not what SHOULD BE. If the implementation isn't complete, use status "Partially Implemented" or "Proposed."
**Why:** ADR-022 was marked Accepted but the Python engine was never removed and no TypeScript orchestrator was built. For months, docs contradicted the codebase in both directions — CLAUDE.md said Python (partially true), ADR-022 said TypeScript-only (also partially true). Neither was accurate.
**How to apply:** Before marking an ADR as Accepted, verify every claim against the actual codebase. If cleanup or migration work remains, list it explicitly in the ADR and keep status as "Partially Implemented" until done.

---

---

## Renderer Staleness: Kill-and-Restart, Not Just Port-Check (SUPERSEDED 2026-04-20)

> **⚠️ SUPERSEDED.** The auto-restart-on-stale and source-mtime tracking described below were **removed** during Plan B Phase B2 because they caused OOM death spirals during Playwright E2E runs (Vite restart compiled ~1.4k modules concurrent with headed Chromium, killing Next). `getRendererStatus()` in `packages/dashboard/src/app/api/_lib/renderer-manager.ts` now returns `'ready'` whenever the HTTP health check passes, regardless of who spawned the process or whether source changed. The orphan-detection and manual "Kill & Restart" UI paths remain available, but they are no longer triggered automatically.
>
> **If you hit a stale renderer today:** restart Vite manually (kill the port, re-run `nx serve browser` from `packages/designspec-renderer`). Do NOT reintroduce mtime-based staleness without a plan for the OOM failure mode — see `docs/adrs/ADR-040-prototype-runtime-scrubbing.md` and the "Context for B2.5 Implementers" block in `docs/plans/backlog/screen-types-plan-b.md`.
>
> The rest of this entry is kept for historical context only.

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

---

## Screen Type Must Be Set BEFORE Design Generation

**Context:** `screen_type` (page/modal/drawer/sheet) in pages.yaml, viewport resolver in `packages/core/src/config/viewport-resolver.ts`, design agent prompt context
**Rule:** `screen_type` must be set on a page BEFORE its design is generated. Setting it after generation produces a design at the wrong viewport width that overflows when rendered as an overlay. Regenerating the design is the only fix — there is no post-hoc resize.
**Why:** The viewport resolver (Phase A3) reads `screen_type` during design generation:
- `drawer` → 320px viewport
- `modal` → 560px viewport
- `sheet` → full width
- `page` → 1440px (default)

The design LLM receives this width as a hard constraint and lays out all content within it. The design prompt also injects overlay-specific instructions ("do not include page-level navigation", "include a close affordance"). A design generated at 1440px then crammed into a 320px drawer overlay clips and overflows.

**Three constraints discovered (Claim Filling Sample, 2026-04-22):**

1. **Overlay designs must be generated at overlay viewport.** The NotificationsPanel was designed at 1440px (before `screen_type: drawer` existed). Setting `screen_type: drawer` on the page AFTER design generation makes the prototype render it as a drawer, but the content is 1440px wide — it overflows the 320px panel. Fix: regenerate via the design pipeline with `screen_type` already set.

2. **Chrome (header/nav) must come from Chrome Pass, not per-page LLM.** Each page's design LLM independently produces its own TopNavigation — some flat (single catalog node, zero children, no bell icon), some decomposed (with children and navigateTo). This produces inconsistent headers across pages and breaks overlay navigation wiring. Fix: Plan B Phase B1 (Chrome Pass) designs shared chrome once and injects it into all pages.

3. **`design:generate` changing page IDs breaks existing designs.** The LLM produces descriptive IDs (`dashboard`, `claims-list`) but existing design files use old IDs (`page-001`, `page-002`). The dashboard shows "Ready to design" because it can't match `dashboard.json` to `page-001.json`. Fix needed: `design:generate` should either preserve existing page IDs or rename design files to match new IDs.

**How to apply:** When adding `screen_type` to an existing page, always regenerate its design afterward. When testing overlay rendering, verify the design spec's `"width"` field matches the overlay viewport (320 for drawer, 560 for modal). If it doesn't, the design was generated before screen_type was set.

---

---

## Pseudo-Screen Directories Must Be Filtered at Build Time

**Context:** Phase 3 Task 3.6 (2026-04-25). After Task 3.0 consolidated artifacts to `agentforge/designs/`, the `__shared-chrome__` directory was scanned by `buildPrototypeManifest` as a regular screen because it contained `scripts/designspec-v2.json`. The resulting `prototype.json` included `screenId: "__shared-chrome__"`. The prototype API route (`/api/prototype`) had a runtime filter for `__` prefixes, but the static manifest fixture was polluted — E2E tests caught it.
**Rule:** `buildPrototypeManifest` (and any future directory scanner over `agentforge/designs/`) must skip entries starting with `__` at scan time, not rely on downstream runtime filtering. Static fixtures committed to git must reflect the filtered output.
**Why:** Runtime filters are defense-in-depth, not primary. If the manifest is written to disk with pseudo-screens, any consumer that reads the file directly (CLI, E2E tests, future tools) sees the pseudo-screen. The prototype API's runtime filter masked the bug for months.
**How to apply:** `build-manifest.ts` line 50: `if (entry.name.startsWith('__')) continue;`. When updating `prototype.json` fixtures after pipeline changes, verify no `screenId` starts with `__`.

---

---

## Plans Must Trace Data Flows and Verify Claims

**Context:** Phase 2 plan (2026-04-25). The initial CLI migration plan was challenged on 5 concrete gaps: (1) browser correction silently dropped — `browserDesignWork` is "Phase A only, does NOT include browser correction" but the plan claimed "same artifacts as before"; (2) Phase 2.5 deferred despite the parent execution plan explicitly marking it non-deferrable; (3) cache filename mismatch — pipeline writes `designspec-v2.json` but connect/replay stages read `penpot-design.json` (different shape); (4) `--tool` flag assumed to exist but not in Commander registration; (5) `--concurrency` flag orphaned by the move to sequential processing. All 5 were catchable with mechanical verification.
**Rule:** Before writing "same as before," "stays as-is," or "no user-visible change" in any plan:
1. **Trace data flows end-to-end.** For every "X stays," enumerate: what artifact format does X read, what does the new code write, do schemas match? Function signatures alone are insufficient — verify data shapes.
2. **Read parent plan gates as hard constraints.** If this task is part of a larger execution plan, its demo checkpoints and "not deferrable" sections are requirements, not suggestions. Do not defer work the parent plan explicitly forbids deferring.
3. **Verify every factual claim against code.** "Flag exists" → grep the Commander registration. "Same artifacts" → grep artifact filenames, compare schemas. Apply lessons-learned §"Never Assume Coverage": enumerate the expected set, verify each item.
4. **Enumerate public API changes.** Any CLI flag added, removed, or made vestigial is a contract change needing explicit handling.
5. **For each downstream consumer of changed code, verify compatibility.** If saying "special stages stay," list what they read/write and prove the new pipeline preserves those contracts.
**How to apply:** Before every plan submission, run a mental (or actual) grep for each claim. If you can't point to the line of code that proves the claim, the claim is unverified and should be flagged, not asserted.

---

## Deferrals Must Land in a Tracking Artifact

**RULE** (2026-05-13)

**Context:** M1 "Connect" plan challenge. Phase 3 deferred cross-screen coherence (vision Layer 7) with the note "deferred to M2." But M2 is about Architect Foundation (typed contracts, Critic node, eval harness) — it has nothing to do with design pipeline coherence. The deferred item would have been lost without a tracking artifact.
**Rule:** When deferring work from one plan or milestone to another, the deferral is only complete when a tracking artifact exists at the destination. "Deferred to M2" is incomplete if M2 doesn't contain the item.
**How to apply:**
1. Check if the destination milestone/plan actually covers the deferred scope.
2. If it doesn't, create a backlog entry (§Deferred from X) in the source plan's execution-plan.md, or a standalone plan in `docs/plans/backlog/`.
3. The deferral note in the source phase AND the tracking artifact in the destination are both required — neither alone is sufficient.
4. `/challenge-plan` checks for this: any challenge that recommends deferral must verify the destination plan exists and contains the deferred item.

---

## Vision Evaluation Token Budget — Compact Context Over Raw JSON

**Context:** `packages/agents-ux/src/ux-design/design-evaluator.ts`, `packages/dashboard/src/app/api/design/audit/vision/route.ts`
**Rule:** Never send raw `JSON.stringify(spec)` to the vision evaluator. Use `buildEvaluationContext(spec)` which produces a compact tree representation (~300-600 tokens vs ~4,000-15,000). The vision LLM is looking at a screenshot — it can SEE layout, spacing, colors. The spec context only needs to convey WHAT was intended (component names, text content, catalog entries, navigateTo targets, token references).
**Why:** A single vision evaluation request with raw spec JSON consumed ~6,000-18,000 tokens — enough to exceed Vertex AI basic TPM quota (4,000) on a SINGLE call, even with no prior requests in days. The 429/RATE_LIMITED error was misleading because it appeared to be a throughput issue, but was actually a payload size issue. Debugging insight: "one call in 2 days still rate-limited" = check request size, not request frequency.
**How to apply:** When sending structured data alongside vision input to any LLM, ask: "can the model already SEE this in the image?" If yes, strip it. Send only what the image can't convey (intent, names, invisible metadata like navigateTo). For the vision evaluator specifically, `buildEvaluationContext()` in `evaluation-context.ts` handles this. Token/catalog compliance contexts are built separately and remain compact.

---

---

## Dashboard Design Spec Reload — Use the Bundle Endpoint

**Context:** `packages/dashboard/src/app/(dashboard)/design/page.tsx` — reloading spec after correction patches
**Rule:** When reloading the design spec after modifications (corrections, chat edits, saves), always use `/api/pages/${pageId}/design/spec?bundle=true&t=${Date.now()}` with `cache: 'no-store'`. Do NOT use `/api/pages/${pageId}/design` — that endpoint returns the spec in a different shape that the canvas renderer cannot parse, producing "Design Spec Error: no renderable nodes."
**Why:** The canvas expects `data.spec` from the bundle endpoint (which includes tokens and catalog alongside the spec). The plain `/design` endpoint returns a raw object without the `spec` wrapper. After a correct/fix route patches the spec on disk, reloading from the wrong endpoint caused the canvas to show a "no renderable nodes" error even though the patched spec was valid.
**How to apply:** Search for `setDesignSpec` in `page.tsx`. Every call site that fetches a spec after modification must use the bundle endpoint pattern: `fetch(\`/api/pages/\${id}/design/spec?bundle=true&t=\${Date.now()}\`, { cache: 'no-store' })`.

---

## Blind Subagent Test for Documentation

**Rule:** After documenting any new system, feature, or setup procedure, spawn a blind Explore subagent with NO context from the current conversation and ask it to accomplish a task using only the project's own files (starting from CLAUDE.md). If it can't find what it needs, the docs have gaps — fix them before declaring done.
**Why:** Documentation written by the builder is biased — gaps get filled from memory without realizing it. A blind agent has no memory and exposes every missing link. Memory files are not reliable for this (session-scoped, can get stale). Canonical docs in the codebase with CLAUDE.md pointers are the durable path.
**How to apply:** `Agent({ subagent_type: 'Explore', prompt: 'You have NO prior context. Using only project files starting from CLAUDE.md, <task>.' })`. Pass if the agent completes the task; fail if it can't find what it needs.

---

## Dashboard Dev Server: tsconfig paths Force Source Compilation

**Context:** `packages/dashboard/next.config.js`, `packages/dashboard/tsconfig.json` — dev server cold-start performance
**Rule:** The dashboard's `tsconfig.json` must NOT have `paths` entries pointing to `../*/src/index.ts`. These leak into Next.js webpack and force compilation from raw TypeScript source (382 extra files, 65K lines), causing 60+ second page loads. Use pre-built `dist/` instead.
**Why:** The root cause took 4 failed attempts to find (2026-04-29):

1. **FAILED: Remove `@agentforge/source` from webpack `conditionNames`** — Next.js re-adds it from `tsconfig.base.json`'s `customConditions`. Filtering doesn't work.
2. **FAILED: Override `conditionNames` with explicit list** — Same result. Next.js reads conditions at a level webpack config can't override.
3. **FAILED: Remove packages from `transpilePackages`** — Didn't help because the real source resolution came from tsconfig `paths`, not export conditions.
4. **WORKED: Remove `@agentforge/core`, `@agentforge/providers`, `@agentforge/designspec-renderer` from tsconfig `paths`** — These `paths` entries (`"@agentforge/core": ["../core/src/index.ts"]`) directly mapped to source, bypassing all export condition logic.

**Additional fixes applied:** Moved server-only packages (`agents-ux`, `designspec-renderer`, `providers`, `cli`, `agents-clarifier`) to `serverExternalPackages`. Removed `transpilePackages` entirely. Removed `extensionAlias` (only needed for source compilation). Result: clean `next.config.js` with no webpack config block.

**How to apply:** Before changing `next.config.js` or `tsconfig.json` in the dashboard, check: (1) no `paths` pointing to `../*/src/`, (2) no `@agentforge/source` in conditionNames, (3) `nx run-many -t build` before `npm run dev`. For visual audits, use `next build && next start` — production mode pre-compiles all pages.

---

## Next.js 16 + Mantine v9 Compatibility Gotchas

**Context:** `packages/dashboard/` — Next.js 16.2.4, Mantine v9.1.1, React 19.2.5
**Rule:** Eight things to know when working with this stack:
1. **Turbopack doesn't support `extensionAlias`** — always use `--webpack` flag. Both `dev` AND `build` scripts must include it (`npm run dev` and `npm run build` have it baked in).
2. **Mantine v9 requires React 19** — `useEffectEvent` is used by Mantine internals. Next.js 15 bundled an old React that didn't have it.
3. **`renderRoot` on NavLink doesn't trigger Next.js routing** — use `component={Link}` instead.
4. **For visual audits, use `next build && next start`** — webpack on-demand compilation in dev mode blocks Chrome DevTools MCP with 30s+ timeouts on first page visit.
5. **Mantine v9 Select puts `data-testid` on the `<input>` element directly** — not on a wrapper div. `innerText()` and `textContent()` return empty on inputs. Use `element.evaluate((el) => el instanceof HTMLInputElement ? el.value || el.placeholder : el.textContent)` to read the displayed value.
6. **React version mismatch causes hooks test failures** — if root `package.json` has `react@^19.1.0` but dashboard has `react@^19.2.5`, npm installs a duplicate. `renderHook` then fails with `Cannot read properties of null (reading 'useState')`. Always align React versions across the monorepo.
7. **setState inside useEffect is a lint error in React 19** — use useState lazy initializers `useState(() => { ... })` instead of reading localStorage in useEffect.
8. **Mantine v9 Collapse uses `expanded` prop** — not `in` (Mantine v6) or `opened` (some docs). The TypeScript type is `CollapseProps.expanded: boolean`. Cost 3 compile attempts to discover.
**Why:** Each of these cost 15-30 minutes of debugging during Phase 2 sessions (2026-04-29). The Turbopack, React version, and Mantine Select DOM issues were especially confusing because error messages didn't point to the root cause.
**How to apply:** The dashboard's `package.json` dev and build scripts already include `--webpack`. For visual audits, run `cd packages/dashboard && npx next build && npx next start --port 3000`.

---

## Mantine ActionIcon Uses `data-disabled`, Not Native `disabled`

**Context:** `packages/dashboard/src/app/(dashboard)/design/page.tsx` — Mantine v9 ActionIcon with disabled prop
**Rule:** Mantine v9 ActionIcon sets `data-disabled="true"` on the element, NOT the native HTML `disabled` attribute. Playwright's `toBeEnabled()`/`toBeDisabled()` checks the native attribute and will give wrong results. Use `toHaveAttribute('data-disabled', 'true')` instead.
**Why:** Cost ~30 minutes debugging E2E test failures. The Edit button appeared disabled in Playwright but was actually enabled in the browser. The issue was Playwright checking `disabled` (absent) while Mantine used `data-disabled`.
**How to apply:** In E2E tests for Mantine ActionIcon/Button components, use `page.locator('[aria-label="X"]').toHaveAttribute('data-disabled', 'true')` to check disabled state. For checking enabled: `expect(async () => { expect(await el.getAttribute('data-disabled')).not.toBe('true'); }).toPass()`.

---

## Claude API Rejects `additionalProperties: object` in Structured Output

**Rule:** Never use `additionalProperties` as a type schema (map pattern) in Claude API structured output. Use `Array<{ key: string; value: T }>` instead, with a normalizer to convert back to a map after parsing.
**Why:** Claude API returns 400 for `additionalProperties: { oneOf: [...] }`. Only `additionalProperties: false` is supported.
**How to apply:** Before adding a structured output schema, grep for `additionalProperties` — every instance must be `false` or absent.

---

---

## TechDocs Markdown Rendering — Python-Markdown vs CommonMark

**Context:** Backstage TechDocs (`mkdocs.yml`, `techdocs-core` plugin), all markdown files under `docs/`  
**Rule:** Three things to know about TechDocs markdown rendering:  
1. **Python-Markdown requires a blank line before lists after paragraphs.** VS Code uses `markdown-it` (CommonMark-compliant) which doesn't. The pattern `**Bold text:**\n- item` renders as inline text in TechDocs but as a proper list in VS Code. `mdx_truly_sane_lists` (bundled by `techdocs-core`) does NOT fix this — it only handles nested list indentation.  
2. **`extra_css` and `<style>` tags are blocked.** Backstage bug [#12302](https://github.com/backstage/backstage/issues/12302) prevents `extra_css` in mkdocs.yml from being registered. DOMPurify config has `FORBID_TAGS: ["style"]`. However, **inline `style` attributes on elements ARE allowed** — this is the only CSS injection path.  
3. **MkDocs `hooks:` config may be stripped** by editor formatters/linters. Use a Python-Markdown extension (registered under `markdown_extensions:`) instead. Install as `mdx_fix_list_spacing.py` in Python site-packages.  
**Why:** 718 list occurrences across 95 docs files rendered as inline text in Backstage but looked fine in VS Code preview. Inline `<code>` elements had invisible white backgrounds. Cost ~3 hours debugging the pipeline (MkDocs hooks, DOMPurify config, extension behavior) before finding the correct approach.  
**How to apply:** The `mdx_fix_list_spacing` extension in `mkdocs.yml` handles both issues automatically. When authoring new docs, add a blank line before bullet lists after paragraph text — this makes the markdown correct for both parsers and doesn't depend on the extension.

---

## Langfuse SDK Drops Raw OTel Spans — Use @langfuse/tracing SDK Only

**Context:** `packages/telemetry/` — adding pipeline stage spans and MCP tool call spans to Langfuse
**Rule:** Never create OTel spans via `@opentelemetry/api`'s `tracer.startSpan()` when using Langfuse as the trace backend. Use `@langfuse/tracing` SDK instead (`startActiveObservation` for wrapping async calls, `startObservation` for manual lifecycle). Langfuse's `LangfuseSpanProcessor` has a `shouldExportSpan` filter that silently drops raw OTel spans — they lack the SDK-specific attributes (observation type, trace association) that Langfuse requires.
**Why:** During Phase 4, stage spans created via `tracer.startSpan('stage:research')` compiled, passed unit tests, but were silently dropped at runtime. `LANGFUSE_DEBUG=true` showed: `"Dropped span due to shouldExportSpan filter"`. The bug was only discoverable via e2e verification against a running Langfuse instance — unit tests test the unconfigured (no-op) path.
**How to apply:** For wrapped async calls: `startActiveObservation('name', async (span) => { ... }, { asType: 'generation' | 'tool' })`. For split-lifecycle spans: use `wrapStage()` pattern — add optional `wrapStage` to `PipelineTelemetrySink` interface, implement with `startActiveObservation` in `LangfuseSink`. Never import `trace` from `@opentelemetry/api` in telemetry code — if you need it, you're using the wrong API.

---

## ASCII Box Diagrams Don't Render in MkDocs — Use Mermaid

**Context:** Backstage TechDocs, docs under `docs/` containing `┌──┐`, `│`, `└──┘`, `▶`, `▼` box-drawing characters.
**Rule:** Replace ASCII box-drawing diagrams with Mermaid blocks. ASCII art renders as broken monospace text in MkDocs/Backstage TechDocs because font metrics vary across browsers — boxes misalign, arrows disconnect, nested layouts collapse.
**Why:** 12 ASCII diagrams in `docs/architecture/design-pipeline-dataflow.md` were unreadable in TechDocs. Mermaid is enabled via `pymdownx.superfences` custom_fences in `mkdocs.yml`.
**How to apply:** Use `graph`, `sequenceDiagram`, or `flowchart` Mermaid blocks. Keep ASCII in fenced code blocks only for short inline examples. Use `style` directives for color coding (green=done `#2ECC71`, orange=partial `#F39C12`, gray=not started `#95A5A6`).

---

## Collapsible Admonitions for Rationale Sections

**Context:** `docs/vision.md`, any authoritative doc with repeating "Why" or rationale sections.
**Rule:** Convert rationale sections to collapsible admonitions (`???` syntax) instead of `###` headings. Use `??? danger` for architectural debt, `??? warning` for missing-but-planned, `??? info` for deferred items.
**Why:** vision.md had 15 "Why the current state is wrong" `###` headings taking ~200 lines. As always-visible headings they cluttered the ToC and made scanning for decisions harder. Collapsible admonitions let readers expand rationale on demand.
**How to apply:** `??? danger "Title"` followed by 4-space indented content. Don't use `???+` (expanded by default) — the point is reducing visual noise. Keep original content verbatim.

---

## Clarifier: Known v0 Trade-Offs and Coverage Gaps

**Context:** `packages/agents-clarifier/` — v0 clarifier pipeline review (2026-05-02). Four findings from a pipeline review, all interconnected: FB2's speculative artifacts are bounded by FB1's Q&A awareness; FB3's structure-only critic connects to FB4's untested priority branch because both are limits on the v0 quality bar.

### 1. Primary Defense in Prompt, Filter as Safety Net (FB1 — FIXED)

**Rule:** When preventing re-asking in multi-round LLM loops, the SYSTEM prompt must contain an explicit instruction about already-clarified topics. Runtime filters (like `filterAskedGaps` in `gap-detector.ts:638`) are the safety net, not the primary defense.
**Why:** The gap detector's `filterAskedGaps` matches by gap ID. LLM-generated gap IDs are SHA-256 of `topic::description` — two semantically identical gaps with different wording produce different hashes and slip through. The prompt instruction handles semantic duplicates the hash can't see; the hash filter handles cases where the prompt instruction was ignored. Belt and suspenders.
**How to apply:** Both divergence prompts (`gap-divergence-bootstrap.md` v3.1.0, `gap-divergence-evolution.md` v2.1.0) now contain an "Already-Clarified Topics" section. The runtime `qaSection` at `gap-detector.ts:560-565` injects the data into the user message. Both layers are required.

### 2. Speculative PRD Artifacts (FB2 — Documented Trade-Off)

**Rule:** The PRD Analyzer intentionally over-produces features, screens, entities, and NFRs for vague inputs (`prd-analyzer-system.md` line 31: "Be thorough"). The `could-have` priority on inferred features and the divergence prompt's ban on asking about LLM-generated artifacts are the mitigations. The user never validates speculative `could-have` features directly.
**Why:** Under-producing misses real requirements the user forgot to mention. Over-producing with `could-have` is safer because these items can be dropped later. The risk is scope creep if downstream agents treat `could-have` as committed scope.
**How to apply:** Do NOT reduce the analyzer's thoroughness. Track with eval metric `unvalidated-artifact-survival`: count of `could-have` features/entities/screens in the final PRD that were never referenced by any answer. See execution plan future work.

### 3. Critic Passed Means Well-Formed, Not Good (FB3 — Documented Limitation)

**Rule:** The Critic node runs only deterministic checks (EARS compliance, INVEST compliance, DAG consistency). `criticPassed: true` means the feature plan is structurally well-formed — it does NOT mean the requirements are high-quality, complete, or aligned with user intent. The LLM quality review (`critic-system.md`) is scaffolded but not wired.
**Why:** Deterministic checks catch real structural bugs (missing acceptance criteria, dependency cycles, descriptions too short to estimate). LLM-based quality review adds cost and latency for uncertain benefit at this stage.
**How to apply:** Do not interpret `criticPassed: true` as a quality seal. When reporting critic results, label the check as "Structure validation" not "Quality review." Future: wire `critic-system.md` when eval data shows structural checks are insufficient.

### 4. PRD Updater Priority Logic Untested (FB4 — Documented Coverage Gap)

**Rule:** The PRD Updater prompt instructs the LLM to update feature priorities when users say "must have", "nice to have", or "don't need" (`prd-updater-system.md` line 20). The cooperative eval simulator always picks `recommended: true` options with descriptive answers — it never uses priority language. This means the priority-update branch is not exercised in automated testing.
**Why:** The cooperative simulator validates the happy path. Priority language requires an opinionated or evasive user persona that does not exist yet.
**How to apply:** Do NOT remove the priority-update instruction — it is correct behavior. Track as a coverage gap. When adding eval personality variants (opinionated, evasive, contradictory), include at least one that uses explicit priority language and verify the updater changes priorities accordingly.

---

## LangGraph Resume: updateState + stream(null)

**RULE** (2026-05-02)

**Rule:** To resume a LangGraph graph from an `interruptBefore` checkpoint, call `graph.updateState(config, newState)` then `graph.stream(null, config)`. Do NOT pass input to `stream()` — `graph.stream(input, config)` restarts the graph from `__start__` instead of resuming from the interrupted node.
**Why:** Discovered during eval harness development. Calling `stream({ humanResponses }, config)` re-ran all nodes (contextRetriever → prdAnalyzer → gapDetector → questionPrioritizer) from scratch on every resume, never reaching the storyWriter node past the interrupt. Cost 4 debugging cycles and ~$3 in wasted Vertex AI calls. The `updateState` approach merges new state into the checkpoint, then `stream(null)` resumes from the exact interrupt point.
**How to apply:** Any code that resumes a LangGraph graph after an interrupt (eval runner, dashboard HITL, future orchestrator resume) must use the two-step pattern. The `runClarifierPipelineStream` convenience wrapper in `packages/agents-clarifier/src/run.ts` uses `stream(invokeInput)` — this may need updating if the dashboard exhibits the same restart behavior (currently untested).
