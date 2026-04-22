# Flaky & Skipped E2E Tests

Last audited: 2026-04-22
Suite result: 0 failed, 132 passed, 7 skipped (141 total)

## 7 Skipped Tests in Latest Run

### 1. `onboarding-integration.spec.ts:161` — full onboarding with real LLM design options and spec generation
- **Type**: Conditional skip
- **Condition**: `RUN_E2E_INTEGRATION !== 'true'`
- **Reason**: Requires real LLM API key. Run with `RUN_E2E_INTEGRATION=true ANTHROPIC_API_KEY=sk-ant-...`
- **Action**: Intentional — this is a cost-bearing integration test, not a bug.

### 2. `onboarding-integration.spec.ts:326` — LLM-generated design options have valid structure and quality
- **Type**: Conditional skip
- **Condition**: `RUN_E2E_INTEGRATION !== 'true'`
- **Reason**: Same as #1 — requires real LLM.
- **Action**: Intentional.

### 3. `onboarding-integration.spec.ts:410` — integration tests are skipped when RUN_E2E_INTEGRATION is not set
- **Type**: Skip guard
- **Condition**: Always skips when env var not set
- **Reason**: Meta-test that verifies the skip guard itself works. Always skipped in normal runs.
- **Action**: Intentional.

### 4. `screen-types-plan-b.spec.ts:250` — design pipeline run logs spec-driven bindings, not LLM fallback
- **Type**: `test.fixme`
- **Condition**: Unconditionally skipped
- **Reason**: Not yet implemented. Part of Plan B Phase B0b — awaiting pipeline log verification for spec-driven navigation bindings.
- **Action needed**: Implement when Phase B0b pipeline logging lands. Track in Plan B.

### 5. `screen-types-plan-b.spec.ts:633` — wire design-generate to load shared-chrome.json (out of scope for B2.5)
- **Type**: `test.fixme`
- **Condition**: Unconditionally skipped
- **Reason**: Scoped out of Phase B2.5. Design generation doesn't yet load shared-chrome.json to inject chrome into generated specs.
- **Action needed**: Implement when single-screen chrome injection is prioritized.

### 6. `full-onboarding-llm.spec.ts:19` — should onboard project and generate spec with screen_type via LLM
- **Type**: Conditional skip
- **Condition**: `ANTHROPIC_API_KEY` not set
- **Reason**: Requires real LLM API key for full onboarding flow with screen_type validation.
- **Action**: Intentional — cost-bearing.

### 7. `full-onboarding-llm.spec.ts:95` — should persist screen_type and navigates_to with correct mode derivation
- **Type**: Conditional skip
- **Condition**: Depends on test #6 creating the project first
- **Reason**: Skipped because the prerequisite LLM onboarding test was skipped.
- **Action**: Intentional — runs when `ANTHROPIC_API_KEY` is set.

## Known Flaky Tests (Currently Passing but Fragile)

### `design-inspector-properties.spec.ts:287` — justify-content change reflected on iframe
- **Status**: Passes when run alone, fails intermittently in full suite
- **Root cause**: The `update-node-style` postMessage from dashboard to renderer iframe doesn't reliably apply styles. `getPropertyValue('justify-content')` returns `""` even after polling 5s. The bridge sends the message but the iframe's `document.querySelector('[data-node="nav-tabs"]')` may not find the element or the message handler doesn't process it.
- **File**: `packages/designspec-renderer/src/renderer/browser/app/src/iframe-bridge.ts:113-118`
- **Fix needed**: Debug the iframe bridge message handler — add logging to verify postMessage receipt, check if `data-node` attributes exist on rendered elements, verify cross-origin message listener is attached before spec render completes.

### `design-inspector-properties.spec.ts:397` — width change reflected on iframe
- **Status**: Same as above
- **Root cause**: Same bridge `update-node-style` issue. Setting width to `200` or `fill` via the inspector doesn't propagate to the iframe's inline styles.
- **Fix needed**: Same as above.

### `screen-types-plan-b.spec.ts:165` — fixture pages.yaml contains no duplicate user-settings drafts
- **Status**: Passes when run alone, fails when run after `design-generation.spec.ts`
- **Root cause**: The design-generation test at line 21 creates a page via `POST /api/pages` with the description that used to generate a `page-a-user-settings-*` ID. Fixed by changing the description to "E2E test page for design generation flow", but the test is still ordering-dependent because the dedup probe test at line 144 writes to the same pages.yaml file.
- **Fix needed**: The `beforeAll`/`afterAll` backup/restore in test-base.ts should be sufficient, but the fixture check test reads CURRENT state (after mutations by prior tests in the same describe block). Consider reading from the backup file, or moving the fixture assertion to a separate describe that runs before the mutation tests.

## Summary by Category

| Category | Count | Details |
|----------|-------|---------|
| Intentional (env-gated) | 4 | LLM integration tests requiring `ANTHROPIC_API_KEY` or `RUN_E2E_INTEGRATION` |
| Not yet implemented (`test.fixme`) | 2 | Plan B features awaiting implementation |
| Meta/guard test | 1 | Skip-guard validation test |
| Bridge bug (flaky) | 2 | Inspector property → iframe style propagation via postMessage |
| Test ordering (flaky) | 1 | Fixture mutation by prior tests in same describe block |
