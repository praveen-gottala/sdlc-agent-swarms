# AgentForge Design Decisions

> The durable record of architectural decisions made for AgentForge.
> Not a decision log in chronological order — organized by topic.
> Each decision has: the decision, the reasoning, alternatives considered, and when revisiting is warranted.

---

## 1. Orchestration model

### 1.1 Runtime: TypeScript LangGraph

**Decision:** Use `@langchain/langgraph` (TypeScript) as the sole orchestration runtime for AgentForge's agent spine.

**Reasoning:**
- The codebase is TypeScript-first. Agents, renderer, dashboard, and monorepo all live there. Maintaining a Python-TypeScript split forces every feature to land in two places.
- LangGraph's ecosystem density, checkpoint support, typed channel semantics, and native interrupt/resume are the 2026 baseline for durable agent systems.
- The existing Python engine in `services/engine` has LangGraph patterns but agent nodes are stubs; no active workflow reaches it. This is drift from ADR-022, not a working system.

**Alternatives considered:**
- **Microsoft Agent Framework** (Workflow): more restrictive typed edges. Better for .NET or heavy Azure commitments. Not a good fit for a TypeScript monorepo.
- **CrewAI**: no typed state, string-coupled handoffs. Revisit if CrewAI adds typed channels and durable execution.
- **OpenAI Agents SDK**: no checkpointing, no durable execution. Rejected.
- **Temporal / durable-execution platform**: overkill for POC. Viable upgrade path for production.

**Revisit when:** multi-machine distributed orchestration becomes a requirement, or the team needs workflow durability beyond what LangGraph checkpointers provide.

### 1.2 Coordination: typed channels, not event bus

**Decision:** Inter-node coordination uses LangGraph's typed state channels with reducers. The event bus is demoted to the telemetry and observability plane.

**Reasoning:**
- Event buses lose type information at the boundary; every pair of agents is a potential silent-drift bug.
- Types catch shape errors at authoring time; production debugging of agent pipelines with untyped payloads is extremely expensive.
- Typed channels make the graph topology explicit, visualizable, and testable.

**Alternatives considered:**
- **Retrofitted typed event bus**: possible but fights the grain of pub/sub.
- **Direct agent-to-agent calls**: loses traceability.
- **Shared global state (blackboard)**: encourages untyped reads.

**Revisit when:** never, in practice. This is a foundational commitment.

### 1.3 Topology: thin spine + specialist tools

**Decision:** Four-stage vertical spine — Clarify → Architect → Implement → Review — with specialists invoked as tools by spine nodes. No flat multi-agent peer network.

**Reasoning:**
- Cognition's "Don't Build Multi-Agents" argues coordinated parallel writes produce incompatible outputs. Evidence from Devin, Cursor, Claude Code supports this.
- Anthropic's research system validates the opposite for reads: parallel subagents returning summaries work well.
- The spine is predictable, checkpointable, resumable. Specialists can be parallelized safely because they're read-heavy and return compressed summaries.

**Alternatives considered:**
- **Flat 10-agent event bus (the original AgentForge design)**: coordination overhead grows quadratically; every agent pair is a potential silent-drift bug.
- **Hierarchical supervisor pattern**: fine for research (Anthropic), fragile when specialists need to write.
- **Peer handoff**: works for triage, fails beyond one hop.

**Revisit when:** model capability improves to the point where parallel write-agents can reliably coordinate — Walden Yan's stated expectation is "someday" but not 2026.

### 1.4 Single-threaded writer per artifact

**Decision:** Within a task, exactly one function writes to any given artifact at a time. Parallelism exists only at the task level (independent features in separate git worktrees).

**Reasoning:**
- Walden Yan's Flappy Bird example: parallel subagents make conflicting implicit decisions because they can't see each other's in-flight choices.
- File locks don't solve the problem — the shared artifact is the *running application*, not any one file.
- PRD Section 24.2's "frontend + backend + tests in parallel" is the canonical Cognition anti-pattern and is explicitly rejected.

