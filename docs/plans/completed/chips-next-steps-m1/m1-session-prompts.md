# M1 "Connect" Session Prompts

Sessions 1-3: Wave 1 (sequential on main).
Sessions 4-5: Wave 2 (sequential on main, after Wave 1 committed).
Session 6: E2E browser verification (after all phases committed).

**Important:** Each session prompt is self-contained. The agent receiving it does NOT have context from prior sessions. Each prompt tells the agent exactly what to read, what to build, what to test, and what "done" looks like.

**Execution strategy:** All work directly on main. Each session commits when typecheck/test/lint pass.

---

## Session 1 — Phase 1 (Unified Factories) + Phase 4 (PipelineInput Extension)

```
You are implementing M1 Phase 1 (Unified Factories) and Phase 4 (PipelineInput Extension) for the CHIP project. These phases consolidate duplicate pipeline context/input factories and add the enrichedRequirement field.

Read these files first (in order):
1. docs/plans/active/chips-next-steps/m1-execution-plan.md — full M1 plan, focus on Phase 1 and Phase 4
2. docs/plans/active/chips-next-steps/m1-decisions.md — D4, D5, D8, D9 decisions
3. docs/adrs/ADR-053-prd-markdown-renderer-as-single-source.md — renderPrdToMarkdown is the single renderer

Then read the source files you'll be modifying/referencing:
4. packages/cli/src/utils/pipeline-context.ts — CLI's createPipelineContext() (lines 35-58), I/O helpers (lines 65-99)
5. packages/dashboard/src/app/api/_lib/pipeline-context.ts — dashboard's createDashboardPipelineContext() (lines 19-35)
6. packages/dashboard/src/app/api/_lib/pipeline-input-builder.ts — buildDashboardPipelineInput() (lines 71-137)
7. packages/cli/src/commands/design-page-all.ts — inline PipelineInput construction (lines 395-417), Chrome Pass (lines 335-354)
8. packages/agents-ux/src/design-pipeline/types.ts — PipelineInput (lines 68-97), DesignPhaseState (lines 110-134)
9. packages/agents-ux/src/design-pipeline/pipeline.ts — initState() (lines 44-55)
10. packages/agents-ux/src/design-pipeline/index.ts — current exports
11. packages/core/src/prd/render-prd-markdown.ts — renderPrdToMarkdown() (lines 17-83)
12. packages/core/src/types/cross-boundary-artifacts.schemas.ts — EnrichedRequirementSchema (lines 152-161)

## Phase 1: Unified Factories (D4, D5)

### 1.1 Create shared createPipelineContext() in agents-ux

Create packages/agents-ux/src/design-pipeline/pipeline-context.ts:

```typescript
export interface PipelineContextOptions {
  readonly taskId: string;
  readonly projectRoot: string;
  readonly providerFactory?: (model: string) => LLMProviderRef;
  readonly mcpClient?: MCPClient;
  readonly manifest?: Pick<ProjectManifest, 'agents'>;
}

export function createPipelineContext(opts: PipelineContextOptions): AgentContext
```

Unify the CLI factory (cli/src/utils/pipeline-context.ts:35-58) and dashboard factory (dashboard/api/_lib/pipeline-context.ts:19-35). Differences to resolve:
- CLI has optional mcpClient — now in opts
- Dashboard requires projectRoot — now required in opts
- CLI defaults baseDir to process.cwd() — now explicit via projectRoot
- Both use createEventBus(), createRealFs(), bypass governance

### 1.2 Create shared buildPipelineInput() in agents-ux

Create packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts:

```typescript
export interface BuildPipelineInputOptions {
  readonly pageId: string;
  readonly taskId: string;
  readonly projectRoot: string;
  readonly telemetry?: PipelineTelemetrySink;
  readonly agentContext: AgentContext;
  readonly designTool?: DesignTool;          // default: 'browser'
  readonly providerString?: string;          // default: 'claude'
  readonly resume?: boolean;                 // default: true
  readonly stage?: PipelineInput['stage'];
  readonly chromePass?: ChromePassConfig;
}

