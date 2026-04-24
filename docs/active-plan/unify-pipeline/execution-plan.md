# Unify Design Pipeline — Execution Plan

## Related Documents

- **Issue doc:** [`docs/issues/cli-dashboard-pipeline-divergence.md`](../../issues/cli-dashboard-pipeline-divergence.md) (rev 2) — divergence inventory with A/B/C/D classification
- **Original plan:** [`docs/feature-plans/unify-design-pipeline.md`](../../feature-plans/unify-design-pipeline.md) (rev 2) — three-layer architecture, phased execution
- **Review notes:** [`docs/guides/design-pipeline-unification-review-notes.md`](../../guides/design-pipeline-unification-review-notes.md) — spec-sync facts, structural principles, resolved review questions
- **Architecture:** [`docs/architecture/design-pipeline-dataflow.md`](../../architecture/design-pipeline-dataflow.md) — current CLI-only pipeline trace (to be updated in Phase 5)
- **ADR-043:** [`docs/adrs/ADR-043-typescript-only-orchestration.md`](../../adrs/ADR-043-typescript-only-orchestration.md) — Phase M-3 is the LangGraph port this plan unblocks

## Context

AgentForge has two parallel implementations of the UX design pipeline. The CLI calls canonical work functions with Zod-validated contracts. The dashboard reimplements the same stages via `callPipelineStage`, passing raw markdown strings — a direct `CLAUDE.md` violation. This blocks Roadmap Phase 4 (cross-screen coherence) and ADR-043 Phase M-3 (LangGraph port).

---

## Progress Checklist

Update this checklist as each task completes. Commit convention: `[unify-pipeline:X.Y] <description>`.

### Phase 0 — Contract Lockdown
- [ ] **0.1** Zod schemas in `packages/core/src/types/`
- [ ] **0.2** Parity test (red/skipped)
- [ ] **0.3** Import boundary lint rule
- [ ] **0.4** Narrow dashboard shape fix (shallow wrapper) + unit test

### Phase 0.5 — Scaffolding
- [ ] **0.5.1a** Move design utilities from CLI to core
- [ ] **0.5.1b** Define `ScaffoldProjectInput` schema
- [ ] **0.5.2** Extract `scaffoldProject` work function
- [ ] **0.5.3** Scaffold parity test

### Phase 1 — Layer B
- [ ] **1.1** `PipelineTelemetrySink` interface + `PipelineInput` (with `chromePass`)
- [ ] **1.1s** Spike: validate single-shot patch
- [ ] **1.2** Stage node functions + `browserDesignWork`
- [ ] **1.3** `runDesignPipeline` orchestrator
- [ ] **1.4** Sink contract tests

### Phase 2 — CLI Migration
- [ ] **2.1** CLI telemetry sink + migration
- [ ] **2.5** Browser feedback adapter

### Phase 3 — Dashboard Migration
- [ ] **3.1** Dashboard telemetry sink + migration
- [ ] **3.2** Delete `callPipelineStage` + `callClaudeDesignAPI`
- [ ] **3.5** Chat route + correct route mechanism fix
- [ ] **3.6** Dashboard pipeline E2E test

### Phase 4 — Stage 1
- [ ] **4.1** Unify `design:generate` and `spec/generate`

### Phase 5 — Docs
- [ ] **5.1** Parity test green
- [ ] **5.2** ADRs, dataflow doc, cleanup

---

## Demo Checkpoints

After each phase, the work should be demoable to a stakeholder. These are the verification moments.

| After | What to demo | How to verify |
|-------|-------------|---------------|
| **Phase 0** | `research.json` has typed shape (shallow). Lint rule flags violations. Parity test exists. | Run dashboard pipeline on PET fixture. `cat research.json \| jq '._migrated'` → `true`. `nx run-many -t lint` shows warnings. |
| **Phase 0.5** | `agentforge init` and dashboard onboarding produce identical project files. | Run scaffold parity test: `nx test core --testPathPattern scaffold-parity`. |
| **Phase 1** | `runDesignPipeline` with mock provider produces typed state through all nodes. | Run: `nx test agents-ux --testPathPattern design-pipeline`. Show node function tests + integration test green. |
| **Phase 2** | CLI `design:page --tool=browser` runs full pipeline through Layer B. Compare output to pre-migration baseline. | Run CLI on PET fixture. Diff artifacts against saved baseline. `--tool=penpot` still works. Browser feedback loop functional. |
| **Phase 3** | Dashboard full pipeline produces same artifacts as CLI. Chat route 1 LLM call. Correct route works. Prototype renders. | Run dashboard pipeline. Diff against CLI output. E2E test green: `npx playwright test e2e/unify-pipeline.spec.ts`. |
| **Phase 5** | Parity test green. ADRs written. Issue doc closed. | `nx test agents-ux --testPathPattern parity`. ADR files exist. |

## Review Conclusions

The original plan's three-layer architecture (Layer A / Layer B / Layer C) and parameterized `runDesignPipeline({ designTool })` shape are correct. Execution order: Phase 0 (contracts) -> Phase 0.5 (scaffolding) -> Phase 1 (Layer B) -> Phase 2 (CLI migration) -> Phase 3 (dashboard migration). Narrow top-down slice per review notes §4.3.

