# ADR-003: Event Bus Method Naming — emit() vs publish()

## Status

Accepted

## Context

`architecture.md` defines the event bus interface with an `emit()` method:

```typescript
interface EventBus {
  emit(event: DomainEvent): void;
  subscribe(eventType: string, handler: EventHandler): Unsubscribe;
  history(filter?: EventFilter): DomainEvent[];
}
```

The initial implementation used `publish()` instead of `emit()`. Both names are
common in event-driven systems:

- `emit` — Node.js EventEmitter convention, used in architecture.md
- `publish` — Pub/sub convention, arguably more descriptive of the fan-out
  semantics

## Decision

**Support both.** `emit()` is added as an alias for `publish()`. Both methods
call the same underlying function and are fully interchangeable.

### Rationale

1. **Spec compliance.** Code that follows `architecture.md` can use `emit()`
   without deviation.

2. **No migration burden.** Existing code using `publish()` continues to work
   unchanged.

3. **Zero cost.** Both names point to the same function reference — no wrapper,
   no indirection.

## Consequences

- The `EventBus` interface exposes both `publish()` and `emit()`.
- New code may use either name; no convention is enforced beyond consistency
  within a single file.
- `architecture.md` remains accurate without requiring a wording change.
