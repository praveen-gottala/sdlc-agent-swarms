# AgentForge

Multi-agent framework for end-to-end SDLC orchestration.

**Shared tooling:** See **`AGENTS.md`** for how this file fits with Cursor rules and episodic handoff docs (so the same practices apply in both tools).

---

## Reading order (IMPORTANT)

Before making any architectural decision, read in this order:

1. **`docs/vision.md`** — the architectural vision. Covers 15 layers with locked and open decisions, current-vs-target explicit for every layer. **When this document and the current codebase disagree, the vision wins.** When this document and `docs/specs/PRD.md` disagree on architecture, the vision wins.
2. **`docs/specs/PRD.md`** — the product spec. Source of truth for product scope, interfaces, API contracts, enum values, field lists. Do NOT treat the PRD as authoritative on architectural _patterns_ — those are in the vision.
3. **This file (`CLAUDE.md`)** — the development discipline rules. Always in force.
4. **`docs/lessons-learned-rules.md`** — Active rules only (~400 lines). For historical RESOLVED entries, see `docs/lessons-learned.md`.
5. **`docs/adrs/`** — decision records that may amend or supersede sections of the PRD.

If these sources conflict, the hierarchy is: `CLAUDE.md` security/test rules → `vision.md` (architecture) → ADRs (specific deviations) → `PRD.md` (product) → codebase state (legacy).

## Current State

Active: design pipeline (packages/agents-ux/, packages/designspec-renderer/)
Execution pipeline: not implemented yet.
Paused: Pipeline Plan 1 (bridge design→impl), Pipeline Plan 2 (unify runner)
Not started: spec/code/cicd/observe phases, V3 Dashboard
Decided: `@langchain/langgraph` (TypeScript) is the sole orchestration runtime. Python engine deprecated. See ADR-043.

**Plans:** `docs/plans/active/` (active), `docs/plans/backlog/` (paused/backlog), `docs/plans/completed/` (done)

**Active plans (read these during session-start):**