**Alternatives considered:**
- **Parallel coders coordinating through OpenAPI spec**: the spec can't pin down every implicit decision (field names, naming conventions, error shapes).
- **Locking + merge agent**: the merge agent doesn't have the context to resolve conflicts it didn't make.

**Revisit when:** never, while LLMs are the writing agent.

---

## 2. Document and artifact system

### 2.1 Four-tier artifact hierarchy

**Decision:** Artifacts split across four tiers by lifecycle:
- **Living documents**: PRD, AGENTS.md, CLAUDE.md, ARCHITECTURE.md. Evolvable, human + agent editable.
- **Immutable specs**: versioned per-feature artifacts under `specs/<feature>/`. Never overwritten.
- **Generated artifacts**: code, tests, diffs. Agent-produced, human-reviewed, committed or rejected.
- **Ephemeral context**: subagent results, tool outputs. Die at end of turn; only summaries survive.

**Reasoning:**
- Matches the AWS AI-DLC, Kiro, and Claude Code patterns that have proven out in production.
- The lifecycle split clarifies who can edit what and when.

**Alternatives considered:**
- **Everything in git as one tier**: loses the immutable-spec semantics.
- **Full event-sourced audit**: over-engineered for a POC.

### 2.2 EARS-formatted acceptance criteria

**Decision:** User Stories use EARS format ("WHEN <condition> THE SYSTEM SHALL <behavior>"). INVEST compliance is a critic check before handoff.

**Reasoning:**
- EARS is testable by construction and is Kiro's battle-tested choice.
- INVEST catches the common underspecification failures.

**Alternatives considered:**
- **Free-text user stories**: fails downstream testability.
- **Gherkin only**: good for BDD teams but less flexible.

### 2.3 Assumption ledger as first-class artifact

**Decision:** Every clarifier run produces an `AssumptionLedger` alongside the enriched requirement. Each entry has `id`, `statement`, `source_evidence`, `confidence`, `blast_radius`, `requires_confirmation`. Downstream nodes treat assumptions as soft constraints. Implementers can re-open assumptions via a `report-assumption-violation` tool call. Reviewer validates the diff against the ledger.

**Reasoning:**
- The single most cost-effective anti-drift mechanism identified in the research synthesis.
- Makes silent drift impossible: either an assumption was recorded and then honored, or it was recorded and then violated (flagged), or a decision was made without being recorded (caught by reviewer).

**Alternatives considered:**
- **Implicit assumptions (current state)**: allows silent drift.
- **No assumptions, ask every question**: kills adoption via question fatigue.

**Revisit when:** never. Foundational.

---

## 3. Conversational clarifier

### 3.1 Symmetric bootstrap + evolution modes

**Decision:** One clarifier pipeline handles both new-project bootstrap and change-request evolution. Same six nodes, different context retrieval, different question priors.

**Reasoning:**
- Bug fixes apply to both modes simultaneously.
- The user-facing UX is unified.
- Bootstrap retrieval hits the component library and reference patterns; evolution retrieval hits the codebase and existing designs. Same nodes consume, different sources.

**Alternatives considered:**
- **Separate bootstrap and evolution pipelines**: duplicative, drift-prone.

### 3.2 Six-stage internal pipeline

**Decision:** Context Ingest → PRD Analyzer → Gap Detector → Question Prioritizer → Story Writer (evolution) or PRD Synthesizer (bootstrap) → Critic.

**Reasoning:**
- Each stage has a distinct failure mode; separation allows targeted debugging.
- Collapsed stages hide whether a bad output came from bad retrieval, missed gaps, or poor prioritization.

### 3.3 EVPI-style question prioritization

**Decision:** Gaps are ranked by (blast_radius × answerability × confidence_gap). Top N above threshold become questions; lower become flagged assumptions.

**Reasoning:**
- Prevents the "100 questions" anti-pattern that kills adoption.
- Every question has justifiable cost/value.

**Alternatives considered:**
- **Ask every gap**: adoption killer (verified in research synthesis).
- **Fixed question count**: arbitrary, wastes high-value questions on low-value gaps.

