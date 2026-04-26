# CLI vs Dashboard Pipeline Divergence

**Created:** 2026-04-24
**Last updated:** 2026-04-24 (rev 2) — reconciled with spec-sync changes to `sdlc-agents.md`, `appendices.md`, `dashboard.md`, `governance-and-operations.md`, `platform-architecture.md`, and `PRD.md`. Key effects: (a) Figma is now formally removed across the specs (`sdlc-agents.md:249`, `appendices.md:250`, `governance-and-operations.md:137`); the shared-pipeline `designTool` enum is therefore `'browser' | 'penpot'` only. (b) Line citations into `sdlc-agents.md` updated for the doc's new length (Phase C: `:191-197` → `:221-227`; §11.1.4: `:213-217` → `:245-249`). (c) Browser-first framing is now the top-line language in §11.1.1 (`:67`) and explicit in `dashboard.md:400` ("source of truth for layout fidelity — not an optional tool"), which strengthens the Category-A reframing rather than weakening it.
**Last updated:** 2026-04-26 (rev 3) — closed. All categories resolved via Unify Design Pipeline Phases 0-4.
**Last updated (rev 2):** 2026-04-24 — reconciled with spec-sync.
**Last updated (rev 1):** 2026-04-24 — reclassified each divergence as A/B/C/D.
**Status:** Closed (2026-04-26)
**Severity:** Resolved
**Owner:** TBD
**Related:** `docs/architecture/design-pipeline-dataflow.md`, `docs/issues/dashboard-pipeline-gap-analysis.md`, `docs/issues/design-pipeline-audit.md`, `docs/feature-plans/unify-design-pipeline.md`, `docs/adrs/ADR-043-typescript-only-orchestration.md`, ADR-046, ADR-047, ADR-048, ADR-049

## Resolution (2026-04-26)

All categories resolved via Unify Design Pipeline execution plan (Phases 0-4):

- **Category A** (Stages 4, 6-channel, 7): Shared pipeline with `designTool: 'browser' | 'penpot'`
  parameter. `BrowserFeedbackAdapter` for chat/correct. Stage 7 deferred (ADR-049).
- **Category B** (Stages 1, 2, 3, 6-mechanism): Dashboard now calls `runDesignPipeline()`
  and `generateAppSpec()`. `callPipelineStage` and `callClaudeDesignAPI` deleted.
- **Category C** (Stage 0): `scaffoldProject` extracted to `packages/core/src/scaffolding/`.
- **Category D** (Stage 5): `evaluateDesign` second-argument contract tightened (JSDoc).

ADRs: ADR-046 (unified pipeline), ADR-047 (browser default), ADR-048 (feedback strategy),
ADR-049 (Stage 7 deferral). Parity test: `packages/agents-ux/__tests__/artifact-shape-parity.test.ts`.

---

> **Framing note (new in rev 2):** per the revised agent taxonomy in `sdlc-agents.md:§10`, the Design pipeline is a **specialist tool** invoked by the Architect spine stage — not a top-level agent category. The stages this doc enumerates as "Stage 0" through "Stage 7" are the *internal* stages of that Design specialist. The CLI/dashboard divergence is therefore inside the Design specialist; the four-stage spine (Clarifier → Architect → Implementer → Reviewer) is unaffected by this analysis.

---

## Why this blocks the roadmap (critical-path framing)

This is not just a cleanup issue. It is a **prerequisite** for two already-committed roadmap items:

- **Roadmap Phase 4 — Design branch cross-screen coherence.** Target: "Per-screen pipeline refactored as a LangGraph subgraph; batch coordinator with topological ordering and in-the-loop coherence" (`docs/future-roadmap.md` §Phase 4; `docs/vision.md` Layer 7). The per-screen pipeline must be *one* definition before it can be wrapped as a subgraph. Today there are two; neither is a clean wrap target.
- **ADR-043 Phase M-3 — Port design phase graph to `@langchain/langgraph`.** Target: "7 nodes, 2 HITL gates, conditional wireframe loop… tests conditional edge routing and the most complex HITL flow." The port requires a clean TypeScript agent surface (typed inputs/outputs per node). The dashboard's free-text-string-between-stages pattern has no clean surface to wrap.

