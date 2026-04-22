---
name: verify-done
description: Pre-completion gate for dashboard, prototype, and renderer work. Blocks "done" claims until headed E2E, stale-Vite kill, Chrome DevTools visual verification, and (when applicable) full LLM pipeline verification are proven. Born from a session where 4 premature "done" calls cost ~4 hours.
context: inline
agent: main
---

# Verify Done

You are about to declare a task "done" that touches the dashboard, prototype, or renderer. This skill exists because of a specific failure: on 2026-04-22, four successive "done" declarations were wrong — each time typecheck + unit tests passed but the browser showed broken behavior. 7 of 8 E2E tests failed on first headed run. Stale Vite served old code for 3 debug cycles. A drawer opened as a full-page replacement because the navigation mode chain had bugs at 4 of 5 decision points, none visible without Chrome DevTools MCP.

This skill forces you to prove the work before reporting it.

## When to invoke

Fire this skill when ALL of these are true:
- The task modifies files in `packages/dashboard/`, `packages/designspec-renderer/`, `e2e/`, or `packages/agents-ux/src/prototype/`
- You are about to tell the user "done", "complete", "all tests pass", or similar

Do NOT invoke for pure doc changes, config changes, or work that doesn't touch the prototype/renderer/dashboard surface.

## Protocol

### Step 1: Kill stale Vite (always)

```bash
lsof -ti:4100 | xargs kill -9
```

Stale Vite has caused 3+ wasted debug cycles in prior sessions. The test passes but the browser shows old behavior. The dashboard auto-starts fresh Vite on next `/design` load.

If you skip this step and a test later fails with "element not found" or "expected hidden, got visible," the FIRST thing to check is whether Vite was stale.

### Step 2: Run E2E tests in headed mode

```bash
npx playwright test <your-test-file>.spec.ts --headed
```

Never report pass/fail from `--list`, headless, or typecheck alone. Headed mode is the only way to catch:
- Overlay rendering bugs (drawer opens as full page, modal doesn't center)
- Navigation wiring bugs (hotspot exists but click does nothing)
- ScreenSelectorBar badge bugs (screen type not shown)
- Spec-reload race conditions (inline style applied then immediately wiped)

If any test fails, fix it before proceeding. Do not report "7 of 8 pass" as success.

### Step 3: Visual verification via Chrome DevTools MCP

Required for: overlay/drawer/modal changes, navigation binding changes, LayoutShell/chrome changes, ScreenSelectorBar changes.

Tool sequence:
```
1. navigate_page → http://localhost:3000/design
2. take_snapshot  → find the Prototype button uid
3. click          → enter prototype mode
4. wait_for       → "Prototype Mode" or "Exit Prototype"
5. take_screenshot → verify the rendered prototype visually
6. take_snapshot  → find the element to interact with
7. click          → interact (bell icon, nav link, overlay trigger)
8. take_screenshot → verify the result (drawer slid in? modal centered? page replaced?)
```

Screenshot BEFORE and AFTER every interaction. If you can't see the change in the screenshot, the fix isn't working.

### Step 4: Full pipeline verification (conditional)

Required ONLY when changes affect design GENERATION (not just rendering):
- `screen_type` support (viewport resolver, overlay prompt)
- Chrome Pass (region derivation, frozen chrome merge, `submit_design` schema)
- `navigateTo` propagation or navigation binding logic
- `submit_design` tool schema changes

```bash
cd fixtures/claim-filling-sample
node ../../packages/cli/dist/bin.js design:page:all
```

Then verify:
- Viewport widths: `jq '.width' .agentforge/previews/bookshelf-*/scripts/designspec-v2.json`
- Shared chrome regions: `jq '.regions' agentforge/shared-chrome.json` (must be non-empty)
- Open prototype in browser and visually verify overlay behavior

Use `--design-only` (~8s) when only fixing post-LLM logic (manifest, regions). Use full run (~3min) when changing prompts or tool schemas.

**Gotcha:** After `design:generate`, pages.yaml lacks `designStatus: rendered`. Prototype button stays disabled. Add `designStatus: rendered` to each page that has a design file.

### Step 5: Produce the verification table

Before reporting "done" to the user, output this table with evidence:

```
## Verification

| Check | Status | Evidence |
|-------|--------|----------|
| Stale Vite killed | yes/no | `lsof -ti:4100` output |
| E2E headed mode | N/N pass | test file name, headed flag |
| Visual verification | yes/no | screenshot description or "not applicable" |
| Full pipeline | yes/no/n/a | viewport widths, region check, or "no generation changes" |
```

If any row is "no" or blank, you are NOT done. Fix it first.

## Anti-bleach rule

When writing the verification table or reporting results, preserve the specific failure context. Do not convert "7/8 tests failed because the prototype API doesn't discover new screens when a saved manifest exists" into "tests needed adjustment." The specificity is what helps the next agent debug the same class of issue.

## Bail-out

If the change is truly renderer-internal (e.g., refactoring a style function with no behavioral change) and all existing E2E tests pass in headed mode, steps 3-4 may be skipped. But step 2 (headed E2E) is never skippable for code under `packages/designspec-renderer/src/renderer/browser/app/`.
