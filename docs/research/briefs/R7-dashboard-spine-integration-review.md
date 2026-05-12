# R7 Brief Verification Report

!!! info "Scope"

    Factual verification of `R7-dashboard-spine-integration.md` against current codebase state (2026-05-12). Three sections: verification findings, suggested edits, M1 implementation implications.

---

## Section A — Verification Findings

### 1. Code Excerpts

**1a. `packages/agents-ux/src/design-pipeline/types.ts` — `PipelineInput` interface**

- **Verdict: Accurate.** The brief's excerpt (lines 69-97) matches the current file verbatim. All fields, types, and comments are correct. `PipelineTelemetrySink`, `ChromePassConfig`, and module doc are also accurate.

**1b. `packages/cli/src/commands/design-page.ts` — "lines 530-564"**

- **Verdict: Accurate.** The cited code at lines 530-564 matches. `prdRequirements = [description]` is at line 530, `pipelineInput` construction spans lines 544-564. The brief reproduces this faithfully.

**1c. `packages/dashboard/src/app/api/_lib/pipeline-input-builder.ts` — "lines 71-137"**

- **Verdict: Accurate.** The function signature at line 71 and return object at lines 118-137 match. `designTool: 'browser'` (line 122), `providerString: 'claude'` (line 123), and the absence of `designSystemPrompt` (no line sets it) are all confirmed. The `// designSystemPrompt: MISSING` comment in the brief's excerpt is editorial (not in the real file), but the observation is correct — the field is not set.

**1d. `packages/dashboard/src/app/api/design/generate-all/route.ts`**

- **Verdict: Accurate.** The no-op `Writable` sink (lines 20-23), direct delegation to `designPageAllCommand(sink, { projectRoot })` (line 29), and `process.exitCode` pattern match. The brief's characterization of "zero telemetry, zero run tracking, zero SSE progress" is confirmed.

**1e. `packages/cli/src/utils/pipeline-context.ts`**

- **Verdict: Accurate.** The `createPipelineContext` function (lines 35-58) matches the excerpt. 5 params, `mcpClient` optional, `Ok({ status: 'proceed' as const })` governance bypass, `debugLog` on missing `baseDir` — all confirmed.

**1f. `packages/dashboard/src/app/api/_lib/pipeline-context.ts`**

- **Verdict: Accurate.** The `createDashboardPipelineContext` function (lines 19-35) matches. 4 params, no MCP, `providerFactory` required, `Ok({ status: 'proceed' as const })` governance bypass — all confirmed.

**1g. `packages/dashboard/src/app/api/_lib/dashboard-sink.ts`**

- **Verdict: Accurate.** `STAGE_INDEX = { research: 0, planning: 1, design: 2 }` at lines 16-19, `VISIBLE_STAGE_COUNT = 3` at line 21, `HIDDEN_STAGES = new Set(['evaluator'])` at line 23 — all match.

**1h. `packages/core/src/types/cross-boundary-artifacts.schemas.ts`**

- **Verdict: Accurate.** `PRDSchema` (lines 121-139), `EnrichedRequirementSchema` (lines 152-161), and `FeaturePlanSchema` (lines 190-193) match the brief's excerpts. The brief's inline comments (e.g., `// 'bootstrap' | 'evolution'`) are fair paraphrases of the actual schema.

---

### 2. Inconsistencies Table

**Row: `designTool` — Dashboard hardcoded `'browser'`**

- **Verdict: Accurate.** `pipeline-input-builder.ts:122` → `designTool: 'browser'`. CLI has `--tool` flag (`design-page.ts:347`). Per ADR-047, browser is the default and dashboard hardcoding is intentional, so this is a design choice, not a bug. The brief correctly identifies it as hardcoded.

**Row: `providerString` — Dashboard hardcoded `'claude'`**

- **Verdict: Accurate.** `pipeline-input-builder.ts:123` → `providerString: 'claude'`. CLI uses `resolveCLIModel()` (`design-page.ts:549`). This IS an inconsistency — the dashboard cannot use per-stage model resolution.

**Row: `designSystemPrompt` — Dashboard "missing entirely"**