export function buildPipelineInput(opts: BuildPipelineInputOptions): PipelineInput | null
```

Encapsulate logic from dashboard buildDashboardPipelineInput() (pipeline-input-builder.ts:71-137) and CLI inline construction (design-page-all.ts:395-417). Use readYaml(filePath, fs) from @agentforge/core (NOT the dashboard's local readYamlFile/readTextFile wrappers). Reuse existing buildComponentCatalogPrompt(), buildPageContext(), resolvePageEntry() from agents-ux. Return null if page not found in pages.yaml.

### 1.3 Redirect callers

- Dashboard pipeline-context.ts: body becomes delegation to shared createPipelineContext()
- Dashboard pipeline-input-builder.ts: body becomes delegation to shared buildPipelineInput()
- CLI pipeline-context.ts: agent context factory becomes delegation; I/O helpers (ensureOutputDir, saveArtifact, loadArtifact, saveTextArtifact, deriveModuleId) stay in place
- CLI design-page-all.ts: inline PipelineInput construction (lines 395-417) replaced with buildPipelineInput() call

## Phase 4: PipelineInput Extension (D8)

### 4.1 Add enrichedRequirement field

In packages/agents-ux/src/design-pipeline/types.ts:
- Add `readonly enrichedRequirement?: EnrichedRequirement;` to PipelineInput interface (after line 97)
- Add `readonly enrichedRequirement?: EnrichedRequirement;` to DesignPhaseState interface (after line 134)

### 4.2 Propagate in initState()

In packages/agents-ux/src/design-pipeline/pipeline.ts, in initState() (line 44):
- Add enrichedRequirement to the state initialization
- Implement compat fallback: if enrichedRequirement provided but prdRequirements not explicitly set, derive prdRequirements via renderPrdToMarkdown(input.enrichedRequirement.prd)

```typescript
const prdRequirements = input.prdRequirements ??
  (input.enrichedRequirement ? [renderPrdToMarkdown(input.enrichedRequirement.prd)] : undefined);
```

CRITICAL: initState() only copies explicitly named fields. You MUST add enrichedRequirement to initState() — the type change alone is insufficient.

### 4.3 Update barrel exports

Update packages/agents-ux/src/design-pipeline/index.ts to export new functions and types.
Update packages/agents-ux/src/index.ts to re-export from design-pipeline barrel.

## Files to create/modify

| File | Change |
|------|--------|
| packages/agents-ux/src/design-pipeline/pipeline-context.ts | NEW — shared createPipelineContext() |
| packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts | NEW — shared buildPipelineInput() |
| packages/agents-ux/src/design-pipeline/types.ts | Add enrichedRequirement to both interfaces |
| packages/agents-ux/src/design-pipeline/pipeline.ts | Propagate in initState(), add compat fallback |
| packages/agents-ux/src/design-pipeline/index.ts | Export new functions + types |
| packages/agents-ux/src/index.ts | Re-export from design-pipeline barrel |
| packages/dashboard/src/app/api/_lib/pipeline-context.ts | Delegate to shared factory |
| packages/dashboard/src/app/api/_lib/pipeline-input-builder.ts | Delegate to shared builder |
| packages/cli/src/utils/pipeline-context.ts | Delegate agent context factory to shared |
| packages/cli/src/commands/design-page-all.ts | Replace inline PipelineInput with buildPipelineInput() |

## Tests

All tests go next to source files (foo.ts → foo.test.ts).

1. packages/agents-ux/src/design-pipeline/__tests__/pipeline-context.test.ts:
   - AgentContext creation with/without mcpClient
   - AgentContext creation with/without providerFactory (Err path)
   - mcpClient threaded through to AgentContext

2. packages/agents-ux/src/design-pipeline/__tests__/pipeline-input-builder.test.ts:
   - PipelineInput construction from temp fixture dir with pages.yaml + design-tokens.yaml
   - Returns null when page not found
   - Parity test: same fixture → compare output fields match old buildDashboardPipelineInput

3. packages/cli/src/utils/__tests__/pipeline-context.test.ts:
   - CLI wrapper returns AgentContext with mcpClient set
   - providerFactory absent → Err on resolveProvider()

4. packages/agents-ux/src/design-pipeline/__tests__/pipeline.test.ts (update existing):
   - initState() with enrichedRequirement → state.enrichedRequirement is defined
   - renderPrdToMarkdown() used as compat fallback → prdRequirements[0] === renderPrdToMarkdown(enrichedReq.prd)
   - Precedence: explicit prdRequirements wins over derived
   - CashPulse PRD fixture through renderPrdToMarkdown → output contains entity names

## Verification

```bash
nx run-many -t typecheck   # must be clean
nx run-many -t test        # all pass, no pre-existing failures
nx run-many -t lint        # clean
```

Grep: no remaining callers of old factory signatures except thin delegating wrappers:
```bash
grep -rn "createDashboardPipelineContext\|buildDashboardPipelineInput" packages/ --include='*.ts' | grep -v test | grep -v __tests__
```

## Success criteria

1. Shared createPipelineContext() in agents-ux works for both CLI and dashboard
2. Shared buildPipelineInput() in agents-ux replaces both dashboard and CLI inline construction
3. PipelineInput and DesignPhaseState have enrichedRequirement field
4. initState() propagates enrichedRequirement AND derives prdRequirements from it
5. All three verification commands pass with zero failures
6. No behavioral changes — existing design pipeline produces identical output
```

---

## Session 2 — Phase 2 (Data-Driven StageDescriptor)

