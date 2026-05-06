# Clarifier Step-by-Step Verification Plan

## Context

We added per-node debug logs (ENTER/EXIT with timing, LLM START/END markers, routing decisions) and fixed the critic retry interrupt bug. Before declaring the Clarifier phase complete, we need a systematic test that runs the full pipeline — initial run + resume after answers — and verifies every node executes correctly with no skipped steps, no repeated questions, and the PRD actually updates.

## What we're verifying

| Check | How | Pass criteria |
|-------|-----|---------------|
| Every node runs on initial flow | Debug logs show ENTER/EXIT for all 4 nodes | contextRetriever, prdAnalyzer, gapDetector, questionPrioritizer all have ENTER+EXIT |
| Every LLM call fires | Debug logs show LLM START/END | prdAnalyzer (1 call), gapDetector (2 calls) |
| Interrupt fires at correct point | Debug log shows `__interrupt__` | Graph pauses before storyWriter |
| Questions are generated | Pipeline returns questions | questions.length > 0 |
| Resume runs storyWriter | Debug log shows story-writer ENTER + LLM START/END | storyWriter actually makes LLM call (duration > 0) |
| Critic passes (no retry loop) | Debug log shows critic EXIT passed=true | No `route: critic→storyWriter` retry |
| PRD updates after answers | Debug log shows prd-updater ENTER + LLM START/END | prdUpdater runs and produces updated features |
| New questions differ from round 1 | Gap detector finds new/different gaps | Round 2 questions ≠ round 1 questions |
| Timing is reasonable | Pipeline summary log | Total < 5 min for simple input |
| No stale thinking indicator | Dashboard UI | Thinking spinner gone after questions/completion |
| Answer bubbles collapsed | Dashboard UI | Single summary bubble, not per-answer |

---

## Phase 1: Setup

```bash
# 1. Rebuild all packages (dashboard uses pre-built dist/)
nx run-many -t build

# 2. Kill any stale server on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# 3. Start dashboard with DEBUG logging enabled
cd packages/dashboard && DEBUG=1 npx next dev --port 3000
```

---

## Phase 2: Run initial pipeline

### Step-by-step actions

1. Open browser → `http://localhost:3000/new`
2. In the text input (placeholder says "Build a recipe sharing app..."), type:
   **"A simple habit tracker with streaks and reminders"**
3. Click the **blue arrow submit button** (bottom-right of the input area)
4. **Wait ~2 minutes** — watch the left chat panel for step cards appearing one by one:
   - "Loading project context..." → Completed (instant)
   - "Analyzing requirements with Claude Opus..." → Completed (expect ~50-60s)
   - "Detecting gaps and ambiguities..." → Completed (expect ~50-60s)
   - "Prioritizing clarification questions..." → Completed (instant)
   - "Questions ready!" → Completed
5. **Questions appear** — you'll see tabs at the top (e.g., Scope, Users, Platform, etc.)
6. **Record debug logs** from the server terminal:
   ```bash
   # In a separate terminal window:
   grep '\[DEBUG\]' <server-output-file> | grep -v 'webpack\|node_modules'
   ```

### Expected debug log sequence (initial run)

```
context-retriever: ENTER mode=bootstrap round=0
context-retriever: EXIT bootstrap Xms
prd-analyzer: ENTER round=0
prd-analyzer: LLM call START (claude-opus-4-6)
prd-analyzer: LLM call END XXXXXms ok=true
prd-analyzer: EXIT features=N screens=N XXXXXms
route: prdAnalyzer→gapDetector
gap-detector: ENTER round=0 existingGaps=0 humanResponses=0
gap-detector: LLM call 1/2 START (implementations, claude-sonnet-4-6)
gap-detector: LLM call 1/2 END XXXXXms ok=true
gap-detector: LLM call 2/2 START (divergence, claude-sonnet-4-6)
gap-detector: LLM call 2/2 END XXXXXms ok=true
gap-detector: EXIT deterministic=N llm=N total=N XXXXXms
question-prioritizer: ENTER gaps=N round=1
question-prioritizer: EXIT questions=N assumptions=N Xms
clarifier: pipeline completed in XXX.Xs | contextRetriever=X.Xs prdAnalyzer=XX.Xs gapDetector=XX.Xs questionPrioritizer=X.Xs
```

