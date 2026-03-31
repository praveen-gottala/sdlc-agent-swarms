# Task: Fix Correction Pipeline — Bugs, Logging, and Continuous Feedback Loop

## Context

The browser correction pipeline (`runBrowserCorrectionPipeline`) has two bugs, poor logging, and a UX gap where the interactive preview closes before corrections are applied, giving the user no way to verify fixes or provide follow-up feedback.

---

## Bug 1: User feedback ignored when initial score meets threshold

**File:** `packages/agents-ux/src/ux-design/browser-correction-pipeline.ts`

The pipeline collects user tags from the interactive preview, then passes them to the vision correction adapter. But `runCorrectionLoop()` evaluates the spec first, and if the score meets `qualityThreshold` (default 80), it skips all corrections — including the user-tagged issues. The user's feedback is collected and thrown away.

**Fix:** Before calling `runCorrectionLoop()`, check if `userTags.length > 0`. If the user provided feedback, force at least one correction iteration. The simplest approach:

```typescript
const effectiveThreshold = (userTags && userTags.length > 0)
  ? 100  // force at least one correction pass — no spec scores 100
  : (options?.qualityThreshold ?? 80);
```

Alternative: if `runCorrectionLoop` accepts a `forceFirstIteration` option, use that instead. Check the existing signature and use whichever fits without changing the shared loop logic.

---

## Bug 2: Identical spec written as "corrected" output

After the pipeline returns, if no corrections were applied, the caller still writes an identical file as `corrected-spec.json`. Fix at the write site:

- If `result.iterations === 0` or the returned spec is identical to the input, log "No corrections applied — spec unchanged" and skip writing the corrected file.
- If corrections were applied, log what changed (see logging section below).

---

## Logging Improvements

The current pipeline logs are minimal and don't tell the user what's happening at each stage. Replace the existing log statements with a structured, readable log narrative. Use a `[correction]` prefix for all lines.

### Pipeline start
```
[correction] ══════════════════════════════════════════════════
[correction] Design Correction Pipeline — {screenName}
[correction] ══════════════════════════════════════════════════
[correction] Input: {nodeCount} nodes, {width}px viewport
```

### Browser session open
```
[correction] ▸ Opening browser session...
[correction]   Vite build: {cached|rebuilt in Xms}
[correction]   Playwright: launched in {X}ms
[correction]   Initial screenshot: {bytes} bytes
```

### DOM extraction
```
[correction] ▸ Extracting DOM layout...
[correction]   Extracted {count} nodes in {X}ms
[correction]   Catalog components: {count} ({list of dataCatalog values})
```

### Mechanical checks
```
[correction] ▸ Running mechanical checks...
[correction]   Found {N} issues:
[correction]     Tier 1 (auto-fixable): {count}
[correction]       ✦ {nodeId}: {rule} — {description}
[correction]       ✦ {nodeId}: {rule} — {description}
[correction]     Tier 2 (report-only): {count}
[correction]       ◇ {nodeId}: {rule} — {description}
```

If Tier 1 fixes are applied:
```
[correction]   Applied {count} auto-fixes → re-rendering...
[correction]   Re-check: {before} → {after} issues ({"accepted ✓" | "reverted — no improvement"})
```

If no issues:
```
[correction]   No mechanical issues found ✓
```

### Interactive preview
```
[correction] ▸ Opening interactive preview...
[correction]   Preview: http://localhost:{port}/index.html
[correction]   Waiting for user feedback...
```

When user submits feedback (log each tag as it arrives, not after):
```
[correction]   ← Tag: {nodeId} — "{feedback}"
```

When user clicks Done or Approve:
```
[correction]   User provided {count} feedback tags
```

Or if skipped:
```
[correction]   User approved — no issues tagged ✓
```

### Vision correction
```
[correction] ▸ Starting vision-assisted correction (max {N} iterations)...
[correction]   User tags: {count}, Tier 2 mechanical issues: {count}
```

