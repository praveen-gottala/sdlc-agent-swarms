# Architecture

CHIP is built on a four-stage sequential spine — Clarifier, Architect, Implementer, Reviewer — where each stage has exactly one writer, typed handoffs flow through LangGraph channels, and humans approve at structural boundaries. The architecture optimizes for two properties: context quality into each LLM call, and single-threaded writes per artifact.

## Reading path

Start with the research foundation, then move to implementation:

1. **[Architecture at a Glance](vision-overview.md)** — 15-layer status dashboard. Shows what's locked, what's open, and what's built.
2. **[The Spine Pattern](spine-pattern.md)** — research synthesis: why this architecture, grounded in 24 citations from Cognition, Anthropic, Cursor, and the academic literature.
3. **[CHIP's Spine](spine-implementation.md)** — how CHIP implements each stage: node sequences, context handoffs, HITL gate mechanics.
4. **[System Architecture](architecture.md)** — the system map: 19 packages, dependency graph, API contracts, cross-cutting concerns.

From there, dive into specifics as needed: [agent contracts](agent-contracts.md), [design pipeline dataflow](design-pipeline-dataflow.md), [design evaluator](design-evaluator.md), [prototype rendering](prototype-rendering-dataflow.md), [error handling](error-handling.md), [provider abstraction](provider-abstraction.md), [component catalog](component-catalog.md).

## Scope

This section covers **how the system is built** — spine architecture, agent contracts, data flows, provider abstraction, and component systems. For the mental models behind these designs, see [Concepts](../concepts/overview.md). For product requirements, see [Specifications](../specs/README.md). For operational guides, see [How-To Guides](../guides/README.md).
