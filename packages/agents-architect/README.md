# @agentforge/agents-architect

Architect stage of the CHIP spine. Seven-node LangGraph StateGraph that consumes the Clarifier's `EnrichedRequirement` and produces a `ContractBundle` for the Implementer.

## Nodes

| Node | File | Role |
|------|------|------|
| 0.5 | `graph/nodes/change-classifier.ts` | Brownfield change classification |
| 1 | `graph/nodes/context-assembler.ts` | Constraint and gap extraction |
| 2 | `graph/nodes/options-explorer.ts` | Decision axis exploration (parallel) |
| 3 | `graph/nodes/architecture-writer.ts` | Architecture decisions, ADRs, patterns (Opus) |
| 4 | `graph/nodes/contract-designer/` | 5 sequential specialists: data-model, API, components, screens, design-system-diff (Sonnet) |
| 5 | `graph/nodes/task-planner.ts` | Task DAG with sizing heuristic + dry-Critic (Opus) |
| 6 | `graph/nodes/critic.ts` | 14 deterministic validation gates (zero LLM calls) |

## HITL Gates

- `gate2Approval` — human reviews full ContractBundle after Critic passes
- `escalationGate` — fires after max retries or unresolvable Gate 14 failure

## Documentation

- [Architect Pipeline](../../docs/concepts/architect-pipeline.md) — concept page with per-node data flow
- [Spine Implementation §2](../../docs/architecture/spine-implementation.md) — architecture-level detail
- [ADR-055](../../docs/adrs/ADR-055-architect-node4-shape.md) — Contract Designer shape
- [ADR-056](../../docs/adrs/ADR-056-architect-package-boundary.md) — core vs agents-architect boundary

## Dependencies

- `@agentforge/core` — schemas, Critic, token-validation
- `@agentforge/providers` — LLM provider
- `@agentforge/retrieval` — brownfield repo-map tools
- `@agentforge/telemetry` — traced provider
- `@agentforge/agents-ux` — peer: `buildDesignSystemContext`, `assessCatalogAdoption`
- `@langchain/langgraph` — graph runtime
- `@langchain/core` — base types
- `zod` — schema validation
