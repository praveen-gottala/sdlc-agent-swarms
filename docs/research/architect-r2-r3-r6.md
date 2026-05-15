## # CHIP Framework: Unified Research Report on Task Decomposition (R2), Inter-Task Context (R3), and Spec-Driven Methodology (R6)

**Scope.** This report informs implementation of Architect **Node 4 (Contract Designer)** and **Node 5 (Task Planner)** and the **Implementer's inter-task handoff protocol**. It does not revisit locked spine decisions (single-threaded writer, git-worktree cross-task parallelism, ContractBundle as shared context, deterministic Critic gates, 200K token / 5 iteration / 15 min budget caps, fresh context per task, EARS criteria, OpenAPI 3.1, Zod schemas, LangGraph orchestration).

**Running example.** CashPulse — an expense tracker (T1 scaffold → T2 migration → T3 expense API ∥ T4 budget API → T5 backend tests → T6/T7/T8 frontend pages → T9 frontend tests → T10 integration). Brownfield variant: "Add budgeting to existing CashPulse."

**Evidence base.** Primary sources cited throughout: Cognition's *Don't Build Multi-Agents* (Yan, June 2025) and *Multi-Agents: What's Actually Working* (Yan, April 2026); Anthropic's *How we built our multi-agent research system* (June 2025); MetaGPT (Hong et al., arXiv 2308.00352, ICLR 2024); Spec Kit Agents (Taghavi & Bhavani, arXiv 2604.05278, April 2026); ACON (Kang et al., arXiv 2510.00615, Oct 2025); GitHub Spec Kit (github/spec-kit); Kiro (kiro.dev/docs); Cursor 2.0 Worktrees (cursor.com/docs); Claude Code Subagents (code.claude.com/docs/sub-agents); Devin 2.0 (cognition.ai/blog/devin-2).

## ## 1. Executive Summary

**Top-line recommendations (each rated HIGH/MEDIUM/LOW confidence, evidence-grounded):**

1. **Task granularity: screen/endpoint-level, ~5–15 tasks per feature.** [HIGH] Matches Kiro's `tasks.md` (typically 8–12 items, depends-on metadata, runs in concurrency "waves"), GitHub Spec Kit's `/speckit.tasks` (granular work items with dependencies), and MetaGPT's Engineer-role decomposition. File-level explodes the DAG; feature-level overruns the 200K/5-iter budget cap.

2. **Three-tier context package per task.** [HIGH] **T0** ContractBundle subset (~8–15K tokens after pruning) + **T1** dependency closure files via git worktree (~10–40K tokens, hard-capped) + **T2** on-demand `search_code`/`get_repo_map` tools. Mirrors Anthropic's lead/subagent split where each subagent gets "objective, output format, tools, task boundaries" and recovers further context via tool calls; ACON shows 26–54 % peak-token reduction via this exact pattern of compressed history + on-demand retrieval.

3. **Add `implementationPatterns` to `ArchitectureSpec`.** [HIGH] Cognition's Principle 2 ("actions carry implicit decisions") plus Spec Kit Agents §3.2 (context-grounding hooks fix "architectural violations") are converging evidence: parallel sibling tasks T3 ∥ T4 will diverge on error handling, response envelope, ORM choice unless patterns are explicit *before* either writes. Symptoms: T3 uses `Result<T,E>`, T4 throws; T5 tests cannot share assertion helpers.

4. **Add structured `TaskCompletionReport` to the handoff protocol.** [HIGH] Anthropic's research subagents emit a "condensed return artifact"; Claude Code subagents return only "final message" while intermediate tool calls stay isolated; Kiro tasks emit completion status. Git merge alone is insufficient — downstream tasks have *code* but no *decisions* (e.g., "T3 chose Drizzle ORM; envelope is `{ ok, data, error }`").

5. **No new TaskNode fields strictly required, but four additions strongly recommended:** [MEDIUM] `estimatedTokenBudget`, `contextRefs` (pointers into ContractBundle slices the task needs), `patternRefs` (which implementation patterns apply), and `acceptanceCriteriaIds` (EARS IDs from Clarifier the task satisfies). The `type` enum is adequate; do not add `shared`/`commons` types — handle shared code as an explicit scaffold sub-step within T1.

6. **Tests stay as separate tasks for cross-cutting test coverage; intra-task tests stay co-located.** [MEDIUM] CashPulse T5/T9/T10 are correct *as written*: they enforce contract-level coverage that the Critic's PRD-criterion gate measures end-to-end. Removing them would silently shift coverage enforcement into N implementation tasks, each of which can pass without exercising sibling integration.

7. **Contract specificity: data model column-level, API full OpenAPI 3.1 schemas, components prop-level signatures, screens data-binding-level (not pixel-level).** [HIGH] MetaGPT generates exactly this set of intermediate structured outputs and reports it is the single biggest source of its SoTA on HumanEval. Spec Kit's `contracts/` directory operates at the same granularity. Going more specific (pixel layouts in Architect) traps the system in re-planning; going vaguer reproduces the Flappy Bird failure mode from Yan's essay.

8. **EARS criteria are necessary but insufficient** for Implementer. [HIGH] EARS specifies behavior ("WHEN user navigates to Dashboard THE System SHALL display budget summary card..."); Architect must translate to interface shapes (`GET /api/budgets/current → { spent, limit, remaining, status }`). Kiro's `design.md` exists for precisely this reason — `requirements.md` (EARS) → `design.md` (interfaces) → `tasks.md`.

9. **Negative constraints belong in `ArchitectureSpec.constraints` and in ADRs, not in every task prompt.** [MEDIUM] Anthropic's subagent prompts embed scaling rules and tool boundaries directly; Cursor's worktree agents inherit project conventions via `.cursor/commands`. Negative constraints are most effective at the planner level ("DO NOT add tables beyond data model"); duplicating them per-task wastes context window.

10. **Brownfield is a first-class mode, not an afterthought.** [HIGH] Spec Kit Agents' read-only "discovery hooks" exist because plain SDD agents hallucinate APIs on existing repos; Kiro distinguishes Feature Specs vs Bugfix Specs; Cursor 2.0 worktrees presuppose a base branch. CHIP's `MODIFY` tasks must receive `existingDesignSpec` + `deltaTree` (per locked decision) and skip scaffold tasks.

**Confidence calibration.** Recommendations rated HIGH have at least two independent production-system citations. MEDIUM means strong reasoning from one production system or convergent reasoning across academic + production sources. No LOW recommendations are present in this summary — items lacking adequate evidence were deferred from "recommendation" to "open question" in §Cross-Cutting.

## ## 2. R2: Task Decomposition & Granularity

### Q1. Right granularity for a task — three-level decomposition of CashPulse

| Level | CashPulse decomposition | # tasks | Max width | Depth | Tokens/task |
|---|---|---|---|---|---|
| **Feature-level (coarse)** | T_A "Expenses end-to-end", T_B "Budgets end-to-end", T_C "Insights end-to-end" | 3 | 3 | 1 | ~150–250K (exceeds 200K cap) |
| **Screen/endpoint-level (medium)** | T1 scaffold, T2 migration, T3 expense API, T4 budget API, T5 backend tests, T6 dashboard, T7 add-expense, T8 insights, T9 frontend tests, T10 integration | 10 | 3 (T6∥T7∥T8) | 7 | ~40–80K |
| **File-level (fine)** | Each route file, each component file, each test file as separate tasks | ~25–35 | 8–10 | 12+ | ~15–30K |

**Recommendation: screen/endpoint-level (medium), confidence HIGH.** Evidence:

- **Kiro's `tasks.md`** is published explicitly at this level — AWS's "Kiro Project Init" template documents 12-task decomposition with `Depends:` metadata for a typical feature, sized for an LLM agent to complete each in a single session ([kiro.dev/docs/specs](https://kiro.dev/docs/), [aws.amazon.com/startups/prompt-library/kiro-project-init](https://aws.amazon.com/startups/prompt-library/kiro-project-init)).
- **GitHub Spec Kit's `/speckit.tasks`** generates "granular work items with dependencies and acceptance criteria" — the Taskify example walkthrough shows roughly one task per screen/endpoint ([github.blog Spec-Driven Development](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)).
- **MetaGPT's Engineer role** receives one "interface specification" and produces the corresponding code file, then the next Engineer invocation handles the next interface — approximately one-task-per-interface ([arXiv 2308.00352](https://arxiv.org/abs/2308.00352)).

Feature-level fails because a single "Expenses end-to-end" task touches migration + API + 2 frontend pages + tests (~150–250K tokens of context + generated code), blowing past the 200K hard cap and exceeding the 5-iteration limit on any non-trivial change. File-level fails because the DAG explodes from 10 to ~30 nodes for CashPulse, creating ~5× more cross-task handoffs — each handoff is a context-loss event per Cognition's Principle 1 ("share context across the whole system"). Empirically, Yan's *Multi-Agents: What's Actually Working* (April 2026) describes Cognition's current production manager-Devin pattern as decomposing into "an afternoon's work" units, not single-file edits.

### Q2. Shared code (utilities, components, configs)

**Recommendation: option (a) — dedicated scaffold task at writeOrder 0, plus a "commons extension" sub-step in the first feature task that legitimately needs it. Confidence HIGH.**

CashPulse already uses pattern (a) for T1 (scaffold). The question is how to handle *shared code that emerges later*: a `formatCurrency` utility needed by T6 dashboard, T7 add-expense form, and T8 insights.

- **Pattern (a) extended:** scaffold T1 includes `lib/format.ts` with `formatCurrency` because the data model in ContractBundle declares a `Money` type. Architect knows from `dataModel` what utilities are reachable a priori.
- **Pattern (b) (first-consumer-creates)** loses on Cognition's Principle 2: T6 picks an Intl API approach, T7 doesn't see T6's worktree until merge and re-implements with a different approach. Yan's "Flappy Bird" example is the canonical illustration.
- **Pattern (c) (commons pseudo-task)** breaks the single-writer invariant if any consumer task also needs to modify the commons file.

**Concrete rule for Node 4/5:** When ≥2 downstream tasks reference the same primitive (utility name, component name, type) derivable from `dataModel`/`componentComposition`, Node 4 must emit it into a scaffold task or shared-module task. Use `filePaths` ownership to enforce: `lib/format.ts` is owned only by T1; any task wishing to extend it must declare a follow-on task with that path. Tradeoff: Node 4 must do this analysis at design time (Architect cost), but it eliminates an entire class of merge-time conflicts.

### Q3. Brownfield vs greenfield decomposition

Brownfield is structurally different on four axes:

1. **NEW vs MODIFY task type.** NEW tasks behave like greenfield (full scaffolding, full ScreenPlan). MODIFY tasks receive a *delta* against existing artifacts — for frontend tasks the locked CHIP design says they get `existingDesignSpec` + `deltaTree` (unchanged/new/modified/removed nodes). This mirrors Kiro's **Bugfix Specs**, which document "current/expected/unchanged behavior" rather than full feature specs ([kiro.dev/docs/specs](https://kiro.dev/docs/specs/)).
2. **No scaffold task.** T1 is skipped; the existing `package.json`, `next.config.js`, `tailwind.config.ts` are inputs, not outputs. Critic's "single-writer" gate must treat pre-existing files as a third state (read-only, not owned by any task in this plan).
3. **Existing test compatibility.** Spec Kit Agents (arXiv 2604.05278) reports 99.7–100 % "repository-level test compatibility" as their primary brownfield safety metric — every task in a brownfield plan must declare which existing tests it must not break, and the Critic should add an additional gate (existing test command exits 0) or task-completion check.
4. **Impact analysis drives scoping.** Devin's published workflow ("analyze the task, search the codebase, plan its approach" — [cognition.ai/blog/devin-2](https://cognition.ai/blog/devin-2)) and Spec Kit Agents' "read-only probing hooks" both run a codebase exploration *before* generating the task list. Architect Node 4 should invoke `get_repo_map` before generating the TaskPlan for brownfield projects.

**Concrete brownfield decomposition: "Add budgeting to existing CashPulse"**

Assumes existing CashPulse already has T1 scaffold, T2 expense migration, T3 expense API, T6 dashboard with expense list, T7 add-expense form. Adding budgets:

| Task | Type | Mode | filePaths | Deps | writeOrder | Notes |
|---|---|---|---|---|---|---|
| B1 | backend | NEW | `migrations/002_budgets.sql` | — | 1 | New table only; no scaffold |
| B2 | backend | NEW | `api/budgets/route.ts` | B1 | 2 | New endpoint following T3's existing pattern (discovered via search_code) |
| B3 | backend | MODIFY | `api/expenses/route.ts` | B1, B2 | 2 | Add budget-status field to expense response; delta = +3 lines |
| B4 | test | NEW | `tests/api/budgets.test.ts` | B2, B3 | 3 | Test new endpoint + modified shape |
| B5 | frontend | NEW | `app/budgets/page.tsx`, `app/budgets/new/page.tsx` | B2 | 4 | New screens; uses existing PageHeader (commons) |
| B6 | frontend | MODIFY | `app/dashboard/page.tsx` | B2, B5 | 4 | Add budget summary card; delta against existingDesignSpec |
| B7 | test | NEW | `tests/e2e/budgets.spec.ts` | B5, B6 | 5 | |
| B8 | integration | NEW | `tests/integration/budget-flow.test.ts` | B4, B7 | 6 | |

**Note** the count drops from 10 to 8, scaffold is gone, MODIFY tasks (B3, B6) replace what would be NEW tasks in greenfield, and B5's frontend task explicitly references existing commons. This is exactly the brownfield shape Spec Kit Agents' evaluation runs on (32 features × 5 repos).

### Q4. Heuristics for "task too big" / "too small"

Hard-data derived thresholds, anchored to CHIP's locked budget caps (200K tokens, 5 iterations, 15 min):

| Signal | Too small | Right | Too big |
|---|---|---|---|
| **Files written** | 1 file that's <30 LOC | 1–4 files, 50–400 LOC each | >5 files or >800 LOC total |
| **Estimated input tokens** | <8K (Tier-0 alone > task content) | 20–80K | >120K (leaves <80K for output+iterations) |
| **Estimated output tokens** | <500 | 1.5K–8K | >12K (a 5-iter loop won't converge) |
| **Sequential write steps** | Just 1 (e.g., one component, no test) | 2–4 of {migration, backend, backend-test, frontend, frontend-test, integration} | 5+ (run out of iterations) |
| **Direct dependency fan-in** | 0 (likely a scaffold leaf) | 1–3 | 4+ (combinatorial merge surface) |
| **Direct dependency fan-out** | 0 (orphan) | 1–4 | 5+ (this task is a bottleneck — split it) |
| **EARS criteria satisfied** | 0 (task isn't from PRD) | 1–3 | 4+ (probably a feature, not a task) |

**Reasoning anchored to evidence:**
- **200K cap → 120K input ceiling.** Anthropic's *Multi-Agent Research* post explicitly states their system targets "managing that 200,000 token context limit" by giving each subagent its own context. Allowing >120K input leaves <80K headroom for 5 iterations × (tool calls + reasoning + generated code), and Context Rot ([trychroma.com/research/context-rot](https://www.trychroma.com/research/context-rot), cited by Cognition's *Multi-Agents: What's Actually Working*) degrades quality long before the hard cap.
- **Fan-out ≥5 = bottleneck.** Anthropic's effort-scaling rules ("1 agent for simple fact-finding, 2–4 for direct comparisons, 10+ for complex research") imply that a node fanning out to >5 downstream tasks is doing the orchestrator's job and should be split.
- **Output 12K ceiling.** Cursor 2.0 worktrees + Composer model docs note "most turns under 30 seconds" — a 12K-token output is typically 4–6 turns, which leaves no headroom for the 5-iter budget when revisions are needed.

### Q5. How real multi-agent systems handle task granularity

- **Kiro (AWS).** `tasks.md` is generated from `design.md` by Kiro's Spec engine. Each task carries `Status`, `Depends`, `Effort` (e.g., "2-3h"), `Files`, `Acceptance Criteria`. The AWS-published template shows 12 tasks for a typical feature (Tasks 1–12 with explicit critical path 1→2→...→12). Kiro's executor groups independent tasks into "waves" (Wave 1 = no deps run concurrently; Wave 2 = deps satisfied by Wave 1). **Granularity is endpoint/screen-level, 8–15 tasks per feature.** ([kiro.dev/docs/specs](https://kiro.dev/docs/specs/), [aws.amazon.com/startups/prompt-library/kiro-project-init](https://aws.amazon.com/startups/prompt-library/kiro-project-init))

- **GitHub Spec Kit.** Phase 2 `/speckit.plan` produces `contracts/data-model.md`, `contracts/api.md`, `quickstart.md`, `research.md`. Phase 3 `/speckit.tasks` "breaks down the specification and plan into a list of actionable tasks" with dependencies. Tasks are scoped so an agent (Copilot/Claude Code/Cursor) can complete each one — typically a single file or tight pair of related files. Spec Kit's workflow YAML shows a `fan-out` step type with `max_concurrency: 3` for parallel task implementation, confirming the target granularity is small enough to parallelize but large enough to be useful units. ([github.com/github/spec-kit](https://github.com/github/spec-kit))

- **MetaGPT (arXiv 2308.00352).** Architect role outputs `system_design.md` containing data structures, interface definitions, sequence diagrams. The "Project Manager" role transforms this into a task list where each task is "one class/interface to implement" — fine but functional. Each Engineer call writes one file (one class). MetaGPT's appendix shows a typical 2048-game decomposition has ~6–10 tasks. **One task = one interface/class.** This is finer than Kiro/Spec Kit because MetaGPT's roles run sequentially through a SOP; CHIP's screen-level granularity sits between MetaGPT (class-level) and feature-level.

- **Cursor 2.0.** Worktree-based parallel agents are scoped by the developer: each worktree gets "the same prompt" by default unless the developer/orchestrator partitions. The community workflow (`git-worktree-toolbox`, [medium.com/@shahsoumil519](https://medium.com/@shahsoumil519/how-to-run-cursor-subagents-in-parallel-with-git-worktrees-b8d7d5d298fc)) shows two parallel agents per ticket — one for tests, one for docs — at ticket-level scoping. Cursor.com docs explicitly note "agents do not coordinate with each other" within a parallel run, putting the burden of correct decomposition on the orchestrator. **Granularity = whatever-fits-in-isolated-worktree, typically 1–5 file changes.**

- **Devin (Cognition).** Interactive Planning ([cognition.ai/blog/devin-2](https://cognition.ai/blog/devin-2)) produces a "step-by-step plan" the user reviews before execution. Cognition's *How Cognition Uses Devin* ([cognition.ai/blog/how-cognition-uses-devin](https://cognition.ai/blog/how-cognition-uses-devin-to-build-devin)) describes the typical Devin task as "an afternoon's work" — feature-scoped but single-Devin-execution; the manager-Devin pattern (introduced April 2026) breaks larger work across child Devins, each at a CHIP-task-equivalent scope.

- **Claude Code.** The tool-loop agent doesn't decompose work into formal "tasks"; instead, subagents are spawned for *read-only* side investigations (Explore, Plan subagents) to keep main context clean. The main agent's "task boundary" is the user turn. ([code.claude.com/docs/sub-agents](https://code.claude.com/docs/sub-agents)) For CHIP this is informative — the Implementer per-task pattern is closer to "main agent gets a fresh context per CHIP-task", with subagent-like sub-tools (`search_code`, `get_repo_map`) for grounding.

**Convergent finding:** Production systems cluster at endpoint/screen-level granularity (Kiro, Spec Kit) or one-class-per-task (MetaGPT). No production system uses file-level decomposition for every file, and feature-level decomposition is reserved for orchestrator-level planning, not the leaf executor.

### Q6. Tests as separate tasks vs co-located within implementation tasks

**Recommendation: keep T5/T9/T10 as separate test tasks for cross-cutting / integration coverage; co-locate unit tests within implementation tasks via sequential write order. Confidence MEDIUM.**

The CashPulse DAG already implements the hybrid correctly: the Implementer's locked sequential write order (DB migration → backend → backend tests → frontend → frontend tests → integration test) means *each implementation task already includes its proximate tests*. T5 and T9 are *cross-task coverage* tasks that exist because:

1. **PRD-criterion coverage gate.** Critic checks that every EARS criterion has a passing test. If T3 only tests `/api/expenses` and T4 only tests `/api/budgets`, no single task verifies "expenses correctly increment budget consumption" — that's T5's role.
2. **Independent test failure isolation.** Kiro's task template separates "Task N: feature" from "Task N+1: tests" precisely so test failures don't roll back implementation work ([aws.amazon.com/startups/prompt-library/kiro-project-init](https://aws.amazon.com/startups/prompt-library/kiro-project-init)). Spec Kit's `quickstart.md` artifact serves the same role.
3. **Test as integration gate.** T10 integration test depends on both T5 and T9 — it's the last gate before Reviewer. Folding it into the last implementation task (say T8) would mean T8 fails the entire integration suite for its own scope error.

Counterargument (acknowledged): Cognition's *Multi-Agents: What's Actually Working* describes single-agent linear execution as the reliability baseline, suggesting *fewer* tasks is safer. But Cognition's argument is about *agent count*, not test isolation — and they run Devin Review as a separate agent specifically because clean context improves coverage detection. For CHIP, the analogous benefit is: T5 with a fresh context against the merged T3/T4 worktree can find integration gaps that T3/T4's own tests miss.

### Q7. TaskNode schema adequacy

Current schema (locked): `id, title, description, filePaths[], dependencies[], writeOrder, type`.

**Adequate:** Yes for executing the DAG. The Critic's existing gates (DAG acyclic, single-writer, schema validation) are well-served.

**Missing fields, recommended additions (Zod defined in §6):**

1. **`estimatedTokenBudget: number`** — soft budget cap per task. Architect Node 5 estimates input tokens (Tier-0 + Tier-1) + expected output. If estimate >150K, the planner must split the task. Evidence: Anthropic's effort-scaling rules embed exactly this kind of estimate per subagent.

2. **`contextRefs: ContextRef[]`** — explicit pointers to ContractBundle slices the task needs. E.g., `{ kind: 'apiChangeSet', id: 'expenses-v1' }`, `{ kind: 'dataModel', entityId: 'Expense' }`. Without this, the Implementer must load the full ContractBundle (typically 30–80K tokens) per task, leaving little headroom. With it, Tier-0 context shrinks to relevant slices only.

3. **`patternRefs: string[]`** — IDs of `implementationPatterns` from `ArchitectureSpec` the task must follow (e.g., `error-handling-result-type`, `response-envelope-v1`). This is the direct fix for Cognition's Principle 2 / Spec Kit Agents' architectural-violation failure.

4. **`acceptanceCriteriaIds: string[]`** — EARS criteria from `EnrichedRequirement` that this task fully or partially satisfies. Required for Critic's PRD-coverage gate to be precise rather than holistic, and required for the Reviewer's 4-pass review to know what to verify.

5. **`mode: 'NEW' | 'MODIFY'`** (brownfield only) — already implicit in the design-spec handoff for frontend tasks; should be first-class on TaskNode so that Critic and Implementer can branch on it. Spec Kit Agents and Kiro both use this distinction.

**Do NOT add:**
- `estimatedTimeMinutes` — wall-clock is already capped at 15 min; estimates here are noise.
- `priority` — DAG topology determines order; priority outside the DAG creates a second source of truth.
- `assignee` / `model` — Implementer model selection is a runtime concern, not a TaskNode concern (matches Cognition's recommendation against pre-committing routing decisions).
- Additional `type` enum values (e.g., `shared`, `docs`). The five existing values map cleanly to write order; `shared` should be a `scaffold` subtype handled in T1.

## ## 3. R3: Context Management Between Tasks

### Q1. Three-tier context package per dependent task

Recommended composition for an Implementer invocation, with concrete token estimates calibrated to the 200K cap:

| Tier | Content | Always present? | Est. tokens | Sufficient when… | Insufficient when… |
|---|---|---|---|---|---|
| **T0: Project invariants** | `system_prompt + Implementer harness + tool descriptions + projectId + constraintSet + architectureSpec + implementationPatterns + adrs[] + relevant dataModel entities + relevant apiChangeSets + relevant componentComposition + relevant screenPlans + assumptionLedger + the task itself` | Yes | **8–20K** (pruned via `contextRefs`); **30–80K** if full bundle loaded | Greenfield single-feature tasks; small data models | Brownfield with large legacy data model; tasks crossing many feature domains |
| **T1: Dependency closure** | Files written by direct dependency tasks (`dependencies[]`), available in the worktree via merge of upstream branches | Yes | **5–40K** (cap recommended at 50K) | Task depends only on schema + sibling backend endpoint | Frontend task that depends on the *internal helpers* of multiple backend tasks |
| **T2: On-demand discovery** | `search_code(pattern)`, `get_repo_map(scope)` invoked by Implementer as tools | On request | **0–30K** (varies per call) | Task needs to follow an existing pattern not captured in patternRefs | Tool-call budget exhausted by exploration before any writing begins |

**Rationale rooted in evidence:**

- ACON (arXiv 2510.00615) establishes that *condensing observations + history* yields 26–54 % peak-token reductions with negligible accuracy loss — this is the T0+T1 strategy: pre-condense the contract into "relevant slices" and let the agent fetch more via T2.
- Anthropic ([anthropic.com/engineering/multi-agent-research-system](https://www.anthropic.com/engineering/multi-agent-research-system)) explicitly states: "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries" — exactly the T0 contents — and that subagents recover further information through tool calls (T2).
- Cognition's *Multi-Agents: What's Actually Working* discusses "Context Rot": models degrade with longer context even within the window, so the design target is the *smallest sufficient* context, not the largest fitting context. ACON's "ACON-UTCO" variant operationalizes this with a "compression maximization" step after utility maximization.

**Budget recommendation:** Tier 0 + Tier 1 ≤ **120K**. The remaining **80K** is for 5 iterations × (tool results + reasoning + generated code).

### Q2. Context scoping per dependency type

For each dependency relationship in CashPulse, the necessary/noise/dangerous classification:

| Edge | Necessary | Noise (omit) | Dangerous if shared (reasoning drift) |
|---|---|---|---|
| **T3 (Expense API) → T2 (migration)** sequential | Migration SQL (full file), generated types | T2's iteration trace, test stubs from T2 if any | Sharing T2's *reasoning history* — Implementer might "re-decide" the schema and produce non-matching field names |
| **T3 ∥ T4 (parallel siblings on T2)** | None (siblings don't see each other during execution) | T3 sees T4's code | T3 reading T4's *in-progress* worktree — race condition, drift on response shape if T3 races ahead with a different envelope |
| **T6 (Dashboard) → T3 (Expense API)** cross-layer | The exact response shape (from `apiChangeSets`); generated client types; T3's final route file (for endpoint URL) | T3's internal `query.ts` helper; T3's error-handling reasoning trace | Including T3's full code teaches T6 to "trust" internal details that may change; T6 should only depend on the *contract surface* of T3 |
| **T5 (backend tests) → {T3, T4}** test fan-in | Full implementation of T3 and T4; mock data fixtures | Implementation-internal helpers if not exported | Letting T5 see the test patterns *both* siblings used — T5 must enforce a single test style, not blend two |

**Concrete rule for the Implementer's startup prompt:**
- *Sequential dep:* include the dependency's final written files in the worktree (already done by git merge) **plus** the relevant `apiChangeSet`/`dataModel` slice from ContractBundle. Do **not** include the dependency's reasoning trace.
- *Parallel siblings:* explicitly state "T_k is being implemented in parallel; you will not see T_k's code. Your contract surface with T_k is defined by ContractBundle.apiChangeSets[k] (or dataModel)." This is the Cognition Flappy-Bird mitigation — make the implicit decision explicit.
- *Cross-layer:* prefer the *contract* over the *code*. Anthropic's lead-subagent communication uses condensed summaries, not raw traces.
- *Test fan-in:* include the full final code of dependencies but explicitly enumerate the EARS criteria the tests must cover (avoid testing implementation details).

### Q3. Context compression techniques and token budgets

| Compression level | Description | CashPulse example (T6 receives) | Tokens | When sufficient |
|---|---|---|---|---|
| **Full files** | Raw source of all dependency outputs | T3's full `route.ts`, T2's full migration, full ContractBundle | 60–150K | Never optimal for CHIP; only for very small tasks |
| **Repo map** | Tree + function signatures + types (no bodies) | T3's exported handlers + types, T2's table DDL, ContractBundle schemas | 8–25K | When patterns are well-established and Implementer has search_code |
| **Contract slice** | Just the ContractBundle sub-objects relevant to the task | T6 gets `dataModel.Expense` + `apiChangeSets.expenses` + `screenPlans.dashboard` + `componentComposition.dashboard` | 5–15K | Greenfield, new code, no existing repo patterns to follow |
| **Task completion report (proposed)** | Structured upstream-task summary (see Q6) | T3's report: "Wrote `api/expenses/route.ts`. Exposes `GET /api/expenses → Expense[]`. Uses Result-type error handling. Assumes Postgres timestamptz. Added migration helper `withTransaction()` at `lib/db.ts`." | 0.5–2K per upstream task | All cases — composes with other compression levels |
| **Dependency diff vs base** | `git diff base..upstream-branch` rather than full upstream files | The diff that introduced `api/expenses/route.ts` | 2–10K | Brownfield MODIFY tasks |

**Recommendation: combine "contract slice" + "task completion report" + "dependency diff (MODIFY only)" + on-demand search_code.** This achieves ACON-style compression with the structured-report pattern Anthropic uses for subagent return values.

**Quantitative target for CashPulse T6 (dashboard, depending on T3):**
- T0 contract slice: ~8K (full bundle would be ~50K)
- T1 task completion reports from T3 (and transitively T2): ~3K total
- T1 dependency files (T3's route.ts since T6 will call this endpoint, T2's migration for grounding): ~6K
- System prompt + tool descriptions: ~4K
- **Total Tier 0+1: ~21K**, leaving ~180K for iterations.

Compare against naïve full-ContractBundle + full-upstream-files: ~95K, leaving only ~105K — workable but markedly worse, particularly under Context Rot.

### Q4. How real systems handle inter-task context

- **Cursor 2.0 worktrees.** A worktree-based parallel agent starts with: the prompt (same across siblings unless orchestrator partitions), the worktree's branch checkout (so it sees the merged base + whatever the branch already has), the project's `.cursor/commands` and `.cursor/rules` (project conventions), and tools (read/edit/grep/bash). No structured cross-agent metadata; agents are isolated. ([cursor.com/docs/configuration/worktrees](https://cursor.com/docs/configuration/worktrees), [cursor.com/blog/agent-best-practices](https://cursor.com/blog/agent-best-practices)) **CHIP improves on this** with ContractBundle + planned TaskCompletionReport — Cursor's "agents do not coordinate" is a documented limitation, not a virtue.

- **Cognition Devin task handoff.** *How Cognition Uses Devin*: "Devin starts with clear context from our exploration, and the prompt is automatically tailored to our task." For multi-Devin manager pattern (Yan, April 2026): the manager passes condensed task descriptions; child Devins do their own codebase exploration via Deepwiki-style read-only subagent. Cross-agent communication "doesn't happen by default" — Cognition had to train models for it. **Implication for CHIP:** explicit structured handoff (TaskCompletionReport) is exactly the mechanism Cognition reports they needed to add.

- **Claude Code subagents.** Each subagent runs in its "own context window with a custom system prompt, specific tool access, and independent permissions." "Each subagent runs in its own fresh conversation. Intermediate tool calls and results stay inside the subagent; only its final message returns to the parent." ([code.claude.com/docs/sub-agents](https://code.claude.com/docs/sub-agents), [claude.com/blog/subagents-in-claude-code](https://claude.com/blog/subagents-in-claude-code)) The subagent receives: the parent agent's request + the subagent's system prompt (with `description`, tools, model). **This is the fresh-context-per-task pattern CHIP already commits to.** Anthropic's published guidance explicitly says subagents should return structured summaries.

- **Anthropic multi-agent research system.** Subagents do *not* see the full lead-agent trace. They get "objective, output format, tools, task boundaries." The CitationAgent example: receives only the research report + documents, not the trace of how the documents were found. **Empirically:** Anthropic states multi-agent systems use 15× more tokens than chat — and 80 % of performance variance on BrowseComp was explained by token usage and tool-call count (not prompt phrasing). This is strong evidence that *context-budget engineering* matters more than prompt phrasing within reasonable bounds.

- **ACON (arXiv 2510.00615).** A *learned compressor* condenses observation + history into "concise yet informative condensations." Results on AppWorld/OfficeBench/Multi-Objective-QA: 26–54 % peak-token reduction; >95 % accuracy retention when distilled. The mechanism is *failure-driven guideline optimization*: paired trajectories where full context succeeds but compressed context fails reveal what to preserve. **Implication for CHIP:** the format of TaskCompletionReport should be designed empirically — start with a candidate schema (files-written, interfaces-exposed, patterns-used, assumptions, deviations), and iterate based on observed downstream failures.

### Q5. Hard cap on inter-task context and truncation strategy

**Recommended fixed allocations within 200K window:**

| Segment | Tokens | % |
|---|---|---|
| System prompt + Implementer harness instructions | 4K | 2 % |
| Tool descriptions (search_code, get_repo_map, report-assumption-violation, write-file, etc.) | 2K | 1 % |
| ContractBundle slice (Tier 0, via `contextRefs`) | up to 15K | 7.5 % |
| ImplementationPatterns (Tier 0) | up to 5K | 2.5 % |
| Task description + acceptance criteria + assumption ledger | up to 4K | 2 % |
| Dependency closure: upstream task completion reports | up to 6K (3 deps × 2K) | 3 % |
| Dependency closure: upstream code files | up to 40K | 20 % |
| **Subtotal input ceiling** | **76K** | **~38 %** |
| Reserve for 5 iterations × (tool results + reasoning + generated code) | 124K | 62 % |

**Truncation strategy when context exceeds budget (priority order, top = most preserved):**

1. System prompt + tool descriptions (never truncated)
2. Task description + EARS criteria + this task's `patternRefs`
3. The *delta/diff* portions of relevant ContractBundle slices
4. Task completion reports for direct dependencies (compressed structured form)
5. Implementation patterns full text (truncate to just the relevant rules)
6. Upstream code files (drop in reverse dependency order — keep the most recent dependency)
7. Wider ContractBundle context (drop entities/endpoints not referenced)
8. Cross-cutting ADRs not relevant to this task

The Critic should refuse to ship a task with estimated input >120K (recommendation #1's split signal). The Implementer should report-assumption-violation if it has to drop a `patternRef` to fit.

### Q6. Explicit TaskCompletionReport

**Recommendation: YES. Add `TaskCompletionReport` to the inter-task handoff protocol. Confidence HIGH.**

A structured report emitted at task completion (after Critic's gates pass), feeding the next task's Tier 1 context:

```typescript
TaskCompletionReport = {
  taskId, branchName, commitSha,
  filesWritten: { path, mode: 'created'|'modified'|'deleted', linesAdded, linesRemoved }[],
  interfacesExposed: {
    apis: { method, path, requestShape, responseShape, statusCodes }[],
    types: { name, location, summary }[],
    components: { name, location, propsSignature }[]
  },
  testsAdded: { path, count, coversCriteriaIds }[],
  patternsApplied: string[],   // patternRef IDs honored
  assumptionsMade: { description, criticality }[],
  deviationsFromContract: { contractSlice, deviation, justification }[],
  assumptionLedgerEntriesAdded: string[]
}
```

**Justification:**

1. **Anthropic explicit guidance.** "Subagents condense the most important tokens for the lead research agent" — return artifacts, not traces. Anthropic's CitationAgent operates on condensed handoffs, not raw subagent transcripts.

2. **Cognition's evolution.** *Don't Build Multi-Agents* (June 2025) → *Multi-Agents: What's Actually Working* (April 2026) explicitly cites the need for cross-agent communication and that "cross-agent communication … doesn't happen by default, because models haven't been trained in environments where it needed to. Each of these took dedicated work to fix." Structured reports are the engineering fix.

3. **Spec Kit Agents (arXiv 2604.05278).** Their *validation hooks* operate on intermediate artifacts — TaskCompletionReport is the artifact a validation hook should run against.

4. **Cost.** One extra LLM call (~$0.01) per task to generate the report, ~2K tokens. Compared to a 200K-token Implementer task, this is ~1 % overhead — and it removes the need for downstream tasks to load *upstream code files* to discover the same information by reverse engineering.

**Counterargument (acknowledged):** The Critic already validates contract adherence; if the Critic passes, why also generate a report? Because the Critic gates *correctness*, while the report communicates *decisions* — exactly the implicit-decisions problem Cognition's Principle 2 names. Confidence remains HIGH.

### Q7. Is the integration branch as sole communication channel sufficient?

**No. Confidence HIGH.** The integration branch carries *code* but not *decisions*.

Concrete scenario: T1 creates `api/expenses/route.ts` using a `Result<T, E>` discriminated union for error handling. T2 (depending on T1) is created on a worktree from the integration branch. T2's Implementer must:
- (a) Read T1's code via search_code — *possible* but expensive (3–8K tokens of exploration; risk of misreading);
- (b) Reverse-engineer T1's choice from the file — *possible* but error-prone (was this an intentional pattern or a one-off?);
- (c) Read a `TaskCompletionReport` from T1 that says "patternsApplied: ['error-handling-result-type']" — *cheap and unambiguous*.

This is precisely the Spec Kit Agents "context blindness" failure mode (arXiv 2604.05278 §1): "the agent's intermediate artifacts can be internally coherent while being incompatible with the repository as it exists." Their fix is read-only probing hooks at every stage — exactly the role of `search_code`/`get_repo_map` (T2 tools) **plus** a structured artifact like TaskCompletionReport.

**Recommendation:** `search_code`/`get_repo_map` are insufficient *alone* for two reasons:
1. They cost iterations (CHIP has only 5). Spending iterations 1–2 discovering patterns leaves 3 for real work.
2. They cannot recover *why* something was done — only *what*.

The combined design — git worktree merge (carrying code) + TaskCompletionReport (carrying decisions and pattern references) + on-demand tools (carrying recoverable detail) — is the convergent design across Anthropic (objective+output-format+tools), Cognition (single-writer + structured manager↔child communication), and Spec Kit Agents (artifact + grounding hooks).

## ## 4. R6: Spec-Driven Development Methodology

### Q1. Minimum viable contract per artifact

| Artifact | Essential (minimum viable) | Nice-to-have | What breaks if you go below essential |
|---|---|---|---|
| **Data model** | Entity name + fields with types + relationships + identity field + unique constraints | Indexes, partial constraints, computed columns, retention rules | Cascading migration conflicts; T3 invents a foreign-key column name T4 doesn't recognize (Yan's "implicit decisions") |
| **API contracts** | Full OpenAPI 3.1 paths, request schemas, response schemas, error response shape, status codes used | Examples, descriptions, security schemes if not project-wide | Spec Kit Agents (arXiv 2604.05278): "referencing non-existent APIs" — the canonical brownfield failure |
| **Component composition** | Component name + prop-level signature (TS types) + parent-child structure + slot/children semantics | Visual variants, animation specs, accessibility annotations | Sibling frontend tasks build incompatible prop interfaces; merge fails on type errors |
| **Screen specs** | Data bindings (which data this screen reads), navigation in/out (which routes lead here, which it links to), state transitions | Pixel-perfect layouts, exact wording, motion specs | Frontend Implementer over-invents UX detail not tied to behavior; design drift across sibling screens |
| **Design system diff** | List of new/modified/removed tokens (color, spacing, type) + their target values | Migration scripts, deprecation timeline | Token mismatch between sibling components; visual inconsistency |

**Evidence that less doesn't work:**

- **MetaGPT (arXiv 2308.00352)** explicitly elevated "interface specification" from prose to structured artifact and reports it is the difference between cascading hallucination and SoTA performance — full quote: "MetaGPT requires agents to generate structured outputs, such as high-quality requirements documents, design artifacts, flowcharts, and interface specifications. The use of intermediate structured outputs significantly increases the success rate of target code generation."
- **Spec Kit Agents (arXiv 2604.05278) §1:** SDD without grounding still produces "hallucinated APIs and architectural violations" — even with `contracts/api.md`, agents need *validation hooks* over those contracts. The contracts are necessary; they are not sufficient without runtime grounding. Hence the CHIP design = contracts (design-time) + `search_code`/`get_repo_map` (run-time).
- **GitHub Spec Kit's `contracts/data-model.md` and `contracts/api.md`** are markdown not strict schemas; the community-driven evolution toward stricter formats ([github/spec-kit/issues/1356 — EARS integration](https://github.com/github/spec-kit/issues/1356)) is empirical pressure that loose contracts cause downstream interpretation errors.

### Q2. Implementation patterns — WHAT vs HOW

The contract specifies WHAT (interfaces). Parallel tasks must agree on HOW (error handling, response envelope, ORM choice, logging) even though the WHAT is already pinned. CashPulse T3 and T4 are the canonical risk: both implement endpoints from the same `apiChangeSets` but can independently choose:

- Error handling: `Result<T, Err>` vs throw-and-catch vs HTTP status mapping
- Response envelope: `{ data, error }` vs `{ ok, value | error }` vs bare T
- Auth: middleware vs handler-level vs decorator
- DB access: raw SQL vs Drizzle vs Prisma vs Kysely
- Logging/tracing: structured pino vs console vs OpenTelemetry

**Options evaluated:**

| Option | Pro | Con | Verdict |
|---|---|---|---|
| (a) `implementationPatterns` section in ArchitectureSpec | Pattern is explicit *before* any task writes. Sibling tasks see same rules. | Architect must enumerate patterns; small upfront cost. | **Recommended** |
| (b) First task establishes; rest follow via merge + search_code | No Architect work | Race: parallel siblings don't see each other. Yan's Flappy Bird. | Reject |
| (c) Separate "style guide" document in ContractBundle | Explicit doc | Documents drift from enforcement; no Critic gate possible | Inferior to (a) |
| (d) Architect picks but Implementer's tools discover at runtime | Minimal upfront cost | Iteration spent discovering instead of writing; same race risk as (b) | Reject |

**Recommendation: option (a), confidence HIGH.** Add `implementationPatterns: ImplementationPattern[]` to `ArchitectureSpec` (Zod in §6). Each task's `patternRefs` enumerates which apply. Critic's *single-writer* and *DAG acyclic* gates are unchanged; add a new check that any task referencing a `patternRef` must have that pattern resolvable in the bundle.

**Direct evidence (what breaks when patterns diverge):**

- **Cognition Principle 2** (*Don't Build Multi-Agents*): "Subagent 1 and subagent 2 cannot see what the other was doing and so their work ends up being inconsistent with each other." The Flappy Bird example — mismatched visual styles between parallel-built bird and background — is exactly the response-envelope inconsistency CashPulse T3 ∥ T4 would produce without pattern pinning.
- **Spec Kit Agents §1 (arXiv 2604.05278):** "mismatches with repository conventions" and "violating local architectural or stylistic conventions" are named failure modes; their fix (discovery hooks) is exactly the grounding mechanism that complements explicit patterns.
- **Anthropic multi-agent post:** "lead agent gives detailed instructions to subagents" — embedding scaling rules and tool conventions in the orchestrator's prompts to subagents. Same pattern, different domain.

### Q3. Right contract granularity per artifact — three-level table

#### Data model

| Level | Example | Verdict |
|---|---|---|
| Too vague | "An Expense entity with category, amount, date." | Re-decided per task |
| **Right** | `Expense: { id: uuid pk, userId: uuid fk→User, amount: decimal(10,2) not null, currency: char(3) default 'USD', categoryId: uuid fk→Category, occurredAt: timestamptz not null, createdAt: timestamptz default now(), notes: text nullable }; unique(userId, occurredAt, amount)` | **Use this** |
| Too specific | Same as above, plus `BTREE` index hint, page-fill factor, table partitioning scheme, named CHECK constraints | Pre-commits database tuning |

#### API endpoint

| Level | Example | Verdict |
|---|---|---|
| Too vague | "An endpoint to list expenses" | Path, method, shape all re-invented |
| **Right (OpenAPI 3.1 fragment)** | `GET /api/expenses` with query `{ from?: date, to?: date, categoryId?: uuid, cursor?: string, limit?: int=50 }`, returns `200: { data: Expense[], nextCursor?: string }`, `401`, `403`. Error body `{ code, message, details? }` from shared `ErrorEnvelope` schema. | **Use this** |
| Too specific | Same plus chosen HTTP framework's exact middleware order, exact handler function name, exact response serializer | Pre-commits internals |

#### Component

| Level | Example | Verdict |
|---|---|---|
| Too vague | "A BudgetSummaryCard for the dashboard" | T6 invents prop shape, T_test breaks |
| **Right** | `BudgetSummaryCard: FC<{ budget: { spent: number; limit: number; remaining: number; status: 'on-track'\|'warning'\|'over' }; period: { from: Date; to: Date }; onClick?: () => void }>`; consumes design tokens `color.semantic.warning`, `color.semantic.danger`, `space.4`; composes `<MoneyText/>` and `<ProgressBar/>` (already in design system) | **Use this** |
| Too specific | Same plus exact CSS class names, exact Tailwind utility classes, exact pixel dimensions, animation curves | Frontend Implementer can't adapt to discovered design system constraints |

### Q4. How real systems scope contracts — concrete artifacts

- **MetaGPT (arXiv 2308.00352).** "System interface design" in the Architect role's output includes: **class diagram** (entities + relationships), **sequence diagram** (call order), **API list** (function signatures with types). Appendix shows a 2048 game with classes `Game`, `Board`, `Tile`, `Renderer` and methods like `Game.move(direction: Direction) → bool`. **Granularity = type-signature-level, no implementation.** This corresponds to CHIP's `dataModel` + `apiChangeSets` + `componentComposition` taken together.

- **GitHub Spec Kit.** `contracts/data-model.md` is markdown; `contracts/api.md` is typically OpenAPI; `plan.md` includes architecture choices ("Use Vite, vanilla HTML, SQLite for metadata" — Taskify quickstart example). `tasks.md` references these contracts by anchor. **Granularity = entity-level for data, endpoint-level for API, file-level for tasks.** Notably, Spec Kit *does not* mandate implementation patterns — and the Spec Kit Agents paper (2604.05278) emerges as the academic response to that gap.

- **Kiro (AWS).** `design.md` includes: technical architecture, data models, interfaces, error handling, testing strategy. AWS published examples (drug discovery agent, voting API) show `design.md` ~200–400 lines: data models as fenced TypeScript interfaces, API contracts as JSON-schema-like blocks, sequence diagrams in Mermaid. **Granularity = type-and-interface level, with error-handling strategy explicitly called out** — Kiro is the production system most aligned with the CHIP `implementationPatterns` recommendation.

- **Spec Kit Agents (arXiv 2604.05278).** §3.2 introduces *discovery hooks* (pre-phase, read-only probing of the repo: relevant files, conventions, dependencies, history) and *validation hooks* (post-phase: artifact consistency + project checks like tests/linters). The "minimum sufficient" set was empirically derived: 128 runs × 32 features × 5 repos showed +0.15 LLM-judge score improvement (Wilcoxon p<0.05). The "context-grounding layer" runs *outside* core agent prompts — directly mappable to CHIP's `Critic` (validation) + `search_code`/`get_repo_map` (discovery).

- **Walden Yan / Cognition.** "Actions carry implicit decisions" (Principle 2, *Don't Build Multi-Agents*). The April 2026 follow-up *Multi-Agents: What's Actually Working* operationalizes this: "Cross-agent communication … doesn't happen by default" → Cognition built explicit MCP-mediated manager↔child communication and trained models for it. **What makes decisions explicit in contracts** in their formulation: (i) shared full traces or condensed structured summaries (CHIP: TaskCompletionReport), (ii) pinned style/pattern decisions before parallel writes (CHIP: implementationPatterns), (iii) generator-verifier loops with clean contexts (CHIP: Reviewer with fresh context).

### Q5. Contract elements that prevent "context blindness"

Spec Kit Agents defines context blindness as: "intermediate artifacts can be internally coherent while being incompatible with the repository as it exists." Failure taxonomy and the CHIP contract element that grounds each:

| # | Failure mode | Concrete example | Contract element preventing it |
|---|---|---|---|
| 1 | **Hallucinated API** | Frontend calls `GET /api/expense?date=...` but the actual endpoint is `GET /api/expenses?occurredAt=...` | `apiChangeSets` with precise path + query schema; Critic's "entity reference integrity" gate + OpenAPI lint |
| 2 | **Schema drift** | T3 reads `expense.category` as string, T2 migration made it `categoryId: uuid` | `dataModel` referenced by `contextRefs` in both tasks |
| 3 | **Architectural violation** | New endpoint added bypassing the shared auth middleware | `implementationPatterns` ID `auth-middleware-required`; Critic checks `patternRefs` coverage |
| 4 | **Style/convention divergence** | Sibling T3 uses Result type, T4 throws | `implementationPatterns` ID `error-handling-result-type`; both tasks have it in `patternRefs` |
| 5 | **Phantom component** | Frontend imports `<EmptyState/>` that doesn't exist in this repo | `componentComposition` with prop-level signatures; Critic flags unknown component references |
| 6 | **Prop interface mismatch** | T6 passes `{ amount, currency }` to `<MoneyText/>` which actually expects `{ value, code }` | Prop-level `componentComposition`, Zod-validated |
| 7 | **Test fixture phantom** | T5 references `fixtures/sample-users.json` that no upstream task created | `filePaths[]` single-writer enforcement + task-completion-report's `filesWritten` |
| 8 | **Token/design-system drift** | Frontend uses `text-blue-500` directly instead of the semantic `color.primary` token | `designSystemDiff` + `screenPlan` references; pattern `tailwind-tokens-only` |
| 9 | **Migration-API mismatch** | T2 creates `expenses` (plural), T3's queries reference `expense` (singular) | `dataModel.tableName` ground-truth; Critic's "migration SQL parses" gate |
| 10 | **EARS criterion unaddressed** | A criterion "WHEN over budget THE System SHALL surface a warning" has no task implementing it | `acceptanceCriteriaIds` per task; Critic's PRD-coverage gate |

**How tools complement contracts:** `search_code` and `get_repo_map` (T2 tools) provide *runtime* grounding — what the repo actually looks like *now*. Contracts provide *design-time* grounding — what we said the repo should look like. Both are necessary: contracts prevent #1–#5, tools detect when reality has drifted (#6–#10 in brownfield). This is the exact dual-layer design Spec Kit Agents validates empirically.

### Q6. Negative constraints

**Recommendation: Use negative constraints sparingly; place them in `constraintSet` (project-level, ArchitectureSpec) or as ADR decisions, not duplicated per task. Confidence MEDIUM.**

When negative is more effective than positive:
- Where the prohibition is *non-obvious* given the contract: "DO NOT create API endpoints beyond `apiChangeSets`" prevents the over-helpful Implementer from inferring "the user probably also wants `/api/expenses/[id]/duplicate`."
- Where the LLM has a *strong default* toward the forbidden behavior: "DO NOT use class components" (React in 2026 still defaults to functional, but legacy training data biases some models).
- Where the *positive* form would require enumeration: "DO NOT add tables beyond `dataModel.entities`" is shorter than listing all forbidden tables.

When positive is better:
- For style/pattern choices, name what to do, not what to avoid (`error-handling-result-type` is a positive `implementationPattern`).
- For framework choices, declare them (Architect's `architectureSpec.stack`), don't enumerate alternatives to reject.

**Where they live in CHIP:**
- *Project-wide negatives* → `constraintSet` in ContractBundle (e.g., "no new dependencies without ADR")
- *Pattern-specific negatives* → inside the `ImplementationPattern` definition
- *Task-specific negatives* → in the TaskNode's `description` (rare; should be reviewed by Critic for redundancy with constraintSet)

**Evidence:** Anthropic's published lead-agent prompts (per multi-agent research post) include both positive scaling rules ("simple fact-finding = 1 agent, 3–10 tool calls") and negative constraints ("don't spawn 50 subagents for simple queries" — an early observed failure). Cursor's `.cursor/rules` is project-level and almost entirely positive (it works). Devin's Interactive Planning prompts include negatives only for known anti-patterns. The general industry pattern is *project-level negatives + task-level positives*.

### Q7. EARS sufficiency for Implementer

**EARS is necessary but insufficient. Architect must translate to interface-level contracts. Confidence HIGH.**

Example from CashPulse (locked in the question):
- EARS: *"WHEN the user navigates to Dashboard THE System SHALL display budget summary card with current month's total spent, budget limit, and remaining amount."*
- Architect's required translation: 
  - `dataModel.Budget = { id, userId, periodFrom, periodTo, limit: Money, ... }`
  - `apiChangeSets.budgets-current = GET /api/budgets/current → { spent: Money, limit: Money, remaining: Money, status: 'on-track'|'warning'|'over' }`
  - `componentComposition.dashboard.budgetSummaryCard = { props: { spent, limit, remaining, status, periodFrom, periodTo } }`
  - `screenPlans.dashboard.bindings = [{ component: 'BudgetSummaryCard', source: 'api.budgets-current' }]`
  - `implementationPatterns.money-display = "use <MoneyText currency=…/> with project's locale formatter"`

**What's necessary and what's over-engineering:**

| Translation level | Necessary? | Why |
|---|---|---|
| API shape (path, request, response) | **Yes** | Otherwise frontend invents endpoint URL → failure mode #1 |
| Data model fields | **Yes** | Otherwise schema drift → failure mode #2 |
| Component prop signature | **Yes** | Otherwise prop mismatch → failure mode #6 |
| Status enum literals | **Yes** | EARS says "warning"/"over" implicitly; specifying the literal strings prevents drift |
| Status thresholds (e.g., "warning if spent > 80% of limit") | **Yes if business rule, No if presentation rule** | Business rule belongs in API; presentation rule can be derived |
| Exact card layout / pixel positions | **No** | This is what `screenPlan` *deliberately* underspecifies — the Implementer's design specialist (per the locked decision) materializes layout |
| Exact CSS class names | **No** | Over-engineering; pattern reference `tailwind-tokens-only` suffices |

**Direct evidence:** Kiro's three-file workflow (`requirements.md` → `design.md` → `tasks.md`) exists specifically because EARS-style requirements are insufficient input for code generation; `design.md` does this translation. AWS docs: "design.md - Outlines the technical architecture with components, data models, and interfaces, serving as a blueprint for implementation." MetaGPT's pipeline does the same: Product Manager (EARS-like PRD) → Architect (interfaces) → Engineer (code). The translation step is the universally observed remedy.

CHIP's Architect Node 4 is exactly this translator. The seven questions in R6 are, in effect, design-decisions for Node 4's specialist invocations.

## ## 5. Cross-Cutting Analysis

### 5.1 The R6→R2→R3 cascade

Decisions at each level constrain the next:

1. **R6 (contract granularity) determines R2 (task decomposition options).** If contracts are at *type-signature level* (recommended), task decomposition can plausibly be screen/endpoint-level: each task implements one or a small group of related interfaces. If contracts are *vaguer* (entity list, no field types), tasks must be larger so the Implementer has room to invent the missing detail — pushing toward feature-level granularity and overrunning budget caps. If contracts are *over-specified* (pixel layouts, exact class names), tasks can be smaller (file-level) but planning cost balloons in Node 4 and the system loses the ability to adapt to discovered repo conventions in brownfield mode.

2. **R2 (task decomposition) determines R3 (inter-task context need).** Screen/endpoint-level tasks with 1–3 direct dependencies produce a 20–80K token Tier-0+Tier-1 envelope (workable). Feature-level tasks produce a 150K+ envelope (unworkable under the 200K cap). File-level tasks produce small per-task envelopes but explode the number of inter-task handoffs (CashPulse: 25–35 tasks vs 10), each handoff being a context-loss event that requires either fatter TaskCompletionReports or more search_code calls — net token cost is higher despite each task being smaller.

3. **R3 (context strategy) determines whether R2's chosen granularity is feasible.** Without TaskCompletionReport, screen/endpoint-level decomposition forces the Implementer to spend iterations rediscovering upstream decisions via search_code, eating into the 5-iter budget. With TaskCompletionReport, the same decomposition has 80K+ headroom for actual implementation work.

**Cascade summary:** type-signature-level contracts (R6) → screen/endpoint-level tasks (R2) → three-tier context with TaskCompletionReport (R3). Each choice unlocks the next; deviating at any level forces compensating cost elsewhere.

### 5.2 Compatibility matrix

Ratings: 1 = poor, 5 = excellent. **Likelihood of compatible code** (LCC) = how often outputs of parallel tasks merge cleanly and pass integration tests. **Context window pressure** (CWP) = inverse of headroom remaining after Tier 0+1 (1 = packed near 200K, 5 = comfortable headroom). **Architect complexity** (AC) = effort in Node 4/5 (1 = low, 5 = high). Pareto-optimal cells in **bold**.

Granularity × Context × Specificity:

| Granularity | Context | Specificity | LCC | CWP | AC | Pareto? |
|---|---|---|---|---|---|---|
| File-level | Contracts only | Vague | 1 | 4 | 1 | — |
| File-level | Contracts only | Right | 2 | 4 | 2 | — |
| File-level | Contracts only | Specific | 3 | 4 | 5 | — |
| File-level | Contracts + code | Vague | 2 | 3 | 1 | — |
| File-level | Contracts + code | Right | 3 | 3 | 2 | — |
| File-level | Contracts + code | Specific | 4 | 3 | 5 | — |
| File-level | Everything | Right | 4 | 1 | 3 | — |
| Screen/endpoint | Contracts only | Vague | 1 | 5 | 1 | — |
| Screen/endpoint | Contracts only | Right | 3 | 5 | 2 | — |
| Screen/endpoint | Contracts + code | Vague | 2 | 4 | 1 | — |
| Screen/endpoint | Contracts + code | Right (+ patterns + completion reports) | **5** | **4** | **3** | **Yes — recommended CHIP** |
| Screen/endpoint | Contracts + code | Specific | 5 | 4 | 5 | — |
| Screen/endpoint | Everything | Right | 5 | 1 | 4 | — |
| Feature-level | Contracts only | Right | 2 | 1 | 1 | — |
| Feature-level | Contracts + code | Right | 3 | 1 | 2 | — |
| Feature-level | Everything | Specific | 4 | 1 | 5 | — |

**Pareto-optimal:** screen/endpoint granularity + contracts+code (Tier 0/1 with TaskCompletionReport, search_code as Tier 2) + right-specificity contracts. The cell scoring 5/4/3 dominates all others on at least one axis without being dominated on any.

Notably, *file-level + everything + right* (4/1/3) is dominated by the recommended cell on every axis. *Screen/endpoint + everything + right* (5/1/4) buys 0 LCC improvement for 3 CWP loss — strictly worse.

### 5.3 Brownfield multiplier

Brownfield changes each pillar:

| Dimension | Greenfield default | Brownfield modifier | Source |
|---|---|---|---|
| **Task decomposition (R2)** | NEW tasks; scaffold task present; full ScreenPlan per frontend task | MODIFY tasks with delta tree; scaffold skipped; existingDesignSpec + deltaTree provided per locked CHIP design | Kiro's Bugfix Specs distinguishing current/expected/unchanged; Spec Kit Agents 99.7–100 % existing-test-compat |
| **Context (R3)** | Tier 0 = pruned ContractBundle; Tier 1 = upstream task files | Tier 0 unchanged; Tier 1 must also include existing files the MODIFY task touches; Tier 2 (search_code/get_repo_map) becomes critical for convention discovery | Spec Kit Agents read-only probing hooks; Cursor docs on worktree-from-base-branch |
| **Contract granularity (R6)** | Full specification — Architect designs from scratch | Delta specification — Architect must reference existing repo as ground truth, designs *changes* not the world | Kiro design.md for new feature still imports existing patterns from steering files |
| **Critic gates** | Standard 9 deterministic gates | Add: "existing tests still pass" gate; "no unintended modifications outside filePaths" gate | Spec Kit Agents §4.2 |
| **Architect cost** | Lower (clean slate) | Higher (must invoke get_repo_map before TaskPlan, must analyze impact before scoping) | Devin 2.0: "Devin analyzes the task, searches the codebase, and plans its approach" |

**Concrete differences in answers:**
- **R2 Q1** brownfield: 8 tasks vs 10 (no scaffold + MODIFY consolidation); same screen/endpoint granularity.
- **R2 Q3:** brownfield-specific decomposition already detailed in §2 Q3.
- **R3 Q1** brownfield: Tier 1 budget expands from 40K cap to 60K cap to accommodate existing-files-being-modified.
- **R6 Q1** brownfield: Add "list of files not to modify" as an essential contract element (anti-scope creep).
- **R6 Q5** brownfield: All failure modes are amplified — context blindness is far more likely against a 200-file existing repo than a 10-file greenfield one. Spec Kit Agents' empirical motivation is precisely this.

### 5.4 Recommended configuration for CHIP

Concrete values for Node 4/5 implementation:

| Decision | Recommended value | Confidence |
|---|---|---|
| Task granularity level | Screen/endpoint-level, target 6–12 tasks/feature, hard cap 20 | HIGH |
| Tier 0 context budget per task | 20K tokens (pruned ContractBundle via contextRefs + patterns + ledger) | HIGH |
| Tier 1 context budget per task | 40K greenfield / 60K brownfield (upstream files + completion reports) | MEDIUM |
| Total input ceiling | 120K tokens (leaves 80K for 5-iter execution loop) | HIGH |
| Contract specificity — data model | Column-level (name, type, constraints, FKs, unique) | HIGH |
| Contract specificity — API | Full OpenAPI 3.1 (paths, schemas, status codes, error envelope) | HIGH |
| Contract specificity — components | Prop-level TS signature + design-token references | HIGH |
| Contract specificity — screens | Data bindings + navigation, not pixel layout | HIGH |
| Contract specificity — design system | Token diff, not full token set | MEDIUM |
| Add `implementationPatterns` to ArchitectureSpec | Yes | HIGH |
| Add `TaskCompletionReport` to protocol | Yes | HIGH |
| TaskNode schema additions | `estimatedTokenBudget`, `contextRefs`, `patternRefs`, `acceptanceCriteriaIds`, `mode` | MEDIUM |
| Tests as separate tasks | Yes, for cross-cutting; co-located unit tests within impl tasks via writeOrder | MEDIUM |
| Brownfield: Architect runs `get_repo_map` before TaskPlan | Yes | HIGH |
| Negative constraints in `constraintSet` | Yes, project-level only; avoid per-task duplication | MEDIUM |

### 5.5 Open questions and counterarguments

Counterargument to Cognition's single-agent thesis vs CHIP's spine: CHIP is *not* a parallel-writer swarm. The spine is single-threaded (Clarifier → Architect → Implementer → Reviewer). Cross-task parallelism within the Implementer is structurally identical to Cognition's April 2026 "manager-Devin" pattern: a manager (Implementer orchestrator) decomposes, child workers operate on isolated worktrees with single-writer-per-file, and a structured return is required. CHIP's design *is* the architecture Cognition reports converged to — confidence on the high-level pattern is HIGH.

Counterargument to Anthropic's multi-agent enthusiasm: Anthropic is solving research (breadth-first, independent directions, condense-and-merge). CHIP solves code generation (depth-first, dependencies between agents, single-writer). Cognition explicitly contrasts: "domains that require all agents to share the same context or involve many dependencies between agents are not a good fit for multi-agent systems today" — CHIP's mitigation is to keep writes single-threaded (per task) and inter-task dependencies explicit through ContractBundle and TaskCompletionReport. Confidence: HIGH that the chosen architecture is compatible with the published empirical evidence on both sides of the debate.

Open question — the right format for `TaskCompletionReport` is not yet empirically validated for CHIP. ACON's lesson (failure-driven guideline optimization) suggests CHIP should ship a v1 schema, instrument downstream failures, and iterate. Confidence on the *existence* of the report is HIGH; confidence on the *exact field set* is MEDIUM.

## ## 6. Recommended Schema Changes (Zod definitions)

All schemas defined in TypeScript-flavored Zod (the locked CHIP stack). Additions are **additive and backward-compatible**; no existing field is removed or retyped.

### 6.1 New: `ImplementationPattern` and extension of `ArchitectureSpec`

```ts
export const ImplementationPattern = z.object({
  id: z.string(),                       // e.g., "error-handling-result-type"
  category: z.enum([
    'error-handling', 'response-envelope', 'auth',
    'data-access', 'logging', 'naming', 'testing', 'styling', 'other'
  ]),
  title: z.string(),
  rule: z.string(),                     // declarative description of the pattern
  rationale: z.string().optional(),
  example: z.string().optional(),       // short code snippet illustrating use
  forbids: z.array(z.string()).optional(), // optional negative constraints
  appliesTo: z.array(z.enum(['backend', 'frontend', 'test', 'integration'])).optional()
});
export type ImplementationPattern = z.infer<typeof ImplementationPattern>;

// Additive extension to existing ArchitectureSpec
export const ArchitectureSpec = ArchitectureSpecExisting.extend({
  implementationPatterns: z.array(ImplementationPattern).default([])
});
```

### 6.2 Extended: `TaskNode` (additive fields only)

```ts
export const ContextRef = z.object({
  kind: z.enum([
    'dataModel.entity',
    'apiChangeSet',
    'componentComposition',
    'screenPlan',
    'designSystemDiff',
    'adr',
    'assumption'
  ]),
  id: z.string()
});
export type ContextRef = z.infer<typeof ContextRef>;

export const TaskNode = TaskNodeExisting.extend({
  // — additive only —
  mode: z.enum(['NEW', 'MODIFY']).default('NEW'),         // brownfield support
  estimatedTokenBudget: z.object({                         // Architect-computed budget
    tier0Input: z.number().int().nonnegative(),           // ContractBundle slice + patterns
    tier1Input: z.number().int().nonnegative(),           // dependency closure + reports
    expectedOutput: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()                 // must be ≤ 120_000 for valid
  }).optional(),
  contextRefs: z.array(ContextRef).default([]),            // explicit slices of ContractBundle
  patternRefs: z.array(z.string()).default([]),            // ids into ArchitectureSpec.implementationPatterns
  acceptanceCriteriaIds: z.array(z.string()).default([])  // EARS ids from EnrichedRequirement
});
```

**Migration note.** All new fields have defaults; existing TaskPlans validate unchanged.

### 6.3 New: `TaskCompletionReport`

```ts
export const ExposedApi = z.object({
  method: z.enum(['GET','POST','PUT','PATCH','DELETE']),
  path: z.string(),
  requestSchemaRef: z.string().optional(),                 // OpenAPI $ref
  responseSchemaRef: z.string().optional(),
  statusCodes: z.array(z.number().int())
});
export const ExposedType = z.object({
  name: z.string(),
  location: z.string(),                                    // e.g., "src/types/budget.ts"
  summary: z.string()
});
export const ExposedComponent = z.object({
  name: z.string(),
  location: z.string(),
  propsSignature: z.string()                               // TS-source signature as string
});

export const TaskCompletionReport = z.object({
  taskId: z.string(),
  branchName: z.string(),
  commitSha: z.string(),
  filesWritten: z.array(z.object({
    path: z.string(),
    mode: z.enum(['created','modified','deleted']),
    linesAdded: z.number().int().nonnegative(),
    linesRemoved: z.number().int().nonnegative()
  })),
  interfacesExposed: z.object({
    apis: z.array(ExposedApi).default([]),
    types: z.array(ExposedType).default([]),
    components: z.array(ExposedComponent).default([])
  }),
  testsAdded: z.array(z.object({
    path: z.string(),
    count: z.number().int().nonnegative(),
    coversCriteriaIds: z.array(z.string()).default([])
  })).default([]),
  patternsApplied: z.array(z.string()).default([]),       // patternRef ids actually honored
  assumptionsMade: z.array(z.object({
    description: z.string(),
    criticality: z.enum(['low','medium','high'])
  })).default([]),
  deviationsFromContract: z.array(z.object({
    contractSlice: ContextRef,
    deviation: z.string(),
    justification: z.string()
  })).default([]),
  assumptionLedgerEntriesAdded: z.array(z.string()).default([])
});
export type TaskCompletionReport = z.infer<typeof TaskCompletionReport>;
```

### 6.4 Extension of `ContractBundle`

```ts
export const ContractBundle = ContractBundleExisting.extend({
  // implementationPatterns live inside architectureSpec (above), not at bundle root
  taskCompletionReports: z.array(TaskCompletionReport).default([])
});
```

Reports accumulate as tasks complete; downstream tasks read the reports for their direct dependencies.

### 6.5 Critic gate additions (additive; no replacement of existing gates)

The following gates are *additions* to the existing 9 deterministic gates. None duplicates an existing check.

| New gate | Check |
|---|---|
| `patternRef-resolution` | Every `patternRef` on every TaskNode resolves to an entry in `architectureSpec.implementationPatterns` |
| `contextRef-resolution` | Every `contextRef` resolves to an existing slice of ContractBundle |
| `acceptanceCriteria-coverage` | Union of `acceptanceCriteriaIds` across all tasks ≡ all EARS ids in EnrichedRequirement |
| `tokenBudget-feasibility` | For every TaskNode with `estimatedTokenBudget`, `total` ≤ 120_000 |
| `mode-consistency` (brownfield) | If `mode=MODIFY`, at least one entry in `filePaths` must pre-exist in the integration branch |

### 6.6 No changes to:
- Single-writer enforcement (still owned by Critic, unchanged)
- DAG acyclic check (unchanged)
- ContractBundle schema *root-level* fields (only `taskCompletionReports` added; existing fields untouched)
- Implementer tool inventory (`search_code`, `get_repo_map`, `report-assumption-violation`, write tools — unchanged)
- Budget caps (200K / 5 iter / 15 min — unchanged hard limits)

## ## 7. Implementation Implications for M3

### 7.1 Architect Node 4 (Contract Designer) — concrete implementation impact

Node 4 invokes specialist sub-prompts sequentially (per locked decision) for: data model, API contracts, component composition, screen specs, design system diff. This report adds **one specialist invocation and one extension to an existing one**:

1. **New specialist: Pattern Designer (runs after API and component specialists, before screen specs).** Inputs: `architectureSpec.stack`, `dataModel`, `apiChangeSets`, `componentComposition`, `assumptionLedger`. Output: `ImplementationPattern[]` populating `architectureSpec.implementationPatterns`. Minimum recommended pattern set for CashPulse-like apps: `error-handling-result-type`, `response-envelope-v1`, `auth-middleware-required`, `data-access-orm-choice`, `logging-structured`, `tailwind-tokens-only`, `testing-vitest-conventions`. Empirically derived from Kiro's `design.md` "Error Handling" + "Testing Strategy" sections.

2. **Extended specialist: API Contract Designer must emit `errorEnvelope` shape as a first-class schema** in `apiChangeSets`, referenced by every endpoint. This eliminates the most common parallel-sibling drift (Yan Principle 2 instance).

3. **Brownfield branch in Node 4:** detect `mode=MODIFY` for the project from the existence of an integration branch with prior commits. If brownfield, the first specialist invocation is *Repo Discovery* (uses `get_repo_map` as a tool inside Architect — same tool exposed to Implementer but used here for design-time grounding). This populates a `existingPatterns` summary fed to subsequent specialists. Mirrors Spec Kit Agents' discovery hooks at the *planning* phase rather than only implementation.

### 7.2 Architect Node 5 (Task Planner) — concrete implementation impact

Node 5 generates the TaskPlan DAG. This report's effect:

1. **Granularity targeting.** Node 5 must aim for screen/endpoint-level granularity, 6–12 tasks per feature, hard cap 20. Implement with a sizing pass that estimates each candidate task's `estimatedTokenBudget` (using a heuristic from `dataModel` size + `apiChangeSet` count touched + `componentComposition` size). Any candidate task with estimated total >150K is split before emission; any with <8K is merged with a sibling (with single-writer compatibility check).

2. **Populating new TaskNode fields.** For each emitted task:
   - `contextRefs`: derived from which contract slices the task touches. A backend task implementing `POST /api/budgets` references `apiChangeSets[budgets]` + `dataModel.Budget` + `errorEnvelope`.
   - `patternRefs`: cross-referenced from category — backend tasks get `error-handling-result-type`, `response-envelope-v1`, `auth-middleware-required`, `data-access-orm-choice`; frontend tasks get `tailwind-tokens-only`; tests get `testing-vitest-conventions`.
   - `acceptanceCriteriaIds`: heuristic mapping from EARS criteria (Clarifier output) to the task that operationalizes each. A criterion mentioning a screen → frontend task; mentioning an action → backend task; multi-layer → integration test task.
   - `mode`: NEW for greenfield, NEW/MODIFY for brownfield based on whether listed `filePaths` pre-exist.
   - `estimatedTokenBudget`: filled by the sizing pass.

3. **Shared code policy.** Whenever Node 5 detects that ≥2 candidate tasks reference the same primitive (utility, component, type) derivable from contracts but not present in scaffold, it emits an extension to T1 (scaffold task) and adds a dependency edge. This is the §2-Q2 recommendation operationalized.

4. **TaskPlan validation.** Node 5 must run a *dry-Critic* invocation (additional CHIP code path; Critic gates are deterministic and cheap) before emitting the TaskPlan. Any new-gate failure surfaces inside Architect rather than between Architect and Implementer — saving a round trip.

### 7.3 Implementer handoff protocol — concrete implementation impact

1. **At task start.** Implementer's startup prompt assembles Tier 0 + Tier 1 according to the §3 budget. Concretely:
   - Resolve `contextRefs` → load only those slices of ContractBundle (eliminate ~70 % of typical bundle bulk).
   - Resolve `patternRefs` → inline the full `ImplementationPattern` records into the prompt.
   - Load TaskCompletionReport for each direct dependency (from `contractBundle.taskCompletionReports`).
   - Git-merge upstream branches into this task's worktree (already part of locked design).
   - For MODIFY tasks: include the relevant `existingDesignSpec` + `deltaTree`.

2. **During execution.** Tier 2 tools (`search_code`, `get_repo_map`) remain unchanged. The `report-assumption-violation` tool gains a new payload field `pattern-deviation` for cases where the Implementer needs to deviate from a `patternRef` (e.g., the existing repo already uses throw-style errors in the file being modified, conflicting with `error-handling-result-type`). This deviation propagates into the TaskCompletionReport's `deviationsFromContract`.

3. **At task completion.** Implementer generates the TaskCompletionReport (one additional ~2K-token LLM call, OR templated extraction from the task's tool-call history if budget pressure is high). The report is appended to `contractBundle.taskCompletionReports`. Critic's gates then run against the bundle's updated state.

4. **No changes to:** the sequential write order within a task (migration → backend → backend tests → frontend → frontend tests → integration); the 5-iter / 200K / 15-min budget caps; the deterministic-Critic ownership of "done"; the design-stage specialist tool invocation for frontend tasks.

### 7.4 Concrete M3 deliverables (mapped to this report)

| M3 deliverable | This report's input |
|---|---|
| Node 4 specialist sequence | §7.1 — add Pattern Designer, extend API Designer, brownfield discovery first |
| Node 5 task sizing heuristic | §2 Q4 thresholds (file count, token budget, fan-in/out, write steps) |
| Node 5 TaskNode population logic | §6 schema additions + §7.2 derivation rules |
| Implementer prompt template | §3 Q5 budget table + §7.3 startup assembly order |
| TaskCompletionReport generator | §6.3 schema + §3 Q6 rationale |
| Critic gate additions | §6.5 (5 new gates, all deterministic, no LLM) |
| Brownfield handling | §2 Q3 + §5.3 + §7.1 brownfield branch |

### 7.5 What this report *does not* recommend (and why)

- **No change to spine structure** (locked).
- **No new ContractBundle root fields** beyond `taskCompletionReports`. Avoid scope creep.
- **No new Implementer tools.** The existing `search_code`, `get_repo_map`, `report-assumption-violation` cover §3's Tier-2 requirements.
- **No estimated-time or priority fields on TaskNode.** Wall-clock cap is already enforced (15 min); DAG topology is the priority.
- **No required regeneration of Clarifier or Reviewer.** The protocol changes touch only the Architect → Implementer handoff.

### 7.6 Risk register for M3

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pattern Designer produces too few or too many patterns | Medium | Seed with a minimum set (7 patterns above); empirically tune via observed deviation rates |
| TaskCompletionReport generation eats Implementer's 5-iter budget | Low | Generate from tool-call history when token-bound; defer to dedicated post-task LLM call when comfortable |
| Brownfield `get_repo_map` invocation in Node 4 exceeds Architect budget | Medium | Cap the discovery output at 20K tokens; summarize via small-model |
| Critic gate additions slow the spine | Very low | All new gates are deterministic schema/reference checks; each is O(N) over the bundle |
| Token estimates in `estimatedTokenBudget` are wrong | Medium | Implementer reports actual usage in TaskCompletionReport; Architect refines heuristics over time |

## ## 8. References

**Primary blog posts and engineering essays**

- Walden Yan (Cognition). *Don't Build Multi-Agents.* June 12, 2025. https://cognition.ai/blog/dont-build-multi-agents
- Walden Yan (Cognition). *Multi-Agents: What's Actually Working.* April 22, 2026. https://cognition.ai/blog/multi-agents-working
- Cognition team. *Introducing Devin.* https://cognition.ai/blog/introducing-devin
- Cognition team. *Devin 2.0.* April 2025. https://cognition.ai/blog/devin-2
- Cognition team. *How Cognition Uses Devin to Build Devin.* https://cognition.ai/blog/how-cognition-uses-devin-to-build-devin
- Jeremy Hadfield, Barry Zhang, Kenneth Lien, Florian Scholz, Jeremy Fox, Daniel Ford (Anthropic). *How we built our multi-agent research system.* June 13, 2025. https://www.anthropic.com/engineering/multi-agent-research-system
- GitHub Blog (Den Delimarsky et al.). *Spec-driven development with AI: Get started with a new open source toolkit.* https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/

**Academic / arXiv sources**

- Sirui Hong et al. *MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework.* arXiv:2308.00352 (ICLR 2024). https://arxiv.org/abs/2308.00352
- Pardis Taghavi, Santosh Bhavani. *Spec Kit Agents: Context-Grounded Agentic Workflows.* arXiv:2604.05278. April 2026. https://arxiv.org/abs/2604.05278 (verified existing)
- Minki Kang et al. *ACON: Optimizing Context Compression for Long-horizon LLM Agents.* arXiv:2510.00615. October 2025. https://arxiv.org/abs/2510.00615 (verified existing; code at https://github.com/microsoft/acon)

**Official product documentation**

- Kiro. *Specs.* https://kiro.dev/docs/specs/
- Kiro. *Best practices.* https://kiro.dev/docs/specs/best-practices/
- AWS. *Kiro Documentation.* https://aws.amazon.com/documentation-overview/kiro/
- AWS Startups. *Kiro Project Init: Automated Spec-Driven Development Setup.* https://aws.amazon.com/startups/prompt-library/kiro-project-init
- AWS Industries Blog. *From spec to production: a three-week drug discovery agent using Kiro.* https://aws.amazon.com/blogs/industries/from-spec-to-production-a-three-week-drug-discovery-agent-using-kiro/
- GitHub Spec Kit (canonical repo). https://github.com/github/spec-kit
- GitHub Spec Kit documentation. https://github.github.com/spec-kit/ ; https://github.github.com/spec-kit/quickstart.html
- GitHub Spec Kit workflows reference. https://github.github.io/spec-kit/reference/workflows.html
- Cursor docs — Worktrees. https://cursor.com/docs/configuration/worktrees
- Cursor blog — Best practices for coding with agents. https://cursor.com/blog/agent-best-practices
- Anthropic — Claude Code Subagents (docs). https://code.claude.com/docs/en/sub-agents
- Anthropic — Subagents in the SDK. https://platform.claude.com/docs/en/agent-sdk/subagents
- Anthropic blog — How and when to use subagents in Claude Code. https://claude.com/blog/subagents-in-claude-code

**Supporting / secondary**

- Microsoft Developer Blog. *Diving Into Spec-Driven Development With GitHub Spec Kit.* https://developer.microsoft.com/blog/spec-driven-development-spec-kit
- EPAM. *Inside Spec-Driven Development: What GitHub's Spec Kit Makes Possible for AI-assisted Engineering.* https://www.epam.com/insights/ai/blogs/inside-spec-driven-development-what-githubspec-kit-makes-possible-for-ai-engineering
- Spec Kit issue tracker — EARS integration discussion. https://github.com/github/spec-kit/issues/1356
- Simon Willison summary of Anthropic multi-agent post. https://simonwillison.net/2025/Jun/14/multi-agent-research-system/
- Trychroma research, *Context Rot* (cited by Cognition April 2026). https://www.trychroma.com/research/context-rot
- Reqassist. *EARS Requirements Syntax.* https://reqassist.com/blog/ears-requirements-syntax
- Visure Solutions. *Adopting EARS Notation for Requirements Specification.* https://visuresolutions.com/alm-guide/adopting-ears-notation/

**Verification notes**

- arXiv 2308.00352 (MetaGPT): verified; ICLR 2024 conference paper.
- arXiv 2604.05278 (Spec Kit Agents): verified existing on arXiv with submission date 7 April 2026; first-pass full-text retrieved during research.
- arXiv 2510.00615 (ACON): verified existing on arXiv (v1 Oct 1 2025; v2 Oct 17 2025); Microsoft-authored, code released.
- Cognition's two essays (*Don't Build Multi-Agents*, *Multi-Agents: What's Actually Working*): full text retrieved directly from cognition.ai during research.
- Anthropic multi-agent post: full text retrieved from anthropic.com/engineering during research.
- All other linked URLs were observed in active production documentation or search results during research.

The CHIP unified research report on R2 (Task Decomposition & Granularity), R3 (Context Management Between Tasks), and R6 (Spec-Driven Development Methodology) has been delivered across eight assembled sections:

1. **Title / Scope / Evidence Base** — anchors the report to Architect Node 4/5 and the Implementer handoff, names the CashPulse running example, and enumerates the primary-source evidence base.
2. **Executive Summary** — ten ranked recommendations with HIGH/MEDIUM/LOW confidence, each grounded in at least two cited production systems.
3. **R2: Task Decomposition & Granularity** — all seven questions answered with the screen/endpoint-level recommendation, a concrete brownfield CashPulse decomposition, hard thresholds for "too big / too small", and a head-to-head comparison of Kiro, Spec Kit, MetaGPT, Cursor 2.0, Devin, and Claude Code.
4. **R3: Context Management Between Tasks** — three-tier context model with concrete token budgets, dependency-type scoping, a 120K input ceiling with priority-ordered truncation, a recommended `TaskCompletionReport` structure, and the explicit verdict that the integration branch alone is insufficient.
5. **R6: Spec-Driven Development Methodology** — minimum viable contract per artifact (data model, API, components, screens, design tokens), the `implementationPatterns` recommendation, three-level (too vague / right / too specific) examples per artifact, a ten-entry failure taxonomy mapping context-blindness failures to preventing contract elements, negative-constraint placement guidance, and the EARS-is-necessary-but-insufficient verdict.
6. **Cross-Cutting Analysis** — the R6→R2→R3 cascade, a full compatibility matrix identifying the Pareto-optimal cell (screen/endpoint + contracts+code + right-specificity), brownfield modifiers per dimension, and the recommended CHIP configuration table.
7. **Recommended Schema Changes (Zod)** — additive-only TypeScript Zod definitions for `ImplementationPattern`, extended `ArchitectureSpec`, extended `TaskNode` (with `mode`, `estimatedTokenBudget`, `contextRefs`, `patternRefs`, `acceptanceCriteriaIds`), new `TaskCompletionReport`, extended `ContractBundle`, and five new deterministic Critic gates.
8. **Implementation Implications for M3** — concrete impact on Node 4 (new Pattern Designer specialist, brownfield discovery step), Node 5 (sizing heuristic, TaskNode population logic, shared-code policy), and the Implementer handoff protocol (startup assembly order, deviation reporting, completion-report generation), plus a risk register.
9. **References** — all primary sources with verified URLs, including verification notes that arXiv 2604.05278 (Spec Kit Agents) and arXiv 2510.00615 (ACON) do exist as cited in the task.

Every concrete recommendation is grounded in at least two real-system citations from Cognition (Walden Yan's two essays, Devin docs), Anthropic (multi-agent research system, Claude Code subagents), AWS Kiro, GitHub Spec Kit, MetaGPT (arXiv 2308.00352), Spec Kit Agents (arXiv 2604.05278), ACON (arXiv 2510.00615), and Cursor 2.0 — with counterarguments acknowledged where they exist (notably the Cognition vs Anthropic architectural debate).

The report adheres to all stated constraints: it does not revisit locked decisions, propose spine changes, or recommend new tools/frameworks; it consistently treats brownfield as a first-class scenario; it grounds every recommendation in cited evidence; and it respects the Implementer's 200K token / 5 iteration / 15 min hard caps throughout.