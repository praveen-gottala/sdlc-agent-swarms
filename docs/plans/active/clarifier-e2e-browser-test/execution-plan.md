# Clarifier E2E Browser Test & Resume Fix — Execution Plan

## Context

The Clarifier pipeline works for the first invocation (contextRetriever → prdAnalyzer → gapDetector → questionPrioritizer → HITL interrupt → questions displayed). But **the resume after answering questions restarts the graph from scratch** instead of resuming from the storyWriter interrupt point.

**Root cause (confirmed 2026-05-02):** Both the dashboard API route and `runClarifierPipelineStream` use `compiled.stream(invokeInput, config)` to resume. This restarts the graph from `__start__` instead of resuming from the checkpoint. The eval harness already fixed this by using `compiled.updateState(config, state) + compiled.stream(null, config)`.

**Evidence:**
- Eval runner (fixed): `packages/eval/src/runner.ts:90-96` — uses `updateState + stream(null)`
- Dashboard route (broken): `packages/dashboard/src/app/api/clarifier/respond/route.ts:129` — uses `stream(invokeInput)`
- `runClarifierPipelineStream` (broken): `packages/agents-clarifier/src/run.ts:164` — uses `stream(invokeInput)`
- Lessons-learned rule: `docs/lessons-learned-rules.md` §"LangGraph Resume: updateState + stream(null)"

**Impact:** Users on the /new page see the pipeline "working" after submitting answers, but it re-runs all nodes (contextRetriever, prdAnalyzer, gapDetector, questionPrioritizer) from scratch, wasting ~100s of Vertex AI calls per resume. The storyWriter and critic never execute, so the PRD is never updated by the prdUpdater. Questions circle indefinitely.

---

## Goals

1. Fix the `runClarifierPipelineStream` resume to use `updateState + stream(null)`
2. Create Playwright E2E tests that exercise the full /new page workflow
3. Use the eval harness's RecordingProvider to capture cassettes during E2E runs
4. Verify PRD actually updates after answering questions (prdDiffBytes > 0)

---

## Phase 1: Fix `runClarifierPipelineStream` Resume Pattern

### What to change

**File:** `packages/agents-clarifier/src/run.ts`

The `runClarifierPipelineStream` function currently does:
```typescript
// Line 164 — BROKEN: restarts graph from __start__
const stream = await compiled.stream(invokeInput, { ...config, streamMode: 'updates' });
```

Fix to:
```typescript
if (isResume) {
  // Merge human responses into checkpoint, then resume from interrupt point
  await compiled.updateState(config, {
    ...(input.humanResponses?.length ? { humanResponses: input.humanResponses } : {}),
    ...(input.escalationDecision ? { escalationDecision: input.escalationDecision } : {}),
  });
  stream = await compiled.stream(null, { ...config, streamMode: 'updates' });
} else {
  stream = await compiled.stream(invokeInput, { ...config, streamMode: 'updates' });
}
```

This matches the pattern proven in the eval runner (`packages/eval/src/runner.ts:90-96`).

### Files to modify

| File | Change |
|------|--------|
| `packages/agents-clarifier/src/run.ts` | Fix resume in `runClarifierPipelineStream` (lines ~95-164) |
| `packages/agents-clarifier/src/run.ts` | Fix resume in `runClarifierPipeline` (blocking version, lines ~244-257) |

### Verification

1. `nx run agents-clarifier:typecheck` — clean
2. `nx run agents-clarifier:test` — all existing tests pass
3. Manual: navigate to /new, submit pomodoro prompt, answer questions, verify storyWriter/critic run (not contextRetriever again)

---

## Phase 2: Playwright E2E Test for /new Clarifier Flow

### Test file

`e2e/clarifier-new-project.spec.ts`

### Test scenarios

**Test 1: Submit prompt and see questions**
```
1. Navigate to /new
2. Type pomodoro prompt into textbox
3. Click submit button
4. Wait for "Questions ready!" text
5. Verify question tabs appear (at least 3)
6. Verify PRD Document panel shows title, features, personas
7. Screenshot: questions displayed
```

**Test 2: Answer questions and verify pipeline resumes correctly**
```
1. (Continue from Test 1)
2. Click on first question tab — verify options displayed
3. Select recommended option for each question
4. Click "Submit Answers"
5. Wait for either:
   a. New questions (round 2) — verify round counter increments
   b. Pipeline complete — verify PRD has been updated
6. Verify storyWriter and critic nodes ran (check graph visualization or stage progress)
7. Screenshot: post-resume state
```

