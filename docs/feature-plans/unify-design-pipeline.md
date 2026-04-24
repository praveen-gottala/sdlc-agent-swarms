# Unify the Design Pipeline — CLI and Dashboard on One Implementation

**Created:** 2026-04-24
**Last updated:** 2026-04-24 (rev 2) — reconciled with the spec sync (Figma removed framework-wide, browser-first framing promoted to top-line language, agent taxonomy restructured into spine + specialists). Changes to this plan: (a) `DesignToolSchema` is now `z.enum(['browser', 'penpot'])`; `figmaDesignWork` and the `(CLI, designTool='figma')` test-matrix row are dropped; (b) `sdlc-agents.md` line citations updated (Phase C: `:221-227`; §11.1.4: `:245-249`); (c) added a framing note that "Stages 0–7" in this plan are the *internal stages of the Design specialist* (invoked by the Architect spine stage per `sdlc-agents.md:§10` + `vision.md` Layer 3), not top-level agents.
**Last updated (rev 1):** 2026-04-24 — scoped to browser-only by default. The shared pipeline takes a `designTool` parameter. Dashboard hardcodes `'browser'`; CLI accepts all values via `--tool`. Added a Phase 0.5 for Stage 0 shared scaffolding (previously absent from the plan).
**Status:** Proposed — awaiting approval
**Depends on:** `docs/issues/cli-dashboard-pipeline-divergence.md`
**Related:** `CLAUDE.md` (Typed Contracts rule, Spec Sync on Feature Completion); `docs/vision.md` Layers 1, 2, 3, 7, 11, 14; `docs/future-roadmap.md` Phases 0.2 and 4; `docs/adrs/ADR-043-typescript-only-orchestration.md` Phase M-3; `docs/architecture/design-pipeline-dataflow.md`; `docs/specs/sdlc-agents.md` §10 (spine + specialists) + §11.1.1–§11.1.4; `docs/specs/dashboard.md` §4.10.4 (Design Tools view, Penpot + Browser Renderer cards); `docs/reference/pipeline-improvements.md` (Plan 2, Penpot runner unification — complementary axis).

---

## Relationship to the roadmap (why this is on the critical path, not cleanup)

Reading `docs/vision.md` and `docs/future-roadmap.md` makes clear that this work is **not a standalone cleanup project** — it is the design-pipeline-specific portion of two already-committed roadmap items, and it is a prerequisite for a third:

| Roadmap item | What it requires | How this plan contributes |
|---|---|---|
| **Roadmap Phase 0.2** — "Typed artifact schemas (Zod schemas for all cross-boundary artifacts)." | Every inter-agent artifact has a Zod schema in `packages/core/src/types/` and every transport validates against it. | Phase 0 of this plan is literally the design-pipeline share of roadmap 0.2. Without this, the dashboard's free-text `{ brief: <markdown> }` artifacts silently violate it. |
| **Roadmap Phase 4** — "Design branch cross-screen coherence." Target: "Per-screen pipeline refactored as a LangGraph subgraph; batch coordinator with topological ordering and in-the-loop coherence" (`docs/future-roadmap.md` §Phase 4; `docs/vision.md` Layer 7). | A **single** per-screen pipeline definition that can be wrapped in a LangGraph `StateGraph`. Two divergent implementations cannot be wrapped — one of them has to be the definition and the other has to be deleted first. | Phase 1–3 of this plan produce exactly that single per-screen definition. Phase 4 of the roadmap then wraps it, not rewrites it. |
| **ADR-043 Phase M-3** — "Port design phase graph to `@langchain/langgraph`." Target: "7 nodes, 2 HITL gates, conditional wireframe loop… tests conditional edge routing and the most complex HITL flow." | TypeScript agent work functions with typed inputs/outputs and a clean surface to wrap as LangGraph nodes. | Phase 1 of this plan shapes the orchestrator as pure node functions with typed Zod state — directly consumable as LangGraph node functions. |

**In plain terms:** the roadmap assumes one design pipeline exists. There are two. The roadmap's next two design-related phases cannot start until that assumption is restored.

ADR-043 §"Feature freeze policy" warns: *"once a phase graph enters M-2/M-3 validation, no new features land on the imperative version of that phase — bug fixes only. This prevents the migration from becoming permanent."* If we enter M-3 with two imperative versions, the freeze freezes both, and the LangGraph port has to reconcile them mid-port — which is the hardest possible place to do it.

---

## Scope — browser-only by default, Penpot via parameter

### Where this plan sits in the agent taxonomy

Per the revised taxonomy in `docs/specs/sdlc-agents.md:§10` (and `vision.md` Layer 3), the system is a **four-stage spine** (Clarifier → Architect → Implementer → Reviewer) plus **specialist tools** invoked by spine stages. The **Design pipeline is a specialist** invoked by the Architect stage (and later re-invoked by the Implementer when code-generation needs a design refresh). What this plan calls "Stages 0–7" are the *internal stages of the Design specialist*, not top-level spine stages. Nothing in this plan changes the spine; the unification work is entirely inside the Design specialist's boundary, with the CLI and dashboard as two callers of that specialist.

### The design-tool parameter

Per `docs/specs/sdlc-agents.md:67` ("The browser-rendered prototype is the primary design surface"), `:221-227` (Phase C: "LLM → JSON → Browser render → DOM extraction → mechanical fixes → interactive preview → vision-assisted correction → user approval"), `:245-249` ("Design tools are NOT in the verification path — the browser renderer is the source of truth for layout fidelity"), and `docs/specs/dashboard.md:400` ("The browser renderer is the source of truth for layout fidelity — not an optional tool"), browser rendering is the committed verification target. Penpot is the sole optional collaboration adapter. **Figma support was removed from the framework in the 2026-04-24 spec sync** (`sdlc-agents.md:249`, `appendices.md:250`, `governance-and-operations.md:137`) and is not a supported `designTool` value.