1. Visual Diversity — Phase 1-2, 4 COMPLETE. Prerequisite COMPLETE. Phase 3 (3.1-3.8) COMPLETE. Phase 3.7 COMPLETE (evaluator calibration, catalog bridge, docs, pipeline verification). Phase 3.8 COMPLETE (progressive evaluator, correction parity, pipeline verification). Next: Phase 5 (Domain + Effects Foundation). Roadmap: `docs/plans/active/visual-diversity/design-quality-vision.md`. Execution: `docs/plans/active/visual-diversity/execution-plan.md`
2. CHIP's Next Steps — M0 COMPLETE (2026-05-04), M1 COMPLETE (2026-05-14). M1: shared `buildPipelineInput()` + `createPipelineContext()` factories, data-driven `StageDescriptor`, dashboard all-pages loop with `runPagesWithChromePass()`, `enrichedRequirement` field on `PipelineInput`/`DesignPhaseState`, Clarifier approval flow writing artifacts to disk, Clarifier→Design bridge reading `enriched-requirement.yaml`. 3 integration tests (CashPulse fixture). Cross-screen coherence deferred (vision L7). `integrating-clarifier` plan SUPERSEDED. Next: M2 (Architect Foundation) — 4 phases: R4 ADR, typed contracts (ConstraintSet/OptionsBundle/ArchitectureSpec/TaskPlan/ContractBundle + scope-conditional types), standalone Critic (9 deterministic gates), eval harness (3 golden bundles, generic MetricDefinition<T>). Child plan: `docs/plans/active/chips-next-steps/m2-execution-plan.md`. See `docs/plans/active/chips-next-steps/execution-plan.md`
3. Dashboard Pipeline Fix — Planning stage fails from dashboard but works from CLI. Root cause confirmed: `import.meta.url` under webpack. Partial fix: `serverExternalPackages` for agents-clarifier. Full fix for agents-ux pending. See `docs/plans/active/dashboard-pipeline-fix/execution-plan.md`
4. CHIP UX Overhaul — Rebrand from AgentForge to CHIP (Crafted Human Intelligence Platform). Phase 1 COMPLETE (2026-04-28). Phase 2 COMPLETE (2026-04-29, committed `ca5df49`). Phase 4.1 COMPLETE (2026-04-29, committed `ae0e8ba`): Home page redesigned as state-aware landing pad. Phase 4.0 COMPLETE (2026-04-29): Pipeline → Runs page redesigned with 4-stage spine, run history table, emergency controls, shared SpineRail extraction, ADR-050 (vision deviations). Next: Phase 4.2+ (remaining pages per priority order). See `docs/plans/active/chip-ux-overhaul/execution-plan.md`
5. Focused Deep Audit — Enhance Deep Audit (Vision) to support node-scoped inspection. When a selected container has ≤N children, the audit passes nodeId to the API, loads research brief + planning spec for upstream intent, highlights the container in the screenshot, and sends focused context to the vision LLM. Phase 1 (wire selectedNode) next. See `docs/plans/active/focused-deep-audit/execution-plan.md`
6. Backstage Improvements — Doc quality improvements driven by `/backstage review` audits. Child Plan 1: concepts overview COMPLETE (2026-05-04): opener rewritten (competitor-swap), "How it works" promoted first, defensive title → strength statement, EVPI/ClarifyGPT jargon removed (D2), HITL slimmed to paragraph + link (D11 verified), "Current implementation" → 4-sentence "Current state", B3 citation added to current-status.md. Child Plan 2: agent taxonomy COMPLETE (2026-05-04): phantom predecessor → collapsible historical context, node count 6→9 (D2/D3 taxonomy level + link), mental model paragraph, planned admonitions, D1 diagram legend, Current implementation + Known limitations added. Child Plan 3: research report COMPLETE (2026-05-04): brand rename, voice rewrite, 2 Mermaid diagrams, gap analysis update, admonitions, Part 4.5 absorbed, D4 cascade to clarifier-pipeline.md. Child Plan 4: clarifier pipeline COMPLETE (2026-05-04): page restructured, diagram updated 6→9 nodes, 3 new node descriptions, stale limitation qualified, D3 downstream fix. Child Plan 5: coordination & state COMPLETE (2026-05-04): opener rewritten, Clarifier topology diagram replaced with generic channels pattern, Components 8→9 nodes, negative framing reduced, D13 crosslink added. Child Plan 6: architecture COMPLETE (2026-05-04): full rewrite — 4-stage spine, 19 packages, ADR-044–051, telemetry reframing (D8), 6 cross-references, planned admonitions. Child Plan 7: sdlc-agents spec COMPLETE (2026-05-04): brand rename AgentForge→CHIP (9 occurrences), 5-agent table → Implementer workflow, LLM routing haiku→sonnet for Code review, 11.3.3 workflow rewrite (single-threaded), 3 planned admonitions (11.4/11.5/12), Phase B historical collapsible, supersession note clarified, blockquote count fixed. Child Plan 8: hitl-governance COMPLETE (2026-05-04): opener rewritten (mental model first), gate-focused diagram (neutral fills, D1/D11), gate table aligned with vision.md + Gate 1.5 footnote + spine-impl discrepancy note, brand fixed, LangGraph mechanics in collapsible (D10), ADR-004 admonition, Known Limitations (4 items), Related docs expanded (8 links). Child Plan 9: design-pipeline COMPLETE (2026-05-04): opener rewritten (purpose-first), mental model paragraph, Spine Integration section with 4→2 table (D12), Three-Layer diagram + Spine Implementer caller, cross-screen restructured (positive framing), evaluator reasoning, schema constraint admonition, neutral fills (D1), spine-impl §4 linked. Child Plan 10: state-persistence COMPLETE (2026-05-04): opener rewritten (CHIP-specific three-tier), "Why CHIP does this" added, diagram redesigned (spine stages → tiers), duplicate Mermaid fixed, jargon defined, spine stage → tier mapping, deprecated marking, silent fallback admonition, D2/D13 crosslinks. Child Plan 11: observability COMPLETE (2026-05-04): env var fixed (LANGFUSE_HOST→LANGFUSE_BASE_URL), opening strengthened, "Why CHIP does this" added (ADR-052), diagram labels logical + D1 legend, Components table (4 rows), "Not built" → Known limitations (3 items, positive framing). Child Plan 12: rag-context (7 findings: jargon without grounding, generic citations not hyperlinked, duplicate Mermaid source, aspirational precision@5 "gate" claim). Child Plan 13: dashboard-architecture COMPLETE (2026-05-04): route count fixed (67→63), UI subgraph arrows removed (flat nodes), "Current implementation" removed (Recharts→Components table), sidebar label fixed ("Observability"), /audit+/traces nav note added, full hook paths. Child Plan 14: clarifier-question-generation COMPLETE (2026-05-04): fabricated blockquote removed (synthesis rewrite), D3 verified (Plan 4), EVPI+jargon grounded, defensive framing removed, Why CHIP does this added, competitor table 6→8 tools, Components table (6 rows), `!!!`→`???` collapsed questions, implications explained, pattern depth balanced, Known limitations (3 items), Let CHIP decide clarified (existing vs planned). Child Plan 15: vision-overview COMPLETE (2026-05-04): Single Invariant relocated after Spine (earned concept), test count removed (stale+banned), Locked Decisions table removed (26-row duplication→Open Decisions only), diagram legend added, length 297→261. Child Plan 16: architecture-readme (7 findings: generic competitor-swap failure, no architectural framing, no reading guidance, misleading nav position, underpowered vs peers, missing cross-section link, stale content categories). Cross-plan decisions D1-D15 (D1 addendum: status-encoding fills exempt; D14: README.md promoted to Architecture nav position 1 as section gateway; D15: three-way scope boundary spine-pattern/architecture/spine-implementation). Child Plan 17: spine-pattern-review COMPLETE (2026-05-04): CHIP status admonitions for unbuilt stages, D1 diagram legends, D15 scope boundary, Documentation Generator in Diagram 2, Related expanded (4→9 links). All 17 child plans from Batches 1-4 COMPLETE. Child Plan 18: spine-implementation-review COMPLETE (2026-05-04): D1 legends for 5 diagrams, D12 backlink, stale docs section updated, D15 reciprocal scope, Related expanded. Child Plan 19: design-decisions COMPLETE (2026-05-04): brand fix, 6 See-also cross-refs, Known Limitations added. Child Plan 20: agent-contracts COMPLETE (2026-05-04): deprecation admonition (rejected 10-agent model), scope clarification, historical warning on unbuilt agents, Known Limitations + Related added. Child Plan 21: design-pipeline-dataflow COMPLETE (2026-05-04): brand fix (file paths verified correct). Batch 4 (P0 Architecture Core) fully reviewed AND executed — all 5 entries done. 42 entries remain in pending-files-to-review.md (Batches 5-12). See `docs/plans/active/backstage-improvements/execution-plan.md`
7. ChatPRD Split Panel — Subplan of CHIP UX Overhaul Phase 3. Phases 1-7 COMPLETE. Phase 8 (visual polish) NOT STARTED. See `docs/plans/active/chatprd-split-panel/execution-plan.md`
8. Clarifier E2E Browser Test — Phase 1 (resume fix) COMPLETE, Phase 2 (E2E tests, 9 passing) COMPLETE. Phases 3-4 (recording cassettes, eval harness verification) remaining. See `docs/plans/active/clarifier-e2e-browser-test/execution-plan.md`
9. Clarifier Self-Correction — Phases 1-3 COMPLETE (2026-05-02). Phase 4 (self-correction pipeline: evaluator + challenger LLM) next. Phase 5 (verification) after. See `docs/plans/active/clarifier-self-correction/execution-plan.md`
    **Backlog plans (do NOT read during session-start — note status only):**