- **Verdict: Partial.** The field is not set in `buildDashboardPipelineInput`. However, the CLI also sets it to `undefined` at runtime — `projectDesignSystemPrompt` is declared at `design-page.ts:493` but never assigned before being passed to `PipelineInput` at line 563. The design system prompt is built *post-pipeline* by the feedback loop from `planningOutput`. The gap is real but narrower than the brief implies — both paths pass `undefined` to the pipeline; the difference is CLI builds it for the post-pipeline feedback loop while dashboard doesn't.

**Row: `chromePass` — Dashboard "Not used"**

- **Verdict: Accurate.** Grep confirms zero `chromePass` or `ChromePassConfig` references in `packages/dashboard/`. Only `packages/cli/src/commands/design-page-all.ts` generates/consumes Chrome Pass.

**Row: Telemetry sink — Dashboard all-pages "No-op sink (silent)"**

- **Verdict: Accurate.** `generate-all/route.ts:20-23` creates `new Writable({ write(_chunk, _encoding, callback) { callback(); } })`. Zero telemetry, zero SSE events, zero run tracking.

**Row: Run/task tracking — Dashboard per-page has `startRun`/`failRun` + task entry**

- **Verdict: Accurate.** The dashboard per-page design route uses `DashboardSseSink` which calls `updateRunStatus()` and `emitStageEvent()` (`dashboard-sink.ts:56-68`).

---

### 3. Settled Decisions

**3(a): "All design generation goes through the spine — there is no standalone mode."**

- **Verdict: Destination commitment, NOT current state.**

Evidence:

- `packages/orchestrator` does not exist.
- Zero code imports or invokes a spine graph (grep for `spine`, `runSpine`, `spineGraph` returned nothing across all packages).
- The execution plan line 779 states this as M1's goal: "Thread Clarifier's structured PRD into design pipeline input. All design generation goes through the spine..."
- M1 is explicitly "Blocked by R5, R7, R8" (line 785). No implementation exists.
- The current design pipeline (`pipeline.ts`) is an imperative `for...of` loop with zero LangGraph references.
- **The brief presents this as a "Settled Decision" but should label it as a "Destination Commitment (M1, not yet implemented)."**

**3(b): "Single-writer per artifact. (Vision Layer 8, locked)"**

- **Verdict: Accurate citation, slightly mislabeled scope.**

Vision Layer 8 (lines 622-628) says: "**Single-threaded writer within a task.** Kills PRD Section 24.2's parallel pattern." This is about the *Implementer* stage. Vision Layer 7 (line 546) says: "Per-screen generation is **single-threaded within a screen.**" This covers the *design pipeline*. The principle IS documented as locked in both Layer 7 and Layer 8, and as a top-level principle in `design-decisions.md` Section 1.4. The brief cites Layer 8, but for design-pipeline context, Layer 7 is the more precise reference.

**3(c): "LangGraph checkpointing for spine state. (Vision Layer 4, locked)"**

- **Verdict: Accurate citation, but the brief omits critical operational caveats.**

Vision Layer 4 (lines 323-327) confirms Postgres checkpointer is locked. However, Layer 4 line 312 says: "**Not yet wired into any pipeline** — waiting for LangGraph StateGraph adoption (ADR-043 Phase M-2+)." This is slightly stale — the Clarifier IS wired to the checkpointer (`agents-clarifier/src/run.ts:78,268` and the dashboard Clarifier route via `getSharedCheckpointer()`). But the design pipeline is NOT wired — it uses imperative file-based caching (`loadCachedArtifact`/`saveCachedArtifact` in `pipeline.ts`), not LangGraph checkpointing.

Critical caveat the brief should surface: `dashboard/src/app/api/_lib/checkpointer.ts` has a bare `catch {}` that silently falls back to `MemorySaver` when Postgres connection fails. Checkpoint durability is invisible to operators.

**3(d): "`PipelineInput` gets `enrichedRequirement` and `featurePlan` fields."**

- **Verdict: Destination commitment, NOT current state.**

`PipelineInput` in `types.ts` (lines 68-97): No `enrichedRequirement` or `featurePlan` fields exist today. The execution plan (lines 453-458) shows this as a "Solution" code sketch, not implemented code.