### Checklist — initial run

- [ ] contextRetriever has ENTER + EXIT
- [ ] prdAnalyzer has ENTER + LLM START + LLM END + EXIT
- [ ] gapDetector has ENTER + LLM 1/2 START/END + LLM 2/2 START/END + EXIT
- [ ] questionPrioritizer has ENTER + EXIT
- [ ] Route log shows `prdAnalyzer→gapDetector`
- [ ] Pipeline summary shows timing for all 4 nodes
- [ ] Questions appear in the UI (not empty)
- [ ] No stale "thinking..." spinner visible after questions show

---

## Phase 3: Answer questions and run resume pipeline

### Step-by-step actions

1. **Answer each question tab** — click through each tab and select the **Recommended** option (green badge):
   - Click **Scope** tab → click the option marked "Recommended"
   - Click **Users** tab → click the option marked "Recommended"
   - Click **Platform** tab → click the option marked "Recommended"
   - Continue for **ALL remaining tabs** (the tab bar may scroll horizontally — look for more tabs)
2. **Verify** the counter at the bottom shows **"N of N answered"** (all questions answered)
3. Click **"Submit Answers"** button (appears at the bottom once all are answered)
4. **Wait ~2-3 minutes** — watch for new step cards appearing:
   - "Writing user stories..." → Completed (expect ~30-60s)
   - "Reviewing story quality..." → Completed (instant)
   - "Updating PRD with your answers..." → Completed (expect ~60-120s)
   - Then either:
     - **"Questions ready!"** (round 2 with NEW questions) — verify they're different from round 1
     - **"Requirements complete!"** — pipeline finished successfully
5. **Record debug logs** from the server terminal — grab the NEW lines since the previous capture

### Expected debug log sequence (resume)

```
story-writer: ENTER round=1 maxRounds=3 humanResponses=N features=N
story-writer: LLM call START (claude-sonnet-4-6)
story-writer: LLM call END XXXXXms ok=true
story-writer: EXIT confidence=X.XX features=N XXXXXms
critic: ENTER round=1 criticRetries=0 hasFeaturePlan=true
critic: EXIT passed=true Xms                          ← MUST say "passed=true", NOT "failed retry"
route: critic→prdUpdater (unresolvedGaps=... humanResponses=N)  ← MUST NOT say "critic→storyWriter"
prd-updater: ENTER round=1 humanResponses=N features=N
prd-updater: LLM call START (claude-sonnet-4-6)
prd-updater: LLM call END XXXXXms ok=true
prd-updater: EXIT features=N XXXXXms
route: prdUpdater→gapDetector OR route: prdUpdater→emitComplete
[if gapDetector runs — round 2:]
  gap-detector: ENTER round=1 existingGaps=N humanResponses=N  ← round should be >0
  gap-detector: LLM call 1/2 START ...
  gap-detector: LLM call 1/2 END ...
  gap-detector: LLM call 2/2 START ...
  gap-detector: LLM call 2/2 END ...
  gap-detector: EXIT ... total=N
  question-prioritizer: ENTER ...
  question-prioritizer: EXIT questions=N ...
[if emitComplete — done:]
  emitComplete: ENTER round=N confidence=X.XX
clarifier: pipeline completed in XXX.Xs | storyWriter=XX.Xs critic=X.Xs prdUpdater=XX.Xs ...
```

### Checklist — resume flow

- [ ] storyWriter has ENTER + **LLM START + LLM END** (duration > 0, NOT 0ms)
- [ ] critic says `EXIT passed=true` (NOT `failed retry`)
- [ ] Route says `critic→prdUpdater` (NOT `critic→storyWriter`)
- [ ] prdUpdater has ENTER + LLM START + LLM END + EXIT
- [ ] If round 2: new questions are **DIFFERENT** from round 1
- [ ] Answer bubbles show as **one summary** ("Answered N questions"), not individual per-answer bubbles
- [ ] No stale thinking indicator after questions/completion appears
- [ ] Pipeline summary shows storyWriter duration > 0 (not 0.0s)

