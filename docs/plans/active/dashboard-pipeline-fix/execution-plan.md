# Dashboard Pipeline Planning Failure — Execution Plan

## Related Documents

- **Issue:** `docs/issues/dashboard-pipeline-planning-failure.md`
- **Vision:** `docs/vision.md` Layer 7 (Design pipeline), Layer 14 (Dashboard)
- **Dataflow:** `docs/architecture/design-pipeline-dataflow.md`
- **Guide:** `docs/guides/planning-docs.md`

## Context

The design pipeline fails at the planning stage when triggered from the dashboard
but succeeds from CLI. All 4 ShoppingGuys pages fail with "Planning stage failed"
within ~5 seconds — too fast for an LLM call, indicating an early-return error
path or an uncaught exception.

**Root cause analysis from codebase exploration:**

Three synchronous `Err` paths exist in `uxPlanningWork` (lines 306, 309, 327),
and one uncaught exception path at `loadSystemPrompt` (line 351 calls line 112
which uses bare `readFileSync` with no try/catch — violates the Result pattern).

Two hypotheses:

1. **`import.meta.url` path resolution (HIGH PROBABILITY).** `loadSystemPrompt()`
   at `ux-planning.ts:111` uses `fileURLToPath(import.meta.url)` to locate
   `ux-planning-system.md`. When Next.js webpack compiles `@agentforge/agents-ux`
   source via the `@agentforge/source` condition (`next.config.js:35`), webpack
   transforms `import.meta.url` to a chunk-relative URL that doesn't correspond
   to the original source tree. `readFileSync` throws ENOENT — this is an
   **uncaught exception**, not an `Err` return. It propagates through
   `planningNode` (`nodes.ts:65`, no try/catch) → `pipeline.ts:114` (no catch)
   → `route.ts:216` (outer catch). The error message would be the raw
   ENOENT stack trace, not the generic "Planning stage failed" from `nodes.ts:68`.

   Supporting evidence: research uses the same pattern (`ux-research.ts:88`) but is
   always cached — `loadSystemPrompt` is never called from the dashboard for
   research. The correction adapter and evaluator do NOT use `import.meta.url`
   (prompts are inline constants), so they work fine from the dashboard.

   **CLI vs Dashboard path difference:** CLI consumes `@agentforge/agents-ux`
   from compiled `dist/`, where `import.meta.url` resolves to a real filesystem
   path (`dist/ux-planning/ux-planning.js`). Dashboard uses the `@agentforge/source`
   webpack condition to compile raw `.ts` source, where `import.meta.url` is
   webpack-transformed.

