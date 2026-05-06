# The Architect Stage for CHIP: A Decision-Ready Design

## TL;DR

- **The Architect should be a thick stage (Approach B) — six nodes — that pre-commits not just the architecture spec and ADRs but also the concrete data model, API contracts, component composition, and screen-level design specs. The "design / API / data" units that currently sit on the spine after the Classifier should be demoted to specialist tools invoked sequentially inside the Architect's Contract Designer node, not run as parallel spine branches.** Anything else forces the single-threaded Implementer to make implicit cross-cutting decisions while writing, which is exactly the Flappy Bird failure mode Cognition warned about.
- **The spine's load-bearing properties — single writer per artifact, fresh context per stage, typed channels between stages, deterministic gates owning "done", and an assumption ledger threaded through everything — are validated by the convergent evidence from Cognition (Devin, Windsurf), Anthropic (Claude Code), and the academic literature on long-horizon agent failure modes.** Anthropic's parallel-subagent finding (90.2% lift on breadth-first research at ~15× token cost) is *not* a counter-argument; it applies only to read-only evidence gathering, which is exactly where it should be used inside the Architect (Options Explorer, Context Assembler) — never on writers.
- **Greenfield and brownfield should share the same six-node structure with different inputs and different strictness settings**, mirroring the Clarifier's symmetric design. The Classifier's `ChangeClassification` (5 scope axes + blast radius) becomes one of the typed inputs to node 1 in brownfield mode and is simply absent in greenfield; node 3 (Architecture & ADR Writer) shifts from "creative pick" mode to "constrained re-use plus exception ADR" mode based on a flag derived from that input.

---

## Key Findings

### 1. Why the spine pattern wins, restated precisely

The spine + specialist commitment rests on five load-bearing properties that *every* alternative (flat 10-agent event bus, hierarchical supervisor with peer writers, peer handoff, free-form DAG with parallel writers) violates in at least one dimension.

**Single writer per artifact.** Walden Yan's June 2025 essay frames this as Principle 2: *"Actions carry implicit decisions, and conflicting decisions carry bad results."* The Flappy Bird example is the canonical illustration — even when subagent 1 and subagent 2 are given the original task description, subagent 1's bird and subagent 2's pipes end up in incompatible visual styles because every action a writer takes commits to dozens of unstated micro-decisions (color palette, sprite resolution, physics tick rate, asset format) that the other writer has no way to learn except by inspecting the artifact, which it isn't doing. Yan's stronger claim — *"you should by default rule out any agent architectures that don't abide by Principles 1 & 2"* — is the basis for the spine's single-writer rule. The April 2026 follow-up ("Multi-Agents: What's Actually Working") doubles down: Cognition has begun deploying multi-agent systems in production at Devin and Windsurf, but only ones in which *"writes stay single-threaded"* and additional agents *"contribute intelligence rather than actions."* Every coding agent that has gone to production single-threaded — Devin, Claude Code (the "nO" master loop documented in Liu et al.'s arXiv 2604.14228 study), Cursor Composer (the writing primitive, even though Cursor 2.0 ships an 8-way parallel agent harness on top), Aider (architect-then-editor is two passes by the *same* writer line, not two parallel writers) — is single-threaded at the artifact level. Aider's architect mode is a particularly clean reference point: an architect model proposes, an editor model applies, but the artifact has exactly one writer per pass and they share full context.

