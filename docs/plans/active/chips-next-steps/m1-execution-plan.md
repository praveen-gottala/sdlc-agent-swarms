# M1 "Connect" Execution Plan — Thread Clarifier Output into Design Pipeline

## Context

M0 proved the Clarifier produces valid structured output (7 screens, 8 entities, 25 features on CashPulse). M1 threads that output into the design pipeline so that design generation receives structured PRD data instead of flat description strings.

The dashboard's pipeline-input-builder already threads `docs/prd.md` into `prdRequirements`; the CLI's design-page-all.ts and design-page-browser.ts pass only `[description]`. The real gap is that `prd.md` is unstructured markdown — the structured PRD's fields (entity names, NFR targets, persona goals) flatten to prose before reaching design. M1 closes this gap by treating the structured PRD as the single source for both `docs/prd.md` and `prdRequirements`, via one deterministic renderer.

This plan also subsumes the `integrating-clarifier` plan (approval flow, artifact persistence).

**Decisions baseline:** [m1-decisions.md](docs/plans/active/chips-next-steps/m1-decisions.md) (D1-D9). Not relitigated here.

**External dependency:** Dashboard Pipeline Fix (`import.meta.url` under webpack) must be resolved before dashboard route changes can be E2E tested. M1 phases are ordered so most work proceeds independently.

---

## Phase 1: Unified Factories (D4, D5)

**Goal:** Consolidate the two duplicate context factories and create a shared `buildPipelineInput()` in `@agentforge/agents-ux`. CLI and dashboard redirect to shared implementations. No behavioral changes.

### 1.1 Shared `createPipelineContext()` in agents-ux

Create `packages/agents-ux/src/design-pipeline/pipeline-context.ts`:

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

- Unifies CLI (`cli/src/utils/pipeline-context.ts:35-58`) and dashboard (`dashboard/api/_lib/pipeline-context.ts:19-35`)
- Differences resolved: CLI has optional `mcpClient` (now in opts), dashboard requires `projectRoot` (now required in opts), CLI defaults baseDir to `process.cwd()` (now explicit)
- Uses `createEventBus()`, `createRealFs()`, bypasses governance (same as both current factories)

### 1.2 Shared `buildPipelineInput()` in agents-ux

Create `packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts`:

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

- Encapsulates logic from dashboard `buildDashboardPipelineInput()` (`pipeline-input-builder.ts:71-137`) and CLI inline construction (`design-page-all.ts:395-417`)
- Uses `readYaml(filePath, fs): Result<T>` from `@agentforge/core`. This is signature-incompatible with the dashboard's local `readYamlFile(relativePath): T | null` — callers pass full paths via `join(projectRoot, ...)` and handle `Result` instead of null. `fs` comes from `opts.agentContext.fs`. The dashboard's local `readYamlFile`/`readTextFile` wrappers are removed
- Reuses existing `buildComponentCatalogPrompt()`, `buildPageContext()`, `resolvePageEntry()` already in agents-ux
- Returns `null` if page not found in `pages.yaml`

### 1.3 Redirect callers

- **Dashboard** `pipeline-context.ts`: body becomes `return createPipelineContext(opts)` delegation
- **Dashboard** `pipeline-input-builder.ts`: body becomes `return buildPipelineInput(opts)` delegation
- **CLI** `pipeline-context.ts`: agent context factory becomes delegation; I/O helpers (`ensureOutputDir`, `saveArtifact`, `loadArtifact`, `saveTextArtifact`, `deriveModuleId`) stay in place (CLI-specific)
- **CLI** `design-page-all.ts`: inline `PipelineInput` construction (lines 395-417) replaced with `buildPipelineInput()` call

### Files modified