Per iteration:
```
[correction]   Iteration {i}/{max}:
[correction]     Sending to vision LLM: screenshot + DOM ({domNodeCount} nodes) + spec ({specNodeCount} nodes) + {tagCount} tags
[correction]     LLM response: {patchCount} patches
[correction]     Patches:
[correction]       ✎ {nodeId}: {field1}: {oldValue} → {newValue}, {field2}: {oldValue} → {newValue}
[correction]       ✎ {nodeId}: {field1}: {oldValue} → {newValue}
[correction]     Re-rendering with patches...
[correction]     Score: {score}/100 (previous: {prevScore})
[correction]     {"Accepted ✓ — score improved" | "Reverted — score did not improve"}
```

### Continuous feedback loop (see next section)
```
[correction]   Preview refreshed with corrections
[correction]   Waiting for user feedback (round {N})...
```

### Pipeline complete
```
[correction] ▸ Pipeline complete
[correction]   Final score: {score}/100
[correction]   Total iterations: {count}
[correction]   Corrections applied: {yes/no}
[correction]   Changes from input:
[correction]     Modified nodes: {list of nodeIds}
[correction]     Added nodes: {list} (if any)
[correction]     Removed nodes: {list} (if any)
[correction]   Output: {correctedSpecPath}
[correction]   Screenshot: {screenshotPath}
[correction] ══════════════════════════════════════════════════
```

If no corrections were applied:
```
[correction] ▸ Pipeline complete — no corrections applied
[correction]   Score: {score}/100 (met threshold of {threshold})
[correction]   Spec unchanged, skipping output write
[correction] ══════════════════════════════════════════════════
```

### Implementation note

Create a small logger utility at the top of `browser-correction-pipeline.ts`:
```typescript
function log(msg: string) { console.log(`[correction] ${msg}`); }
function logSection(msg: string) { log(`▸ ${msg}`); }
function logDetail(msg: string) { log(`  ${msg}`); }
```

Use these consistently instead of raw `console.log` calls. This makes it easy to add file logging later or pipe to a structured log sink.

---

## Continuous User Feedback Loop

### Current flow (broken)
```
Preview → collect tags → CLOSE preview → vision correction → save
```

User can't see if corrections worked. User can't tag additional issues after fixes are applied.

### New flow
```
Preview opens → user tags issues → user clicks "Submit Feedback"
  → vision correction runs → preview REFRESHES with corrected render
  → user reviews → tags more issues OR clicks "Approve"
  → (loop until user approves or max iterations reached)
  → save final spec
```

### Changes needed

**1. Add "Submit Feedback" and "Approve" buttons to `preview-overlay.js`**

Replace the current "Done" and "Looks Good" buttons with:
- **"Submit Feedback"** — sends current tags, signals the pipeline to run a correction iteration, but does NOT close the preview. Disabled when no tags are pending.
- **"Approve & Close"** — signals the pipeline that the user is satisfied. Closes the preview.

The bottom toolbar should also show the current iteration count and score:
```
Round 1  |  Score: 82/100  |  [Submit Feedback]  [Approve & Close]
```

**2. Update the API endpoints in `interactive-preview.ts`**

Current endpoints:
- `POST /api/feedback` — accumulates tags
- `POST /api/done` — signals completion

New endpoints:
- `POST /api/feedback` — accumulates tags (unchanged)
- `POST /api/submit` — returns current tags, clears the tag buffer, but keeps the server running. The pipeline reads the tags, runs correction, then calls the refresh endpoint.
- `POST /api/approve` — signals final completion, server resolves the promise and shuts down
- `POST /api/refresh` — called BY the pipeline (not the user). Sends the updated spec to the preview so it re-renders. Implementation: write new spec to `data/spec.json` in the temp dir, then send an SSE event or use a polling mechanism to tell the client to reload.

**3. Change `runInteractivePreview()` return type**

Instead of returning once and closing:
```typescript
interface InteractivePreviewSession {
  waitForFeedback(): Promise<InteractivePreviewResult>;  // blocks until "Submit Feedback" or "Approve"
  refresh(spec: DesignSpecV2, score: number, round: number): Promise<void>;  // pushes updated render
  close(): Promise<void>;
}

async function openInteractivePreview(
  spec: DesignSpecV2, tokens: RendererTokens, catalog: CatalogMap,
  options?: { port?: number; openBrowser?: boolean }
): Promise<InteractivePreviewSession>;
```

