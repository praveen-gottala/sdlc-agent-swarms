# ADR-042: Chat-Driven Design Iteration Pipeline

## Status
Accepted

## Context
The Design Studio has a Chat tab in the inspector panel where users type free-text design change requests. The PRD defines the design phase with `full_approval` HITL policy (Stage 6 Interactive Feedback Loop in the pipeline dataflow), but does not specify a dashboard-native chat iteration endpoint. The CLI feedback loop (`design-feedback-loop.ts`) exists but is TTY-only.

Users need a way to iterate on existing designs through the dashboard without regenerating from scratch.

## Decision

### New endpoint: `POST /api/pages/[pageId]/design/chat`
Created a new endpoint rather than extending `design/correct` because chat conveys structural intent (free-text), while correction handles per-node vision feedback tags — different semantics and different pipeline inputs.

### Async fire-and-forget pattern
Matches the existing `handleFullPipeline` pattern: `startRun()` -> background task -> client polls `GET /api/runs/{runId}`. Reuses `PipelineProgress` component with no changes.

### HITL approval skip
The PRD specifies `full_approval` for the design phase. For chat iteration, the user explicitly requested the change via the chat input — this constitutes implicit approval. The approval gate is skipped for chat-initiated iterations. Full approval remains enforced for initial generation and CLI-driven flows.

### Separate `chatIteration` field
Added `chatIteration?: number` to `PageEntry` instead of reusing `correctionIteration`. Rationale: `handleFullPipeline` resets `correctionIteration` to 0 on regeneration. Chat iterations are a separate counter tracking how many chat-driven modifications have been applied.

### Pipeline function extraction
Extracted `callPipelineStage`, `callClaudeDesignAPI`, `buildDesignSpecSystemPrompt`, and `transitionTaskStatus` from `design/route.ts` into `_lib/pipeline-helpers.ts` so both the full pipeline and chat pipeline can share them without duplication.

## Consequences
- New `'design-chat-iterate'` value added to `RunStatus.type`, `PipelineRunProgress.pipeline`, and `DesignLogSource`
- Chat pipeline produces artifacts in `agentforge/designs/{pageId}/chat-{iteration}/`
- Chat history is component-state only (lost on unmount) — no server persistence yet
- LLM may regenerate rather than iterate if the system prompt is insufficiently constraining — prompt refinement is expected post-launch