**Corrections applied from review notes + challenge report:**
- Narrow top-down slice ordering (§4.3)
- Keep Phase 0.5, keep Phase 2.5, keep sink interface, drop OTel span shape (§5.4)
- Chat fix split: shape in Phase 0, mechanism in Phase 3.5 (§6.4)
- Every task maps to A/B/C/D classification (§2)
- Challenge 1 accepted: `scaffoldProject` in `packages/core/`, not `agents-ux`; design utilities moved from CLI to core first
- Challenge 2 accepted: sink implementations live in their transport packages; only the interface lives in `agents-ux`
- Challenge 3 accepted: Task 0.4 uses shallow wrapper with `_rawMarkdown` + `_migrated: true`, NOT best-effort extraction
- Clarification A accepted: `correct/route.ts` wired to `BrowserFeedbackAdapter` in Phase 3.5
- Clarification B accepted: Chrome Pass fields grouped under `chromePass?: { mode, spec?, activePageId? }` on `PipelineInput`

## Resolved Open Questions

1. **`scaffoldProject` — `agents-ux` or `core`?** `core` is canonical. Design utilities (`buildDesignTokensSpec`, `buildBrandSpec`, `generateTailwindConfig`, `generateGlobalCss`) move from `packages/cli/src/design/` to `packages/core/src/design/` first (Task 0.5.1a).
2. **`DesignOutput.designToolMetadata` — required or optional?** Optional. Penpot callers populate when available; browser callers may omit.
3. **Browser feedback adapter — single-shot patch vs multi-turn loop?** 0.25-day spike during Phase 1 validates single-shot on 3 representative requests before committing interface shape.
4. **Stage 1 status reconciliation.** Explicit `autoApprove: boolean` parameter, default `false`.
5. **`correct/route.ts` scope.** Wired to `BrowserFeedbackAdapter` in Task 3.5 (same adapter as chat route).
6. **Chrome Pass fields on `PipelineInput`.** Grouped under `chromePass?: { mode: 'generate' | 'consume'; spec?: DesignSpecV2; activePageId?: string }`.
7. **Task 0.4 approach.** Shallow schema-compliant wrapper: empty arrays + `_rawMarkdown` side-channel + `_migrated: true` marker. Do NOT stuff markdown into semantic fields.
8. **Task 1.2 `browserDesignWork`.** Replaces `callClaudeDesignAPI`, does not wrap it. The retry logic is absorbed.

---

## Phase 0 — Contract Lockdown (days 1-3)

Prerequisite for everything. No behavior change — schemas, tests, lint, and a narrow shape fix.

---

**Task 0.1: Zod schemas in `packages/core/src/types/`**
- **Category:** Prerequisite (enables B fixes)
- **Duration:** 0.5 days
- **What:** Add `DesignPhaseStateSchema` (with `DesignToolSchema = z.enum(['browser', 'penpot'])`, `DesignOutputSchema`) to `packages/core/src/types/design-phase-state.ts`. Re-export existing `UXResearchOutputSchema`, `UXPlanningOutputSchema`, `UXImplementationOutputSchema` from core's barrel. Do NOT move schema files from `agents-ux` — re-export only.
- **Files:**
  - `packages/core/src/types/design-phase-state.ts` — new
  - `packages/core/src/types/index.ts` — re-exports
- **Verification:**
  - `import { DesignPhaseStateSchema, UXResearchOutputSchema } from '@agentforge/core'` compiles
  - Original imports from `@agentforge/agents-ux` still compile
  - `nx run-many -t typecheck` green

---

**Task 0.2: Parity test (red)**
- **Category:** Prerequisite (forcing function)
- **Duration:** 0.5 days
- **Depends on:** Task 0.1
- **What:** Create `packages/agents-ux/src/__tests__/artifact-shape-parity.test.ts`. Validates: (a) typed outputs round-trip through Zod, (b) old dashboard shape `{ brief: string }` fails `UXResearchOutputSchema`, (c) old dashboard shape `{ spec: string }` fails `UXPlanningOutputSchema`. Test starts **red** on the parity-against-dashboard portion — `test.skip` until Phase 3.
- **Files:**
  - `packages/agents-ux/src/__tests__/artifact-shape-parity.test.ts` — new
- **Verification:**
  - `{ brief: "markdown" }` fails `UXResearchOutputSchema.safeParse()`
  - Typed `UXResearchOutput` round-trips through Zod
  - `nx test agents-ux` green (parity portion skipped)

---

**Task 0.3: Import boundary lint rule**
- **Category:** Prerequisite (prevents recurrence)
- **Duration:** 0.5 days
- **What:** Add `no-restricted-syntax` ESLint rule in dashboard config that flags `callPipelineStage(` calls in API routes. Zero new dependencies. Starts as warning; promoted to error when Phase 3 deletes `callPipelineStage`.
- **Clarification (from challenge report):** The dashboard does NOT import `@anthropic-ai/sdk` directly — all LLM calls go through `@agentforge/providers`. The real boundary is: dashboard routes must not reimplement research/planning/evaluation stages. `callClaudeDesignAPI` for the design stage was legitimate but is absorbed into `browserDesignWork` in Task 1.2.
- **Files:**
  - Dashboard ESLint config
- **Verification:**
  - Lint reports warnings in `design/route.ts`, `chat/route.ts`
  - `nx run-many -t lint` green (warnings, not errors)

---