This plan therefore produces **one shared pipeline parameterized by `designTool`**, not two code paths unified into one. The shape:

- `runDesignPipeline({ …, designTool: 'browser' | 'penpot' })` — single entry point.
- **Dashboard** calls with `designTool: 'browser'` hardcoded (no UI for tool selection yet; when added later, it's a UI change, not a pipeline change).
- **CLI** exposes `--tool=browser|penpot` and defaults to `'browser'` (matching the Phase C intent).
- **Layer A work functions remain first-class:** `browserDesignWork` and `penpotDesignWork` are siblings. The Layer B design node dispatches based on the parameter; nothing is parked, nothing is deprecated.
- **Output shape is canonical.** `DesignPhaseState.design` is `DesignSpec v2` plus an optional `designToolMetadata: { tool, nodeIds?, projectId?, screenshotPaths? }`. Downstream stages (5, 6, 7) never branch on `designTool` — they consume the canonical shape.
- **Extensibility:** the `DesignToolSchema` enum is the single place to add a future adapter (e.g., if Figma or Framer returns via a new ADR). A new tool requires (a) extending the enum, (b) adding a new Layer A work function, (c) adding a branch in `designNode`. No other code changes.

**Test matrix consequence (noted explicitly so it doesn't surprise anyone):**

| Matrix cell | Who tests it | Why |
|---|---|---|
| `(CLI, designTool='browser')` | CLI + parity test | Primary path. Parity asserted against the dashboard. |
| `(Dashboard, designTool='browser')` | Dashboard + parity test | Primary path. Parity asserted against the CLI. |
| `(CLI, designTool='penpot')` | CLI only | Penpot still fully supported on CLI. Separate test matrix the CLI owns alone. |
| `(Dashboard, designTool='penpot')` | **Not tested** | Dashboard hardcodes `'browser'`. When a future UI exposes the choice, this cell activates. |

**Feedback-loop consequence (flagged up-front so it's not a hidden surprise):** the CLI's current feedback loop (`runDesignFeedbackLoop`) requires a Penpot collaboration session. Once the CLI defaults to `designTool='browser'`, it needs a **browser-based feedback loop** too — structurally equivalent to the dashboard's chat route but running locally. This is additional scope inside Phase 2.5 (below), not plumbing.

**ADR consequence (deferred, not skipped):** the following ADRs follow the shared-layer landing rather than precede it — they document decisions that are already implicit in this plan:

- "Browser is the default `designTool`. Penpot is a CLI-only flag. Dashboard hardcodes `'browser'` until further notice. Figma is not a supported value in this iteration (per the 2026-04-24 spec sync)."
- "Stage 7 (`uxImplementationWork`) is deferred in the dashboard until Stages 2–6 run on the shared Layer B."
- "Feedback-loop strategy: structured DesignSpec patches for the browser channel; Penpot collaboration session retained for `--tool=penpot`."

Draft them after Phase 3 completes and the shape is proven in practice.

---

## Goal

One implementation of every design-pipeline stage. The CLI and the dashboard must produce **byte-identical artifacts** for the same input (modulo telemetry envelopes). Any new stage or prompt change must be made in exactly one place. The resulting shape must be **directly wrappable as a LangGraph `StateGraph`** in ADR-043 Phase M-3 without substantive rewrite.

## Non-goals

- Changing the pipeline's *semantics*. This is a consolidation, not a redesign. Stage boundaries, prompts, and output shapes stay (mostly) as the CLI already defines them.
- Rewriting the dashboard UI. The HTTP API surface and SSE event shapes that the dashboard UI consumes stay stable.
- Executing the LangGraph migration itself. That is ADR-043 Phase M-3 work. This plan explicitly **shapes the orchestrator for that port** (typed state, pure node functions, injected telemetry) but does not perform the wrap. The wrap is mechanical once this plan is done.
- Unifying design-tool backend adapters across tools. That is a **different** unification axis tracked in `docs/reference/pipeline-improvements.md` Plan 2 (originally scoped as "Figma vs Penpot"; post-sync, only Penpot remains, so that plan effectively reduces to "Penpot adapter cleanup"). It is complementary (adapter-pattern refactor of tool access); this plan is orthogonal (collapse two execution paths onto one). The two plans do not conflict, but should not be intermixed.

---

## Challenge to the proposed "pick whichever is best, delete the other" strategy

The user's instinct is correct that we need a single implementation. But **"pick the better one per stage and delete the other"** is the wrong framing, for three reasons:

### 1. There is no "best" at the stage level — only at the *layer* level

For every stage, the CLI and dashboard do different jobs:

- The CLI is the **agent work layer** (takes typed input, returns typed output, validates against Zod).
- The dashboard is the **transport/telemetry layer** (HTTP request lifecycle, SSE progress events, run-manager state, Next.js request handling).

Deleting the dashboard's work in Stage 2 would also delete its progress events, log emission, run-manager integration — which the UI needs and the CLI doesn't have. Deleting the CLI's work in Stage 2 would delete the typed contract, the schema validation, the spec reads — which the framework's own rules mandate.

**The correct move is not "pick one and delete the other." It's "separate the two layers cleanly and make the transport layer depend on the work layer, not duplicate it."**

### 2. The CLI wins at every *work-function* decision, by a wide margin

If we do evaluate at the work-function level specifically (ignoring telemetry), the CLI is the clear canonical source for every stage where it and the dashboard disagree:

| Stage | CLI | Dashboard | Canonical |
|---|---|---|---|
| Research | Typed `UXResearchOutput`, Zod schema, spec reads, prompt trace, learnings injection | Free-text markdown, no schema, minimal context | **CLI** |
| Planning | Typed `UXPlanningOutput`, token validation loop, correction retries | Free-text markdown, no schema | **CLI** |
| Design | `penpotDesignWork` with Phase A/B/C, browser correction, DesignSpec v2 renderer integration | `callClaudeDesignAPI` single-shot tool-use | **CLI** for orchestration; `callClaudeDesignAPI` is a useful internal helper that the CLI *could* reuse |
| Evaluator | `evaluateDesign` (shared) with planning JSON as context | `evaluateDesign` with DesignSpec JSON as context | Neither — the second argument contract is underspecified; both paths should feed structured data, and this should be tightened |
| Feedback | `runDesignFeedbackLoop` with Penpot collaboration session, real multi-turn | `runChatPipelineAsync` re-runs 3 LLM stages per message — wasteful and loses context | **CLI** |
| Implementation | `uxImplementationWork` — exists | *absent* | **CLI by default** |

So the user's gut read is half right: the CLI is the source of truth for work. But the *strategy* "delete the worse one" is wrong — because what the dashboard does that the CLI doesn't (telemetry, HTTP, SSE) is not replaced by deleting code; it needs to survive the consolidation.

### 3. The dashboard has genuine innovations that should be *lifted up*, not deleted

These should be extracted from the dashboard route into a reusable layer and then both callers (CLI and dashboard) should use them:

- `buildDesignSpecSystemPrompt` @ `pipeline-helpers.ts:93` — already shared implicitly via import; good model for what we should do more of
- `callClaudeDesignAPI` — the empty-node retry logic is genuinely useful and could replace the CLI's inline design call
- `run-manager.ts` event model (stage events, log events, LLM call events) — this is a *better* telemetry model than the CLI's `*-prompt.md` traces for interactive UX, and should become the shared telemetry layer
- Tool-use `SUBMIT_DESIGN_TOOL` with schema validation — already shared via `@agentforge/designspec-renderer`

---

## Recommended strategy: three layers, one-way dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer C — Transport / Telemetry                                 │
│  ─────────────────────────────────────────                       │
│  • CLI entry: packages/cli/src/commands/design-page.ts           │
│  • HTTP entry: packages/dashboard/src/app/api/pages/[id]/design  │
│  Responsibilities:                                               │
│    - Parse inputs (argv / HTTP body)                             │
│    - Build AgentContext (projectRoot, fs, telemetry sink)        │
│    - Stream telemetry (stdout / SSE) to the caller               │
│    - Format outputs for the channel (text / JSON response)       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ calls (never bypasses)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer B — Pipeline Orchestration (LangGraph-subgraph-ready)     │
│  ─────────────────────────────────────────                       │
│  • packages/agents-ux/src/design-pipeline.ts (new)              │
│  Responsibilities:                                               │
│    - Each stage is a pure node function: (state) => state'       │
│    - State typed by Zod (DesignPhaseState in core/types/)        │
│    - Run stage 2 → 3 → 4 → 5 → 6 → 7 sequentially today;         │
│      wrapped as a LangGraph StateGraph in ADR-043 Phase M-3      │
│    - Cache artifacts to .agentforge/previews/{moduleId}/         │
│    - Load cached artifacts for --stage / resume                  │
│    - Emit structured OTel-shaped spans to the telemetry sink     │
│    - Enforce the `UXResearchOutput` → `UXPlanningInput` mapping  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ calls (never bypasses)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer A — Agent Work Functions                                  │
│  ─────────────────────────────────────────                       │
│  • uxResearchWork, uxPlanningWork, penpotDesignWork,             │
│    evaluateDesign, uxImplementationWork                          │
│  Responsibilities:                                               │
│    - Pure work: input → LLM → typed output                       │
│    - Zod validation on output                                    │
│    - No knowledge of CLI vs HTTP; no stdout; no SSE              │
│    - Emit progress via injected telemetry callback, not globals  │
└─────────────────────────────────────────────────────────────────┘
```

Key rules:
- **Layer C never calls Layer A directly.** It always goes through Layer B.
- **Layer A never imports from Layer B or Layer C.** Work functions stay pure.
- **Telemetry flows via an injected callback** (part of `AgentContext`), not via global emitters. CLI plugs in a stdout formatter; dashboard plugs in an SSE/run-manager emitter.
- **Layer B must be LangGraph-port-ready.** Each stage is authored as a pure `async (state: DesignPhaseState) => Partial<DesignPhaseState>` node function, with the sequential orchestrator being the thinnest possible wrapper that calls them in order. In ADR-043 Phase M-3, the wrapper is replaced by `StateGraph.addNode(...).addEdge(...)` — the node functions themselves are reused unchanged.

Today, Layer B doesn't exist as a discrete thing — `packages/cli/src/commands/design-page.ts` and `packages/agents-ux/src/scripts/run-module-pipeline.ts` both contain fragments of it. Extracting it — in a shape that becomes a LangGraph subgraph with a mechanical wrap, not a rewrite — is the core of this plan.

---

## Phased execution plan

### Phase 0 — Contract lockdown (prerequisite)

**Goal:** Make the target shape inviolable before anyone migrates to it.

0.1. Add Zod schemas to `packages/core/src/types/` for any pipeline artifact that isn't already schema'd: `UXResearchOutputSchema` (move from agents-ux), `UXPlanningOutputSchema`, `PenpotDesignOutputSchema` (or `DesignSpecV2Schema` if that's canonical), `UXImplementationOutputSchema`.

0.2. Add a **contract parity test** (`packages/cli/__tests__/pipeline-parity.test.ts`) that takes a fixture project, runs the CLI pipeline and the dashboard pipeline against identical inputs with `designTool: 'browser'`, and asserts the on-disk artifacts are byte-identical except for a known-allowed telemetry diff. **Scope: browser-channel only.** `(CLI, designTool='penpot')` is a separate CLI-only test matrix — the dashboard is not exercised against it (it hardcodes `'browser'`). **The test will fail initially** — that's the point. It becomes green only when Phase 3 is complete.

0.3. Add an import-boundary lint rule (`eslint-plugin-boundaries` or a custom rule) that fails the build if:
- `packages/dashboard/src/app/api/**/*.ts` imports `@anthropic-ai/sdk`
- `packages/dashboard/src/app/api/**/*.ts` calls `provider.complete` on a raw provider (must go through a Layer A/B function)
- Any file in `packages/agents-ux/src/ux-*/` imports from `packages/dashboard` or `packages/cli`

**Exit criteria:** Contracts locked in `core/types`. Parity test red. Lint rule shipped and failing on current code (expected — we haven't fixed it yet).

Estimated effort: 1 day.

### Phase 0.5 — Extract Stage 0 scaffolding as a shared work function (Category C)

**Goal:** Eliminate the duplicate scaffolding logic between CLI `initCommand` and dashboard `createProject`. Each channel keeps its own input-collection UI, but both call one shared function for the actual file writes.

This phase corresponds to Category C in `docs/issues/cli-dashboard-pipeline-divergence.md` (Stage 0 — Init / Scaffold). It was absent from the original plan because the original plan treated the divergence issue as a Stages 2–7 problem. Stage 0 has the same shape (duplicated work, channel-specific UI), so it is folded in here.

0.5.1. Define `ScaffoldProjectInput` (Zod schema in `packages/core/src/types/scaffold.ts`) as the normalized input both channels produce:

```typescript
export const ScaffoldProjectInputSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  prdContent: z.string().optional(),
  platforms: z.array(z.enum(['web', 'ios', 'android'])).default(['web']),
  stack: z.object({
    frontend: z.string().default('react'),
    backend: z.string().default('node'),
    database: z.string().default('postgresql'),
    styling: z.string().default('tailwind'),
  }).default({}),
  budget: z.object({
    per_task_max_usd: z.number().default(2.0),
    per_phase_max_usd: z.number().default(25.0),
    monthly_max_usd: z.number().default(200.0),
  }).default({}),
  designArchetype: z.enum(['professional', 'warm', 'bold']).optional(),
  designOption: DesignOptionSchema.optional(),         // dashboard-supplied, wins over archetype
  componentLibrary: z.enum(['shadcn', 'material', 'custom']).default('shadcn'),
  targetAudience: z.string().optional(),
  channels: z.object({                                   // CLI-supplied, dashboard leaves empty
    slackChannel: z.string().optional(),
    telegramEnabled: z.boolean().default(false),
  }).default({}),
});
export type ScaffoldProjectInput = z.infer<typeof ScaffoldProjectInputSchema>;
```

0.5.2. Extract `scaffoldProject(input: ScaffoldProjectInput, projectDir: string, fs: FileSystem): Promise<ScaffoldResult>` into `packages/agents-ux/src/scaffolding/scaffold-project.ts` (or `packages/core/` if preferred for zero-dep reasons). It writes: `agentforge.yaml`, `agentforge/spec/pages.yaml`, `project.yaml`, `design-tokens.yaml`, `brand.yaml`, component-catalog entries, `docs/` skeleton.

Byte-identical output is the test criterion: for equivalent inputs, CLI-initiated and dashboard-initiated scaffolds must produce the same files on disk.

0.5.3. Rewrite `packages/cli/src/commands/init.ts`:
- `runWizard` continues to prompt over stdin for `name`, `description`, `platforms`, Slack/Telegram.
- Its output is mapped to a `ScaffoldProjectInput` (channel-specific fields like Slack populate `channels`; `designArchetype` defaults to whatever archetype the wizard picks).
- The file-writing body of `initCommand` becomes `await scaffoldProject(input, rootDir, fs)`. All existing inline `writeFile` calls go away.

0.5.4. Rewrite `packages/dashboard/src/app/api/_lib/project-creation.ts`:
- `OnboardingWizard` continues to collect name/description/PRD/archetype/component-library/color-scheme via React form.
- `createProject(body)` maps the body to a `ScaffoldProjectInput` (dashboard fields populate `designOption`, `componentLibrary`; `channels` stays empty).
- The file-writing body (`writeFileSync` block from line 150 onwards) becomes `await scaffoldProject(input, projectDir, realFs)`.

0.5.5. Add a **scaffold parity test** (`packages/cli/__tests__/scaffold-parity.test.ts`): given the same `ScaffoldProjectInput`, `scaffoldProject` produces byte-identical output regardless of whether it was triggered from a mocked CLI wizard flow or a mocked dashboard HTTP body.

**Exit criteria:** `scaffoldProject` exists in `packages/agents-ux` (or `core`). Both callers use it. Scaffold parity test green. `createProject` and `initCommand` together shrink by ~150 lines of duplicated `writeFileSync`/YAML-building code.

Estimated effort: 1–1.5 days.

### Phase 1 — Extract Layer B (pipeline orchestrator)

**Goal:** A single callable pipeline orchestrator that both CLI and dashboard consume.

1.1. Define `DesignPhaseState` (Zod schema in `packages/core/src/types/design-phase-state.ts`) — the typed state that flows through every stage. This is the same shape that will become the LangGraph state channels in ADR-043 Phase M-3:

```typescript
// Figma was removed framework-wide in the 2026-04-24 spec sync (sdlc-agents.md:249).
// To re-introduce it later, extend this enum, add a figmaDesignWork work function,
// and add a branch in designNode — no other code changes.
export const DesignToolSchema = z.enum(['browser', 'penpot']);

// Canonical design output: DesignSpec v2 plus optional tool-specific metadata.
// Downstream stages (5/6/7) consume this shape without branching on designTool.
export const DesignOutputSchema = z.object({
  spec: DesignSpecV2Schema,
  designToolMetadata: z.object({
    tool: DesignToolSchema,
    nodeIds: z.record(z.string()).optional(),      // Penpot node IDs keyed by DesignSpec node id
    projectId: z.string().optional(),               // Penpot file/project id
    screenshotPaths: z.array(z.string()).optional(),
  }).optional(),
});

export const DesignPhaseStateSchema = z.object({
  moduleId: z.string(),
  taskId: z.string(),
  projectRoot: z.string(),
  designTool: DesignToolSchema.default('browser'),    // controls dispatch in designNode; browser is default
  research: UXResearchOutputSchema.optional(),
  planning: UXPlanningOutputSchema.optional(),
  design: DesignOutputSchema.optional(),
  evaluation: DesignEvaluationSchema.optional(),
  implementation: UXImplementationOutputSchema.optional(),
  errors: z.array(z.string()),  // concat reducer (LangGraph-style)
});
export type DesignPhaseState = z.infer<typeof DesignPhaseStateSchema>;
```

1.2. Each stage is a pure node function over that state. The **design node** dispatches to one of two work functions based on `state.designTool`; the other stages are tool-agnostic:

```typescript
type StageNode = (state: DesignPhaseState, ctx: AgentContext) => Promise<Partial<DesignPhaseState>>;

// Tool-agnostic stages — identical regardless of designTool.
export const researchNode: StageNode = async (state, ctx) => ({ research: await uxResearchWork(...) });
export const planningNode: StageNode = async (state, ctx) => ({ planning: await uxPlanningWork(...) });

// Design stage — dispatches on designTool. Browser is the default per sdlc-agents.md:221-227.
// Both work functions return DesignOutput (DesignSpec v2 + optional tool metadata),
// so stages 5/6/7 never branch on tool.
export const designNode: StageNode = async (state, ctx) => {
  const tool = state.designTool ?? 'browser';
  const output = tool === 'penpot'
    ? await penpotDesignWork(toPenpotInput(state), ctx)
    : await browserDesignWork(toBrowserInput(state), ctx);
  return { design: output };
};

export const evaluatorNode: StageNode = async (state, ctx) => ({ evaluation: await evaluateDesign(state.design.spec, ...) });
export const feedbackNode: StageNode = async (state, ctx) => ({ /* structured spec patch */ });
export const implementationNode: StageNode = async (state, ctx) => ({ implementation: await uxImplementationWork(...) });
```

These signatures map **directly** to LangGraph's `addNode(name, fn)` API. When Phase M-3 runs, the migration is `new StateGraph(DesignPhaseStateSchema).addNode('research', researchNode).addEdge(...)` — no node-level rewrite. The `designTool` parameter becomes a state channel that LangGraph routes on, not a branching hack.

**`browserDesignWork` is a new work function** — it replaces the dashboard's ad-hoc `callClaudeDesignAPI` by wrapping it into a proper Layer A work function with typed input/output, schema validation, and the existing `SUBMIT_DESIGN_TOOL` tool-use logic. `penpotDesignWork` stays where it is; only its output is adapted to the canonical `DesignOutput` shape.

1.3. Create `packages/agents-ux/src/design-pipeline.ts` with a single entry point that is, today, a sequential wrapper over the nodes. Tomorrow (Phase M-3) it becomes the compiled LangGraph graph:

```typescript
export interface PipelineInput {
  moduleId: string;
  taskId: string;
  projectRoot: string;
  stage?: 'research' | 'planning' | 'design' | 'evaluator' | 'feedback' | 'implementation';
  resume?: boolean;
  prdRequirements?: string[];
  pageContext?: PageContext;
  telemetry?: PipelineTelemetrySink;
  // …
}

export async function runDesignPipeline(input: PipelineInput): Promise<Result<DesignPhaseState>>;
```

1.4. Internally, this function replicates what `design-page.ts` does today: Stage 2 → 3 → 4 → 5 → 6 → 7, with caching to `.agentforge/previews/{moduleId}/`, resume from cache, `--fresh` to bypass. **But it dispatches to `researchNode` / `planningNode` / etc. — never inlines them.** The wrapper is ≤ 100 lines; each node is its own testable unit.

1.5. Define `PipelineTelemetrySink` in an **OpenTelemetry-compatible shape** (vision Layer 11 locks OTel + Langfuse as the tracing target). The sink is not a custom event protocol — it is a thin adapter over the OTel `Tracer` / `Span` API so that when Phase 7 of the roadmap lands OTel + Langfuse, every current consumer becomes a valid OTel consumer:

```typescript
// Span-shaped telemetry, compatible with @opentelemetry/api Span.
export interface PipelineTelemetrySink {
  // Start a span for a stage; returns a handle callers must end() on completion/failure.
  startStage(stage: string, attrs: StageAttrs): StageSpan;
  // Record an LLM call as a child span under the current stage span.
  recordLlmCall(parent: StageSpan, attrs: LlmCallAttrs): void;
  // Log event attached to the current stage span (not a free-floating log).
  addLog(parent: StageSpan, level: LogLevel, message: string, attrs?: Record<string, unknown>): void;
}

export interface StageSpan {
  end(status: 'ok' | 'error', attrs?: Record<string, unknown>): void;
}

export interface StageAttrs {
  agentRole: string;
  model?: string;
  moduleId: string;
  taskId: string;
}

export interface LlmCallAttrs {
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  promptVersion?: string;  // from vision Layer 11 prompt-versioning requirement
}
```

1.6. Two sink implementations ship in this phase:

- **CLI sink** (`packages/agents-ux/src/telemetry/cli-sink.ts`): renders spans to stdout in the CLI's current formatting.
- **Dashboard sink** (`packages/agents-ux/src/telemetry/dashboard-sink.ts`): emits spans as SSE events compatible with the current `run-manager.ts` event contract so the existing dashboard UI keeps working unchanged.

Later — in roadmap Phase 7 — a third sink (`otel-sink.ts`) exports spans to OTel / Langfuse. The CLI and dashboard sinks **do not disappear**; they continue to render spans for their respective transports, and can optionally also write to OTel in parallel.

**Important:** this sink shape makes `run-manager.ts`'s current event model a *consumer* of the span stream (via the dashboard sink), not the canonical layer. `run-manager.ts` stays where it is for now — it is not elevated, not deleted, not cross-cutting. Vision Layer 11 will replace it when Phase 7 lands.

1.7. Both sinks must be **implementations of the same interface**. The pipeline never has conditional logic based on which caller it has.

**Exit criteria:** `runDesignPipeline` exists in `packages/agents-ux`, is callable from both CLI and dashboard, with identical inputs produces identical outputs (verified by the Phase 0.2 test, still red because the dashboard hasn't migrated yet). Each stage node has a standalone unit test that calls it with a fixture `DesignPhaseState` and asserts its return shape.

Estimated effort: 2–3 days.

### Phase 2 — Migrate the CLI to Layer B

**Goal:** CLI stops having its own stage orchestration; it only handles argv + telemetry.

2.1. Rewrite `packages/cli/src/commands/design-page.ts` so its body is essentially:

```typescript
const sink = createCliTelemetrySink(console);
const result = await runDesignPipeline({
  moduleId,
  taskId,
  projectRoot,
  stage: options.stage,
  resume: !options.fresh,
  designTool: options.tool ?? 'browser',  // --tool=browser|penpot; defaults to browser
  telemetry: sink,
  // …
});
// print summary, exit code
```

2.2. Delete stage-by-stage orchestration from `run-module-pipeline.ts`; either delete the script entirely or reduce it to a thin wrapper over `runDesignPipeline`.

2.3. Delete `design-page-all.ts`'s inlined stage logic; make it wrap `runDesignPipeline` too, or merge with `design-page.ts`.

2.4. Update CLI tests. The existing tests for individual work functions stay; orchestration tests move to `runDesignPipeline` tests. Add a matrix of integration tests: `(designTool='browser')` (primary parity target) and `(designTool='penpot')` (CLI-only). No Figma matrix cell — Figma is not a supported value in this iteration.

2.5. **Browser feedback loop (new CLI work).** `runDesignFeedbackLoop` today requires a Penpot collaboration session. When `--tool=browser` (the new default), the CLI needs a browser-based feedback loop. Two options, pick one:

- **2.5a (recommended):** extract the feedback-loop mechanism into a tool-agnostic core (`packages/agents-ux/src/feedback/feedback-loop.ts`) that takes a `FeedbackAdapter` with `reviewDesign`, `applyPatch`, `showPreview` methods. Provide two adapters: `PenpotFeedbackAdapter` (wraps the existing `DesignCollaborationSession`) and `BrowserFeedbackAdapter` (runs a local browser preview via `designspec-renderer`, accepts user feedback via stdin, applies structured spec patches via a single LLM call). The CLI selects the adapter based on `designTool`.
- **2.5b:** keep two separate CLI feedback loops (`runPenpotFeedbackLoop`, `runBrowserFeedbackLoop`) and branch in the CLI command. Less clean but less up-front work.

Decide during implementation. This is real scope, not plumbing — allocate a full day.

**Exit criteria:** CLI pipeline entry is a ~50-line file. All CLI tests green for all `designTool` values. Parity test for `designTool='browser'` still red (dashboard hasn't migrated). CLI can run `design:page --tool=browser` end-to-end including the feedback loop.

Estimated effort: 2–3 days (adds ~1 day for the browser feedback loop vs the original estimate).

### Phase 3 — Migrate the dashboard to Layer B (THE BIG ONE)

**Goal:** Dashboard routes stop calling `callPipelineStage` and `callClaudeDesignAPI` directly; they call `runDesignPipeline` with a dashboard telemetry sink.

3.1. Rewrite `packages/dashboard/src/app/api/pages/[pageId]/design/route.ts` so `runFullPipelineAsync` becomes:

```typescript
const sink = createDashboardTelemetrySink(runId, taskId);
const result = await runDesignPipeline({
  moduleId: pageId,
  taskId,
  projectRoot,
  designTool: 'browser',   // hardcoded — dashboard does not expose tool selection yet
  telemetry: sink,
  // …
});
// persist result, update page status, complete run
```

`designTool: 'browser'` is hardcoded at every dashboard call site — `design/route.ts`, `chat/route.ts`, any future `implementation` route. When a future dashboard UI lets users opt into Penpot, it's a UI change plus relaxing this hardcode — the pipeline doesn't change.

3.2. Replace the on-disk shape at `agentforge/designs/{pageId}/research.json` to match `UXResearchOutput`. Same for `planning.json`.

3.3. **Breaking change alert:** any code (tests, UI) that reads the old `{ brief: <markdown> }` shape must be updated to use `UXResearchOutput.designConstraints` / `accessibilityRequirements` / etc. Inventory:
- `packages/dashboard/src/app/api/pages/[pageId]/design/chat/route.ts:321` — reads/writes same shape
- Dashboard UI components that display the research brief — find with grep
- Fixtures under `fixtures/claim-filling-sample/agentforge/designs/` — regenerate or manually restructure

3.4. If the dashboard UI needs a human-readable markdown rendering of the research brief, add a **view-model** layer that renders `UXResearchOutput` → markdown for display. Do not persist the markdown as the canonical form.

3.5. Migrate `chat/route.ts`: replace `runChatPipelineAsync` (which re-runs three LLM calls per chat message) with a call into the shared feedback-loop implementation from Stage 6. The dashboard's chat route becomes a thin invocation of the `BrowserFeedbackAdapter` from Phase 2.5a — single-shot structured DesignSpec patch, not a 3-stage rerun.

3.6. **Stage 7 (implementation) is an explicit deferral, not a gap to close in this phase.** Rationale: (a) dashboard Stages 2–6 must all run on shared Layer B before Stage 7 plugs in; (b) wiring `uxImplementationWork` into the dashboard requires file-write and PR-creation plumbing that is out of scope for the unification work; (c) shipping it here would re-introduce dashboard-specific pipeline surface. The shape when it lands later: dashboard adds a route that calls `runDesignPipeline({ stage: 'implementation', designTool: 'browser' })` — no new pipeline code, just a new caller. Track Stage 7 dashboard landing as a follow-up, not a blocker for this plan.

3.7. Delete `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts:callPipelineStage`. Keep `callClaudeDesignAPI` only if the Layer B design stage (`browserDesignWork`) decides to use it internally — otherwise fold its logic into `browserDesignWork` and delete the helper.

**Exit criteria:** Parity test for `designTool='browser'` green. Lint rule green. `callPipelineStage` deleted. Dashboard drives Stages 2–6 through the shared pipeline. Stage 7 dashboard route is explicitly punted to a follow-up, not silently missing.

Estimated effort: 3–5 days — this is the bulk of the work. Most of it is figuring out what the dashboard UI expects from the old shapes and migrating both ends.

### Phase 4 — Unify Stage 1 (`design:generate` → spec/generate)

**Goal:** The app-spec generation stage also gets one implementation.

4.1. Extract `generateAppSpec(input)` into `packages/agents-ux/src/app-spec/` as a work function with typed output (the existing `GeneratedAppSpec` interface is already defined — wrap it in a Zod schema).

4.2. Replace `packages/cli/src/commands/design-generate.ts`'s inline LLM call with a call to the new work function.

4.3. Replace `packages/dashboard/src/app/api/spec/generate/route.ts`'s inline LLM call with the same work function.

4.4. Reconcile the `status: 'approved'` vs `status: 'draft'` divergence. Decide which is canonical (probably `'draft'` for dashboard preview, `'approved'` for CLI direct-write) and make it an input parameter, not a hardcoded difference.

**Exit criteria:** One `generateAppSpec` function. Both entry points call it. Status-default difference expressed as an explicit input, not a hidden divergence.

Estimated effort: 1 day.

### Phase 5 — Documentation and ADRs (deferred, not drafted up-front)

ADRs land **after** Phases 0–4 prove the shared-layer shape works. This plan does not draft them in advance — the shapes are still subject to revision during implementation.

5.1. Update `docs/architecture/design-pipeline-dataflow.md` to describe the three-layer structure (transport/telemetry → Layer B → Layer A) with a "Channels and callers" section listing who calls what and with which `designTool` values. Remove language implying the event-driven `DesignBriefCompleted` flow exists — it doesn't, and it's not needed if the pipeline is one function.

5.2. Write the following ADRs, one per topic (do not bundle):

- **ADR-0xx-unified-design-pipeline.md** — decision to unify on a parameterized `runDesignPipeline({ designTool })`, the rejected alternative (keep two paths), the import-boundary rule, the three-layer separation, the OTel-shaped telemetry substrate.
- **ADR-0xx-browser-default-design-tool.md** — decision that `designTool` defaults to `'browser'`, that the dashboard hardcodes `'browser'` until a future UI exposes the choice, and that Penpot remains CLI-only via `--tool=penpot`. Notes that Figma was removed in the 2026-04-24 spec sync (`sdlc-agents.md:249`) and is not a supported value; re-introducing it would be a new ADR. Cites `sdlc-agents.md:221-249` as the source of truth for the Phase C browser-only target. Can reference but not duplicate ADR-030 (Penpot CLI support).
- **ADR-0xx-design-feedback-loop-strategy.md** — decision that the feedback loop uses structured DesignSpec patches for `designTool='browser'` and retains the Penpot collaboration session for `designTool='penpot'`. Captures the `FeedbackAdapter` pattern from Phase 2.5a.
- **ADR-0xx-stage-7-dashboard-deferral.md** (optional, lightweight) — records that the dashboard deliberately does not implement Stage 7 during this plan and the trigger condition for adding it (Stages 2–6 stabilized on shared Layer B).

5.3. Update `CLAUDE.md`'s "Rejected Patterns" list to include "parallel dashboard pipeline reimplementing agent work functions" and "branching downstream stages on `designTool`" (dispatch stays inside the design node; downstream stages consume `DesignOutput`).

5.4. Close `docs/issues/cli-dashboard-pipeline-divergence.md`.

Estimated effort: 1 day (four small ADRs, dataflow doc update).

---

## Total estimated effort

~10–15 working days for one experienced engineer (updated from 8–12 after adding Phase 0.5 Stage 0 scaffolding, Phase 2.5 browser feedback loop, and the four separate ADRs). Could be parallelized:
- Track 1: Phase 0 → 0.5 → 1 → 2 (contract + scaffolding + Layer B + CLI migration)
- Track 2: Phase 4 can start after Phase 0 (Stage 1 unification is independent of Stages 2–7)
- Phase 3 must be serial after Phase 1.
- Phase 5 (ADRs + docs) must be serial after Phases 2 and 3 — ADRs record what actually shipped, not what was planned.

---

## Risks

1. **Fixture churn.** Every `agentforge/designs/*/research.json` fixture must be regenerated or structurally migrated. This includes tests that snapshot these shapes.
2. **Dashboard UI might depend on markdown-shaped brief for display.** If so, the view-model layer (Phase 3.4) becomes load-bearing. Low risk — markdown can be derived from the structured shape.
3. **Telemetry envelope drift.** The dashboard SSE events have a specific shape the UI consumes. The pipeline telemetry sink must preserve that shape *exactly* when the caller is the dashboard. Put this under test.
4. **LangGraph migration collision — mitigated by design, not deferred.** ADR-043 Phase M-3 will wrap the design pipeline as a `@langchain/langgraph` `StateGraph`. Two prior patterns would have collided hard with that port: (a) a monolithic `runDesignPipeline()` function with inlined stage logic, and (b) a custom event emitter as the telemetry substrate. This plan explicitly avoids both: stages are authored as pure `(state, ctx) => Partial<state>` node functions with a typed Zod state, and telemetry is OTel-span-shaped. The Phase M-3 port becomes `new StateGraph(DesignPhaseStateSchema).addNode(...).addEdge(...)` — ~100 lines of wiring, no node rewrites. **If this plan lands in a shape that *doesn't* follow 1.1–1.2, we will pay for it in Phase M-3.**
5. **Scope creep toward rewriting prompts or stage semantics.** Resist. This plan is consolidation. Semantic changes must be separate tickets.

---

## Success criteria

- `runDesignPipeline` is the only callable orchestrator in the codebase, taking `designTool: 'browser' | 'penpot'` as an input.
- `scaffoldProject` is the only function that writes project scaffolding files; both `initCommand` and `createProject` call it.
- CLI entry point is < 100 lines and accepts `--tool=browser|penpot` (defaults to `browser`).
- Dashboard design route handler is < 150 lines, calls `runDesignPipeline` once with `designTool: 'browser'` hardcoded.
- `callPipelineStage` does not exist.
- `writeFileSync(…, JSON.stringify({ brief: researchResult }, null, 2))` does not exist.
- Duplicated scaffolding (`writeFileSync` blocks in `createProject` + `initCommand`) does not exist — both callers have shrunk by ~150 lines.
- Parity test (Phase 0.2) is green for `(CLI, designTool='browser')` vs `(Dashboard, designTool='browser')`. The CLI-only matrix for `designTool='penpot'` is green.
- Scaffold parity test (Phase 0.5.5) is green.
- Import-boundary lint rule (Phase 0.3) is green without exemptions.
- CLI runs end-to-end with `--tool=browser` including the feedback loop (Phase 2.5).
- Dashboard drives Stages 2–6 through the shared pipeline. Stage 7 dashboard landing is tracked as a follow-up, not a silent gap.
- `fixtures/claim-filling-sample/agentforge/designs/*/research.json` matches `UXResearchOutputSchema`.
- `docs/architecture/design-pipeline-dataflow.md` describes what the code actually does (three layers, `designTool` parameter).
- Phase 5 ADRs are written and cross-referenced (unified pipeline, browser default, feedback-loop strategy, Stage 7 deferral).

---

## Open questions before execution

1. **Should `run-manager.ts` (currently dashboard-internal) move to `packages/core/` or `packages/agents-ux/` as the canonical telemetry sink?** **Revised answer:** *no, don't move it.* Vision Layer 11 commits to OTel + Langfuse as the eventual tracing substrate; `run-manager.ts` is on the replacement list (Phase 7 of the roadmap). Elevating it to a cross-cutting layer now would invest in a doomed substrate. Instead, **the dashboard sink** (Phase 1.6 of this plan) emits OTel-shaped spans that the existing `run-manager.ts` consumes, unchanged. When Phase 7 lands, the dashboard gets a second consumer (the OTel exporter) without touching anything else.

2. **Should we delete `executeUXResearch` / `runAgent` / `registerUXResearch` (the event-bus governance path)?** **Revised answer:** *do not delete as part of this plan.* Per CLAUDE.md and ADR-043, `runAgent()` is the legacy imperative substrate. The rule is: **do not extend it**, but it stays until ADR-043 Phase M-3 cutover replaces it wholesale with LangGraph's interrupt-based governance. Deleting it here would couple this plan to the LangGraph migration (out of scope). The correct posture: new code in this plan imports stage work functions (`uxResearchWork`, etc.) directly — **never** `executeUXResearch` or `runAgent`. Audit existing callers separately as part of ADR-043 M-4 deletion work. Mark the `executeXxx` wrappers `@deprecated` in this plan's Phase 5 docs update.

3. **Is `design:page:all` still needed after Phase 2?** Probably not — it becomes `design:page` with no arguments. Confirm before deletion. Note: cross-page batch generation is scheduled for roadmap Phase 4 (cross-screen coherence via batch coordinator subgraph). Any `design:page:all` successor should be shaped as a batch coordinator invoking the per-page pipeline multiple times with shared running context, not as a separate monolithic flow.

4. **What's the minimum viable path if we can only do 2–3 days of work?** Answer: Phase 0 + Phase 3.1 + Phase 3.2 + Phase 3.3. This would fix the research/planning divergence (the highest-impact issue) without fully unifying. But it would leave Stage 4 and Stage 7 still diverged. A partial fix is better than nothing, but should be explicitly marked as such. **Warning:** a partial fix that does not also land the Phase 1 node-function shape will *not* reduce the cost of ADR-043 Phase M-3 — it only fixes the artifact-shape bug, not the LangGraph-readiness gap.

5. **Does this plan need its own ADR, or does it fold under ADR-043?** Own ADRs, multiple (see Phase 5.2 above), **drafted after the shared-layer lands, not before.** Rationale: ADRs should record what actually shipped. Several shape decisions (e.g. whether browser feedback loop uses a single structured patch or a multi-turn loop; whether `DesignOutput.designToolMetadata` is optional or required) will be finalized during implementation. Drafting ADRs first would either (a) freeze shapes that need to flex, or (b) require ADR updates mid-flight. Note: the decisions themselves are already captured in this plan and in `docs/issues/cli-dashboard-pipeline-divergence.md`'s "Reframing" section — the ADRs just formalize them after proof.

6. **When the dashboard later wants to let users choose Penpot (or any future non-browser tool), what changes?** Three things and no more: (a) the dashboard UI grows a tool-selector component, (b) the `POST /api/pages/[pageId]/design` body accepts a `designTool` field, (c) the hardcoded `designTool: 'browser'` at the route-handler level reads from the body instead. The pipeline does not change. The work functions do not change. The telemetry does not change. This is the load-bearing test of whether the parameterization is right: if it takes more than those three changes, the shape is wrong.
