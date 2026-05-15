# ADR-056: Architect Package Boundary — Core vs. agents-architect

**Status:** Accepted
**Date:** 2026-05-15
**Supersedes:** None
**Related:** ADR-038 (TypeScript as contract truth), ADR-043 (TypeScript LangGraph sole runtime), ADR-055 (Node 4 shape)

## Context

The Architect stage spans two dependency tiers:

1. **Schemas and validation** — Zod schemas (`ArchitectureSpecSchema`, `TaskPlanSchema`, `ContractBundleSchema`, etc.) and the deterministic Critic (`validateContractBundle()`) have zero LangGraph dependency. They are consumed by eval, CLI, dashboard, and other packages that should not transitively depend on `@langchain/langgraph`.

2. **Graph, nodes, and runtime** — The LangGraph `StateGraph`, node functions, `interruptBefore` mechanics, retry routing, and `runArchitect()` entry point require `@langchain/langgraph` and `@langchain/core`.

Per `CLAUDE.md`, `packages/core/` depends on `@langchain/langgraph-checkpoint` (for checkpointer types) but NOT on `@langchain/langgraph` (the graph runtime). This boundary prevents the graph runtime from becoming a transitive dependency of every package in the monorepo.

## Decision

**Schemas + Critic stay in `packages/core/`. Graph, nodes, prompts, and runtime live in `packages/agents-architect/`.**

### In `packages/core/`

- `src/types/architect.schemas.ts` — all Architect Zod schemas: `ArchitectureSpecSchema`, `TaskPlanSchema`, `TaskNodeSchema`, `ContractBundleSchema`, `ConstraintSetSchema`, `OptionsBundleSchema`, `CriticReportSchema`, `ImplementationPatternSchema`, `ContextRefSchema`, `TaskModeSchema`, `TaskCompletionReportSchema`
- `src/architect/critic.ts` — `validateContractBundle(bundle, enrichedReq, existingFiles?)` with 14 deterministic gates
- `src/architect/token-validation.ts` — extracted from `agents-ux` via copy-then-redirect (ADR-045 Phase 1.1 amendment)

### In `packages/agents-architect/`

- `src/graph/state.ts` — `ArchitectStateAnnotation` (24 typed channels)
- `src/graph/nodes/` — 7 node functions + `gate2Approval` + `escalationGate`
- `src/graph/architect-graph.ts` — `StateGraph` assembly with `interruptBefore`
- `src/graph/retry-routing.ts` — `routeAfterCritic()` matrix
- `src/run.ts` — `runArchitect()` + `runArchitectPipelineStream()` entry points
- `src/deps.ts` — `ArchitectDeps` interface
- `src/prompts/` — versioned prompt files with rubric pointers
- `src/patterns/baseline.ts` — seed pattern catalog
- `src/context-slicer.ts` — `sliceContractBundle()` utility
- `src/sizing-heuristic.ts` — `estimateTaskTokenBudget()` utility

### Dependencies

```
packages/agents-architect/
  depends on: @agentforge/core, @agentforge/providers, @agentforge/retrieval,
              @agentforge/telemetry, @agentforge/agents-ux (peer),
              @langchain/langgraph, @langchain/core, zod
```

This mirrors the `packages/agents-clarifier/` boundary: clarifier schemas live in core, the graph lives in `agents-clarifier`.

## Consequences

- Eval, CLI, and dashboard can import Architect schemas and run the Critic without pulling in LangGraph
- `packages/agents-architect/` is the only package that depends on `@langchain/langgraph` for Architect functionality
- `@agentforge/agents-ux` is a peer dependency (not a core dependency) — `agents-architect` imports `buildDesignSystemContext` and `assessCatalogAdoption` directly; full extraction to core is deferred (see ADR-045 addendum)
- Adding a new Architect schema requires a change in `packages/core/`, not `packages/agents-architect/` — this is intentional, as schemas are cross-boundary contracts owned by the type authority