**Task 0.4: Narrow dashboard shape fix — shallow schema-compliant wrapper**
- **Category:** Half of **B** (on-disk shape correct; `callPipelineStage` still handles LLM calls)
- **Duration:** 0.5 days
- **Depends on:** Task 0.1
- **What:** In `runFullPipelineAsync` (`design/route.ts`), after `callPipelineStage` returns the markdown, wrap it in a shallow `UXResearchOutput` / `UXPlanningOutput` and write that to disk.
- **Implementation (from accepted Challenge 3):** Do NOT stuff markdown into semantic fields like `designConstraints`. Use:
  ```typescript
  const shallowResearch: UXResearchOutput & { _rawMarkdown: string; _migrated: true } = {
    briefId: pageId,
    moduleId: pageId,
    requirementIds: [],
    designConstraints: [],
    referencePatterns: [],
    accessibilityRequirements: [],
    dataModelDependencies: [],
    _rawMarkdown: researchResult,  // side-channel for debugging
    _migrated: true,               // marker: shallow wrapper, not real typed output
  };
  ```
  Use `.passthrough()` on the schema at the write boundary so the two meta fields survive Zod validation without polluting the canonical schema definition.
- **Also fix in `chat/route.ts`:** same shape fix for chat iteration artifacts.
- **Backward compat:** Add a fallback reader that detects the old `{ brief: string }` shape when loading cached artifacts and wraps it in the shallow form.
- **Files:**
  - `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts`
  - `packages/dashboard/src/app/api/pages/[pageId]/design/chat/route.ts`
- **Unit test:** Create `packages/dashboard/src/app/api/pages/__tests__/shallow-wrapper.test.ts`:
  - Asserts shallow wrapper passes `UXResearchOutputSchema.passthrough().safeParse()`
  - Asserts `_migrated: true` present
  - Asserts all semantic fields are empty arrays
  - Asserts `_rawMarkdown` contains the original markdown
  - Asserts fallback reader correctly detects and wraps old `{ brief: string }` shape
- **Verification:**
  - Unit test green: `nx test dashboard --testPathPattern shallow-wrapper`
  - `research.json` passes `UXResearchOutputSchema.passthrough().safeParse()`
  - `_migrated: true` marker is present
  - Semantic fields (`designConstraints`, etc.) are empty arrays (not stuffed with markdown)
  - Dashboard still completes end-to-end
  - `nx run-many -t typecheck` green

---

## Phase 0.5 — Extract `scaffoldProject` (days 3-4.5)

Category C fix. `scaffoldProject` lives in `packages/core/` (resolved — not `agents-ux`).

---

**Task 0.5.1a: Move design utilities from CLI to core**
- **Category:** **C** prerequisite — unblocks shared scaffolding
- **Duration:** 0.5 days
- **What:** Move `buildDesignTokensSpec`, `buildBrandSpec`, `generateTailwindConfig`, `generateGlobalCss` from `packages/cli/src/design/archetypes.ts` (and related files in `packages/cli/src/design/`) to `packages/core/src/design/archetypes.ts`. These are pure data functions with no CLI dependency — they generate YAML/CSS from token specs. Update call sites:
  - `packages/dashboard/src/app/api/_lib/project-creation.ts` (3 call sites — currently imports from `@agentforge/cli`)
  - `packages/cli/src/commands/init.ts` (1 call site — currently local import)
  - Re-export from `@agentforge/core` barrel
- **Rationale:** `scaffoldProject` needs these functions. They belong in `core` (pure data, zero external deps beyond `yaml`). Having the dashboard import from `@agentforge/cli` was already a dependency-direction violation.
- **Files:**
  - `packages/core/src/design/archetypes.ts` — new (moved from CLI)
  - `packages/core/src/design/index.ts` — barrel
  - `packages/cli/src/design/archetypes.ts` — re-export from core (backward compat for any other CLI consumers)
  - `packages/dashboard/src/app/api/_lib/project-creation.ts` — update imports
  - `packages/cli/src/commands/init.ts` — update imports
- **Verification:**
  - `import { buildDesignTokensSpec } from '@agentforge/core'` compiles
  - Dashboard and CLI both still produce correct design tokens
  - `nx run-many -t typecheck` and `nx run-many -t test` green

---

**Task 0.5.1b: Define `ScaffoldProjectInput` schema**
- **Category:** **C** — prerequisite for shared scaffolding
- **Duration:** 0.25 days
- **Depends on:** Task 0.5.1a
- **What:** Create `ScaffoldProjectInputSchema` (Zod) in `packages/core/src/types/scaffold.ts`. Channel-specific fields optional: `channels.slackChannel` (CLI), `designOption` (dashboard), `designArchetype`, `componentLibrary`, `targetAudience`.
- **Files:**
  - `packages/core/src/types/scaffold.ts` — new
  - `packages/core/src/types/index.ts` — re-export
- **Verification:**
  - Schema compiles, type exported from `@agentforge/core`
  - `nx run-many -t typecheck` green

---

**Task 0.5.2: Extract `scaffoldProject` work function**
- **Category:** **C** fix
- **Duration:** 0.5 days
- **Depends on:** Tasks 0.5.1a, 0.5.1b
- **What:** Extract `scaffoldProject(input: ScaffoldProjectInput, projectDir: string, fs: FileSystem): Promise<ScaffoldResult>` into `packages/core/src/scaffolding/scaffold-project.ts`. Uses the design utilities now in `packages/core/src/design/`. Both CLI `initCommand` and dashboard `createProject` map their channel-specific inputs to `ScaffoldProjectInput` and call this function.
- **Files:**
  - `packages/core/src/scaffolding/scaffold-project.ts` — new
  - `packages/cli/src/commands/init.ts` — replace inline file writes
  - `packages/dashboard/src/app/api/_lib/project-creation.ts` — replace inline file writes
