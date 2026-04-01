## Session: March 30, 2026 (continued)

### What was built

1. **Settings page DesignSpec** — 49-node simpler test spec (designspec-settings.json) 
   with design tokens and component catalog. Exercises 6 catalog components 
   (avatar, badge-success, badge-error, button-primary, button-secondary, 
   button-destructive) and layout patterns (sidebar, form inputs, space-between rows).

2. **Mechanical validation harness** (`tools/mechanical-validation/`) — Standalone tool 
   that calls the LLM 15 times with stratified prompts (3 per check category), renders 
   each to HTML, extracts DOM via Playwright, runs the 5 mechanical checks. Mini-renderer 
   for fast runs, `--real-renderer` flag for production shadcn renderer. Harness checker 
   re-wired as thin adapter importing from production `mechanical-fixes.ts`.

3. **Phase A correction pipeline implemented** — All 6 steps from 
   purring-sauteeing-stonebraker.md executed:
   - BrowserSession (persistent Playwright)
   - DOM extraction with dataCatalog
   - Mechanical checker (5 rules, Tier 1/2 split, exported thresholds)
   - Interactive preview with continuous feedback loop
   - Vision correction adapter
   - Pipeline orchestrator
   - All verified: 257 + 295 tests passing

4. **Bug fixes applied:**
   - User feedback no longer ignored when score meets threshold
   - Identical spec no longer written as "corrected" output
   - Structured logging with [correction] prefix throughout pipeline
   - Interactive preview stays open through correction loop (Submit Feedback / Approve & Close)

5. **Renderer fixes applied:**
   - Badge label text now renders
   - data-catalog attribute on all catalog components
   - Generic style builder fixes for border-radius + overflow, explicit dimensions 
     on catalog nodes, CSS positioning support

### Threshold validation results

Full 15-case harness run confirmed:
- All 5 thresholds are correct, no changes needed
- BADGE_WIDTH_RATIO = 2.5 correctly catches 2.6x stretched badge, ignores 0.8x-1.3x compact badges
- TEXT_CLIP_TOLERANCE_PX = 2 works, no false positives
- Real renderer produces fewer violations than mini-renderer (13 vs 18) — all true positives
- Badge-oversized only fires with real renderer (mini-renderer badges use inline-flex, don't stretch)

### responseSchema decision (ADR-worthy)

Attempted 5 times to use Anthropic's structured output (`responseSchema`) for vision 
LLM correction patches. Each attempt hit the next undocumented compilation limit:
1. `additionalProperties: object` not supported
2. Enum + nullable type conflict
3. Too many union parameters (30 > 16 limit)
4. Too many optional parameters (36 > 24 limit)
5. Nested object optionals count toward global total

**Decision:** Drop responseSchema entirely. Rely on three-layer defense:
- Layer 1: System prompt with TypeScript interface, CSS blocklist, valid/invalid examples
- Layer 2: Alias map (CSS property names → DesignSpec equivalents or __strip__)
- Layer 3: Value validation (coerce "16px"→16, validate enums, strip unknowns)

Plan: humming-drifting-snowflake.md. Rationale: sparse patch format (any subset of 
30+ fields) is fundamentally incompatible with Claude's structured output compilation 
budget. Post-processing catches the same issues reliably; alias map converges within 
a few real correction runs.

**Future consideration:** Tool-use mode (one tool call per field change) could avoid 
compilation limits while keeping constrained decoding. Deferred — post-processing 
is sufficient for current stage.

### Known renderer gaps (partially addressed)

- Popover/modal centering: renderer now supports position/zIndex but centering 
  requires top/left/transform which DesignSpec vocabulary doesn't fully express
- "Push element to right edge": DesignSpec has no margin-auto concept. 
  Workaround: justify: space-between on parent. Schema includes ml/mr/mt/mb 
  but auto values need renderer support.
- Donut circle: radius + overflow:hidden fix applied but needs verification

### Files in repo

- `tools/mechanical-validation/` — harness with src/, README, package.json
- `packages/designspec-renderer/src/renderer/browser/screenshot-session.ts` — BrowserSession
- `packages/designspec-renderer/src/renderer/browser/dom-extraction.ts` — DOM extractor
- `packages/designspec-renderer/src/renderer/browser/mechanical-fixes.ts` — 5 checks + thresholds
- `packages/designspec-renderer/src/renderer/browser/interactive-preview.ts` — continuous preview
- `packages/agents-ux/src/ux-design/browser-correction-adapter.ts` — vision LLM adapter
- `packages/agents-ux/src/ux-design/browser-correction-pipeline.ts` — pipeline orchestrator
- `docs/plans/humming-drifting-snowflake.md` — responseSchema removal plan (pending execution)