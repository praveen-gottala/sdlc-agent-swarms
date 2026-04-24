# AgentForge Roadmap — Eight-Phase Rollout Plan

> The sequenced plan for shipping the missing pieces. Each phase produces
> something demoable. Merge each PR before starting the next phase.

---

## Phase sequence overview

| Phase | Goal | Demoable outcome |
|---|---|---|
| 0 | Foundation cleanup | Python engine deprecated via ADR; typed schemas in place; Postgres checkpointer working |
| 1 | Conversational PRD synthesis (clarifier) | New-project flow replaces text box; asks smart questions; produces structured PRD with assumption ledger |
| 2 | RAG layer | Agents can search code, designs, and docs with typed tool calls |
| 3 | Change classification + evolution spine | Change requests route to appropriate branch (UI / API / data / infra) |
| 4 | Design branch cross-screen coherence | Multi-screen design generation maintains nav, naming, token consistency |
| 5 | Implementation spine | Single-threaded implementer produces PRs from specs |
| 6 | Reviewer | Fresh-context reviewer catches spec drift, assumption violations |
| 7 | Durable state + observability | OTel tracing, prompt versioning, cost tracking, crash recovery |
| 8 | Evaluation harness | Automated eval with regression detection on PRs |

**Phase 8** is continuous — seeds with 5 scenarios, grows with each production failure.

---

## Phase 0 — Foundation cleanup

**Goal:** Remove the architectural drift that will block the new pieces.

**Tasks:**
- 0.1 — Orchestration runtime ADR (deprecates Python engine, commits to TypeScript LangGraph)
- 0.2 — Typed artifact schemas (Zod schemas for all cross-boundary artifacts)
- 0.3 — Postgres checkpointer substrate (Docker Compose + prisma + integration test)

**Prereq decision:** Python engine fate — is the migration total, or does any legacy code remain in Python? Answer in the ADR.

**Exit criteria:** ADR-023 merged; all shared artifact types have Zod schemas in `packages/core/src/types/`; integration test for Postgres checkpointer passes in CI.

---

## Phase 1 — Conversational PRD synthesis

**Goal:** Replace the text-box input with the six-stage clarifier. Symmetric across bootstrap and evolution modes.

**Tasks:**
- 1.1 — Clarifier package scaffold with integration spike
- 1.2 — Dashboard conversational UI (/new route with chat-like flow)
- 1.3 — ClarifyGPT-style consistency sampling in gap detection

**Exit criteria:** User submits seed at `/new`, clarifier asks ≤7 questions in ≤3 rounds, produces a structured PRD YAML with assumption ledger, dashboard shows PRD for approval.

---

## Phase 2 — RAG layer

**Goal:** Agents have typed access to code, design, and doc retrieval.

**Tasks:**
- 2.1 — Retrieval package scaffold + Aider-style repo map
- 2.2 — Qdrant setup and code embedding pipeline (voyage-code-3, Cohere Rerank)
- 2.3 — Document embedding pipeline (voyage-3-large)
- 2.4 — Wire RAG into the clarifier (bootstrap mode uses component catalog + patterns; evolution uses codebase + docs)

**Prereq decisions:** Voyage AI API key (voyage-code-3, voyage-3-large) and Cohere API key (Rerank 3.5) — account and billing must be set up before starting.

**Exit criteria:** `searchCodeTool`, `searchDocsTool`, `getRepoMapTool` all work as LangGraph tools; clarifier uses them to ground questions; evolution mode questions reference actual codebase patterns.

---

## Phase 3 — Change classification + evolution spine

**Goal:** Change requests route to the correct downstream branches.

**Tasks:**
- 3.1 — Classifier node (five scope axes: UI, component, design-system, API, data-model)
- 3.2 — Evolution spine graph with blast-radius analysis and stubbed downstream branches

**Exit criteria:** `/evolve` route accepts a change request, classifies scope, computes blast radius, routes to the right branch stubs. Design, API, data branches are stubbed but the routing and interrupts work.

---

## Phase 4 — Design branch cross-screen coherence

**Goal:** Multi-screen design generation maintains consistency.