- **Verification:**
  - Given identical `ScaffoldProjectInput`, byte-identical output regardless of caller
  - Both callers shrink by ~150 lines
  - `nx run-many -t typecheck` and `nx run-many -t test` green

---

**Task 0.5.3: Scaffold parity test**
- **Category:** **C** verification
- **Duration:** 0.25 days
- **Depends on:** Task 0.5.2
- **What:** Test that calls `scaffoldProject` with fixture input and asserts output file set + contents.
- **Files:**
  - `packages/core/src/scaffolding/__tests__/scaffold-parity.test.ts` — new
- **Verification:**
  - Test passes, `nx test core` green

---

## Phase 1 — Layer B: Pipeline Orchestrator (days 4.5-7)

Prerequisite for Categories A + full B.

---

**Task 1.1: Define `PipelineTelemetrySink` interface + `PipelineInput`**
- **Category:** Definitional to Layer B
- **Duration:** 0.5 days
- **What:** Minimal callback interface in `packages/agents-ux/src/design-pipeline/types.ts`. NOT OTel-span-shaped:
  ```typescript
  interface PipelineTelemetrySink {
    onStageStart(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }): void;
    onStageComplete(stage: string, result: { costUsd?: number; tokensUsed?: number }): void;
    onStageFail(stage: string, error: string): void;
    onLlmCall(stage: string, attrs: { model: string; promptTokens: number; completionTokens: number; costUsd: number; latencyMs: number }): void;
    onLog(stage: string, level: 'info' | 'warn' | 'error', message: string): void;
  }
  ```
- **`PipelineInput` includes `chromePass` (from accepted Clarification B):**
  ```typescript
  interface PipelineInput {
    moduleId: string;
    taskId: string;
    projectRoot: string;
    designTool: 'browser' | 'penpot';
    stage?: 'research' | 'planning' | 'design' | 'evaluator' | 'feedback' | 'implementation';
    resume?: boolean;
    telemetry?: PipelineTelemetrySink;
    chromePass?: {
      mode: 'generate' | 'consume';
      spec?: DesignSpecV2;       // when mode='consume': frozen chrome to inject
      activePageId?: string;     // when mode='consume': page ID for active tab state
    };
    // ... prdRequirements, pageContext, etc.
  }
  ```
  The `chromePass` field groups the three correlated Chrome Pass inputs (`chromeOnly`, `frozenChromeSpec`, `frozenChromePageId`). `mode: 'generate'` maps to `chromeOnly: true`. `mode: 'consume'` passes `spec` and `activePageId` through to the design node.
- **Files:**
  - `packages/agents-ux/src/design-pipeline/types.ts` — new
- **Verification:**
  - Types compile, exported from `@agentforge/agents-ux`
  - `nx run-many -t typecheck` green

---

**Task 1.1s: Spike — validate single-shot patch on 3 representative requests**
- **Category:** Risk reduction for Phase 2.5
- **Duration:** 0.25 days
- **Depends on:** Nothing (can start anytime during Phase 1)
- **What:** Before committing to the `FeedbackAdapter` interface shape, test the single-shot structured patch approach on 3 representative chat messages from dashboard usage (or synthetic equivalents): (1) "change the header color to blue", (2) "add a search bar below the navigation", (3) "make the card grid 3 columns instead of 2". Evaluate whether a single LLM call with `DesignSpecV2` input + user message can produce a correct `DesignSpecPatch`. Document results in a brief spike note.
- **Outcome:** If single-shot works for 2/3+, proceed with `FeedbackAdapter` using `reviewDesign(spec, userMessage) → DesignSpecPatch`. If it fails, consider multi-turn or structured guidance.

---

**Task 1.2: Extract stage node functions**
- **Category:** Prerequisite for Layer B + **A** (`designNode` dispatches on `designTool`)
- **Duration:** 1.5 days
- **Depends on:** Tasks 0.1, 1.1
- **What:** Create `packages/agents-ux/src/design-pipeline/nodes.ts` with pure `(state: DesignPhaseState, ctx: AgentContext) => Promise<Partial<DesignPhaseState>>` functions:
  - `researchNode` — wraps `uxResearchWork`
  - `planningNode` — wraps `uxPlanningWork`
  - `designNode` — dispatches on `state.designTool`:
    - `'browser'` → `browserDesignWork` (replaces `callClaudeDesignAPI`, absorbs its retry logic)
    - `'penpot'` → `penpotDesignWork` (existing, output adapted to `DesignOutput`)
  - `evaluatorNode` — wraps `evaluateDesign`