**Fresh context per stage.** Yan's April 2026 essay surfaces a counterintuitive but now-validated finding from Devin Review: *"this technique works best when the coding and review agents do not share any context beforehand"* because of the math of attention — Chroma's "Context Rot" research and Anthropic's own context-engineering cookbook show that retrieval and reasoning quality decay non-linearly with context length, well before the hard token limit. A clean-context reviewer catches things the writer can't because it's not buried under hours of trial-and-error reasoning. The same logic applies stage-to-stage on the spine: the Implementer must inherit the architecture spec, the ADRs, the contracts, and the task DAG, but it must *not* inherit the Architect's reasoning trace, abandoned options, or partial drafts. The Reviewer must inherit the spec and the diff, not the Implementer's tool calls. This is also why Spec Kit's `plan-template.md` partitions the design phase into discrete files (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`) — each is a fresh-context handoff surface.

**Typed channels between stages.** MetaGPT's 2023 paper made the case explicitly: SOPs *"materialize"* as typed structured outputs (PRD, system interface design, sequence diagrams, task list) and the handoff schema is what reduces hallucinated chatter between roles. The same idea shows up in spec-kit's `contracts/` directory ("contracts are the handoff boundary — an agent reading the contract knows exactly what to implement without reading the full spec") and in Kiro's three-file convention (`requirements.md` in EARS, `design.md`, `tasks.md`). Free-form event-bus or peer-handoff architectures don't enforce this — they let one agent's prose become another agent's input, which is where coordination drift compounds (the "Spec Kit Agents" arXiv study, 2604.05278, formalizes this as *context blindness*: artifacts that are internally coherent but incompatible with the repository).

**Deterministic gates own "done".** This is the property that distinguishes a real spine from a "soft" pipeline. The Implementer doesn't decide it's done; typecheck/lint/tests decide. The Reviewer doesn't decide a finding is blocking; the triage gate does. The Clarifier doesn't decide ambiguity is resolved; the EVPI score and consistency-sampling agreement rate do. AWS AI-DLC names this principle explicitly in its public methodology — "human-gated progression" with "structured milestones" — though its checkpoints are human approvals rather than deterministic computations. CHIP's choice to make the gates deterministic (not LLM judges) is what bounds retry budgets and prevents the "Endless File Reading" loop documented in the SWE-bench Pro long-horizon failure analysis.

**Assumption ledger as the anti-drift backbone.** The agent-drift literature (Prassanna Ravishankar's drift taxonomy, the CORPGEN multi-horizon study at arXiv 2602.14229, the Acon context-compression paper at arXiv 2510.00615) consistently identifies three failure modes: goal drift (Wrong Solution — code that compiles but solves the wrong problem), reasoning drift (logic degradation across turns), and context drift (signal-to-noise collapse). All three share a root cause: *implicit assumptions accumulate without being surfaced as auditable, revisitable items*. The assumption ledger inverts this — every load-bearing decision the Architect makes is written to a structured artifact that the Implementer reads, the Reviewer audits, and the next feature's Clarifier consults. It's what living-spec advocates (Augment Code's "Intent" product, Tessl) call the bidirectional feedback loop, narrowed to the specific drift surfaces an autonomous SDLC actually has.

**What the alternatives lose.** A flat 10-agent event bus violates single-writer at the artifact level (multiple agents may publish events that touch the same file) and violates fresh-context per stage (the bus is shared state). A hierarchical supervisor with peer writers (MetaGPT's original conception, where Architect and Engineer write in parallel coordinated by a Project Manager) reproduces Flappy Bird at the SDLC level — the Architect's interface design and the Engineer's data structures end up subtly inconsistent unless one of them runs second and re-reads the other's full output, at which point you've serialized them and you've reinvented the spine. Peer handoff (a la AutoGen) loses typed channels. A free-form DAG with parallel writers is the explicit anti-pattern Yan rules out. The spine isn't one option among many — it's the only architecture that simultaneously preserves all five load-bearing properties.

### 2. Anthropic's parallel-reads finding does not contradict any of this

Anthropic's June 2025 multi-agent research-system post is the most-cited counterpoint, and the citation pattern is consistently mistaken. The 90.2% lift over single-agent Claude Opus 4 on internal research evaluations, with token usage explaining 80% of variance on BrowseComp at ~15× token cost relative to chat, is real — but Anthropic is explicit about the boundary: *"multi-agent systems excel especially for breadth-first queries that involve pursuing multiple independent directions simultaneously"* and *"are less effective for tightly interdependent tasks such as coding."* The lead Researcher does not write to a shared artifact. The subagents do not write to a shared artifact. They emit structured digests that the lead synthesizes. This is exactly the read-only pattern Yan endorses in both essays — *"the first area of applicability being in readonly agents"* — and it's the pattern that survives in Cognition's own Devin Deepwiki integration and Anthropic's own Claude Code subagent (which "is usually only tasked with answering a question, not writing any code").

The implication for the Architect is direct: parallel subagents are *legitimate inside one spine node* whenever that node's job is to gather evidence or explore options without writing the canonical artifact. Two of the six Architect nodes I recommend below are precisely that.

### 3. Approach A vs Approach B

**Approach A — thin Architect, planning function only.** The Architect produces architecture spec, ADRs, and a task DAG. Concrete contracts (OpenAPI fragments, migration SQL, component composition specs, screen-level design specs) are produced downstream by specialist nodes either invoked by the Implementer or run as per-scope branches between Architect and Implementer.

- *Input contract:* enriched PRD + assumption ledger from Clarifier; reference patterns / repo map / ADR library via RAG.
- *Output contract:* `architecture.md`, `adrs/*.md`, `tasks.md`. No `contracts/`, no `data-model.md`, no `design/*.md`.
- *Survivors:* the per-scope design/API/data branches survive, either as spine nodes or as Implementer-invoked specialists.
- *Single-writer rule lands:* on each of the three thin artifacts, plus separately on each downstream contract artifact.
- *Parallel reads:* mostly inside the Implementer's tool loop (it has to discover contracts as it goes), or via a brief evidence-gather inside the Architect.
- *Fresh-context isolation:* good between Architect and Implementer; *bad* within the Architect because it produces little, so most of the design work happens later, mixed with implementation.
- *Deterministic gates:* limited to "architecture.md exists and is non-empty," "task DAG is acyclic," "every PRD acceptance criterion has at least one task." Most of the actual contract-conformance checking has to wait until the Implementer or Reviewer phase.
- *Assumption ledger:* threads cleanly through architecture decisions, but the contract-level assumptions (e.g., "we'll use PATCH semantics for partial updates," "the migration will be online with backfill") get made implicitly during implementation and only show up in the ledger if the Implementer is disciplined about appending to it — which contradicts the spine's principle that load-bearing decisions are surfaced *before* writing begins.

**Approach B — thick Architect, planning function plus implementation-adjacent contracts.** Like Kiro's `design.md` (which already includes "components, data models, and interfaces"), like Spec Kit's `/speckit.plan` (which emits `research.md` plus `data-model.md` plus `contracts/` plus `quickstart.md` in a single planning command's Phase 0 + Phase 1 sequence), like MetaGPT's Architect role (which emits "system interface design and sequence flow diagram" before the Engineer starts).

- *Input contract:* enriched PRD + assumption ledger; ConstraintSet from Classifier (brownfield) or Constitution (greenfield); RAG handles to repo map (brownfield) and reference architecture library (always).
- *Output contract:* `architecture.md`, `adrs/*.md`, `data-model.md` and migration plan, `contracts/openapi.yaml` (or fragments), `components/composition.md`, `screens/*.md`, `tasks.md` with sequential write-order encoded.
- *Survivors:* the per-scope design/API/data units collapse into specialists invoked sequentially by one Architect node (the Contract Designer). They are not spine nodes anymore.
- *Single-writer rule lands:* per artifact, inside the Architect, with deterministic ordering between artifacts (data model first, then API contract, then component composition, then screen specs — same ordering principle as the Implementer's DB→backend→test→frontend ordering, just one stage earlier).
- *Parallel reads:* exploited heavily inside the Architect at two specific nodes (Context & Constraints Assembler, Options Explorer), where Anthropic's subagent pattern earns its keep: each subagent independently retrieves and digests one slice of the repo or one design alternative, returns a structured memo, and the synthesis happens single-threaded in the next node.
- *Fresh-context isolation:* the Architect runs in a fresh context relative to the Clarifier; each contract artifact is written by a single tool-loop pass with the architecture spec + relevant ADRs + Classifier output as input, but *not* the prior contract drafts' reasoning trace. The Implementer inherits all contracts but not the Architect's reasoning trace.
- *Deterministic gates:* much richer — JSON Schema validation on OpenAPI, migration SQL parses, component composition graph is acyclic, every PRD acceptance criterion maps to a task, every contract artifact has at least one corresponding task, every ADR's "Decision" field is non-empty.
- *Assumption ledger:* every contract decision (PATCH vs PUT, online vs offline migration, controlled vs uncontrolled component, design-token vs hardcoded value) is surfaced as a ledger entry at write time, not discovered post-hoc by the Implementer. This is the strongest argument for B.

**Recommendation: Approach B, unequivocally.**

The deciding factor is the Implementer's existing commitment to a single-threaded sequential write order (DB migration → backend → backend tests → frontend → frontend tests → integration). For that ordering to be safe, every cross-cutting decision must already be made before write 1 begins. If the API contract is decided when the Implementer reaches the backend endpoint task, then the DB migration that ran first was written without knowing the contract — and any field whose persistence model depends on the contract shape (nullability, enums, foreign-key cardinality) is at risk of needing rework, which the deterministic gates will flag but only after wasted writes. Approach A pushes contract decisions *into* the Implementer or *between* Architect and Implementer; both choices either (1) re-introduce parallel writers (the per-scope branches) and reproduce Flappy Bird, or (2) make the Implementer's context fat with design reasoning that should already be settled. Approach B is also what Kiro and Spec Kit converged on after considerable production iteration, and it's the structure MetaGPT defaults to in its software-company SOP. The cost of Approach B — a heavier Architect stage that does more pre-commitment — is exactly the cost the spine commitment was always asking you to accept.

### 4. Greenfield vs brownfield: same nodes, different inputs

The greenfield/brownfield split tempts you to design two different node sets, but the deeper similarity dominates. In both modes the Architect is doing the same six things: (1) gathering the constraints, (2) enumerating the design alternatives, (3) committing the architecture and ADRs, (4) writing the concrete contracts, (5) decomposing into a task DAG, (6) critiquing its own output against the PRD. What differs is *which inputs feed node 1*, *how strict node 3 should be about deviating from the existing pattern library*, and *whether node 5 produces a "from-scratch project skeleton" task list or a "delta against existing repo" task list*. None of those differences justify a different node set; they're parameters on the same nodes. This mirrors the Clarifier's symmetric bootstrap+evolution design and matches the brownfield-SDD literature's practical conclusion (Augment Code, Intent-driven.dev, the EPAM brownfield experience report): the workflow stays the same, the inputs and the strictness change.

The greenfield risks the user named — over-decision (architecting too much before evidence) and under-decision (generic skeleton with no opinion) — are addressed at node 2 (Options Explorer) and node 3 (Architecture & ADR Writer) respectively. Over-decision is bounded by the Options Explorer's mandate to produce options, not commitments, and by the assumption ledger flagging every decision the Architecture Writer makes that hasn't been validated by evidence. Under-decision is bounded by the Constitution / steering files (greenfield's analog of accepted ADRs): if the steering library says "we use Postgres, FastAPI, and design tokens from the CHIP catalog," then the Architecture Writer is forced into an opinion on every axis those steering files cover, and only carves an exception with a fresh ADR when the PRD demands it.

The brownfield risks — silent drift, architecturally inconsistent additions, unintentional cross-cutting changes — are addressed structurally by the Classifier-to-Architect input contract. The Classifier's `ChangeClassification` (5 scope axes: UI, component, design-system, API, data-model; plus blast radius) determines which contract-designer specialists get invoked at node 4. If the Classifier says only the UI and component axes are touched and design-system / API / data-model are not, then node 4 invokes only the screen-spec and component-composition specialists; the data-model specialist is skipped entirely, and any change to it requires either a Classifier re-run or an explicit ADR carving the exception. This collapses the silent-drift risk into a single auditable gate: if a contract artifact is written for a scope the Classifier didn't mark, the deterministic gate fails and the assumption ledger gets an entry asking why.

---

## Details

### Recommended node structure (six nodes)

The Architect spine stage consumes the Clarifier's output (enriched PRD + assumption ledger), the Classifier's output (in brownfield mode), and the RAG layer (Aider-style repo map + voyage-code-3 + Qdrant + Cohere Rerank for code; LlamaIndex + voyage-3-large for docs). It emits a typed bundle the Implementer consumes.

**Node 1 — Context & Constraints Assembler.** Anthropic-style parallel reads. The node spawns N short-lived read-only subagents, one per evidence stream, that run concurrently: a repo-map digest subagent (brownfield only), an ADR-library subagent that retrieves accepted ADRs relevant to the PRD's scope, a steering-file subagent (loads `product.md` / `tech.md` / `structure.md` analogs from CHIP's steering library), a reference-pattern subagent that retrieves matching patterns from the component catalog and reference architecture library, and — in brownfield mode only — a `ChangeClassification` ingester. Each subagent returns a structured memo. A deterministic merger then fuses them into a single `ConstraintSet` artifact: hard constraints (existing tech stack, accepted ADRs, blast radius), soft constraints (preferred patterns, steering preferences), and gaps (what the PRD wants that nothing in the constraint set covers). Single writer per memo, single writer for the merged ConstraintSet. This is one of two nodes where the Anthropic 90.2%-style parallel-read pattern is safe to exploit, because *no subagent writes to a shared artifact*.

- *Input:* enriched PRD, assumption ledger, Classifier output (if brownfield), RAG handles.
- *Output:* `ConstraintSet` (typed JSON: hard / soft / gaps).
- *Greenfield/brownfield delta:* in greenfield, `repo-map` and `ADR-library` and `Classifier` subagents are simply not invoked; `steering-file` and `reference-pattern` subagents do more work.

**Node 2 — Options Explorer.** The second node where parallel reads earn their keep. For each meaningful axis of decision the ConstraintSet leaves open (e.g., "extend existing service vs. carve a new module," "synchronous webhook vs. event bus," "single-page checkout vs. multi-step wizard"), spawn one subagent that researches the option, looks up precedents in the reference library and the existing codebase, estimates implications, and returns a structured option memo (decision name, alternatives considered, trade-offs, blast-radius estimate, references). A deterministic aggregator collects them. *No options are committed at this node.* This isolates evidence from commitment, which is what makes the Anthropic pattern safe here even though the Architect is ultimately a writer.

- *Input:* ConstraintSet from node 1, PRD, assumption ledger.
- *Output:* `OptionsBundle` (one option memo per open axis).
- *Greenfield/brownfield delta:* greenfield typically has more open axes (full stack pick); brownfield is dominated by "extend vs. carve out" decisions.

**Node 3 — Architecture & ADR Writer.** Single-threaded LLM writer. Reads the ConstraintSet and the OptionsBundle, picks among the options, and writes two things in a deterministic order: first `architecture.md` (system overview, components, sequence diagrams in Mermaid, integration points, non-functional requirements), then a set of ADRs in `adrs/NNNN-decision.md` files — one ADR per load-bearing pick. In brownfield mode, the strictness flag flips: the Architecture Writer is *required* to default to existing patterns from the ConstraintSet's hard-constraints section, and is *only* allowed to deviate by writing an explicit ADR that names the exception and cites the PRD requirement that forces it. In greenfield mode, every load-bearing pick gets an ADR by default.

- *Input:* ConstraintSet, OptionsBundle, PRD, assumption ledger.
- *Output:* `architecture.md`, `adrs/*.md`, updated assumption ledger entries for every decision made.
- *Why single-writer matters here:* if you split architecture.md and ADRs across two parallel writers, they will diverge on terminology and sequencing within one run. They share too much context.

**Node 4 — Contract Designer.** The thickest node, and the one that most clearly distinguishes Approach B from Approach A. A single tool-loop driven by one writer that produces the implementation-adjacent artifacts in a sequential order that mirrors the Implementer's write order, one stage earlier:

1. `data-model.md` and migration plan (if data-model scope is in the Classifier output, or always in greenfield).
2. `contracts/openapi.yaml` (or per-endpoint fragments) (if API scope is touched).
3. `components/composition.md` describing how components are assembled, what props they take, what state they own (if component scope is touched).
4. `screens/*.md` with screen-level design specs and design-token usage (if UI scope is touched).
5. `design-system/diff.md` listing any token additions or modifications (if design-system scope is touched).

Each of these is a single-writer artifact emitted by the same tool-loop, in this order, with each subsequent artifact reading the prior ones from disk. This is the spot where the user's existing per-scope branches collapse: *they become specialist tools invoked by one writer, sequentially, not parallel spine nodes*. The reason is exactly Yan's Principle 2 — a screen spec written without the API contract being settled will commit to an implicit data shape that the API contract may contradict; a component composition written without the data model settled will commit to an implicit ownership boundary the data model may forbid. Sequencing them inside one writer with shared context is the only way to keep them coherent.

- *Input:* `architecture.md`, ADRs, ConstraintSet, PRD, assumption ledger.
- *Output:* `data-model.md`, migration plan, `contracts/openapi.yaml`, `components/composition.md`, `screens/*.md`, `design-system/diff.md` (subset based on Classifier scope axes in brownfield, all in greenfield).
- *Deterministic gates inside the node:* each artifact's syntax validator runs after it's written (OpenAPI parses cleanly, migration SQL parses, Mermaid in component spec parses). Failures retry within a bounded budget.

**Node 5 — Task Planner.** Decomposes the architecture and contracts into a `tasks.md` file with an explicit DAG. Tasks are ordered to respect the Implementer's sequential write rule (DB migration → backend endpoint+service → backend tests → frontend component → frontend tests → integration test) — note this is the *same* ordering principle as Contract Designer's, applied one level lower. A deterministic validator checks that every PRD acceptance criterion is covered by at least one task, every contract artifact has at least one corresponding task, the DAG is acyclic, and every task names the file path it will write (so the single-writer rule is enforceable downstream).

- *Input:* all Architect outputs so far + PRD acceptance criteria.
- *Output:* `tasks.md` with a DAG and per-task file-path declarations.
- *Greenfield/brownfield delta:* greenfield includes scaffolding tasks (project init, dependency setup); brownfield doesn't.

**Node 6 — Architect Critic.** Fresh context. Loads `architecture.md`, ADRs, contract artifacts, `tasks.md`, the PRD, and the assumption ledger — but *not* the prior nodes' reasoning traces. Runs deterministic gates first (OpenAPI lints, migration linter, ADR template completeness, task-DAG acyclicity, PRD-criterion coverage). Then runs an LLM reviewer that checks for: contradictions between ADRs and architecture.md, contradictions between data-model and OpenAPI, screens that reference design tokens that don't exist, tasks that write to file paths another task also writes to (single-writer violation), and assumptions in the ledger that are contradicted by the architecture. Triages findings into blocking / suggestion / false-positive, identical to the Reviewer's triage. Blocking findings re-enter at node 3 or node 4 with a bounded retry budget; suggestions are appended to the assumption ledger for the Implementer's awareness. This node is the deterministic gate that owns "the Architect is done."

- *Input:* all Architect outputs, PRD, assumption ledger, fresh context.
- *Output:* triage report; on green, the full Architect bundle is emitted to the Implementer.

### Input contract (consumed by node 1)

- `enriched_prd.md` (Markdown with EARS-formatted acceptance criteria)
- `assumption_ledger.json` (typed list of assumptions: id, source-stage, decision, evidence, status)
- `change_classification.json` (brownfield only: 5 scope axes booleans + blast radius enum)
- RAG handles to: repo-map (Aider tree-sitter map via voyage-code-3 + Qdrant + Cohere Rerank), accepted ADRs library, steering-file library, reference-pattern catalog, component catalog
- (Optional, brownfield) `architecture_md_existing` if a project-level ARCHITECTURE.md exists

### Output contract (emitted to Implementer)

- `architecture.md`
- `adrs/NNNN-*.md` (one per load-bearing decision)
- `data-model.md` + `migrations/NNNN-*.sql` (if scope-applicable)
- `contracts/openapi.yaml` (or fragments) (if scope-applicable)
- `components/composition.md` (if scope-applicable)
- `screens/*.md` (if scope-applicable)
- `design-system/diff.md` (if scope-applicable)
- `tasks.md` (DAG with per-task file-path declarations)
- `assumption_ledger.json` (updated, all decisions logged)
- `architect_critic_report.json` (gates green, triage of any non-blocking findings)

### Where parallel reads vs single-threaded writes land

Parallel reads happen *only* at nodes 1 and 2, both of which are read-only evidence-gatherers. Nodes 3, 4, 5 are single-threaded writers. Node 6 is single-threaded read-and-judge. This is exactly the Cognition-validated pattern from "Multi-Agents: What's Actually Working" — multiple agents contribute intelligence (nodes 1 & 2), single-threaded writers commit decisions (nodes 3-5), clean-context reviewer (node 6).

### What happens to the existing per-scope branches (design / API / data)

They are demoted from spine nodes to **sequential specialists invoked inside node 4 (Contract Designer)**. Concretely:

- The "design" branch becomes the screens/* and design-system/diff.md specialists, invoked third and fifth in the Contract Designer's sequence.
- The "API" branch becomes the OpenAPI specialist, invoked second.
- The "data" branch becomes the data-model + migration specialist, invoked first.

This is the recommendation that conflicts most directly with the existing roadmap, and it is the one I am most confident about. Running them as parallel spine branches reintroduces Flappy Bird at the design level: the API branch will commit to a request shape that the data branch's schema doesn't support, the design branch will spec a screen that requires a field the API doesn't expose, and the Implementer will be the first reader to discover the contradiction — which is exactly the failure the spine commitment is supposed to prevent. Sequencing them inside one writer with shared context (the architecture.md + ADRs the writer just produced) is the only way to keep them coherent without paying full Anthropic-style synthesis-loss costs.

### How the architecture differs (or doesn't) between greenfield and brownfield

**Same six nodes. Three parameter differences and one input difference.**

1. *Input difference:* in brownfield, node 1 receives `change_classification.json` and an existing `architecture.md` (if present); in greenfield, neither exists.
2. *Parameter on node 1:* the subagent set is configured per mode — repo-map and ADR-library subagents only run in brownfield; steering-file and reference-pattern subagents run more aggressively in greenfield because the constraint set has more gaps to fill.
3. *Parameter on node 3:* the strictness flag. In brownfield, `default_to_existing_pattern = true` and any deviation forces an ADR. In greenfield, `default_to_existing_pattern = false` and every load-bearing pick gets an ADR by default.
4. *Parameter on node 4:* the specialist invocation list. In brownfield, only the specialists for axes the Classifier marked as touched are invoked. In greenfield, all are invoked.

This symmetry is not cosmetic. It's the property that lets the Architect be evaluated, prompt-tuned, and improved with the same harness across both modes — which is the same payoff the Clarifier's symmetric bootstrap+evolution design buys you.

### Citations to grounding work

- Walden Yan, *Don't Build Multi-Agents*, Cognition, June 12, 2025 — Principles 1 and 2, Flappy Bird, Claude Code subagents, edit-apply-model failure mode.
- Walden Yan, *Multi-Agents: What's Actually Working*, Cognition, April 22, 2026 — single-threaded writes, clean-context reviewer (Devin Review catches ~2 bugs/PR, 58% severe), Smart Friend, manager-Devin map-reduce-and-manage.
- Anthropic Engineering, *How we built our multi-agent research system*, June 13, 2025 — orchestrator-worker, 90.2% lift, 80% variance from token volume on BrowseComp, ~15× tokens, breadth-first only, "less effective for tightly interdependent tasks such as coding."
- Liu, Zhao, Shang, Shen, *Dive into Claude Code*, arXiv 2604.14228, April 2026 — single-threaded "nO" master loop, h2A queue, five-layer compaction pipeline, sub-agent summary-only returns.
- Cursor 2.0 release post (Oct 2025) and *Composer: Building a fast frontier model with RL* — Composer is the writer, parallelism is via git worktrees with each worktree containing its own complete writer (not a parallel-write architecture inside one worktree).
- Aider documentation, architect/editor mode and tree-sitter repo map — two-pass single-writer pattern.
- Kiro (`requirements.md` / `design.md` / `tasks.md`; steering files `product.md` / `tech.md` / `structure.md`) — direct evidence that thick "design" stage including components and data models is what production has converged on.
- GitHub Spec Kit (`spec-driven.md`, `plan-template.md`, `tasks.md`; Phase 0 `research.md`, Phase 1 `data-model.md` + `contracts/` + `quickstart.md`, Phase 2 `tasks.md`) — direct evidence of the contract artifacts an Architect should emit.
- Mavin et al., *EARS*, RE'09 — five patterns (Ubiquitous, Event-driven, Unwanted, State-driven, Optional).
- AWS AI-DLC (Open-Sourcing Adaptive Workflows; *Building with AI-DLC using Amazon Q Developer*) — adaptive breadth/depth, structured milestones, human-gated progression.
- MetaGPT, arXiv 2308.00352 — Architect role emits system interface design and sequence flow diagram before Engineer starts; SOPs as typed handoffs.
- Augment Code's *Intent* (brownfield SDD); Intent-driven.dev *Spec-Driven Development with Brownfield Projects*; ZeeSpec greenfield/brownfield split — convergent practitioner evidence on input asymmetry with workflow symmetry.
- Spec Kit Agents, arXiv 2604.05278 — "context blindness" failure mode and read-only context-grounding hooks as the fix.
- Knowledge-Based Multi-Agent Framework for Automated Software Architecture Design (arXiv 2503.20536), AdaCoder (arXiv 2504.04220), Blueprint2Code (PMC12575318), ALMAS (arXiv 2510.03463) — academic literature on staged SDLC agent frameworks; consistently use a thick architecture/design stage feeding a thin implementation stage.
- ACON (arXiv 2510.00615), CORPGEN (arXiv 2602.14229), Beyond pass@1 (arXiv 2603.29231), Prassanna Ravishankar's drift taxonomy — long-horizon failure modes that motivate the assumption ledger and fresh-context-per-stage.

---

## Recommendations

**Stage 1 — Adopt Approach B and freeze the six-node Architect structure.** Rename the existing per-scope spine branches (design / API / data) as Contract Designer specialists. This is the high-confidence call; do not litigate it further. The design literature, the production systems (Devin, Claude Code, Kiro, Spec Kit), and the academic SDLC-agent literature all point in this direction.

**Stage 2 — Implement the typed input/output contract before writing any node.** The contract is the spine's load-bearing surface; if it's not enforced as a Pydantic / TypedDict schema with validators, the deterministic gates lose teeth. Make `ConstraintSet`, `OptionsBundle`, the contract artifacts, and `tasks.md` all have machine-checkable schemas before you start prompt-tuning the LLM nodes.

**Stage 3 — Build the Architect Critic (node 6) first.** It is the gate that defines "Architect done" and it is also the cheapest node to evaluate in isolation: feed it hand-written architecture bundles (correct ones and intentionally broken ones) and verify the gates fire correctly. Building the critic first means every subsequent node's output is automatically gated as you build it.

**Stage 4 — Build node 4 (Contract Designer) second, against a fixed architecture.md and ADR set.** This is the highest-risk node because it's the thickest writer. Verify the sequential specialist invocation works on a small brownfield case (e.g., add one endpoint to an existing service) before you attempt greenfield.

**Stage 5 — Build nodes 1, 2, 3, 5 in any order; they're each cheaper.** Defer the Anthropic-style parallel subagents in nodes 1 and 2 until the single-threaded fallback works end-to-end; the parallelism is a token-cost optimization, not a correctness primitive.

**Stage 6 — Run a head-to-head eval against a stripped-down Approach A on the same PRDs.** This is the empirical check on the recommendation. Metrics: Implementer retry-budget consumption, Reviewer blocking-finding rate, assumption-ledger growth between Architect and Implementer (which should be near-zero in B and high in A). If A loses on any of these by more than 2× — which the reasoning above predicts — the question is settled empirically.

**Thresholds that would change the recommendation.**

- If the Implementer's commitment to single-threaded sequential writes is relaxed (e.g., parallel frontend/backend writers via worktrees become safe at the artifact level), then Approach A becomes viable and the per-scope branches can survive as parallel specialists. This requires a model generation that doesn't drift on cross-cutting decisions, which the April 2026 Cognition essay says is still an open problem.
- If brownfield blast-radius classification turns out to be too unreliable (Classifier false-negatives on touched scope axes), node 4's "skip the unmarked specialists" optimization becomes unsafe and you should run all specialists in brownfield too. This is a tuning question, answerable with Reviewer-blocking-finding telemetry once the system is live.
- If Anthropic's parallel-read pattern in nodes 1 and 2 produces synthesis loss greater than the latency it saves (measurable as inconsistencies between subagent memos that the merger can't reconcile), collapse them to single-threaded reads. This is the same trade-off Anthropic flags at ~15× token cost.

---

## Caveats

The strongest constraint on this recommendation is that the Implementer's sequential write order is itself a fixed assumption. If that assumption is later challenged — for instance, by a model strong enough to coherently parallelize backend and frontend writes within a worktree without drift — the entire argument for thick Architect-side pre-commitment weakens. As of mid-2026, the production evidence (Cognition's April 2026 essay; Cursor 2.0's worktree-isolation rather than within-worktree parallelism; Anthropic's explicit "less effective for tightly interdependent tasks such as coding") points the other way.

Several of the cited sources are practitioner blog posts and arXiv preprints rather than peer-reviewed work. The Cognition essays in particular are public-facing engineering posts and should be read as informed practitioner opinion plus production telemetry rather than controlled experiment. The 90.2% Anthropic figure is from internal evaluations on internal benchmarks; the 80%-of-variance-from-tokens claim is on BrowseComp specifically, not on coding tasks.

The Spec Kit Agents arXiv paper and the AgenticAKM paper appear to have publication dates in late 2025 / early 2026 and have not yet accumulated independent replication.

The recommendation that the existing design / API / data branches collapse from spine nodes to specialists is a structural change to the user's current roadmap. If those branches were chosen for organizational reasons (different teams own them, different prompt libraries are easier to maintain when split, etc.) rather than purely technical ones, those reasons need to be weighed separately — the technical case for collapse is strong, but the operational case for keeping them logically separate inside one writer (with their own prompt libraries and their own evaluation harnesses) is also strong, and is fully compatible with the recommended structure.

Finally, the six-node count is not magic. The argument is for the *functions* (context assembly, options exploration, architecture commit, contract production, task planning, critic) and the *property* (single-writer per artifact, parallel reads only at evidence-gather nodes, fresh-context critic). If two functions can be cleanly fused without violating those properties, fewer nodes are fine; if one function turns out to need decomposition (e.g., Contract Designer becomes too thick and needs to be split into "internal contracts" and "external contracts"), more nodes are fine. The structure should serve the spine's load-bearing properties, not the reverse.