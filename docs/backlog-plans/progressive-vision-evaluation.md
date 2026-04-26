# Progressive Vision Evaluation

**Created:** 2026-04-26
**Status:** Backlog — proposed, not scheduled
**Owner:** unassigned
**Depends on:** Compact spec summary (must ship first — see "Prerequisites" below)
**Ideal timing:** Before Roadmap Phase 4 (cross-screen coherence), after compact spec summary is proven
**Related:**
- `packages/agents-ux/src/ux-design/design-evaluator.ts` — current single-pass evaluator
- `packages/agents-ux/src/ux-design/browser-correction-pipeline.ts` — correction loop that consumes evaluator output
- `packages/agents-ux/src/ux-design/browser-correction-adapter.ts` — applies spec patches from evaluator issues
- `docs/architecture/design-pipeline-dataflow.md` — Stage 5 (Visual Self-Correction)
- `docs/vision.md` Layer 9 — Review patterns

---

## Why this plan exists

The vision evaluator (`evaluateDesign()`) sends the full design spec JSON + full-page screenshot to `claude-opus-4-7` for every evaluation call. A single call consumes ~6,000-18,000 tokens depending on page complexity. This causes:

1. **Rate limiting on Vertex AI** — basic TPM quotas (4,000) can't handle a single request
2. **Expensive correction loops** — each re-evaluation after applying fixes sends the ENTIRE spec+screenshot again (3 iterations × 18,000 tokens = 54,000 tokens per page)
3. **Roadmap Phase 4 blocker** — cross-screen coherence will evaluate multiple screens simultaneously, multiplying the cost linearly

The immediate fix (compact spec summary) reduces single-pass cost by ~80-90%. This plan describes the **next level**: a two-phase evaluation strategy that reduces re-evaluation cost further and produces better-focused fix instructions.

---

## Design: Two-Phase Evaluation

### Current (single pass)

```
Full screenshot + Full spec → LLM → score + ALL issues
Cost: ~6,000-18,000 tokens per call
Correction loop (3 iterations): ~18,000-54,000 tokens per page
```

### Progressive (two phases)

```
Phase 1 — Quick Scan (~2,000-3,000 tokens):
  Screenshot + compact component tree → LLM → flagged component IDs + severity

Phase 2 — Focused Dive (~500-1,000 tokens per flagged component):
  Cropped screenshot (just that region) + that node's full subtree → LLM → specific fix

If 2/47 components flagged: ~4,000 tokens total
If 0 flagged (score ≥ 80): ~2,500 tokens (no Phase 2 needed)
If everything flagged (rare): more expensive than single pass
```

### Re-evaluation during correction loop

After applying fixes, only the flagged components from the previous iteration need re-evaluation:

```
Correction iteration N:
  1. Re-render modified spec → new screenshot
  2. Quick scan on new screenshot → newly flagged component IDs
  3. Focused dive only on still-flagged components
  
Cost per iteration: ~3,000-5,000 tokens (vs ~18,000 single-pass)
```

---

## Prerequisites

1. **Compact spec summary (in progress)** — The compact tree representation must be shipped and evaluation quality confirmed. Progressive evaluation builds on the same tree representation for Phase 1.

2. **Renderer bounding box reporting** — To crop screenshots per component, the browser renderer must report where each component renders. Implementation path:
   - `DesignSpecRenderer.tsx` already renders nodes with `data-node="{nodeId}"` attributes
   - After rendering, collect `getBoundingClientRect()` for all `[data-node]` elements
   - Return a `Map<nodeId, { x, y, width, height }>` alongside the screenshot
   - `openBrowserSession()` can expose this via a new `getNodeBoundingBoxes()` method

3. **Subtree extraction utility** — A `getSubtree(spec: DesignSpecV2, rootNodeId: string): DesignSpecV2` function that returns a spec containing only the specified node and all its descendants. This is similar to the existing `filterSpecToNodes()` in `spec-split.ts` but keyed by a subtree root rather than root-level children.

---

## Downstream Impact: Who Consumes Evaluator Output?

### Currently connected

| Consumer | How it uses evaluator output | Impact of progressive eval |
|----------|-----|------|
| **Correction loop** (`correction-loop.ts`) | Filters issues by severity → calls `adapter.executeFixes()` → re-renders | Better: focused issues = more targeted fixes, fewer wasted corrections |
| **Dashboard UI** (`audit-tab.tsx`) | Displays score + issues list | Neutral: same output shape |
| **CLI** (`design-page.ts`) | Returns final score as exit status | Neutral: same score |

### Not yet connected (future opportunities)

| Consumer | Potential use | Impact |
|----------|-----|------|
| **Implementation agent** (`ux-implementation.ts`) | Pass evaluator issues to code generation prompt — LLM avoids generating CSS that causes known spacing/truncation issues | Medium: improves first-pass code quality |
| **Planning agent** (`ux-planning.ts`) | Feed persistent issues back to planning — if the same component fails evaluation across iterations, adjust the component tree | Low: design-level fix, not planning-level |
| **Cross-screen coherence** (Roadmap Phase 4) | Evaluate consistency across screens cheaply — quick scan each screen, deep dive only on inconsistent components | High: makes Phase 4 feasible at scale |

