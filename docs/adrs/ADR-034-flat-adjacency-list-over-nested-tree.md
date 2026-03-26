# ADR-034: Flat Adjacency List Over Nested Tree

## Status
Accepted

## Context

DesignSpec v2 needs to represent UI component trees for Anthropic structured
output (`strict: true`). Recursive schemas (where `children: ComponentSpec[]`
references the same type) are rejected by the Anthropic API with a 400 error.

## Decision

Use a flat adjacency list (`Record<string, NodeSpec>` with `parent` string
references) instead of a recursive tree (`children: ComponentSpec[]`).

## Rationale

1. Recursive schemas break Anthropic's strict mode - API returns 400 (documented in GitHub issue #1185, anthropic-sdk-python)
2. Flat structures are trivially diffable — property-level JSON diff
3. Vercel's json-render (13K+ GitHub stars) uses this exact pattern
4. Only 2 schema nesting levels vs 6+ with recursive trees — stays under
   grammar complexity limits

## Consequences

### Positive
- Compatible with Anthropic structured output strict mode
- Property-level diffing is trivial on flat key-value maps
- Schema complexity stays well within API limits

### Negative
- Renderer must reconstruct the tree at render time via `buildTree()`
- Validation must check for cycles and dangling parent references