```
You are implementing M1 Phase 2 (Data-Driven StageDescriptor) for the CHIP project. This replaces hardcoded stage constants in DashboardSseSink with a data-driven StageDescriptor[] parameter.

Read these files first:
1. docs/plans/active/chips-next-steps/m1-execution-plan.md — Phase 2 section
2. docs/plans/active/chips-next-steps/m1-decisions.md — D9 decision
3. packages/dashboard/src/app/api/_lib/dashboard-sink.ts — the file you're modifying

Focus on dashboard-sink.ts:
- STAGE_INDEX (lines 16-20): maps research: 0, planning: 1, design: 2
- VISIBLE_STAGE_COUNT = 3 (line 22)
- HIDDEN_STAGES = new Set(['evaluator']) (line 24)
- DashboardSseSink class (lines 37-145)

## What to do

### 2.1 Add StageDescriptor type

```typescript
export interface StageDescriptor {
  readonly name: string;
  readonly visibleIndex: number;
  readonly hidden: boolean;
}
```

### 2.2 Add default descriptors

```typescript
export const DESIGN_PIPELINE_STAGES: StageDescriptor[] = [
  { name: 'research', visibleIndex: 0, hidden: false },
  { name: 'planning', visibleIndex: 1, hidden: false },
  { name: 'design', visibleIndex: 2, hidden: false },
  { name: 'evaluator', visibleIndex: -1, hidden: true },
];
```

### 2.3 Modify DashboardSseSink constructor

Add optional `stages?: StageDescriptor[]` parameter. When absent, default to DESIGN_PIPELINE_STAGES. Derive STAGE_INDEX, VISIBLE_STAGE_COUNT, HIDDEN_STAGES from the descriptor array in the constructor (replace the module-level constants).

## Files modified

| File | Change |
|------|--------|
| packages/dashboard/src/app/api/_lib/dashboard-sink.ts | Add StageDescriptor, constructor param, derive from descriptors |

## Tests

Update or add tests in the existing test file for dashboard-sink (2 tests only — others are redundant):

1. Backward-compat: new DashboardSseSink(runId, pipeline, taskId) (no stages param) behaves identically to current tests (indices 0/1/2, count 3, evaluator hidden)
2. Unknown stage name: call onStageStart with a name not in the descriptor array, verify safe default (no crash)

DO NOT add: "custom 5-stage descriptor" (no consumer exists — scope creep) or "hidden stage filtering" (already tested in dashboard-sink.test.ts:157-167)

## Verification

```bash
nx run dashboard:test       # existing sink tests pass unchanged
nx run-many -t typecheck    # clean
nx run-many -t test         # all pass
nx run-many -t lint         # clean
```

## Success criteria

1. StageDescriptor type exported from dashboard-sink.ts
2. DESIGN_PIPELINE_STAGES constant exported as default
3. Constructor accepts optional stages param, derives indices from it
4. All existing tests pass without modification (backward compat)
5. New tests cover custom descriptors and edge cases
6. Zero typecheck/test/lint failures
```

---

## Session 3 — Phase 5 (Clarifier Approval Flow)

NOTE: An existing `e2e/clarifier-approval.spec.ts` (146 lines) was written in a prior session but never committed. Check if it exists and reuse it — it covers the E2E test requirements for this phase.