### Wiring evaluator output to implementation (recommended follow-up)

The implementation agent already accepts optional `designSnapshot?: DesignSnapshotData` (line 42-49). The evaluator's issue list could be serialized and injected alongside the design snapshot:

```typescript
// Future: in the implementation node
const implInput = {
  ...baseInput,
  designSnapshot: extractDesignSnapshot(spec, screenshot),
  evaluationIssues: evalResult.issues.filter(i => i.severity !== 'minor'),
  // LLM prompt: "The design evaluator flagged these issues. Generate CSS 
  // that avoids these specific problems: [issues]"
};
```

This connection is independent of progressive evaluation and could be built separately. It's gated behind ADR-045 (evaluator node is currently stubbed for Stage 7).

---

## Phased Implementation

### Phase P1 — Renderer bounding box API (~0.5 day)

**Scope:** Add `getNodeBoundingBoxes()` to the browser session.

**Files:**
- `packages/designspec-renderer/src/renderer/browser/screenshot-session.ts` — add method
- `packages/designspec-renderer/src/renderer/browser/screenshot-session.test.ts` — unit test

**Acceptance criteria:**
- `getNodeBoundingBoxes()` returns a `Map<string, DOMRect>` for all `[data-node]` elements
- Works on the PET dashboard fixture (47+ nodes)
- Bounding boxes are in page coordinates (not viewport-relative)

### Phase P2 — Screenshot cropping utility (~0.5 day)

**Scope:** Add `cropScreenshot(fullScreenshot: Buffer, bbox: DOMRect, padding: number): Buffer` using Playwright's element screenshot or sharp/canvas.

**Files:**
- `packages/designspec-renderer/src/renderer/browser/screenshot-crop.ts` — new
- Test with PET fixture

**Acceptance criteria:**
- Crops a full-page screenshot to a specific bounding box + padding
- Output is a valid PNG buffer
- Padding prevents tight crops that miss context

### Phase P3 — Two-phase evaluator (~1 day)

**Scope:** Refactor `evaluateDesign()` to support a `mode: 'quick' | 'focused' | 'full'` parameter.

**Files:**
- `packages/agents-ux/src/ux-design/design-evaluator.ts` — add mode parameter
- `packages/agents-ux/src/ux-design/evaluation-context.ts` — add `getSubtreeContext()` for focused mode

**Modes:**
- `quick` (default for new callers): compact tree + screenshot → flagged components + score
- `focused`: cropped screenshot + subtree detail → specific fix for one component
- `full` (backward compat): current behavior with compact tree (not raw JSON)

**Acceptance criteria:**
- Quick mode uses ~2,500 tokens on PET dashboard
- Focused mode uses ~800 tokens per component
- Full mode unchanged from compact-tree behavior
- Correction loop can use quick→focused flow

### Phase P4 — Correction loop integration (~0.5 day)

**Scope:** Update `browser-correction-pipeline.ts` to use quick→focused flow.

**Flow:**
1. Quick scan → flagged components
2. For each flagged: focused dive → specific fix
3. Apply fixes → re-render
4. Quick re-scan → check remaining issues
5. Loop until score >= 80 or max iterations

**Acceptance criteria:**
- Correction loop completes on PET fixture
- Total token usage reduced by ~60% vs current approach
- Score convergence rate unchanged (same or fewer iterations)

---

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| P1: Bounding box API | ~0.5 day | Compact spec summary shipped |
| P2: Screenshot cropping | ~0.5 day | P1 |
| P3: Two-phase evaluator | ~1 day | P1, P2 |
| P4: Correction loop integration | ~0.5 day | P3 |
| **Total** | **~2.5 days** | |

---

## When to Schedule

**Trigger conditions (any of):**
1. Users actively using the correction loop hit rate limits during re-evaluation cycles
2. Roadmap Phase 4 (cross-screen coherence) planning begins — that phase multiplies evaluation cost by screen count
3. Cost tracking (Roadmap Phase 7) shows vision evaluation is a top-3 cost contributor

**Recommended timing:** After Roadmap Phase 1 (clarifier), before Roadmap Phase 4 (cross-screen coherence). The cross-screen coherence work will evaluate multiple screens simultaneously — progressive eval makes that feasible on standard Vertex AI quotas.

**Not needed if:** The compact spec summary (80-90% reduction) brings single-pass cost under quota limits AND the correction loop isn't heavily used. In that case, defer until Phase 4 forces the issue.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Two LLM calls add latency vs one | Quick scan is fast (~2s); focused dives are parallel-safe. Net latency similar if < 5 components flagged. |
| Cropped screenshots lose surrounding context | Add 50px padding around bounding box; include parent container in crop for layout context |
| Quick scan misses issues that full scan would catch | Quick scan uses same system prompt and compact tree. If issues are missed, fall back to full mode. Track miss rate. |
| Bounding boxes shift after spec patches | Re-collect bounding boxes after each re-render (already happens in the correction loop) |
| This becomes premature optimization | Gate behind the trigger conditions above. Don't build until needed. |
