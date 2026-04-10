---
paths: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/__tests__/**"]
---

# Testing Rules

- Tests MUST exercise the real server/API codepath — never call internal functions directly
- If a server endpoint is broken, do NOT work around it by testing internal methods. Flag it as a deviation
- Test names must describe the behavior, not the implementation: `should return active agents when phase is running` not `test getAgents`
- Every PRD acceptance criterion must map to at least one test
- Tests for deviations must include the ADR number in the test name: `[ADR-003] should use polling instead of websocket`
- Mock external services (LLM APIs, design tools) but never mock internal module boundaries
- Each test file must be runnable in isolation — no implicit ordering or shared state between test files
- Coverage target: 80% per module minimum

## CLI Command File-Loading Tests
- Every CLI command that reads project files from disk (PRD, design tokens, brand
  spec, YAML configs) MUST have at least one integration test that uses real
  filesystem via `mkdtempSync`. Mock-only tests are insufficient for verifying
  file-loading paths.
- Pattern: create a temp directory, write the expected files (agentforge.yaml,
  docs/prd.md, agentforge/spec/*.yaml), mock `process.cwd()` to point there,
  run the command, and assert that file contents are loaded and reported.
- See `packages/cli/src/commands/design-figma-integration.test.ts` for the
  reference implementation.

## Data Flow Coverage
- When a pipeline has multiple stages, at least one test must verify that data
  from stage N actually influences stage N+1 output. Mock-only tests that
  validate output structure but not content flow are insufficient.
- When a function is exported but has zero call sites outside its own file and
  test file, it must either be wired into the pipeline or removed. Do not leave
  "defined but unwired" code — this is how the `buildDesignSystemContextFromSpec`
  bug went undetected.
- Pipeline stage functions must include runtime input validation guards that
  warn or fail early when inputs are degenerate (e.g., prdRequirements containing
  only short labels instead of full PRD content).

## Playwright E2E Tests
- When changes touch dashboard UI, API routes, or any E2E-covered functionality,
  run `npx playwright test` from the monorepo root after unit tests pass.
- E2E tests live in `e2e/` with page objects in `e2e/pages/`.
- Playwright config (`playwright.config.ts`) only starts the Next.js dashboard
  server. The design renderer (port 4100) is auto-started by the dashboard via
  `/api/renderer/start` — do NOT add it back as a `webServer` entry.
- New dashboard pages or features that change user-visible behavior MUST have
  a corresponding E2E test. Use the existing page object pattern (e.g.,
  `DesignStudioPO`, `SidebarPO`).
- E2E test timeout is 30s per test. If a test needs the renderer iframe,
  use `waitForIframeReady()` which allows 30s for auto-start.

## Test & Fixture Placement Convention
All packages must follow this layout. No exceptions.

| What | Where | Example |
|------|-------|---------|
| Unit tests | `src/`, next to source file | `src/foo.ts` → `src/foo.test.ts` |
| Unit test fixtures | `src/__fixtures__/` | `src/__fixtures__/design-tokens.ts`, `src/__fixtures__/settings-form.json` |
| Integration tests | `__tests__/` at package root | `packages/designspec-renderer/__tests__/render-pipeline.integration.test.ts` |
| Integration fixtures | `__tests__/fixtures/` | `__tests__/fixtures/test-app-splitwise/design-tokens.yaml` |
| Generated test output | `__tests__/output/` (gitignored) | `__tests__/output/bill-entry/design.js` |

Rules:
- **Never** put integration tests in `src/` (e.g., `src/__integration__/` is wrong).
- **Never** put unit test fixtures in `__tests__/` — they belong in `src/__fixtures__/`.
- Integration tests import from the public barrel (`../src/index.js`), not
  internal modules. This verifies the package's public API surface.
- `__tests__/output/` must be in `.gitignore` and in `jest.config.cjs`
  `testPathIgnorePatterns` to prevent generated `.js` files from being
  picked up as test suites.
- App-specific fixtures (real project data like YAML configs) go in named
  subfolders under `__tests__/fixtures/` (e.g., `test-app-splitwise/`).
