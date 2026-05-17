# Development Discipline Rules

Non-negotiable rules that apply to every implementation task, bug fix,
and test written in this project. See `CLAUDE.md` for architectural rules
(Vision source of truth, Deviations, Rejected Patterns, Self-Correction).

## Full Ownership of All Tests

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

## PRD is Source of Truth (for product)

- PRD (`docs/specs/PRD.md`) defines product scope, interfaces, API contracts, enums,
  field lists. TypeScript interfaces in `packages/core/src/types/` are authoritative
  for field-level truth (ADR-038). When PRD and code diverge on field-level details,
  code wins and PRD is updated.
- Do NOT treat the PRD as authoritative on architectural _patterns_. Those are in
  the vision document.
- Do not hardcode values the PRD defines as configurable.

## Interface Completeness

- Include ALL fields from the TypeScript interface in `packages/core/src/types/`.
  The TypeScript interface is authoritative — not the PRD description. See ADR-038.

## Enum Coverage

- Every enum member must have a working implementation, even if minimal.
  Returning 400/404 for a defined enum value is a spec violation.

## Testing Integrity

- Tests must exercise the real server/API codepath, not internal functions.
  Never work around a server bug by calling internal methods — flag as deviation.

## Test Quality Gates

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

## Event Registry Completeness

- Every domain event referenced in the PRD (TaskStatusChanged, PhaseStarted,
  BudgetAlert, etc.) must be formally defined in the event model/registry with
  typed payloads. An event that is emitted but not in the registry, or in the
  registry but never emitted, is a gap.
- **Scope clarification:** events in this registry are for the **telemetry plane**
  (observability, audit, dashboard updates). They are NOT the coordination
  mechanism between agents. See vision Layer 2.

## Typed Contracts for Cross-Agent Artifacts

- Every artifact that crosses an agent boundary (PRD, EnrichedRequirement,
  AssumptionLedger, FeaturePlan, ChangeClassification, ScreenPlan, APIChangeSet,
  Diff, ReviewResult) has a Zod schema in `packages/core/src/types/`.
- Every LLM call with structured output uses `zod-to-json-schema` to produce the
  response schema.
- Every inter-node communication uses typed LangGraph channels, not untyped event
  payloads.