- Screen Types Plan B — B0-B2.7 complete, B3 next. Paused for visual diversity. See `docs/plans/backlog/screen-types-plan-b.md`
- Docs Tutorials — Phase 5 of Docs Reorganization (3 tutorial/guide pages). See `docs/plans/backlog/docs-tutorials.md`
- Clarifier Streaming — Research COMPLETE, 0/4 implementation phases started. See `docs/plans/active/clarifier-streaming/execution-plan.md`
- Eval Documentation — 5 doc pages planned, 0/5 started. See `docs/plans/active/eval-documentation/execution-plan.md`

**Completed plans (do NOT read during session-start):**

- Integrating Clarifier — SUPERSEDED by M1 Connect (2026-05-14). All open decisions resolved: YAML + markdown PRD format, manual next-stage initiation, project home unchanged. See `docs/plans/completed/integrating-clarifier/execution-plan.md`
- Clarifier Initiative — Phase 0, Phase 2 (RAG), Phase 1 Tasks 1.0-1.7 ALL COMPLETE (2026-04-28). 9-node LangGraph StateGraph, 186 tests. Task 1.8 (dashboard UX) owned by CHIP UX Overhaul Phase 3. Forward-looking items (FB1-FB4) merged into CHIP's Next Steps. See `docs/plans/completed/clarifier-initiative/execution-plan.md`
- Observability — Phases 1-4 COMPLETE (incl. 4.1-4.3 extended tracing). Phase 5 (evaluation infrastructure) deferred. See `docs/plans/completed/observability/execution-plan.md`
- Clarifier Resume Approve — Phase 1 COMPLETE (2026-05-02): barrel export fix, routing tests, checkpointer singleton tests, prd-draft event test. Phase 2 extracted to Integrating Clarifier plan. See `docs/plans/completed/clarifier-resume-approve/execution-plan.md`
- Docs Reorganization — Phases 1-4, 6, 7 COMPLETE (2026-04-30). Phase 5 moved to backlog. See `docs/plans/completed/docs-reorganization.md`
- Unify Design Pipeline — Phase 0-5 COMPLETE (2026-04-26). See `docs/plans/completed/unify-pipeline/execution-plan.md`
- Screen Types Plan A — COMPLETE (A1-A6 done, 2026-04-22). See `docs/plans/completed/screen-types-plan-a.md`

**Last session (2026-05-14):** M1 acceptance test COMPLETE. Browser-verified end-to-end: Clarifier → Approve → Design Studio → Generate design → rendered page. 6 bugs found and fixed: (1) post-approval navigation to wrong page, (2) CLI design:page didn't load enriched-requirement.yaml (14 chars → 15,201 chars), (3) pages.yaml empty after approval — now derived from PRD screens, (4) Quick Generate removed from modal, (5) 429 error message preserved in provider, (6) user model selection respected by pipeline stages. Langfuse telemetry gap documented (Research/Planning LLM calls not traced). Dashboard pipeline confirmed working — prior "import.meta.url" diagnosis was incorrect, actual blocker was Opus 4.7 token quota on Vertex AI. `integrating-clarifier` plan moved to `docs/plans/completed/`.

