# ADR-049: Stage 7 Dashboard Deferral

**Status:** Accepted
**Date:** 2026-04-26
**Related:** ADR-046 (unified pipeline)

## Context

Stage 7 (Implementation Agent, `uxImplementationWork`) generates React/Tailwind
source code from DesignSpec JSON. The CLI has this capability — `design:page
--implement` runs the implementation agent after the design stage.

The dashboard does not expose Stage 7. Adding it was classified as Category A
(intentional design choice requiring shared-layer extraction) in the divergence
analysis (`docs/issues/cli-dashboard-pipeline-divergence.md`). The unify
pipeline execution plan (Phases 0-4) focused on Stages 0-6 where both CLI and
dashboard had parallel implementations. Stage 7 was CLI-only in both the old
and new architecture.

## Decision

Stage 7 remains CLI-only. The dashboard pipeline runs stages Research through
Evaluator (4 stages). `runDesignPipeline` supports a `stage` parameter that
can limit execution to a specific stage, but Stage 7 is simply not wired in
the dashboard caller.

Dashboard users reach:
- DesignSpec JSON (viewable in design inspector)
- Interactive prototype (browser renderer)
- Chat-driven iteration (via `BrowserFeedbackAdapter`)
- Visual correction (via `correct/route.ts`)

But not generated source code.

## Consequences

- No dashboard UI for code generation output.
- Stage 7 can be added to the dashboard after: (a) the unified pipeline
  proves stable across multiple release cycles, (b) a dashboard UI for
  browsing, diffing, and accepting generated code is designed.
- No timeline committed. The CLI `--implement` flag remains the code
  generation entry point.
- Screen Types Plan B Phase B3 (Layout-Aware Code Generation) extends
  Stage 7 with `Layout.tsx` generation — this is a CLI-side enhancement
  that does not affect this deferral.