`FeaturePlan` IS produced by the Clarifier's `story-writer.ts` node (line 300: `const featurePlan = assembleFeaturePlan(response, state)`), and stored in Clarifier graph state (`types.ts:90: readonly featurePlan: FeaturePlan | null`). But no code threads `FeaturePlan` from Clarifier state into `PipelineInput`. This is an M1 deliverable, not a current state fact.

**3(e): "Chrome Pass is the cross-screen consistency mechanism."**

- **Verdict: Accurate.**

ADR-039 (Accepted, 2026-04-20) documents Chrome Pass. `packages/cli/src/commands/design-page-all.ts` implements the 2-pass loop (generate line 343, consume line 415). `packages/agents-ux/src/design-pipeline/` consumes the config (`pipeline.ts:48`, `nodes.ts:108-110`). Currently active in CLI only — dashboard does not use Chrome Pass.

---

### 4. Open Questions

**4(a): Q5 — Clarifier → design bridge.**

- **Verdict: Partially decided.**

`docs/plans/active/integrating-clarifier/execution-plan.md` commits to: user clicks "Approve & Continue" → `POST /api/projects` with `prdContent` → `scaffoldProject` writes to `docs/prd.md` → navigate to `/projects/{projectId}`. `CreateProjectSchema` already accepts `prdContent` (plain markdown string). It does NOT accept `assumptions`, `enrichedRequirement`, or `featurePlan`.

`scaffold-project.ts:124-127` writes `prdContent` to `{projectDir}/docs/prd.md` as plain markdown — not structured YAML.

Still open sub-questions:

1. Does the structured `EnrichedRequirement` get persisted as YAML in `agentforge/spec/` or only as markdown in `docs/prd.md`?
2. How does the Clarifier's `threadId` reach the design pipeline? (not addressed by Integrating Clarifier plan)
3. Does `FeaturePlan` get written to disk on approval, or looked up from the checkpointer at design-time?
4. `CreateProjectSchema` has no `assumptions`, `enrichedRequirement`, or `featurePlan` fields — adding these is an M1 prerequisite.

**4(b): Q6 — PipelineInput extension source.**

- **Verdict: Genuinely open.**

`FeaturePlan` is produced by `story-writer.ts` in the Clarifier and stored in Clarifier LangGraph state (`ClarifierState.featurePlan`). The Integrating Clarifier plan says nothing about where structured artifacts get written after approval — only that `prdContent` (plain text) goes to `docs/prd.md`. Three realistic sources for M1 (checkpointer lookup by `threadId`, disk YAML, request body) — none committed. The brief correctly identifies this as open.

**4(c): Q7 — Generate All in spine mode.**

- **Verdict: Partially answerable now.**

"Single spine invocation" cannot exist until `packages/orchestrator` is built (M4, not M1). M1 line 779 says "All design generation goes through the spine," but the "spine" at M1 is threading Clarifier output into the design pipeline — the full 4-stage spine doesn't exist until M4.

For M1 minimum fix: the dashboard all-pages route needs a `DashboardSseSink` instead of a no-op `Writable`, and run tracking around the loop. The `designPageAllCommand` delegation model can stay but needs a `PipelineTelemetrySink` parameter. What stays: N sequential pipeline invocations. What changes: telemetry sink injection, run tracking, threading `enrichedRequirement` into each invocation.

**4(d): Q8 — Stage count and telemetry.**

- **Verdict: The Clarifier route ALSO hardcodes stages.**

`packages/dashboard/src/app/api/clarifier/route.ts` lines 22-42: `STAGE_LABELS` (8 entries) and `PIPELINE_STEP_ORDER` (8 stages) are hardcoded. The same data-driven solution applies to both pipelines.

The stage-count question IS independent of the Architect-absorption question. Making `STAGE_INDEX` data-driven is a standalone improvement that benefits the current pipeline, even without the Architect. Untangling: (1) data-driven stage descriptor is an immediate improvement; (2) stage renaming (research/planning → architect) is an M2/M3 concern.

---

### 5. Schema Completeness for Per-Page Input