**Tasks:**
- 4.1 — Per-screen pipeline refactored as a LangGraph subgraph
- 4.2 — Batch coordinator with topological ordering and in-the-loop coherence

**Exit criteria:** Affected screens generate in topological order, share a running context, in-loop coherence catches nav/naming/token drift before approval. HITL batch approval across all affected screens.

---

## Phase 5 — Implementation spine

**Goal:** Single-threaded tool-loop implementer produces working PRs.

**Tasks:**
- 5.1 — Implementer package + tool harness (workspace, read/write/patch, test/typecheck/lint, search, research subagent)
- 5.2 — Wire implementer into evolution spine (replace stub)

**Prereq decision:** Kill PRD Section 24.2's parallel code-gen spec before starting Phase 5 — update the PRD when the Phase 5.1 ADR is written.

**Exit criteria:** Given an approved architecture, implementer produces a diff in a git worktree that passes typecheck + lint + tests. Budget caps enforced. Assumption violations flagged via `report-assumption-violation` tool. PRD Section 24.2's parallel pattern killed via ADR.

---

## Phase 6 — Reviewer

**Goal:** Fresh-context reviewer catches what implementer's context-rotted attention misses.

**Tasks:**
- 6.1 — Reviewer package with deterministic gates + LLM review + assumption validator + triage

**Exit criteria:** Reviewer runs in fresh context, categorizes findings (blocking / suggestion / false-positive), triggers bounded implementer retry (≤2) before escalation.

---

## Phase 7 — Durable state + observability

**Goal:** Make the system debuggable and cost-trackable.

**Tasks:**
- 7.1 — OpenTelemetry + Langfuse + prompt versioning + cost tracking

**Prereq decision:** Langfuse self-host (docker-compose) vs managed cloud — leaning self-host for POC.

**Exit criteria:** Every LLM call and tool call emits spans visible in Langfuse. Prompt versions recorded per call. Cost aggregated per run / project / user. Pre-commit hook blocks prompt changes without version bump.

**Recommended:** Move Phase 7 earlier in practice — having traces during Phase 1-6 iterations is hugely valuable.

---

## Phase 8 — Evaluation harness

**Goal:** Know if changes help or hurt.

**Tasks:**
- 8.1 — Golden test set + eval runner + metrics + CI integration

**Exit criteria:** PR workflow runs sampled eval on agent changes, nightly full eval, regression alerts on >10% metric degradation.

**Seed scenarios:** 20 bootstrap + 50 evolution. Starter list in the Claude Code prompts file.

---

## Cross-phase rules

- **Integration spike first.** Every phase's first task verifies imports, tool availability, real function signatures. Failures stop the phase, not fall back to stubs.
- **No silent stubs.** When a precondition fails, raise a typed `NotYetImplemented` error with phase info.
- **ADR every deviation.** PRD-v2.md is the reference. Every divergence produces an ADR in `docs/adrs/`.
- **Typed contracts.** Every cross-boundary artifact has a Zod schema in `packages/core/src/types/`.
- **Task-level parallelism only.** No parallel write agents within a task. Git worktrees for independent-feature parallelism.
- **Deterministic gates own "done".** LLMs never self-declare success.

---

## Decision gates for leadership

Points at which Praveen should pause, assess, and decide whether to continue or pivot:

**After Phase 1:** Demo the clarifier. If it doesn't feel obviously better than the text box, reconsider.

**After Phase 2:** Measure code retrieval quality against a 100-item golden query set (queries agents would make during clarification and implementation). If < 70% precision@5 on code retrieval, invest more in RAG before moving on.

**After Phase 5:** Measure implementer success on the golden evolution set. If first-pass pass rate < 50%, the implementer prompt / context engineering needs more work before Phase 6.

**After Phase 7:** Assess total cost per feature. If > $5/feature on typical work, re-evaluate model choice and context sizing.

**Kill criteria:** if any phase fails its exit criteria twice after rework, reassess scope before continuing. If Phases 0-4 accumulate more blocked phases than completed ones, something is structurally wrong — reassess scope, not effort.