- **`browserDesignWork` replaces `callClaudeDesignAPI` (from accepted refinement):** The retry logic, `SUBMIT_DESIGN_TOOL` tool-use, and schema validation are absorbed into `browserDesignWork`. `callClaudeDesignAPI` ceases to exist as a separate function after this task.
- **Chrome Pass integration (from accepted Clarification B):** Both `browserDesignWork` and `penpotDesignWork` receive `state.chromePass` via the design node. When `chromePass.mode === 'consume'`, the design node passes `frozenChromeSpec: chromePass.spec` and `frozenChromePageId: chromePass.activePageId` to the work function. When `chromePass.mode === 'generate'`, the design node passes `chromeOnly: true`.
- **LangGraph compatibility:** These signatures map directly to `StateGraph.addNode(name, fn)`. The M-3 port is mechanical wiring.
- **Files:**
  - `packages/agents-ux/src/design-pipeline/nodes.ts` — new
  - `packages/agents-ux/src/design-pipeline/browser-design-work.ts` — new (replaces `callClaudeDesignAPI`)
  - `packages/agents-ux/src/design-pipeline/index.ts` — barrel
- **Verification:**
  - Each node function has a unit test with fixture `DesignPhaseState`
  - `designNode` dispatches correctly for both `'browser'` and `'penpot'`
  - `browserDesignWork` has the empty-node retry from the absorbed `callClaudeDesignAPI`
  - Chrome Pass fields flow correctly to work functions
  - `nx test agents-ux` green

---

**Task 1.3: Create `runDesignPipeline` orchestrator**
- **Category:** Layer B core
- **Duration:** 1 day
- **Depends on:** Tasks 1.1, 1.2
- **What:** Create `packages/agents-ux/src/design-pipeline/pipeline.ts` with `runDesignPipeline(input: PipelineInput): Promise<Result<DesignPhaseState>>`. Sequential node calls with caching. <=100 lines.
- **Telemetry:** Calls `sink.onStageStart` / `sink.onStageComplete` around each node. Never branches on caller.
- **Caching:** Artifacts cached as `research-brief.json`, `planning-spec.json`, `designspec-v2.json`.
- **Files:**
  - `packages/agents-ux/src/design-pipeline/pipeline.ts` — new
- **Verification:**
  - `runDesignPipeline` exported from `@agentforge/agents-ux`
  - Integration test: mock provider + fixture → `DesignPhaseState` with research+planning+design populated
  - Caching works, resume works
  - `nx test agents-ux` green

---

**Task 1.4: Define sink interface contract tests**
- **Category:** Layer B completion
- **Duration:** 0.25 days
- **Depends on:** Task 1.1
- **What:** Create a shared test suite that any `PipelineTelemetrySink` implementation must pass. Tests: `onStageStart` called before `onStageComplete` for each stage; `onStageFail` includes error message; `onLlmCall` has positive token counts. Implementations in Phase 2/3 run this suite.
- **Note (from accepted Challenge 2):** The `PipelineTelemetrySink` interface lives in `agents-ux`. Implementations live in their transport packages: `CliStdoutSink` in `packages/cli/`, `DashboardSseSink` in `packages/dashboard/`. This follows standard dependency inversion — abstraction in the lower layer, implementations in callers.
- **Files:**
  - `packages/agents-ux/src/design-pipeline/__tests__/sink-contract.test.ts` — new (exported as a test helper)
- **Verification:**
  - Contract test suite exists and is importable
  - `nx test agents-ux` green

---

## Phase 2 — CLI Migration (days 7-9)

CLI stops having its own stage orchestration; it only handles argv + telemetry.

---

**Task 2.1: CLI telemetry sink + migration to `runDesignPipeline`**
- **Category:** Structural (no user-visible change)
- **Duration:** 1 day
- **Depends on:** Tasks 1.3, 1.4
- **What:**
  1. Create `CliStdoutSink` in `packages/cli/src/telemetry/cli-sink.ts` — implements `PipelineTelemetrySink`, renders to stdout using CLI's current formatting. Runs the sink contract tests from Task 1.4.
  2. Rewrite `design-page.ts` body to call `runDesignPipeline`.
- **Chrome Pass:** `design-page-all.ts` calls `runDesignPipeline` per-page with `chromePass: { mode: 'consume', spec, activePageId }` after Chrome Pass. For the Chrome Pass itself, it calls `runDesignPipeline` with `chromePass: { mode: 'generate' }` on the reference page.
- **`--tool=browser` becomes the default** (matching `sdlc-agents.md:67`).
- **Files:**
  - `packages/cli/src/telemetry/cli-sink.ts` — new
  - `packages/cli/src/commands/design-page.ts` — rewrite
  - `packages/cli/src/commands/design-page-all.ts` — replace inlined stage logic; Chrome Pass stays
  - `packages/agents-ux/src/scripts/run-module-pipeline.ts` — delete or thin wrapper
- **Verification:**
  - CLI `design:page` produces identical output to pre-migration
  - Chrome Pass works via `chromePass` field
  - `--stage` resume and `--fresh` work
  - `--tool=browser` is default
  - `CliStdoutSink` passes sink contract tests
  - `nx run-many -t typecheck` and `nx run-many -t test` green

---