| Schema | Field checked | Feature-to-screen link? |
|--------|--------------|------------------------|
| `FeatureNodeSchema` (lines 180-188) | `id`, `name`, `description`, `acceptanceCriteria`, `priority`, `dependencies`, `status` | **No `screenId` or `screens` field** |
| `ScreenRefSchema` (lines 114-119) | `id`, `name`, `description`, `screenType` | **No `featureId` or `features` field** |
| `PRDSchema.screens` (line 128) | `z.array(ScreenRefSchema)` | Flat list, no feature linkage |
| `ScreenPlanSchema` (lines 205-216) | Has `featureId: z.string()` at line 207 | **Yes — but this is an Architect output (M2/M3), not available at M1** |

**How would `buildPipelineInput` for page X derive "features that apply to screen X" at M1?**

Realistic options:

1. **Name/description matching** — fuzzy match `FeatureNode.name` against `ScreenRef.name/description`. Fragile, heuristic.
2. **LLM-assisted mapping** — lightweight LLM call maps features to screens at design-time. Adds latency and cost.
3. **Defer to stage** — don't map features to screens in M1. Pass the full `FeaturePlan` to every page's design pipeline and let the Research/Planning stage filter. Simpler but wasteful.
4. **Extend `ScreenRefSchema`** — add `featureIds: z.array(z.string()).optional()`. Requires the Clarifier's `prd-analyzer` to produce the mapping. Invasive change.

**Verdict: This IS a hidden M1 prerequisite the brief omits.** The brief's Scenario 1 says "the `FeaturePlan` DAG showing which features map to this screen" — but no such mapping exists in the schemas today. Option 3 (pass everything, let the stage filter) is the simplest M1 path. Option 4 is the clean solution but requires Clarifier changes.

---

### 6. Related Work the Brief Should Reference

**Unify Pipeline (Phases 0-5, completed 2026-04-26):**

Shipped `runDesignPipeline()` as the single entry point, `PipelineInput` interface, `PipelineTelemetrySink`, `CliStdoutSink`, `DashboardSseSink`, three-layer architecture (work functions / orchestrator / transport callers), ADR-046 through ADR-049. This is the foundation R7 builds on. **The brief does not cite this plan or ADR-046.**

**Dashboard Pipeline Fix (active, 0/6 phases started):**

Scope: `import.meta.url` under webpack breaks dashboard pipeline execution. Independent of R7 (runtime bug vs. architectural question) but must be resolved before R7's dashboard changes can be tested. **The brief does not mention this dependency.**

**ADRs the brief should cite:**

| ADR | Why |
|-----|-----|
| ADR-039 | Chrome Pass. Already implicitly referenced but not cited by number. |
| ADR-043 | TypeScript-only orchestration. Relevant to the spine runtime commitment. |
| ADR-046 (unified pipeline) | Directly foundational — shipped the three-layer architecture R7 extends. **Note:** numbering collision with `ADR-046-langfuse-observability.md`. |
| ADR-047 | Browser default design tool. Explains why `designTool: 'browser'` is hardcoded in dashboard. |
| ADR-049 | Stage 7 dashboard deferral. Constrains what the dashboard pipeline runs. |

---

### 7. Citations

**"Vision Layer 8, locked" for single-writer:**

- **Verdict: Partially miscited.** Layer 8 is Implementation (lines 564-640). The single-threaded principle there is about the Implementer writing code. For the design pipeline, the equivalent locked decision is in Layer 7 (line 546): "Per-screen generation is **single-threaded within a screen.**" The brief should cite Layer 7 for design-pipeline context and Layer 8 for the broader principle.

**"Vision Layer 4, locked" for checkpointing:**

- **Verdict: Accurate.** Layer 4 (lines 323-327) confirms Postgres checkpointer locked. But the brief should note that the checkpointer is wired only for the Clarifier, not the design pipeline.

**"Execution plan M1, line 779/780":**

- **Verdict: Accurate with minor line-number imprecision.** Line 778 is the section header. Line 779 contains both "All design generation goes through the spine" AND "Dashboard 'Generate All' and per-page buttons, CLI `design:page` and `design:page:all` all invoke the spine path" — these are the same paragraph, not separate lines 779 and 780. Line 780 is blank.

