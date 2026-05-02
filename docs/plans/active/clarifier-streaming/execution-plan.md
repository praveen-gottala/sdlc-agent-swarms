# Plan: Clarifier Streaming — Wire LLM Token Streaming to UI

## Context

The clarifier pipeline has a two-layer streaming architecture, but only the outer layer works. The SSE transport from Next.js to the browser is functional — events arrive in real-time. However, the inner layer (LLM token streaming within each pipeline node) is completely disconnected. All LLM calls use `provider.complete()` which internally streams tokens but throws them away via `stream.finalMessage()`. The result: 30-60 second silent gaps during LLM-heavy nodes (prdAnalyzer, gapDetector, storyWriter) where the user sees no feedback.

**Why this matters:** The onboarding UX feels stuck during LLM processing. Users cannot tell if the system is working or frozen. This was identified during a live browser walkthrough on 2026-05-01 where the "Starting analysis..." spinner sat unchanged for 45+ seconds.

**Why streaming is disconnected:** The clarifier pipeline was built on LangGraph's `streamMode: 'updates'`, which emits one event per node completion. This was the correct initial choice — it gives clean stage transitions. But no work was done to add a second channel for intra-node progress. The `provider.stream()` method exists and works but was never integrated into any clarifier node. The structured output requirement (Zod schemas on all LLM calls) means full token streaming isn't directly useful (partial JSON can't be validated), but progress signals and sub-step events are still valuable.

## Research Findings (2026-05-01)

### Architecture Trace

```
Browser ← SSE ← Next.js Route ← async generator ← LangGraph stream ← Node functions ← provider.complete()
                                                                                          ↓
                                                                               stream.finalMessage() ← tokens discarded
```

### Root Causes

1. **LangGraph `streamMode: 'updates'`** — emits ONE event per node completion. No `node-start` events.
2. **`provider.complete()` discards tokens** — `claude-provider.ts:391-392` uses `client.messages.stream()` then `stream.finalMessage()`, throwing away all intermediate token events.
3. **No intra-node event channel** — nodes have no mechanism to emit progress events during execution.
4. **Structured output blocks partial use** — all 3 LLM-calling nodes use `responseSchema`, requiring full JSON before validation. Token-by-token display isn't useful, but progress signals are.

### Node Timing Profile

| Node | LLM Calls | Typical Duration | Bottleneck |
|------|-----------|-----------------|------------|
| `contextRetriever` | 0 (file I/O) | <1s | None |
| `prdAnalyzer` | 1x Opus, 8K tokens | 30-60s | Primary |
| `gapDetector` | 2x Sonnet, 4K tokens each | 15-30s | Secondary |
| `questionPrioritizer` | 0 (computation) | <1s | None |
| `storyWriter` | 1x Sonnet, 8K tokens | 15-30s | Secondary |
| `critic` | 0 (deterministic) | <1s | None |

### Existing Infrastructure

- **`provider.stream()`** — Fully implemented in `claude-provider.ts:433-539`. Yields `StreamChunk` with `token`, `tool_call`, `progress`, `done` discriminants.
- **`StreamChunk` type** — `packages/providers/src/types.ts:124-128`. Already has a `progress` variant with `message: string`.
- **`TracedProvider.stream()`** — Pass-through, no OTel instrumentation (known limitation).
- **SSE `send()` function** — `route.ts:97-99` can emit arbitrary event types. No changes needed to add new event types.

### Key Files

| Layer | File | Line | Role |
|-------|------|------|------|
| API Route | `packages/dashboard/src/app/api/clarifier/route.ts` | 97-99, 104-111 | SSE event emission, stream iteration |
| Pipeline | `packages/agents-clarifier/src/run.ts` | 64-137 | `runClarifierPipelineStream()` async generator |
| Graph | `packages/agents-clarifier/src/graph/clarifier-graph.ts` | 83-91 | Node wiring, `streamMode: 'updates'` |
| PRD Analyzer | `packages/agents-clarifier/src/nodes/prd-analyzer.ts` | 243-255 | `provider.complete()` with Opus |
| Gap Detector | `packages/agents-clarifier/src/nodes/gap-detector.ts` | 517, 557 | 2x `provider.complete()` with Sonnet |
| Story Writer | `packages/agents-clarifier/src/nodes/story-writer.ts` | 271-282 | `provider.complete()` with Sonnet |
| Provider | `packages/providers/src/claude/claude-provider.ts` | 391-392, 433-539 | `complete()` discards tokens; `stream()` fully implemented |
| Types | `packages/providers/src/types.ts` | 124-128, 151-154 | `StreamChunk`, `complete()`, `stream()` |
| Frontend Hook | `packages/dashboard/src/lib/hooks/use-clarifier-stream.ts` | 77-107, 174-236 | SSE parsing (works correctly) |
| Frontend Types | `packages/dashboard/src/lib/clarifier-chat-types.ts` | 58-65, 67-73 | `ToolResultMessage`, `AgentThinkingMessage` |

---

## Phases

### Phase 1: Node-Start Events (Low Effort)

**Goal:** Emit `stage-start` SSE events when each node begins, not just when it completes. Currently the frontend infers active state from `NEXT_NODE` map after a completion — this makes it confirmed.

**Changes:**
- `run.ts`: Before iterating LangGraph updates, emit a `node-start` event for `contextRetriever`. After each `node-complete`, emit `node-start` for the next node in the graph.
- `route.ts`: Handle new `node-start` event type, emit as `stage-start` SSE event.
- `use-clarifier-stream.ts`: Handle `stage-start` SSE event — update `activeNode` and append a `tool-result` message with `status: 'running'`.
- `chat-message.tsx`: Show running indicator (spinner) on stage cards with `status: 'running'`.

**Verification:** Run pipeline, confirm each stage card appears as "Running" before "Completed".

- [ ] Task 1.1: Add `node-start` yields to `runClarifierPipelineStream()`
- [ ] Task 1.2: Handle `stage-start` in API route SSE emission
- [ ] Task 1.3: Handle `stage-start` in frontend hook
- [ ] Task 1.4: Update stage card to show running state with spinner

### Phase 2: Intra-Node Progress for Gap Detector (Medium Effort)

**Goal:** The gap detector makes 2 sequential LLM calls + deterministic checks. Emit progress events between these sub-steps so the user sees movement during the 15-30s execution.

**Changes:**
- Add an `onProgress` callback parameter to the gap detector node function.
- Emit progress events: "Running deterministic checks...", "Generating implementation approaches...", "Analyzing divergence points..."
- Thread the callback through the graph state or via a shared context object.
- `run.ts`: Yield progress events from the callback as `node-progress` events.
- Frontend: Update the stage card label in real-time as progress events arrive.

**Verification:** Run pipeline, confirm gap detector stage card updates through 3 sub-steps.

- [ ] Task 2.1: Design `onProgress` callback interface for node functions
- [ ] Task 2.2: Add progress emissions to gap detector's 3 phases
- [ ] Task 2.3: Wire callback through `runClarifierPipelineStream()`
- [ ] Task 2.4: Handle `node-progress` in API route and frontend

### Phase 3: Token Count Progress Bars (Medium Effort)

**Goal:** Show how much of the LLM response has been received during long-running calls. Use `provider.stream()` instead of `provider.complete()`, count incoming tokens, and yield progress events.

**Changes:**
- Add a `streamWithProgress()` helper that wraps `provider.stream()`, collects the full response, counts tokens as they arrive, and calls an `onProgress` callback periodically (every ~500 tokens or every 2s).
- Replace `provider.complete()` with `streamWithProgress()` in prdAnalyzer, gapDetector, storyWriter.
- Structured output validation happens after stream completes (same as today, just explicitly).
- Frontend: Show a token progress indicator (e.g., "Received 2,400 tokens..." or a subtle progress bar) on the running stage card.

**Considerations:**
- `TracedProvider.stream()` has no OTel instrumentation — cost tracking per call will be lost during streaming. Accept this tradeoff or add basic cost tracking to the helper.
- Structured output with `responseSchema` may need adjustment — the stream helper must reconstruct the full response and parse it through the schema after completion.

- [ ] Task 3.1: Create `streamWithProgress()` helper in agents-clarifier
- [ ] Task 3.2: Replace `provider.complete()` in prdAnalyzer
- [ ] Task 3.3: Replace `provider.complete()` in gapDetector (both calls)
- [ ] Task 3.4: Replace `provider.complete()` in storyWriter
- [ ] Task 3.5: Frontend token progress indicator component
- [ ] Task 3.6: Verify structured output validation still works

### Phase 4: Partial Result Streaming (High Effort, Future)

**Goal:** Stream individual array items (features, gaps, questions) as they become parseable in the JSON response. Show features appearing one by one in the PRD panel.

**Not planned for implementation yet.** Requires:
- Streaming JSON parser (e.g., `@streamparser/json`)
- Changes to the PRD panel to accept incremental updates
- Changes to the hook to handle partial PRD state
- Careful handling of validation — individual items may not validate until the full response is available

This phase is documented for future reference when Phases 1-3 are complete and the UX benefit is proven.

---

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Research | COMPLETE | Root causes identified, architecture traced (2026-05-01) |
| Phase 1 | NOT STARTED | Node-start events |
| Phase 2 | NOT STARTED | Intra-node progress |
| Phase 3 | NOT STARTED | Token count progress |
| Phase 4 | FUTURE | Partial result streaming |

## Quick Wins Already Shipped (2026-05-01)

These UX improvements were made during the research session as immediate fixes:

- Dynamic thinking label updates per stage completion (no longer static "Starting analysis...")
- Stage description text in expanded step details
- PRD guidance card when draft is available
- Pipeline error surfacing (no longer silently swallowed)
- Gradient glow around chat input during active chat
- Scroll fix for question cards (left panel missing `flex flex-col`)