---

## Phase 4: Verify execution trace JSONL

After the pipeline completes (either with round 2 questions or "Requirements complete!"):

```bash
# 1. Find the trace directory
find . -name "execution-log.jsonl" -newer CLAUDE.md

# 2. Display per-node timing
cat <path>/execution-log.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    if not line.strip(): continue
    r = json.loads(line)
    dur = r.get('durationMs', 'n/a')
    print(f'{r[\"sequenceNumber\"]:3d}  {r[\"stageName\"]:25s}  {dur}ms')
"

# 3. Check Q&A log
cat <path>/qa-log.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    if not line.strip(): continue
    r = json.loads(line)
    print(f'  round={r[\"round\"]}  Q: {r[\"questionText\"][:60]}...  A: {r[\"answer\"][:40]}')
"
```

### Checklist — execution trace

- [ ] Every node has a JSONL entry with `durationMs` field
- [ ] Sequence numbers are monotonically increasing (0, 1, 2, ...)
- [ ] Both initial run AND resume stages are recorded
- [ ] Q&A log has entries with question text and answers

---

## Phase 5: Verify dashboard UI fixes

1. **Screenshot after questions appear** — the "thinking..." spinner should NOT be visible
2. **Check chat panel** — answer bubbles should be **one summary** bubble, not 9 individual ones
3. **If round 2 questions appear**, visually confirm they have different tab labels than round 1

---

## Phase 6: Record results

Write verification results to `docs/plans/active/clarifier-step-verification/verification-results.md`:

```markdown
# Clarifier Verification Results — [DATE]

## Initial Run
- Total time: Xs
- contextRetriever: Xms ✅/❌
- prdAnalyzer: Xms (LLM: Xms) ✅/❌
- gapDetector: Xms (LLM 1: Xms, LLM 2: Xms) ✅/❌
- questionPrioritizer: Xms ✅/❌
- Questions generated: N ✅/❌

## Resume Flow
- storyWriter: Xms (LLM: Xms) ✅/❌
- critic: passed=true ✅/❌
- route: critic→prdUpdater ✅/❌
- prdUpdater: Xms (LLM: Xms) ✅/❌
- New questions different from round 1: ✅/❌

## UI Fixes
- Thinking indicator dismissed: ✅/❌
- Answer bubbles collapsed: ✅/❌

## Full Debug Log
[paste full debug log here]
```

---

## Critical files

| File | Purpose |
|------|---------|
| `packages/agents-clarifier/src/run.ts` | Pipeline runner with per-node timing |
| `packages/agents-clarifier/src/graph/clarifier-graph.ts` | Graph routing with debug logs |
| `packages/agents-clarifier/src/nodes/context-retriever.ts` | ENTER/EXIT logs |
| `packages/agents-clarifier/src/nodes/prd-analyzer.ts` | ENTER/EXIT + LLM START/END |
| `packages/agents-clarifier/src/nodes/gap-detector.ts` | ENTER/EXIT + 2x LLM START/END |
| `packages/agents-clarifier/src/nodes/question-prioritizer.ts` | ENTER/EXIT |
| `packages/agents-clarifier/src/nodes/story-writer.ts` | ENTER/EXIT + LLM START/END |
| `packages/agents-clarifier/src/nodes/critic.ts` | ENTER/EXIT + MAX_RETRIES=0 |
| `packages/agents-clarifier/src/nodes/prd-updater.ts` | ENTER/EXIT + LLM START/END |
| `packages/agents-clarifier/src/pipeline-trace.ts` | JSONL trace with durationMs |
| `packages/dashboard/src/lib/hooks/use-clarifier-stream.ts` | Thinking indicator fix |
| `packages/dashboard/src/app/(dashboard)/new/page.tsx` | Collapsed answer bubbles |
