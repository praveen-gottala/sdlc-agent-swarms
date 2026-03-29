---
paths: ["packages/core/src/events/**"]
---

# Domain Events Rules

## Event Registry Completeness
- Every domain event referenced in the PRD (TaskStatusChanged, PhaseStarted,
  BudgetAlert, etc.) must be formally defined in the event model/registry with
  typed payloads. An event that is emitted but not in the registry, or in the
  registry but never emitted, is a gap.

## New Domain Event Checklist
When adding a new event to the system, update ALL of these:

1. `packages/core/src/events/domain-events.ts` — define interface + add to `DomainEvent` union type
2. `packages/core/src/index.ts` — export the new event type
3. `packages/core/src/events/event-bus.test.ts` — type safety test for new variant
4. Governance subscribers (if event needs audit/HITL/budget handling):
   - `packages/governance/src/audit-logger.ts`
   - `packages/governance/src/hitl-enforcer.ts`
   - `packages/governance/src/budget-tracker.ts`
5. `packages/dashboard/src/lib/event-client.ts` — if event should appear in dashboard UI
6. Agent files that emit or react to the event