**"Execution plan Phase 1 solution" for PipelineInput extension:**

- **Verdict: Accurate.** Lines 443-458 show the before/after code sketch under "3.3 Concrete Solutions."

**"Types.ts module doc, diverges from feature plan §1.5":**

- **Verdict: Accurate.** The module doc at `types.ts:1-9` says "Sink interface diverges from feature-plan §1.5 (OTel span shape) per execution-plan §'Corrections applied' #2."

---

## Section B — Suggested Edits to the Brief

### Edit 1: Settled Decisions — add temporal labels

Replace the Settled Decisions section with:

```markdown
## Settled Decisions

### Destination commitments (planned, not yet implemented)

- **All design generation goes through the spine — there is no standalone mode.**
  (Execution plan M1, line 779. M1 blocked by R5, R7, R8 — no implementation
  exists yet. `packages/orchestrator` does not exist; the current design pipeline
  is an imperative function, not a LangGraph graph.)
- **`PipelineInput` gets `enrichedRequirement` and `featurePlan` fields.**
  `prdRequirements` becomes migration-period compat only. (Execution plan lines
  453-458. These fields do not exist on `PipelineInput` today.)
- **Dashboard "Generate All" and per-page buttons, CLI `design:page` and
  `design:page:all` all invoke the spine path.** (Execution plan M1, line 779.
  Destination commitment — not current state.)

### Current architectural commitments (locked, documented)

- **Single-writer per artifact.** The design pipeline is single-threaded within
  a screen. (Vision Layer 7 locked decision #1; broader principle at Layer 8
  locked decision #1 and `design-decisions.md` §1.4)
- **Typed channels between stages.** Every cross-boundary artifact has a Zod
  schema in `packages/core/src/types/`. (Vision Layer 2, locked)
- **LangGraph checkpointing for spine state.** Postgres checkpointer for
  production, MemorySaver for dev. (Vision Layer 4, locked. Currently wired only
  for the Clarifier pipeline. Design pipeline uses imperative caching, not
  checkpointing. **Caveat:** `dashboard/src/app/api/_lib/checkpointer.ts`
  silently falls back to MemorySaver on Postgres connection failure via a bare
  `catch {}` — checkpoint durability is invisible to operators.)
- **Chrome Pass is the cross-screen consistency mechanism.** (ADR-039;
  `ChromePassConfig` in `types.ts`. Currently CLI-only — dashboard does not
  use Chrome Pass.)
- **`PipelineTelemetrySink` is the telemetry contract.** Flat callbacks, NOT
  OTel-shaped. (Types.ts module doc, diverges from feature plan §1.5)
```

### Edit 2: Inconsistencies table — qualify designSystemPrompt row

Replace the `designSystemPrompt` row with:

```markdown
| `designSystemPrompt` | Built post-pipeline from `planningOutput` (feedback loop only) | Same | **Not built** (no feedback loop in dashboard path) | Via CLI (built) |
```

The current row says "Built from brand spec" for CLI, but the CLI actually passes `undefined` to `PipelineInput` — the prompt is built *after* the pipeline for the feedback loop, not *during* input construction.

### Edit 3: Q5 — narrow to what's actually still open

Replace Q5 with:

```markdown
### 5. Clarifier → Design bridge

**Partially decided.** The Integrating Clarifier plan
(`docs/plans/active/integrating-clarifier/`) commits to: user clicks
"Approve & Continue" → `POST /api/projects` with `prdContent` →
`scaffoldProject` writes to `docs/prd.md` → navigate to
`/projects/{projectId}`. `CreateProjectSchema` already accepts `prdContent`
(plain markdown string).

**What's still open:**

- Does the structured `EnrichedRequirement` get persisted as YAML in
  `agentforge/spec/` or only as markdown in `docs/prd.md`? (Currently
  only markdown.)
- How does the Clarifier's `threadId` reach the design pipeline? The
  Integrating Clarifier plan does not address this.
- Does `FeaturePlan` get written to disk on approval, or looked up from
  the checkpointer at design-time?
- `CreateProjectSchema` has no `assumptions`, `enrichedRequirement`, or
  `featurePlan` fields — only `prdContent`. Adding these is an M1
  prerequisite.
```

