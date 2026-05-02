# Clarifier Self-Correction: Execution Trace + Evaluator-Challenger Pipeline

**Status:** In Progress — Phases 1-3 COMPLETE (2026-05-02), Phase 4 next
**Created:** 2026-05-02
**Depends on:** Clarifier Initiative (Phase 1 complete)

## Context

The clarifier pipeline goes in circles when creating a new project — asking the same or similar questions across rounds. Additionally, there's no way to analyze pipeline behavior because nothing is persisted. This plan addresses three needs:

1. **Fix circular questioning** — PRD must evolve after answers, gaps must not repeat
2. **Record every stage's input/output** — Full execution trace for analysis (stage name, turn number, sequence number, input payload, output payload)
3. **Self-correction process** — Two high-reasoning models (evaluator + challenger) analyze execution traces across 2 rounds, producing specific code/prompt change recommendations

## Root Causes (Verified Against Code)

| # | Issue | Evidence | File:Line |
|---|-------|----------|-----------|
| 1 | PRD never evolves | `storyWriter` returns `{ requirement, featurePlan, assumptions }` — no `prdDraft` | story-writer.ts:301 |
| 2 | No Q&A in gap detector prompt | `runClarifyGPT(deps, prd, rawInput, context, mode)` — no Q&A param | gap-detector.ts:640 |
| 3 | Unstable LLM gap IDs | `id: \`llm-${i}\`` — positional, resets each round | gap-detector.ts:582 |
| 4 | Only answered gaps filtered | `filterAddressedGaps` checks answered, not asked | gap-detector.ts:606-616 |
| 5 | No execution trace | Only `writeBridgeEvent` telemetry event at completion | run.ts:264-268 |

## All Failure Modes

| ID | Mode | Root Cause | Fix Phase |
|----|------|-----------|-----------|
| A | Exact duplicate questions | Same PRD → same gaps | 1 |
| B | Semantically similar questions | LLM paraphrases same gap | 1, 3 |
| C | Questions about already-answered topics | Gap detector has no Q&A context | 3 |
| D | PRD not improving from answers | prdDraft immutable | 1 |
| E | Lost Q&A history on crash/restart | In-memory only | 2 |
| F | Can't analyze question/prompt quality | No execution trace | 2, 4 |
| G | PRD regression from bad answers | No versioning for rollback | 2 |
| H | Gap ID collision across rounds | Positional `llm-${i}` IDs | 3 |
| I | Budget allows re-asking | Per-round, doesn't subtract asked | 3 |

## Verified Stage Data Flow

| Seq | Stage | Input (from state) | Output (to state) |
|-----|-------|--------------------|--------------------|
| 0 | contextRetriever | `rawInput`, `mode` | `{ context }` |
| 1 | prdAnalyzer | `rawInput`, `mode`, `context` | `{ prdDraft }` |
| 2 | gapDetector | `prdDraft`, `rawInput`, `mode`, `context`, `round`, `questions`, `humanResponses` | `{ gaps, round: round+1 }` |
| 3 | questionPrioritizer | `gaps`, `prdDraft`, `round`, `assumptions` | `{ questions, assumptions }` |
| — | [HITL interrupt] | `questions` shown to user | `humanResponses` appended via reducer |
| 4 | storyWriter | `prdDraft`, `humanResponses`, `questions`, `gaps`, `mode`, `round`, `maxRounds`, `assumptions` | `{ requirement, featurePlan, assumptions }` |
| 5 | critic | `featurePlan`, `criticRetries`, `requirement` | `{ criticPassed, criticRetries }` |
| — | [routing] | `round`, `maxRounds`, `criticPassed`, `criticRetries`, `gaps`, `humanResponses`, `questions` | → prdUpdater (new) or emitComplete or escalationGate |

## Test Prompt

```
Create a pomodoro web application, which stores the configurations outside the client 
app as json. It should support multiple timer profiles, break intervals, and notification 
sounds. The app should also have a dashboard showing productivity statistics over time.
```

---

## Phase 1: PRD Updater Node

Add a new node between `critic` and `gapDetector` that merges human answers into `prdDraft` before the next round.

### New files

**`packages/agents-clarifier/src/nodes/prd-updater.ts`**