| File | Change |
|------|--------|
| `packages/agents-ux/src/design-pipeline/pipeline-context.ts` | **NEW.** Shared `createPipelineContext(opts)` |
| `packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts` | **NEW.** Shared `buildPipelineInput(opts)` |
| `packages/agents-ux/src/design-pipeline/index.ts` | Export new functions + types |
| `packages/agents-ux/src/index.ts` | Re-export from design-pipeline barrel |
| `packages/dashboard/src/app/api/_lib/pipeline-context.ts` | Delegate to shared factory |
| `packages/dashboard/src/app/api/_lib/pipeline-input-builder.ts` | Delegate to shared builder |
| `packages/cli/src/utils/pipeline-context.ts` | Delegate agent context factory to shared |
| `packages/cli/src/commands/design-page-all.ts` | Replace inline PipelineInput construction with `buildPipelineInput()` |

### Verification

- `nx run-many -t typecheck` — clean
- `nx run-many -t test` — all pass (no behavioral changes)
- New unit test: `packages/agents-ux/src/design-pipeline/__tests__/pipeline-context.test.ts` — verify AgentContext creation with/without mcpClient, with/without providerFactory (Err path)
- New unit test: `packages/agents-ux/src/design-pipeline/__tests__/pipeline-input-builder.test.ts` — verify PipelineInput construction from temp fixture dir with `pages.yaml` + `design-tokens.yaml`
- Grep: no remaining callers of the old factory signatures except thin delegating wrappers

### Risk

Medium. The shared builder must handle both dashboard (implicit `getActiveProjectRoot()`) and CLI (explicit path) patterns. The shared function takes `projectRoot` explicitly — dashboard callers pass it from `getActiveProjectRoot()`.

---

## Phase 2: Data-Driven StageDescriptor (D9)

**Goal:** Replace hardcoded `STAGE_INDEX` / `VISIBLE_STAGE_COUNT` / `HIDDEN_STAGES` in `DashboardSseSink` with a data-driven `StageDescriptor[]` parameter. No behavioral change — defaults to current 3-stage map.

### Changes

Add `StageDescriptor` type:
```typescript
export interface StageDescriptor {
  readonly name: string;
  readonly visibleIndex: number;
  readonly hidden: boolean;
}
```

Add optional `stages?: StageDescriptor[]` to `DashboardSseSink` constructor. When absent, default to:
```typescript
export const DESIGN_PIPELINE_STAGES: StageDescriptor[] = [
  { name: 'research', visibleIndex: 0, hidden: false },
  { name: 'planning', visibleIndex: 1, hidden: false },
  { name: 'design', visibleIndex: 2, hidden: false },
  { name: 'evaluator', visibleIndex: -1, hidden: true },
];
```

Derive `STAGE_INDEX`, `VISIBLE_STAGE_COUNT`, `HIDDEN_STAGES` from the descriptor array in the constructor.

### Files modified

| File | Change |
|------|--------|
| `packages/dashboard/src/app/api/_lib/dashboard-sink.ts` | Add `StageDescriptor`, constructor parameter, derive from descriptors |

### Verification

- `nx run dashboard:test` — existing sink tests pass unchanged
- New test: construct sink with custom 5-stage descriptor, verify correct `visibleIndex` and `VISIBLE_STAGE_COUNT`
- `nx run-many -t typecheck` — clean

### Risk

Low. Purely additive; default parameter preserves all existing behavior.

**Dependencies:** None. Can run in parallel with Phase 1.

---

## Phase 3: Dashboard All-Pages Loop (D6)

**Goal:** Dashboard's `generate-all/route.ts` currently delegates to CLI's `designPageAllCommand()` with a no-op Writable sink — zero telemetry, zero SSE, zero run tracking. Give the dashboard its own loop with `DashboardSseSink` and run tracking.

### 3.1 Extract `runPagesWithChromePass()` shared helper

Create `packages/agents-ux/src/design-pipeline/run-pages.ts`:

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

Encapsulates the Chrome Pass → sequential per-page pipeline loop currently inlined in `design-page-all.ts:301-471`. The helper:
- Calls `resolveSharedComponents(pages)` for Chrome Pass reference page selection
- Runs Chrome Pass generation pipeline if needed
- Iterates pages sequentially with `chromePass: { mode: 'consume' }` for each
- Delegates input construction to `opts.buildInput()` callback
- Does NOT include CLI formatting, Langfuse init, correction pipeline, or prototype manifest building — those stay in callers