### Edit 4: Add hidden prerequisite — feature-to-screen mapping

Add a new section after the Open Questions:

```markdown
### Hidden Prerequisite: Feature-to-Screen Mapping

The brief's Scenario 1 says "the `FeaturePlan` DAG showing which features
map to this screen." No such mapping exists in the schemas today:

- `FeatureNodeSchema` has no `screenId` or `screens` field.
- `ScreenRefSchema` has no `featureId` or `features` field.
- `ScreenPlanSchema` has `featureId`, but it's an Architect output (M2/M3),
  not available at M1.

M1 must decide: pass the full `FeaturePlan` to every page (simple, wasteful),
add a mapping field to `ScreenRefSchema` (clean, requires Clarifier changes),
or use heuristic matching (fragile). This decision blocks the "thread
structured PRD into design pipeline" deliverable.
```

### Edit 5: Add Related Work section

Add before External References:

```markdown
## Related Work

- **Unify Design Pipeline (Phases 0-5, completed 2026-04-26)** — shipped
  `runDesignPipeline()`, `PipelineInput`, `PipelineTelemetrySink`,
  three-layer architecture. R7 builds directly on this foundation. See
  `docs/plans/completed/unify-pipeline/execution-plan.md`, ADR-046
  (unified pipeline), ADR-047 (browser default), ADR-048 (feedback
  strategy), ADR-049 (Stage 7 deferral).
- **Dashboard Pipeline Fix (active, 0/6 phases started)** —
  `import.meta.url` under webpack breaks dashboard pipeline execution.
  Must be resolved before R7's dashboard changes can be tested. See
  `docs/plans/active/dashboard-pipeline-fix/execution-plan.md`.
- **ADR-039** — Chrome Pass shared layouts. Currently CLI-only.
- **ADR-043** — TypeScript-only orchestration. LangGraph is the sole runtime.
- **Integrating Clarifier (active)** — wires "Approve & Continue" button,
  project creation from approved PRD. Partially addresses Q5.

!!! warning "ADR-046 numbering collision"

    Two files share the ADR-046 number: `ADR-046-unified-design-pipeline.md`
    and `ADR-046-langfuse-observability.md`. One should be renumbered.
```

### Edit 6: Add Clarifier route stage hardcoding note to Q8

Append to Q8:

```markdown
**Note:** The Clarifier API route
(`packages/dashboard/src/app/api/clarifier/route.ts`) also hardcodes its
stage list (`STAGE_LABELS` with 8 entries, `PIPELINE_STEP_ORDER` with 8
stages at lines 22-42). The same data-driven solution applies to both
pipelines. Making stage descriptors data-driven is independent of the
Architect-absorption question and can be tackled immediately.
```

---

## Section C — M1 Implementation Implications

### Should FeaturePlan threading land in M1 or be deferred?

**It should land in M1, but with a simplified feature-to-screen mapping strategy.**

Evidence:

- The execution plan (lines 453-458) explicitly includes `enrichedRequirement` and `featurePlan` as M1 fields.
- `FeaturePlan` is already produced by the Clarifier's `story-writer.ts` (line 300) and stored in Clarifier graph state.
- The producer exists. The gap is (a) persistence after approval, (b) retrieval at design time, and (c) per-page feature filtering.
- For (c), the simplest M1 approach: pass the full `FeaturePlan` to every page's pipeline and let the Research/Planning stage filter. Defer `ScreenRefSchema.featureIds` to M2 when the Architect (which produces `ScreenPlan` with `featureId`) becomes available.

### What is the canonical Clarifier → design handoff for M1?

**Decided pieces:**

- `prdContent` → `docs/prd.md` (plain markdown, wired end-to-end via `scaffoldProject`).
- The "Approve & Continue" button, project creation API, and directory scaffolding all exist.

**Undecided pieces requiring decisions before code lands:**