**Test 3: Verify PRD updates after clarification**
```
1. (Continue from Test 2)
2. Switch to Document view in right panel
3. Verify PRD content changed from initial draft
4. Check that features reflect answers given
5. Screenshot: final PRD
```

**Test 4: Escalation flow (maxRounds reached)**
```
1. Navigate to /new
2. Submit a complex prompt
3. Answer questions for round 1, round 2, round 3
4. Verify escalation controls appear (Accept/Restart/Abandon)
5. Click Accept
6. Verify pipeline completes
7. Screenshot: escalation controls + final state
```

### Test infrastructure

- Use `waitForRendererReady()` pattern for iframe if needed
- Use `page.waitForResponse('/api/clarifier/respond')` to detect API calls
- Set test timeout to 300s (pipeline takes ~3-4min on Vertex AI per round)
- Tests require `ANTHROPIC_API_KEY` or Vertex AI credentials — skip if not set
- Kill stale processes on port 3000 before running

### Files to create

| File | Content |
|------|---------|
| `e2e/clarifier-new-project.spec.ts` | E2E test with 4 scenarios |
| `e2e/pages/new-project.po.ts` | Page object for /new page (optional, depends on complexity) |

---

## Phase 3: Recording Cassettes During E2E Runs

### Approach

The eval harness has a `RecordingProvider` that captures LLM calls to JSONL cassettes. To verify PRD updates in E2E tests without inspecting the DOM (which is fragile), we can:

1. After the E2E test completes, read the trace files from `.agentforge/clarifier/{threadId}/`
2. Use `readExecutionLog` and `readStageIO` to verify:
   - `storyWriter` appeared in the execution log (not just contextRetriever repeating)
   - `prdUpdater` appeared (if multi-round)
   - PRD output from prdAnalyzer differs from prdUpdater output

### Alternative: API-level verification

Instead of reading trace files, the E2E test can intercept the SSE stream from `/api/clarifier/respond` and verify:
- `stage` events include `storyWriter` and `critic` (not just contextRetriever/prdAnalyzer repeating)
- `result` event has `interrupted: false` for completion
- `prd-draft` event content changed between rounds

### Files to create/modify

| File | Content |
|------|---------|
| `e2e/clarifier-new-project.spec.ts` | Add SSE stream interception for verification |

---

## Phase 4: Eval Harness Verification of PRD Updates

### Current state

The eval harness (confirmed 2026-05-02) produces:
```
prd-diff-bytes: 0
prd-hash-equal: true
```

This means the PRD is NOT being updated — the `firstPrdDraft` captured after the initial invocation equals the final PRD. This is because:
1. The cooperative simulator answers all questions in round 1
2. The critic passes (after 1 retry)
3. The pipeline completes via `emitComplete` — prdUpdater never runs
4. Single-round convergence = no PRD mutation

### Fix: Verify with force-multi-round scenario

Run the `force-multi-round` eval scenario (which uses `maxAnswersPerRound: 2`). After Phase 1's fix to `runClarifierPipelineStream`, the prdUpdater should fire and `prd-diff-bytes > 0`.

```bash
agentforge eval clarifier --scenario force-multi-round
```

Expected post-fix metrics:
- `prd-diff-bytes > 0` — PRD expanded after updater ran
- `prd-hash-equal: false` — PRD changed
- `round-count >= 2` — multiple rounds completed

---

## Key Files Reference

| File | Role |
|------|------|
| `packages/agents-clarifier/src/run.ts:65-219` | `runClarifierPipelineStream` — the broken resume (line 164) |
| `packages/agents-clarifier/src/run.ts:226-291` | `runClarifierPipeline` — blocking version, same bug (line 257) |
| `packages/agents-clarifier/src/graph/clarifier-graph.ts:100-109` | `compileClarifierGraph` with `interruptBefore: ['storyWriter', 'escalationGate']` |
| `packages/agents-clarifier/src/graph/state.ts:29-31` | `humanResponses` append reducer `(a, b) => [...a, ...b]` |
| `packages/eval/src/runner.ts:90-96` | Correct resume pattern: `updateState + stream(null)` |
| `packages/dashboard/src/app/api/clarifier/respond/route.ts:129` | Dashboard API route that calls `runClarifierPipelineStream` |
| `packages/dashboard/src/app/(dashboard)/new/page.tsx` | /new page component with QuestionFlow |
| `packages/dashboard/src/lib/hooks/use-clarifier-stream.ts:278-312` | `submitAnswers` hook that POSTs to `/api/clarifier/respond` |
| `docs/lessons-learned-rules.md` §"LangGraph Resume" | Rule documenting the correct resume pattern |