```
You are implementing M1 Phase 5 (Clarifier Approval Flow) for the CHIP project. This wires the "Approve & Continue" button on the /new page to create a project with Clarifier artifacts.

Read these files first (in order):
1. docs/plans/active/chips-next-steps/m1-execution-plan.md — Phase 5 section (all of 5.0-5.4)
2. docs/plans/active/chips-next-steps/m1-decisions.md — D2, D3, D7 decisions
3. docs/adrs/ADR-053-prd-markdown-renderer-as-single-source.md — renderPrdToMarkdown is the single renderer

Then read the source files:
4. packages/dashboard/src/app/api/_lib/project-creation.ts — CreateProjectSchema (lines 28-59), createProject() (lines 120-242)
5. packages/dashboard/src/app/(dashboard)/new/page.tsx — NewProjectPage (lines 269-343), onApprove stub at line 337
6. packages/core/src/types/cross-boundary-artifacts.schemas.ts — EnrichedRequirementSchema (lines 152-161), PRDSchema (lines 121-139)
7. packages/core/src/prd/render-prd-markdown.ts — renderPrdToMarkdown() (lines 17-83)
8. packages/dashboard/src/lib/clarifier-chat-types.ts — ClarifierState type (if it exists)

Also check what the Clarifier stream returns by reading:
9. packages/agents-clarifier/src/graph/state.ts — the state shape that gets returned
10. packages/dashboard/src/app/api/clarifier/ — the API routes that serve the Clarifier

Check if e2e/clarifier-approval.spec.ts already exists — if so, read it and reuse/update it for the E2E test requirements below.

## Phase 5.0: Frontend type widening

The dashboard's ClarifierState.requirement type is currently { prd: Record<string, unknown>; confidence: number } | null. Widen to:
- ClarifierState.requirement: EnrichedRequirement | null (import from @agentforge/core)
- ClarifierState.assumptions: AssumptionLedger | null (import from @agentforge/core)

Re-validate at the createProject boundary via EnrichedRequirementSchema.parse(...) since the wire payload is JSON.

## Phase 5.1: CreateProjectSchema extension (D3)

In project-creation.ts, add to CreateProjectSchema:
```typescript
clarifierOutput: z.object({
  enrichedRequirement: EnrichedRequirementSchema,
  threadId: z.string(),
}).optional(),
```

## Phase 5.2: Artifact persistence in createProject() (D2)

When clarifierOutput is present in createProject:
1. Render markdown via renderPrdToMarkdown(enrichedRequirement.prd) BEFORE calling scaffoldProject, pass as prdContent. Do not write docs/prd.md separately — scaffold handles it.
2. AFTER scaffoldProject succeeds, write:
   - agentforge/spec/enriched-requirement.yaml (the full EnrichedRequirement)
   - agentforge/spec/assumption-ledger.yaml (from enrichedRequirement.assumptionLedger)
   Both via writeYaml from @agentforge/core.

## Phase 5.3: ThreadId persistence (D7)

Inject clarifier: { threadId, lastRunAt } into projectConfig BEFORE passing to scaffoldProject. No post-scaffold rewrite of agentforge.yaml. Stored for M2 LangGraph continuity; not consumed in M1.

## Phase 5.4: Frontend approval handler

In packages/dashboard/src/app/(dashboard)/new/page.tsx, replace onApprove={() => {}} (line 337) with:
- Extract enrichedRequirement, assumptionLedger, threadId from Clarifier's completed state
- Call POST /api/projects with clarifierOutput wrapper
- Navigate to project page on success (use Next.js router.push)
- Show error toast on failure (use existing toast pattern in the dashboard)

## Files modified

| File | Change |
|------|--------|
| packages/dashboard/src/app/api/_lib/project-creation.ts | Add clarifierOutput to schema, write artifacts in createProject() |
| packages/dashboard/src/app/(dashboard)/new/page.tsx | Wire handleApprove with clarifierOutput payload |
| packages/dashboard/src/lib/clarifier-chat-types.ts | Widen ClarifierState types (if this file exists) |

## Tests

1. project-creation-clarifier.test.ts (new, next to project-creation.ts):
   - When clarifierOutput present: enriched-requirement.yaml written, assumption-ledger.yaml written, docs/prd.md written by scaffold, agentforge.yaml contains clarifier.threadId
   - When clarifierOutput absent: no clarifier-specific files created (backward compat)
   - Invalid clarifierOutput data → 400 response with schema validation error (not 500 crash)
   - threadId read back from created agentforge.yaml matches input

2. E2E test e2e/clarifier-approval.spec.ts (may already exist — update if so):
   - Mock POST /api/projects → 201
   - Click "Approve & Continue" button
   - Verify navigation to project page
   - Verify error toast on 500 response

## Verification

```bash
nx run-many -t typecheck    # clean
nx run dashboard:test       # existing project creation tests pass
nx run-many -t test         # all pass
nx run-many -t lint         # clean
npx playwright test e2e/clarifier-approval.spec.ts --headed  # E2E passes
```

## Success criteria

1. CreateProjectSchema accepts optional clarifierOutput wrapper
2. createProject() writes enriched-requirement.yaml and assumption-ledger.yaml when clarifierOutput present
3. docs/prd.md rendered via renderPrdToMarkdown (not raw JSON dump)
4. agentforge.yaml contains clarifier.threadId when clarifierOutput present
5. Backward compat: projects without clarifierOutput still create correctly
6. "Approve & Continue" button on /new page triggers project creation with Clarifier data
7. Navigation to project page after successful creation
8. Error toast on failure
9. Zero typecheck/test/lint failures
```

---

## Session 4 — Phase 3 (Dashboard All-Pages Loop) + Phase 6 (Clarifier→Design Bridge)

Run AFTER Sessions 1-3 committed to main.

```
You are implementing M1 Phase 3 (Dashboard All-Pages Loop) and Phase 6 (Clarifier→Design Bridge) for the CHIP project. These phases require Wave 1 (Phases 1, 2, 4, 5) to be already merged to main.

PREREQUISITE CHECK — before starting, verify these exist:
```bash
# Phase 1 artifacts
grep -n "createPipelineContext\|buildPipelineInput" packages/agents-ux/src/design-pipeline/index.ts
# Phase 2 artifacts
grep -n "StageDescriptor" packages/dashboard/src/app/api/_lib/dashboard-sink.ts
# Phase 4 artifacts
grep -n "enrichedRequirement" packages/agents-ux/src/design-pipeline/types.ts
# Phase 5 artifacts
grep -n "clarifierOutput" packages/dashboard/src/app/api/_lib/project-creation.ts
```
If ANY of these greps return empty, STOP — Wave 1 is not merged yet.

Read these files first:
1. docs/plans/active/chips-next-steps/m1-execution-plan.md — Phase 3 and Phase 6 sections
2. packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts — the shared buildPipelineInput() from Phase 1
3. packages/agents-ux/src/design-pipeline/pipeline-context.ts — the shared createPipelineContext() from Phase 1
4. packages/dashboard/src/app/api/_lib/dashboard-sink.ts — StageDescriptor from Phase 2
5. packages/dashboard/src/app/api/design/generate-all/route.ts — current implementation (delegates to CLI, null sink)
6. packages/cli/src/commands/design-page-all.ts — Chrome Pass + per-page loop (lines 301-471)
7. packages/core/src/types/cross-boundary-artifacts.schemas.ts — EnrichedRequirementSchema

## Phase 3: Dashboard All-Pages Loop (D6)

**Scope note:** This phase is a refactor — extract shared helpers, replace null sink, add run tracking. In-loop cross-screen coherence (vision Layer 7) is deferred. See execution-plan.md §Deferred from M1.

### 3.1 Extract runPagesWithChromePass() shared helper

Create packages/agents-ux/src/design-pipeline/run-pages.ts:

```typescript
export interface RunPagesOptions {
  readonly pages: PageEntry[];
  readonly projectRoot: string;
  readonly buildInput: (pageId: string, chromePass?: ChromePassConfig) => PipelineInput | null;
  readonly onPageStart?: (pageId: string, index: number, total: number) => void;
  readonly onPageComplete?: (pageId: string, result: DesignPhaseState, durationMs: number) => void;
  readonly onPageFail?: (pageId: string, error: PipelineStageError, durationMs: number) => void;
}

