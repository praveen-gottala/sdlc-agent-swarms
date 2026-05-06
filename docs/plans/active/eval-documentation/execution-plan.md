# Eval & Clarifier Documentation — Execution Plan

## Context

The eval harness for the Clarifier is built and working (live-tested with Vertex AI,
all 63 unit tests pass, 6 metrics populated). But there is **zero documentation** for
it in Backstage/TechDocs. Additionally, the Clarifier HITL resume flow has a critical
non-obvious gotcha (`updateState + stream(null)`) that is documented in lessons-learned
but has no architectural page explaining the full flow.

This plan audits all existing docs against the codebase, identifies gaps, and uses
`/backstage create` to fill them — focusing on the eval harness and clarifier pipeline.

---

## Documentation Audit Results

### What EXISTS (no action needed)

| Topic | Doc Path | Status |
|-------|----------|--------|
| Clarifier Pipeline | `docs/concepts/clarifier-pipeline.md` | Good |
| Clarifier Question Generation | `docs/concepts/clarifier-question-generation.md` | Good |
| Agent Taxonomy (spine stages) | `docs/concepts/agent-taxonomy.md` | Good |
| System Overview | `docs/concepts/overview.md` | Good |
| Design Evaluator | `docs/architecture/design-evaluator.md` | Good |
| Design Pipeline | `docs/concepts/design-pipeline.md` | Good |
| Observability / Langfuse | `docs/guides/langfuse-setup.md` | Good |
| Error Handling | `docs/architecture/error-handling.md` | Good |

### What is MISSING (action required)

| Priority | Topic | Doc Type | Proposed Path | Why |
|----------|-------|----------|---------------|-----|
| 1 | Evaluation Harness Overview | concept | `docs/concepts/evaluation-harness.md` | Core concept: why eval, what it measures, how it fits the SDLC |
| 2 | Eval Metrics & Regression Detection | architecture | `docs/architecture/evaluation-metrics.md` | 6 metrics, direction logic, baseline comparison, threshold math |
| 3 | Running & Authoring Eval Scenarios | guide | `docs/guides/evaluation-scenarios.md` | CLI usage, YAML format, recording/replay, authoring new scenarios |
| 4 | Clarifier HITL & Resume Flow | architecture | `docs/architecture/clarifier-hitl-resume.md` | LangGraph interrupt/resume, updateState pattern, escalation gate |

---

## Execution Steps

### Step 1: Create Evaluation Harness Concept Page

```
/backstage create concept evaluation-harness
```

**Content coverage:**

- What the eval harness is and why it exists
- Three-layer testing model: unit fixtures → cassette replay → live LLM
- The 4 scenarios: pomodoro (happy path), habit-tracker (ambiguity), force-multi-round (PRD mutation), escalation (max rounds)
- User simulator: cooperative personality, maxAnswersPerRound for forced multi-round
- RecordingProvider: record/replay LLM calls via JSONL cassettes
- Relationship to vision.md Layer 12 (Evaluation) target
- Diagram: scenario → runner → graph (interrupt/resume loop) → metrics → baseline comparison → report

**Authoritative sources:**

- `packages/eval/src/index.ts` — public API surface
- `packages/eval/src/runner.ts` — orchestration logic
- `packages/eval/src/types.ts` — Zod schemas, all type definitions
- `docs/vision.md` Layer 12 — evaluation target architecture

### Step 2: Create Evaluation Metrics Architecture Page

```
/backstage create architecture evaluation-metrics
```

**Content coverage:**

- The 6 metrics with direction, computation source, and business meaning:
  - `total-questions` (lower-is-better) — efficiency of clarification
  - `round-count` (lower-is-better) — convergence speed
  - `gap-overlap-ratio` (lower-is-better) — topic coverage quality
  - `prd-diff-bytes` (higher-is-better, nullable) — PRD expansion post-clarification
  - `prd-hash-equal-across-rounds` (boolean, nullable) — RED FLAG if PRD unchanged
  - `total-cost-usd` (lower-is-better) — LLM spend per run
- Nullable metric handling: returns `null` when prdUpdater never fires (escalation, single-round convergence)
- Regression detection: `compareToBaseline()` with 20% threshold, direction-aware delta
- Boolean regression: `false → true` for prd-hash-equal is always a regression
- Null exclusion: null metrics excluded from comparison, not treated as zero
- Cost tracking: `RecordingProvider.getCostSummary()` aggregates per-call `CompletionResult.cost`
- Type definitions: `ClarifierMetrics`, `MetricDefinition`, `RegressionResult`
- Report formats: markdown (terminal) and JSON (machine-readable)

**Authoritative sources:**

- `packages/eval/src/metrics/clarifier-metrics.ts` — metric computation
- `packages/eval/src/baseline/compare.ts` — regression detection logic
- `packages/eval/src/report.ts` — output formats
- `packages/eval/src/types.ts` — all type definitions

### Step 3: Create Evaluation Scenarios Guide

```
/backstage create guide evaluation-scenarios
```

**Content coverage:**

