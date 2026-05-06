# Clarifier Resume Fixes + Approve Flow — Execution Plan

## Status

- **Phase 1 (Resume Fixes + Tests): COMPLETE** (2026-05-02). Barrel export fix, 3 routing tests, checkpointer singleton tests, prd-draft event test. All 186+ agents-clarifier tests pass, all dashboard tests pass, full monorepo typecheck clean.
- **Phase 2 (Approve Flow): Extracted** to `docs/plans/active/integrating-clarifier/execution-plan.md`. The original Phase 2 was challenged against the framework's intent — see the new plan for resolutions.

## Context

The Clarifier pipeline on `/new` has three categories of issues discovered on 2026-05-02:

1. **Resume bugs: FIXED + TESTED.** Checkpointer singleton (`globalThis` pattern), graph routing (prdUpdater always runs with human responses), prd-draft SSE streaming for prdUpdater. Code changes + barrel export fix + unit tests all complete.
2. **E2E strict-mode fixes (DONE):** 23/23 pass.
3. **Approve button is a no-op:** `onApprove={() => {}}`. See `docs/plans/active/integrating-clarifier/execution-plan.md`.

### Root causes found

- **Checkpoint loss:** Both `/api/clarifier` and `/api/clarifier/respond` created their own `new MemorySaver()` per request. The initial request's checkpoint was garbage-collected before the resume request arrived. Fixed with `globalThis` singleton in `_lib/checkpointer.ts`.
- **prdUpdater skipped:** `routeAfterCritic` went directly to `emitComplete` when all gaps were resolved, skipping prdUpdater. The PRD was never updated with user answers. Fixed by routing to prdUpdater whenever `humanResponses.length > 0`.
- **prd-draft not streamed on resume:** The respond route only sent `prd-draft` SSE events for `prdAnalyzer`, not `prdUpdater`. Fixed by adding prdUpdater to the event emission check.
- **Duplicate approval buttons:** "Build in CHIP" in header + "Approve & Continue" at bottom — same no-op handler. Removed header button.

---

## Phase 1: Stabilize Resume Fixes + Tests

### 1.1 Fix barrel export for `routeAfterPrdUpdater`

**File:** `packages/agents-clarifier/src/index.ts`

- Add `routeAfterPrdUpdater` to the export from `./graph/index.js`
- Currently missing → causes `routeAfterPrdUpdater is not a function` in scaffold tests

### 1.2 Verify graph routing tests pass

**File:** `packages/agents-clarifier/src/__tests__/scaffold.test.ts`

3 new test cases already written this session:

- `routeAfterCritic routes to prdUpdater when all gaps resolved but human responses exist`
- `routeAfterPrdUpdater routes to gapDetector when unresolved gaps remain`
- `routeAfterPrdUpdater routes to emitComplete when all gaps resolved`

### 1.3 Unit tests for checkpointer singleton

**File:** `packages/dashboard/src/app/api/_lib/__tests__/checkpointer.test.ts` (new)

| Test | Description |
|------|-------------|
| `returns same instance on second call` | Call `getSharedCheckpointer()` twice, assert `===` |
| `stores instance on globalThis` | After call, verify `globalThis.__clarifierCheckpointer` exists |
| `falls back to MemorySaver when createCheckpointer fails` | Mock `createCheckpointer` to throw, verify MemorySaver returned |

### 1.4 Unit test for prd-draft in node-complete event

**File:** `packages/agents-clarifier/src/__tests__/run-stream.test.ts`

- Add test: `node-complete event for prdUpdater includes prdDraft in state`
- Verify the streaming path includes `event.state.prdDraft` when prdUpdater completes

### 1.5 Verification

- `nx run agents-clarifier:typecheck` — clean
- `nx run agents-clarifier:test` — all pass (182+ tests, including 3 new routing tests)
- `nx run dashboard:typecheck` — clean
- `npx playwright test e2e/clarifier-split-panel.spec.ts e2e/clarifier-new-project.spec.ts` — 23/23

---

## Phase 2: Wire "Approve & Continue" Button

### What "Approve" does

When the user clicks "Approve & Continue" on a completed PRD:

1. **Create a new project** via `POST /api/projects` with the PRD content
2. **Save the PRD** to the project's `docs/prd.md` on disk
3. **Save assumptions** to `agentforge/spec/assumptions.yaml` (if any)
4. **Set as active project** in dashboard prefs
5. **Navigate** to the Design Studio page for the new project
6. **Show success toast** confirming the project was created

### 2.1 Enhance `POST /api/projects` to accept PRD content

**File:** `packages/dashboard/src/app/api/projects/route.ts`

- Add optional `prdContent` field (stringified JSON PRD) to the request body
- When provided, write it as YAML to `{projectRoot}/docs/prd.md` after project scaffold
- Add optional `assumptions` field (array of assumption objects) → write to `{projectRoot}/agentforge/spec/assumptions.yaml`
- The existing `scaffoldProject` + `createProject` flow already handles directory creation and `agentforge.yaml`

### 2.2 Implement `handleApprove` in `/new` page

**File:** `packages/dashboard/src/app/(dashboard)/new/page.tsx`

Replace `onApprove={() => {}}` with:

```typescript
const handleApprove = useCallback(async () => {
  if (!clarifier.prdDraft) return;
  setApproving(true);
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: (clarifier.prdDraft.title as string) || 'New Project',
        prdContent: JSON.stringify(clarifier.prdDraft),
        assumptions: clarifier.assumptions?.entries,
      }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    router.push('/design');
  } catch (err) {
    // Show error in chat or toast
  } finally {
    setApproving(false);
  }
}, [clarifier.prdDraft, clarifier.assumptions, router]);
```

Pass `handleApprove` to `PrdPanel`'s `onApprove` prop. Add `[approving]` state for button loading.

### 2.3 Tests for approval flow

**E2E test:** `e2e/clarifier-new-project.spec.ts`

Add to the existing "Pipeline complete" or new "Approval flow" describe block:

| Test | Description |
|------|-------------|
| `approve creates project and navigates to design` | Mock `POST /api/projects` → 200, click "Approve & Continue", verify navigation to `/design` |
| `approve shows loading state while creating` | Click button, verify disabled state during mock delay |
| `approve shows error on API failure` | Mock `POST /api/projects` → 500, verify error message appears |

**Unit test:** `packages/dashboard/src/app/api/_lib/__tests__/project-creation-prd.test.ts` (new)

| Test | Description |
|------|-------------|
| `POST /api/projects with prdContent writes docs/prd.md` | Send request with prdContent, verify file created on disk |
| `POST /api/projects with assumptions writes assumptions.yaml` | Send request with assumptions array, verify YAML file |

### 2.4 Verification

- `nx run dashboard:typecheck` — clean
- `npx playwright test e2e/clarifier-new-project.spec.ts` — all pass including new approval tests
- Browser manual: submit prompt → answer questions → pipeline completes → click "Approve & Continue" → project created → navigated to Design Studio

---

## Key Files

| File | Change |
|------|--------|
| `packages/agents-clarifier/src/index.ts` | Export `routeAfterPrdUpdater` |
| `packages/agents-clarifier/src/graph/clarifier-graph.ts` | Already changed: conditional prdUpdater routing |
| `packages/agents-clarifier/src/__tests__/scaffold.test.ts` | 3 new routing tests (already written) |
| `packages/dashboard/src/app/api/_lib/checkpointer.ts` | Already changed: `globalThis` singleton |
| `packages/dashboard/src/app/api/_lib/__tests__/checkpointer.test.ts` | New: singleton tests |
| `packages/dashboard/src/app/api/clarifier/respond/route.ts` | Already changed: prd-draft for prdUpdater |
| `packages/dashboard/src/app/api/projects/route.ts` | Accept `prdContent` + `assumptions` |
| `packages/dashboard/src/app/(dashboard)/new/page.tsx` | Wire `handleApprove` handler |
| `packages/dashboard/src/components/clarifier/prd-panel-header.tsx` | Already cleaned up |
| `e2e/clarifier-new-project.spec.ts` | Add approval E2E tests |

---

## Implementation Order

1. **Phase 1.1** — barrel export fix (unblocks tests)
2. **Phase 1.2–1.4** — unit tests (can run in parallel)
3. **Phase 1.5–1.6** — verify E2E + full typecheck
4. **Phase 2.1** — enhance `/api/projects`
5. **Phase 2.2** — wire `handleApprove`
6. **Phase 2.3** — approval tests
7. **Phase 2.4** — browser verification