export interface PageRunResult {
  readonly pageId: string;
  readonly status: 'ok' | 'failed';
  readonly durationMs: number;
  readonly state?: DesignPhaseState;
}

export async function runPagesWithChromePass(opts: RunPagesOptions): Promise<PageRunResult[]>
```

Encapsulate Chrome Pass → sequential per-page pipeline loop from design-page-all.ts:301-471. The helper:
- Calls resolveSharedComponents(pages) for Chrome Pass reference page selection
- Runs Chrome Pass generation pipeline if needed
- Iterates pages sequentially with chromePass: { mode: 'consume' }
- Delegates input construction to opts.buildInput() callback
- Does NOT include CLI formatting, Langfuse init, correction pipeline, or prototype manifest building

### 3.2 Rewrite dashboard generate-all route

Rewrite packages/dashboard/src/app/api/design/generate-all/route.ts:
- Create DashboardSseSink per page (using StageDescriptor from Phase 2)
- Use startRun / completeRun / failRun from run-manager
- Call runPagesWithChromePass() with dashboard-specific buildInput callback
- Write design specs and update page statuses

### 3.3 Redirect CLI's design-page-all

Refactor design-page-all.ts Chrome Pass + per-page loop (lines 301-471) to use runPagesWithChromePass(). CLI keeps Langfuse init, correction pipeline, prototype manifest building, and formatting.

## Phase 6: Clarifier→Design Bridge (D7)

In the shared buildPipelineInput() (created in Phase 1), add enriched-requirement.yaml reading:

```typescript
let enrichedRequirement: EnrichedRequirement | undefined;
const enrichedRes = readYaml<unknown>(
  join(opts.projectRoot, 'agentforge/spec/enriched-requirement.yaml'),
  opts.agentContext.fs,
);
if (enrichedRes.ok) {
  const parsed = EnrichedRequirementSchema.safeParse(enrichedRes.value);
  if (parsed.success) {
    enrichedRequirement = parsed.data;
  } else {
    opts.telemetry?.onLog?.('init', 'warn',
      `enriched-requirement.yaml schema-invalid: ${parsed.error.message}`);
  }
}
```

When enrichedRequirement is defined, buildPipelineInput leaves prdRequirements undefined so initState() derives it via renderPrdToMarkdown. When absent, fall back to [description, ...(prdContent ? [prdContent] : [])].

## Files modified

| File | Change |
|------|--------|
| packages/agents-ux/src/design-pipeline/run-pages.ts | NEW — shared runPagesWithChromePass() |
| packages/agents-ux/src/design-pipeline/index.ts | Export run-pages |
| packages/dashboard/src/app/api/design/generate-all/route.ts | Rewrite with own loop + sink |
| packages/cli/src/commands/design-page-all.ts | Refactor to use runPagesWithChromePass() |
| packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts | Add enriched-requirement.yaml read |

## Tests

1. packages/agents-ux/src/design-pipeline/__tests__/run-pages.test.ts:
   - Chrome Pass → per-page loop with mock pipeline, verify callbacks called per page
   - Partial failure — one page fails, assert others still complete, onPageFail called only for failed page

2. Updated builder tests for Phase 6:
   - enrichedRequirement present when valid YAML exists
   - enrichedRequirement absent when YAML missing (backward compat)
   - enrichedRequirement absent when schema invalid or malformed → telemetry.onLog called with 'warn', no crash
   - Precedence test: fixture with BOTH enriched-requirement.yaml AND docs/prd.md → assert prdRequirements is undefined (initState() derives from enriched)

DO NOT add: dashboard route handler unit test — E2E already covers real behavior at e2e/screen-types-plan-b.spec.ts:783. Mock-call verification violates Test Quality Gate #3.

## Verification

```bash
nx run-many -t typecheck    # clean
nx run-many -t test         # all pass
nx run-many -t lint         # clean
```

Dashboard route E2E is BLOCKED by Dashboard Pipeline Fix (import.meta.url under webpack). Existing E2E at e2e/screen-types-plan-b.spec.ts:783 covers the happy path.

## Success criteria

1. runPagesWithChromePass() encapsulates Chrome Pass logic, CLI and dashboard both use it
2. Dashboard generate-all route has its own DashboardSseSink and run tracking (not null sink)
3. CLI behavior unchanged — existing integration tests pass
4. buildPipelineInput() reads enriched-requirement.yaml when present
5. Schema-invalid YAML triggers warning log, not crash
6. Missing YAML = old behavior (backward compat)
7. Zero typecheck/test/lint failures
```

