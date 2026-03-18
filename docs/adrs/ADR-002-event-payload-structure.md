# ADR-002: Event Payload Structure — Flat Unions vs Nested Payload

## Status

Accepted

## Context

`architecture.md` specifies a generic `DomainEvent` interface with a nested
`payload: Record<string, unknown>` field:

```typescript
interface DomainEvent {
  type: string;
  source: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  specRef?: string;
  taskId?: string;
}
```

The implementation uses flat discriminated-union interfaces where each event
type declares its own strongly-typed fields directly on the event object:

```typescript
interface PRCreated extends BaseDomainEventFields {
  readonly type: 'PRCreated';
  readonly taskId: string;
  readonly prNumber: number;
  readonly branch: string;
}
```

## Decision

**Keep flat discriminated unions.** Do not introduce a generic `payload` field.

### Rationale

1. **Compile-time type safety.** TypeScript narrows the union on `event.type`,
   giving handlers full autocompletion and type checking on every field. A
   generic `payload: Record<string, unknown>` requires runtime casts or type
   guards, defeating the purpose of the type system.

2. **Fewer runtime errors.** Misspelled or missing payload keys are caught at
   compile time, not in production.

3. **Better DX.** Contributors see exactly which fields an event carries when
   they hover over the type in their editor.

4. **No information loss.** The flat structure contains the same data; only the
   nesting differs.

## Risk

If `architecture.md` is consumed by external tooling (e.g., a Python engine or
dashboard) that expects a `{ type, payload }` envelope, an adapter layer will
be needed at the boundary. The file-event-bridge (`file-event-bridge.ts`)
already serves this role for Python interop and can be extended to wrap/unwrap
the payload envelope as needed.

## Consequences

- All event interfaces extend `BaseDomainEventFields` and carry their fields
  at the top level.
- External consumers that require the nested format must use an adapter.
- `architecture.md` should be updated in the next revision to reflect the
  actual implementation pattern.
