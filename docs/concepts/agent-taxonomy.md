# Agent Taxonomy: The Four-Stage Spine

> Authoritative source: [vision.md Layers 3, 5, 8, 9](../vision.md#layer-3-agent-taxonomy)

## Why Not More Agents?

The original design had ten peer agents on an event bus — mirroring how a human engineering team is organized (PM, Product, Architect, Design, Impl, Testing, Review, DevOps, Security, Docs). This is org-chart thinking. LLM calls don't inherit the properties of human collaboration: they don't have persistent memory, they don't build rapport, and they can't negotiate ambiguous handoffs.

The real questions — which LLM call owns which artifact, what context gets passed between calls, who decides when to stop — are answered cleanly by a four-stage spine and not at all by a ten-agent peer network.

## The Spine

```mermaid
graph TD
    subgraph Spine ["Sequential Spine (single writer per stage)"]
        C[Clarifier] -->|Enriched Requirement + Assumption Ledger| A[Architect]
        A -->|Architecture Spec + Task Plan| I[Implementer]
        I -->|Code Diff| R[Reviewer]
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

### 1. Clarifier (Layer 5)

The front door. Takes raw input — either a new product idea or a change request to an existing app — and runs a six-stage pipeline: context retrieval, PRD analysis, gap detection, question prioritization, story writing, and a critic pass. Outputs an **Enriched Requirement** and an **Assumption Ledger** that tracks every question the system couldn't answer and had to assume.

**Why it matters:** No commercial tool ships a proper clarifier. Devin, Replit Agent, and Cursor all skip this step. The result: autonomous agents that confidently build the wrong thing.

### 2. Architect (Layers 3, 8)

Takes the enriched requirement and produces an architecture spec, ADRs for non-obvious decisions, and a task plan (DAG of implementation tasks). The design subagent is invoked here for screen-level UI proposals.

### 3. Implementer (Layer 8)

Single-threaded tool loop that writes all code for one task sequentially: migration, backend, backend tests, frontend, frontend tests, integration test. Each step sees the output of earlier steps in its context window.

**The key constraint:** No parallel writers within a task. Cross-task parallelism happens via git worktrees, not concurrent LLM calls editing the same codebase.

### 4. Reviewer (Layer 9)

Runs in fresh context — does not inherit the Implementer's conversation. Multi-pass review: deterministic gates first (typecheck, lint, tests, security scan), then LLM review against the spec, then assumption validation against the ledger.

## Specialists vs. Spine

Specialists are **tools**, not agents. They're invoked by spine stages and return results into the spine's context. They never run in parallel as writers to a shared artifact.

| Specialist | Invoked by | What it does |
|-----------|-----------|-------------|
| Research subagent | Clarifier, Architect, Implementer | Read-only codebase/docs exploration |
| Design subagent | Architect, Implementer | UI proposals, screen specs |
| Test generator | Implementer | Failing tests before implementation |
| Security scanner | Reviewer | Semgrep + LLM triage (no auto-remediation) |
| Visual validator | Reviewer | Playwright for UI verification |
| Doc generator | Implementer | API docs, user guides |

## Current State

- **Clarifier:** Fully implemented as a LangGraph StateGraph (6 nodes, 114 tests). Bootstrap and evolution modes both working.
- **Architect:** Specified in vision, not yet implemented.
- **Implementer:** Specified in vision, not yet implemented. Design pipeline (a specialist) is mature.
- **Reviewer:** Specified in vision, not yet implemented.

## Key Decisions

| Decision | Rationale | ADR |
|----------|-----------|-----|
| Four-stage spine | Eliminates 45 pairwise communication channels of 10-agent model | [Vision Layer 3](../vision.md#layer-3-agent-taxonomy) |
| Single-threaded implementer | Prevents parallel writer conflicts (the "Flappy Bird" failure mode) | [Vision Layer 8](../vision.md#layer-8-implementation) |
| Specialists as tools, not agents | No parallel writes to shared artifacts | [Vision Layer 3](../vision.md#layer-3-agent-taxonomy) |
| Fresh-context reviewer | Avoids confirmation bias from Implementer's conversation | [Vision Layer 9](../vision.md#layer-9-review) |

## Related Docs

- [Vision Layer 3](../vision.md#layer-3-agent-taxonomy) — agent taxonomy authority
- [Vision Layer 5](../vision.md#layer-5-clarifier-front-door) — clarifier deep dive
- [Vision Layer 8](../vision.md#layer-8-implementation) — implementer design
- [Vision Layer 9](../vision.md#layer-9-review) — reviewer design
- [Research Report](../research-report.md) — evidence behind the spine design