- Factory: `createPrdUpdater(deps: ClarifierDeps): ClarifierNodeFn`
- Reads: `state.prdDraft`, `state.humanResponses`, `state.questions`
- LLM call: claude-sonnet-4-6, structured output using `PRD_RESPONSE_SCHEMA` (reuse from prd-analyzer.ts:53-185)
- Validates with `PRDSchema.safeParse()` (reuse from `@agentforge/core`)
- On validation failure: keep old `prdDraft`, log warning via `debugLog`, continue
- Returns: `{ prdDraft: updatedPrd }`

**`packages/agents-clarifier/src/prompts/prd-updater-system.md`**

- Frontmatter: `version: 1.0.0`, `purpose: Update PRD based on human clarification answers`
- Core instruction: "Update this PRD to reflect the user's decisions. Preserve all existing fields and structure. Only modify sections directly affected by answers. Do not remove features unless the user explicitly excluded them. Do not add features not discussed."

**`packages/agents-clarifier/src/nodes/__tests__/prd-updater.test.ts`**

### Modified files

**`packages/agents-clarifier/src/graph/clarifier-graph.ts`**

- Import `createPrdUpdater`
- Add node: `.addNode('prdUpdater', createPrdUpdater(deps))`
- Add edge: `.addEdge('prdUpdater', 'gapDetector')`
- `routeAfterCritic` line 43: return `'prdUpdater'` instead of `'gapDetector'` when looping
- `routeAfterEscalation` line 54: `'restart'` returns `'prdUpdater'` instead of `'gapDetector'`
- Updated flow: `critic → prdUpdater → gapDetector → questionPrioritizer → [HITL] → storyWriter → critic`

**`packages/agents-clarifier/src/index.ts`** — Export `createPrdUpdater`

**Dashboard stage labels** (both):

- `packages/dashboard/src/app/api/clarifier/route.ts` — Add `prdUpdater` stage label
- `packages/dashboard/src/app/api/clarifier/respond/route.ts` — Same

---

## Phase 2: Pipeline Execution Trace

Record every stage's input and output with file-based persistence and pointer-based log entries. This is the foundation for both human analysis and the self-correction pipeline (Phase 4).

### Storage layout

```
.agentforge/clarifier/{threadId}/
  execution-log.jsonl                    # Lightweight log with pointers
  qa-log.jsonl                           # Focused Q&A sequential log
  stages/
    000-contextRetriever-input.json      # Full state before node ran
    000-contextRetriever-output.json     # Partial state delta node produced
    001-prdAnalyzer-input.json
    001-prdAnalyzer-output.json
    002-gapDetector-input.json           # Round 0
    002-gapDetector-output.json
    003-questionPrioritizer-input.json
    003-questionPrioritizer-output.json
    004-hitl-input.json                  # Questions shown to user
    004-hitl-output.json                 # Human responses
    005-storyWriter-input.json
    005-storyWriter-output.json
    006-critic-input.json
    006-critic-output.json
    007-prdUpdater-input.json            # Round 1 starts
    007-prdUpdater-output.json           # Updated PRD (diff from 001 shows evolution)
    008-gapDetector-input.json           # Now has updated prdDraft
    ...
```

### Data structures

```typescript
/** Execution log entry — lightweight, with file pointers */
interface PipelineStageRecord {
  readonly stageName: string;         // 'contextRetriever', 'prdAnalyzer', 'hitl', etc.
  readonly turnNumber: number;        // Clarification round (0, 1, 2...)
  readonly sequenceNumber: number;    // Global counter across all turns and sessions
  readonly timestamp: string;         // ISO timestamp
  readonly threadId: string;
  readonly inputFile: string;         // 'stages/001-prdAnalyzer-input.json'
  readonly outputFile: string;        // 'stages/001-prdAnalyzer-output.json'
}

/** Q&A log entry — focused view for analysis */
interface QALogEntry {
  readonly timestamp: string;
  readonly threadId: string;
  readonly round: number;
  readonly questionId: string;
  readonly gapId: string;
  readonly topic?: string;
  readonly questionText: string;
  readonly questionType: 'open' | 'multiple-choice';
  readonly answer: string;
  readonly selectedOption?: string;
  readonly optionCount?: number;
  readonly evpiScore: number;
}
```

### Recording mechanism

In `run.ts`, the stream at line 100-111 uses `streamMode: 'updates'` which yields per-node output deltas. We maintain an accumulated state to reconstruct each node's input.

**Initial run (no humanResponses):**

