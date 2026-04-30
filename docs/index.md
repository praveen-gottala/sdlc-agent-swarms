# CHIP Documentation

**CHIP** (Crafted Human Intelligence Platform) is an open-source multi-agent SDLC framework. AI agents handle design, specification, implementation, and review -- with human-in-the-loop oversight at every critical decision point.

## Reading Order

Start here, in this order:

| # | Document | Purpose |
|---|----------|---------|
| 1 | [Vision](vision.md) | Architectural authority. 15 layers with locked/open decisions, current vs target state. **When vision and codebase disagree, the vision wins.** |
| 2 | [PRD](specs/PRD.md) | Product spec. Source of truth for product scope, interfaces, API contracts, enums. |
| 3 | [Roadmap](roadmap.md) | Eight-phase dependency-ordered rollout with demoable outcomes per phase. |
| 4 | [Design Decisions](design-decisions.md) | Decisions by topic with reasoning, alternatives considered, and revisit criteria. |
| 5 | [Lessons Learned](lessons-learned-rules.md) | Active rules -- what to follow and what has been superseded. |

## Architecture

CHIP follows a **four-stage vertical spine** with specialist tools:

1. **Clarifier** -- reads input, runs clarification pipeline, emits enriched requirement + assumption ledger
2. **Architect** -- produces architecture spec, ADRs, task plan
3. **Implementer** -- single-threaded tool-loop; writes all code for a task in sequence
4. **Reviewer** -- fresh-context diff review with deterministic gates first, LLM review second

The single invariant: **context quality and write-coupling are the axes**. Get good context into each LLM call. Keep writes single-threaded per artifact.

## Documentation Sections

| Section | What's in it | When to read |
|---------|-------------|--------------|
| [Architecture](architecture/README.md) | Vision, system design, dataflows, contracts, design decisions. | Understanding how components connect. |
| [Specs](specs/README.md) | Product requirements. PRD + domain specs. | Understanding what we're building. |
| [How-To Guides](guides/README.md) | CLI reference + operational guides (design generation, Langfuse, model selection). | Learning how to use a specific capability. |
| [ADRs](adrs/ADR-002-event-payload-structure.md) | Architecture Decision Records (ADR-002 through ADR-051). | Before making architectural choices. |
| [Operations](plans/active/visual-diversity/execution-plan.md) | Active/backlog/completed plans + known issues. | Planning or resuming work on any initiative. |
| [Reference](reference/README.md) | Lessons learned, status docs, known limitations. | Checking current state or constraints. |
| [Research](research/planning-methodology-investigation.md) | Investigation reports and methodology analysis. | Understanding why decisions were made. |

## Tech Stack

- **Monorepo:** Nx with TypeScript
- **Orchestration:** TypeScript LangGraph (sole runtime per ADR-043)
- **Dashboard:** Next.js + Mantine v9
- **Testing:** Jest + Playwright
- **Observability:** OpenTelemetry + Langfuse self-hosted
- **RAG:** Tree-sitter + Voyage embeddings + Qdrant + Cohere Rerank

## Developer Portal

This documentation is rendered via [Backstage TechDocs](https://backstage.io/docs/features/techdocs/). See the [Developer Portal Guide](guides/backstage-developer-portal.md) for setup and contribution instructions.
