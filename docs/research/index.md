# Research

CHIP's research documents are the evidence base behind architectural decisions. They contain competitive analysis, academic citations, codebase validation, and design reasoning — the WHY behind the WHAT.

**Architecture docs are the authority. Research docs are the evidence.** For current decisions, start with [vision.md](../vision.md) (15-layer authority) and the [Architecture section](../architecture/architecture.md). Come here when you want to understand why a decision was made, what alternatives were considered, or what production evidence supports it.

## Reading Tracks

### Track 1: Spine Architecture

How CHIP's four-stage spine (Clarifier, Architect, Implementer, Reviewer) was designed and validated.

1. [The Spine Pattern](../architecture/spine-pattern.md) (architecture) — Universal principles: single writer, fresh context, typed channels, deterministic gates, assumption ledger. 24 academic + production citations.
2. [Architect Design](architect-design.md) — Why Approach B (thick Architect with contracts) wins over Approach A (thin planning-only). Validates spine against Cognition, Anthropic, and academic literature.
3. [Architect Codebase-Grounded Design](architect-codebase-grounded-design.md) — Validates Approach B against the actual CHIP codebase using real CashPulse data. Identifies 6 gaps, traces data flows, produces concrete solutions.
4. [Orchestrator & Multi-Agent Coordination](R1-orchestrator-management.md) — Industry survey of git worktree coordination across Cursor 2.0, Claude Code, Codex, Devin, and 4 others.

### Track 2: Clarifier

How CHIP's conversational clarification pipeline was designed.

1. [Clarifier Pipeline](../concepts/clarifier-pipeline.md) (concepts) — Current 9-node LangGraph implementation.
2. [Clarifier Competitive Analysis](clarifier-research.md) — 10 production tools analyzed (Cursor, Devin, Bolt, Lovable, v0, Replit, ChatPRD, Sweep, Mutable, ClarifyGPT). Three grounding patterns identified.
3. [Question Generation Approaches](clarifier-question-generation.md) — Four option-generation strategies compared. ClarifyGPT academic validation (FSE 2024).

### Track 3: Design Pipeline

How CHIP generates UI designs from specifications.

1. [Design Pipeline](../concepts/design-pipeline.md) (concepts) — Current implementation overview.
2. [Visual Diversity Investigation](visual-diversity-investigation.md) — Market review of v0, Lovable, Subframe, Stitch, Google Polmet, MagicPath. Two architectural camps analyzed.
3. [CHIP vs OpenUI Comparison](chip-vs-openui-comparison.md) — Technical comparison of CHIP's flat JSON adjacency list vs Thesys OpenUI's custom DSL. Format, quality, token efficiency benchmarked.

## Document Status

| Document | Last Updated | Status | Notes |
|----------|-------------|--------|-------|
| [Research Report](research-report.md) | 2026-05-05 | Historical baseline | Original comprehensive report. Superseded by [spine-pattern.md](../architecture/spine-pattern.md) for conclusions, individual research docs for evidence. |
| [Architect Design](architect-design.md) | 2026-05-05 | Authoritative | Foundational Approach A vs B analysis. Referenced by [spine-implementation.md](../architecture/spine-implementation.md). |
| [Architect Codebase-Grounded Design](architect-codebase-grounded-design.md) | 2026-05-05 | Point-in-time (2026-05-04) | Validated against codebase on specific date. Has staleness admonition. |
| [Clarifier Competitive Analysis](clarifier-research.md) | 2026-05-02 | Point-in-time (2026-05-02) | Tool landscape (Cursor, Devin, etc.) may have evolved since writing. |
| [Question Generation Approaches](clarifier-question-generation.md) | 2026-05-02 | Authoritative | Approach analysis; conclusions remain valid. |
| [Planning Methodology Investigation](planning-methodology-investigation.md) | 2026-04-27 | Point-in-time (2026-04-27) | Methodology decisions settled. See counter-analysis for pressure test. |
| [Planning Methodology Counter-Analysis](planning-methodology-counter-analysis.md) | 2026-04-30 | Point-in-time (2026-04-30) | Verifies sources cited in investigation doc. |
| [Visual Diversity Investigation](visual-diversity-investigation.md) | 2026-04-30 | Point-in-time (2026-04-30) | Market analysis is time-sensitive. Design pipeline decisions settled. |
| [CHIP vs OpenUI Comparison](chip-vs-openui-comparison.md) | 2026-05-12 | Authoritative | Current technical comparison. |
| [Orchestrator & Multi-Agent Coordination](R1-orchestrator-management.md) | 2026-05-05 | Authoritative | Industry survey with concrete CHIP design recommendation. |

## Research Briefs

Self-contained LLM research briefs that block specific milestones. Each brief includes architecture context, verbatim Zod schemas, real data examples, and settled decisions — designed so an LLM without codebase access can produce a useful report.

| Brief | Blocks | Topic |
|-------|--------|-------|
| [R1: Orchestrator](briefs/R1-orchestrator-multi-agent.md) | M4 | Orchestrator architecture, worktree lifecycle, failure handling |
| [R2: Task Decomposition](briefs/R2-task-decomposition.md) | M3 | Task granularity heuristics, brownfield task types |
| [R3: Inter-Task Context](briefs/R3-inter-task-context.md) | M3 | Context package between dependent tasks |
| [R4: Styling & Stack](briefs/R4-styling-stack-decision.md) | M2 | Where tech stack and styling library decisions live |
| [R5: Design Bootstrap](briefs/R5-design-system-bootstrap.md) | M1 | Greenfield sequence before Clarifier |
| [R6: Spec-Driven Dev](briefs/R6-spec-driven-development.md) | M3 | Contract specificity for independent agents |

!!! info "Planned briefs (P0 blockers for M1)"

    **R7: Dashboard Spine Integration** — How Dashboard generate buttons invoke the spine. What replaces `buildDashboardPipelineInput()` and the current API routes.

    **R8: Multi-Screen Design Coordination** — Who owns shared chrome generation in spine mode. How frozen chrome threads across the Implementer's task DAG.

    See [CHIP's Next Steps execution plan](../plans/active/chips-next-steps/execution-plan.md) for milestone dependencies.

## Planning Research

These documents informed CHIP's approach to planning methodology but are not directly tied to a specific pipeline stage.

- [Planning Methodology Investigation](planning-methodology-investigation.md) — Six sources analyzed on whether agentic frameworks should plan like they teach agents to plan.
- [Planning Methodology Counter-Analysis](planning-methodology-counter-analysis.md) — Pressure test of the investigation above. Surfaces source distortions and honest trade-offs.

## Related

- [Vision](../vision.md) — 15-layer architectural authority (decisions)
- [The Spine Pattern](../architecture/spine-pattern.md) — Universal principles (synthesis)
- [Spine Implementation](../architecture/spine-implementation.md) — CHIP-specific details (implementation)
- [Design Decisions](../design-decisions.md) — Rejected alternatives with reasoning
- [CHIP's Next Steps](../plans/active/chips-next-steps/execution-plan.md) — Spine build-out milestones (M0-M4)
