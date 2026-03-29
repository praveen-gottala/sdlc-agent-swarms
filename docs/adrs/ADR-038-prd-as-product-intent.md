# ADR-038: PRD as Product Intent, TypeScript as Implementation Contract

## Status

Accepted

## Date

2026-03-29

## Context

PRD-v2.md is 1,374 lines and has drifted from the codebase. An audit found
12 divergences (6 critical, 6 moderate):

**Critical divergences (PRD claims things that don't exist in code):**
1. SDLCPhase enum — no formal enum exists in TypeScript; phases are string literals
2. `active_agent_count` on `getStatus()` — only exists in Python engine stub, not TypeScript
3. 10 REST API endpoints marked "10/10 Ready" — only exist in unused Python FastAPI engine (per ADR-022)
4. `@agentforge/agents-observe` package — not yet created
5. Observability agents (Metrics monitor, Drift detector, etc.) — no implementations
6. Research Phase 3 agents — no implementations

**Moderate divergences (code evolved beyond PRD):**
1. 42 domain events vs PRD's 34 (8 UX Dashboard Squad events not in PRD)
2. 20+ CLI commands vs PRD's ~8
3. TaskEntry has 16 fields vs PRD's 14
4. DesignSurface interface replaced by MCP adapter pattern
5. Architecture doc says 31 events, PRD says 34, code has 42
6. Packages list incomplete (missing agents-ux, designspec-renderer)

The root cause: the PRD tries to be both a product vision document AND a
field-level implementation spec. These two jobs require different update
cadences. Nobody updates a markdown table during a coding session.

## Decision

Split the PRD's responsibilities:

- **PRD owns:** WHAT features exist, WHY they exist, conceptual architecture,
  personas, governance model, roadmap
- **TypeScript interfaces own:** exact field lists, enum values, API signatures,
  event payloads

Specifically:
- `packages/core/src/types/` — authoritative for all data types (TaskEntry,
  AgentContract, ProjectManifest, CostRecord, etc.)
- `packages/core/src/events/domain-events.ts` — authoritative for event catalog
  (DomainEvent union type)
- `packages/core/src/types/hitl.ts` — authoritative for HITL types
- `packages/core/src/types/agent-contract.ts` — authoritative for agent contract shape

When PRD and code diverge on implementation details, **code wins** and the
PRD is updated to match (not the other way around).

New capabilities must still trace to a PRD feature (PRD owns the "what" and "why").
New fields follow the TypeScript interface — the PRD is updated afterward.

## Consequences

**Positive:**
- Eliminates drift — single maintenance point for contracts
- TypeScript compiler catches field mismatches at build time
- Reduces PRD update burden during coding sessions

**Negative:**
- PRD alone no longer gives complete field-level picture
- New contributors must know to check TypeScript files for details

**Risk mitigation:**
- PRD sections that previously had field lists now include pointer comments
  directing readers to the authoritative TypeScript files
- CLAUDE.md rules updated to reference TypeScript interfaces instead of PRD
  field lists
