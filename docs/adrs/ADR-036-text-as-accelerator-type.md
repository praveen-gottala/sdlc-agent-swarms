# ADR-036: Text as Accelerator Type

## Status
Accepted

## Context

The original `AcceleratorType` enum had 6 values (`page`, `container`,
`section`, `header`, `divider`, `spacer`). Real-world DesignSpec fixtures
use text nodes extensively with `typography`, `color`, and `weight`
properties directly on the node. Without a text accelerator, every label would
need a dedicated catalog entry, bloating the catalog.

## Decision

Add `'text'` as a 7th `AcceleratorType`. Add `typography`, `color`, `weight`,
and `background` as optional fields directly on `NodeSpec`.

## Rationale

1. Text is a structural primitive like divider/spacer — it has no
   catalog-specific visual identity
2. Text nodes are used in both fixtures for labels, headings, and content
3. Adding 4 fields brings NodeSpec to 18 optional fields (still under the
   24 limit)
4. Without text as an accelerator, every label would need a catalog entry,
   bloating the catalog unnecessarily

## Consequences

### Positive
- Text labels, headings, and content can be expressed without catalog entries
- Fixtures and LLM output are more readable and concise

### Negative
- 4 new optional fields on NodeSpec — at 18/24, only 6 more slots available
- Must monitor optional field count carefully on future additions