```typescript
let accumulated: Record<string, unknown> = { ...invokeInput };
let sequence = 0;

for await (const update of stream) {
  for (const node of nodeNames) {
    const nodeOutput = update[node];
    // 1. Write stages/{seq}-{node}-input.json from accumulated
    // 2. Write stages/{seq}-{node}-output.json from nodeOutput
    // 3. Append PipelineStageRecord to execution-log.jsonl
    sequence++;
    Object.assign(accumulated, nodeOutput); // merge delta
  }
}
```

**HITL gap handling (critical):**

When the graph interrupts before `storyWriter`, the stream ends. When the user responds and calls the resume endpoint, a NEW stream starts. Three issues to handle:

1. **Restore accumulated state on resume**: Before starting the resume stream, read the full checkpoint state via `compiled.getState(config)` — this is the accumulated state up to the interrupt point.
2. **Record the HITL step**: Insert a synthetic `hitl` stage entry between interrupt and resume. Input = `{ questions }` from checkpoint. Output = `{ humanResponses }` from the resume input.
3. **Continue sequence numbering**: Read the last `sequenceNumber` from `execution-log.jsonl` and continue from there.

```typescript
// Resume path (when input.humanResponses is provided)
const checkpoint = await compiled.getState(config);
accumulated = { ...checkpoint.values };
sequence = readLastSequence(input.projectRoot, threadId) + 1;

// Record HITL step
appendStageRecord(projectRoot, threadId, {
  stageName: 'hitl',
  turnNumber: accumulated.round,
  sequenceNumber: sequence++,
  input: { questions: accumulated.questions },
  output: { humanResponses: input.humanResponses },
});

// Merge human responses into accumulated state
Object.assign(accumulated, {
  humanResponses: [...accumulated.humanResponses, ...input.humanResponses],
});
```

**Q&A log population:**

When recording the `hitl` stage, also append entries to `qa-log.jsonl` by joining `input.humanResponses` with `accumulated.questions`:

```typescript
const qaEntries = input.humanResponses.map(r => {
  const q = accumulated.questions.find(qq => qq.id === r.questionId);
  return {
    timestamp: new Date().toISOString(),
    threadId,
    round: accumulated.round,
    questionId: r.questionId,
    gapId: q?.gapId,
    topic: q?.topic,
    questionText: q?.text ?? '',
    questionType: q?.type ?? 'open',
    answer: r.answer,
    selectedOption: r.selectedOption,
    optionCount: q?.options?.length,
    evpiScore: q?.evpiScore ?? 0,
  };
});
appendQALog(projectRoot, threadId, qaEntries);
```

### PRD versioning (derived from execution trace)

PRD snapshots are automatically captured as stage I/O:

- **Round 0 PRD**: `001-prdAnalyzer-output.json` → `{ prdDraft: {...} }`
- **Round 1 PRD**: `007-prdUpdater-output.json` → `{ prdDraft: {...} }` (after user answers)
- **Round 2 PRD**: `014-prdUpdater-output.json` → `{ prdDraft: {...} }` (after more answers)

Comparing these files shows exactly how the PRD evolved. The self-correction pipeline (Phase 4) reads these to detect stagnation or regression.

### New files

**`packages/agents-clarifier/src/pipeline-trace.ts`**

- `appendStageRecord(projectRoot, threadId, record)` — Write input/output JSON files + append JSONL entry
- `appendQALog(projectRoot, threadId, entries)` — Append to `qa-log.jsonl`
- `readExecutionLog(projectRoot, threadId)` — Read JSONL log
- `readQALog(projectRoot, threadId)` — Read Q&A entries
- `readStageIO(projectRoot, threadId, sequenceNumber, stageName, which)` — Read full I/O file
- `readLastSequence(projectRoot, threadId)` — Get last sequence number for resume continuity
- All follow `file-event-bridge.ts` pattern: `mkdirSync({ recursive: true })` + `writeFileSync`/`appendFileSync`

**`packages/agents-clarifier/src/pipeline-trace.test.ts`**

### Modified files

**`packages/agents-clarifier/src/types.ts`**

- Add `threadId: string` to `ClarifierState`
- Export `PipelineStageRecord`, `QALogEntry`

**`packages/agents-clarifier/src/graph/state.ts`**

- Add `threadId` channel: `threadId: Annotation<string>({ reducer: (_, b) => b, default: () => '' })`

**`packages/agents-clarifier/src/run.ts`**

- Set `threadId` in `invokeInput`: `invokeInput.threadId = threadId`
- Add accumulated state tracking and stage recording in stream loop
- Handle HITL gap with checkpoint restoration and synthetic stage entry
- Sequence continuity on resume

