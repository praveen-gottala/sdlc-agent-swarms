# AgentForge

Multi-agent framework for end-to-end SDLC orchestration.
Open source, Apache 2.0.

---

## Reading order (IMPORTANT)

Before making any architectural decision, you must read in this order:

1. **`docs/vision.md`** — the architectural vision. Covers 15 layers with locked and open decisions, current-vs-target explicit for every layer. **When this document and the current codebase disagree, the vision wins.** When this document and `docs/PRD.md` disagree on architecture, the vision wins.
2. **`docs/PRD.md`** — the product spec. Source of truth for product scope, interfaces, API contracts, enum values, field lists. Do NOT treat `PRD.md` as authoritative on architectural *patterns* — those are in the vision.
3. **This file (`CLAUDE.md`)** — the development discipline rules. Always in force.
4. **`docs/lessons-learned.md`** — Do Not Repeat list. Check before any new approach.
5. **`docs/adrs/`** — decision records that may amend or supersede sections of the PRD.

If these sources conflict, the hierarchy is: `CLAUDE.md` security rules → `vision.md` (architecture) → ADRs (specific deviations) → `PRD.md` (product) → codebase state (legacy).

---

## Development Rules (PRD Compliance + Vision Compliance)

These rules are non-negotiable. They apply to every implementation task, bug fix, and test.

### PRD is Source of Truth (for product)

* PRD (`docs/PRD.md`) is the single source of truth for all interfaces, API contracts, enums, and field lists. Implement exactly as specified. Do not hardcode values the PRD defines as configurable or per-entity.

### Vision is Source of Truth (for architecture)

* `docs/vision.md` is the authority on architectural patterns: orchestration runtime, coordination substrate, agent taxonomy, state persistence, clarifier structure, RAG, implementation patterns, review patterns, HITL gates, observability, sandboxing.
* When the PRD prescribes an architectural pattern that conflicts with the vision (e.g., PRD Section 24.2 prescribes "frontend + backend + tests in parallel"; vision Layer 8 mandates single-threaded implementer), the vision wins. Write an ADR documenting the deviation.
* When the current codebase implements a pattern that conflicts with the vision (e.g., event bus as coordination substrate; vision Layer 2 mandates typed channels), the vision wins. Do not replicate the legacy pattern in new code. Add a TODO linking to the vision layer. If the migration is in flight, follow the target pattern in new code.

### Interface Completeness

* When implementing an interface or return type, include ALL fields the PRD specifies. Never skip fields because they are "derivable" or "computable later."

### Enum Coverage

* Every member of a defined enum (e.g., SDLCPhase with 5 phases) must have a working implementation, even if minimal. Returning 400/404 for a defined enum value is a spec violation. Use a minimal placeholder if the full pipeline is not yet built.

### Testing Integrity

* Tests must exercise the real server/API codepath, not internal functions directly. Never work around a server bug by calling internal methods — if the endpoint is broken, flag it as a deviation. Tests that bypass the server give false confidence.

### Deviation Documentation

* When the implementation deviates from PRD wording OR vision guidance, always document with:
  1. An ADR in `docs/adrs/`
  2. A code comment referencing the ADR
  3. A test that names the deviation explicitly
* Silent deviations are tech debt. No exceptions.

### Data-Driven Configuration

* Per-entity configurations must be data-driven. Phase-specific interrupt nodes, agent-specific permissions, HITL policies per phase — read from config dicts/YAML, never hardcoded as if-else chains or shared constants.

### Event Registry Completeness

* Every domain event referenced in the PRD (TaskStatusChanged, PhaseStarted, BudgetAlert, etc.) must be formally defined in the event model/registry with typed payloads. An event that is emitted but not in the registry, or in the registry but never emitted, is a gap.
* **Scope clarification:** events in this registry are for the **telemetry plane** (observability, audit, dashboard updates). They are NOT the coordination mechanism between agents. See vision Layer 2.

### Typed Contracts for Cross-Agent Artifacts

* Every artifact that crosses an agent boundary (PRD, EnrichedRequirement, AssumptionLedger, FeaturePlan, ChangeClassification, ScreenPlan, APIChangeSet, Diff, ReviewResult) has a Zod schema in `packages/core/src/types/`.
* Every LLM call with structured output uses `zod-to-json-schema` to produce the response schema.
* Every inter-node communication uses typed LangGraph channels, not untyped event payloads.

### When the PRD is Wrong or Ambiguous

* If the PRD is ambiguous (two valid interpretations), pick the one that is safer (more restrictive, more explicit), implement it, and document the ambiguity in an ADR with both interpretations and why you chose one.
* If the PRD is contradictory (Section X says one thing, Section Y says another), do NOT silently pick one. Stop and flag it. Add a comment in code: "PRD CONFLICT: Section X vs Section Y — see ADR-NNN" and create the ADR documenting both sides. Implement the safer interpretation as a default.
* If the PRD is incomplete (references something undefined, or a workflow has a gap), implement the minimal working version and document what is missing in an ADR. Never invent behavior the PRD does not specify — fill gaps with no-ops or placeholders, not assumptions.
* If the PRD specifies something that is technically impossible or would break an existing working system, flag it as a deviation rather than forcing compliance. The ADR should explain why the PRD requirement cannot be met as written.
* If the PRD specifies an architectural pattern (not a product requirement) that conflicts with the vision, follow the vision. PRD predates the vision document and may contain patterns the vision has deprecated.
* All ADRs go in `docs/adrs/` with format: `ADR-NNN-short-title.md`
* All PRD issues found during implementation should be collected and reported at the end of each prompt's output under a "PRD Issues Found" heading so they can be fed back into the next PRD revision.