1. **Structured artifact persistence format:** Should `EnrichedRequirement` and `FeaturePlan` be written as YAML in `agentforge/spec/enriched-requirement.yaml` and `agentforge/spec/feature-plan.yaml`, or looked up from the checkpointer by `threadId`? The disk approach is simpler, testable offline, and consistent with existing YAML artifact patterns. The checkpointer approach avoids data duplication but couples design-time to Postgres availability.
2. **`threadId` plumbing:** How does the Clarifier's `threadId` (returned via SSE, stored in React state) reach the design pipeline? Options: request body parameter, server-side session store, or persisted to a project config file during approval.
3. **`CreateProjectSchema` extension:** Needs `enrichedRequirement`, `featurePlan`, and `assumptionLedger` fields (or a single `clarifierOutput` field wrapping all three).

### Hidden prerequisites M1 must settle before code lands

1. **Feature-to-screen mapping** — no schema links features to screens. M1 must decide: pass full `FeaturePlan` to every page (recommended for M1), or add `featureIds` to `ScreenRefSchema`.
2. **Dashboard Pipeline Fix** — `import.meta.url` under webpack must be resolved before the dashboard can run the design pipeline at all. R7's dashboard changes cannot be tested until this is fixed.
3. **Structured artifact persistence format** — disk YAML vs. checkpointer lookup.
4. **`threadId` plumbing path** — request body vs. session store vs. project config.
5. **ADR-046 numbering collision** — two ADRs share the 046 number; resolve to avoid citation ambiguity.

### Which "Settled Decisions" should be downgraded?

| Decision | Current label | Recommended label | Reason |
|----------|--------------|-------------------|--------|
| "All design generation goes through the spine" | Settled | **Destination commitment (M1)** | No implementation exists. `packages/orchestrator` absent. Design pipeline is imperative, not LangGraph. M1 blocked by R5, R7, R8. |
| "`PipelineInput` gets `enrichedRequirement` and `featurePlan` fields" | Settled | **Destination commitment (M1)** | Fields don't exist on `PipelineInput` today. Code sketch in execution plan only. |
| "Dashboard + CLI all invoke the spine path" | Settled | **Destination commitment (M1)** | Same — no spine path exists to invoke. |
| "LangGraph checkpointing for spine state" | Settled | **Keep as settled, add caveat** | Commitment IS locked (Layer 4). But note: only Clarifier uses checkpointer today; design pipeline uses imperative caching; dashboard's silent MemorySaver fallback is an operational risk. |
| "Single-writer per artifact" | Settled | **Keep as settled** | Accurate — locked in Layers 7 and 8. Fix citation from Layer 8 to Layer 7 for design-pipeline context. |
| "Chrome Pass is the cross-screen consistency mechanism" | Settled | **Keep as settled, note CLI-only** | ADR-039 is accepted. Dashboard doesn't use it — worth noting. |

---

## PRD Issues Found

1. **ADR-046 numbering collision:** Two files share the ADR-046 number — `ADR-046-unified-design-pipeline.md` and `ADR-046-langfuse-observability.md`. The observability ADR should be renumbered (it's referenced as ADR-046 in CLAUDE.md's Observability section).

2. **Vision Layer 4 stale current-state:** Layer 4 says "Not yet wired into any pipeline." This is inaccurate — the Clarifier pipeline (`agents-clarifier/src/run.ts:78,268`) uses `createCheckpointer()` and the dashboard Clarifier route uses the checkpointer singleton. Layer 4's Current State should be updated to reflect that the Clarifier IS wired.

3. **Dashboard checkpointer silent fallback:** `packages/dashboard/src/app/api/_lib/checkpointer.ts` has a bare `catch {}` (no logging) that falls back to `MemorySaver` when Postgres connection fails. This violates the spirit of "No stub fallbacks when imports fail" — a non-durable checkpointer silently replacing a durable one is functionally a stub fallback. At minimum, it should log a warning.

4. **`designSystemPrompt` gap in both paths:** Both CLI and dashboard pass `undefined` to `PipelineInput.designSystemPrompt` during input construction. The CLI builds it post-pipeline for the feedback loop only. If the design pipeline is supposed to use a design system prompt during generation (not just post-generation feedback), this is a gap in both paths, not just the dashboard.