**`packages/agents-clarifier/src/index.ts`** — Export trace functions

---

## Phase 3: Gap Detector Fixes

Three targeted fixes to prevent re-asking.

### 3a. Content-hashed gap IDs

File: `packages/agents-clarifier/src/nodes/gap-detector.ts`

```typescript
import { createHash } from 'node:crypto';

function gapContentId(topic: string, description: string): string {
  const hash = createHash('sha256')
    .update(`${topic}::${description}`)
    .digest('hex')
    .slice(0, 8);
  return `llm-${hash}`;
}
```

Line 582: Replace `id: \`llm-${i}\`` with `id: gapContentId(g.topic, g.description)`.

### 3b. Q&A history in ClarifyGPT prompt

Extend `runClarifyGPT` signature (line 507) to accept `previousQA`:

```typescript
async function runClarifyGPT(
  deps, prd, rawInput, context, mode,
  previousQA?: readonly { question: string; answer: string }[],
): Promise<Gap[]> {
```

Append to user message (line 549) when `previousQA.length > 0`:

```
## Already Clarified (DO NOT ask about these topics again)

**Q:** ...
**A:** ...

Only identify NEW gaps not covered above.
```

In `createGapDetector` (line 640), build Q&A pairs from `state.humanResponses` + `state.questions` and pass to `runClarifyGPT`.

### 3c. Filter asked-but-unanswered gaps

Add `filterAskedGaps(gaps, questions)` — filters ALL gaps that had questions generated, not just answered ones. Replace `filterAddressedGaps` in lines 635-648.

### Tests

Update `packages/agents-clarifier/src/nodes/__tests__/gap-detector.test.ts`:

- Content-hash stability
- `filterAskedGaps` removes asked-but-unanswered
- Q&A section in ClarifyGPT prompt

---

## Phase 4: Self-Correction Pipeline

A meta-analysis system that reads execution traces, runs evaluator-challenger analysis across 2 rounds, and outputs specific code/prompt corrections.

### Architecture

```
Execution Trace (.agentforge/clarifier/{threadId}/)
          │
          ▼
┌─────────────────────┐
│ 1. Trace Loader     │  Read execution-log.jsonl + stage I/O files + qa-log.jsonl
│    (no LLM)         │  Output: structured ExecutionTrace object
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│ 2. Structural       │  Deterministic checks (no LLM):
│    Checker          │  - Question repetition (text similarity across rounds)
│    (no LLM)         │  - PRD stagnation (diff PRD snapshots — identical = stagnation)
└─────────────────────┘  - Output completeness (empty gaps/questions/prdDraft)
          │              - Q&A coverage (asked vs answered ratio)
          ▼              - Assumption growth (>70% auto-resolved = too granular)
┌─────────────────────┐
│ 3. Evaluator        │  Claude Opus 4.6 — HIGH reasoning model
│    (Round 1)        │  Input: ExecutionTrace + StructuralCheckResults
│                     │  Evaluates: question quality, PRD evolution, prompt effectiveness
└─────────────────────┘  Output: PipelineEvaluation (scored issues + recommendations)
          │
          ▼
┌─────────────────────┐
│ 4. Challenger       │  Claude Opus 4.6 — FRESH context (no evaluator's analysis
│    (Round 1)        │  in system prompt)
│                     │  Input: ExecutionTrace + PipelineEvaluation
└─────────────────────┘  Output: ChallengeReport (agreements, disagreements, missed)
          │
          ▼
┌─────────────────────┐
│ 5. Evaluator        │  Claude Opus 4.6 — Round 2 refinement
│    (Round 2)        │  Input: Trace + Evaluation + ChallengeReport
│                     │  Addresses challenger's concerns, refines recommendations
└─────────────────────┘  Output: RefinedEvaluation
          │
          ▼
┌─────────────────────┐
│ 6. Challenger       │  Claude Opus 4.6 — Round 2 validation
│    (Round 2)        │  Input: All prior analyses
│                     │  Final validation of refined recommendations
└─────────────────────┘  Output: FinalValidation { approved, remainingConcerns }
          │
          ▼
┌─────────────────────┐
│ 7. Report           │  Synthesize all analyses into actionable CorrectionReport
│    Generator        │  Maps recommendations to specific files, prompts, configs
│    (no LLM)         │  Output: CorrectionReport saved to correction-report.json
└─────────────────────┘
```

### Output data structure

