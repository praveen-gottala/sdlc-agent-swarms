# AgentForge

Multi-agent framework for end-to-end SDLC orchestration.
Open source, Apache 2.0.

**Shared tooling:** See **`AGENTS.md`** for how this file fits with Cursor rules and episodic handoff docs (so the same practices apply in both tools).

---

## Reading order (IMPORTANT)

Before making any architectural decision, read in this order:

1. **`docs/vision.md`** — the architectural vision. Covers 15 layers with locked and open decisions, current-vs-target explicit for every layer. **When this document and the current codebase disagree, the vision wins.** When this document and `docs/specs/PRD.md` disagree on architecture, the vision wins.
2. **`docs/specs/PRD.md`** — the product spec. Source of truth for product scope, interfaces, API contracts, enum values, field lists. Do NOT treat the PRD as authoritative on architectural *patterns* — those are in the vision.
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
1. Visual Diversity — Phase 1-2, 4 COMPLETE. Prerequisite next (renderer gap closure P.1-P.8: 16 catalog components need dedicated renderers). Then Phase 3 (catalog variants). Roadmap: `docs/plans/active/visual-diversity/design-quality-vision.md`. Execution: `docs/plans/active/visual-diversity/execution-plan.md`
2. Observability — Phase 1-2 COMPLETE (incl. 2.4 promptTraces cleanup), Phase 3 next (prompt versioning). See `docs/plans/active/observability/execution-plan.md`
3. Clarifier Initiative — Resequenced: Phase 0 (foundation) -> Phase 2 (RAG) -> Phase 1 (Clarifier). Phase 0.2 (typed schemas) in progress. See `docs/plans/active/clarifier-initiative/execution-plan.md`

**Backlog plans (do NOT read during session-start — note status only):**
- Screen Types Plan B — B0-B2.7 complete, B3 next. Paused for visual diversity. See `docs/plans/backlog/screen-types-plan-b.md`

**Completed plans (do NOT read during session-start):**
- Unify Design Pipeline — Phase 0-5 COMPLETE (2026-04-26). See `docs/plans/completed/unify-pipeline/execution-plan.md`
- Screen Types Plan A — COMPLETE (A1-A6 done, 2026-04-22). See `docs/plans/completed/screen-types-plan-a.md`

**Last session:** Renderer component gap closure — adding 16 dedicated catalog renderers to DesignSpecRenderer.tsx (prerequisite P.1-P.8).

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
- Do NOT treat the PRD as authoritative on architectural *patterns*. Those are in
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
  (ADR-046). `TracedProvider` wraps LLM calls with OTel spans; `LangfuseSink`
  adds pipeline lifecycle spans. Graceful no-op when `LANGFUSE_SECRET_KEY` unset.
  Self-hosted: `docker compose -f docker/docker-compose.langfuse.yml up -d`
  (UI at http://localhost:3001). Setup, verification, and troubleshooting:
  `docs/guides/langfuse-setup.md`. Prompt versioning not yet implemented.
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
- `cli` depends on: `core`, `governance`, `providers`, `channels`, `telemetry`
- `agents-*` depend on: `core`, `governance`, `providers`
- `telemetry` depends on: `core`; peers: `agents-ux`, `providers` (ADR-046)
- `designspec-renderer` depends on: `core` (type-only devDependency, zero runtime deps)
- `retrieval` (planned) depends on: `core`
- `orchestrator` (planned) depends on: `core`, `agents-*`, `retrieval`

## Commands
- Build all: `nx run-many -t build`
- Test single package: `nx test core`
- Test all: `nx run-many -t test`
- Lint: `nx run-many -t lint`
- Type check: `nx run-many -t typecheck`

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
- /create-plan [description] — Create an execution plan for any initiative (roadmap phase, feature, ad-hoc task). Explores codebase, scaffolds plan folder, auto-runs /challenge-plan.
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