ADR-043 also warns: *"once a phase graph enters M-2/M-3 validation, no new features land on the imperative version of that phase — bug fixes only."* If M-3 starts with two imperative design-pipeline implementations, the freeze freezes both, and the LangGraph port has to reconcile them mid-port — the worst possible place to do it.

Roadmap Phase 0.2 ("Typed artifact schemas — Zod schemas for all cross-boundary artifacts") is foundational: the dashboard's `{ brief: <markdown> }` and `{ spec: <markdown> }` artifacts are direct violations of that phase's intent.

**In short:** doing Phase 4 or M-3 without fixing this first means doing them twice.

---

## TL;DR

The project has **two parallel implementations of the UX design pipeline** that were supposed to share code. They do not. The CLI path (`packages/cli/src/commands/design-page*.ts`, `packages/agents-ux/src/scripts/run-module-pipeline.ts`) calls the canonical agent work functions (`uxResearchWork`, `uxPlanningWork`, `penpotDesignWork`, `uxImplementationWork`) with **typed Zod-validated contracts**. The dashboard path (`packages/dashboard/src/app/api/pages/[pageId]/design/**`) re-implements the same stages using an ad-hoc helper (`callPipelineStage`) that **passes raw markdown strings between agents**, bypassing every contract, schema, and guard in the shared layer.

The architecture doc (`docs/architecture/design-pipeline-dataflow.md`) describes only the CLI path. The dashboard does not match the doc.

This is a direct violation of the repo's own rules in `CLAUDE.md`:

> **Typed Contracts for Cross-Agent Artifacts** — Every artifact that crosses an agent boundary […] has a Zod schema in `packages/core/src/types/`. Every LLM call with structured output uses `zod-to-json-schema` to produce the response schema.

> **Every LLM call must use typed structured output via Zod schemas. No free-text coordination between agents.**

The dashboard actively does free-text coordination between agents.

---

## Historical context

The CLI was built first, for testability. The dashboard was added later, with the explicit intent that it would reuse the CLI's agent functions instead of reimplementing. That reuse did not happen for stages 2, 3, 4, 6, and 7. Several stages (notably the design stage) were independently rebuilt with their own prompts, their own LLM call helpers, and their own on-disk artifact shapes.

---

## What actually diverged — summary table

Each row carries a **Category** column (A/B/C/D). The legend is defined in the "Reframing" section immediately below this table. In short: A = intentional channel/tool choice, needs shared adapter; B = real bug / `CLAUDE.md` violation; C = legitimate input-collection difference, shared work-function missing; D = minor cleanup.

