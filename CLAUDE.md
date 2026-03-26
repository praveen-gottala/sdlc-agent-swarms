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

### CLI Command File-Loading Tests
- Every CLI command that reads project files from disk (PRD, design tokens, brand
  spec, YAML configs) MUST have at least one integration test that uses real
  filesystem via `mkdtempSync`. Mock-only tests are insufficient for verifying
  file-loading paths.
- Pattern: create a temp directory, write the expected files (agentforge.yaml,
  docs/prd.md, agentforge/spec/*.yaml), mock `process.cwd()` to point there,
  run the command, and assert that file contents are loaded and reported.
- See `packages/cli/src/commands/design-figma-integration.test.ts` for the
  reference implementation.

### Data Flow Coverage
- When a pipeline has multiple stages, at least one test must verify that data
  from stage N actually influences stage N+1 output. Mock-only tests that
  validate output structure but not content flow are insufficient.
- When a function is exported but has zero call sites outside its own file and
  test file, it must either be wired into the pipeline or removed. Do not leave
  "defined but unwired" code — this is how the `buildDesignSystemContextFromSpec`
  bug went undetected.
- Pipeline stage functions must include runtime input validation guards that
  warn or fail early when inputs are degenerate (e.g., prdRequirements containing
  only short labels instead of full PRD content).

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
- **At session start, ALWAYS read `docs/lessons-learned.md`** before writing any code.
  Past bugs and anti-patterns are documented there. Ignoring them risks repeating them.
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

### Dependency & Model Versioning (CRITICAL)
- ALWAYS use the latest stable version of ALL dependencies — not just
  `@anthropic-ai/sdk` but also `openai`, `langgraph`, `langchain-core`,
  and every other package. LLM training data is stale — NEVER trust its
  version suggestions. Check npm/PyPI for the current version before writing
  or suggesting code that references a specific version.
- When adding or upgrading any dependency, run the FULL test suite afterwards:
  `nx run-many -t test` and `nx run-many -t typecheck`. A dependency update
  is not complete until all tests pass.
- When referencing Claude model IDs, use the latest model family:
  - Opus: `claude-opus-4-6`
  - Sonnet: `claude-sonnet-4-6`
  - Haiku: `claude-haiku-4-5`
- Use the latest SDK features (e.g., `output_config` for structured output)
  instead of workarounds (e.g., tool_use hacks for JSON output).
- Lesson learned: using outdated SDK versions (e.g., @anthropic-ai/sdk 0.39
  instead of 0.80) caused 10 days of wasted effort building manual JSON
  parsing that the SDK now handles natively.

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
designspec-renderer depends on: nothing (zero external deps, mirrors core types locally)

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

### Test & Fixture Placement Convention
All packages must follow this layout. No exceptions.

| What | Where | Example |
|------|-------|---------|
| Unit tests | `src/`, next to source file | `src/foo.ts` → `src/foo.test.ts` |
| Unit test fixtures | `src/__fixtures__/` | `src/__fixtures__/design-tokens.ts`, `src/__fixtures__/settings-form.json` |
| Integration tests | `__tests__/` at package root | `packages/designspec-renderer/__tests__/render-pipeline.integration.test.ts` |
| Integration fixtures | `__tests__/fixtures/` | `__tests__/fixtures/test-app-splitwise/design-tokens.yaml` |
| Generated test output | `__tests__/output/` (gitignored) | `__tests__/output/bill-entry/design.js` |

Rules:
- **Never** put integration tests in `src/` (e.g., `src/__integration__/` is wrong).
- **Never** put unit test fixtures in `__tests__/` — they belong in `src/__fixtures__/`.
- Integration tests import from the public barrel (`../src/index.js`), not
  internal modules. This verifies the package's public API surface.
- `__tests__/output/` must be in `.gitignore` and in `jest.config.cjs`
  `testPathIgnorePatterns` to prevent generated `.js` files from being
  picked up as test suites.
- App-specific fixtures (real project data like YAML configs) go in named
  subfolders under `__tests__/fixtures/` (e.g., `test-app-splitwise/`).

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

### CLI Command Change Checklist
When adding, modifying, or removing a CLI command or option, update ALL of these:

1. `packages/cli/src/commands/<command>.ts` — implementation
2. `packages/cli/src/index.ts` — Commander registration (`.command()`, `.option()`, `.action()`)
3. `packages/cli/src/index.ts` (bottom) — re-export types/functions if changed
4. `docs/cli/setup.md` or `docs/cli/design.md` or `docs/cli/orchestration.md` — detailed docs
5. `docs/cli/README.md` — CLI index table
6. `README.md` — top-level CLI Command Reference table
7. `packages/cli/src/commands/<command>.test.ts` — tests for new behavior
8. Interfaces/config types — e.g. `InitConfig`, `GenerateDesignOptionsConfig`

### New Domain Event Checklist
When adding a new event to the system, update ALL of these:

1. `packages/core/src/events/domain-events.ts` — define interface + add to `DomainEvent` union type
2. `packages/core/src/index.ts` — export the new event type
3. `packages/core/src/events/event-bus.test.ts` — type safety test for new variant
4. Governance subscribers (if event needs audit/HITL/budget handling):
   - `packages/governance/src/audit-logger.ts`
   - `packages/governance/src/hitl-enforcer.ts`
   - `packages/governance/src/budget-tracker.ts`
5. `packages/dashboard/src/lib/event-client.ts` — if event should appear in dashboard UI
6. Agent files that emit or react to the event

### New Package Checklist
When adding a new package to the monorepo, create/update ALL of these:

1. `packages/<name>/` — `package.json`, `tsconfig.json` (extends `../../tsconfig.base.json`), `tsconfig.lib.json`, `src/index.ts` barrel
2. Consumer `package.json` files — add as dependency in packages that import it
3. `README.md` — update Architecture package list
4. `CLAUDE.md` — update "Package Dependencies" section above

### New Agent Role Checklist
When adding a new agent role, update ALL of these:

1. `packages/cli/src/commands/init.ts` — add to `buildAgentsYaml()` with all 7 PRD sections (role, provider, execution, tools, permissions, hitl_policy, budget)
2. `packages/core/src/events/domain-events.ts` — add `on_complete` event if it doesn't exist
3. `packages/core/src/index.ts` — export the new event type
4. Agent implementation in `packages/agents-*/src/` — the actual agent logic
5. `packages/governance/src/permission-checker.ts` — if role has special permissions
6. `packages/governance/src/hitl-enforcer.ts` — if role has HITL gates
7. Tests: agent unit test + integration test in `packages/integration-tests/`

### Design Pipeline Change Checklist (MANDATORY)
`docs/design-pipeline-dataflow.md` is the **source of truth** for the end-to-end
design pipeline architecture. When modifying ANY of the following, you MUST update
the corresponding section in that document:

1. **Stage 0 (init)** — wizard questions, manifest shape, design options generation,
   component library/catalog logic, output files
   - Files: `packages/cli/src/commands/init.ts`, `generate-design-options.ts`,
     `design-system.ts`, `packages/core/src/catalogs/`
2. **Stage 1 (design:generate)** — app spec generation (pages/models/api), LLM
   prompts, output types, file writing
   - Files: `packages/cli/src/commands/design-generate.ts`
3. **Stage 2 (Research Agent)** — input/output types, LLM config, event wiring
   - Files: `packages/agents-ux/src/ux-research/`
4. **Stage 3 (Planning Agent)** — component tree, token bindings, validation loop,
   responsive rules
   - Files: `packages/agents-ux/src/ux-planning/`
5. **Stage 4 (Design Agent / Penpot)** — 3-phase pipeline (LLM → Execute →
   Self-correct), MCP tool usage, script generation
   - Files: `packages/agents-ux/src/ux-design/ux-penpot-design.ts`
6. **Stage 5 (Design Evaluator)** — evaluation dimensions, scoring, vision LLM config
   - Files: `packages/agents-ux/src/ux-design/design-evaluator.ts`
7. **Stage 6 (Feedback Loop)** — interactive commands, collaboration session,
   Penpot/Figma adapters
   - Files: `packages/agents-ux/src/ux-design/design-feedback-loop.ts`,
     `penpot-collaboration.ts`, `design-collaboration.ts`
8. **Stage 7 (Implementation Agent)** — input/output types, streaming config,
   generated file structure
   - Files: `packages/agents-ux/src/ux-implementation/`
9. **CLI Orchestration** — `design:penpot` options, execution flow, caching
   - Files: `packages/cli/src/commands/design-penpot.ts`
10. **Cross-cutting** — event flow, LLM model/token/temp changes, budget/governance
    changes, new file artifacts

What to update:
- ASCII diagrams if the flow changes
- Input/output type tables if fields are added/removed
- LLM usage table if model, tokens, or temperature change
- File artifacts map if new files are generated or paths change
- Event flow if events are added, renamed, or reordered
- Budget/governance table if HITL policy or budget limits change

A pipeline change without a doc update is **incomplete work** — treat it the same
as a missing test.

### DesignSpec Renderer Change Checklist (MANDATORY)
When modifying `packages/designspec-renderer/`, especially Penpot component
renderers in `src/renderer/penpot/components/`, follow these rules:

**Before implementing a component renderer:**
1. Read `docs/lessons-learned.md` section "Penpot Plugin API Rules"
2. Find a real generated Penpot script in any project's
   `.agentforge/previews/*/scripts/design.js` and locate the component
   you're implementing. Note the exact API calls, parameter formats,
   nesting structure, and numeric value ranges.
3. If no generated script exists yet, use the Penpot MCP tools
   (`penpot:high_level_overview`, `penpot:penpot_api_info`) to verify
   API contracts.

**Penpot plugin API hard rules (violations produce silent visual bugs):**
- `penpot.createBoard()` for ALL shapes. NEVER `createRectangle()` or
  `createEllipse()` — they don't support flex `layoutChild` properties.
- `board.flex.dir = 'column'` — set via the board's `.flex` property.
  NEVER via the returned flex object (silently fails).
- `appendChild(child)` MUST come BEFORE any `child.layoutChild.*` assignments.
- Shadow r/g/b: Penpot uses **0-1 floats**. CSS rgba uses 0-255 integers.
  Always divide by 255.
- Font weight: pass as **string** (`'700'`), not number.
- Root page board: explicitly set `x = 0; y = 0;` after creation.
- Divider fill opacity: `0.3` (not 1.0). Helper text opacity: `0.7`.
- Text > 18 chars: apply `growType = 'auto-height'` with
  `resize(wrapWidth, fontSize * 2.2)`.

**After implementing, verify with these greps:**
```bash
# Must return 0 results:
grep -r 'createRectangle\|createEllipse' packages/designspec-renderer/src/renderer/penpot/components/
# Must return 0 results (shadow RGB should be 0-1 floats):
grep -rn 'r: [0-9]\{2,\}' packages/designspec-renderer/src/renderer/penpot/components/shared.ts
```

**When delegating to subagents:** Include the Penpot API hard rules above
in the agent prompt. Subagents do not read CLAUDE.md or lessons-learned.md
automatically.

## IMPORTANT
- ALWAYS run typecheck after making changes across packages
- NEVER modify packages/stacks/react-node-prisma/prompts/ without asking
- Test files go next to source files (foo.ts → foo.test.ts)
- When creating interfaces, check if core/src/types/ already has one