```typescript
interface CorrectionReport {
  readonly threadId: string;
  readonly timestamp: string;
  readonly structuralChecks: StructuralCheckResult[];
  readonly evaluatorScore: number; // 0-100
  readonly corrections: CorrectionItem[];
  readonly consensus: {
    readonly agreementRate: number; // 0-1
    readonly roundsCompleted: number;
    readonly evaluatorConfidence: number;
    readonly challengerConfidence: number;
  };
}

interface CorrectionItem {
  readonly id: string;
  readonly category: 'prompt' | 'config' | 'code' | 'schema';
  readonly severity: 'critical' | 'major' | 'minor';
  readonly target: {
    readonly file: string;
    readonly section?: string;
    readonly currentBehavior: string;
  };
  readonly recommendation: string;
  readonly reasoning: string;
  readonly evaluatorAgreed: boolean;
  readonly challengerAgreed: boolean;
  readonly consensusScore: number; // 0-1 (1 = both agree)
}

interface StructuralCheckResult {
  readonly check: string;
  readonly passed: boolean;
  readonly details: string;
  readonly severity: 'critical' | 'major' | 'minor';
}
```

### What the evaluator analyzes

1. **Question Quality** — Are questions user-friendly? Are options well-differentiated? Do questions cover different aspects per round? Are they appropriate for the project type?
2. **PRD Evolution** — Is the PRD capturing full scope? Are answers reflected in updates? Are there hallucinated features? Is the PRD stagnating?
3. **Prompt Effectiveness** — Are the 3 implementation approaches (gap detector) truly diverse? Is the initial PRD (prd-analyzer) complete? Are acceptance criteria (story writer) specific?
4. **Pipeline Flow** — Are there wasted rounds? Is the question budget appropriate? Is the EVPI threshold filtering correctly?

### Example corrections

```json
{
  "category": "prompt",
  "target": {
    "file": "packages/agents-clarifier/src/prompts/gap-detector-system.md",
    "currentBehavior": "Prompt asks for 3 implementation approaches without constraining diversity"
  },
  "recommendation": "Add: 'Ensure approaches differ in at least 2 of: architecture, data model, UX flow, tech stack'",
  "consensusScore": 0.95
}
```

```json
{
  "category": "config",
  "target": {
    "file": "packages/agents-clarifier/src/nodes/question-prioritizer.ts",
    "currentBehavior": "EVPI_THRESHOLD = 0.15 — too many low-value questions pass"
  },
  "recommendation": "Raise to 0.25 based on execution data showing 40% of asked questions had EVPI < 0.2",
  "consensusScore": 0.8
}
```

### Implementation structure

```
packages/agents-clarifier/src/evaluator/
  index.ts                          # Export all
  types.ts                          # CorrectionReport, CorrectionItem, etc.
  trace-loader.ts                   # Read execution trace from files
  structural-checker.ts             # Deterministic checks (no LLM)
  evaluator-node.ts                 # LLM evaluator (Claude Opus 4.6)
  challenger-node.ts                # LLM challenger (Claude Opus 4.6, fresh context)
  report-generator.ts               # Synthesize analyses into CorrectionReport
  evaluator-graph.ts                # LangGraph pipeline (7-node linear)
  run-evaluation.ts                 # Entry point
  prompts/
    evaluator-system.md             # Evaluator prompt with failure-mode checklist
    challenger-system.md            # Challenger prompt — adversarial review stance
```

### Reference patterns (existing in codebase)

- **Design evaluator** (`packages/agents-ux/src/ux-design/design-evaluator.ts`): 5-dimension rubric scoring, `CorrectionHistory` tracking, structural deductions, quality thresholds
- **Correction loop** (`packages/agents-ux/src/ux-design/correction-loop.ts`): Iterative refinement with stopping conditions (plateau detection, regression detection, max iterations)
- **ClarifyGPT consistency sampling** (`gap-detector.ts`): 3 implementations at temp 0.7 → divergence analysis at temp 0 — same evaluator-challenger pattern applied to requirements

### LangGraph pipeline