Orchestration authority: resolved (ADR-043). `@langchain/langgraph` (TypeScript) is the
sole runtime. `services/engine/` (Python) is deprecated and scheduled for deletion after
ADR-043 migration Phase M-4. Do not extend the Python engine or the legacy imperative
`runAgent()` path for new phase work.

## Browser-First Debugging (HIGHEST PRIORITY)

When the user reports a UI issue, is stuck, or something "isn't working":

1. **Use browser tools first.** Launch the dev server (`npx next dev --port 3000`),
   navigate to the relevant page using Chrome DevTools MCP (`navigate_page`,
   `take_screenshot`, `take_snapshot`, `click`), and visually verify the state.
2. Do NOT guess or theorize — open the page, take a screenshot, inspect the DOM.
3. Use `take_snapshot` to get the a11y tree for clickable elements, then `click`
   to interact and reproduce the issue.
4. After making code changes, reload the page and screenshot again to confirm the fix.
5. This applies to all dashboard/UI work in `packages/dashboard/`.

## Development Rules (PRD + Vision Compliance)

These rules are non-negotiable. They apply to every implementation task, bug fix,
and test written in this project.

### Full Ownership of All Tests

- Every agent MUST run the FULL test suite and fix ALL failures — not just tests
  "related to" the change. No such thing as a "pre-existing" failure.
- There is no "unrelated" failure: if a required check (`typecheck`, `test`, or
  applicable E2E) is red, fix it before declaring done. Do not excuse failures as
  unrelated to the change, outside the diff, or pre-existing unless a human
  explicitly waives that failure for this task.
- Run `nx run-many -t typecheck`, `nx run-many -t test`, and `nx run-many -t lint`
  after every change. Do not declare done until all three pass with zero failures.
- When changes touch dashboard UI, API routes, or E2E-covered functionality
  (pages under `packages/dashboard/`, `e2e/`), also run Playwright E2E tests:
  `npx playwright test` (from monorepo root). All E2E tests must pass before
  declaring done. The dashboard auto-starts the design renderer — Playwright
  config only starts the Next.js server.

### PRD is Source of Truth (for product)

- PRD (`docs/specs/PRD.md`) defines product scope, interfaces, API contracts, enums,
  field lists. TypeScript interfaces in `packages/core/src/types/` are authoritative
  for field-level truth (ADR-038). When PRD and code diverge on field-level details,
  code wins and PRD is updated.
- Do NOT treat the PRD as authoritative on architectural _patterns_. Those are in
  the vision document.
- Do not hardcode values the PRD defines as configurable.

### Vision is Source of Truth (for architecture)

- `docs/vision.md` is the authority on architectural patterns: orchestration runtime,
  coordination substrate, agent taxonomy, state persistence, clarifier structure,
  RAG, implementation patterns, review patterns, HITL gates, observability,
  sandboxing.
- When the PRD prescribes an architectural pattern that conflicts with the vision
  (e.g., PRD Section 24.2 prescribes "frontend + backend + tests in parallel";
  vision Layer 8 mandates single-threaded implementer), the vision wins. Write an
  ADR documenting the deviation.
- When the current codebase implements a pattern that conflicts with the vision
  (e.g., event bus as coordination substrate; vision Layer 2 mandates typed
  channels), the vision wins. Do not replicate the legacy pattern in new code.
  Add a TODO linking to the vision layer. If migration is in flight, follow the
  target pattern in new code.

### Interface Completeness

- Include ALL fields from the TypeScript interface in `packages/core/src/types/`.
  The TypeScript interface is authoritative — not the PRD description. See ADR-038.

### Enum Coverage

- Every enum member must have a working implementation, even if minimal.
  Returning 400/404 for a defined enum value is a spec violation.

### Testing Integrity

- Tests must exercise the real server/API codepath, not internal functions.
  Never work around a server bug by calling internal methods — flag as deviation.

### Test Quality Gates

Before adding ANY new test, verify all of:

1. **Ownership.** Tests live in the package that owns the function under test.
   When code moves between packages, the tests move with it.
2. **One canonical assertion site per behavior.** Don't re-assert what another
   test already covers. PRD-acceptance / criterion / wave-style suites are
   organizational labels, not parallel suites.
3. **No tautologies, no "did I call my mock" tests, no SLA-on-mocks.** A test
   must be able to fail for a real reason.
4. **Real codepath > mock pyramid.** Extends "Testing Integrity" above: prefer
   one integration test against a tmp dir over six mock-heavy units. Mock-heavy
   files MUST carry a top-of-file scope-header comment naming the canonical
   home of any behavior they don't own.
5. **Shared `withEnv` for `process.env`.** Inline `try/finally` env restoration
   is forbidden — use `withEnv` from `@agentforge/core`.
6. **~10s wall-time budget per `*.test.ts` file.** Collapse repeated end-to-end
   runs of the same flow into one assertion-dense test.
