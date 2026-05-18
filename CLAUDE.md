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

1. Visual Diversity — Phases 1-4 + 3.1-3.8 COMPLETE. Next: Phase 5 (Domain + Effects Foundation). Roadmap: `docs/plans/active/visual-diversity/design-quality-vision.md`. Execution: `docs/plans/active/visual-diversity/execution-plan.md`
2. CHIP's Next Steps — M0-M3.6 COMPLETE. M4 Phase 7 IN PROGRESS — eval infrastructure complete, Gate 6a/6b deferred to next session. See `docs/plans/active/chips-next-steps/execution-plan.md`
3. Dashboard Pipeline Fix — Resolved (Vertex AI quota was actual blocker, not import.meta.url). See `docs/plans/active/dashboard-pipeline-fix/execution-plan.md`
4. CHIP UX Overhaul — Phases 1, 2, 4.0, 4.1 COMPLETE. Next: Phase 4.2+. See `docs/plans/active/chip-ux-overhaul/execution-plan.md`
5. Focused Deep Audit — Phase 1 (wire selectedNode) next. See `docs/plans/active/focused-deep-audit/execution-plan.md`
6. Backstage Improvements — Batches 1-4 (21 child plans) COMPLETE. 42 entries remain (Batches 5-12). See `docs/plans/active/backstage-improvements/execution-plan.md`
7. ChatPRD Split Panel — Subplan of CHIP UX Overhaul Phase 3. Phases 1-7 COMPLETE. Phase 8 (visual polish) next. See `docs/plans/active/chatprd-split-panel/execution-plan.md`
8. Clarifier E2E Browser Test — Phases 1-2 COMPLETE. Phases 3-4 remaining. See `docs/plans/active/clarifier-e2e-browser-test/execution-plan.md`
9. Clarifier Self-Correction — Phases 1-3 COMPLETE. Phase 4 (self-correction pipeline) next. See `docs/plans/active/clarifier-self-correction/execution-plan.md`

**Backlog plans (do NOT read during session-start):** Screen Types Plan B (`docs/plans/backlog/screen-types-plan-b.md`), Docs Tutorials (`docs/plans/backlog/docs-tutorials.md`), Clarifier Streaming (`docs/plans/active/clarifier-streaming/`), Eval Documentation (`docs/plans/active/eval-documentation/`).

**Completed plans (do NOT read during session-start):** 7 plans in `docs/plans/completed/`. Integrating Clarifier SUPERSEDED by M1 Connect.

<!-- Last session: max 2 lines — status + next action only. Details belong in the plan's execution-plan.md. -->
**Last session (2026-05-17):** M4 Phases 1-6 COMPLETE, Phase 7 eval infrastructure shipped. Gate 6a/6b deferred (25+ min Opus runs). Next: run `scripts/run-spine-eval.ts` + regression subset.

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

### Development Discipline (auto-loaded)

Full rules in `.claude/rules/dev-discipline.md`: test ownership, PRD source of truth,
interface/enum completeness, testing integrity & quality gates, event registry, typed contracts.

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

Follow `.claude/rules/karpathy-guidelines.md` (auto-loaded). Where project rules
are stricter (e.g. full test suite must pass), project rules win.

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
- `agents-architect` depends on: `core`, `providers`, `retrieval`, `telemetry`, `agents-ux`, `@langchain/langgraph`, `@langchain/core`, `zod`
- `agents-implementer` depends on: `core`, `governance`, `providers`, `telemetry`, `agents-ux`, `agents-architect`, `designspec-renderer`, `@langchain/langgraph`, `@langchain/core`, `zod`
- `agents-reviewer` depends on: `core`, `governance`, `providers`, `telemetry`, `@langchain/langgraph`, `@langchain/core`, `zod`, `zod-to-json-schema`
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

See `.claude/rules/typescript.md` for base TypeScript conventions (strict mode,
functional style, JSDoc, barrel exports, Result pattern).

Additional project conventions:
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

Follow `.claude/rules/docs-formatting.md` (auto-loaded): admonitions for callouts,
collapsible sections for gotchas, blank line before lists.

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

Available Claude Code skills (invoke with `/command`). Full list with lifecycle
diagram: `.claude/skills/README.md`.

Key skills: `/session-start` (every session), `/create-plan` (mandatory for plan-threshold work),
`/verify-done` (pre-completion gate), `/mid-session-drift-check` (before commits).

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