| Stage | CLI entry point | Dashboard entry point | Shared impl? | Category | Severity |
|---|---|---|---|---|---|
| 0 — Init / Scaffold | `initCommand` @ `packages/cli/src/commands/init.ts:421` → `scaffoldProject` | `OnboardingWizard` (`packages/dashboard/src/components/onboarding/onboarding-wizard.tsx`) → `POST /api/projects` → `createProject` @ `packages/dashboard/src/app/api/_lib/project-creation.ts:123` | **No** — two scaffolding implementations; different `platforms`/`stack`/`budget` defaults; CLI collects Slack/Telegram, dashboard collects archetype + component library | **C** — legitimate channel-specific input collection, but the file-writing work should be one shared function | Medium |
| 1 — App spec (`design:generate`) | `designGenerateCommand` @ `packages/cli/src/commands/design-generate.ts:504` | `POST /api/spec/generate/route.ts:47` + `POST /api/spec/approve/route.ts:38` | **No** — parallel prompts, different `maxTokens`, different default statuses | **B** — prompts and LLM calls duplicated with no channel justification | **High** |
| 2 — Research | `uxResearchWork` @ `packages/cli/src/commands/design-page.ts:399` | `callPipelineStage(provider, 'research', ...)` @ `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts:250` | **No** | **B** — free-text markdown instead of typed `UXResearchOutput`; no Zod validation; direct `CLAUDE.md` violation | **High** |
| 3 — Planning | `uxPlanningWork` @ `packages/cli/src/commands/design-page.ts:451` | `callPipelineStage(provider, 'planning', ...)` | **No** | **B** — same pattern as Research; no schema, no contract enforcement | **High** |
| 4 — Design (DesignSpec v2 generation) | `penpotDesignWork` @ `packages/cli/src/commands/design-page.ts:750` | `callClaudeDesignAPI` @ `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts:311` | **Partial** — shares `buildDesignSpecSystemPrompt`, `buildComponentCatalogPrompt`, `SUBMIT_DESIGN_TOOL`; does NOT share a design work function | **A** — intentional channel choice (dashboard is browser-only per `sdlc-agents.md:221-227`, Phase C target; CLI can be Penpot or browser — Figma removed in the 2026-04-24 sync). Needs shared work-function dispatch, parameterized by `designTool`. Not a bug — a missing shared adapter. | Medium |
| 5 — Design evaluator | `evaluateDesign` via `--evaluate` @ `design-page.ts:883` | `evaluateDesign` @ `api/design/audit/vision/route.ts:67` | **Partial** — shared function; called with different second-argument shape (planning JSON vs DesignSpec JSON) | **D** — minor; tighten the function signature | Low |
| 6 — Feedback loop | `runDesignFeedbackLoop` @ `design-page.ts:1017` (Penpot collaboration session, multi-turn) | `runChatPipelineAsync` @ `api/pages/[pageId]/design/chat/route.ts:190` (re-runs all 3 LLM stages per chat message) + `api/pages/[pageId]/design/correct/route.ts` (annotations only; explicit TODO at `:155`) | **No** | **A** on the channel choice (browser chat vs Penpot session is legitimate); **B** on the mechanism (re-running research + planning + design per chat message is wasteful and was never an architectural decision — it's stopgap code) | **High** (mechanism); Medium (channel) |
| 7 — Implementation | `uxImplementationWork` @ `design-page.ts:928` | *none* | **No — absent from dashboard by current scope** | **A** — explicit deferral until Stages 2–6 run on the unified shared pipeline. Not a bug; a scope decision that needs to be recorded. | Medium (tracked, not broken) |

---

## Reframing — browser-only is the PRD target, not a divergence

The original v1 of this doc framed every row in the table as a bug. That framing is wrong for the rows marked **A**. Three authoritative sources make this explicit (after the 2026-04-24 spec sync):

- `docs/specs/sdlc-agents.md:67` (§11.1.1) — top-line statement: *"The browser-rendered prototype is the primary design surface. If Penpot is configured, an optional collaboration workspace is also created for human designers."* (This was previously "Falls back to browser-rendered prototypes if no design tool is configured" — the sync inverted it.)
- `docs/specs/sdlc-agents.md:221-227` (§11.1.2, **Phase C: Remove self-correction, browser-only pipeline**) commits to browser rendering as the verification path. Quote: *"The pipeline simplifies to: LLM → JSON → Browser render → DOM extraction → mechanical fixes → interactive preview → vision-assisted correction → user approval."*
- `docs/specs/sdlc-agents.md:245-249` (§11.1.4, **Design Tool Integration (Optional)**) locks in: *"Design tools are NOT in the verification path — the browser renderer is the source of truth for layout fidelity."* Penpot is the sole optional collaboration adapter; **Figma support was removed** in this sync (`sdlc-agents.md:249`: *"Figma support removed."*, reinforced by `appendices.md:250` and `governance-and-operations.md:137`).
- `docs/specs/dashboard.md:400` (Design Tools view) adds the strongest-worded version: *"The browser renderer is the source of truth for layout fidelity — not an optional tool."*

So the dashboard's browser-only Stage 4 is **the committed target**, not an accident. What's missing is not a bug fix but a shared-layer extraction: one pipeline that takes a `designTool: 'browser' | 'penpot'` parameter, with browser as the default. CLI users can opt into Penpot via `--tool=penpot`; the dashboard hardcodes `'browser'` until a future dashboard UI exposes the choice. (Figma is explicitly not a supported value — it was removed from the framework in the 2026-04-24 sync. The `DesignSurface` interface is still extensible, so a future Figma adapter could return, but that would be a new ADR, not a resurrection of existing plumbing.)

### Classification legend

| Label | Meaning | What's actually different | How to resolve |
|---|---|---|---|
| **A — Intentional channel/tool choice** | The *work itself* genuinely differs by design (e.g., Penpot script generation vs browser render). The current "two copies" state exists because the shared adapter/parameter hasn't been extracted yet. | The backend work | Extract a shared work function with a channel/tool parameter; both callers dispatch through it. No code is deleted. |
| **B — Real bug / `CLAUDE.md` violation** | Nothing should legitimately differ, but something does (e.g., free-text markdown instead of typed `UXResearchOutput`). No channel/tool justification exists. | Output shape / contract enforcement | Fix the dashboard to call the typed work function. No ADR needed. |
| **C — Legitimate input-collection difference, shared work missing** | Only the *input-gathering UI* is channel-specific (stdin wizard vs React form). The *work behind it* (writing files, computing defaults) is identical and duplicated. | Only the UI layer | Extract the work as a shared function; each channel keeps its own UI and maps its inputs to the shared function's signature. |
| **D — Minor cleanup** | Tiny signature or argument-shape inconsistencies. | Function signatures | Tighten the interface; no architectural change. |

### Where this leaves each category

- **A (Stages 4, 6-channel, 7):** Not bugs. Need a shared pipeline with a `designTool: 'browser' | 'penpot'` parameter (see `docs/feature-plans/unify-design-pipeline.md`). ADRs recording "browser-only is the default" and "Stage 7 deferred until shared layer lands" can follow the shared-layer implementation rather than precede it.
- **B (Stages 1, 2, 3, 6-mechanism, wrong-shape artifacts, `maxTokens` drift):** Real bugs. Fix independently of any ADR. These are the items that block Phase 4 / M-3.
- **C (Stage 0):** Extract `scaffoldProject` as a shared work function in `packages/agents-ux` or `packages/core`. CLI `initCommand` and dashboard `createProject` both call it. Channel-specific extras (Slack/Telegram on CLI; archetype/component-library on dashboard) stay as optional fields on the shared input object.
- **D (Stage 5):** Tighten `evaluateDesign`'s second-argument contract so both callers pass the same shape.

---

## Where the dashboard quietly writes the wrong shape

| Artifact | Shared contract | Dashboard on-disk shape | Evidence |
|---|---|---|---|
| Research output | `UXResearchOutput` (`briefId`, `moduleId`, `requirementIds`, `designConstraints`, `referencePatterns`, `accessibilityRequirements`, `dataModelDependencies`) — validated via `UXResearchOutputSchema` @ `packages/agents-ux/src/schemas.ts:11` | `{ "brief": "<markdown>" }` at `agentforge/designs/{pageId}/research.json` | `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts:611` |
| Planning output | `UXPlanningOutput` (`specRef`, `componentTree`, `tokenBindings`, `responsiveRules`, …) | `{ "spec": "<markdown>" }` at `agentforge/designs/{pageId}/planning.json` | `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts:612` |
| App-spec pages | CLI writes `status: 'approved'`, `viewports: [1440]` per `design-generate.ts:432-458` | Dashboard writes `status: 'draft'`, `designStatus: 'draft'` per `spec/approve/route.ts:66-68` | Different defaults for the same artifact |

The research/planning JSON wrappers on disk are **vestigial** — nothing reads them back. The dashboard passes the raw markdown string in-memory to the next stage (`researchBrief: researchResult` @ `design/route.ts:507`). The files exist only for display/debug. This is the worst of both worlds: disk artifacts that match no consumer, and in-memory strings that match no contract.

---

## Capabilities the dashboard bypasses by not calling shared work functions

When `callPipelineStage` is used instead of `uxResearchWork` / `uxPlanningWork`:

1. **No Zod validation** — `UXResearchOutputSchema`, `UXPlanningOutputSchema`, and the token-binding correction loop in planning are never invoked.
2. **No agent contracts** — `UX_RESEARCH_CONTRACT` and `UX_PLANNING_CONTRACT` (budgets, token limits, model selection, `on_complete` event, governance policy) are silently ignored. Dashboard hard-codes `maxTokens: 8192` at `pipeline-helpers.ts:283`, disconnected from the contract's per-task budget (`UX_RESEARCH_CONTRACT.budget.max_tokens_per_task = 40000` @ `ux-research.ts:74`). The dashboard's per-call cap is never reconciled against the contract — it's just a hard-coded number.
3. **No spec context reads** — `readSpecs()`, disk token enforcement, and learnings injection (`ux-research.ts:130-154`) do not happen. The dashboard feeds a minimal `{ description, prdContent, designTokens, brandSpec }` context and nothing else.
4. **No prompt trace** — `recordPromptTrace` / `recordPromptTraceResponse` (`ux-research.ts:175-201`) are skipped. The dashboard has its own `emitLLMCallEvent` / `run-manager.ts` telemetry — similar intent, different data shape, not interchangeable with the CLI's `*-prompt.md` traces.
5. **No governance** — neither path calls `runAgent()` (CLI calls `uxResearchWork` directly too, so governance is bypassed on both — but the CLI at least has the structured output layer).
6. **No event emission** — `DesignBriefCompleted` is never emitted. The documented Stage 2 → Stage 3 event handoff (`design-pipeline-dataflow.md:356-371`) does not exist in either path at runtime; in the CLI it's a direct function call, and in the dashboard it's a string concatenation.

When `callClaudeDesignAPI` is used instead of `penpotDesignWork` (Stage 4):

7. **No Penpot script generation, no browser-correction loop, no screenshot export, no fix-script pipeline.** All the Phase A/B/C machinery in `docs/architecture/design-pipeline-dataflow.md:462-541` is only in the CLI path.
8. **The dashboard's "design" stage is essentially `LLM → submit_design tool-use → write JSON to disk`.** That's a valid pipeline, but it's a different pipeline from the documented one.

---

## Where the dashboard DOES share code (credit)

These are the shared surfaces that work correctly and should be preserved:

- `buildDesignSpecSystemPrompt` @ `pipeline-helpers.ts:93` — single source of truth for the design LLM system prompt
- `buildComponentCatalogPrompt` — imported from `@agentforge/agents-ux` @ `pipeline-helpers.ts:1`
- `SUBMIT_DESIGN_TOOL` — imported from `@agentforge/designspec-renderer` for the tool-use call
- `validateDesignSpec` — used in the quick-generate path at `design/route.ts:238-249`
- `evaluateDesign` — shared, used by the vision audit route @ `api/design/audit/vision/route.ts:67`
- `createBrowserCorrectionAdapter` / `runBrowserCorrectionPipeline` — **referenced** by `correct/route.ts:135-138` but not fully wired (explicit TODO)

These prove the dashboard *can* depend on shared code; the gap is specifically around the work functions (`ux*Work`) that represent the stage contracts.

---

## Root cause (hypothesis)

Three factors, in descending likelihood:

1. **`callPipelineStage` was easier to write than wiring `uxResearchWork` into an HTTP handler.** `uxResearchWork` requires an `AgentContext` with `projectRoot`, `fs`, `telemetry`, `resolvedModel`, etc. The dashboard route has different plumbing (`run-manager.ts`, SSE events, Next.js request lifecycle). Rather than adapt one to the other, a parallel shortcut was added.
2. **No architectural boundary enforcement.** Nothing prevents a dashboard route from importing `@anthropic-ai/sdk` directly or calling `provider.complete`. There is no lint rule, no type constraint, no test that says "dashboard routes must delegate agent work to `packages/agents-ux`".
3. **The dashboard route needed richer progress telemetry** than the CLI agents emit (stage events, log events, LLM call events). Rather than extend the shared agent telemetry, a parallel event system was built around the parallel pipeline.

Factor #2 is the one that allowed this to happen silently and that will allow it to recur unless addressed.

---

## Impact

- **Data quality.** Research markdown blobs are fed to planning as opaque strings; planning markdown is fed to design as opaque strings. The design stage must re-parse prose to know which PRD requirement is being addressed, which accessibility rules apply, which data models are relevant. Every structural signal is lost.
- **Testability.** The dashboard path cannot be unit-tested against `UXResearchOutputSchema`. Fixtures produced by the dashboard (e.g., `fixtures/claim-filling-sample/agentforge/designs/*/research.json`) cannot be consumed by CLI code without transformation.
- **Drift.** Any change to `UXResearchOutput`, `UXPlanningOutput`, or agent prompts in `packages/agents-ux/` only affects the CLI. The dashboard silently continues with its old shape. The two paths will inevitably produce different designs from the same inputs.
- **Docs-code mismatch.** `docs/architecture/design-pipeline-dataflow.md` describes Stage 2 → Stage 3 with a `DesignBriefCompleted` event carrying `UXResearchOutput`. Neither path actually emits that event. In the dashboard, Stage 2 → Stage 3 is a string pass. The documented architecture is aspirational, not actual.
- **Implementation agent (Stage 7) is entirely absent from the dashboard.** Users who drive the pipeline from the dashboard cannot reach the implementation stage; they get as far as DesignSpec JSON and stop.
- **Violation of `CLAUDE.md` non-negotiable rules.** Specifically: "Typed Contracts for Cross-Agent Artifacts", "Every LLM call must use typed structured output via Zod schemas", "No free-text coordination between agents."

---

## File-level evidence

### Dashboard wrong-shape writes

```611:612:packages/dashboard/src/app/api/pages/[pageId]/design/route.ts
    writeFileSync(join(artifactsDir, 'research.json'), JSON.stringify({ brief: researchResult }, null, 2));
    writeFileSync(join(artifactsDir, 'planning.json'), JSON.stringify({ spec: planningResult }, null, 2));
```

### Dashboard free-text handoff (research → planning)

```505:510:packages/dashboard/src/app/api/pages/[pageId]/design/route.ts
    const planningResponse = await callPipelineStage(provider, 'planning', {
      description,
      researchBrief: researchResult,
      designTokens: designTokens ? JSON.stringify(designTokens) : null,
    }, page.name, model);
    const planningResult = planningResponse.text;
```

### Dashboard free-text handoff (research + planning → design)

```559:567:packages/dashboard/src/app/api/pages/[pageId]/design/route.ts
    const enrichedDescription = [
      description,
      '',
      '## Research Brief',
      researchResult,
      '',
      '## Planning Specification',
      planningResult,
    ].join('\n');
```

### Canonical contracts that the dashboard ignores

```48:57:packages/agents-ux/src/ux-research/ux-research.ts
/** Output produced by the UX dashboard research agent. */
export interface UXResearchOutput {
  readonly briefId: string;
  readonly moduleId: string;
  readonly requirementIds: readonly string[];
  readonly designConstraints: readonly string[];
  readonly referencePatterns: readonly string[];
  readonly accessibilityRequirements: readonly string[];
  readonly dataModelDependencies: readonly string[];
}
```

```64:77:packages/agents-ux/src/ux-research/ux-research.ts
export const UX_RESEARCH_CONTRACT: AgentContract = {
  role: 'ux_research',
  description: 'Analyzes PRD requirements for dashboard modules and produces design briefs',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 40000 },
  tools: [],
  permissions: ['read_spec', 'read_design', 'read_design_system'],
  denied: ['write_code', 'write_design', 'create_branch'],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 },
  on_complete: 'DesignBriefCompleted',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};
```

---

## Recommended resolution direction

**One pipeline, parameterized by `designTool`.** Not "pick one and delete the other." The CLI and dashboard call the same shared Layer B (`runDesignPipeline`), which dispatches the design stage to `browserDesignWork` or `penpotDesignWork` based on a `designTool: 'browser' | 'penpot'` parameter. Dashboard hardcodes `'browser'` for now; CLI accepts both values via `--tool=browser|penpot`; both default to `'browser'` (matching the `sdlc-agents.md:221-227` Phase C target). Figma is not a supported value — it was removed from the framework in the 2026-04-24 spec sync (`sdlc-agents.md:249`).

Direction of dependency stays one-way: transport/telemetry (CLI args, HTTP routes, SSE) → pipeline orchestrator (Layer B) → work functions (Layer A). Work functions never import transport code.

Detailed plan: see `docs/feature-plans/unify-design-pipeline.md`.

Category-specific actions:

- **Category A (Stages 4, 6-channel, 7):** extract the shared parameterized pipeline. ADRs recording "browser default" and "Stage 7 deferral" follow the landing, not precede it.
- **Category B (Stages 1, 2, 3, 6-mechanism, wrong-shape artifacts, `maxTokens` drift):** fix the dashboard to call the typed work functions (`uxResearchWork`, `uxPlanningWork`, a shared `generateAppSpec`). No ADR needed — these are `CLAUDE.md` violations.
- **Category C (Stage 0):** extract `scaffoldProject` as a shared work function. Each channel keeps its own input-collection UI.
- **Category D (Stage 5):** tighten `evaluateDesign`'s second-argument contract.

Preventive measures that should accompany the fix:

1. **Lint rule or import boundary test** so dashboard API routes cannot import `@anthropic-ai/sdk` or call `provider.complete` directly. All LLM calls must go through a shared work function or the typed LLM wrapper.
2. **Contract parity test** — runs identical inputs through both the CLI and the dashboard entry points and asserts the on-disk artifacts are byte-identical (modulo telemetry envelopes). **Scope:** parity is asserted for `(CLI, designTool='browser')` vs `(Dashboard, designTool='browser')`. `(CLI, designTool='penpot')` is a separate CLI-only matrix — the dashboard is not exercised against it.
3. **ADRs to follow (not gate) the shared-layer landing:**
   - Browser as the default `designTool`; Penpot as a CLI-only flag; dashboard hardcoded to `'browser'` until further notice.
   - Stage 7 (implementation) deferred in the dashboard until Stages 2–6 unify.
   - Feedback-loop strategy: structured DesignSpec patches for the browser channel; Penpot collaboration session for `--tool=penpot`.
4. **Update `docs/architecture/design-pipeline-dataflow.md`** to describe the three-layer structure (transport → Layer B → Layer A) with a "Channels and callers" section listing who calls what and with which `designTool` values.

---

## Cross-references

- `CLAUDE.md` §Typed Contracts for Cross-Agent Artifacts — the rule this violates
- `docs/vision.md` Layer 1 (orchestration), Layer 2 (typed channels), Layer 3 (agent taxonomy) — the target architecture
- `docs/architecture/design-pipeline-dataflow.md` — describes the CLI path only
- `docs/issues/dashboard-pipeline-gap-analysis.md` — related but different concern (renderer convention mismatch, not agent contract mismatch)
- `docs/issues/design-pipeline-audit.md` — dead-code audit; different problem
- `ADR-043` — orchestration authority resolved; related but doesn't address this gap