### Teach Yourself

After every task, if something is not working, document the reason.

You are solving iteratively.

#### Rules

* Track failed approaches in a **Do Not Repeat** list at `docs/lessons-learned.md`.
* When an attempt fails, record:
  + the attempt
  + why it failed
  + the observable signal
  + the rule to avoid repeating it
* Before any new attempt, check whether it overlaps with a failed approach.
* If overlap exists, do not proceed unless you can explain why this attempt is materially different.
* If the same error persists after 2 attempts, switch to diagnosis mode:
  + restate the problem
  + list the top 3 hypotheses
  + run the cheapest discriminating check first

### Rejected Patterns — Check Before Proposing

* Before introducing an architectural pattern that feels novel, check `docs/design-patterns-red-flags.md` for a list of patterns that have been considered and rejected with rejection reasoning.
* Notable rejected patterns:
  + Flat 10-agent peer network on event bus (use spine + specialists instead — vision Layer 3)
  + Event bus as coordination substrate (telemetry plane only — vision Layer 2)
  + Parallel frontend/backend/tests coders within a task (single-threaded implementer — vision Layer 8)
  + CrewAI orchestration (no typed state — vision Layer 1)
  + OpenAI Agents SDK as orchestration substrate (no checkpointing — vision Layer 1)
  + GraphRAG over code (AST+import graph suffices — vision Layer 6)
  + Approve-every-agent-action HITL (structural gates only — vision Layer 10)
  + Let-the-LLM-decide-when-done (deterministic gates own completion — vision Layer 8)
  + Autonomous security remediation (triage only — vision Layer 9)

---

## Tech Stack (current)

* Monorepo: Nx with TypeScript
* CLI: Commander.js (`packages/cli`)
* Orchestration engine: **TypeScript LangGraph** (migrating from Python+LangGraph in `services/engine` — see ADR-023 / vision Layer 1; Python engine to be deprecated)
* Coordination substrate: **Typed LangGraph channels with Zod schemas** (migrating from in-memory EventEmitter — see vision Layer 2; event bus demoted to telemetry plane)
* State persistence: YAML files in git for artifacts; **Postgres LangGraph checkpointer** for run state (vision Layer 4)
* Testing: Jest + ts-jest for all packages
* Linting: ESLint + Prettier (config in root)
* Retrieval (planned): Tree-sitter + voyage-code-3 + Qdrant + Cohere Rerank 3.5 for code; LlamaIndex + voyage-3-large for docs (vision Layer 6)
* Observability (planned): OpenTelemetry + Langfuse self-hosted (vision Layer 11)

---

## Architecture — the spine + specialists model

See `docs/ARCHON-VISION.md` for the full layered architecture.

The system is a four-stage vertical spine with specialist tools:

**Spine (sequential, single writer per stage):**
1. Clarifier — reads input, runs clarification pipeline, emits enriched requirement + assumption ledger.
2. Architect — produces architecture spec, ADRs, task plan.
3. Implementer — single-threaded tool-loop; writes all code for a task in sequence. Task-level parallelism via git worktrees only.
4. Reviewer — fresh-context diff review with deterministic gates first, LLM review second.

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

---

## Package Dependencies

* `core` depends on: nothing (zero external deps beyond `yaml`, `zod`, `eventemitter3` [for telemetry only])
* `governance` depends on: `core`
* `providers` depends on: `core`
* `channels` depends on: `core`
* `cli` depends on: `core`, `governance`, `providers`, `channels`
* `agents-*` depend on: `core`, `governance`, `providers`
* `retrieval` (new) depends on: `core`
* `orchestrator` (new) depends on: `core`, `agents-*`, `retrieval`

---

## Commands

* Build all: `nx run-many -t build`
* Test single package: `nx test core`
* Test all: `nx run-many -t test`
* Lint: `nx run-many -t lint`
* Type check: `nx run-many -t typecheck`

---

## Code Conventions

* Strict TypeScript (`strict: true`, no `any`)
* Functional style, avoid classes except where interfaces demand it
* All public APIs must have JSDoc comments
* Every module exports via `index.ts` barrel file
* Error handling: Result pattern (never throw), see `docs/error-handling.md`
* File naming: kebab-case for files, PascalCase for types/interfaces
* All LLM calls go through the typed wrapper in `packages/core/src/llm/` with response schema validation

---

## Documentation

* When adding or modifying CLI commands, update the corresponding doc in `docs/cli/`:
  + Setup & config commands: `docs/cli/setup.md`
  + Design commands: `docs/cli/design.md`
  + Orchestration commands: `docs/cli/orchestration.md`
  + Index/overview: `docs/cli/README.md`
* When adding a new feature, module, or public API, ensure documentation exists. If there is no doc for the area you changed, create one.
* When making an architectural change that touches vision Layer N, update `docs/ARCHON-VISION.md` Layer N's Current State section.
* Keep docs concise: command signature, options table, 1-2 examples, and any relevant env vars or prerequisites.

---

## IMPORTANT

* ALWAYS run typecheck after making changes across packages
* NEVER modify `packages/stacks/react-node-prisma/prompts/` without asking
* Test files go next to source files (`foo.ts` → `foo.test.ts`)
* When creating interfaces, check if `core/src/types/` already has one
* **Before building any new agent or pipeline stage, read the relevant vision layer in `docs/ARCHON-VISION.md`**
* **Never use the legacy `EventEmitter` as a coordination mechanism — it is telemetry only. Use typed LangGraph channels for coordination.**
* **Every LLM call must use typed structured output via Zod schemas. No free-text coordination between agents.**
