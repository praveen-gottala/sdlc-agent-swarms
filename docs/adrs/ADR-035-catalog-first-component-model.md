# ADR-035: Catalog-First Component Model

## Status
Accepted

## Context

Anthropic structured output limits optional parameters to 24 per schema. Direct
code generation had 30+ optional fields per component, exceeding this limit and
preventing use of strict mode.

## Decision

Pre-encode visual quality into a component catalog. The LLM references catalog
entries by string ID and only specifies overrides, rather than generating every
visual property from scratch.

## Rationale

1. Reduces optional fields per node from ~30 to ~18 (under the 24 limit)
2. Pre-encoding quality means the LLM does not need to know shadow values,
   border widths, or color opacity
3. Every successful production SDUI system (Vercel json-render, Google A2UI,
   Airbnb) uses catalogs
4. The existing `component-catalog.yaml` provides the foundation

## Consequences

### Positive
- Stays within Anthropic's 24 optional field limit
- Visual quality is consistent and catalog-controlled, not LLM-hallucinated
- Aligns with industry-proven SDUI patterns

### Negative
- New catalog entries must be added for each differentiator component type
- The `loadCatalogForRenderer()` transformer bridges the existing catalog
  format to the flat renderer format, adding a translation layer
