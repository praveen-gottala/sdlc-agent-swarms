# R7: Dashboard → Spine Integration

!!! info "Related brief"

    R8 (Multi-Screen Design Coordination) covers shared chrome threading
    across the Implementer's task DAG. This brief covers the API surface,
    invocation wiring, and flow unification.

**Question:** How should CLI and Dashboard pipeline invocation be unified into shared modular code, and how does that unified layer then integrate with the spine? What replaces `buildDashboardPipelineInput()` and the separate CLI input construction?

**Blocks:** M1 (Connect — thread Clarifier output into design pipeline)

## Architecture Context

The design pipeline has **one entry point** (`runDesignPipeline()` in `@agentforge/agents-ux`) but **four separate invocation paths** that construct its input independently. Before wiring the spine, these paths need unification so there is a single integration point.

### The Four Invocation Paths

**Path A: CLI per-page** (`agentforge design:page <pageId>`)

The CLI reads project files from disk and constructs `PipelineInput` inline (~35 lines). Supports configurable design tool, model, stage resumption, Chrome Pass, and `designSystemPrompt`.

**Path B: CLI all-pages** (`agentforge design:page:all`)

Same CLI package, different command. Adds Chrome Pass coordination: first page generates shared chrome, subsequent pages consume it. Builds prototype manifest after all pages complete.

**Path C: Dashboard per-page** (`POST /api/pages/[pageId]/design`)

The API route calls `buildDashboardPipelineInput()` to construct input from disk, then runs the pipeline asynchronously. Returns immediately with a `runId`; progress streams via SSE. Uses dashboard-specific run tracking (`startRun`/`completeRun`/`failRun`) and page status management (`draft→generating→rendered`).

**Path D: Dashboard all-pages** (`POST /api/design/generate-all`)

Delegates directly to the CLI's `designPageAllCommand()` with a no-op `Writable` sink. This means: zero telemetry, zero run tracking, zero SSE progress, zero Langfuse tracing during multi-page generation from the dashboard.

### The Inconsistencies

| Aspect | CLI per-page | CLI all-pages | Dashboard per-page | Dashboard all-pages |
|--------|-------------|---------------|-------------------|---------------------|
| Input construction | Inline in `design-page.ts` | Inline in `design-page-all.ts` | `buildDashboardPipelineInput()` | Delegates to CLI |
| `designTool` | Configurable (`--tool`) | Configurable | **Hardcoded `'browser'`** | Via CLI (configurable) |
| `providerString` | Resolved per-stage | Resolved per-stage | **Hardcoded `'claude'`** | Via CLI (resolved) |
| `designSystemPrompt` | Declared but `undefined` at input time; built post-pipeline from `planningOutput` for feedback loop only | Same | **Not built** (no feedback loop in dashboard path) | Via CLI |
| `chromePass` | Not used | generate/consume 2-pass | Not used | Via CLI (supported) |
| `stage` (resume point) | Supported (`--stage`) | Not used | Not used | Not used |
| AgentContext factory | `createPipelineContext()` | Same | `createDashboardPipelineContext()` | Via CLI |
| Telemetry sink | `CliStdoutSink` + Langfuse | Same | `DashboardSseSink` + Langfuse | **No-op sink (silent)** |
| Run/task tracking | None | None | `startRun`/`failRun` + task entry | None |
| Error handling | `process.exitCode` | Same | `failRun()` + HTTP status | `process.exitCode` + HTTP |

### The Gap

All four paths construct `prdRequirements = [description]` — a flat string array that drops all Clarifier structure. The Clarifier produces structured output (`EnrichedRequirement` with typed screens, entities, features, personas, NFRs), but this output is never fed to the design pipeline. The dashboard UI displays it (`prd-preview.tsx`, `use-clarifier-stream.ts`) but never sends it to any design route.

### AgentContext Factory Duplication

Two nearly-identical factories exist:

- **CLI:** `createPipelineContext()` in `packages/cli/src/utils/pipeline-context.ts` (5 params, MCP optional, tolerates missing `providerFactory`)
- **Dashboard:** `createDashboardPipelineContext()` in `packages/dashboard/src/app/api/_lib/pipeline-context.ts` (4 params, no MCP, requires `providerFactory`)