2. **`readSpecs` returns Err → tokens undefined (LOW PROBABILITY).** If
   `context.projectRoot` resolves incorrectly, `readSpecs` at line 318 returns
   `Err`, making `tokensSpec` undefined at line 322, triggering the design tokens
   error at line 327.

   **Weakened by evidence:** `pipeline.ts:103-106` passes the same `agentContext`
   object to ALL stages. Research and planning receive the identical
   `context.projectRoot`. Since research succeeds (reads specs from the same
   path), `projectRoot` is correct. This hypothesis is only viable if research
   skips `projectRoot` entirely (it doesn't — it uses it for brief caching).

**Eliminated hypotheses (from issue doc):**
- **Provider/model resolution failure:** Would produce "Failed to resolve provider"
  at `pipeline.ts:100`, not "Planning stage failed". Different error path.
- **Structured output schema failure:** Would occur AFTER the LLM call (>10s), not
  within ~5 seconds.

**Secondary bugs in the issue doc:**
- CLI doesn't update `designStatus` in pages.yaml after pipeline success
- Misleading "Design generated" log (partially fixed — poll loop now checks status)

**Code defect (independent of root cause):** `loadSystemPrompt` at
`ux-planning.ts:112` uses bare `readFileSync` with no error handling. In a
codebase that uses the Result pattern (never throw), this is a violation. Any
file-loading function should return `Err` on failure, not throw.

## Exit Criteria

1. Dashboard "Generate All" and per-page generate succeed for ShoppingGuys (all 4 pages)
2. Planning stage produces valid output from dashboard (not just from CLI)
3. CLI pipeline updates `designStatus: 'rendered'` in `pages.yaml` after success
4. Error messages surface with actionable detail in Activity sidebar
5. All tests green: typecheck, unit, lint, E2E (including existing design pipeline E2E)

## Progress Checklist

### Phase 1 — Diagnose (must complete before fixing)

- [ ] **1.1** Add diagnostic logging to `loadSystemPrompt` (`ux-planning.ts:109-117`). Log the resolved `promptPath` from `import.meta.url` and whether the file exists before `readFileSync`. Wrap `readFileSync` in try/catch that logs the full error.
- [ ] **1.2** Add diagnostic logging to `uxPlanningWork` (`ux-planning.ts:300-330`). Before each Err path, log: `context.projectRoot`, `specDir`, `existingSpecs.ok`, `tokensSpec` truthiness.
- [ ] **1.3** Reproduce via Chrome DevTools MCP: start dashboard, navigate to `/design`, take screenshot of Activity sidebar, then trigger single-page generate and capture the exact error text shown.
- [ ] **1.4** Rebuild and reproduce: `nx build agents-ux`, restart Next.js dev server, trigger single-page generate from dashboard, read the Next.js terminal for `[planningNode]` and new diagnostic logs.
- [ ] **1.5** Record the exact error message (terminal + UI). Confirm which path fired: ENOENT exception from `loadSystemPrompt` vs `Err` return from `uxPlanningWork`. Remove diagnostic logging after root cause is confirmed.

### Phase 2 — Fix Root Cause

**Fix depends on Phase 1 findings. Two branches:**

#### Branch A: `import.meta.url` path resolution failure (expected)

- [ ] **2A.1** Fix `loadSystemPrompt` in `ux-planning.ts:109-117`. Wrap `readFileSync` in a try/catch that returns a Result-pattern error instead of throwing. Then replace the `import.meta.url` path resolution with a webpack-safe approach. Options (in preference order):
  1. **Use `__dirname` fallback** — try `import.meta.url` first, fall back to `__dirname`-based path on ENOENT. Webpack provides `__dirname` correctly for server bundles. Minimal change, no architectural impact.
  2. **Import prompt as raw string via webpack loader** — add a webpack rule for `.md` files that imports them as string constants (e.g., `import promptText from '../prompts/ux-planning-system.md'`). Requires `next.config.js` webpack rule addition. Prompts stay in `.md` files, frontmatter parsing unchanged, pre-commit hook unchanged.
  3. **Inline the prompt** as a template literal string constant. Requires updating the pre-commit version check hook (`scripts/check-prompt-versions.ts`) to also scan `.ts` files for prompt version frontmatter — this is a mandatory companion task, not optional.
- [ ] **2A.2** Apply the same fix to all 10 files in `packages/agents-ux/src/` that use `import.meta.url` for prompt loading:
  - `ux-planning/ux-planning.ts:111`
  - `ux-research/ux-research.ts:88`
  - `design-pipeline/browser-design-work.ts:53`
  - `ux-review/ux-review.ts:83`
  - `ux-testing/ux-testing.ts:80`
  - `ux-implementation/ux-implementation.ts:142`
  - `ux-design/penpot-browser-agent.ts:116`
  - `ux-design/ux-penpot-design.ts:142`
  - `ux-design/penpot-v2-pipeline.ts:88`
  - `ux-import/source-to-designspec.ts:62`
- [ ] **2A.3** If Option 3 (inline) is chosen: update `scripts/check-prompt-versions.ts` to scan `.ts` prompt constants in addition to `prompts/*.md` files. This is required by CLAUDE.md prompt versioning rule.
- [ ] **2A.4** If Option 3 (inline) is chosen: write ADR for the prompt management pattern change (file-based → inline). Cross-cutting change affecting 10 files.

#### Branch B: `projectRoot` / `readSpecs` path resolution failure (unlikely)

- [ ] **2B.1** Fix `getActiveProjectRoot()` in `project-reader.ts` if Phase 1 confirms `projectRoot` is wrong. Add `__dirname`-based fallback for `MONOREPO_ROOT`.
- [ ] **2B.2** Add explicit `projectRoot` validation in `uxPlanningWork` before `readSpecs` — log and return `Err` with a clear message if the spec directory doesn't exist.

### Phase 3 — Fix Secondary Bugs

- [ ] **3.1** CLI `designStatus` update (`packages/cli/src/commands/design-page.ts`). After successful pipeline completion (~line 570), update the page's `designStatus` to `'rendered'` in `pages.yaml`. Mirror the dashboard's pattern at `design/route.ts:201-209`.
- [ ] **3.2** Verify the "Design generated" log fix is complete (`packages/dashboard/src/app/(dashboard)/design/page.tsx:1045-1065`). The issue says "partially fixed" — check if all poll-loop paths correctly distinguish success vs failure.

### Phase 4 — Error Propagation

- [ ] **4.1** Surface planning error detail in Activity sidebar. Trace the full error path: `loadSystemPrompt` throw (or `Err` return) → `planningNode` (`nodes.ts:65-70`) → `pipeline.ts:114-118` → `route.ts:191,216-218` → `DashboardSseSink.onStageFail` → SSE event → Activity UI. Verify the detail message (not just "Planning stage failed") reaches the user.
- [ ] **4.2** E2E test for error propagation: `e2e/dashboard-pipeline-error.spec.ts`. Trigger generate for a project with a broken spec path (or missing tokens file), verify the Activity sidebar shows an actionable error message (not blank or generic). Required by `.claude/rules/e2e-coverage.md` since Phase 4 touches dashboard UI.

### Phase 5 — Tests

- [ ] **5.1** Unit test for `uxPlanningWork` error paths (`ux-planning.test.ts`). Verify each Err path (missing moduleId, missing designBrief, missing tokens) returns the correct error code and message. For the prompt-load-failure path, verify it returns `Err` (not throw) after the Phase 2 fix.
- [ ] **5.2** Integration test for dashboard pipeline input construction. Verify `buildDashboardPipelineInput()` produces a `PipelineInput` with all required fields matching CLI's construction for the same project.

### Phase 6 — Documentation & Verification

- [ ] **6.1** Update `docs/architecture/design-pipeline-dataflow.md` Stage 3 (Planning Agent) — note the prompt loading mechanism and webpack compatibility. Required by `.claude/rules/design-pipeline.md`.
- [ ] **6.2** Update `docs/issues/dashboard-pipeline-planning-failure.md` — record confirmed root cause and fix applied. Change status to Resolved.
- [ ] **6.3** End-to-end: Start dashboard, switch to ShoppingGuys, click "Generate All", verify all 4 pages complete with designs. Use Chrome DevTools MCP for visual verification.
- [ ] **6.4** End-to-end: Run CLI `design:page product-listing --project-dir apps/shoppingguys`, verify `designStatus: 'rendered'` is set in pages.yaml.
- [ ] **6.5** Full test suite: `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint`.

---

## Key Files

| File | Role | Phase |
|------|------|-------|
| `packages/agents-ux/src/ux-planning/ux-planning.ts` | Planning work fn + `loadSystemPrompt` | 1, 2A |
| `packages/agents-ux/src/design-pipeline/nodes.ts` | Planning node wrapper (no try/catch) | 1, 4 |
| `packages/agents-ux/src/design-pipeline/pipeline.ts` | Stage runner (no try/catch on node call) | 4 |
| `packages/dashboard/src/app/api/_lib/pipeline-input-builder.ts` | Dashboard PipelineInput construction | 1, 5 |
| `packages/dashboard/src/app/api/_lib/pipeline-context.ts` | Dashboard AgentContext factory | 1 |
| `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts` | Dashboard design route (outer catch) | 3, 4 |
| `packages/dashboard/src/app/api/_lib/project-reader.ts` | `getActiveProjectRoot`, `readYamlFile` | 2B |
| `packages/cli/src/commands/design-page.ts` | CLI pipeline runner | 3 |
| `packages/dashboard/src/app/(dashboard)/design/page.tsx` | Design Studio UI | 3, 4 |
| `packages/dashboard/next.config.js` | Webpack `@agentforge/source` condition | context |
| `scripts/check-prompt-versions.ts` | Pre-commit prompt version check | 2A.3 |
| `docs/architecture/design-pipeline-dataflow.md` | Pipeline dataflow doc | 6 |

---

## Exception Propagation Trace (Hypothesis 1)

When `loadSystemPrompt` throws ENOENT:

```
readFileSync(wrongPath)                      → throws Error: ENOENT
  ↑ ux-planning.ts:112 (loadSystemPrompt)    → no catch, propagates
  ↑ ux-planning.ts:351 (uxPlanningWork)      → no catch, propagates
  ↑ nodes.ts:65 (planningNode)               → no catch, propagates
  ↑ pipeline.ts:114 (stage.fn call)          → no catch, propagates
  ↑ route.ts:187 (runDesignPipeline call)    → no catch, propagates
  ↑ route.ts:216 (outer try/catch)           → CAUGHT here
    → sink.onStageFail('pipeline', message)  → SSE event with raw ENOENT message
    → failRun(runId, message)                → run marked as failed
    → pages.yaml status reverted to 'draft'
```

Note: the `planningNode` error formatting at `nodes.ts:68-70` is BYPASSED
because it only handles `Err` results, not thrown exceptions. The raw ENOENT
stack trace reaches the UI unformatted.

## Execution Order

```
Phase 1 (Diagnose)  → identify exact failure path, ~30 min
Phase 2 (Fix Root)  → depends on Phase 1 findings, ~1-2 hr
Phase 3 (Secondary) → independent of Phase 2, can parallelize
Phase 4 (Errors)    → after Phase 2 fix confirmed working
Phase 5 (Tests)     → after Phase 2-4
Phase 6 (Docs+Verify) → after all above
```

## Rejected Approaches

| Rejected | Reason |
|----------|--------|
| Move all prompts to `dist/` via build copy | Fragile — requires manual `cp` step, lesson learned §"No Shortcuts — Ever" |
| Use `serverExternalPackages` for `agents-ux` | Breaks tree-shaking, increases bundle size, doesn't fix the root issue |
| Add `import.meta.url` polyfill to webpack config | Masks the issue, doesn't fix other potential `import.meta.url` consumers |
| Skip planning stage from dashboard | Architectural violation — planning is required for design quality |
