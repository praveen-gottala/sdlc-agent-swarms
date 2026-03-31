# Task: Wire Mechanical Validation Harness to Real Browser Renderer

## Context

The harness at `tools/mechanical-validation/` currently uses its own `mini-renderer.ts` — a pure CSS flexbox approximation that converts DesignSpec JSON to standalone HTML. This works for text-clipping and child-overflow checks, but **cannot reproduce the badge-oversized problem** because `inline-flex` auto-sizes badges to their text content. The real browser renderer (`packages/designspec-renderer/`) uses shadcn Badge components inside flex rows with `justify: space-between`, which DOES stretch badges — this is the exact Budgetly bug the check is designed to catch.

The goal: add a `--real-renderer` flag to the harness that uses `openBrowserSession()` from the production package instead of `mini-renderer.ts`. The mini-renderer stays as the default (fast, no build step). The real renderer is opt-in for thorough validation.

## Changes

### 1. Add renderer abstraction to `tools/mechanical-validation/src/index.ts`

Add a CLI flag:
```
--real-renderer    Use the production browser renderer (packages/designspec-renderer) 
                   instead of the mini-renderer. Slower but tests real shadcn layout.
```

Parse it alongside existing flags (`--dry-run`, `--category=`, `--runs=`):
```typescript
const USE_REAL_RENDERER = args.includes("--real-renderer");
```

### 2. Create `tools/mechanical-validation/src/real-renderer.ts` (NEW)

This file bridges between the harness's DesignSpec format and the production renderer:

```typescript
import type { DesignSpec } from "./types.js";
import type { DOMNodeData } from "./types.js";

interface RealRendererResult {
  domData: DOMNodeData[];
  screenshotPath: string;
}

async function renderWithProductionRenderer(
  spec: DesignSpec,
  screenshotPath: string,
): Promise<RealRendererResult>;
```

Implementation:
1. Import `openBrowserSession` from `@agentforge/designspec-renderer`
2. Load tokens from `packages/designspec-renderer/src/renderer/browser/app/data/tokens.json` (resolve path relative to monorepo root using `import.meta.url` or `process.cwd()`)
3. Load catalog — check how the production smoke test loads it and follow the same pattern
4. Convert harness `DesignSpec` to production `DesignSpecV2` format:
   - The harness format has `{ screen, width, nodes: Record<string, DesignSpecNode> }` 
   - The production format may differ — check `packages/designspec-renderer/src/types/` for `DesignSpecV2`
   - Write a `convertToV2()` function that maps between them
   - If the formats are identical, just cast
5. Call `openBrowserSession(specV2, tokens, catalog)`
6. Call `session.extractDOM()` — this returns production `DOMLayoutData`
7. Convert production `DOMLayoutData` back to harness `DOMNodeData[]` format for the checker
8. Save screenshot from session result
9. Call `session.close()`
10. Return `{ domData, screenshotPath }`

The key difference from the mini-renderer path: the real renderer renders actual shadcn Badge/Button/Avatar components, so `space-between` rows will stretch badges to fill available space — exactly what the badge-oversized check needs to detect.

### 3. Modify the render step in `tools/mechanical-validation/src/index.ts`

In the main loop, after validation succeeds, replace the render step with a conditional:

```typescript
if (USE_REAL_RENDERER) {
  console.log("     → Rendering with production renderer...");
  const { domData: realDom, screenshotPath: realScreenshot } = 
    await renderWithProductionRenderer(spec, screenshotPath);
  domData = realDom;
  // Screenshot already saved by the production renderer
} else {
  // Existing mini-renderer + Playwright path
  console.log("     → Rendering with mini-renderer...");
  const html = renderToHtml(spec);
  await writeFile(htmlPath, html);
  const extraction = await extractDOM(htmlPath, screenshotPath, spec.width);
  domData = extraction.domData;
}
```

When using `--real-renderer`, the harness does NOT need its own Playwright browser or `dom-extractor.ts` — the production `BrowserSession` handles both rendering and DOM extraction internally.

### 4. Handle the browser lifecycle

With the mini-renderer, the harness manages its own Playwright browser (`launchBrowser()` / `closeBrowser()`). With `--real-renderer`, each test case opens and closes its own `BrowserSession`.

Option A (simpler): Open/close a session per test case. Slower (~2s per case) but no shared state.
Option B (faster): Keep a single session open and call `rerender()` between cases. But `rerender()` expects the same tokens/catalog — which is fine since all harness cases use the same Budgetly tokens.

Go with Option A first. If it's too slow, optimize later.

When `USE_REAL_RENDERER` is true, skip `launchBrowser()` and `closeBrowser()` calls entirely — those are for the mini-renderer's Playwright instance.

### 5. Update README.md

Add to the Usage section:

```bash
# Use the real shadcn browser renderer (slower, catches badge-oversized)
npx tsx src/index.ts --real-renderer

# Combine with category filter
npx tsx src/index.ts --real-renderer --category=badge-oversized --runs=3
```

Add a note explaining when to use each mode:
- Default (mini-renderer): Fast, good for text-clipping and child-overflow. Use for routine threshold calibration.
- `--real-renderer`: Slow (~2s/case), required for badge-oversized validation. Use when tuning badge/chip checks or after changing catalog renderers.

## What NOT to change

- Do NOT modify `mini-renderer.ts`, `dom-extractor.ts`, or `checker.ts` — they stay as-is
- Do NOT change any threshold constants or check logic
- Do NOT change the prompt definitions in `prompts.ts`
- Do NOT remove the mini-renderer path — it must remain the default

## Verification

1. `cd tools/mechanical-validation && npx tsc --noEmit` — zero type errors
2. `npx tsx src/index.ts --dry-run` — still works (no renderer used in dry run)
3. `npx tsx src/index.ts --category=badge-oversized --runs=1` — runs with mini-renderer (default), badge-01 should produce 0 badge-oversized violations (same as before)
4. `npx tsx src/index.ts --real-renderer --category=badge-oversized --runs=1` — runs with production renderer, check if badge-oversized violations now appear for badges in space-between rows
5. `npx tsx src/index.ts --real-renderer --runs=1` — full 5-category run with production renderer, compare violation counts against the mini-renderer baseline

Report the detection matrix for the `--real-renderer` run so we can compare against the mini-renderer results we already have./