Both create `eventBus`, `fs`, bypass governance with `{ status: 'proceed' }`, and use no-op `recordAudit`. The only real differences: CLI supports optional `mcpClient`, CLI defaults `projectRoot` to `process.cwd()`.

## Current Implementation

### PipelineInput (the interface both callers target)

From `packages/agents-ux/src/design-pipeline/types.ts`:

```typescript
export interface PipelineInput {
  readonly moduleId: string;
  readonly taskId: string;
  readonly projectRoot: string;
  readonly designTool: DesignTool;
  readonly providerString: string;
  readonly stage?: 'research' | 'planning' | 'design' | 'evaluator' | 'feedback' | 'implementation';
  readonly resume?: boolean;
  readonly telemetry?: PipelineTelemetrySink;
  readonly chromePass?: ChromePassConfig;
  readonly agentContext: AgentContext;

  // Pass-through fields for node functions
  readonly prdRequirements?: readonly string[];
  readonly pageContext?: PageContext;
  readonly designTokensSpec?: DesignTokensSpec;
  readonly designConfig?: DesignConfig;
  readonly description?: string;
  readonly viewportWidth?: number;
  readonly rendererTokens?: Record<string, unknown>;
  readonly catalogMap?: CatalogMap;
  readonly componentCatalogPrompt?: string;
  readonly designSystemPrompt?: string;
}
```

### PipelineTelemetrySink (the telemetry contract)

```typescript
export interface PipelineTelemetrySink {
  onStageStart(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }): void;
  onStageComplete(stage: string, result: { costUsd?: number; tokensUsed?: number }): void;
  onStageFail(stage: string, error: string): void;
  onLlmCall(stage: string, attrs: {
    model: string; promptTokens: number; completionTokens: number;
    costUsd: number; latencyMs: number;
  }): void;
  onLog(stage: string, level: 'info' | 'warn' | 'error', message: string): void;
  wrapStage?<T>(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string },
    fn: () => Promise<T>): Promise<T>;
}
```

### ChromePassConfig

```typescript
export interface ChromePassConfig {
  readonly mode: 'generate' | 'consume';
  readonly spec?: DesignSpecV2;
  readonly activePageId?: string;
}
```

### CLI Per-Page Input Construction

From `packages/cli/src/commands/design-page.ts:530-564`:

```typescript
const prdRequirements: string[] = [description];
if (prdContent) prdRequirements.push(prdContent);

const pipelineInput: PipelineInput = {
  moduleId,
  taskId,
  projectRoot: baseDir,
  designTool,
  providerString: resolveCLIModel(),
  stage: skipToStage as PipelineInput['stage'],
  resume: !forceFresh,
  telemetry: sink,
  agentContext: createPipelineContext(taskId, mcpClient, baseDir, providerFactory, projectManifest),
  prdRequirements,
  pageContext,
  designTokensSpec: designTokens,
  designConfig,
  description,
  viewportWidth: effectiveViewportWidth,
  rendererTokens: rendererTokens as Record<string, unknown> | undefined,
  catalogMap: catalogMapV2,
  componentCatalogPrompt,
  designSystemPrompt: projectDesignSystemPrompt,
};
```

### Dashboard Per-Page Input Construction

From `packages/dashboard/src/app/api/_lib/pipeline-input-builder.ts:71-137`:

```typescript
export function buildDashboardPipelineInput(
  pageId: string,
  taskId: string,
  telemetry: PipelineTelemetrySink,
  agentContext: AgentContext,
  opts?: BuildInputOptions,
): PipelineInput | null {
  const projectRoot = getActiveProjectRoot();

  const pagesFile = readYamlFile<RawPagesFile>('agentforge/spec/pages.yaml');
  const rawPages = pagesFile?.pages ?? [];
  const rawPage = rawPages.find((p) => p.id === pageId);
  if (!rawPage) return null;

  const pages = rawPages.map(toPageEntry);
  const description = rawPage.description || rawPage.name || pageId;

  const designTokens = readYamlFile<DesignTokensSpec>('agentforge/spec/design-tokens.yaml');
  const componentCatalog = readYamlFile<RawCatalogSpec>('agentforge/spec/component-catalog.yaml');
  const prdContent = readTextFile('docs/prd.md');
  const designConfig = readYamlFile<DesignConfig>('agentforge/spec/design-config.yaml') ?? undefined;

  const prdRequirements: string[] = [description];
  if (prdContent) prdRequirements.push(prdContent);

  // ... viewport resolution, renderer tokens, catalog map ...

  return {
    moduleId: pageId,
    taskId,
    projectRoot,
    designTool: 'browser',           // ← Hardcoded (CLI configures via --tool)
    providerString: 'claude',        // ← Hardcoded (CLI resolves per-stage)
    resume: opts?.resume ?? true,
    telemetry,
    agentContext,
    prdRequirements,
    pageContext,
    designTokensSpec: designTokens ?? undefined,
    designConfig,
    description,
    viewportWidth,
    rendererTokens,
    catalogMap,
    componentCatalogPrompt,
    // designSystemPrompt: MISSING   // ← Not built (CLI includes this)
  };
}
```

### Dashboard Generate-All Route (delegates to CLI)

From `packages/dashboard/src/app/api/design/generate-all/route.ts`:

```typescript
export async function POST() {
  let projectRoot: string;
  try {
    projectRoot = getActiveProjectRoot();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  const sink = new Writable({
    write(_chunk, _encoding, callback) { callback(); },  // ← No-op: zero telemetry
  });

  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await designPageAllCommand(sink, { projectRoot });   // ← Direct CLI delegation
    const code = process.exitCode ?? 0;
    // ... HTTP response based on exit code ...
  } catch (err) { /* ... */ }
}
```

### CLI AgentContext Factory

From `packages/cli/src/utils/pipeline-context.ts`:

```typescript
export function createPipelineContext(
  taskId: string,
  mcpClient?: MCPClient,
  baseDir?: string,
  providerFactory?: (model: string) => LLMProviderRef,
  manifest?: Pick<ProjectManifest, 'agents'>,
): AgentContext {
  return {
    taskId,
    projectRoot: baseDir ?? process.cwd(),
    eventBus: createEventBus(),
    fs: createRealFs(),
    mcpClient,
    manifest,
    runGovernance: async () => Ok({ status: 'proceed' as const }),
    resolveProvider: providerFactory
      ? (model: string) => Ok(providerFactory(model))
      : () => Err({ code: 'MCP_UNAVAILABLE' as const,
                    message: 'resolveProvider not wired', recoverable: false }),
    recordAudit: () => {},
  };
}
```

### Dashboard AgentContext Factory

From `packages/dashboard/src/app/api/_lib/pipeline-context.ts`:

```typescript
export function createDashboardPipelineContext(
  taskId: string,
  projectRoot: string,
  providerFactory: (model: string) => LLMProviderRef,
  manifest?: Pick<ProjectManifest, 'agents'>,
): AgentContext {
  return {
    taskId,
    projectRoot,
    eventBus: createEventBus(),
    fs: createRealFs(),
    manifest,
    runGovernance: async () => Ok({ status: 'proceed' as const }),
    resolveProvider: (model: string) => Ok(providerFactory(model)),
    recordAudit: () => {},
  };
}
```

### DashboardSseSink (hardcoded stage map)

From `packages/dashboard/src/app/api/_lib/dashboard-sink.ts`:

```typescript
const STAGE_INDEX: Record<string, number> = {
  research: 0,
  planning: 1,
  design: 2,
};

const VISIBLE_STAGE_COUNT = 3;

const HIDDEN_STAGES = new Set(['evaluator']);
```

### Clarifier Output Schemas (what needs threading)

From `packages/core/src/types/cross-boundary-artifacts.schemas.ts`:

```typescript
export const PRDSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  features: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string(),
    priority: z.enum(['must-have', 'should-have', 'could-have', 'wont-have']).optional(),
  })),
  personas: z.array(PersonaSchema),
  dataEntities: z.array(DataEntitySchema),
  screens: z.array(ScreenRefSchema),
  nfrs: z.array(NFRSchema).default([]),
  successMetrics: z.array(SuccessMetricSchema).default([]),
  outOfScope: z.array(z.string()).default([]),
  version: z.string(),
  status: z.enum(['draft', 'reviewed', 'approved']),
});

export const EnrichedRequirementSchema = z.object({
  id: z.string(),
  rawInput: z.string(),
  mode: ClarifierModeSchema,           // 'bootstrap' | 'evolution'
  prd: PRDSchema,                       // Structured product requirements
  assumptionLedger: AssumptionLedgerSchema,
  clarificationRounds: z.array(ClarificationRoundSchema),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
});

export const FeaturePlanSchema = z.object({
  id: z.string(),
  features: z.array(FeatureNodeSchema), // DAG with EARS criteria, dependencies
});
```

## Real Data: CashPulse Dashboard Scenarios

### Scenario 1: Single-page after Clarifier

The M0 Clarifier run on CashPulse PRD produced: 7 screens, 8 data entities (`Expense`, `Category`, `Budget`, `PaymentMethod`, `QuickAddSuggestion`, `DailyAggregate`, `CategoryAggregate`, `UserSettings`), 25 features, 3 personas, 9 NFRs. All 4 schemas validated.

When the user clicks "Generate Design" on the `dashboard` page in Design Studio:

- **Currently:** `buildDashboardPipelineInput('dashboard', ...)` constructs `prdRequirements = ["Dashboard - Main screen showing expense overview"]` plus raw `docs/prd.md` content. The Research stage re-derives accessibility constraints and data model dependencies as flat strings.
- **In spine mode:** The unified builder should receive the full `EnrichedRequirement` with structured entities (typed fields and relationships), typed accessibility constraints (WCAG AA, confidence 0.90), and the `FeaturePlan` DAG showing which features map to this screen. The Research stage either consumes structured input directly or is absorbed by the Architect.

### Scenario 2: Generate All pages with Chrome Pass

After Clarifier approves the CashPulse PRD, the user clicks "Generate All" in Design Studio:

- **Currently:** Dashboard delegates to `designPageAllCommand()` with a no-op sink. The CLI command handles Chrome Pass coordination (shared chrome generated from the first page, consumed by subsequent pages). But: zero telemetry reaches the dashboard, zero run tracking, zero SSE progress. The user sees no feedback until all 7 pages complete.
- **In spine mode:** All 7 screens need consistent `EnrichedRequirement` threading. The unified builder should accept Chrome Pass configuration AND `EnrichedRequirement` together. The dashboard should receive per-page progress via SSE, not silence.

### Scenario 3: Re-generate after design review

The user reviews the dashboard design, spots issues, and wants to regenerate:

- **Currently:** Same `POST /api/pages/[pageId]/design`, no reference to prior Clarifier run. The pipeline starts fresh with `prdRequirements = [description]`.
- **In spine mode:** Should the original Clarifier `threadId` persist? If the user modified the approved PRD, does the Clarifier re-run or does the design pipeline accept an updated `EnrichedRequirement` directly? Where is this state stored — LangGraph checkpoint, project YAML, or dashboard session?

## The Open Questions

### Theme A: Unification (prerequisite for spine)

### 1. Shared input builder location

Should the unified `buildPipelineInput()` function live in `@agentforge/agents-ux` (next to `PipelineInput` type), `@agentforge/core` (shared dependency), or a new shared package? It needs access to YAML file reading (`pages.yaml`, `design-tokens.yaml`, `component-catalog.yaml`, `prd.md`, `design-config.yaml`) and the type definitions for design tokens, catalogs, and page context.

### 2. Unified AgentContext factory

The two factories differ only in MCP client support and project root defaulting. Should there be one `createPipelineContext(options)` function with a discriminated union pattern, or keep them separate with shared internals? The factory needs to handle: optional MCP client (CLI-only for Penpot), required vs default project root, required vs optional provider factory.

### 3. Telemetry sink injection

