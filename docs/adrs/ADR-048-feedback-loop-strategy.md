# ADR-048: Feedback Loop Strategy

**Status:** Accepted
**Date:** 2026-04-26
**Related:** ADR-046 (unified pipeline), ADR-047 (browser default)

## Context

Two feedback problems existed before the unified pipeline:

1. **Dashboard chat re-ran all three LLM stages** per user message via
   `runChatPipelineAsync` (research → planning → design). A "change the
   header color" request took 3 LLM calls and ~45 seconds instead of 1
   call and ~5 seconds.

2. **CLI browser path had no feedback loop.** The only interactive feedback
   loop required Penpot (`DesignCollaborationSession`). With browser as
   the default tool (ADR-047), the CLI default path lacked user iteration.

A spike (Task 1.1s in the execution plan) validated single-shot structured
patching on 3 representative chat requests: color change, component addition,
and layout rearrangement. All 3 produced correct `DesignSpecPatch` output.

## Decision

`FeedbackAdapter` interface in `packages/agents-ux/src/feedback/types.ts`:

```typescript
interface FeedbackAdapter {
  reviewDesign(spec: DesignSpecV2, userMessage?: string): Promise<Result<DesignSpecPatch>>;
  applyPatch(spec: DesignSpecV2, patch: DesignSpecPatch): DesignSpecV2;
  showPreview(spec: DesignSpecV2): Promise<void>;
}
```

Two implementations:

- **`BrowserFeedbackAdapter`** — single LLM call producing a
  `DesignSpecPatch` (JSON patches to the DesignSpec). Used by both CLI
  (`design:page --tool=browser`) and dashboard (chat route, correct route).

- **`PenpotFeedbackAdapter`** — wraps existing `DesignCollaborationSession`.
  Used by CLI `--tool=penpot` only. Preserves the interactive Penpot
  collaboration workflow.

## Consequences

- Dashboard chat uses 1 LLM call instead of 3 (research + planning removed).
- Dashboard correct route wired to `BrowserFeedbackAdapter` (was stubbed).
- CLI browser path has a functional feedback loop.
- Both adapters share the same interface, enabling future adapters without
  pipeline changes.
- `runChatPipelineAsync` deleted.