### 3.4 ClarifyGPT-style consistency sampling

**Decision:** Alongside the deterministic gap checklist, generate 3-5 plausible implementations at temperature 0.8 and flag material divergence as gaps.

**Reasoning:**
- Catches ambiguity that deterministic checklists miss.
- Published results show meaningful improvement in gap detection.

**Cost cap:** max 3 extra LLM calls per clarifier run.

### 3.5 Grounded multiple-choice > free-text

**Decision:** Whenever retrieval surfaces a concrete codebase precedent, questions are rewritten as multiple-choice anchored in that precedent.

**Reasoning:**
- Users answer MC 5-10× faster than open-text.
- Grounding in codebase evidence reduces hallucination and irrelevant questions.

### 3.6 Question budgets

**Decision:**
- Micro features (1-3 stories): 0-2 questions.
- Standard epics (5-15 stories): 3-7 questions.
- Cross-cutting (>15 stories): 7-15 questions across ≤3 rounds.
- Hard cap 15 per round, 3 rounds total. Beyond that, escalate.

**Reasoning:** Based on SAGE, UA-Multi, and ClarifyBench empirical ranges.

---

## 4. RAG layer

### 4.1 Hybrid: deterministic structure first, semantic second

**Decision:** Aider-style repo map (always injected, no embeddings) is the default code context. Semantic retrieval (tree-sitter cAST chunking + voyage-code-3 + Qdrant hybrid + Cohere Rerank 3.5) is invoked when the agent needs content-level search.

**Reasoning:**
- The repo map's PageRank-over-symbol-graph insight captures structural importance that embeddings don't.
- Aider itself processes ~15B tokens/week on this pattern. Proven at scale.
- Semantic search complements, doesn't replace, the structural map. Cursor's Nov 2025 A/B data shows +2.6% code retention on large repos when semantic is added.

### 4.2 Skip GraphRAG

**Decision:** Microsoft-style full GraphRAG is not adopted. LazyGraphRAG may be revisited for docs only if global multi-hop queries demonstrably fail against flat vector.

**Reasoning:**
- Tree-sitter and the import graph already give the structural relationships GraphRAG extracts expensively with LLM calls.
- User-reported query costs of $0.10-0.40 with GraphRAG don't justify marginal gains.
- The ICLR'26 "Do We Still Need GraphRAG?" benchmark finds agentic search closes most of the gap.

### 4.3 Embedding choice: voyage-code-3 for code, voyage-3-large for docs

**Decision:** Separate embedding models for code and docs, indexed in separate Qdrant collections.

**Reasoning:**
- Code-specific embeddings beat general-purpose by 10-17% on code retrieval.
- Mixed code+prose single index underperforms either specialized approach.
- Voyage has 200M free tokens — covers a 100k-LoC index several times.

### 4.4 Reranking is non-optional

**Decision:** Cohere Rerank 3.5 runs over top-20 hybrid results, returns top-5, on every retrieval.

**Reasoning:**
- Reranking adds more than switching to a better embedding model.
- ~$60/month at 1000 queries/day — cheap relative to LLM inference.

### 4.5 Merkle-tree incremental re-indexing

**Decision:** Index chunks carry file-hash in payload. On re-index, diff against stored hashes, re-embed only changed files.

**Reasoning:** Full re-indexing on every commit is cost-prohibitive and slow.

---

## 5. Implementation

### 5.1 Single-threaded tool-loop implementer

**Decision:** One Implementer function with a tool loop writes all code for a task sequentially. Write order within a task: DB migration → backend endpoint → backend tests → frontend component → frontend tests → integration test.

**Reasoning:**
- See section 1.4. Single-writer-per-artifact.
- Sequential ordering lets each step see decisions made by the previous step.

**Alternatives considered:**
- **Parallel frontend/backend/test coders (PRD Section 24.2)**: rejected as the Cognition Flappy Bird anti-pattern.

### 5.2 Git worktrees for parallelism