CLI uses `CliStdoutSink`, Dashboard uses `DashboardSseSink`, Dashboard's all-pages uses a no-op sink. The unified builder should accept a sink as a parameter — but the all-pages no-op sink is a bug. Should the dashboard's all-pages route use `DashboardSseSink` for per-page progress? Or should `designPageAllCommand()` accept a `PipelineTelemetrySink` parameter instead of a `Writable`?

### 4. Dashboard all-pages delegation

Currently delegates to CLI's `designPageAllCommand()` directly, bypassing dashboard run tracking. Options:

- **Option A:** The dashboard implements its own all-pages orchestration using the unified builder, `DashboardSseSink`, and run management — no CLI delegation.
- **Option B:** `designPageAllCommand()` accepts a `PipelineTelemetrySink` parameter (instead of `Writable`), enabling the dashboard to pass `DashboardSseSink` through.
- **Option C:** Keep CLI delegation but add a post-completion notification hook for the dashboard to create run/task records.

### Theme B: Spine Integration (builds on unified base)

### 5. Clarifier → Design bridge

**Partially decided.** The Integrating Clarifier plan (`docs/plans/active/integrating-clarifier/`) commits to: user clicks "Approve & Continue" → `POST /api/projects` with `prdContent` → `scaffoldProject` writes to `docs/prd.md` → navigate to `/projects/{projectId}`. `CreateProjectSchema` already accepts `prdContent` (plain markdown string).

**What's still open:**

- Does the structured `EnrichedRequirement` get persisted as YAML in `agentforge/spec/` or only as markdown in `docs/prd.md`? (Currently only markdown.)
- How does the Clarifier's `threadId` reach the design pipeline? The Integrating Clarifier plan does not address this.
- Does `FeaturePlan` get written to disk on approval, or looked up from the checkpointer at design-time?
- `CreateProjectSchema` has no `assumptions`, `enrichedRequirement`, or `featurePlan` fields — only `prdContent`. Adding these is an M1 prerequisite.

Options for threadId plumbing:

- **Option A:** POST body parameter — the dashboard sends `{ threadId }` in the design route request body. The unified builder looks up the Clarifier's final state via LangGraph checkpointer.
- **Option B:** Server-side session store — the dashboard API stores the latest approved `threadId` per project. The design route reads it without client-side plumbing.
- **Option C:** LangGraph-native — the design pipeline is a continuation of the same LangGraph graph. No separate lookup; state flows via channels.

### 6. PipelineInput extension

The execution plan says add `enrichedRequirement: EnrichedRequirement` and `featurePlan: FeaturePlan`, with `prdRequirements` becoming compat-only. Where in the unified builder does this data come from?

- From LangGraph state (looked up by `threadId` from the Clarifier checkpointer)?
- From disk (Clarifier writes artifacts to `agentforge/` on approval)?
- From the request body (the dashboard passes the full structured data)?

Each option has tradeoffs for coupling, testability, and offline vs online mode.

### 7. Per-page vs all-pages in spine mode

Currently "Generate All" is N sequential pipeline invocations coordinated by `designPageAllCommand()`. In spine mode:

- Is "Generate All" a single spine graph invocation that internally coordinates N page designs?
- Or does the dashboard/CLI invoke the spine N times, passing the same `EnrichedRequirement` each time?
- This affects Chrome Pass coordination (who generates shared chrome — the spine or the caller?).

### 8. Stage count and telemetry evolution

`DashboardSseSink` hardcodes `VISIBLE_STAGE_COUNT = 3` and `STAGE_INDEX = { research: 0, planning: 1, design: 2 }`. When Research and Planning are absorbed by the Architect in spine mode:

- Does the dashboard show "Architect → Design → Evaluator" (3 stages, different names)?
- Or "Architect" as a single stage that encompasses what were Research + Planning?
- Should the stage map be data-driven (passed by the pipeline) rather than hardcoded in the sink?

**Note:** The Clarifier API route (`packages/dashboard/src/app/api/clarifier/route.ts`) also hardcodes its stage list (`STAGE_LABELS` with 8 entries, `PIPELINE_STEP_ORDER` with 8 stages at lines 22-42). The same data-driven solution applies to both pipelines. Making stage descriptors data-driven is independent of the Architect-absorption question and can be tackled immediately.