---

## Implementation Order

1. **Phase 1** (fix resume) — must be done first, everything else depends on it
2. **Phase 4** (eval verification) — quick check that the fix works via CLI eval
3. **Phase 2** (E2E tests) — creates the browser-level verification
4. **Phase 3** (recording/trace verification) — adds assertion depth to E2E tests

---

## Verification Checklist

- [x] `nx run agents-clarifier:typecheck` — clean (2026-05-02)
- [x] `nx run agents-clarifier:test` — 182 pass, 1 skipped (2026-05-02)
- [ ] `nx run eval:test` — all 63 tests pass
- [x] `nx run-many -t typecheck` — full monorepo clean, 20 projects (2026-05-02)
- [ ] `agentforge eval clarifier --scenario pomodoro` — completes, storyWriter/critic run
- [ ] `agentforge eval clarifier --scenario force-multi-round` — prd-diff-bytes > 0
- [ ] Browser: /new page → submit prompt → answer questions → storyWriter runs (not contextRetriever repeat)
- [ ] Browser: PRD Document panel shows updated content after answers submitted
- [x] `npx playwright test e2e/clarifier-new-project.spec.ts --headed` — 9/9 pass (2026-05-02)

---

## Session Handoff Notes

### What was discovered this session (2026-05-02)

1. **LangGraph resume bug:** `compiled.stream(input, config)` restarts from `__start__`. Must use `compiled.updateState(config, state)` then `compiled.stream(null, config)`. Documented in lessons-learned-rules.md.

2. **The eval harness is fixed** — `packages/eval/src/runner.ts` uses the correct pattern and produces real metrics (7 questions, $0.75 cost, 209s duration).

3. **The dashboard and `runClarifierPipelineStream` are NOT fixed** — they still use `stream(invokeInput)` which restarts the graph. This is why questions "circle" on the /new page.

4. **baseCatalog must be pre-loaded** — the contextRetriever node crashes with `ENOENT: base-component-catalog.yaml` if `baseCatalog` is not passed in `ClarifierDeps`. The dashboard loads it from `packages/core/src/catalogs/base-component-catalog.yaml`. The eval runner loads it from the same path.

5. **PRD metrics show 0 diff in single-round** — cooperative answers resolve all gaps in round 1, so prdUpdater never fires. Use `force-multi-round` scenario (maxAnswersPerRound=2) to test PRD mutation.

6. **Vertex AI latency** — ~50s per LLM call (prdAnalyzer, gapDetector each ~50s). Total pipeline ~200-280s. Timeout set to 600s.

### What was done (2026-05-02, session 2)

1. **Phase 1 COMPLETE:** Fixed `runClarifierPipelineStream` (line 164) and `runClarifierPipeline` (line 257) in `packages/agents-clarifier/src/run.ts` — both now use `updateState + stream(null)` / `invoke(null)` for resume instead of `stream(invokeInput)`.

2. **Phase 2 COMPLETE:** Created `e2e/clarifier-new-project.spec.ts` with 9 Playwright E2E tests covering: submit prompt → questions displayed, answer questions → resume verify, PRD updates after resume, escalation controls, accept/restart flows. All 9 pass.

3. **Unit tests updated:** `run-stream.test.ts` updated to verify `updateState` is called with humanResponses and `stream` receives `null` on resume. Added `mockUpdateState` to the compiled graph mock. 182 tests pass.

4. **Full monorepo verification:** typecheck clean (20 projects), 423 unit tests pass (39 suites).

5. **Pre-existing E2E failures:** `clarifier-split-panel.spec.ts` has 8 pre-existing strict-mode violations (same responsive panel duplication pattern). Not caused by this change.

### What remains

1. Run `agentforge eval clarifier --scenario force-multi-round` to verify PRD updates with real LLM (Phase 4)
2. Browser manual verification at /new with real LLM
3. Fix pre-existing `clarifier-split-panel.spec.ts` strict-mode failures (separate task)