### 3.2 Rewrite dashboard generate-all route

`packages/dashboard/src/app/api/design/generate-all/route.ts`:
- Create `DashboardSseSink` per page (using `StageDescriptor` from Phase 2)
- Use `startRun` / `completeRun` / `failRun` from `run-manager`
- Call `runPagesWithChromePass()` with its own sink factory via `buildInput` callback
- Write design specs and update page statuses

### 3.3 Redirect CLI's design-page-all

`design-page-all.ts`: refactor Chrome Pass + per-page loop (lines 301-471) to call `runPagesWithChromePass()`. CLI keeps Langfuse init, correction pipeline, prototype manifest building, and formatting.

### Files modified

| File | Change |
|------|--------|
| `packages/agents-ux/src/design-pipeline/run-pages.ts` | **NEW.** Shared `runPagesWithChromePass()` |
| `packages/agents-ux/src/design-pipeline/index.ts` | Export new helper |
| `packages/dashboard/src/app/api/design/generate-all/route.ts` | Rewrite: own loop, DashboardSseSink, run tracking |
| `packages/cli/src/commands/design-page-all.ts` | Refactor to use `runPagesWithChromePass()` |

### Verification

- `nx run-many -t typecheck` — clean
- `nx run-many -t test` — all pass
- New test: `packages/agents-ux/src/design-pipeline/__tests__/run-pages.test.ts` — verify Chrome Pass → per-page loop with mock pipeline, verify callbacks called per page
- Dashboard route E2E: **blocked by Dashboard Pipeline Fix** — code and unit test, but defer E2E validation

### Risk

High. Largest refactor in M1. Chrome Pass logic (`design-page-all.ts:301-370`) is non-trivial. Must preserve:
- `resolveSharedComponents()` and reference page selection
- Chrome spec generation, file write, and propagation
- Sequential ordering guarantee (vision Layer 7)
- Correction pipeline stays in CLI caller (not extracted)

**Dependencies:** Phase 1 (uses shared `buildPipelineInput()` and `createPipelineContext()`), Phase 2 (uses `StageDescriptor` for dashboard sink).

---

## Phase 4: PipelineInput Extension (D8)

**Goal:** Add optional `enrichedRequirement` field to `PipelineInput` and `DesignPhaseState`. When present and `prdRequirements` is not explicitly set, auto-populate `prdRequirements` from the structured PRD.

### Changes

1. Add to `PipelineInput` interface (types.ts:68):
   ```typescript
   readonly enrichedRequirement?: EnrichedRequirement;
   ```

2. Add to `DesignPhaseState` interface (types.ts:110):
   ```typescript
   readonly enrichedRequirement?: EnrichedRequirement;
   ```

3. In `pipeline.ts` `initState()` (line 44), propagate `enrichedRequirement` and implement compat fallback:
   ```typescript
   // If enrichedRequirement provided but prdRequirements not explicitly set,
   // derive prdRequirements from the structured PRD
   const prdRequirements = input.prdRequirements ??
     (input.enrichedRequirement ? [renderPrdToMarkdown(input.enrichedRequirement.prd)] : undefined);
   ```
   See ADR-053. The renderer is the single source of truth for the markdown form of a PRD and is also used by `createProject` to write `docs/prd.md`. No separate derivation function exists.

4. Import `EnrichedRequirement` type from `@agentforge/core`.

### Files modified

| File | Change |
|------|--------|
| `packages/agents-ux/src/design-pipeline/types.ts` | Add `enrichedRequirement` to both interfaces |
| `packages/agents-ux/src/design-pipeline/pipeline.ts` | Propagate in `initState()`, add compat fallback |

### Verification

- `nx run-many -t typecheck` — clean (field is optional, all existing callers valid)
- `nx run-many -t test` — all pass (field absent = old behavior)
- New test: verify `renderPrdToMarkdown()` is used as compat fallback
- New test: verify precedence — explicit `prdRequirements` wins over derived