### 9. Chrome Pass in spine mode

Currently CLI's `design-page-all.ts` handles the 2-pass Chrome loop: first page generates shared chrome, subsequent pages consume it. In spine mode, who coordinates this? The Orchestrator (future M4)? The Implementer (calls design as a tool)? The dashboard? See R8 for the full Chrome Pass coordination analysis — this question frames only the dashboard wiring aspect.

## Hidden Prerequisite: Feature-to-Screen Mapping

Scenario 1 says "the `FeaturePlan` DAG showing which features map to this screen." No such mapping exists in the schemas today:

- `FeatureNodeSchema` has no `screenId` or `screens` field.
- `ScreenRefSchema` has no `featureId` or `features` field.
- `ScreenPlanSchema` has `featureId`, but it's an Architect output (M2/M3), not available at M1.

M1 must decide how features map to screens when threading `FeaturePlan` into per-page design:

- **Option 1:** Pass the full `FeaturePlan` to every page (simple, wasteful). Let the Research/Planning stage filter.
- **Option 2:** Add `featureIds: z.array(z.string()).optional()` to `ScreenRefSchema` (clean, requires Clarifier `prd-analyzer` changes).
- **Option 3:** Heuristic name/description matching between `FeatureNode.name` and `ScreenRef.name` (fragile).
- **Option 4:** Defer `FeaturePlan` threading to M2 when the Architect produces `ScreenPlan` with `featureId`. Thread only `EnrichedRequirement` in M1.

## Settled Decisions

### Destination commitments (planned, not yet implemented)

- **All design generation goes through the spine — there is no standalone mode.** (Execution plan M1, line 779. M1 blocked by R5, R7, R8 — no implementation exists yet. `packages/orchestrator` does not exist; the current design pipeline is an imperative function, not a LangGraph graph.)
- **`PipelineInput` gets `enrichedRequirement` and `featurePlan` fields.** `prdRequirements` becomes migration-period compat only. (Execution plan lines 453-458. These fields do not exist on `PipelineInput` today.)
- **Dashboard "Generate All" and per-page buttons, CLI `design:page` and `design:page:all` all invoke the spine path.** (Execution plan M1, line 779. Destination commitment — not current state.)

### Current architectural commitments (locked, documented)

