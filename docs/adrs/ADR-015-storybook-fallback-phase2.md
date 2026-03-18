# ADR-015: Storybook Fallback Adapter Deferred to Phase 2

## Date
2026-03-18

## Status
Accepted

## PRD Reference
PRD v2.0 Section 20.2 (Failure Mode F7): "Figma MCP server unavailable → Retry 3x. Fall back to code-first design (Storybook). Notify human of degraded state."

PRD v2.0 Section 11.1.3: "While Figma is the primary adapter, AgentForge defines a DesignSurface interface that any design tool can implement: createWorkspace(), readDesign(), writeDesign(), getTokens(), onUserEdit(), lockForAgent(). This enables Framer, Storybook, or code-first workflows in future phases."

## What the Implementation Does
Phase 1 implements only the `FigmaAdapter` as a `DesignSurface` implementation. When Figma MCP is unavailable:
1. MCP retry middleware retries (configurable, default 5 retries with exponential backoff)
2. Returns `MCP_UNAVAILABLE` error to the caller
3. The caller (design orchestrator) pauses and notifies human via HITL enforcer

No `StorybookAdapter` exists. No automatic fallback to code-first design mode.

## Reasoning
The `DesignSurface` interface is designed for multiple adapters, so adding `StorybookAdapter` is a non-breaking addition. Phase 1 focuses on the primary Figma workflow. The human notification (step 3) preserves the safety property — operators know the design phase is degraded.

## Downstream Impact
- P29 Design-to-Spec (Wave 6) runs the full design loop. If Figma is unavailable during Wave 6, the design phase will halt instead of falling back. P29 should document this as an expected behavior and test the halt + notification path.
- P19 Failure Modes (Wave 5) should validate F7 recovery with "halt + notify" as the Phase 1 behavior.

## Decision
Defer `StorybookAdapter` to Phase 2. Phase 1 behavior is: retry → halt → notify human. The `DesignSurface` interface is stable and ready for additional adapters.

## PRD Update Required
Section 20.2 (F7) should note that Phase 1 implements retry + halt + notify; Storybook fallback is Phase 2. Section 11.1.3 should specify what "code-first design mode" means in practice (Storybook component rendering vs. HTML-only wireframes).
