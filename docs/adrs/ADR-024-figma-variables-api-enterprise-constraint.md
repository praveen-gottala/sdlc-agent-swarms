# ADR-024: Figma Variables API Enterprise Constraint

## Date
2026-03-19

## Status
Accepted

## PRD Reference
Section 11.1.2 — Design System Integration:
> "Agents read design tokens (colors, typography, spacing) from the Figma file
> and bind them to component specs."

Section 20.2 (F7) — Figma MCP Tools:
> UX agents declare `figma:get_variable_defs` for reading design token definitions.

## Context
The Figma MCP spike test (packages/agents-ux/__tests__/figma-mcp-spike.test.ts)
revealed that the Figma Variables REST API (`/v1/files/:id/variables/local`) returns
**HTTP 403 Forbidden** on Professional-tier Figma accounts. This endpoint is restricted
to **Enterprise** plans only.

Both `get_variables` (FigmaAdapter's name) and `get_variable_defs` (UX agent contract
name) map to this same endpoint.

### Naming Gap (secondary issue)
UX squad agents (planning, review, research) declare `figma:get_variable_defs` in their
tool contracts, but `FigmaAdapter.getTokens()` calls `figma:get_variables`. These are
intended to reference the same capability but use different names. This ADR standardizes
on `get_variables` as the canonical MCP tool name to match the Figma API naming, while
keeping `get_variable_defs` in agent contracts as a declared (but unused at runtime)
future enhancement.

## Decision

### 1. Fallback token extraction via get_code
Since the Variables API is unavailable on non-Enterprise plans, agents that need design
tokens will extract them from `get_code` / `get_metadata` responses instead. The Figma
node tree returned by these endpoints includes inline style data (fills, strokes,
effects, text styles) that contain the actual token values even when the Variables API
is inaccessible.

### 2. FigmaAdapter.getTokens() fallback
`FigmaAdapter.getTokens()` will attempt `get_variables` first. If it fails (403 or any
error), it falls back to `get_code` + `get_metadata` and extracts tokens from the node
style properties.

### 3. Review Agent: checkDesignSystemCompliance fallback
`checkDesignSystemCompliance()` will attempt `figma:get_variable_defs` first. On failure,
it falls back to `figma:get_code` to extract inline style data for compliance checking.

### 4. Keep get_variable_defs in agent contracts
`figma:get_variable_defs` remains in the `tools` array of all UX agent contracts as a
declared capability. This ensures:
- Enterprise users get the richer Variables API response when available
- The tool permission is pre-authorized in governance
- No contract changes are needed when upgrading to Enterprise

### 5. Tool name standardization
- MCP tool name (transport layer): `get_variables`
- Agent contract declaration: `figma:get_variable_defs` (kept for PRD alignment)
- Both names are accepted by the transport; `get_variable_defs` is an alias for
  `get_variables`

## Consequences
- Non-Enterprise Figma users get degraded but functional token extraction
- Token data from get_code is less structured than Variables API output (raw style
  values vs named variable definitions)
- Planning agent prompts reference inline styles instead of named tokens
- When a project upgrades to Figma Enterprise, the primary path activates automatically
  with no code changes

## Alternatives Considered
1. **Require Enterprise plan** — Rejected: too restrictive for open-source project
2. **Remove get_variable_defs entirely** — Rejected: loses the richer path for Enterprise
3. **Mock the Variables API** — Rejected: hides a real platform constraint from agents
