# ADR-047: Browser as Default Design Tool

**Status:** Accepted
**Date:** 2026-04-26
**Related:** ADR-046 (unified pipeline), ADR-030 (Penpot support)

## Context

Three authoritative sources mandate browser-first rendering:

- `sdlc-agents.md` §11.1.1 (line 67): browser is primary design surface.
- `sdlc-agents.md` §11.1.2 Phase C (lines 221-227): browser-only pipeline.
- `dashboard.md` §4.10.4 (line 400): "Browser Renderer is the source of
  truth for layout fidelity — not an optional tool."

Figma was removed from the framework during the 2026-04-24 spec sync
(`sdlc-agents.md:249`, `appendices.md:250`, `governance-and-operations.md:137`).

Penpot remains as an optional collaboration adapter for teams that want
a shared design-tool workflow alongside the browser renderer.

## Decision

- `DesignTool = 'browser' | 'penpot'` — no `'figma'`.
- CLI `design:page` defaults to `--tool=browser`. Penpot requires explicit
  `--tool=penpot`.
- Dashboard hardcodes `designTool: 'browser'` — no user-facing tool selector.
- `runDesignPipeline` dispatches Stage 4 based on `designTool`:
  - `'browser'` → `browserDesignWork` (LLM → `submit_design` tool-use → JSON)
  - `'penpot'` → `penpotDesignWork` (LLM → script → execute → self-correct)

## Consequences

- CLI `design:page` without `--tool` produces browser-rendered DesignSpec JSON.
- Penpot-specific features (MCP collaboration session, visual self-correction
  loop) remain functional via the explicit `--tool=penpot` flag.
- `FeedbackAdapter` interface has two implementations: `BrowserFeedbackAdapter`
  (default) and `PenpotFeedbackAdapter` (opt-in). See ADR-048.
- Future design tools (e.g., Framer Phase 3 per `dashboard.md`) extend the
  `DesignTool` enum and add a new work function — zero changes to the
  orchestrator.