```typescript
// evaluator-graph.ts — 7-node linear StateGraph
new StateGraph(EvaluatorStateAnnotation)
  .addNode('traceLoader', createTraceLoader())
  .addNode('structuralChecker', createStructuralChecker())
  .addNode('evaluatorRound1', createEvaluator(deps))
  .addNode('challengerRound1', createChallenger(deps))
  .addNode('evaluatorRound2', createEvaluatorRefine(deps))
  .addNode('challengerRound2', createChallengerValidate(deps))
  .addNode('reportGenerator', createReportGenerator())
  .addEdge('__start__', 'traceLoader')
  .addEdge('traceLoader', 'structuralChecker')
  .addEdge('structuralChecker', 'evaluatorRound1')
  .addEdge('evaluatorRound1', 'challengerRound1')
  .addEdge('challengerRound1', 'evaluatorRound2')
  .addEdge('evaluatorRound2', 'challengerRound2')
  .addEdge('challengerRound2', 'reportGenerator')
  .addEdge('reportGenerator', END);
```

No conditional routing — fixed 7-stage sequence. The "2 rounds" are explicit nodes.

### Triggering

- **CLI**: `agentforge evaluate-clarifier --thread {threadId}` (future)
- **Dashboard**: Button on clarifier results page: "Analyze pipeline quality" (future)
- **After completion**: Optionally auto-triggered when a clarifier run completes
- **For now**: Called directly in code during development/testing

### Output persistence

```
.agentforge/clarifier/{threadId}/
  correction-report.json             # Final CorrectionReport
  evaluation/
    structural-checks.json           # Deterministic check results
    evaluator-round1.json            # Evaluator analysis
    challenger-round1.json           # Challenger response
    evaluator-round2.json            # Refined evaluation
    challenger-round2.json           # Final validation
```

---

## Phase 5: Verification

1. **Unit tests**: `nx test agents-clarifier` — all pass
2. **Typecheck**: `nx run-many -t typecheck` — zero errors
3. **Lint**: `nx run-many -t lint` — clean
4. **Manual test with Pomodoro prompt**:
   - Start dashboard: `nx run-many -t build && cd packages/dashboard && npm run dev`
   - Navigate to `/new`, enter the Pomodoro prompt
   - Round 1: Questions about scope, timer profiles, notifications
   - Answer questions
   - Round 2: Verify DIFFERENT questions (not repeats)
   - Check `.agentforge/clarifier/{threadId}/execution-log.jsonl` — all stages recorded
   - Check `stages/` directory — input/output JSON files present for every node including `hitl`
   - Diff PRD in `001-prdAnalyzer-output.json` vs `007-prdUpdater-output.json` — PRD should differ
   - Check `qa-log.jsonl` — sequential Q&A entries, no duplicates
5. **Self-correction test**:
   - Run evaluation pipeline on the completed trace
   - Verify `correction-report.json` is generated with specific recommendations
   - Verify structural checks detect any question repetition or PRD stagnation
   - Verify evaluator and challenger produce different but complementary analyses

## Implementation Order

**Phase 1** → **Phase 2** → **Phase 3** → **Phase 4** → **Phase 5** (sequential)

Phase 1 is the highest-impact fix (breaks the question loop). Phase 2 is the foundation for analysis. Phase 3 prevents remaining edge cases. Phase 4 builds on Phase 2's trace data.

## Files Summary

| File | Action | Phase |
|------|--------|-------|
| `packages/agents-clarifier/src/nodes/prd-updater.ts` | NEW | 1 |
| `packages/agents-clarifier/src/prompts/prd-updater-system.md` | NEW | 1 |
| `packages/agents-clarifier/src/nodes/__tests__/prd-updater.test.ts` | NEW | 1 |
| `packages/agents-clarifier/src/pipeline-trace.ts` | NEW | 2 |
| `packages/agents-clarifier/src/pipeline-trace.test.ts` | NEW | 2 |
| `packages/agents-clarifier/src/evaluator/` (entire directory) | NEW | 4 |
| `packages/agents-clarifier/src/graph/clarifier-graph.ts` | MODIFY | 1 |
| `packages/agents-clarifier/src/graph/state.ts` | MODIFY | 2 |
| `packages/agents-clarifier/src/types.ts` | MODIFY | 2 |
| `packages/agents-clarifier/src/run.ts` | MODIFY | 2 |
| `packages/agents-clarifier/src/nodes/gap-detector.ts` | MODIFY | 3 |
| `packages/agents-clarifier/src/nodes/__tests__/gap-detector.test.ts` | MODIFY | 3 |
| `packages/agents-clarifier/src/index.ts` | MODIFY | 1, 2, 4 |
| `packages/dashboard/src/app/api/clarifier/route.ts` | MODIFY | 1 |
| `packages/dashboard/src/app/api/clarifier/respond/route.ts` | MODIFY | 1 |
