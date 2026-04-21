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
3. Browser verification with Chrome DevTools MCP (screenshot + snapshot)
4. All existing E2E tests still pass (`npx playwright test`)

A feature without E2E tests is **incomplete work** — same as missing unit tests.