- CLI command reference:
  - `agentforge eval clarifier` — run all scenarios
  - `--scenario <id>` — single scenario
  - `--baseline` — promote to baseline
  - `--record` / `--replay` — cassette recording and replay
  - `--output json` — machine-readable output
  - `--threshold <pct>` — regression threshold
- YAML scenario schema with all fields explained:
  - `id`, `name`, `description`, `rawInput`, `mode`, `maxRounds`
  - `maxAnswersPerRound` — forces multi-round by leaving gaps unresolved
  - `expectedBehavior` — loose bands (informational, tighten after live data)
- How to author a new scenario: write YAML, add to `SCENARIO_FILES` array, add to `SCENARIO_IDS`
- Cassette management:
  - JSONL format with `seq`, `promptHash`, `model`, `result` (includes `cost`)
  - Cassettes are prompt-version-tied — re-record after any prompt template change
  - Replay-twice determinism: seq-based bucketed matching handles `Promise.allSettled` ordering
- Baseline workflow: record → establish baseline → modify clarifier → re-run → check regressions
- Cost expectations: ~$0.84 per pomodoro run on Vertex AI, ~4.5 minutes wall clock

**Authoritative sources:**

- `packages/cli/src/commands/eval.ts` — CLI implementation
- `packages/eval/src/scenarios/*.yaml` — scenario definitions
- `packages/eval/src/recording-provider.ts` — cassette format and replay logic
- `packages/eval/src/simulator.ts` — cooperative answer strategy

### Step 4: Create Clarifier HITL Resume Architecture Page

```
/backstage create architecture clarifier-hitl-resume
```

**Content coverage:**

- LangGraph StateGraph with `interruptBefore: ['storyWriter', 'escalationGate']`
- The interrupt/resume cycle:
  - Graph pauses before storyWriter → questions available in state
  - Human (or simulator) provides `HumanResponse[]`
  - Resume via `updateState(config, { humanResponses })` then `stream(null, config)`
- **Critical gotcha**: `stream(input, config)` RESTARTS from `__start__` — do NOT pass input
- `humanResponses` append reducer: `(a, b) => [...a, ...b]` accumulates across rounds
- Escalation gate: when `round >= maxRounds`, routing goes to `escalationGate` interrupt
  - Resume with `escalationDecision: 'accept' | 'restart' | 'abandon'`
- PRD snapshot capture: must snapshot `prdDraft` after first invocation, before any resume
- Dashboard vs eval runner: both use the same compiled graph, different resume patterns
  - Dashboard uses `runClarifierPipelineStream` (convenience wrapper)
  - Eval runner uses `compileClarifierGraph` directly for checkpoint control
- Data flow diagram: rawInput → contextRetriever → prdAnalyzer → gapDetector → questionPrioritizer → [interrupt] → storyWriter → critic → routing

**Authoritative sources:**

- `packages/agents-clarifier/src/graph/clarifier-graph.ts` — graph topology, routing functions
- `packages/agents-clarifier/src/graph/state.ts` — state annotation with reducers
- `packages/agents-clarifier/src/run.ts` — streaming entry point
- `packages/eval/src/runner.ts` — eval's resume implementation (the correct pattern)
- `docs/lessons-learned-rules.md` §"LangGraph Resume: updateState + stream(null)"

### Step 5: Update mkdocs.yml nav

Add the 4 new pages to the nav structure:

- `docs/concepts/evaluation-harness.md` under Concepts section
- `docs/architecture/evaluation-metrics.md` under Architecture section
- `docs/architecture/clarifier-hitl-resume.md` under Architecture section
- `docs/guides/evaluation-scenarios.md` under How-To Guides section

---

## Files to Create / Modify

| File | Action | Skill |
|------|--------|-------|
| `docs/concepts/evaluation-harness.md` | Create | `/backstage create concept evaluation-harness` |
| `docs/architecture/evaluation-metrics.md` | Create | `/backstage create architecture evaluation-metrics` |
| `docs/guides/evaluation-scenarios.md` | Create | `/backstage create guide evaluation-scenarios` |
| `docs/architecture/clarifier-hitl-resume.md` | Create | `/backstage create architecture clarifier-hitl-resume` |
| `mkdocs.yml` | Modify | Manual edit — add 4 nav entries |

---

## Verification

1. `mkdocs build` — all 4 new pages compile without errors
2. Blind subagent test (per CLAUDE.md): spawn an Explore agent with no context,
   ask it to figure out how to run the eval harness using only the project docs.
   If it can't find what it needs, the docs have gaps.
3. Admonition and formatting check: verify all pages use `!!!` admonitions, `???`
   collapsible sections, blank lines before lists, per `.claude/rules/docs-formatting.md`

---

## Out of Scope

- Architect/Implementer/Reviewer stage docs (stages not implemented yet)
- RAGAS integration guide (retrieval eval not built yet)
- CI pipeline integration guide (eval is local-only for now)
- Full 20-bootstrap / 50-evolution scenario documentation (Phase 8 scope)