- **Single-writer per artifact.** The design pipeline is single-threaded within a screen. (Vision Layer 7 locked decision #1; broader principle at Layer 8 locked decision #1 and `design-decisions.md` §1.4)
- **Typed channels between stages.** Every cross-boundary artifact has a Zod schema in `packages/core/src/types/`. (Vision Layer 2, locked)
- **LangGraph checkpointing for spine state.** Postgres checkpointer for production, MemorySaver for dev. (Vision Layer 4, locked. Currently wired only for the Clarifier pipeline. Design pipeline uses imperative caching, not checkpointing. **Caveat:** `dashboard/src/app/api/_lib/checkpointer.ts` silently falls back to MemorySaver on Postgres connection failure via a bare `catch {}` — checkpoint durability is invisible to operators.)
- **Chrome Pass is the cross-screen consistency mechanism.** (ADR-039; `ChromePassConfig` in `types.ts`. Currently CLI-only — dashboard does not use Chrome Pass.)
- **`PipelineTelemetrySink` is the telemetry contract.** Flat callbacks, NOT OTel-shaped. (Types.ts module doc, diverges from feature plan §1.5)

## Related Work (within this codebase)

- **Unify Design Pipeline (Phases 0-5, completed 2026-04-26)** — shipped `runDesignPipeline()`, `PipelineInput`, `PipelineTelemetrySink`, three-layer architecture. R7 builds directly on this foundation. See `docs/plans/completed/unify-pipeline/execution-plan.md`, ADR-046 (unified pipeline), ADR-047 (browser default), ADR-048 (feedback strategy), ADR-049 (Stage 7 deferral).
- **Dashboard Pipeline Fix (active)** — `import.meta.url` under webpack breaks dashboard pipeline execution. Must be resolved before R7's dashboard changes can be tested. See `docs/plans/active/dashboard-pipeline-fix/execution-plan.md`.
- **Integrating Clarifier (active)** — wires "Approve & Continue" button, project creation from approved PRD. Partially addresses Q5. See `docs/plans/active/integrating-clarifier/execution-plan.md`.
- **ADR-039** — Chrome Pass shared layouts. Currently CLI-only.
- **ADR-043** — TypeScript-only orchestration. LangGraph is the sole runtime.

!!! success "ADR-046 numbering collision resolved"

    `ADR-046-langfuse-observability.md` was renumbered to `ADR-052-langfuse-observability.md`. ADR-046 now uniquely refers to the unified design pipeline.

## External References

- **LangGraph Studio (LangGraph team, 2025):** LangGraph's official dashboard invokes graphs by `threadId`. Displays node-by-node progress via streaming. Checkpoint browser shows state at each node. Relevant: the canonical LangGraph-native dashboard integration pattern — `threadId` as the primary handle for all graph interactions.

- **Cursor Composer (Anysphere, 2025):** Background agent invocation from the editor with SSE streaming for progress. Multiple "apply" actions fan out to files. Relevant: per-page design generation maps to per-file "apply" — each is an independent invocation sharing the same context.

- **Vercel v0 (Vercel, 2025):** Single "Generate" button invokes the full pipeline. No visible stage decomposition to the user — result appears when complete. Relevant: simplest dashboard integration pattern. Consider whether CHIP's stage-by-stage progress adds value or just complexity.

- **Devin (Cognition, 2025):** Session-based invocation. Manager dispatches tasks asynchronously. Status updates via streaming. Relevant: "Generate All" as a manager pattern — one session coordinates multiple sub-invocations.

- **Kiro (AWS, 2025):** Spec-first workflow. User approves requirements, then design, then implementation. Each phase has its own approval gate in the IDE sidebar. Sequential progression with per-phase dashboard surface. Relevant: the Clarifier → Design → Review sequential approval matches CHIP's spine.

## Desired Output

A research report answering:

1. **Shared `buildPipelineInput()` architecture.** Function signature, parameter design, where it lives in the package graph. Before/after code sketch showing how both CLI and Dashboard call the same function with their specific overrides (telemetry sink, chrome pass, design tool). Address the `designSystemPrompt` gap and hardcoded `designTool`/`providerString` in the dashboard builder.

2. **Unified AgentContext factory.** Single factory with options pattern or discriminated union. Handle MCP client (CLI-only), project root (required vs default), provider factory (required vs optional). Show how the factory eliminates the duplication between CLI and Dashboard implementations.

3. **Dashboard all-pages fix.** How to give "Generate All" proper telemetry and run tracking instead of a no-op sink. Should the dashboard stop delegating to CLI and implement its own loop? Or should `designPageAllCommand()` accept `PipelineTelemetrySink`? Include the tradeoff analysis.

4. **Clarifier threadId → design pipeline bridge.** Concrete mechanism with sequence diagram. Show the data flow from Clarifier SSE completion through the dashboard through the design API route through the unified builder to the pipeline. Address: where is `EnrichedRequirement` stored after approval, how does the design route retrieve it, what happens on re-generation.

5. **`PipelineInput` extension for spine.** Field mapping: which fields come from LangGraph state (via threadId lookup), which from disk (YAML files), which from the request body. Include the extended `PipelineInput` interface with `enrichedRequirement`, `featurePlan`, and `prdRequirements` as compat-only.

6. **"Generate All" in spine mode.** Single spine invocation vs N individual invocations with shared `EnrichedRequirement`. Address Chrome Pass coordination ownership — does the spine or the caller handle the 2-pass loop?

7. **Stage-count / telemetry migration plan.** How `DashboardSseSink` adapts to spine-mode stages. Should `STAGE_INDEX` and `VISIBLE_STAGE_COUNT` become data-driven (passed by the pipeline) rather than hardcoded? Include the stage mapping from old (research/planning/design) to new (architect/design/evaluator or equivalent).

8. **End-to-end flow diagram.** Unified CLI + Dashboard → shared builder → spine → design pipeline → result storage, with SSE events flowing back to the dashboard. Show both per-page and all-pages paths through the unified architecture.