7. **Wiring tests inspect inputs, not just outputs.** A spy/recording provider
   that captures prompts must be queried for substring evidence of upstream
   data. If you can drop a field upstream and the test still passes, it is
   not a wiring test — it is an integration test and a poorly named one.

Detail, examples, and the bug story live in `docs/lessons-learned.md`
§ Test Quality Gates — One Canonical Site Per Behavior.

### Event Registry Completeness

- Every domain event referenced in the PRD (TaskStatusChanged, PhaseStarted,
  BudgetAlert, etc.) must be formally defined in the event model/registry with
  typed payloads. An event that is emitted but not in the registry, or in the
  registry but never emitted, is a gap.
- **Scope clarification:** events in this registry are for the **telemetry plane**
  (observability, audit, dashboard updates). They are NOT the coordination
  mechanism between agents. See vision Layer 2.

### Typed Contracts for Cross-Agent Artifacts

- Every artifact that crosses an agent boundary (PRD, EnrichedRequirement,
  AssumptionLedger, FeaturePlan, ChangeClassification, ScreenPlan, APIChangeSet,
  Diff, ReviewResult) has a Zod schema in `packages/core/src/types/`.
- Every LLM call with structured output uses `zod-to-json-schema` to produce the
  response schema.
- Every inter-node communication uses typed LangGraph channels, not untyped event
  payloads.

### Deviations from PRD or Vision

- Document deviations with: ADR in `docs/adrs/`, code comment referencing it, and
  a test naming the deviation. Silent deviations are tech debt.
- Ambiguous PRD: pick the safer interpretation, document in ADR.
- Contradictory PRD: flag it, create ADR, implement safer default.
- Incomplete PRD: implement minimal version, document gaps in ADR.
- Technically impossible / would break working system: flag as deviation rather
  than forcing compliance. ADR explains why the requirement cannot be met as written.
- PRD prescribes architecture conflicting with vision: vision wins. Write ADR.
- All ADRs in `docs/adrs/` with format `ADR-NNN-short-title.md`.
- Report PRD issues under "PRD Issues Found" at end of each prompt's output.

### Data-Driven Configuration

- Per-entity configs must be data-driven (config dicts/YAML), never hardcoded
  as if-else chains or shared constants.

### Rejected Patterns — Check Before Proposing

Before introducing an architectural pattern that feels novel, check
`docs/lessons-learned.md`, the vision document, and the rejected alternatives
appendix in `docs/design-decisions.md` for patterns that have been considered
and rejected with rejection reasoning. Notable rejected patterns:

- Flat 10-agent peer network on event bus (use spine + specialists — vision Layer 3)
- Event bus as coordination substrate (telemetry plane only — vision Layer 2)
- Parallel frontend/backend/tests coders within a task (single-threaded
  implementer — vision Layer 8)
- CrewAI orchestration (no typed state — vision Layer 1)
- OpenAI Agents SDK as orchestration substrate (no checkpointing — vision Layer 1)
- GraphRAG over code (AST + import graph suffices — vision Layer 6)
- Approve-every-agent-action HITL (structural gates only — vision Layer 10)
- Let-the-LLM-decide-when-done (deterministic gates own completion — vision Layer 8)
- Autonomous security remediation (triage only — vision Layer 9)
- Parallel dashboard pipeline reimplementing agent work functions (single
  `runDesignPipeline` — Phases 0-4 execution plan)

### Self-Correction

- Track failed approaches. Before retrying, verify the new attempt is
  materially different from what already failed.
- After 2 failed attempts at the same problem: stop, restate the problem,
  list top 3 hypotheses, run the cheapest discriminating check first.

### Think Before Coding (Karpathy Guidelines)

- Follow `.claude/rules/karpathy-guidelines.md` alongside the rules above:
  state assumptions, keep changes surgical, prefer the minimum code that
  solves the problem, and define verifiable success criteria before
  looping. Where project rules are stricter (e.g. full test suite must
  pass), project rules win.

### Session Continuity

- **At session start, ALWAYS read `docs/lessons-learned-rules.md`** before writing code. Read the full `docs/lessons-learned.md` only when you need historical RESOLVED context for a specific topic.
- Persist learnings to `docs/lessons-learned.md`. Keep entries short and actionable.
- Auto memory (`~/.claude/projects/.../memory/MEMORY.md`) is used for cross-session
  context. It is auto-loaded every session — check it for active plans and pointers.

## Tech Stack

- Monorepo: Nx with TypeScript
- CLI: Commander.js (`packages/cli`)
- Orchestration engine: **TypeScript LangGraph** (target — vision Layer 1).
  - Currently migrating from Python LangGraph in `services/engine/`.
  - Until migration completes (see ADR-043), legacy in-process TypeScript flows
    coexist with the deprecation target. New code follows the LangGraph target;
    do not extend the in-process path.
- Coordination substrate: **Typed LangGraph channels with Zod schemas** (target —
  vision Layer 2). Migrating from in-memory EventEmitter; event bus demoted to
  telemetry plane.