---

## Session 5 — Phase 7 (Integration Test) + Phase 8 (Documentation)

Run AFTER Session 4 committed to main.

```
You are implementing M1 Phase 7 (Integration Test) and Phase 8 (Documentation) for the CHIP project. All M1 phases 1-6 must be merged to main.

PREREQUISITE CHECK:
```bash
# Phase 1: shared factories exist
grep -n "createPipelineContext\|buildPipelineInput" packages/agents-ux/src/design-pipeline/index.ts
# Phase 4: enrichedRequirement field exists
grep -n "enrichedRequirement" packages/agents-ux/src/design-pipeline/types.ts
# Phase 5: clarifierOutput in project creation
grep -n "clarifierOutput" packages/dashboard/src/app/api/_lib/project-creation.ts
# Phase 6: enriched-requirement.yaml read in builder
grep -n "enriched-requirement.yaml" packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts
```
If ANY of these greps return empty, STOP — prior phases not merged.

Read these files first:
1. docs/plans/active/chips-next-steps/m1-execution-plan.md — Phase 7 and Phase 8
2. packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts — the shared builder
3. packages/agents-ux/src/design-pipeline/pipeline.ts — initState()
4. packages/dashboard/src/app/api/_lib/project-creation.ts — createProject with clarifierOutput
5. packages/core/src/prd/render-prd-markdown.ts — the renderer

## Phase 7: Integration Test — Clarifier→Design on CashPulse

### 7.1 Create CashPulse M1 fixture

Create packages/agents-ux/__tests__/fixtures/cashpulse-m1/ with:
- agentforge.yaml — with clarifier.threadId field
- agentforge/spec/enriched-requirement.yaml — from M0 CashPulse run data (check packages/eval/fixtures/ or docs/plans/active/chips-next-steps/ for CashPulse fixture data)
- agentforge/spec/assumption-ledger.yaml
- agentforge/spec/pages.yaml — CashPulse pages
- agentforge/spec/design-tokens.yaml
- docs/prd.md

For the CashPulse enriched requirement data, look at:
```bash
find . -path '*/cashpulse*' -name '*.yaml' -o -path '*/cashpulse*' -name '*.json' | head -20
find . -path '*/fixture*' -name 'enriched*' | head -10
```

### 7.2 Integration test (3 focused tests)

Create packages/agents-ux/__tests__/m1-connect.integration.test.ts:

1. Happy path: Call buildPipelineInput() with CashPulse fixture → assert enrichedRequirement present with correct screen count, entity names in prdRequirements[0], confidence is valid number, initState() threads enrichedRequirement through to state
2. Fallback path: Same fixture minus enriched-requirement.yaml → enrichedRequirement undefined, prdRequirements contains flat [description, prdContent]
3. Cross-phase disk path parity: Call createProject() with clarifierOutput, then buildPipelineInput() on the created project dir → enrichedRequirement from disk matches the one passed to createProject

NOTE: Determinism, confidence, and state propagation are consolidated into the happy path test — they are subsets of the same data flow.

## Phase 8: Documentation + Plan Cleanup

### 8.1 Update architectural docs

1. docs/architecture/design-pipeline-dataflow.md — Add "Enriched Requirement Ingestion" section: file location, schema, buildPipelineInput() read path, prdRequirements auto-population
2. docs/vision.md Layer 4 — Note M1 completion: EnrichedRequirement flows disk-based from Clarifier to Design, threadId preserved for M2

### 8.2 Subsume integrating-clarifier plan

docs/plans/active/integrating-clarifier/execution-plan.md — Mark SUPERSEDED by M1:
- Q1 (PRD format): YAML in enriched-requirement.yaml + markdown in docs/prd.md
- Q2 (Auto-trigger): Manual initiation from project page
- Q3 (Project home): Not changed in M1

### 8.3 Update plan status

- docs/plans/active/chips-next-steps/execution-plan.md — Update M1 status to COMPLETE
- CLAUDE.md — Update Active Plans section with M1 status

### 8.4 Cross-screen coherence backstage doc (NEW — from challenge review)

Create docs/concepts/cross-screen-coherence.md — standalone backstage concept page:
- What cross-screen coherence means (consistent headers, nav, tokens, data fields across screens)
- Current state: Chrome Pass (injection of shared chrome elements via resolveSharedComponents)
- Target state: Vision Layer 7 (batch coordinator, topological sort, running context, in-loop check)
- 2 Mermaid diagrams: (1) current Chrome Pass flow, (2) target coherence flow with batch coordinator
- Links to docs/concepts/design-pipeline.md §Cross-Screen Architecture and docs/vision.md Layer 7
- Add to mkdocs.yml under Concepts nav

### 8.5 Add "Deferred from M1" section (already added to execution-plan.md)

Verify the "Deferred from M1" section exists in docs/plans/active/chips-next-steps/execution-plan.md with the cross-screen coherence backlog item. If missing, add it.

## Verification

```bash
nx run agents-ux:test       # new integration test passes
nx run-many -t typecheck    # clean
nx run-many -t test         # all pass
nx run-many -t lint         # clean
```

Verify docs reference correct file paths:
```bash
grep -n "enriched-requirement.yaml\|buildPipelineInput\|renderPrdToMarkdown" docs/architecture/design-pipeline-dataflow.md
```

## Success criteria

1. CashPulse M1 fixture exists with all required files
2. Integration test (3 tests): happy path proves enriched data flows through, fallback proves backward compat, parity proves write/read path match
3. integrating-clarifier plan marked SUPERSEDED
4. Architecture docs updated with enriched requirement ingestion section
5. Cross-screen coherence backstage doc created with 2 Mermaid diagrams
6. "Deferred from M1" section exists in execution-plan.md
7. Zero typecheck/test/lint failures
```