`waitForFeedback()` resolves when the user clicks either button:
- "Submit Feedback" → `{ tags: [...], skipped: false, approved: false }`
- "Approve & Close" → `{ tags: [], skipped: false, approved: true }`

`refresh()` updates the rendered preview with the corrected spec and metadata.

**4. Update the pipeline orchestrator loop**

```typescript
// Open preview once, keep it alive through the correction loop
const preview = await openInteractivePreview(currentSpec, tokens, catalog);
let round = 1;

while (round <= maxIterations) {
  log(`Waiting for user feedback (round ${round})...`);
  const feedback = await preview.waitForFeedback();

  if (feedback.approved) {
    log(`User approved at round ${round} ✓`);
    break;
  }

  if (feedback.tags.length === 0) {
    log(`No tags submitted — waiting for user action`);
    continue;
  }

  log(`Received ${feedback.tags.length} tags — running vision correction...`);

  // Run vision correction with user tags
  const patches = await runVisionCorrection(session, currentSpec, provider, domLayout, feedback.tags, tier2Issues);

  // Apply patches
  applyPatches(currentSpec, patches);

  // Re-render
  const result = await session.rerender(currentSpec);
  domLayout = await session.extractDOM();

  // Update score
  const newScore = await evaluate(currentSpec, result.screenshot, domLayout);
  log(`Score: ${newScore}/100 (was ${currentScore})`);
  currentScore = newScore;

  // Refresh the preview so user sees the corrections
  await preview.refresh(currentSpec, currentScore, round + 1);

  round++;
}

await preview.close();
```

**5. Client-side refresh mechanism in `preview-overlay.js`**

After "Submit Feedback" is clicked:
- Show a loading state: "Applying corrections..." with a spinner
- Poll `GET /api/status` every 500ms until the server signals refresh is ready
- When ready, reload the page (`window.location.reload()`) — the Vite app will re-fetch `spec.json` which now contains the corrected spec
- After reload, update the toolbar with new round number and score

The polling approach is simpler than WebSocket and works reliably:
```javascript
async function waitForRefresh() {
  showLoadingOverlay("Applying corrections...");
  while (true) {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (data.refreshReady) {
      window.location.reload();
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
}
```

**6. Add `GET /api/status` endpoint to `interactive-preview.ts`**

Returns the current pipeline state:
```json
{ "round": 2, "score": 87, "refreshReady": true, "processing": false }
```

Set `refreshReady = true` after `preview.refresh()` writes the new spec. Set it back to `false` after the client reloads (detected by `POST /api/feedback` or `POST /api/submit` being called from the new page load).

---

## Implementation Order

1. Fix Bug 1 (threshold override when user tags exist)
2. Fix Bug 2 (don't write identical spec)
3. Add logging improvements to the pipeline
4. Refactor `interactive-preview.ts` → `InteractivePreviewSession` with `waitForFeedback()` / `refresh()` / `close()`
5. Update `preview-overlay.js` with Submit/Approve buttons, loading state, polling
6. Update pipeline orchestrator with continuous loop
7. Add `GET /api/status` endpoint

## Verification

1. `nx run designspec-renderer:typecheck && nx run designspec-renderer:test` — all green
2. `nx run agents-ux:typecheck && nx run agents-ux:test` — all green
3. Manual test with the Budgetly dashboard spec:
   - Run the pipeline with `interactive: true`
   - Tag at least one element, click "Submit Feedback"
   - Verify: vision correction runs, logs show patches applied, preview refreshes with updated render
   - Tag another element (or the same one if it wasn't fixed), click "Submit Feedback" again
   - Verify: second correction round runs, preview refreshes again
   - Click "Approve & Close"
   - Verify: final spec is written with actual differences from input
   - Verify: logs show the full narrative from start to finish
4. Run the pipeline with `interactive: false` (CI mode):
   - Verify: no preview opens, pipeline runs mechanical checks + vision correction without user input
   - Verify: logging still shows full narrative