- State persistence: YAML files in git for artifacts; **Postgres LangGraph
  checkpointer** for run state (vision Layer 4).
- Retrieval (planned): Tree-sitter + voyage-code-3 + Qdrant + Cohere Rerank 3.5
  for code; LlamaIndex + voyage-3-large for docs (vision Layer 6).
- Observability: OpenTelemetry + Langfuse self-hosted via `packages/telemetry/`
  (ADR-052). `TracedProvider` wraps LLM calls with OTel spans; `LangfuseSink`
  adds pipeline lifecycle spans. Graceful no-op when `LANGFUSE_SECRET_KEY` unset.
  Self-hosted: `docker compose -f docker/docker-compose.langfuse.yml up -d`
  (UI at http://localhost:3001). Setup, verification, and troubleshooting:
  `docs/guides/langfuse-setup.md`. Prompt versioning: frontmatter parser + TracedProvider metadata + pre-commit hook.
- Testing: Jest + ts-jest for all packages
- Linting: ESLint + Prettier (config in root)

### Dependency & Model Versioning (CRITICAL)

- ALWAYS use the latest stable version of ALL dependencies. LLM training data
  is stale — NEVER trust its version suggestions. Check npm/PyPI first.
- When adding or upgrading any dependency, run the FULL test suite afterwards.
- When referencing Claude model IDs, use the latest model family:
  - Opus: `claude-opus-4-6`
  - Sonnet: `claude-sonnet-4-6`
  - Haiku: `claude-haiku-4-5`
- Use the latest SDK features (e.g., `output_config` for structured output)
  instead of workarounds (e.g., tool_use hacks for JSON output).

## Architecture

See `docs/vision.md` for the layered architecture authority.
See `docs/architecture/architecture.md` for the layer diagram.
See `docs/specs/PRD.md` for full product spec.

**The single invariant:** context quality and write-coupling are the axes. Get good
context into each LLM call. Keep writes single-threaded per artifact. If a proposed
change helps either, it's probably right. If it hurts either, it's probably wrong.

The system is a four-stage vertical spine with specialist tools (vision Layer 3):

**Spine (sequential, single writer per stage):**

1. Clarifier — reads input, runs clarification pipeline, emits enriched
   requirement + assumption ledger.
2. Architect — produces architecture spec, ADRs, task plan.
3. Implementer — single-threaded tool-loop; writes all code for a task in
   sequence. Task-level parallelism via git worktrees only.
4. Reviewer — fresh-context diff review with deterministic gates first, LLM
   review second.

**Specialists (invoked as tools by spine stages):**

- Research subagents (read-only codebase/docs exploration)
- Design subagent (UI proposals, screen specs)
- Test generator (failing tests before implementation)
- Security scanner (Semgrep + LLM triage, no autonomous remediation)
- Visual validator (Playwright for UI)
- Documentation generator (API docs, user guides)

**Coordination:** Typed LangGraph channels with reducers. NOT event bus.
**State:** Postgres checkpointer for run state. YAML in git for artifacts.
**HITL:** Three LangGraph interrupts — clarification, design/API approval, code merge.
**Governance:** MIDDLEWARE wrapping agent execution, not a service.

## Package Dependencies

- `core` depends on: `yaml`, `zod`, `eventemitter3` [telemetry only], `@langchain/core`, `@langchain/langgraph-checkpoint`, `@langchain/langgraph-checkpoint-postgres` [checkpointer]
- `governance` depends on: `core`
- `providers` depends on: `core`
- `channels` depends on: `core`
- `cli` depends on: `core`, `governance`, `providers`, `channels`, `telemetry`, `eval`
- `agents-*` depend on: `core`, `governance`, `providers`
- `telemetry` depends on: `core`; peers: `agents-ux`, `providers` (ADR-052)
- `designspec-renderer` depends on: `core` (type-only devDependency, zero runtime deps)
- `retrieval` depends on: `core`, `voyageai`, `cohere-ai`, `@qdrant/js-client-rest`, `web-tree-sitter`
- `agents-clarifier` depends on: `core`, `providers`, `retrieval`, `telemetry`, `@langchain/langgraph`, `@langchain/core`, `zod`
- `eval` depends on: `core`, `providers`, `agents-clarifier`, `yaml`, `zod`
- `orchestrator` (planned) depends on: `core`, `agents-*`, `retrieval`

### Dashboard Dev Server (IMPORTANT)

- The dashboard uses pre-built `dist/` from monorepo packages (NOT raw TypeScript source).
  This makes cold-start ~10x faster but means **you must rebuild packages before running the dashboard** if you changed package source code.
- **Before starting the dashboard dev server:** `nx run-many -t build` (rebuilds all packages)
- **Start dashboard:** `cd packages/dashboard && npm run dev` (runs `next dev --webpack --port 3000`)
- **When to rebuild:** After changing any file in `packages/core/src/`, `packages/agents-ux/src/`,
  `packages/designspec-renderer/src/`, `packages/providers/src/`, or any other package that the
  dashboard imports. Dashboard-only changes (under `packages/dashboard/src/`) do NOT require rebuilding.
- The old `@agentforge/source` webpack condition was removed because it forced compilation of 382 extra
  TypeScript files (~65K lines) on every page load. The `dist/` approach compiles 0 extra files.

## Commands

- Build all: `nx run-many -t build`
- Test single package: `nx test core`
- Test all (unit only): `nx run-many -t test`
- Test all (incl. LLM): `RUN_LLM_TESTS=true nx run-many -t test`
- Lint: `nx run-many -t lint`
- Type check: `nx run-many -t typecheck`
- Generate docs dashboards: `npx tsx scripts/generate-docs.ts`
  - Produces `docs/_generated/` (gitignored): `current-status.md`, `package-index.md`, `adr-index.md`
  - Must run before `mkdocs build` or Backstage TechDocs preview — generated pages are in the mkdocs nav but not committed
  - Path registry at `docs/registry.yaml` maps logical doc names to physical paths (for future skill migration)

### Test Tiers — Controlling Expensive Tests

By default, `nx run-many -t test` runs only unit tests and mocked integration
tests ($0, fast). Real LLM/service calls require explicit opt-in:

| Env Var | What it enables | Est. cost | Packages |
|---------|----------------|-----------|----------|
| `RUN_LLM_TESTS=true` | LLM integration tests (Anthropic/Vertex) | $0.10-0.50 | cli, agents-ux |
| `RUN_E2E_PROOF=true` | Full multi-agent pipeline e2e tests | $1-3 | agents-ux |
| `AGENTFORGE_TEST_RETRIEVAL=1` | Retrieval spike tests (Voyage/Qdrant) | varies | retrieval |
| `AGENTFORGE_TEST_POSTGRES` | PostgreSQL checkpointer tests | $0 | core |

Run LLM tests: `RUN_LLM_TESTS=true npx nx run-many -t test`
Run everything: `RUN_LLM_TESTS=true RUN_E2E_PROOF=true CONFIRM_INTEGRATION=true npx nx run-many -t test`

API keys (`ANTHROPIC_API_KEY` or Vertex AI ADC) must also be configured —
the env var gates are additive, not replacements for auth checks.

## Code Conventions

- Strict TypeScript (`strict: true`, no `any`)
- Functional style, avoid classes except where interfaces demand it
- All public APIs must have JSDoc comments
- Every module exports via `index.ts` barrel file
- Error handling: Result pattern (never throw)
- File naming: kebab-case for files, PascalCase for types/interfaces
- All LLM calls go through the typed wrapper in `packages/core/src/llm/` with
  response schema validation
- Every agent tool has a plain TypeScript function, JSON Schema for input/output,
  and an MCP-compatible descriptor for reuse by Claude Desktop and other MCP clients
- Every prompt file carries frontmatter with `version` and `purpose` fields.
  LLM wrapper records version per call. Pre-commit hook fails if prompt content
  changed without version bump

## Documentation

- When adding or modifying CLI commands, update docs in `docs/cli/`.
- When adding a new feature, module, or public API, ensure documentation exists.
- When making an architectural change that touches vision Layer N, update
  `docs/vision.md` Layer N's Current State section.
- **Developer Portal:** Backstage at `backstage/` (port 3003). See
  `docs/guides/backstage-developer-portal.md` and ADR-051.
  - When adding new docs under `docs/`, add the file to `mkdocs.yml` nav
  - When adding new packages, create `catalog-info.yaml` + `README.md` in the package root

### Markdown Formatting for Backstage TechDocs

- Follow `.claude/rules/docs-formatting.md` when writing docs under `docs/`.
  Key rules: use admonitions (`!!!`) for callouts, collapsible sections
  (`???`) for gotchas, blank line before lists. Tables/code/blockquotes
  get automatic styling via the `mdx_fix_list_spacing` extension.

### Blind Subagent Test (MANDATORY for new documentation)

After documenting any new system, feature, or setup procedure, run a **blind
subagent test** to verify the docs are self-sufficient. Spawn an Explore agent
with NO context from the current conversation and ask it to accomplish a task
using only what it can find in the project's own files (starting from CLAUDE.md).
If the agent can't find what it needs or gets confused, the documentation has
gaps — fix them before declaring done. Do NOT skip this step. A doc that only
works when you already know the answer is not documentation.

### Spec Sync on Feature Completion

- When completing a feature plan phase, update the relevant domain spec section
  in `docs/specs/` to reflect the implemented behavior.
- When a `vision.md` locked decision changes, grep all domain specs for the
  affected pattern and update or annotate them.
- Run `/verify-docs --full-sweep` before major releases to catch drift.

## Skills Library

Available Claude Code skills (invoke with /slash command).
See `.claude/skills/README.md` for lifecycle diagram, examples, and ownership boundaries.

- /session-start — Read key docs and produce a briefing before coding (use at every session start)
- /create-plan [description] — **Mandatory** entry point for any initiative crossing the plan threshold (see `docs/guides/planning-docs.md`). Explores codebase, scaffolds plan folder under `docs/plans/active/`, generates per-phase gates that auto-invoke `/review-plan-impl`, `/mid-session-drift-check`, and `/verify-done`, auto-runs `/challenge-plan` with the explicit plan path.
- /analyze-codebase — Full gap analysis + prioritized task roadmap
- /implement-feature [name] — PRD-traced implementation workflow
- /sprint-plan [duration] — Sprint planning from task backlog
- /review-prd-compliance — Audit code vs PRD intent + TypeScript contracts
- /write-adr [description] — Generate ADR for spec deviations
- /demo-readiness — Fastest path to a working demo
- /verify-design-render <project>/<page> — Verify spec-to-renderer property fidelity
- /verify-done — Pre-completion gate: headed E2E, stale Vite kill, Chrome DevTools visual proof, documentation verification via /verify-docs (use before declaring prototype/renderer work done)
- /verify-docs — Unified documentation verification: content accuracy, spec sync, vision layer currency, CLI docs, lessons-learned. Task-scoped (from verify-done) or full-sweep (pre-release). Absorbs former /review-spec-sync.
- /mid-session-drift-check — Mid-session process compliance audit: mocks, tests, scope creep, honesty, rejected patterns, doc currency. Use before commits or when session feels long.
- /challenge-plan — Challenge any plan against framework intent (PRD, architecture, design philosophy). Use before approving plans to get a second opinion.
- /review-plan-impl <plan> [--phase X] — Fresh-context review of diff against plan phase. Deterministic pre-checks + 7-point rubric + portable prompt audit trail. Use after implementing a plan phase.
- /backstage create <type> <topic> — Create/revise backstage doc page (concept, tutorial, guide, architecture, status) with editorial protocol, competitor-swap test, and voice/flow check
- /backstage sync — Regenerate Tier 3 auto-generated pages + LLM-powered Tier 2 concept page drift check against authoritative sources
- /backstage review <page> — Deep review of an existing page against voice, flow, and quality rules. Gathers context, identifies issues, suggests concrete rewrites, and creates a prioritized plan
- /improvise-ux [description] [reference URL or screenshot] — Improve existing UI component polish to match a reference design. 11-phase protocol with design system audit, mathematical contrast computation (WCAG ratios for text, L deltas for surfaces), strictly-additive token changes, all-state browser verification, and color-scheme verification.

## IMPORTANT

- ALWAYS run `typecheck` after making changes across packages
- NEVER modify `packages/stacks/react-node-prisma/prompts/` without asking
- Test files go next to source files (`foo.ts` → `foo.test.ts`)
- When creating interfaces, check if `core/src/types/` already has one
- **Before building any new agent or pipeline stage, read the relevant vision layer in `docs/vision.md`**
- **Never use the legacy `EventEmitter` as a coordination mechanism — it is telemetry only. Use typed LangGraph channels for coordination.**
- **Every LLM call must use typed structured output via Zod schemas. No free-text coordination between agents.**
- **No secrets in LLM context.** Inject credentials at tool-call time, never in system/user prompts. (Vision Layer 13)
- **No stub fallbacks when imports fail.** If a dependency is missing or an import doesn't resolve, stop and report the gap. Do not silently fall back to a stub or mock.
- **Planning mandate.** When work crosses the plan threshold defined below, ALWAYS run `/create-plan` (or, in Cursor or other tools without slash skills, follow `.claude/skills/create-plan/SKILL.md` step by step) rather than scaffolding a plan folder ad-hoc. Full definition + verification gate model: `docs/guides/planning-docs.md`.
- **Per-phase verification gate.** When executing a plan generated by `/create-plan`, run the per-phase gate (`/review-plan-impl --phase N` then `/mid-session-drift-check`, plus conditional `/write-adr` / `/review-prd-compliance`) before checking a phase complete, and the end-of-plan gate (`/verify-done` then `git commit`, plus conditional `/prepare-handoff`) before merging. Skipping a gate without an explicit user waiver is a process violation surfaced by `/mid-session-drift-check`. Lifecycle source of truth: `.claude/skills/README.md`.

### Plan threshold

The exact wording below is mirrored verbatim in `docs/guides/planning-docs.md`, `.claude/skills/create-plan/SKILL.md` Step 0, and `.cursor/rules/agentforge-base.mdc`. If you change the threshold, update all four sources in the same edit.

**Plan threshold.** Run `/create-plan` (or follow `.claude/skills/create-plan/SKILL.md` step by step in Cursor) when ANY of these is true:

- Work spans more than one session, OR
- Touches more than one package under `packages/`, OR
- Maps to a phase in `docs/roadmap.md`, OR
- Introduces a new agent, pipeline stage, ADR, or public API, OR
- The user explicitly asks for a "plan", "execution plan", "phased work", or similar.

Below this threshold (single-file fix, doc-only edit, lint/typecheck cleanup), do the work directly.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
