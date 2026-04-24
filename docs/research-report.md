# The Ideal Autonomous SDLC Framework for 2026

## How to use this report

This is the deep-dive research that grounds ARCHON's architectural decisions. 
Read it linearly when you want to understand a topic in full.

For other reading modes:
- Current architectural decisions → `vision.md`
- Why we rejected alternatives → `design-decisions.md`

This document is the most stable. Updated only when major new research lands.

## Executive summary

The ideal 2026 framework for bootstrapping a new application from a PRD is **not a ten-role agent cosplay on top of an event bus**. Across EPAM's ADLC, AWS's AI-DLC, GitHub's Copilot coding agent, Anthropic's research-system essay, and Cognition's "Don't Build Multi-Agents," the evidence converges on a different shape: **a thin, deterministic vertical spine (Clarify → Architect → Implement → Review) orchestrated as a durable, checkpointed graph, with horizontal specialists invoked as tools, a single writer per artifact, and structural HITL gates between phases**. Role personas are theatre; context engineering is the actual game.

Four design decisions dominate everything else:

1. **Replace the flat 10-agent event-bus model with a DAG-shaped spine plus tool-invoked specialists.** Parallel "writer" agents that share a codebase fail predictably (Devin's worst failure mode, Cognition's central argument). Parallel "reader" specialists are safe and genuinely valuable (Anthropic's +90% research improvement).
2. **Adopt a spec-driven artifact system modelled on AWS Kiro + AI-DLC**: EARS-formatted acceptance criteria, versioned spec artifacts under `specs/<feature>/`, living `AGENTS.md`/`CLAUDE.md` conventions, an explicit assumption ledger, and a per-run `audit.md`. YAML state is fine; the mistake is making it the *communication* substrate instead of just persistence.
3. **Make the conversational Clarifier a first-class, gated pipeline stage** — six sub-stages (Context Ingest → PRD Analyze → Gap/Conflict Detect → Question Prioritize → Story Write → Critic) with EVPI-style question budgeting, ClarifyGPT-style consistency sampling, and an assumption ledger that flows through the spine. No commercial tool ships this today; it is the highest-leverage differentiator.
4. **Build the RAG layer on deterministic structure first, semantic search second.** For a 100k-LoC + 500-page POC, use Aider-style repo map (tree-sitter + PageRank, no embeddings) as the default code-context tool, augmented by voyage-code-3 + Qdrant for semantic queries, and LlamaIndex + Cohere Rerank 3.5 for docs. Skip GraphRAG, Mem0, and Cognee. This fits on one box, costs under $100/month in infra, and has a clean path to production.

The rest of this report builds out these claims.

---

## Part 1: Ideal SDLC framework architecture

### The agent taxonomy problem

The AgentForge baseline (PM, Product, Architect, Design, Impl, Testing, Review, DevOps, Security, Docs) reflects how human org charts look, not how LLMs succeed. Two converging pieces of evidence reject this decomposition:

- **Cognition's "Don't Build Multi-Agents"** (Jun 2025) argues that coordinated writes across parallel agents produce incompatible outputs the orchestrator cannot safely merge. Every coding agent that went to production single-threaded — Devin, Claude Code, Cursor Composer — did so for this reason.
- **Anthropic's "How we built our multi-agent research system"** validates the opposite for *reads*: one lead plus N parallel subagents beat single-agent by 90.2% on research breadth at ~15× token cost.

The synthesis is a **thin vertical spine with horizontal specialists**:

**Vertical spine (sequential DAG, one writer at a time):**
1. **Clarifier** — reads PRD + codebase + docs, runs the clarification pipeline, emits an enriched PRD plus assumption ledger. Gated: must finish before Phase 2.
2. **Architect** — produces architecture spec, ADRs, and a task plan from the enriched PRD. Fresh context, spec + reference patterns only.
3. **Implementer** — loops per task in a sandboxed workspace. Tests, linter, typechecker, terminal as gates. Single-threaded per task; parallel tasks run in git worktrees, not shared state.
4. **Reviewer** — fresh-context diff review against the spec. Can return findings to Implementer with a bounded retry budget.

**Horizontal specialists (invoked as tools by spine agents):**
- **Research subagents** — docs, APIs, precedent patterns. Parallelizable.
- **Design subagent** — UI proposals, screen specs, design tokens.
- **Test generator** — emits failing tests before implementation.
- **Security reviewer** — diff-scoped; high-precision triage, never autonomous remediation.
- **Visual validator** — Playwright/browser MCP for UI work (Cursor's browser tool is the reference pattern).

Why this works: the spine is predictable and resumable; specialists are read-heavy or narrow-write, which is the safe multi-agent regime; only one writer touches any given artifact at a time, eliminating merge hell; specialists can be parallelised without cross-contamination because they return summaries, not raw outputs.

The **PM Agent and Product Agent in the AgentForge baseline are overhead.** Their job is absorbed into the Clarifier + Architect pair. The **DevOps Agent and Docs Agent** should also be demoted to specialists invoked during Implementation, not spine-level agents — they do not own a phase, they own a narrow write inside a phase.

### Orchestration model

The four candidate shapes and when each works:

- **Hierarchical supervisor** — optimal for breadth-first exploration (Anthropic Research, Replit Agent). Fragile when specialists need to write to shared artifacts.
- **Flat peer handoff** — works for triage ("billing vs support"). Fails beyond one hop; lost context at boundaries.
- **DAG pipeline** — best for deterministic PRD→TDD→code→test progressions. Predictable, cheap, auditable. Fails when dynamic backtracking is needed.
- **Reactive graph (Pregel / typed workflow)** — the right answer for any long-running, HITL-heavy, resumable system.

**Use a reactive graph for the spine, DAG semantics by default, with explicit backtrack edges between phases.** The concrete implementation should be **LangGraph** or **Microsoft Agent Framework Workflow** (the former if you want ecosystem density; the latter if the org is committed to Azure + Entra). Both give you Pregel-style supersteps, typed channels with reducers, checkpointers with time-travel, and native interrupt/resume — the four primitives you actually need for durable SDLC runs measured in hours.

CrewAI and OpenAI Agents SDK are both wrong for this problem. CrewAI has no typed state — coordination happens through stringified task outputs that lose information silently. OpenAI Agents SDK has no checkpointing — if the process dies mid-run, state is lost unless you layer persistence yourself.

**Critical pattern for Implementer parallelism: git worktrees, not shared filesystem.** Cursor 3's background agents validate this: each parallel attempt gets an isolated worktree; the orchestrator merges via normal Git, not by blending agent states. This single pattern eliminates the entire class of "parallel coder agents stepping on each other" failures.

### Inter-agent communication

Five patterns, ranked by fit:

1. **Shared typed state (channels + reducers)** — the right default for spine-level artifacts. Every spine agent writes a well-defined field (PRD, ArchSpec, TaskPlan, DiffBundle, ReviewReport). LangGraph channels or MS AF typed edges. Reducer semantics make concurrent writes safe when they occur.
2. **Blackboard via git** — the right default for code itself. Don't abstract the filesystem; git is the system of record. Use worktrees for parallel attempts.
3. **Agent-as-tool** — the right default for specialists. Parent stays in control; specialist returns a summary. Anthropic, Claude Code, and OpenAI's `Agent.as_tool` all converge here.
4. **Event stream (OpenTelemetry)** — for observability, not control flow. Everything the spine does gets traced; nothing in the spine makes decisions based on arbitrary events from the bus.
5. **Direct handoff (control transfer)** — avoid unless the receiver genuinely owns the next phase. Hard to trace; drops context at the boundary.

This kills the "event bus as primary orchestration" choice in the AgentForge baseline. The event bus belongs in the telemetry plane, not the coordination plane. Agents coordinate through typed state transitions and explicit tool calls.

### Document system: living docs, specs, artifacts, ephemeral

Adopt a four-tier artifact system aligned with how Kiro, AI-DLC, and Claude Code all actually work in practice:

| Tier | Purpose | Examples | Lifecycle |
|---|---|---|---|
| **Living documents** | Evolving source of truth, human + agent editable | `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `PRD.md` | Persistent, versioned in repo, regenerable on demand |
| **Immutable specs** | Frozen intent for a specific task | `specs/<feature>/prd-v1.md`, `arch-v1.md`, `tasks-v1.yaml` | Versioned artifacts; never overwritten |
| **Generated artifacts** | Phase outputs | Code, tests, plans, diffs | Owned by agent; reviewed by human; committed or rejected |
| **Ephemeral context** | Subagent results, tool outputs | Search results, raw file contents | Die at end of turn; only summaries survive |

The **EARS format** ("WHEN <condition> THE SYSTEM SHALL <behavior>") should be the backbone for acceptance criteria — it's a constrained extension of temporal logic, produces testable output, and is Kiro's battle-tested choice. Every Story carries EARS ACs plus optional Gherkin for BDD teams.

Every Epic, Story, and AC must carry `codebase_refs` validated against the actual repo (file + line exists) before being emitted. This kills hallucinated-reference failures at source.

The **assumption ledger** is the critical living document most frameworks skip. Each assumption has `id`, `statement`, `source_evidence`, `confidence`, `blast_radius`, `requires_confirmation`. Implementers treat assumptions as soft constraints and can re-open them via a `report-assumption` tool call — a production pattern that reduced rejected plans by >50% in a documented case study.

### Conversational clarification layer

This is the most underbuilt part of the 2026 commercial landscape. Linear AI, Jira AI, ClickUp AI, Notion AI, Productboard AI are all overwhelmingly **draft-and-edit**, not **interrogate-and-commit**. Kiro gets the structural half right (EARS, spec→design→tasks). Devin explicitly expects someone else to clarify first. No shipping product implements EVPI-style question prioritisation, ClarifyGPT-style consistency sampling, or an integrated assumption ledger. This is the largest differentiation opportunity.

The recommended six-stage Clarifier pipeline:

1. **Context Ingestor** — hybrid RAG over code + docs; retrieves top-k patterns matching PRD nouns/verbs before any question is drafted.
2. **PRD Analyzer** — extracts structured intent (features, actors, data entities, external systems, NFRs, business rules, out-of-scope) into forced JSON. Reduces hallucination and feeds every downstream stage.
3. **Gap/Conflict Detector** — runs two passes. A deterministic checklist (data contracts, error handling, auth boundaries, NFRs, observability, rollout, edge cases, a11y, compliance, dependencies) gives high recall. A ClarifyGPT-style consistency pass asks the model to propose 3–5 plausible implementations; divergence on any material detail is a gap.
4. **Question Prioritizer** — computes an EVPI proxy per gap (estimated change in downstream content × confidence the user can answer − question cost), ranks, keeps items above a threshold.
5. **Story Writer** — emits Epics/Stories/ACs with the EARS-based schema, dependency DAG, assumption ledger references.
6. **Critic/Validator** — automated INVEST + QUS + EARS-compliance checks before handoff. Hybrid rule + LLM critics (AQUSA-style structural linter plus an LLM contextual critic) outperform either alone.

**Question budgets by feature size** (derived from SAGE and UA-Multi benchmarks): 0–2 for micro features (1–3 stories), 3–7 for standard epics (5–15 stories), 7–15 across ≤3 rounds for cross-cutting epics. Hard cap ~15 per round, ~3 rounds total. Beyond that, escalate — the PRD is too underspecified to auto-refine.

**When to assume vs ask** resolves to three rules: ask when EVPI is high; ask when blast radius is high; ask when no strong codebase precedent exists. Otherwise assume and flag explicitly. Never hide an assumption.

**Input format is always mixed**: conversational for novel/fuzzy topics, multiple-choice whenever plausible options can be enumerated, PRD file as canonical seed. Users answer MC 5–10× faster than open questions, and the agent gets structured inputs back. Default UX: one-shot PRD paste → agent posts a batched clarification set with MC where possible, plus an "Accept suggested assumptions and proceed" button.

Grounded RAG changes the character of every question. Instead of asking "how should auth work?", the agent asks "I see `/lib/auth` uses JWT with 24h TTL via `/refresh`. Does this feature reuse it, introduce a new mechanism, or hybrid?" — open elicitation becomes confirmation. This pattern alone cuts question volume by roughly half in observed studies.

### Quality gates and HITL model

Quality gates must be **deterministic and structural**, not "a smarter reviewer agent." In order of importance:

1. **Tests pass.** Non-negotiable. Agents in tight test-write-run-fix loops are the highest-productivity delegation pattern observed.
2. **Typechecker and linter block commit.** `tsc --noEmit`, `mypy --strict` on changed files, Ruff/ESLint. Catches 30–50% of looks-right-but-broken outputs.
3. **Per-hunk diff review** (Cursor/Zed pattern). Not "accept all"; not "read the whole PR." Per-hunk is the measured sweet spot for reviewer attention.
4. **Fresh-context reviewer subagent.** Catches what the Implementer's context-rotted attention could no longer see. Standard Anthropic pattern.
5. **Visual validation via Playwright MCP** for UI tasks. Without this, UI regressions pass tests.
6. **Security review as separate concern, not gate.** Devin's 700-LoC repo review producing "extremely overzealous" false positives is the canonical cautionary tale. Security is static analysis + expert triage, not autonomous remediation.
7. **Budget caps enforced hard**: `max_iter`, token budget per task, wall-clock timeout. Fail loud.

**HITL must be structural, not advisory.** Phase gates between Clarifier→Architect→Implementer→Deploy; destructive-op gates (DB drop, deploy, external write) regardless of phase; per-hunk review during implementation. Do *not* implement "approve every tool call" — Microsoft's agentic failure taxonomy is explicit: users rubber-stamp after fatigue, and attackers can flood HITL to slip malicious actions through.

### Best practices distilled from enterprise SDLC research

The enterprise research converges on a surprisingly consistent set of principles, despite vendor marketing divergence:

- **ISO/IEC 5338:2023** is the only formal international standard and is the reasonable baseline, but it predates the 2024–2025 agent wave. Use it as a floor, overlay NIST AI RMF and ISO/IEC 42001, then add agent-specific particularities from AI-DLC or ADLC.
- **AWS AI-DLC** (open-source at `awslabs/aidlc-workflows`) is the most specified and auditable *process* framework. Three phases (Inception → Construction → Operations), linked by persistent context, with rules files in `.amazonq/rules/` or `.kiro/steering/`, an `audit.md` capturing every decision, and mandatory checkpoints at every phase boundary. Its "approval friction" trades velocity for traceability — the right trade-off for enterprise greenfield work.
- **EPAM ADLC** contributes the behavioral-metric idea: acceptance rate, escalation quality, supervision burden replace traditional throughput KPIs. Treat prompts as infrastructure-as-code; version them.
- **GitHub Copilot coding agent** is the reference implementation for sandboxed autonomous execution: ephemeral Actions container, firewalled egress with default allowlist, trusted MCP gateway in a separate container, API proxy holding LLM tokens (a "zero-secret agent" design), required human approval before any CI runs, CodeQL autofix on generated code. This is the most detailed publicly documented security architecture in the space.
- **Gartner's "agent washing" warning and 40%-cancellation-by-2027 prediction** are genuine signals. Gate autonomy by risk tier; default to PR-based async for production workloads; budget explicitly for failed experiments.

One important terminology clarification: four different things are all called ADLC/AI-DLC/Agentic-SDLC in 2025–2026 literature. EPAM/IBM/Salesforce mean "lifecycle for building AI agents themselves." AWS means "process for using agents to build software." Cycode means "evolution of existing SDLC with autonomous code generation." AI-SDLC means "human-led SDLC with AI assistants." AgentForge is mostly in the third and fourth buckets — don't let vendor docs from the first two confuse the design.

### Lessons from agentic coding tools

What works in production, from the failure-mode catalog:

- **Checkpointed durable state beats in-memory orchestration.** LangGraph's time-travel and OpenHands's event-sourced model both validate this. Agent runs are distributed systems with race conditions, partial failures, cascading errors, and probabilistic reasoning on top; treat them like distributed systems.
- **Single-threaded writer per artifact.** Cognition's argument. Parallelism is for reading/researching.
- **Context-window discipline.** Stay below ~70% of the window. Reset Implementer context per task. Compress subagent outputs before passing them up — a dedicated summarizer LLM call is cheap insurance.
- **Tool descriptions matter as much as prompts.** Anthropic built a tool-testing agent specifically to rewrite MCP tool descriptions after observed failures.
- **Semantic search as a trained-in skill, not an afterthought.** Cursor Composer trained with retrieval as a tool during training; that integration is state-of-the-art for coding agents.

What fails in production, observed across Devin, Cursor, Copilot Workspace, Replit Agent, and GitHub Copilot agent:

- **Context rot**: correctness drops after ~32K tokens; agents favor repetitive actions from their own prior history.
- **Greedy file reads** that overflow the window.
- **Failed-attempt contamination**: prior failed attempts bias subsequent tries. Reset context after 1–2 failures; commit before agent sessions.
- **Looks-right-but-broken output** (Matt Duggan on Copilot Workspace networking configs): syntactically plausible, semantically wrong for your environment. Only test suites catch this reliably.
- **Creative workarounds** (Replit Agent 3): the agent fakes success rather than surfacing blockers — a training artifact from being rewarded for output, not for asking clarifying questions. Counter this with a verifier subagent that prefers to escalate over decide.
- **Hallucinated features and APIs** (Devin on Railway's deployment constraints): the agent presses forward on infeasible tasks rather than flagging infeasibility.
- **Project-convention blindness** (Devin on nbdev/Quarto): custom toolchains regularly defeat autonomous agents regardless of docs.

Devin's actual success rate deserves direct citation. Answer.AI's month-long controlled test (Hamel Husain, Isaac Flath, Johno Whitaker, Jan 2025) ran 20 tasks and recorded **3 successes, 14 failures, 3 inconclusive**, with no reliable signal for which tasks would succeed. Their verdict: "tasks it can do are those that are so small and well-defined that I may as well do them myself faster." Devin's contribution was productization (Slack UX, sandbox, async work), not autonomous capability. Plan AgentForge around the same limits Devin hit and don't believe benchmark numbers without trajectory-level inspection.

---

## Part 2: RAG layer over codebase and documents

### Architectural patterns: what the 2025–2026 empirical evidence actually shows

The RAG-vs-agentic-search debate is a false dichotomy. Cursor's Nov 2025 A/B test is the most reliable primary source: adding semantic search on top of grep improves QA accuracy by an average **12.5%**, code retention by +0.3% overall (rising to **+2.6%** on 1000+ file repos), and reduces dissatisfied follow-ups by 2.2%. Pure agentic search (Claude Code's grep + read-file + bash loop) works well on small/medium repos with strong models but degrades at scale. **Hybrid wins. Use both.**

**Chunking.** cAST (CMU, 2025) is the empirical SOTA: tree-sitter AST parsing, recursive split with greedy sibling merge up to a character budget. Gains are real but modest: +1.8–4.3 Recall@5 on RepoEval, +2.67 Pass@1 on SWE-Bench with Claude. AST-aware chunking is necessary hygiene; it is not a silver bullet. Reranking adds more than chunking-algorithm choice.

**Embeddings.** Code-specific models beat general-purpose models by **10–17%** on code retrieval. Voyage-code-3 reports +13.80% over OpenAI text-embedding-3-large and +16.81% over CodeSage-large across 238 code datasets. Jina code embeddings 1.5B reports 79.04% average across 25 code benchmarks. On **mixed code + prose corpora**, no single model excels at both — use separate indices. NV-EmbedCode-v1 and Cursor's trained-in-house embedding show another 5–30% on top of off-the-shelf code embeddings, but require training infrastructure and are not worth it for a POC.

**Reranking adds more than changing embedding model.** Voyage Rerank-2.5 beats Cohere Rerank 3.5 by +12.70% average on MAIR with 32K context and instruction-following. Cohere 3.5 is the easier default (4K context, cheaper, simpler integration). **If you can only add one thing to a baseline RAG, add a reranker, not a better embedding model.**

**Hybrid retrieval (BM25 + dense) is the production default** for code specifically, because embeddings cannot match rare tokens, error codes, or exact identifiers. BM25 handles those; dense handles semantic queries. Reciprocal Rank Fusion (k=60) is the robust combiner; score-level fusion is brittle.

**GraphRAG over code is largely overhyped.** The structural relationships Microsoft GraphRAG extracts expensively with LLM calls are already in the AST and import graph — tree-sitter and LSP give them for free and accurately. The ICLR'26 "Do We Still Need GraphRAG?" benchmark finds agentic search over vector RAG closes the gap significantly. Full GraphRAG indexing of 1MB of text costs real money ($0.40+/query in user-reported setups). LazyGraphRAG (Nov 2024) cuts indexing cost ~1000× and query cost to 4%, which makes it the only sane GraphRAG variant to consider for docs. Skip it for code entirely. Consider it for docs only if you have measurable need for global multi-hop ADR/PRD questions.

**Aider's repo map is the underappreciated standout.** Tree-sitter extracts symbol definitions and references; a directed graph connects them; personalized PageRank, seeded by files in context, selects top-N definitions; the output is a compact token-budgeted "elided code view" of signatures and critical lines. Zero embeddings. Zero vector DB. Near-zero indexing cost. 130+ languages supported. Aider itself processes ~15B tokens/week on this system. The insight — *a function called by 20 others is more important to show the LLM than a private helper called once* — is a signal embeddings don't capture directly.

**Agentic retrieval** is the 2025 architectural shift. Instead of one-shot retrieval, the agent calls `grep`, `view_file`, `ls`, `bash` iteratively, reasoning between tool calls. Morph, Relace FAS, and Cognition SWE-grep all converge on this pattern, with 4–8 parallel tool calls per turn as the measured sweet spot. Critical pattern: **force `file:line` citations in the final answer**; validate post-hoc. Cursor stores chunk start/end line + path with every embedding specifically to support this.

**CodeRAG-Bench** findings (NAACL 2025) worth internalizing:
- Gold-document retrieval gives big gains even to strong models — retrieval quality matters more than model choice at the margin.
- Current retrievers fail on harder tasks (DS-1000, ODEX, SWE-Bench); repo-level is where the gap is widest.
- External docs add little to repo-level code completion — **local repo context dominates**. Spend retrieval effort on the local codebase first.

### Tool comparison matrix

| Tool | Setup (hrs) | Maintenance | Code quality | Doc quality | Self-host | Agentic fit | Recommendation |
|---|---|---|---|---|---|---|---|
| Sourcegraph Cody + code graph | 16–40 | Low | ⭐⭐⭐⭐⭐ | ⭐⭐ | Enterprise only | ⭐⭐⭐ | Skip — Cody discontinued July 2025, Amp spin-out creates vendor uncertainty |
| **Aider repo map (standalone or RepoMapper)** | **1–2** | **Very low** | ⭐⭐⭐⭐ | N/A | Yes | ⭐⭐⭐⭐ | **Use as primary code-structure tool** |
| Continue.dev indexing | 4–8 | Medium | ⭐⭐⭐ | ⭐⭐⭐ | Yes | ⭐⭐ | Skip — IDE-coupled, pivoting to CI/PR checks; steal the architecture instead |
| **LlamaIndex + CodeSplitter** | **4–8** | **Medium** | ⭐⭐⭐ | ⭐⭐⭐⭐ | Yes | ⭐⭐⭐⭐ | **Use as doc backbone** |
| Haystack 2.x | 8–16 | Medium | ⭐⭐⭐ | ⭐⭐⭐⭐ | Yes | ⭐⭐⭐ | Viable enterprise alternative if already a deepset shop |
| **LangChain + LangGraph** | **4–8** | **Medium** | ⭐⭐ (for chunking) | ⭐⭐⭐⭐ | Yes | ⭐⭐⭐⭐⭐ | **Use LangGraph for orchestration; not for code splitting** |
| Microsoft GraphRAG (full) | 16–40 | High | ⭐⭐ | ⭐⭐⭐⭐ | Yes | ⭐⭐ | Skip — $10–50 indexing, $0.10–0.40/query; use LazyGraphRAG if any graph layer |
| Self-built tree-sitter + Qdrant/pgvector | 16–40 | You own it | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Yes | ⭐⭐⭐⭐⭐ | Strong option if team has capacity |
| Cognee | 4–8 | Medium | ⭐⭐⭐ | ⭐⭐⭐ | Yes | ⭐⭐⭐ | Skip for indexing; revisit for cross-session agent memory |
| Mem0 | 2–4 | Low | N/A | N/A | Yes | ⭐⭐⭐⭐ (wrong problem) | **Skip** — 97.8% junk rate in a public production audit; not a RAG tool |
| LightRAG | 4–8 | Medium | ⭐⭐⭐ | ⭐⭐⭐⭐ | Yes | ⭐⭐⭐ | Maybe for docs if global multi-hop queries matter; skip for code |

### POC recommendation with trade-offs for leadership

The POC stack that balances low risk, high leverage, and self-hostability:

```
LangGraph outer spine orchestrator
  │
  ├── Code context tool ─── Aider-style repo map (RepoMapper or inline, ~1k LoC)
  │                          • Tree-sitter parsing, 130+ langs
  │                          • PageRank over symbol graph
  │                          • ~1k-token structural summary, always injected
  │
  ├── Semantic code tool ─── Tree-sitter cAST chunker → voyage-code-3
  │                          → Qdrant (hybrid BM25+dense) → Cohere Rerank 3.5
  │
  ├── Docs tool ─────────── LlamaIndex header-aware splitter → voyage-3-large
  │                          → same Qdrant instance (separate collection)
  │                          → Cohere Rerank 3.5
  │
  ├── Grep tool ────────── ripgrep exposed directly; agent decides when
  │
  └── File read tool ───── sandboxed view_file with line anchors
```

**Why this stack:**
- **Aider-style repo map** gives deterministic, near-zero-cost structural context. The insight it captures (PageRank importance) embeddings do not capture directly.
- **LlamaIndex for docs** because doc loaders, PDF parsing (LlamaParse), and header-aware splitters are best-in-class in the OSS ecosystem.
- **LangGraph for orchestration** because agent tooling has decisively converged there (ecosystem, examples, hiring pool, LangSmith tracing).
- **Voyage-code-3** is SOTA for code retrieval, $0.18/MTok, and 200M free tokens covers a 100k-LoC index several times over.
- **Qdrant** provides native hybrid retrieval with RRF; switch to pgvector if the org prefers one fewer service.
- **Cohere Rerank 3.5** adds more than any embedding model swap and integrates trivially.

**Trade-offs to present to leadership:**

| Decision | What you get | What you give up |
|---|---|---|
| Aider repo map over GraphRAG | ~$0 index cost, deterministic, language-agnostic, no vendor lock-in | No LLM-extracted thematic graph; global multi-hop queries less effective |
| Voyage-code-3 over self-hosted embeddings | SOTA quality immediately; 200M free tokens; API simplicity | API dependency (mitigable via AWS Marketplace on-prem at $0.22/MTok) |
| LangGraph over CrewAI/OpenAI Agents | Durability, checkpointing, time-travel, HITL interrupts | Steeper learning curve; Pregel semantics take effort |
| Hybrid over pure-agentic | Better performance at scale per Cursor data | Slightly more infrastructure vs plain grep + read-file |
| Skip GraphRAG | $0–50 vs $hundreds to index; no per-query $0.10–0.40 | Potentially weaker global-question performance on docs — measure before committing |
| Skip Mem0/Cognee for POC | No maintenance burden on immature memory layers | Agents don't carry cross-session memory — deliberately scoped out for POC |

**Cost projection for 100k LoC + 500 pages at 1000 queries/day:**

- Corpus: ~5.3M tokens total
- Indexing with voyage-code-3 + voyage-3-large: **~$1 one-time** (after 200M free tier)
- Self-hosted Qdrant on t3.medium: **~$30/month**
- Query embedding: ~$0.54/month
- Reranking (Cohere 3.5 at ~$0.002/query): ~$60/month
- LLM inference (Claude Sonnet 4.5, dominant cost): **$300–1,500/month** depending on model
- Total infra ex-LLM: **~$100/month**

LLM inference dominates by 10–50×. The RAG layer itself is not where cost lives. Compare this honestly against GraphRAG: full Microsoft GraphRAG would add ~$47 one-time indexing plus $100–400/day in query costs at 1000 q/day — **an additional $3,000–12,000/month for marginal gains on code that are not measurable in published benchmarks**.

### Implementation guidance: phasing and estimated effort

**Week 1 — scaffolding.** LangGraph project, Qdrant single-node via Docker, tree-sitter language pack, ripgrep and file-read tools exposed as LangGraph tools. Basic Claude Sonnet agent that can call all tools. ~3 days for one engineer.

**Week 2 — indexing pipelines.** cAST-style chunker with scope-chain metadata; header-aware doc splitter; voyage-code-3 + voyage-3-large embedding pipelines; Qdrant hybrid retrieval with RRF; Cohere Rerank 3.5 post-processing. Merkle-tree diff for incremental re-index. ~5 days.

**Week 3 — repo map integration.** RepoMapper (or inline tree-sitter + PageRank implementation ~300 LoC Python). Always-on injection at top of every agent prompt. File-watcher refresh on commit. ~2 days.

**Week 4 — clarifier pipeline.** Six-stage pipeline per Part 1. PRD analyzer with forced JSON. Gap/conflict detector with checklist + consistency sampling. Question prioritizer with EVPI proxy. Story writer emitting EARS ACs. Critic with INVEST + EARS compliance. ~8 days.

**Weeks 5–6 — spine integration.** Clarifier → Architect → Implementer → Reviewer spine in LangGraph with typed channels, checkpointers, and interrupt-based HITL at phase boundaries. Git worktree isolation for parallel tasks. Reviewer subagent pattern. Test/type/lint gates. ~10 days.

**Sequencing:** See `future-roadmap.md` for the phased rollout plan with exit criteria and decision gates per phase.

### Upgrade paths from POC to production

| From (POC) | To (Production) |
|---|---|
| Aider repo map inline | MCP server + SCIP indexes (scip-python/scip-go/scip-typescript) for precise cross-file refs |
| Single-repo index | Multi-repo orchestration; self-hosted Sourcegraph OSS or Zoekt cluster |
| Voyage-code-3 via API | AWS Marketplace deployment at $0.22/MTok on ml.g6.xlarge for data sovereignty |
| Qdrant single-node | Qdrant Cloud or self-hosted cluster with replication |
| LangGraph local | LangGraph Platform (hosted) + LangSmith for tracing, evals, prompt versioning |
| Manual re-index | Git webhook → incremental re-index pipeline (tree-sitter is fast enough for sub-minute turnaround) |
| No eval harness | RAGAS + 100-item golden SDLC query set; measure faithfulness + context precision pre-release |
| Flat vector for docs | LazyGraphRAG over docs only, **measured against flat-vector baseline** before adoption |
| No cross-session memory | Add Zep/Graphiti or Cognee for agent memory distinct from codebase index |
| Single-tenant | Per-tenant index isolation, row-level security in Qdrant collections |

---

## Part 3: Conversational clarification agents

The clarifier is AgentForge's highest-leverage differentiation opportunity because no commercial product has integrated the necessary pieces. The academic foundation is sound; the commercial space has not caught up.

### Smart question-asking patterns

The empirical backbone comes from five 2024–2025 papers:

- **ClarifyGPT** (ACM PACMSE 2024) — detects ambiguity via code-consistency sampling: generate *n* solutions, test on the same inputs, ask targeted questions grounded in observed divergence.
- **SAGE-Agent/ClarifyBench** (arXiv 2511.08798) — models clarification as a POMDP with EVPI + aspect-based cost modelling; 7–39% coverage gains with 1.5–2.7× fewer questions than prompting baselines.
- **Ask or Assume?** (arXiv 2603.26233) — on underspecified SWE-bench Verified, an uncertainty-aware multi-agent scaffold reaches **69.4% task resolve rate vs ~6% single-agent**, with calibrated question frequency.
- **LLMREI** (arXiv 2507.02564) — LLM interviewer captures 73.7% of ground-truth requirements; makes similar mistakes to humans.
- **Hymel et al.** (arXiv 2501.19297) — GPT-4 scores +1.12 higher on alignment vs human experts at 720× speed and 0.06% cost. End users bias *toward* outputs labeled "human" — eval bias matters.

These translate into concrete engineering rules:

- **Consistency sampling** is the cheapest high-value ambiguity signal. Generate 3–5 plausible implementations; any material divergence is a gap; questions target the divergence.
- **EVPI-style prioritization** prevents the "100 questions" anti-pattern that kills adoption. Every gap carries an estimated information value; only high-value gaps generate questions; lower-value gaps become flagged assumptions.
- **Grounded multiple-choice beats open-ended** when plausible options can be enumerated from codebase precedents. RAG converts open elicitation into confirmation.
- **Batch questions** into a small number of rounds. Users tolerate 1–3 rounds of structured questions; 10 rounds of drip-feed kill adoption.
- **Adversarial critic framing** outperforms "is this good?" framing. The critic prompt should demand "find at least N problems" — otherwise confirmation bias produces false clean-bills.

### EPIC/Story generation best practices

Output schema is non-negotiable and should match the EARS + INVEST + codebase-refs structure shown in Part 1. The production rule: **every AC must be testable, every Story must pass INVEST, every Epic must have explicit success metrics, and every codebase reference must be validated against the actual repo before emission**.

The critic pass should use both rule-based (AQUSA-style structural linting) and LLM-based (QUS semantic critic) checks. The 2025 extended study (Sharma & Tripathi; Springer 2026) shows hybrid beats either alone: rules win on structural defects, LLMs win on context-sensitive defects. Budget bounded retries (≤2) before escalating to human.

**Dependency DAG emission** is underrated. Downstream implementers (Devin-style, Claude Code) can parallelize across worktrees if the clarifier emits an explicit DAG of `story_id → [blocks]`. Augment Intent's parallel implementation pattern validates this.

### Integration with RAG and document system

The clarifier is the heaviest RAG consumer in the pipeline. Before drafting any question or assumption:

1. Extract key nouns and verbs from the PRD.
2. Query both indices (code and docs) with hybrid BM25+dense+rerank.
3. Inject top retrieved patterns into the question-generation prompt with `file:line` citations.

This converts questions like "how should authentication work?" into "I see `/lib/auth/oidc.ts` uses JWT with a 24h TTL and `/refresh` rotation. Does this feature reuse the pattern, introduce a new auth surface, or hybrid?" The grounded form is answerable in seconds with multiple-choice; the open form takes minutes or is answered vaguely.

**Steering files** (Kiro's term) / **Skills** (Claude Code's term) / **rules files** (AWS AI-DLC's term) are the persistent companion to RAG. Curated short Markdown notes about conventions, invariants, do/don't guidance. Loaded at every stage. They compound over time and reduce repeat questions — the clarifier doesn't need to re-ask "which logging library do we use?" on every PRD.

The **assumption ledger threads through every stage**. Clarifier emits assumptions with evidence and blast radius. Architect consumes them as soft constraints. Implementer can re-open via `report-assumption` tool call. Reviewer validates that final code matches recorded assumptions or flags divergence. This single artifact eliminates the silent-drift class of failures.

---

## Part 4: Gap analysis of the current AgentForge design

The baseline design — PM, Product, Architect, Design, Implementation, Testing, Review, DevOps, Security, Docs Agents with event-bus orchestration and YAML state — makes four structural choices that the evidence now argues against.

### What should be redesigned

**1. Collapse the 10-agent taxonomy into a 4-agent spine + specialist tools.**

- PM Agent + Product Agent → absorbed into Clarifier.
- Architect Agent → kept as spine stage; expanded to emit ADRs and task DAG.
- Design Agent → demoted to specialist invoked by Architect and Implementer.
- Implementation Agent → kept as spine stage; single-threaded per task with git worktree parallelism.
- Testing Agent → split into test-generator specialist (invoked by Implementer) and the test-runner which is a deterministic gate, not an agent.
- Review Agent → kept as spine stage; fresh-context reviewer subagent pattern.
- DevOps Agent → demoted to specialist invoked during deploy phase.
- Security Agent → demoted to narrow diff-scoped specialist; never autonomous remediation.
- Docs Agent → demoted to specialist invoked during Implementation for generated artifacts.

Net: 10 "equal" agents → 4 spine stages + 6 specialist tools. The functional coverage is identical; the coordination cost drops from quadratic to linear.

**2. Replace event-bus-as-orchestration with typed-channel-plus-durable-graph.**

The event bus is fine for telemetry and observability. It is wrong for coordination. Agents should coordinate through:
- Typed state channels with reducers (spine-level artifacts).
- Git worktrees and blackboard file system (code itself).
- Agent-as-tool for specialists (context isolation).
- OpenTelemetry event stream (observability only).

Concrete rewrite: LangGraph StateGraph with `PRD`, `ArchSpec`, `TaskPlan`, `DiffBundle`, `ReviewReport`, `AssumptionLedger` as channels; checkpointer backed by Postgres; interrupts at phase boundaries.

**3. Upgrade YAML state from "communication substrate" to "persistence layer only."**

YAML-based state is fine as the serialization format for checkpoints. It is wrong as the primary inter-agent communication mechanism because it encourages untyped string-passing that silently loses information (the CrewAI failure mode). Keep YAML for artifact storage (`specs/<feature>/tasks-v1.yaml`) and checkpoint persistence; route inter-agent communication through typed LangGraph channels with Pydantic schemas.

**4. Add the clarifier pipeline as a first-class gated phase.**

The baseline design jumps from PRD to Architecture. The evidence (Devin's failure on underspecified tasks, SAGE's 7–39% coverage gains from structured clarification, UA-Multi's 69.4% vs 6% resolve rate) argues for a dedicated six-stage clarifier before the Architect ever runs. This is the single largest quality lever in the entire framework.

### What should be kept

- The event bus as the **telemetry/observability plane**. Just not the coordination plane.
- YAML for artifact persistence and checkpoint serialization.
- The mental model of distinct functional concerns — it's correct, it just maps to tools-not-agents.
- Any existing prompt assets, CLAUDE.md/AGENTS.md conventions, and codebase wiki content. These all carry forward.
- The specialist role definitions (Design, DevOps, Security, Docs). They remain — just as invoked tools rather than peer agents on a bus.

### What is missing

- **Durable checkpointing with time-travel.** No recovery after LLM outage; no fork-alternative-path capability; no audit replay.
- **Typed state with reducers.** Concurrent agent writes currently undefined behavior.
- **RAG layer integrated into agent reasoning.** Agents likely operate blind to codebase patterns today.
- **Assumption ledger.** The most cost-effective anti-drift mechanism.
- **EARS-formatted acceptance criteria.** Kiro's structural rigor belongs in any spec-driven framework.
- **Reviewer subagent with fresh context.** The Implementer's context-rotted attention cannot self-review reliably.
- **Visual validation for UI work.** Playwright MCP integration.
- **Git worktrees for parallel implementation.** Prevents shared-filesystem conflicts.
- **Sandboxed execution with egress controls.** GitHub Copilot coding agent's firewall + MCP gateway + API proxy pattern is the reference.
- **Explicit phase gates with human approval.** Currently unclear how HITL is structured.
- **Budget caps per task.** `max_iter`, token budget, wall-clock timeout — fail-loud discipline.
- **`audit.md` trail.** AWS AI-DLC's per-run decision log for traceability.

---

## Part 4.5: Why the POC sketch is structurally simple but operationally complex

A 30-line spine sketch (Clarify -> Architect -> Implement -> Review with specialists as tools) captures the *structural* commitment. Production adds ten additive operational areas:

1. Functions are 10-50x bigger (tools, budgets, error categorization, telemetry, cost tracking, timeout handling, artifact extraction).
2. Context engineering is the actual product (60-80% of real effort).
3. LLM calls fail in ways the sketch doesn't model (timeouts, content filters, refusals, semantic errors, grounding failures, drift).
4. Review is structurally much harder (deterministic gates + LLM review + spec-conformance + assumption-drift + blast-radius + visual regression + contract tests + migration validation).
5. HITL is a real product surface (approval UIs, diff UIs, question UIs, escalation UIs, async approvals, timeout handling, auth).
6. Durable execution is substantial (checkpointing, storage, crash recovery, side-effect reconciliation, idempotency, time-travel, versioning, GC).
7. Sandboxing is non-optional at scale (containers, network allowlist, secrets management, prompt-injection scanning, destructive-op approval).
8. Observability is survival (tracing, prompt versioning, replay, metrics, alerting, logs, cost attribution).
9. Evaluation is how you know if you're improving (golden sets, automated eval, regression, A/B, human eval loop).
10. Org-level process (on-call, runbooks, cost governance, compliance, legal, vendor management, budget).

Structure is ~10% of the work. It's the 10% that makes the other 90% possible.

---

## Part 5: Recommended POC roadmap

### What to build first (weeks 1–6)

The ordering below prioritizes demonstrable value per week and front-loads the decisions hardest to reverse.

- **Week 1–2**: LangGraph spine scaffolding with typed channels, checkpointer, interrupt-based HITL between Clarify/Architect/Implement/Review phases. One happy-path end-to-end run (even with stub agents) end of week 2. This validates the orchestration model before investing in sophisticated agents.
- **Week 2–3**: Aider-style repo map (RepoMapper or inline) as the first code-context tool. Ripgrep and file-read tools exposed alongside. Agent calls them via LangGraph tool nodes. This alone, with no embeddings, gives agents meaningful codebase context.
- **Week 3–4**: Tree-sitter cAST chunker + voyage-code-3 + Qdrant hybrid + Cohere Rerank 3.5 for semantic code search. LlamaIndex pipeline for docs (PRD, TDD, ADRs). Merkle-tree incremental re-index.
- **Week 4–5**: Clarifier six-stage pipeline. This is where the user's framework will differentiate most. PRD analyzer with forced JSON; checklist + consistency gap detection; EVPI question prioritizer; EARS story writer; INVEST+EARS critic.
- **Week 5–6**: Implementer with git worktree isolation, test/type/lint gates, reviewer subagent with fresh context. Visual validator via Playwright MCP if UI work is in scope.

### What to defer

- **GraphRAG / LazyGraphRAG over docs.** Measure flat-vector baseline first. Add only if global multi-hop doc queries demonstrably fail.
- **Cross-session agent memory (Cognee, Zep, Graphiti).** Orthogonal to the POC goal; adds maintenance burden without clear value for greenfield bootstrap.
- **Multi-repo / monorepo indexing.** POC is single-repo.
- **Self-hosted Sourcegraph / SCIP indexes.** Add when precise cross-file refs become a measured bottleneck.
- **Custom fine-tuned embeddings.** 5–30% gains real but infrastructure cost high. Start with voyage-code-3.
- **Complex security review agents.** Static analysis (CodeQL, Semgrep) + human triage. Devin's false-positive rate proves autonomous security review is not ready.
- **Multi-tenant isolation** beyond Qdrant collection separation.
- **Speed/cost optimization.** The spec explicitly lists these as secondary. Optimize after correctness.

### Success metrics for the POC

**Context quality (primary):**
- % of agent questions/outputs with validated `file:line` citations.
- Retrieval precision@10 on a 100-item golden query set (measured with RAGAS).
- Clarifier assumption accuracy — % of emitted assumptions that implementation confirms vs refutes.

**Output quality (primary):**
- % of generated PRs that pass test/type/lint gates on first attempt.
- Reviewer subagent reject rate (healthy is 20–40% — too low means reviewer is rubber-stamping; too high means implementer is broken).
- % of Epics/Stories passing INVEST + EARS compliance on first emission.
- End-to-end PRD→merged-PR success rate on a controlled set of 20 greenfield tasks (the Answer.AI Devin-test pattern).

**Developer experience (primary):**
- Number of clarifying questions per standard feature (target: 3–7 per Part 1 bounds).
- Time-to-first-running-code from PRD submission.
- % of phase transitions requiring human intervention vs auto-advancing.
- Qualitative: pilot-user NPS after 2 weeks of use.

**Speed and cost (secondary):**
- Median wall-clock time for PRD→PR.
- Token cost per feature.
- Infrastructure cost per month at pilot scale.

### Key decisions to get leadership buy-in on

1. **The 10-agent taxonomy is being replaced with a 4-agent spine + specialist tools.** This reduces coordination overhead and prevents the parallel-writer class of failures documented across Devin, Replit Agent, and Copilot Workspace. Expect pushback from stakeholders attached to the "PM agent / Product agent" org-chart metaphor; counter with the Cognition essay and the Answer.AI Devin data.
2. **The event bus becomes the telemetry plane, not the coordination plane.** Coordination moves to typed LangGraph channels. This is a one-way door in the architecture; decide early.
3. **LangGraph (or Microsoft Agent Framework if Azure-committed) is the orchestration substrate.** Not CrewAI, not OpenAI Agents SDK. The decision drivers are durability, checkpointing, time-travel, and typed state.
4. **The Clarifier is a first-class gated phase.** This is the single largest quality lever. Budget 1.5–2× the weeks-of-engineering of any single other stage.
5. **RAG: deterministic structure first (Aider repo map), semantic search second (voyage-code-3 + Qdrant + Cohere rerank), GraphRAG skipped.** Measured justification: Cursor's 2.6% code-retention gain on large repos validates semantic search; no benchmark validates GraphRAG on code.
6. **EARS + INVEST + explicit assumption ledger are the spec-artifact backbone.** Kiro's structural rigor, AI-DLC's audit trail, and ClarifyGPT's consistency ambiguity detection are all incorporated. This is how the framework differentiates against Kiro/Spec Kit/Devin.
7. **Sandboxed execution with egress controls from day one.** GitHub Copilot's security architecture is the reference. Don't retrofit; design in.
8. **Budget explicitly for 40% cancellation risk per Gartner.** Set measurable gates per phase; be willing to kill branches that don't hit them. See `future-roadmap.md` decision gates.

---

## Conclusion

The evidence from 2025–2026 is unusually consistent across otherwise-competing sources. Cognition's argument that coordinated parallel writes break, Anthropic's argument that parallel reads work, EPAM's emphasis on evaluation over delivery, AWS's phase-gated AI-DLC, GitHub's sandboxed-agent security architecture, Cursor's hybrid-retrieval A/B data, and the academic stack (MARE, SAGE, ClarifyGPT, UA-Multi) all point in the same direction: **durable orchestration, thin-spine plus specialist-tool taxonomy, grounded clarification, spec-driven artifacts, structural HITL gates, and context engineering as the primary discipline**.

AgentForge's baseline — a flat ten-agent event bus — was a defensible 2024 design. In 2026 it is out of step with the empirical record. The redesign proposed here is not incremental; it rethinks the coordination model while preserving the functional decomposition the user already understands. The Clarifier pipeline is the strongest single differentiation bet in the space, because every commercial tool from Linear AI to Devin has left this layer underbuilt. The RAG stack is deliberately boring: Aider's repo map plus hybrid vector retrieval plus a reranker, no GraphRAG, no Mem0, no speculative memory infrastructure — production-grade in 6 weeks with one senior engineer, and with clean upgrade paths when scale demands them.

The framework's durable advantage will not come from having more agents than the next tool. It will come from having fewer agents, better context, gated phases, and honest traceability. That is the shape of the ideal 2026 multi-agent SDLC framework, and it is within reach as a POC this quarter.

---

## Primary source index

For follow-up reading or when decisions need to be questioned:

**Multi-agent architecture:**
- Anthropic: https://www.anthropic.com/engineering/multi-agent-research-system
- Cognition: https://cognition.ai/blog/dont-build-multi-agents

**Agentic coding in production:**
- Cursor semantic search A/B: https://cursor.com/blog/semsearch
- Devin performance review: https://cognition.ai/blog/devin-annual-performance-review-2025
- Answer.AI Devin evaluation: https://www.answer.ai/posts/2025-01-08-devin.html

**Clarification research:**
- ClarifyGPT: https://dl.acm.org/doi/10.1145/3660810

**RAG over code:**
- cAST: https://arxiv.org/html/2506.15655v1
- Aider repo map: (Aider's source code and blog posts)
- Voyage code-3: https://blog.voyageai.com/2025/01/07/voyage-3-large/

**Enterprise SDLC:**
- AWS AI-DLC: https://aws.amazon.com/blogs/devops/building-with-ai-dlc-using-amazon-q-developer/
- EPAM ADLC: https://www.epam.com/insights/ai/blogs/agentic-development-lifecycle-explained
- GitHub Copilot agent security: https://github.blog/ai-and-ml/generative-ai/under-the-hood-security-architecture-of-github-agentic-workflows/
- ISO/IEC 5338:2023 catalog entry: https://oecd.ai/en/catalogue/tools/