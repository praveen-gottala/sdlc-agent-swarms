# ADR-037: Standalone Renderer Package

## Status
Accepted

## Context

The renderer needs design token types and catalog types, but should not depend
on the full `@agentforge/core` package or `@agentforge/agents-ux`. A dependency
on either would create a transitive dependency chain and risk circular
dependencies.

## Decision

Create `packages/designspec-renderer/` as a standalone package with zero
cross-package dependencies. Mirror needed types locally within the renderer
package.

## Rationale

1. Zero deps means the renderer can be built and tested independently
2. Avoids circular dependency risks (agents-ux -> renderer -> core -> ?)
3. Enables future extraction as a standalone npm package
4. Build time is faster without transitive dependency chain

## Consequences

### Positive
- Fully independent build and test cycle
- No risk of circular dependency issues
- Can be published as a standalone npm package in the future

### Negative
- Token types and catalog types are duplicated (mirrored) in the renderer
  package
- Changes to core types must be manually synced — acceptable because the
  interfaces are stable and the renderer only uses a subset