---

## Session 6 — E2E Browser Verification (run after all phases merged)

This session is the M1 acceptance test. It onboards a real app through the Clarifier, approves the PRD, generates designs, and verifies enriched data reaches LLM prompts via debug instrumentation.

### Prompt

```
This is the M1 "Connect" acceptance test. All M1 phases (1-8) are merged. Your job: verify the full end-to-end flow in the browser and confirm enriched PRD data actually reaches LLM prompts.

Read these files first:
1. docs/plans/active/chips-next-steps/m1-execution-plan.md — understand what M1 delivers
2. docs/adrs/ADR-053-prd-markdown-renderer-as-single-source.md — renderPrdToMarkdown is the single renderer
3. packages/agents-ux/src/ux-research/ux-research.ts — lines 162-165 where prdRequirements enters the research prompt, lines 125-131 where it's validated
4. packages/agents-ux/src/design-pipeline/pipeline.ts — initState() where enrichedRequirement is propagated and prdRequirements is derived
5. packages/core/src/prd/render-prd-markdown.ts — the renderer

IMPORTANT: There is currently NO mechanism to see prompt content in debug logs. The telemetry sink (onLlmCall) only captures token counts, cost, latency — NOT prompt text. debugLog() only logs model metadata. You need to add instrumentation.

## Step 1: Add debug instrumentation (temporary, behind DEBUG flag)

In packages/agents-ux/src/ux-research/ux-research.ts, after the prdRequirements are formatted into the prompt (around line 165), add:

```typescript
import { debugLog } from '@agentforge/core';

// After the pageContext construction (line 165):
debugLog(`[research] prdRequirements count: ${prdRequirements.length}`);
debugLog(`[research] prdRequirements[0] length: ${prdRequirements[0]?.length ?? 0} chars`);
debugLog(`[research] prdRequirements[0] preview: ${prdRequirements[0]?.substring(0, 500) ?? 'EMPTY'}`);
```

In packages/agents-ux/src/design-pipeline/pipeline.ts, in initState() after the prdRequirements derivation, add:

```typescript
import { debugLog } from '@agentforge/core';

debugLog(`[initState] enrichedRequirement present: ${!!input.enrichedRequirement}`);
debugLog(`[initState] prdRequirements source: ${input.prdRequirements ? 'explicit' : input.enrichedRequirement ? 'derived-from-enriched' : 'none'}`);
if (input.enrichedRequirement) {
  debugLog(`[initState] enrichedRequirement screens: ${input.enrichedRequirement.prd.screens.length}`);
  debugLog(`[initState] enrichedRequirement entities: ${input.enrichedRequirement.prd.dataEntities.length}`);
  debugLog(`[initState] enrichedRequirement features: ${input.enrichedRequirement.prd.features.length}`);
}
```

Run: nx run-many -t typecheck && nx run-many -t test
Both must pass. The debug logs are no-ops without DEBUG=1.

## Step 2: Build packages and start dashboard

```bash
nx run-many -t build
cd packages/dashboard && npm run dev
```

Wait for dashboard to be ready on localhost:3000.

## Step 3: Browser flow — Onboard a new app

Use Chrome DevTools MCP tools for all browser interaction.

3a. Navigate to http://localhost:3000/new
    - take_snapshot — verify the page loads, find the seed input field
    - take_screenshot — verify visual state

3b. Enter a project idea in the seed input:
    "Build a recipe sharing app where users can save, organize, and share recipes with friends. Include meal planning, shopping list generation, and nutritional info."
    - fill the seed input with the text above
    - click Submit / Start button
    - wait_for "question" or similar (Clarifier will generate questions)

3c. Complete the Clarifier flow:
    - take_snapshot — find the question/answer UI
    - Answer 2-3 questions (pick the recommended option each time)
    - wait_for the pipeline to complete (look for "Approve" button or completion indicator)
    - take_screenshot — capture the completed PRD view

3d. Click "Approve & Continue":
    - take_snapshot — find the Approve button
    - click the Approve button
    - wait_for navigation (should go to project page)
    - take_screenshot — verify you're on the project page

## Step 4: Verify disk artifacts

After approval, check the created project directory:

```bash
# Find the project slug
ls apps/