**Decision:** Task-level parallelism achieved via git worktree per concurrent task. Cross-worktree merging is ordinary git merge, not agent merging.

**Reasoning:**
- Cursor 3's validated pattern.
- Eliminates the entire class of shared-filesystem conflicts.

### 5.3 Deterministic gates decide "done"

**Decision:** LLM never self-declares success. Completion is determined by typecheck + lint + tests passing. Iteration, token, and wall-clock budgets are hard caps.

**Reasoning:**
- LLMs are unreliable at self-assessment of completion.
- "It says it's done but nothing works" is the canonical agent failure mode (Devin, Replit Agent 3).

### 5.4 Fresh-context reviewer

**Decision:** Reviewer runs in a fresh LangGraph context, not inheriting the Implementer's conversation. Bounded retry (≤2 implementer revisions before escalation).

**Reasoning:**
- Implementer's accumulated context cannot self-review reliably.
- Context-rotted attention misses what fresh context catches.

---

## 6. HITL model

### 6.1 Three structural HITL checkpoints

**Decision:**
1. Clarification round — human answers batched questions.
2. Design / API approval — after design batch coherence, before implementation.
3. Code review — per-hunk diff review before merge.

**Reasoning:**
- Each checkpoint catches a different class of error.
- Gating only at one point lets errors propagate.

**Explicitly rejected:** "approve every tool call" pattern — produces rubber-stamping and is vulnerable to HITL flooding attacks.

### 6.2 LangGraph interrupts, not callbacks

**Decision:** HITL gates are native LangGraph interrupts with persistent state, not application-layer callbacks.

**Reasoning:**
- State survives process death.
- Resume is a first-class operation.

---

## 7. Durable execution and observability

### 7.1 Postgres checkpointer

**Decision:** LangGraph's PostgresSaver for durable state. One Postgres instance for checkpoints, audit trail, HITL records, run history.

**Reasoning:**
- Time-travel debugging.
- Resumption after crash.
- Avoids re-running completed LLM calls on restart.

### 7.2 OpenTelemetry + Langfuse

**Decision:** OTel spans for every LLM call, tool call, and state transition. Langfuse self-hosted as trace backend.

**Reasoning:**
- Debugging multi-minute agent runs without traces is effectively impossible.
- Self-host preserves data sovereignty for enterprise path.

### 7.3 Prompt versioning in git

**Decision:** Every prompt file has frontmatter `version: X.Y.Z`. LLM wrapper records the version per call. Pre-commit hook fails if prompt content changed without version bump.

**Reasoning:**
- Regression identification requires knowing which prompt version produced bad output.
- Git-native, no external system needed.

---

## 8. Evaluation

### 8.1 Golden test sets

**Decision:** 20 bootstrap scenarios + 50 evolution scenarios as golden tests. Automated eval on PR for packages/agents-* changes. Full eval nightly on main.

**Reasoning:**
- Single prompt change produces unpredictable regressions without eval.
- Without metrics, every decision is a guess.

### 8.2 Metrics

**Decision:** Track per run and per feature:
- First-pass test/type/lint pass rate.
- Reviewer reject rate (healthy: 20-40%).
- Clarifier question count per feature (target 3-7).
- Assumption accuracy (human-labeled sample).
- End-to-end success rate.
- Cost per feature.

---

## 9. UX Design Quality & Diversity

> Research survey date: 2026-04-27. Sources include AAAI 2025, arXiv, ScienceDirect, and Springer.
> Strategic vision: `docs/plans/active/visual-diversity/design-quality-vision.md`.

### 9.1 Dual evaluation: structural post-processing + vision LLM

**Decision:** Container diversity is assessed by both a deterministic structural check (counting treatment types in the DesignSpecV2 node tree) and vision LLM guidance (prompting the evaluator to flag visual monotony in screenshots). The structural check provides a reliable floor; the vision LLM catches issues the structural check misses.

