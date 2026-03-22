# AgentForge

Multi-agent framework for end-to-end SDLC orchestration.
Open source, Apache 2.0.

## Development Rules (PRD Compliance)

These rules are non-negotiable. They apply to every implementation task, bug fix, 
and test written in this project.

### PRD is Source of Truth
- PRD v2.0 (docs/PRD-v2.md) is the single source of truth for all interfaces, 
  API contracts, enums, and field lists. Implement exactly as specified. Do not 
  hardcode values the PRD defines as configurable or per-entity.

### Interface Completeness
- When implementing an interface or return type, include ALL fields the PRD 
  specifies. Never skip fields because they are "derivable" or "computable later." 
  If the PRD says getStatus() returns active_agent_count, the implementation must 
  return active_agent_count.

### Enum Coverage
- Every member of a defined enum (e.g., SDLCPhase with 5 phases) must have a 
  working implementation, even if minimal. Returning 400/404 for a defined enum 
  value is a spec violation. Use a minimal placeholder if the full pipeline is 
  not yet built.

### Testing Integrity
- Tests must exercise the real server/API codepath, not internal functions directly. 
  Never work around a server bug by calling internal methods — if the endpoint is 
  broken, flag it as a deviation. Tests that bypass the server give false confidence.

### Deviation Documentation
- When the implementation deviates from PRD wording, always document with:
  1. An ADR in docs/adrs/
  2. A code comment referencing the ADR
  3. A test that names the deviation explicitly (e.g., test_cicd_gate_via_task_completion)
- Silent deviations are tech debt. No exceptions.

### Data-Driven Configuration
- Per-entity configurations must be data-driven. Phase-specific interrupt nodes, 
  agent-specific permissions, HITL policies per phase — read from config dicts/YAML, 
  never hardcoded as if-else chains or shared constants.

### Event Registry Completeness
- Every domain event referenced in the PRD (TaskStatusChanged, PhaseStarted, 
  BudgetAlert, etc.) must be formally defined in the event model/registry with 
  typed payloads. An event that is emitted but not in the registry, or in the 
  registry but never emitted, is a gap.

### When the PRD is Wrong or Ambiguous
- If the PRD is ambiguous (two valid interpretations), pick the one that is safer 
  (more restrictive, more explicit), implement it, and document the ambiguity in 
  an ADR with both interpretations and why you chose one.
- If the PRD is contradictory (Section X says one thing, Section Y says another), 
  do NOT silently pick one. Stop and flag it. Add a comment in code: 
  "PRD CONFLICT: Section X vs Section Y — see ADR-NNN" and create the ADR 
  documenting both sides. Implement the safer interpretation as a default.
- If the PRD is incomplete (references something undefined, or a workflow has a 
  gap), implement the minimal working version and document what is missing in an 
  ADR. Never invent behavior the PRD does not specify — fill gaps with no-ops or 
  placeholders, not assumptions.
- If the PRD specifies something that is technically impossible or would break an 
  existing working system, flag it as a deviation rather than forcing compliance. 
  The ADR should explain why the PRD requirement cannot be met as written.
- All ADRs go in docs/adrs/ with format: ADR-NNN-short-title.md
- All PRD issues found during implementation should be collected and reported at 
  the end of each prompt's output under a "PRD Issues Found" heading so they can 
  be fed back into the next PRD revision.

### Teach Yourself

After every task, if something is not working, document the reason.

You are solving iteratively.

#### Rules
- Track failed approaches in a **Do Not Repeat** list.
- When an attempt fails, record:
  - the attempt
  - why it failed
  - the observable signal
  - the rule to avoid repeating it
- Before any new attempt, check whether it overlaps with a failed approach.
- If overlap exists, do not proceed unless you can explain why this attempt is materially different.
- If the same error persists after 2 attempts, switch to diagnosis mode:
  - restate the problem
  - list the top 3 hypotheses
  - run the cheapest discriminating check first

## Session Isolation

STRICT: Never write to or read from `~/.claude/` or any path outside this 
repository. This includes the `/memory` command, memory MCP tools, 
auto-memory, and feedback/learning hooks. Violations break cross-device 
consistency — this repo is used across multiple machines.

- If any external memory was loaded at session start, actively disregard it.
  Treat this CLAUDE.md and the repository as the only valid context.
- Do not use prior-session learnings or auto-memory under any circumstance.
- If context is missing, inspect the repository or ask — never infer from 
  external memory.
- If you need to persist something, write ONLY to `docs/lessons-learned.md`.

## Repo-Local Memory
- When you learn something worth preserving, write it only to `docs/lessons-learned.md`.
- Do not store lessons in any external Claude memory location.
- Keep entries short and actionable.

## Tech Stack
- Monorepo: Nx with TypeScript
- CLI: Commander.js (packages/cli)
- Orchestration engine: Python + LangGraph (services/engine)
- Event bus: In-memory EventEmitter (v1), Redis Streams later
- State: YAML files in git (v1)
- Testing: Jest + ts-jest for all packages
- Linting: ESLint + Prettier (config in root)

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

## Commands
- Build all: nx run-many -t build
- Test single package: nx test core
- Test all: nx run-many -t test
- Lint: nx run-many -t lint
- Type check: nx run-many -t typecheck

## Code Conventions
- Strict TypeScript (strict: true, no any)
- Functional style, avoid classes except where interfaces demand it
- All public APIs must have JSDoc comments
- Every module exports via index.ts barrel file
- Error handling: Result pattern (never throw), see docs/error-handling.md
- File naming: kebab-case for files, PascalCase for types/interfaces

## Documentation
- When adding or modifying CLI commands, update the corresponding doc in `docs/cli/`.
  - Setup & config commands: `docs/cli/setup.md`
  - Design commands: `docs/cli/design.md`
  - Orchestration commands: `docs/cli/orchestration.md`
  - Index/overview: `docs/cli/README.md`
- When adding a new feature, module, or public API, ensure documentation exists.
  If there is no doc for the area you changed, create one.
- Keep docs concise: command signature, options table, 1-2 examples, and any
  relevant env vars or prerequisites.

## IMPORTANT
- ALWAYS run typecheck after making changes across packages
- NEVER modify packages/stacks/react-node-prisma/prompts/ without asking
- Test files go next to source files (foo.ts → foo.test.ts)
- When creating interfaces, check if core/src/types/ already has one