### Risk

Low. Purely additive optional field. Compat fallback has clear precedence rule.

**Dependencies:** None structurally (interface extension is additive). Logically follows Phase 1 since `buildPipelineInput()` may contribute to the fallback.

---

## Phase 5: Clarifier Approval Flow (D2, D3, D7)

**Goal:** Wire "Approve & Continue" on `/new` page. On approval: extend `CreateProjectSchema` with `clarifierOutput` wrapper (D3), write `enriched-requirement.yaml` to disk (D2), save `threadId` to project config (D7).

**Subsumes:** `docs/plans/active/integrating-clarifier/execution-plan.md` — all three open decisions resolved by M1 decisions.

### 5.0 Frontend type widening

Prerequisite to Phase 5.4. The dashboard's `ClarifierState.requirement` type is currently `{ prd: Record<string, unknown>; confidence: number } | null` — missing fields the wire payload already carries. Widen to:
- `ClarifierState.requirement: EnrichedRequirement | null`
- `ClarifierState.assumptions: AssumptionLedger | null`

(both imported from `@agentforge/core`). Re-validate at the `createProject` boundary via `EnrichedRequirementSchema.parse(...)` since the wire payload is JSON.

### 5.1 CreateProjectSchema extension (D3)

In `project-creation.ts`, add to schema:
```typescript
clarifierOutput: z.object({
  enrichedRequirement: EnrichedRequirementSchema,
  threadId: z.string(),
}).optional(),
```

### 5.2 Artifact persistence in `createProject()` (D2)

When `clarifierOutput` is present in `createProject`:
1. Render the markdown via `renderPrdToMarkdown(enrichedRequirement.prd)` BEFORE calling `scaffoldProject`, and pass the result as `prdContent`. Do not write `docs/prd.md` separately — scaffold handles it.
2. AFTER `scaffoldProject` succeeds, write:
   - `agentforge/spec/enriched-requirement.yaml` (the full `EnrichedRequirement`)
   - `agentforge/spec/assumption-ledger.yaml` (derived from `enrichedRequirement.assumptionLedger`)
   Both via `writeYaml` from `@agentforge/core`.

### 5.3 ThreadId persistence (D7)

Inject `clarifier: { threadId, lastRunAt }` into `projectConfig` BEFORE passing to `scaffoldProject`. No post-scaffold rewrite of `agentforge.yaml`. Stored for M2 LangGraph continuity; not consumed in M1.

### 5.4 Frontend approval handler

In `packages/dashboard/src/app/(dashboard)/new/page.tsx`, replace `onApprove={() => {}}` with:
- Extract `enrichedRequirement`, `assumptionLedger`, `threadId` from Clarifier's completed state
- Call `POST /api/projects` with `clarifierOutput` wrapper
- Navigate to project page on success
- Show error toast on failure

### Files modified

| File | Change |
|------|--------|
| `packages/dashboard/src/app/api/_lib/project-creation.ts` | Add `clarifierOutput` to schema, write artifacts in `createProject()` |
| `packages/dashboard/src/app/(dashboard)/new/page.tsx` | Wire `handleApprove` with `clarifierOutput` payload |

### Verification

- `nx run-many -t typecheck` — clean
- `nx run dashboard:test` — existing project creation tests pass (field optional)
- New test: `project-creation-clarifier.test.ts` — verify disk artifacts written when `clarifierOutput` present, verify backward compat when absent
- New test: `render-prd-markdown.test.ts` — verify markdown output from CashPulse PRD structure

### Risk

Medium. The `renderPrdToMarkdown()` function must produce markdown rich enough for research/planning agents but must not break their expectations. Test with CashPulse PRD data to validate.

**Dependencies:** None structurally, but Phase 6 consumes the disk artifacts this phase writes.

---

## Phase 6: Clarifier→Design Bridge (D7)