**Task 2.5: Browser feedback adapter**
- **Category:** **A** (channel choice) — load-bearing for Phase 3.5 and CLI default
- **Duration:** 1 day
- **Depends on:** Tasks 2.1, 1.1s (spike results inform interface shape)
- **Why NOT deferrable (review notes §5.2):** CLI now defaults to `--tool=browser`. Its only existing feedback loop requires Penpot. Without this: (a) CLI default stays Penpot (contradicts `sdlc-agents.md:67`), (b) no feedback on default path (regression), or (c) dashboard stays on `runChatPipelineAsync` (second migration). None acceptable.
- **What:** Extract into `packages/agents-ux/src/feedback/feedback-loop.ts`:
  ```typescript
  interface FeedbackAdapter {
    reviewDesign(spec: DesignSpecV2, userMessage?: string): Promise<Result<DesignSpecPatch>>;
    applyPatch(spec: DesignSpecV2, patch: DesignSpecPatch): DesignSpecV2;
    showPreview(spec: DesignSpecV2): Promise<void>;
  }
  ```
  Two adapters: `PenpotFeedbackAdapter` (wraps existing `DesignCollaborationSession`), `BrowserFeedbackAdapter` (local preview + single LLM structured patch, informed by Task 1.1s spike).
- **Files:**
  - `packages/agents-ux/src/feedback/feedback-loop.ts` — new
  - `packages/agents-ux/src/feedback/penpot-adapter.ts` — new
  - `packages/agents-ux/src/feedback/browser-adapter.ts` — new
- **Verification:**
  - CLI `design:page --tool=browser` can enter feedback loop
  - CLI `design:page --tool=penpot` still uses Penpot session
  - `nx test agents-ux` green

---

## Phase 3 — Dashboard Migration (days 9-12)

Full Category B done. Category A unlocked.

---

### Risks (enumerated per user directive)

1. **Fixture churn.** Every `agentforge/designs/*/research.json` must be regenerated or migrated. The shallow-wrapper reader from Task 0.4 handles old shapes gracefully. Committed fixtures in `fixtures/` must be updated.
2. **Dashboard UI may depend on markdown research/planning for display.** If any React component renders the old `{ brief }` shape, it needs a view-model layer that renders `UXResearchOutput` → markdown for display. Audit before starting Task 3.1.
3. **SSE event envelope drift.** The `DashboardSseSink` must produce events with the exact `PipelineRunProgress` shape the UI consumes. Put the envelope shape under test (sink contract tests).
4. **`run-manager.ts` stage timing expectations.** The dashboard UI may depend on specific `stageTimings` keys. Verify the new pipeline emits the same stage names.
5. **Chrome Pass `chromePass` field missing from `PipelineInput`.** Covered by Task 1.1 (Clarification B accepted). Verify in Task 2.1.
6. **`correct/route.ts` left unwired.** Covered by Task 3.5 (Clarification A accepted). Both chat and correct routes wire to `BrowserFeedbackAdapter`.
7. **LangGraph state-schema constraint.** If ADR-043 M-3 pre-work reveals a `StateGraph` constraint the plan misses, `DesignPhaseStateSchema` may need restructuring. Phase 1 is sized so the schema can be revised without rewriting node functions.

### User-artifact migration policy

- **On read:** When loading `research.json` or `planning.json`, detect the old `{ brief: string }` / `{ spec: string }` shape and silently wrap it in a shallow `UXResearchOutput` / `UXPlanningOutput` with `_migrated: true`. Log a one-time info message per project: `"Migrated legacy research artifact for {pageId}"`.
- **On write:** Always write the full typed shape. After Phase 3, all new artifacts are canonical.
- **Committed fixtures:** `fixtures/claim-filling-sample/agentforge/designs/*/research.json` updated to match `UXResearchOutputSchema` (with `_migrated: true` if shallow) in Task 3.1.

---

**Task 3.1: Dashboard telemetry sink + migration to `runDesignPipeline`**
- **Category:** Full **B** fix
- **Duration:** 1.5 days
- **Depends on:** Tasks 1.3, 1.4
- **What:**
  1. Create `DashboardSseSink` in `packages/dashboard/src/app/api/_lib/dashboard-sink.ts` — implements `PipelineTelemetrySink` by calling `emitStageEvent`, `emitLLMCallEvent`, `updateRunStatus`. Lives in the dashboard package (accepted Challenge 2). Runs sink contract tests.
  2. Replace `runFullPipelineAsync` body with `runDesignPipeline({ designTool: 'browser', telemetry: new DashboardSseSink(...) })`.
- **On-disk artifacts:** `research.json` and `planning.json` now contain full `UXResearchOutput` / `UXPlanningOutput` (replacing the shallow wrappers from Task 0.4). `_migrated` marker absent on new output.
- **Fixture migration:** Update committed fixtures to match schemas.
- **Files:**
  - `packages/dashboard/src/app/api/_lib/dashboard-sink.ts` — new
  - `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts` — rewrite pipeline body
  - Fixture files — update
- **Verification:**
  - Dashboard pipeline produces artifacts matching CLI output for same input
  - `research.json` / `planning.json` parse against Zod schemas (no `_migrated` marker)
  - Run-manager shows same stage progression
  - `DashboardSseSink` passes sink contract tests
  - `nx run-many -t typecheck` and `nx run-many -t test` green

---

**Task 3.2: Delete `callPipelineStage` and `callClaudeDesignAPI`**
- **Category:** **B** cleanup
- **Duration:** 0.5 days
- **Depends on:** Task 3.1
- **What:** Delete `callPipelineStage` from `pipeline-helpers.ts`. Delete `callClaudeDesignAPI` (absorbed into `browserDesignWork` in Task 1.2). Promote lint rule to error.
- **Files:**
  - `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts` — delete both functions
  - Dashboard ESLint config — promote rule to error
