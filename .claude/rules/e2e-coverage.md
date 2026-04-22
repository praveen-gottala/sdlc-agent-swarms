# E2E Test Coverage (MANDATORY)

Every dashboard feature MUST have Playwright E2E tests before declaring done.

## When to write E2E tests
- Any new dashboard page, component, or user interaction
- Any new API route that serves the dashboard
- Any change to existing dashboard behavior (regression tests)
- Any prototype, preview, or renderer integration feature

## What to test
- **State transitions**: button clicks → UI changes (labels, panels, visibility)
- **Data persistence**: user input → API call → verify file/DB was updated
- **Error states**: missing data → graceful error message (not blank screen)
- **Mode switches**: entering/exiting modes → layout restores correctly
- **Re-entry**: doing the same action twice → still works (no stale state)

## Test file location
- E2E specs go in `e2e/` at the monorepo root
- Name: `e2e/<feature>.spec.ts`
- Group related tests in a `test.describe()` block

## "Done" checklist for dashboard features
1. Unit tests for any new utility functions
2. Playwright E2E tests for every user-facing interaction
3. Run tests in **headed mode** (`npx playwright test <file> --headed`) — never declare done from `--list` or headless alone
4. Browser verification with Chrome DevTools MCP (screenshot + snapshot)
5. All existing E2E tests still pass (`npx playwright test`)

A feature without E2E tests is **incomplete work** — same as missing unit tests.

## Prototype/renderer E2E tests — extra requirements

When tests touch `DesignSpecRenderer.tsx`, `PrototypeApp.tsx`, `LayoutShell.tsx`,
`iframe-bridge.ts`, or any file under `packages/designspec-renderer/src/renderer/browser/app/`:

1. **Kill stale Vite before running.** The renderer on port 4100 may serve old code.
   ```bash
   lsof -ti:4100 | xargs kill -9
   ```
   The dashboard auto-starts a fresh Vite when `/design` loads. Tests use
   `waitForRendererReady()` to wait for it.

2. **Test the full pipeline, not just the renderer.** Fixture-based tests prove
   the renderer works. But they don't prove the LLM produces correct input.
   For features that change how design specs are generated (screen_type,
   navigateTo, Chrome Pass), also run `design:page:all` on a real fixture
   and visually verify the prototype.

3. **Visual verification is non-negotiable for overlay/navigation work.** Use
   Chrome DevTools MCP: navigate to `/design`, click Prototype, take screenshots,
   click elements, verify drawer/modal behavior. Code-only verification has
   missed 4+ bugs in overlay rendering that were immediately visible in
   screenshots.