**Goal:** `buildPipelineInput()` (Phase 1) reads `enriched-requirement.yaml` from disk when present and passes it as `enrichedRequirement` on `PipelineInput` (Phase 4). This is the actual "Connect."

### Changes

In the shared `buildPipelineInput()`, add:
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

When `enrichedRequirement` is defined, `buildPipelineInput` leaves `prdRequirements` undefined so `initState()` derives it via `renderPrdToMarkdown`. When absent, fall back to `[description, ...(prdContent ? [prdContent] : [])]`.

### Files modified

| File | Change |
|------|--------|
| `packages/agents-ux/src/design-pipeline/pipeline-input-builder.ts` | Add enriched-requirement.yaml read + schema validation |

### Verification

- `nx run-many -t typecheck` — clean
- `nx run-many -t test` — all pass
- Updated builder test: verify `enrichedRequirement` present when YAML exists, absent when missing, absent when schema invalid (graceful degradation)

### Risk

Low. Reading YAML + Zod validation is established pattern. Graceful degradation (missing file = old behavior) eliminates regression risk.

**Dependencies:** Phase 1 (shared builder), Phase 4 (`enrichedRequirement` field), Phase 5 (disk artifacts).

---

## Phase 7: Integration Test — Clarifier→Design on CashPulse

**Goal:** End-to-end test verifying the full M1 data path: CashPulse enriched requirement on disk → `buildPipelineInput()` reads it → `PipelineInput.enrichedRequirement` populated → `prdRequirements` contains structured PRD content.

### Changes

1. Create CashPulse M1 fixture at `packages/agents-ux/__tests__/fixtures/cashpulse-m1/`:
   - `agentforge.yaml` with `clarifier.threadId`
   - `agentforge/spec/enriched-requirement.yaml` (from M0 CashPulse run)
   - `agentforge/spec/assumption-ledger.yaml`
   - `agentforge/spec/pages.yaml` (CashPulse pages)
   - `agentforge/spec/design-tokens.yaml`
   - `docs/prd.md`

2. Integration test at `packages/agents-ux/__tests__/m1-connect.integration.test.ts`:
   - Call `buildPipelineInput()` with CashPulse fixture
   - Assert `enrichedRequirement` present with correct screen count
   - Assert byte-exact equality: `state.prdRequirements?.[0] === renderPrdToMarkdown(cashPulseEnriched.prd)`. Deterministic check — no fuzzy "richer than flat description" comparison.
   - Assert `enrichedRequirement.confidence` is valid number
   - Smoke: call `initState()` (pipeline.ts:44) and verify `enrichedRequirement` threads through to state

### Files modified

| File | Change |
|------|--------|
| `packages/agents-ux/__tests__/fixtures/cashpulse-m1/` | **NEW.** CashPulse fixture with all spec files |
| `packages/agents-ux/__tests__/m1-connect.integration.test.ts` | **NEW.** Integration test |

### Verification

- `nx run agents-ux:test` — new test passes
- `nx run-many -t test` — all pass

### Risk

Low. Test-only phase. CashPulse data available from M0 run.

**Dependencies:** Phase 1, Phase 4, Phase 5, Phase 6.

---

## Phase 8: Documentation + Plan Cleanup

**Goal:** Update architectural docs, subsume integrating-clarifier plan, update execution plan status.

### Changes

1. **`docs/architecture/design-pipeline-dataflow.md`** — Add "Enriched Requirement Ingestion" section: file location, schema, `buildPipelineInput()` read path, `prdRequirements` auto-population
2. **`docs/vision.md` Layer 4** — Note M1 completion: `EnrichedRequirement` flows disk-based from Clarifier to Design, `threadId` preserved for M2
3. **`docs/plans/active/integrating-clarifier/execution-plan.md`** — Mark SUPERSEDED by M1. Open decisions resolved:
   - Q1 (PRD format): YAML in `enriched-requirement.yaml` + markdown in `docs/prd.md`
   - Q2 (Auto-trigger): Manual initiation from project page
   - Q3 (Project home): Not changed in M1