# Check enriched-requirement.yaml exists
cat apps/<slug>/agentforge/spec/enriched-requirement.yaml | head -30

# Check assumption-ledger.yaml exists
cat apps/<slug>/agentforge/spec/assumption-ledger.yaml | head -10

# Check docs/prd.md has structured sections (ADR-053 order)
head -40 apps/<slug>/docs/prd.md
# Should show: # Title, ## Screens, ## Data Entities, ## Personas, ## Features

# Check agentforge.yaml has clarifier.threadId
grep -A 2 'clarifier:' apps/<slug>/agentforge.yaml

# Check pages.yaml was created
cat apps/<slug>/agentforge/spec/pages.yaml | head -20
```

If any artifact is missing, STOP and report which one.

## Step 5: Generate design for one page with debug logging

```bash
# Run design:page with DEBUG=1 to see enrichment logs
DEBUG=1 npx tsx packages/cli/src/index.ts design:page dashboard \
  --project apps/<slug> 2>&1 | tee /tmp/m1-design-debug.log
```

While it runs, also watch it from the dashboard:
- navigate_page to the project's design page in the browser
- take_screenshot — verify the Activity sidebar shows progress (Research → Planning → Design)

After the CLI command completes:

```bash
# Check debug logs for enrichment evidence
grep '\[initState\]' /tmp/m1-design-debug.log
# MUST show:
#   [initState] enrichedRequirement present: true
#   [initState] prdRequirements source: derived-from-enriched
#   [initState] enrichedRequirement screens: N (where N > 0)
#   [initState] enrichedRequirement entities: N (where N > 0)

grep '\[research\]' /tmp/m1-design-debug.log
# MUST show:
#   [research] prdRequirements[0] length: NNN chars (should be 500+ chars, not <100)
#   [research] prdRequirements[0] preview: # Recipe... (should show structured markdown, not flat description)
```

## Step 6: Compare enriched vs flat (the acid test)

Run the SAME page WITHOUT enriched requirement to prove the difference:

```bash
# Temporarily rename the enriched requirement
mv apps/<slug>/agentforge/spec/enriched-requirement.yaml apps/<slug>/agentforge/spec/enriched-requirement.yaml.bak

# Run again — this time flat description only
DEBUG=1 npx tsx packages/cli/src/index.ts design:page dashboard \
  --project apps/<slug> --no-resume 2>&1 | tee /tmp/m1-flat-debug.log

# Restore
mv apps/<slug>/agentforge/spec/enriched-requirement.yaml.bak apps/<slug>/agentforge/spec/enriched-requirement.yaml
```

Compare:
```bash
grep '\[initState\]' /tmp/m1-flat-debug.log
# MUST show:
#   [initState] enrichedRequirement present: false
#   [initState] prdRequirements source: none (or explicit if prd.md loaded)

grep '\[research\] prdRequirements\[0\] length' /tmp/m1-design-debug.log /tmp/m1-flat-debug.log
# Enriched should be 5-10x longer than flat
```

## Step 7: Verify design output quality

```bash
# Check the generated design spec
cat apps/<slug>/.agentforge/previews/dashboard/scripts/designspec-v2.json | jq '.metadata' 2>/dev/null || echo "No design spec generated"
```

Open the prototype in browser:
- navigate_page to http://localhost:3000/design (or the project's design page)
- take_screenshot — verify the design rendered
- Look for entity-grounded elements (e.g., recipe cards with field names matching the PRD entities)

## Step 8: Cleanup debug instrumentation

Remove the debugLog calls added in Step 1 (or keep them if they're useful — they're no-ops without DEBUG=1).

Run: nx run-many -t typecheck && nx run-many -t test
Both must pass.

## Success criteria

All of these must be true:
1. Approve button works — creates project with disk artifacts
2. enriched-requirement.yaml exists with valid schema
3. docs/prd.md has structured sections in ADR-053 order
4. agentforge.yaml has clarifier.threadId
5. DEBUG logs show: enrichedRequirement present: true, source: derived-from-enriched
6. Research prompt receives 500+ char prdRequirements (not <100 char flat description)
7. Enriched prdRequirements is 5-10x longer than flat version
8. Design pipeline completes without errors
9. All tests still pass after cleanup

If any criterion fails, report which one and what the actual value was. Do not paper over failures.
```