- **Verification:**
  - `callPipelineStage` not in codebase
  - `callClaudeDesignAPI` not in codebase
  - Lint rule passes clean
  - `nx run-many -t lint` green

---

**Task 3.5: Chat route + correct route mechanism fix**
- **Category:** **B** mechanism (shape fixed in Task 0.4; this fixes 3x rerun + wires corrections)
- **Duration:** 1.5 days
- **Depends on:** Tasks 2.5, 3.1
- **What:**
  1. **Chat route:** Replace `runChatPipelineAsync` with `BrowserFeedbackAdapter.reviewDesign(currentSpec, userMessage)`. Single LLM call returning a `DesignSpecPatch`, applied to the current spec. No more 3-stage rerun per chat message.
  2. **Correct route (from accepted Clarification A):** Wire `packages/dashboard/src/app/api/pages/[pageId]/design/correct/route.ts` to `BrowserFeedbackAdapter`. The existing TODO at line 155 is resolved — the adapter provides the `LLMProvider` + `BrowserSession` + spec-patch mechanism the route was missing.
- **Files:**
  - `packages/dashboard/src/app/api/pages/[pageId]/design/chat/route.ts` — rewrite
  - `packages/dashboard/src/app/api/pages/[pageId]/design/correct/route.ts` — wire to adapter
- **Unit tests:**
  - `packages/dashboard/src/app/api/pages/__tests__/chat-route.test.ts`: asserts single LLM call (mock provider call count = 1), asserts returned spec has the user's change applied, asserts no research/planning stage events emitted
  - `packages/dashboard/src/app/api/pages/__tests__/correct-route.test.ts`: asserts `BrowserFeedbackAdapter` is called with spec + annotations, asserts corrected spec is written to disk
- **Verification:**
  - Chat unit test green: `nx test dashboard --testPathPattern chat-route`
  - Correct unit test green: `nx test dashboard --testPathPattern correct-route`
  - Chat: 1 LLM call instead of 3
  - Chat: design spec incorporates change request
  - Correct: annotations + LLM-driven corrections work (no longer stubbed)
  - Run-manager events show only "Design" stage for chat
  - `nx run-many -t typecheck` and `nx run-many -t test` green

---

**Task 3.6: Dashboard pipeline E2E test**
- **Category:** Regression guard — proves pipeline unification didn't break the user-visible flow
- **Duration:** 0.5 days
- **Depends on:** Task 3.1
- **What:** Create `e2e/unify-pipeline.spec.ts` with Playwright tests that verify the dashboard's design pipeline produces a renderable prototype end-to-end. Uses the PET fixture (no LLM calls — tests the pipeline wiring, not LLM output).
- **Test scenarios:**
  1. **Full pipeline produces typed artifacts** — trigger dashboard pipeline on PET fixture, assert `research.json` parses against `UXResearchOutputSchema` (no `_migrated` marker), assert `planning.json` parses against `UXPlanningOutputSchema`.
  2. **Prototype renders after pipeline** — navigate to `/design`, click Prototype, wait for `waitForRendererReady()`, assert `[data-persistent="header"]` is visible (LayoutShell active), assert `ScreenSelectorBar` shows expected page count.
  3. **Chat iteration uses single LLM call** — trigger a chat message, assert run-manager events show only "Design" stage (not Research+Planning+Design). *(Can be `test.fixme` if chat requires API key — the unit test from Task 3.5 is the primary guard.)*
- **Files:**
  - `e2e/unify-pipeline.spec.ts` — new
- **Verification:**
  - `npx playwright test e2e/unify-pipeline.spec.ts` green (headed + headless)
  - All existing E2E tests still pass: `npx playwright test`

---

## Phase 4 — Stage 1 Unification (days 12-13, independent)

---

**Task 4.1: Unify `design:generate` and `spec/generate`**
- **Category:** **B**
- **Duration:** 1 day
- **Depends on:** Nothing (independent of Phases 1-3)
- **What:** Extract `generateAppSpec(input)` into `packages/agents-ux/src/app-spec/generate-app-spec.ts`. Both CLI and dashboard call it. Reconcile `status: 'approved'` (CLI) vs `status: 'draft'` (dashboard) as explicit `autoApprove: boolean` parameter, default `false`.
- **Files:**
  - `packages/agents-ux/src/app-spec/generate-app-spec.ts` — new
  - `packages/cli/src/commands/design-generate.ts` — use shared function
  - `packages/dashboard/src/app/api/spec/generate/route.ts` — use shared function
- **Verification:**
  - One `generateAppSpec` function, both callers use it
  - Status difference is an explicit input
  - `nx run-many -t typecheck` and `nx run-many -t test` green

---

## Phase 5 — Documentation & ADRs (days 13-14.5)

---

**Task 5.1: Parity test green**
- **Category:** Verification milestone
- **Duration:** 0.5 days
- **Depends on:** Tasks 3.1, 2.1
- **What:** Activate parity test from Task 0.2. Assert on-disk artifacts byte-identical for `(CLI, browser)` vs `(Dashboard, browser)` modulo allowed telemetry diff.
- **Verification:**
  - Parity test green, `nx test agents-ux` green

---

