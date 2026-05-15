# ADR-055: Architect Node 4 Shape — Sequential Specialists (Hybrid)

**Status:** Accepted
**Date:** 2026-05-15
**Supersedes:** None
**Related:** ADR-043 (TypeScript LangGraph sole runtime), ADR-056 (package boundary)

## Context

The Architect's Node 4 (Contract Designer) invokes five specialists sequentially: data-model, API, components, screens, design-system-diff. Two structural options were evaluated during M3 planning:

- **Option A (Sequential):** Five specialist functions called in sequence within a single Node 4 node function. Each specialist's output is appended to the bundle; the next specialist receives a sliced view via `sliceContractBundle()`. Brownfield mode uses `ChangeClassification.scopeAxes` to skip irrelevant specialists.

- **Option B (Subgraph-per-specialist):** Each specialist is a LangGraph subgraph node with its own state, enabling per-specialist retry, independent timeout, and granular telemetry. Requires subgraph compilation, state bridging, and increases graph complexity from 7 nodes to ~12.

A stonebraker design memo analyzed token math and truncation risk for a CashPulse-scale project (25 features, 8 entities, 7 screens). Key finding: sequential specialists within a single node keep context coherent — each specialist sees prior specialists' output without state-bridging overhead. The total Node 4 wall-clock (~50s) and cost (~$0.12) are within acceptable bounds for M3.

## Decision

**Ship Option A (sequential specialists) in M3. Defer Option B (subgraph-per-specialist) with an explicit migration trigger.**

Node 4 calls five specialist functions in sequence within a single LangGraph node. Each specialist:

1. Receives sliced context via `sliceContractBundle()`
2. Makes one LLM call (Sonnet) with structured output
3. Appends its artifact to the accumulating bundle
4. Passes the updated bundle to the next specialist

The sequential design mirrors the Implementer's sequential write order (vision Layer 8) applied one level up: the Architect decides *what* to build (contracts), and the order matters because later contracts reference earlier ones (e.g., screen specs reference API endpoints which reference data model entities).

## Migration Trigger

Migrate to Option B (subgraph-per-specialist) when EITHER condition is met:

- **Retry rate:** Critic gates 5–8 (entity-reference-integrity, gap-resolution, openapi-lint, migration-sql-parses) retry rate exceeds 15% across 30 consecutive runs
- **Latency:** Any single specialist's P50 latency exceeds 90 seconds

These thresholds indicate that per-specialist retry and timeout isolation would provide measurable value. Until then, the simpler sequential approach avoids premature complexity.

## Consequences

- Node 4 is a single node function containing five sequential specialist calls — simple to debug, test, and trace
- Per-specialist retry is not possible; a Critic failure on gates 5–8 re-runs the entire specialist sequence (or targeted specialist + downstream per the retry routing matrix)
- Telemetry granularity is at the Node 4 level, not per-specialist; individual specialist timing is logged but not independently observable in the graph
- Migration to Option B is additive — the specialist functions are already isolated, only the dispatch mechanism changes
