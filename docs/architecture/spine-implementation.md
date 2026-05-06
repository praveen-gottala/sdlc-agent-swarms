# CHIP's Spine

> Authoritative sources: [vision.md Layer 3](../vision.md#layer-3-agent-taxonomy),
> [The Spine Pattern](spine-pattern.md),
> [Architect Research](../research/architect-design.md),
> [Codebase-Grounded Design](../research/architect-codebase-grounded-design.md)

!!! abstract "About this document"

    How CHIP implements the four-stage spine pattern — node sequences, context
    handoffs, gate mechanics for all four stages. Every design decision is
    traced to external research and validated against the existing codebase.
    Read [The Spine Pattern](spine-pattern.md) first for the universal
    principles. For the system-level package layout and dependency graph, see
    [System Architecture](architecture.md).

---

## Overview

CHIP applies the spine as: **Clarifier -> Architect -> Implementer -> Reviewer**. Each stage owns a typed artifact, enforces single-writer discipline, and hands off through Zod-typed LangGraph channels. Three HITL gates sit at structural boundaries.

```mermaid
graph LR
    A[Product Idea] --> B[Clarifier]
    B -->|EnrichedRequirement + AssumptionLedger| C[Architect]
    C -->|ArchitectureSpec + TaskPlan| D[Implementer]
    D -->|CodeDiff| E[Reviewer]
    E -->|ReviewResult| F[Deployed Software]

    B -.->|HITL interrupt| H[Human]
    C -.->|HITL interrupt| H
    E -.->|HITL interrupt| H

    style B fill:#4A90D9,color:#fff
    style C fill:#7B68EE,color:#fff
    style D fill:#2ECC71,color:#fff
    style E fill:#E67E22,color:#fff
```

> Blue = Clarifier · Purple = Architect · Green = Implementer · Orange = Reviewer

The single invariant governing every decision: **context quality and write-coupling are the axes** ([vision.md](../vision.md#20-the-single-invariant)). Get good context into each LLM call. Keep writes single-threaded per artifact.

---

## Stage 1: Clarifier

!!! success "Status: Built"

    `packages/agents-clarifier/` --- 9-node LangGraph StateGraph, 114+ tests, dual
    bootstrap/evolution modes, HITL interrupts, assumption ledger.

The Clarifier is CHIP's front door. It transforms a raw product idea into structured, typed artifacts that downstream stages consume.

### Internal Structure

The Clarifier has **9 nodes** (correcting the "6 nodes" reference in several older docs --- see [Stale Documentation](#stale-documentation)):

| # | Node | Role | HITL? |
|---|------|------|-------|
| 1 | `contextRetriever` | Loads catalog, platform constraints; evolution mode calls 5 RAG tools | No |
| 2 | `prdAnalyzer` | Extracts structured PRD from raw input via forced-JSON Zod schema | No |
| 3 | `gapDetector` | Two-pass: deterministic intent checks + ClarifyGPT divergence detection | No |
| 4 | `questionPrioritizer` | Ranks gaps by EVPI score: `blastRadius * answerability * confidenceGap` | No |
| 5 | `storyWriter` | Produces EnrichedRequirement, FeaturePlan, AssumptionLedger | **Yes** |
| 6 | `critic` | Deterministic INVEST/EARS/DAG consistency checks | No |
| 7 | `prdUpdater` | Merges human clarification answers back into prdDraft between rounds | No |
| 8 | `escalationGate` | Human decides after maxRounds exhausted | **Yes** |
| 9 | `emitComplete` | Finalization, bridge event emission | No |

Source: `architect-codebase-grounded-design.md` Part 1.2, verified against `packages/agents-clarifier/src/graph/clarifier-graph.ts`.

```mermaid
graph TD
    subgraph Graph ["LangGraph StateGraph"]
        CR[contextRetriever] --> PA[prdAnalyzer]
        PA --> GD[gapDetector]
        GD --> QP[questionPrioritizer]
        QP -->|HITL interrupt| SW[storyWriter]
        SW --> C[critic]
        C -->|retry| SW
        C -->|new round via prdUpdater| GD
        C -->|max rounds| EG[escalationGate]
        C -->|passed| EC[emitComplete]
        EG -->|accept| EC
        EG -->|restart| GD
    end

    style CR fill:#4A90D9,color:#fff
    style EC fill:#2ECC71,color:#fff
```

> Blue = entry node · Green = exit node

### Design Decisions (Research-Backed)

**Bootstrap vs. evolution modes.** The Clarifier runs in two modes, backed by `clarifier-research.md` Lesson 7: "A single-clarifier-fits-all approach is unlikely to work. The clarifier needs to know whether it's bootstrapping or evolving and switch its option-generation strategy accordingly."

- **Bootstrap:** Loads base catalog + design tokens. Produces initial PRD.
- **Evolution:** Retrieves codebase via all 5 RAG tools (`searchCode`, `searchDocs`, `searchDesigns`, `getRepoMap`, `findSimilarPatterns`). Produces change request with impact analysis.

**Gap detection: deterministic + LLM hybrid.** Deterministic checklist (auth, validation, errors, NFRs, accessibility, orphan screens) catches structural gaps. ClarifyGPT consistency sampling (3 implementations at temperature 0.7, divergence analysis at temperature 0) catches semantic gaps. Backed by ClarifyGPT (FSE 2024): Pass@1 70.96% to 80.80%.

**Question budget.** Micro features 0--2, standard epics 3--7, cross-cutting max 15 per round, max 3 rounds. Backed by ClarifyCoder counter-evidence: over-asking drops pass@1 from 65% to 27%. The budget enforces calibrated uncertainty.

**Escalation.** After max rounds, user chooses: accept (best-effort PRD, confidence capped at 0.5), restart, or abandon.

### Outputs

The Clarifier's actual output is **richer than the original research assumed** (`architect-codebase-grounded-design.md` Part 1.1). This has a direct implication for the Architect: Node 4 (Contract Designer) refines existing structure, it does not discover from scratch.

**EnrichedRequirement** --- the primary handoff artifact:

```typescript
{
  id: string,                              // "req-{timestamp}"
  rawInput: string,                        // Original user request
  mode: 'bootstrap' | 'evolution',
  prd: PRD,                                // Structured JSON (see below)
  assumptionLedger: AssumptionLedger,      // First-class artifact
  clarificationRounds: [{round, questionsAsked, questionsAnswered, timestamp}],
  confidence: number,                      // 0-1 (capped at 0.5 if maxRounds reached)
}
```

**PRD** --- already structured JSON, not prose:

```typescript
{
  features: [{id, name, description, priority}],
  personas: [{id, name, role, goals: string[]}],
  dataEntities: [{id, name, fields: [{name, type, required?, description?}], relationships?}],
  screens: [{id, name, description, screenType?: 'page'|'modal'|'drawer'|'sheet'}],
  nfrs: [{id, category, description, target?, measurement?}],
  successMetrics: [{id, name, description, target, measurement}],
  outOfScope: string[],
}
```

Source: `packages/core/src/types/cross-boundary-artifacts.schemas.ts:121-161`.

---

## Stage 2: Architect

!!! warning "Status: Research Complete, Not Yet Implemented"

    Two research documents totaling 863 lines ground the design. The research
    recommends building Node 6 (Critic) first, then Node 4 (Contract Designer).
    See [Architect Research](../research/architect-design.md).

The Architect consumes the Clarifier's output and produces the full contract bundle the Implementer needs before writing any code. This is "Approach B" (thick Architect) --- the research recommends it "unequivocally" because the Implementer's sequential write order requires all cross-cutting decisions upfront (`architect-design.md` Section 3).

### Three Codebase-Grounded Adjustments

The theoretical research (`architect-design.md`) was validated against the codebase (`architect-codebase-grounded-design.md`). Three structural adjustments emerged:

**Adjustment 1: Clarifier output is richer than assumed.** The research assumed "enriched PRD + assumption ledger" as the Clarifier's output. The actual output includes structured `prd.dataEntities[]` with entity names, typed fields, required flags, and relationships, plus `prd.screens[]` with screen names, descriptions, and screen types. The Architect's Contract Designer refines these into concrete schemas --- it does not discover entities from scratch. Source: `architect-codebase-grounded-design.md` Part 1.1.

**Adjustment 2: No Classifier stage exists.** The research assumes a "Classifier" that produces `ChangeClassification` before the Architect. The schema exists (`cross-boundary-artifacts.schemas.ts:167-174`) but has no producer. Recommended: a lightweight Node 0.5 inside the Architect graph. Why not the Clarifier: it would couple the Clarifier to brownfield concerns architecturally owned by the Architect. Why not a standalone stage: adds ceremony for a single LLM call. Source: `architect-codebase-grounded-design.md` Part 1.3.

**Adjustment 3: Design pipeline overlap.** The design pipeline in `packages/agents-ux/` has research and planning stages already doing Architect-level work --- component composition, token validation, screen specs. These should be extracted into shared modules that both the Architect's Contract Designer and the design pipeline's visual stages can invoke. Source: `architect-codebase-grounded-design.md` Part 1.4.

### The Seven Nodes

```mermaid
graph TD
    N0["Node 0.5: Change Classifier<br/>(brownfield only)"]
    N1["Node 1: Context Assembler<br/>(parallel reads)"]
    N2["Node 2: Options Explorer<br/>(parallel reads)"]
    N3["Node 3: Architecture & ADR Writer<br/>(single-threaded)"]
    N4["Node 4: Contract Designer<br/>(single-threaded, thickest)"]
    N5["Node 5: Task Planner<br/>(single-threaded)"]
    N6["Node 6: Architect Critic<br/>(fresh context)"]

    N0 --> N1
    N1 --> N2
    N2 --> N3
    N3 --> N4
    N4 --> N5
    N5 --> N6

    N6 -->|blocking findings| N3
    N6 -->|green| OUT[ContractBundle to Implementer]

    style N0 fill:#95a5a6,color:#fff
    style N1 fill:#3498db,color:#fff
    style N2 fill:#3498db,color:#fff
    style N3 fill:#9b59b6,color:#fff
    style N4 fill:#9b59b6,color:#fff
    style N5 fill:#9b59b6,color:#fff
    style N6 fill:#e67e22,color:#fff
```

> Gray = conditional (brownfield only) · Blue = parallel readers · Purple = single-threaded writers · Orange = critic

**Node 0.5 --- Change Classifier** (brownfield only). Single LLM call producing `ChangeClassification` (5 scope axes: UI, component, designSystem, API, dataModel; plus blast radius). Greenfield: skipped, all axes implicitly `true`.

**Node 1 --- Context & Constraints Assembler.** Anthropic-style parallel reads --- safe because read-only. Spawns N subagents: repo-map digest (brownfield), ADR library retriever, steering-file loader, reference-pattern matcher, design system context builder (reuses `buildDesignSystemContext()` from `packages/agents-ux/src/ux-design/design-system-context.ts`). Deterministic merger fuses memos into `ConstraintSet`. Source: `architect-design.md` Node 1, validated in `architect-codebase-grounded-design.md` Part 1.6.

**Node 2 --- Options Explorer.** Parallel reads per open decision axis. Each subagent researches one axis (e.g., "extend existing service vs. carve new module"), returns structured `OptionMemo`. No commitments --- evidence only. Source: `architect-design.md` Node 2.

**Node 3 --- Architecture & ADR Writer.** Single-threaded LLM writer (`claude-opus-4-6`). Writes `ArchitectureSpec` first, then ADRs. Brownfield: `defaultToExistingPattern = true`, deviation requires explicit ADR. Every decision updates the `AssumptionLedger`. Source: `architect-design.md` Node 3.

**Node 4 --- Contract Designer.** The thickest node. Sequential specialist invocation mirroring the Implementer's write order, one stage earlier:

1. **Data model** --- refines `prd.dataEntities[]` into concrete column types, indexes, constraints, migration plan. Only if `changeClassification.scopeAxes.dataModel === true` (brownfield).
2. **API contracts** --- OpenAPI 3.1 fragments. Reads data model (just written) for field-shape consistency. Only if `scopeAxes.api === true`.
3. **Component composition** --- reuses `ComponentTreeNode` building logic from `packages/agents-ux/src/ux-planning/`. Only if `scopeAxes.component === true`.
4. **Screen specs** --- uses existing `ScreenPlan` schema. Reuses constraint analysis from `packages/agents-ux/src/ux-research/`. Only if `scopeAxes.ui === true`.
5. **Design system diff** --- reuses `token-validation.ts` from `packages/agents-ux/src/ux-planning/`. Only if `scopeAxes.designSystem === true`.

Research basis for sequencing: "A screen spec written without the API contract settled will commit to an implicit data shape the API contract may contradict" (`architect-design.md` Section 4). This is why per-scope branches collapse from parallel spine nodes to sequential specialists inside one writer.

**Node 5 --- Task Planner.** Decomposes into `TaskPlan` DAG. Each task declares file paths it will write (single-writer rule enforceable downstream). Deterministic validators: PRD criterion coverage, DAG acyclicity, no two tasks write the same file. Source: `architect-design.md` Node 5.

**Node 6 --- Architect Critic.** Fresh context --- loads outputs but NOT reasoning traces. Deterministic gates first (OpenAPI lints, migration SQL parses, ADR completeness, DAG acyclicity, PRD criterion coverage, single-writer check). LLM review second (contradictions, token gaps, assumption violations). Reuses `assess-catalog-adoption.ts` from `packages/agents-ux/`. Source: `architect-design.md` Node 6.

### Greenfield vs. Brownfield

Same seven nodes, different inputs and strictness (`architect-design.md` Section 4):

| Parameter | Greenfield | Brownfield |
|-----------|-----------|------------|
| Input to Node 0.5 | Skipped (all axes `true`) | `EnrichedRequirement` + repo context |
| Node 1 subagents | Steering files + reference patterns (aggressive) | All subagents including repo map + ADR library |
| Node 3 strictness | Every pick gets an ADR | Default to existing patterns; deviation requires ADR |
| Node 4 specialists | All 5 run | Only specialists for touched scope axes |

This symmetry mirrors the Clarifier's bootstrap/evolution design --- same workflow, different inputs. Validated by convergent practitioner evidence: Augment Code (Intent), Kiro (steering files), Spec Kit (greenfield/brownfield split). Source: `architect-design.md` Section 4.

---

## Stage 3: Implementer

!!! warning "Status: Specified, Not Yet Implemented"

    Locked decisions in [vision.md Layer 8](../vision.md#layer-8-implementation).
    Single-threaded tool loop with sequential write order.

### Design (Research-Backed)

**Single-threaded tool loop.** Processes one task at a time in sequential write order. Every production coding agent (Devin, Claude Code, Cursor Composer, Aider) is single-threaded at the artifact level --- see [The Spine Pattern](spine-pattern.md#1-single-writer-per-artifact).

**Sequential write order** (locked decision):

1. DB migration
2. Backend endpoint + service layer
3. Backend tests
4. Frontend component
5. Frontend tests
6. Integration test

Each step appends to the LLM's context so later steps see earlier decisions. This mirrors the Architect's Contract Designer sequencing applied one level lower --- the Architect decides *what* to build (contracts), the Implementer decides *how* to build it (code). Source: `vision.md` Layer 8:603-609.

**Deterministic gates** (locked decision): Typecheck, lint, tests pass to exit. Hard caps: 5 iteration limit, 200K token budget, 15-minute wall clock. LLM never self-declares completion. Budget caps are hard --- fail loud when exceeded.

**Model:** `claude-sonnet-4-6` (balanced).

**Cross-task parallelism:** Multiple tasks run concurrently in separate git worktrees. Merging via normal git. `max_concurrent_tasks` configurable (default 3). Source: `vision.md` Layer 8:642-644.

### Design Pipeline Integration

When integrated with the spine, the design pipeline redistributes (`architect-codebase-grounded-design.md` Part 2.2):

| Design Pipeline Stage | Where in Spine | Why |
|----------------------|----------------|-----|
| Research (constraints, patterns, accessibility) | **Architect Node 1 + Node 4** | Constraint assembly is Architect-level work |
| Planning (component tree, token bindings) | **Architect Node 4** | Component composition is a contract, not implementation |
| Design (DesignSpec v2 JSON generation) | **Implementer specialist tool** | Visual design is implementation |
| Evaluator (structural quality, catalog adoption) | **Implementer specialist tool** | Quality gating during implementation |

When the Implementer reaches a frontend task requiring UI, it invokes the design pipeline's design + evaluator stages as specialist tools, passing the Architect's `ScreenPlan` + `ComponentComposition` + `DesignTokensSpec` as input. Research and planning are skipped because the Architect already did that work --- cutting invocation from 4 stages to 2.

The standalone CLI path (`design:page` command) continues running all 4 stages for development iteration and demo purposes. For the standalone pipeline concept, stages, and evaluator approach, see [Design Pipeline](../concepts/design-pipeline.md).

### Open Decisions

From `vision.md` Layer 8, still unresolved:

1. **Tasks with no UI or no backend changes** --- skip irrelevant steps, driven by task scope from `TaskPlan`.
2. **Mid-task clarification** --- probably yes, via escalation to human (e.g., "this task references an entity field that doesn't exist").
3. **Tasks touching multiple modules** --- lean toward Architect splitting upstream so Implementer always gets scoped tasks.
4. **Intermediate commits** --- intermediate commits give rollback points; continuous rebase gives a clean final diff.

---

## Stage 4: Reviewer

!!! warning "Status: Specified, Not Yet Implemented"

    Locked decisions in [vision.md Layer 9](../vision.md#layer-9-review).
    Fresh context, deterministic gates first, bounded retry.

### Design (Research-Backed)

**Fresh context.** The Reviewer runs in a separate LangGraph graph. It does NOT inherit the Implementer's conversation, tool calls, or reasoning trace. It inherits the diff, the `ArchitectureSpec`, and the `AssumptionLedger`. Research basis: Cognition's Devin Review catches approximately 2 bugs per PR, 58% severe --- but only when the reviewer has clean context (`architect-design.md` Section 1, Property 2).

**Four sequential passes:**

1. **Deterministic gates** (run first): typecheck, lint, full test suite, Semgrep + CodeQL security scan, dependency license check. Any failure returns immediately to the Implementer.
2. **LLM reviewer**: failure-mode checklist prompt, scoped to the diff, with `ArchitectureSpec` and `AssumptionLedger` as context.
3. **Assumption validator**: compares diff against `AssumptionLedger`. Catches implementation details that contradict recorded assumptions.
4. **Triage**: categorizes findings as blocking / suggestion / false-positive with evidence.

**Post-review routing:**

- Approved -> HITL merge gate (human reviews PR on GitHub)
- Rejected with blocking findings -> return to Implementer (max 2 revisions)
- After 2 failed revisions -> escalate to human with full context

**Identical for greenfield and brownfield.** The Reviewer is diff-based --- it reviews code changes against spec and assumptions. Whether the project is new or existing does not change the review process. Source: `architect-codebase-grounded-design.md` Part 3.2.

**Model:** `claude-sonnet-4-6` (POC), possibly `claude-opus-4-6` (production). The 2025 DORA report and 2026 practitioner experience consistently report that review cost --- not generation cost --- is the binding constraint. This may warrant investing the most capable model in the Reviewer stage. Source: `planning-methodology-counter-analysis.md`.

---

## Specialist Tools

Specialists are invoked by spine stages as tools. They never run in parallel as writers to shared artifacts. Research basis: Yan April 2026: successful multi-agent patterns have "writes stay single-threaded" and additional agents "contribute intelligence rather than actions."

```mermaid
graph TD
    subgraph Spine ["Sequential Spine (single writer per stage)"]
        C[Clarifier] -->|EnrichedRequirement + AssumptionLedger| A[Architect]
        A -->|ArchitectureSpec + TaskPlan| I[Implementer]
        I -->|CodeDiff| R[Reviewer]
    end

    subgraph Specialists ["Specialist Tools (invoked by spine stages)"]
        S1[Research Subagent]
        S2[Design Subagent]
        S3[Test Generator]
        S4[Security Scanner]
        S5[Visual Validator]
        S6[Doc Generator]
    end

    C -.-> S1
    A -.-> S1
    A -.-> S2
    I -.-> S1
    I -.-> S2
    I -.-> S3
    I -.-> S6
    R -.-> S4
    R -.-> S5

    style C fill:#4A90D9,color:#fff
    style A fill:#7B68EE,color:#fff
    style I fill:#2ECC71,color:#fff
    style R fill:#E67E22,color:#fff
```

> Blue = Clarifier · Purple = Architect · Green = Implementer · Orange = Reviewer. Dashed arrows show specialist tool invocation.

| Specialist | Invoked By | Implementation |
|-----------|-----------|----------------|
| Research subagent | Clarifier, Architect, Implementer | Read-only `packages/retrieval` tools returning compressed summaries |
| Design subagent | Architect, Implementer | `packages/agents-ux` design pipeline (research -> planning -> design -> evaluator) |
| Test generator | Implementer | Emits failing tests before implementation |
| Security scanner | Reviewer | Semgrep + CodeQL diff scan, LLM triage, no autonomous remediation |
| Visual validator | Reviewer | Playwright browser verification |
| Doc generator | Implementer | API docs, user guides |

### Collapsed Roles

The original ten-agent model mapped to a human org chart. The spine collapses it:

| Original Agent | Disposition |
|---------------|------------|
| PM Agent | Absorbed into Clarifier |
| Product Agent | Absorbed into Clarifier |
| Architect Agent | Spine stage 2 |
| Design Agent | Specialist tool (Architect, Implementer) |
| Implementation Agent | Spine stage 3 |
| Testing Agent | Specialist tool (Implementer) |
| Review Agent | Spine stage 4 |
| DevOps Agent | Specialist tool (Implementer) |
| Security Agent | Specialist tool (Reviewer) |
| Docs Agent | Specialist tool (Implementer) |

---

## Typed Contracts Between Stages

Every artifact that crosses a stage boundary has a Zod schema in `packages/core/src/types/`. This is a locked decision ([vision.md Layer 2](../vision.md#layer-2-coordination-substrate)).

### Clarifier -> Architect

| Contract | Schema Location | Status |
|----------|----------------|--------|
| `EnrichedRequirement` | `cross-boundary-artifacts.schemas.ts:152-161` | Exists, used |
| `AssumptionLedger` | `cross-boundary-artifacts.schemas.ts:45-62` | Exists, used |
| `PRD` | `cross-boundary-artifacts.schemas.ts:121-139` | Exists, used |
| `FeaturePlan` | `cross-boundary-artifacts.schemas.ts:190-193` | Exists, used |

### Architect -> Implementer

| Contract | Purpose | Status |
|----------|---------|--------|
| `ArchitectureSpec` | System overview, components, sequence diagrams | Needs creation |
| `TaskPlan` | Implementation DAG with per-task file paths and write order | Needs creation |
| `ContractBundle` | Full Architect output bundle | Needs creation |
| `ConstraintSet` | Fused constraints from evidence streams | Needs creation |
| `OptionsBundle` | Option memos per open decision axis | Needs creation |
| `ArchitectCriticReport` | Triage of findings, gate status | Needs creation |
| `ScreenPlan` | Screen component membership, data bindings, navigation | Exists, unused |
| `ChangeClassification` | 5 scope axes + blast radius | Exists, no producer |

Source: `architect-codebase-grounded-design.md` Part 1.5.

### Implementer -> Reviewer

| Contract | Purpose | Status |
|----------|---------|--------|
| `Diff` | Git diff of all changes | Exists |
| `ArchitectureSpec` | Reviewer's reference (from Architect) | Needs creation |
| `AssumptionLedger` | For Pass 3 assumption validation | Exists |
| `TaskPlan` | Which tasks were executed | Needs creation |

---

## Assumption Ledger Lifecycle

The assumption ledger threads through the entire spine as the anti-drift backbone. Research basis: "The single most cost-effective anti-drift mechanism identified in the research synthesis" (`design-decisions.md` Section 2.3).

```mermaid
graph LR
    CL[Clarifier] -->|creates entries for<br/>unresolved gaps| AL1[Ledger v1]
    AL1 -->|Architect adds entries for<br/>every architecture &<br/>contract decision| AL2[Ledger v2]
    AL2 -->|Implementer flags<br/>conflicts via<br/>report-assumption-violation| AL3[Ledger v3]
    AL3 -->|Reviewer validates<br/>diff against ledger,<br/>flags contradictions| AL4[Ledger v4]

    style CL fill:#4A90D9,color:#fff
    style AL1 fill:#95a5a6,color:#fff
    style AL2 fill:#7B68EE,color:#fff
    style AL3 fill:#2ECC71,color:#fff
    style AL4 fill:#E67E22,color:#fff
```

> Ledger versions colored by owning stage. Blue = Clarifier · Purple = Architect · Green = Implementer · Orange = Reviewer · Gray = initial state.

| Stage | Ledger Action | Implementation Status |
|-------|--------------|----------------------|
| Clarifier | Creates entries for unresolved gaps after maxRounds; marks resolved when human answers | **Built** (`story-writer.ts`) |
| Architect | Nodes 3-4 add entries for every architecture and contract decision; Critic (Node 6) checks for internal contradictions | Not yet implemented |
| Implementer | Uses `report-assumption-violation` tool to flag conflicts with recorded assumptions | Not yet implemented |
| Reviewer | Pass 3 validates diff against ledger; flags contradictions as blocking findings | Not yet implemented |

Source: `architect-codebase-grounded-design.md` Part 3.4.

---

## HITL Gates

Three structural checkpoints positioned on the spine, implemented as LangGraph `interruptBefore` nodes with Postgres-backed state persistence.

| Gate | Location | Decision | Mechanism | Status |
|------|----------|----------|-----------|--------|
| Gate 1 | After Clarifier `questionPrioritizer` | Human answers batched questions | `interruptBefore: ['storyWriter']` | **Built** |
| Gate 1.5 | After Clarifier `critic` (max rounds) | Accept / restart / abandon | `interruptBefore: ['escalationGate']` | **Built** |
| Gate 2 | After Architect Node 6 (Critic green) | Human reviews architecture, contracts, task plan | LangGraph interrupt | Not yet implemented |
| Gate 3 | After Reviewer Pass 4 (triage) | Human reviews PR on GitHub | Git host integration | Not yet implemented |

On interrupt, full graph state serializes to Postgres checkpointer. Dashboard polls for pending approvals. On decision, graph resumes from interrupt point.

**Timeout handling:** If human does not respond within configurable timeout, escalation rules fire (retry notification, fall back to secondary channel, or fall back to recorded assumptions for non-critical questions). Source: `vision.md` Layer 10.

!!! danger "Rejected pattern"

    "Approve every tool call" / "approve every file write." Produces rubber-stamping.
    Vulnerable to HITL flooding attacks. Defeats autonomy. Source: `vision.md` Layer 10.

---

## Concurrency Model

| Dimension | Strategy | Evidence |
|-----------|----------|----------|
| Within-task | Strictly sequential, single writer | [Single writer per artifact](spine-pattern.md#1-single-writer-per-artifact) --- Yan Principle 2 |
| Cross-task | Independent features in separate git worktrees | Cursor 2.0 worktree isolation, `max_concurrent_tasks` configurable (default 3) |
| Within-stage parallel reads | Architect Nodes 1 & 2 only | Anthropic 90.2% lift for breadth-first reads, explicitly "less effective for coding" |
| Design pipeline | Sequential per-screen, sequential across screens via topological order | `vision.md` Layer 7:571-573 |

Source: `vision.md` Layer 8:642-644.

---

## Implementation Status

| Stage | Status | Package | Tests | Key Implementation Decision |
|-------|--------|---------|-------|-----------------------------|
| Clarifier | **Built** | `packages/agents-clarifier` | 114+ | 9-node LangGraph StateGraph, dual modes, HITL |
| Architect | **Research complete** | Not yet created | --- | 7-node thick Architect (Approach B). Build Node 6 first, then Node 4. |
| Implementer | **Specified** | Not yet created | --- | Single-threaded tool loop, sequential write order |
| Reviewer | **Specified** | Not yet created | --- | Fresh context, 4-pass, bounded retry |
| Design pipeline | **Built** (as specialist) | `packages/agents-ux` | Yes | 4-stage pipeline, redistributes to Architect + Implementer in spine mode |
| Retrieval | **Built** (as specialist) | `packages/retrieval` | Yes | 5 MCP-compatible RAG tools |

---

## Open Decisions

These are not yet resolved in the research or vision document. Each is flagged with the relevant context.

1. **Spine graph composition.** How do the four stages compose as a LangGraph graph? The Clarifier is already its own `StateGraph`. Options: one parent graph with compiled subgraphs, four separate graphs invoked sequentially, or a meta-orchestrator. The research notes "six-node count is not magic" (`architect-design.md` Caveats) but does not specify composition. Needs an ADR.

2. **Cross-task coordination.** `vision.md` specifies worktree isolation with "merging via normal git, not by agent coordination." Cognition has moved to "manager-Devin map-reduce-and-manage" (Yan April 2026). Whether CHIP needs a task coordinator or simple worktree isolation suffices is unresolved.

3. **Error recovery across stages.** The Reviewer returns to the Implementer (max 2 revisions). But if the Implementer fails after max retries on a task, does it escalate to the Architect (re-plan the task) or straight to human? `vision.md` says "budget caps are hard; fail loud when exceeded" but does not specify the recovery path.

4. **Total spine-run budget.** Only per-stage budgets exist (Implementer: 5 iterations, 200K tokens, 15min; Clarifier: 3 rounds; Reviewer: 2 revisions). No total spine-run budget is specified. Is per-stage sufficient, or does the full run need a total budget?

5. **Expected latency.** No document specifies end-to-end latency for a full spine run. Needs benchmarking once stages are implemented.

6. **TaskPlan instantiation.** The Architect produces a `TaskPlan` DAG with `dependencies[]` per task. How does this DAG become individual Implementer task runs? No scheduler or instantiation mechanism is specified.

7. **Reviewer model.** `claude-sonnet-4-6` for POC, possibly `claude-opus-4-6` for production. The 2025 DORA report and 2026 practitioner data say review cost dominates --- this may warrant Opus. Source: `planning-methodology-counter-analysis.md`.

8. **Architect 7-node status.** The research recommends "Stage 1 --- Adopt Approach B and freeze the six-node Architect structure" (`architect-design.md` Recommendations). But `vision.md` Layer 3 only locks the 4-stage spine, not the internal node structure. Whether to promote this to a locked decision via a vision.md update is pending.

---

## Stale Documentation

!!! info "Mostly resolved"

    Three of four stale references identified here have been fixed:

    - ~~`concepts/agent-taxonomy.md`~~ --- fixed (node count updated 6→9)
    - ~~`architecture/architecture.md`~~ --- fixed (4-stage spine model)
    - ~~`specs/sdlc-agents.md`~~ --- fixed (single-threaded Implementer)
    - **`CLAUDE.md`**: Still says "6 nodes" for Clarifier (plan status line). Update when Clarifier Initiative status is next revised.

---

## Related

- [The Spine Pattern](spine-pattern.md) --- universal principles with 24 citations
- [Vision](../vision.md) --- 15-layer architectural authority
- [Agent Taxonomy](../concepts/agent-taxonomy.md) --- spine stages and specialist tools
- [Coordination & State](../concepts/coordination-and-state.md) --- typed channels and persistence
- [Design Pipeline](../concepts/design-pipeline.md) --- standalone pipeline concept, 4-stage mechanics, renderer separation
- [State Persistence](../concepts/state-persistence.md) --- three-tier persistence (YAML, Postgres checkpointer, in-memory)
- [Design Decisions](../design-decisions.md) --- topology, coordination, and artifact decisions
- [HITL & Governance](../concepts/hitl-governance.md) --- three structural checkpoints
- [Architect Research](../research/architect-design.md) --- Approach A vs B, five load-bearing properties, 24 citations
- [Architect Codebase-Grounded Design](../research/architect-codebase-grounded-design.md) --- typed contracts, shared modules, implementation sequence
- [Clarifier Research](../research/clarifier-research.md) --- 10 production systems analyzed