**Task 5.2: ADRs, dataflow doc, cleanup**
- **Category:** Mandatory (CLAUDE.md §Spec Sync on Feature Completion)
- **Duration:** 1 day
- **Depends on:** Tasks 3.2, 2.1
- **What:**
  - Write four ADRs: unified pipeline, browser default, feedback-loop strategy, Stage 7 deferral
  - Update `docs/architecture/design-pipeline-dataflow.md` — three-layer structure, `designTool` parameter, `chromePass` field
  - Update `CLAUDE.md` rejected patterns: "parallel dashboard pipeline reimplementing agent work functions"
  - Close `docs/issues/cli-dashboard-pipeline-divergence.md`
  - Minor cleanup: tighten `evaluateDesign` second-argument contract (Category D)
- **Verification:**
  - ADRs exist and cross-reference correctly
  - Dataflow doc matches actual code
  - Issue doc marked closed

---

## Dependency Graph

```
Phase 0 (days 1-3)                Phase 0.5 (days 3-4.5)
                                  
 0.1 (schemas)                     0.5.1a (move design utils to core)
  |  \                               |
  v   v                            0.5.1b (scaffold schema)
 0.2  0.4 (shallow wrapper)         |
 (parity)                         0.5.2 (scaffoldProject in core)
  |                                  |
  v                                0.5.3 (scaffold parity test)
 0.3 (lint)
  \
   +---> Phase 1 (days 4.5-7)
          |
        1.1 (sink interface + PipelineInput w/ chromePass)
          |         \
        1.2          1.1s (spike: single-shot patch)
        (nodes +       |
         browserDesignWork)
          |            |
        1.3 (orchestrator)
          |
        1.4 (sink contract tests)
         / \
Phase 2    Phase 3
(days 7-9)  (days 9-12)
  |           |
2.1 (CLI     3.1 (dashboard sink
 sink +       + migration)
 migration)    |
  |          3.2 (delete callPipelineStage
2.5            + callClaudeDesignAPI)
(browser       |
 feedback)   3.5 (chat + correct route
  |            mechanism fix)
  |            [depends on 2.5]
  |            |
  |          3.6 (E2E test)
  +-----+-----+
        |
  Phase 5 (days 13-14.5)       Phase 4 (anytime)
   5.1 (parity green)           4.1 (Stage 1 unify)
   5.2 (ADRs + docs + cleanup)
```

---

## Estimated Effort

| Phase | Days | Category impact |
|-------|------|-----------------|
| Phase 0 (0.1-0.4) | 2 | Prerequisite + half of B (shape) |
| Phase 0.5 (0.5.1a-0.5.3) | 1.5 | **C done** |
| Phase 1 (1.1-1.4 + spike) | 3.5 | Prerequisite for A + full B |
| Phase 2 (2.1 + 2.5) | 2 | CLI migrated; browser feedback live |
| Phase 3 (3.1 + 3.2 + 3.5 + 3.6) | 4 | **Full B done**; A unlocked; correct/route wired; E2E guard |
| Phase 4 (4.1) | 1 | Stage 1 B fix |
| Phase 5 (5.1 + 5.2) | 1.5 | Docs + verification + Category D cleanup |
| **Total** | **~15.5 days** | All A/B/C/D categories resolved |

With two parallel engineers: ~10 days.

---

## Falsifiability (from review notes §10)

- If dashboard chat goes into steady use before Phase 3.5: ship a caching stopgap
- If Phase 1 reveals `AgentContext` shape isn't portable: budget for mid-phase sink interface adjustment
- If parity test surfaces unexpected artifact differences: widen allowed-diff envelope
- If spike (Task 1.1s) shows single-shot patch fails: switch `FeedbackAdapter` to multi-turn

## Key Files

| File | Role | When changed |
|------|------|-------------|
| `packages/core/src/types/design-phase-state.ts` | State schema | Phase 0 (Task 0.1) |
| `packages/core/src/types/scaffold.ts` | Scaffold schema | Phase 0.5 (Task 0.5.1b) |
| `packages/core/src/design/archetypes.ts` | Design utilities (moved from CLI) | Phase 0.5 (Task 0.5.1a) |
| `packages/core/src/scaffolding/scaffold-project.ts` | Shared scaffolding | Phase 0.5 (Task 0.5.2) |
| `packages/agents-ux/src/design-pipeline/` | Layer B (interface + nodes + orchestrator) | Phase 1 |
| `packages/agents-ux/src/feedback/` | Feedback adapters | Phase 2 (Task 2.5) |
| `packages/cli/src/telemetry/cli-sink.ts` | CLI sink impl (in CLI package) | Phase 2 (Task 2.1) |
| `packages/cli/src/commands/design-page.ts` | CLI entry | Phase 2 (Task 2.1) |
| `packages/dashboard/src/app/api/_lib/dashboard-sink.ts` | Dashboard sink impl (in dashboard package) | Phase 3 (Task 3.1) |
| `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts` | Dashboard pipeline | Phase 0 (Task 0.4), Phase 3 (Task 3.1) |
| `packages/dashboard/src/app/api/pages/[pageId]/design/chat/route.ts` | Chat route | Phase 0 (Task 0.4), Phase 3 (Task 3.5) |
| `packages/dashboard/src/app/api/pages/[pageId]/design/correct/route.ts` | Correction route | Phase 3 (Task 3.5) |
| `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts` | Dashboard helpers | Phase 3 (Task 3.2 — delete both functions) |
| `e2e/unify-pipeline.spec.ts` | E2E regression guard | Phase 3 (Task 3.6) |
