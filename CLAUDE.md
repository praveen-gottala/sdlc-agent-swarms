# AgentForge

Multi-agent framework for end-to-end SDLC orchestration.
Open source, Apache 2.0.

## Current State
Active: Design pipeline (packages/agents-ux/, packages/designspec-renderer/)
Paused: Pipeline Plan 1 (bridge design→impl), Pipeline Plan 2 (unify runner)
Not started: spec/code/cicd/observe phases, V3 Dashboard, TS orchestrator
Decision pending: TypeScript vs Python engine for future phases (needs ADR)

<!-- Update at session end -->
Last session: (date, what was done, what's next)

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

## Development Rules (PRD Compliance)

These rules are non-negotiable. They apply to every implementation task, bug fix,
and test written in this project.

### Full Ownership of All Tests
- Every agent MUST run the FULL test suite and fix ALL failures — not just tests
  "related to" the change. No such thing as a "pre-existing" failure.
- Run `nx run-many -t typecheck` and `nx run-many -t test` after every change.
  Do not declare done until both pass with zero failures.
- When changes touch dashboard UI, API routes, or E2E-covered functionality
  (pages under `packages/dashboard/`, `e2e/`), also run Playwright E2E tests:
  `npx playwright test` (from monorepo root). All E2E tests must pass before
  declaring done. The dashboard auto-starts the design renderer — Playwright
  config only starts the Next.js server.

### PRD is Source of Truth
- PRD (docs/PRD-v2.md) defines WHAT and WHY. TypeScript interfaces in
  packages/core/src/types/ are authoritative for field lists, enums, and
  API contracts. When PRD and code diverge, code wins and PRD is updated.
  See ADR-038. Do not hardcode values the PRD defines as configurable.

### Interface Completeness
- Include ALL fields from the TypeScript interface in packages/core/src/types/.
  The TypeScript interface is authoritative — not the PRD description. See ADR-038.

### Enum Coverage
- Every enum member must have a working implementation, even if minimal.
  Returning 400/404 for a defined enum value is a spec violation.

### Testing Integrity
- Tests must exercise the real server/API codepath, not internal functions.
  Never work around a server bug by calling internal methods — flag as deviation.

### Deviations from PRD
- Document deviations with: ADR in docs/adrs/, code comment referencing it, and
  a test naming the deviation. Silent deviations are tech debt.
- Ambiguous PRD: pick the safer interpretation, document in ADR.
- Contradictory PRD: flag it, create ADR, implement safer default.
- Incomplete PRD: implement minimal version, document gaps in ADR. All ADRs in
  docs/adrs/ with format ADR-NNN-short-title.md. Report PRD issues under
  "PRD Issues Found" at end of each prompt's output.

### Data-Driven Configuration
- Per-entity configs must be data-driven (config dicts/YAML), never hardcoded
  as if-else chains or shared constants.

### Self-Correction
- Track failed approaches. Before retrying, verify the new attempt is
  materially different from what already failed.
- After 2 failed attempts at the same problem: stop, restate the problem,
  list top 3 hypotheses, run the cheapest discriminating check first.

### Session Isolation & Repo-Local Memory
- Never write to ~/.claude/ or use external memory tools.
- **At session start, ALWAYS read `docs/lessons-learned.md`** before writing code.
- Persist learnings only to `docs/lessons-learned.md`. Keep entries short and actionable.

## Tech Stack
- Monorepo: Nx with TypeScript
- CLI: Commander.js (packages/cli)
- Orchestration engine: TypeScript in-process (@agentforge/core, @agentforge/agents-ux)
  - services/engine/ contains a LangGraph prototype (not used). See ADR-022.
  - The design pipeline (init → describe → design:generate → design:penpot) is
    entirely TypeScript.
- Event bus: In-memory EventEmitter (v1), Redis Streams later
- State: YAML files in git (v1)
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
See docs/architecture.md for layer diagram.
See docs/PRD-v2.md for full product spec.
Governance is MIDDLEWARE, not a service — it wraps agent execution.
Agents communicate via event bus ONLY. No direct agent-to-agent calls.

## Package Dependencies
core depends on: nothing (zero external deps beyond yaml, eventemitter3)
governance depends on: core
providers depends on: core
channels depends on: core
cli depends on: core, governance, providers, channels
agents-* depend on: core, governance, providers
designspec-renderer depends on: core (type-only devDependency, zero runtime deps)

## Commands
- Build all: nx run-many -t build
- Test single package: nx test core
- Test all: nx run-many -t test
- Lint: nx run-many -t lint
- Type check: nx run-many -t typecheck

## Documentation
- When adding or modifying CLI commands, update docs in `docs/cli/`.
- When adding a new feature, module, or public API, ensure documentation exists.

## Skills Library
Available Claude Code skills (invoke with /slash command):
- /analyze-codebase — Full gap analysis + prioritized task roadmap
- /implement-feature [name] — PRD-traced implementation workflow
- /sprint-plan [duration] — Sprint planning from task backlog
- /review-prd-compliance — Audit code vs PRD intent + TypeScript contracts
- /write-adr [description] — Generate ADR for spec deviations
- /demo-readiness — Fastest path to a working demo