**Reasoning:**
- The [Agentic Design Review System (AAAI 2025)](https://arxiv.org/html/2508.10745) demonstrates that multimodal LLMs possess "novice-level awareness of design characteristics" and need enhancement via structural grounding. Their system uses graph-matching exemplar selection (GRAD) and Structured Design Descriptions (SDD) to anchor LLM responses in spatial detail.
- The [MLLM-as-a-Judge benchmark](https://mllm-judge.github.io/) shows GPT-4V achieves 0.557 similarity to human scoring — useful but not reliable alone. Biases, hallucinations, and inconsistent judgments are documented hurdles.
- Our Phase 2.6 testing confirmed this empirically: the design LLM ignored diversity rules in prompts. If the design LLM can't reliably follow rules, the evaluation LLM also needs structural backing.

**Alternatives considered:**
- **Vision LLM only (no structural check):** simpler but unreliable. LLM compliance with scoring rules is inconsistent per MLLM-as-a-Judge findings.
- **Structural only (no vision guidance):** deterministic but can't detect visual issues like treatments that are technically different but look identical (e.g., a "flat" section with a background color so close to the page background that it's indistinguishable from "separated").
- **Dedicated evaluation model (fine-tuned):** would require training data we don't have yet. Viable for Tier 5 of the roadmap.

**Revisit when:** Tier 3 (exemplar-based evaluation) is implemented. Exemplar calibration may reduce the need for structural scoring if the vision LLM becomes sufficiently reliable with good/bad design examples.

### 9.2 Treatment count threshold over embedding-based diversity metrics

**Decision:** Within-page diversity is measured by counting distinct container treatment types (elevated, outlined, flat, inset, separated). A page with 3+ content sections that uses only 1 treatment type is flagged. This simple count is preferred over embedding-based diversity metrics.

**Reasoning:**
- [LiveIdeaBench](https://www.emergentmind.com/topics/liveideabench) uses high-dimensional embedding spaces (3072-d via TE3), UMAP/DBSCAN clustering, and PCA eigenvalue analysis for diversity scoring. This is designed for comparing diversity *across multiple generated outputs* (idea generation), not *within a single output* (section variety on one page).
- [Generation Diversity (GD)](https://arxiv.org/html/2412.20071v3) uses perceptual hashing to measure pairwise distances between different UI designs. Again, this is *cross-design* diversity (comparing page A vs page B), not *within-page* section variety.
- Our problem is simpler: "does this single page use at least 2 different container treatments?" This is a binary question answerable by counting, not a continuous distribution requiring embedding analysis.
- Embedding-based metrics add ~300ms latency per evaluation (embedding computation) and require maintaining a vector index. The count check is <1ms and requires no infrastructure.

**Alternatives considered:**
- **Perceptual hash diversity (GD metric):** designed for cross-design comparison. Could be adapted for within-page section comparison by hashing individual sections, but the treatment classification is more direct and interpretable.
- **Embedding cosine similarity between sections:** would catch subtle visual similarity that treatment labels miss. Overkill for the current "at least 2 treatments" requirement.
- **Shannon entropy of treatment distribution:** more nuanced than a count threshold (penalizes 80/10/10 distributions more than 40/30/30). Worth considering when the treatment vocabulary expands beyond 5.

**Revisit when:** cross-page diversity scoring is needed (Tier 4 of the roadmap). At that scale, perceptual hashing or embedding-based metrics become appropriate. Also revisit if the treatment vocabulary grows beyond 7-8 types, where simple count thresholds lose discriminative power.

### 9.3 Five canonical treatments, not arbitrary CSS

**Decision:** Container visual variety is achieved through five named treatments (elevated, outlined, flat, inset, separated), each with a defined CSS signature. The design LLM selects from these named patterns rather than inventing arbitrary CSS.

**Reasoning:**
- ADR-035 (catalog-first component model) establishes that visual quality belongs in the catalog, not in per-node LLM fields. Named treatments are catalog entries, not freeform styling.
- LLM compliance is measurably higher with constrained choices than open-ended instructions. Named treatments reduce the output space from infinite CSS combinations to 5 discrete options.
- The renderer can deterministically produce correct CSS for each treatment name. Arbitrary CSS from the LLM risks invalid values, vendor-specific properties, and visual bugs.
- Five treatments cover the common UI patterns: cards (elevated), settings panels (outlined), stat groups (flat), code blocks (inset), and list items (separated).

**Alternatives considered:**
- **Arbitrary CSS overrides:** maximum flexibility but high hallucination rate. LLMs generate invalid CSS ~15-20% of the time in our testing.
- **3 treatments (just shadow/border/plain):** too few to create meaningful variety on complex pages.
- **Token-based treatment system (e.g., `treatment: "elevation.lg"`):** more flexible but adds a new token dimension to the design system. Deferred to a future design system maturity phase.

**Revisit when:** the 5 treatments feel limiting for specific domains (e.g., a data visualization app needs "glass morphism" or "neumorphic" treatments). Add new named treatments to the catalog rather than opening arbitrary CSS.

### 9.4 Evaluator-as-enforcer, not prompt-as-guarantor

**Decision:** Design diversity is enforced through the evaluator's correction loop (score deduction + issue reporting + fix instructions), not through the design prompt alone. The design prompt establishes rules; the evaluator enforces compliance.

**Reasoning:**
- Phase 2.6 testing (2026-04-27) demonstrated empirically that the design LLM ignores diversity rules in prompts. Five pages were generated with the "3+ sections MUST use 2+ treatments" rule active; all produced monotonous treatments (all elevated or all flat).
- This matches the broader research finding from [MLLM-as-a-Judge](https://mllm-judge.github.io/): LLMs are better at *evaluating* design quality than *producing* it. Scoring evaluation achieved 0.557 similarity to human ratings — imperfect but actionable for a correction loop.
- The correction loop pattern (generate → evaluate → fix → re-evaluate) is iterative refinement, which converges where single-shot generation fails. This is established practice in image generation (DALL-E prompt refinement) and code generation (test-driven development).
- The evaluator's structural check (DD 9.1) provides deterministic enforcement even when the vision LLM is unreliable. The correction loop will keep iterating until the structural check passes.

**Alternatives considered:**
- **Stronger prompting only (few-shot examples, chain-of-thought, explicit rubric):** would improve compliance but can't guarantee it. LLM compliance is stochastic by nature.
- **Template-based generation (fill-in-the-blanks, not freeform):** would guarantee structure but eliminates the creative flexibility that makes LLM-generated designs valuable.
- **Rejection sampling (generate N candidates, pick the most diverse):** effective but expensive (N × generation cost). Could be combined with the evaluator in a future tier.

**Revisit when:** model capability improves to the point where single-shot compliance with diversity rules exceeds 90%. Until then, the evaluator loop is the enforcement mechanism.

---

## Appendix: Rejected alternatives catalog

Patterns evaluated and explicitly rejected. If proposing something similar, explain how
it differs from the rejection reason before proceeding.

### A.1 Copy-the-original-task-into-subagent-prompt

**Pattern:** Fix context loss in subagents by copying the "original task" or PRD into every subagent's prompt.

**Rejection reason:** The original task isn't well-defined in multi-turn runs. Even with full trace passing, parallel subagents still make conflicting in-flight implicit decisions. The underlying problem is parallel decisions that can't see each other, not insufficient context.

**Replacement:** Single-threaded execution so every decision sees every prior decision.

**Revisit when:** Never — structural problem, not a context-passing problem.

### A.2 Mem0 as agent memory

**Pattern:** Use Mem0 for cross-session agent memory.

**Rejection reason:** 97.8% junk rate in a public production audit. Not actually a RAG tool — functions differently than advertised. Maintenance burden not justified for POC.

**Replacement:** Evaluate Zep, Graphiti, or Cognee for production if needed. Not in POC scope.

**Revisit when:** Not for POC. Possibly for production if Mem0 matures.

### A.3 Cognee as RAG infrastructure

**Pattern:** Use Cognee as the knowledge graph memory layer.

**Rejection reason:** Positioned for cross-session agent memory, not repository-scale code RAG. Maintenance burden not justified for a POC that primarily needs codebase retrieval.

**Replacement:** Purpose-built code RAG for retrieval; LangGraph state for session continuity.

**Revisit when:** If AgentForge needs cross-session agent memory beyond what LangGraph checkpoints provide.

### A.4 Sourcegraph Cody for code graph

**Pattern:** Use Sourcegraph's code graph infrastructure.

**Rejection reason:** Cody was discontinued July 2025. Amp spin-out creates vendor uncertainty. Enterprise-only self-host licensing.

**Replacement:** Aider-style repo map (in-process, MIT-licensed patterns).

**Revisit when:** If Amp stabilizes and adopts a permissive license.

### A.5 Continue.dev indexing

**Pattern:** Adopt Continue.dev's indexing pipeline for code retrieval.

**Rejection reason:** IDE-coupled — designed for interactive editor use, not agentic pipelines. Pivoting to CI/PR checks, creating product-direction uncertainty.

**Replacement:** Borrow the architecture ideas but build in-house for agentic use.

**Revisit when:** If Continue.dev spins out the indexing as a standalone library with a clean API.

### A.6 Full GraphRAG over docs

**Pattern:** Run Microsoft GraphRAG over PRDs, ADRs, and documentation (distinct from code-specific GraphRAG rejected in DD 4.2).

**Rejection reason:** Indexing cost makes it expensive to keep fresh. Query cost scales poorly. Not yet demonstrated to beat flat-vector + rerank on doc retrieval at relevant benchmarks.

**Replacement:** LlamaIndex-style header-aware splitting + voyage-3-large + Qdrant + Cohere Rerank 3.5.

**Revisit when:** Measured evidence shows flat vector failing on global multi-hop doc queries. Then evaluate LazyGraphRAG (not full GraphRAG), which cuts indexing cost ~1000x.

### A.7 Agents "negotiating" scope with each other

**Pattern:** Architect pushes back on PM's estimate. Design debates API shape with Backend. Agents hold discussions until consensus.

**Rejection reason:** LLMs cannot reliably engage in long-context proactive discourse (Walden Yan). Negotiation between agents produces more problems than a single agent making both decisions. Org-chart cosplay — anthropomorphizing function calls as teammates.

**Replacement:** Single writer per artifact makes all negotiation internal to one LLM call.

**Revisit when:** When models demonstrably handle cross-agent negotiation reliably. Not 2026.

### A.8 Autonomous security remediation by LLM

**Pattern:** Security agent finds vulnerabilities and autonomously fixes them.

**Rejection reason:** Devin's security review on 700-LoC repos produced "extremely overzealous" false positives. Security requires domain expertise to distinguish false positives. Autonomous remediation can introduce regressions worse than the vulnerability.

**Replacement:** Static analysis (Semgrep, CodeQL) in CI gates. LLM flags concerns for human triage. No autonomous remediation.

**Revisit when:** Calibrated security-specific models exist with high-precision / low-FP rates.

### A.9 Speculative memory infrastructure for POC

**Pattern:** Build cross-session agent memory, user preferences, long-term learning into the POC.

**Rejection reason:** Adds significant maintenance burden. Underbuilt commercial tools (Mem0 etc.) haven't proven necessary for POC's core goals. Orthogonal to "does the system produce good PRDs, designs, and code?"

**Replacement:** Repo-local memory only (`docs/lessons-learned.md`, `AGENTS.md`). Session state via LangGraph checkpoints. No cross-session user memory until demanded.

**Revisit when:** POC demonstrably needs it (e.g., users complain about re-answering the same questions across projects).

---

## Meta-rules for this document

- A decision lands here only after it's been made explicitly. No speculation.
- Each decision cites its reasoning; if the reasoning dates (e.g., "model X can't do Y in 2026"), include the date.
- Revisit triggers are listed per decision so the team knows when to reopen.
- When a new decision supersedes an old one, keep both with a pointer.
