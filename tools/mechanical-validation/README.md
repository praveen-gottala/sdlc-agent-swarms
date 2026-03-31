# Mechanical Validation Harness

Standalone test harness for the DesignSpec mechanical layout checker. Uses an LLM (Claude Sonnet) to generate **unpredictable** DesignSpec JSON fragments biased toward specific layout stress zones, renders them in a headless browser, extracts computed DOM data, and runs the 5 mechanical checks against real layout behavior.

## Why LLM-Generated Test Cases?

Static/deterministic test cases only validate what you already thought of. LLM-generated fragments surface failure modes in both the renderer and the checker that you'd never write by hand. The **generation LLM is intentionally a different instance** from the LLM that wrote this code — they share the same biases if they're the same call.

## Architecture

```
                         ┌──────────────────────┐
  prompts.ts             │  Anthropic API        │
  (15 stratified ──────► │  (Claude Sonnet)      │
   prompts)              │  Generates DesignSpec │
                         └──────────┬───────────┘
                                    │ JSON
                         ┌──────────▼───────────┐
  generator.ts           │  Schema Validator     │
                         │  (parent refs, types, │
                         │   catalog, ordering)  │
                         └──────────┬───────────┘
                                    │ valid DesignSpec
                         ┌──────────▼───────────┐
  mini-renderer.ts       │  HTML Generator       │
                         │  (CSS flexbox, token  │
                         │   resolution, catalog │
                         │   approximation)      │
                         └──────────┬───────────┘
                                    │ .html file
                         ┌──────────▼───────────┐
  dom-extractor.ts       │  Playwright           │
                         │  getBoundingClientRect│
                         │  getComputedStyle     │
                         │  screenshot           │
                         └──────────┬───────────┘
                                    │ DOMNodeData[]
                         ┌──────────▼───────────┐
  checker.ts             │  5 Mechanical Checks  │
                         │  overlap, overflow,   │
                         │  collapse, clipping,  │
                         │  badge sizing         │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
  index.ts               │  Reporter             │
                         │  summary.json +       │
                         │  per-case artifacts   │
                         └──────────────────────┘
```

## Setup

```bash
cd tools/mechanical-validation
npm install
npx playwright install chromium
```

Requires `ANTHROPIC_API_KEY` environment variable.

## Usage

```bash
# Full run — 15 test cases (3 per category × 5 categories)
npm start

# Dry run — shows what would be generated, no LLM calls
npm run start:dry

# Single category
npx tsx src/index.ts --category=sibling-overlap

# Custom runs per category
npx tsx src/index.ts --runs=5

# Combined
npx tsx src/index.ts --category=text-clipping --runs=5
```

## Prompt Categories

| Category | Bias Direction | Target Check |
|---|---|---|
| `sibling-overlap` | Dense row layouts, tight gaps, fixed widths | Sibling bounding rects intersect |
| `child-overflow` | Child wider than parent, cumulative padding | Child rect extends past parent |
| `text-clipping` | Long text in narrow containers | scrollWidth > clientWidth |
| `badge-oversized` | Badges with long labels in space-between rows | Badge width > 2.5× text width |
| `zero-collapse` | Empty containers, whitespace-only text | Node height ≤ 1px with content |

Each category has 3 prompt variants that push the LLM toward the stress zone **without telling it to create the bug**. The LLM decides dimensions, gaps, and content — so you get unpredictable variations that may or may not trigger the check.

## Output

Each run produces a timestamped directory:

```
output/
  run-2026-03-30T14-30-00/
    summary.json              # Aggregated results + detection matrix
    overlap-01/
      raw-output.txt          # Raw LLM response
      input.json              # Validated DesignSpec JSON
      rendered.html           # Generated HTML (openable in browser)
      screenshot.png          # Playwright screenshot
      dom-data.json           # Extracted DOMNodeData[]
      violations.json         # Checker findings
    overlap-02/
      ...
```

### summary.json

```json
{
  "runId": "run-2026-03-30T14-30-00",
  "totalCases": 15,
  "generated": 14,
  "valid": 13,
  "rendered": 13,
  "violationsByCategory": {
    "sibling-overlap": 4,
    "child-overflow": 2,
    "zero-collapse": 6,
    "text-clipping": 3,
    "badge-oversized": 1
  },
  "cases": [...]
}
```

### Detection Matrix

The summary includes a **detection matrix** showing whether each prompt category triggered its target check:

```
  Detection matrix:
    sibling-overlap    target: 2/3   any: 3/3
    child-overflow     target: 1/3   any: 2/3
    text-clipping      target: 3/3   any: 3/3
    badge-oversized    target: 0/3   any: 1/3
    zero-collapse      target: 2/3   any: 3/3
```

- **target** = the category's own check fired (overlap prompt → overlap violation)
- **any** = any check fired (overlap prompt → might also trigger overflow)

A low target rate means either the prompt isn't biased enough, or the check threshold is wrong. A high "any" rate with low "target" rate means the prompt creates issues — just not the ones you expected.

## Checker Thresholds

Current thresholds in `checker.ts` — the primary output of running this harness is discovering whether these are right:

| Threshold | Value | What It Means |
|---|---|---|
| `OVERLAP_THRESHOLD_PX` | 2px | Ignore sub-pixel overlap from rounding |
| `OVERFLOW_THRESHOLD_PX` | 2px | Ignore sub-pixel overflow |
| `COLLAPSE_HEIGHT_PX` | 1px | Below this = collapsed |
| `BADGE_WIDTH_RATIO` | 2.5× | Badge width / estimated text width |
| `TEXT_CLIP_TOLERANCE_PX` | 2px | scrollWidth - clientWidth tolerance |

## Interpreting Results

After a run, review the screenshots alongside violations.json for each case:

1. **True positive**: Checker fires, screenshot confirms the issue. Good.
2. **False positive**: Checker fires, screenshot looks fine. Threshold too aggressive.
3. **False negative**: Screenshot shows an issue, checker didn't fire. Threshold too lenient or missing check.
4. **True negative**: No issue in screenshot, no violation. Good.

Track these across runs to tune thresholds and identify missing checks.

## Connecting to the Real Renderer

This harness uses a **mini-renderer** (pure CSS flexbox, catalog components approximated as styled divs). Once validated, the mechanical checker can be wired into the real browser renderer pipeline:

1. Replace `mini-renderer.ts` calls with the Vite+React+shadcn renderer at `packages/designspec-renderer/src/renderer/browser/app/`
2. DOM extraction code (`dom-extractor.ts`) works unchanged — it queries `[data-node]` attributes which both renderers produce
3. Checker code (`checker.ts`) works unchanged — it operates on `DOMNodeData[]` regardless of source

## Cost

~$0.05 total for 15 LLM generation calls (Sonnet, ~500 tokens each). Playwright renders are local/free.