4. **`docs/plans/active/chips-next-steps/execution-plan.md`** — Update M1 status from outline to COMPLETE, update CLAUDE.md current state

### Files modified

| File | Change |
|------|--------|
| `docs/architecture/design-pipeline-dataflow.md` | Add enriched requirement section |
| `docs/vision.md` | Update Layer 4 |
| `docs/plans/active/integrating-clarifier/execution-plan.md` | Mark SUPERSEDED |
| `docs/plans/active/chips-next-steps/execution-plan.md` | Update M1 status |
| `CLAUDE.md` | Update Active Plans section |

### Verification

- All docs reference correct file paths and interface names
- `nx run-many -t typecheck && nx run-many -t test` — still clean

**Dependencies:** All prior phases complete.

---

## Dependency Graph

```
Phase 1 (Unified Factories) ──┬──→ Phase 3 (Dashboard All-Pages) ──┐
                               │                                     │
                               ├──→ Phase 4 (PipelineInput) ────────┤
                               │                                     │
Phase 2 (StageDescriptor) ─────┤                                     ├──→ Phase 6 (Bridge) → Phase 7 (Tests) → Phase 8 (Docs)
                               │                                     │
Phase 5 (Approval Flow) ───────┴─────────────────────────────────────┘
```

**Parallelizable:** Phase 1 and Phase 2. Phase 4 and Phase 5 (after Phase 1).

**Critical path:** Phase 1 → Phase 4 → Phase 6 → Phase 7 → Phase 8

**E2E-blocked:** Phase 3's dashboard route rewrite (depends on Dashboard Pipeline Fix). Code and unit test, defer E2E.

---

## Migration Invariant

At every phase boundary:
```bash
nx run-many -t typecheck && nx run-many -t test
```

Additionally:
- Phase 1: CLI `design:page:all` integration tests still pass
- Phase 3: CLI behavior unchanged; dashboard route E2E-blocked
- Phase 5: `POST /api/projects` without `clarifierOutput` still creates projects correctly

---

## What M1 Does NOT Touch

- **R8 (Multi-screen coordination):** Chrome Pass stays as-is
- **LLM prompts:** No changes — M1 is purely wiring
- **FeaturePlan:** Deferred to M2 (D1)
- **Stage renaming:** Research/planning names stay (deferred)
- **ThreadId as data retrieval:** Saved to config but not used for checkpointer lookup (D7)

---

## Key Files Reference

| File | Role in M1 |
|------|-----------|
| `packages/agents-ux/src/design-pipeline/types.ts` | `PipelineInput` + `DesignPhaseState` get `enrichedRequirement` field |
| `packages/agents-ux/src/design-pipeline/pipeline.ts` | `initState()` propagates enrichedRequirement, derives prdRequirements |
| `packages/dashboard/src/app/api/_lib/project-creation.ts` | `CreateProjectSchema` gets `clarifierOutput` wrapper, writes artifacts |
| `packages/dashboard/src/app/api/_lib/dashboard-sink.ts` | Data-driven `StageDescriptor` replaces hardcoded stage indices |
| `packages/dashboard/src/app/api/design/generate-all/route.ts` | Dashboard all-pages loop replaces CLI delegation |
| `packages/dashboard/src/app/(dashboard)/new/page.tsx` | "Approve & Continue" handler wired |
| `packages/core/src/types/cross-boundary-artifacts.schemas.ts` | `EnrichedRequirementSchema` — source of truth |
| `packages/cli/src/commands/design-page-all.ts` | Refactored to use shared `runPagesWithChromePass()` |
| `packages/cli/src/utils/pipeline-context.ts` | Delegates to shared factory |

---

## Eval Gate (from execution-plan.md)

M1 eval: verify that threading `EnrichedRequirement` produces equivalent or better DesignSpec output.
- Run `design:page` on CashPulse fixture with and without `enrichedRequirement`
- Diff the two DesignSpec outputs — document differences
- Existing design pipeline tests must pass unchanged
