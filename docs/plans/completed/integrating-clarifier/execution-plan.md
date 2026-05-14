# Integrating Clarifier — Execution Plan

!!! warning "SUPERSEDED by M1 Connect (2026-05-14)"

    This plan has been subsumed by **CHIP's Next Steps M1** (`docs/plans/active/chips-next-steps/m1-execution-plan.md`). All three open decisions are resolved:

    - **Q1 (PRD format):** Structured YAML in `agentforge/spec/enriched-requirement.yaml` + rendered markdown in `docs/prd.md` via `renderPrdToMarkdown()`. Both written by `createProject()`.
    - **Q2 (Auto-trigger):** Manual initiation from project page. No auto-trigger of design pipeline on approval.
    - **Q3 (Project home):** Not changed in M1. User navigates to project page after approval.

    The implementation lives in M1 Phases 5 (approval flow) and 6 (Clarifier→Design bridge). Do not implement this plan — follow M1 instead.

## Context

After the Clarifier pipeline completes on `/new`, the user sees a finalized PRD with an "Approve & Continue" button that currently does nothing (`onApprove={() => {}}`). This plan wires the approval flow: creating a project from the approved PRD, saving artifacts, and navigating the user to the new project.

Extracted from Phase 2 of `docs/plans/active/clarifier-resume-approve/execution-plan.md`. The resume bugs (Phase 1) are fixed and tested separately.

### Challenge report findings (applied)

The original Phase 2 plan was challenged against the framework's intent. Key resolutions:

1. **PRD artifact format:** Must be resolved — the original plan wrote `JSON.stringify()` to a `.md` file. Needs clarification: structured YAML in `agentforge/spec/prd.yaml` for machine consumption, or rendered markdown in `docs/prd.md` for humans, or both. Depends on what `design:generate` expects as input.
2. **Post-approval navigation:** Navigate to project home page (`/projects/{id}`), not `/design` — avoids implying the Architect stage is skipped.
3. **Governance middleware:** Direct API call is appropriate for now — this is a project creation action, not a HITL gate. The real HITL gates (questions, escalation) already use LangGraph interrupts. Add TODO for governance wrapping.
4. **Missing implementation details:** Active project setting, success toast, and error handling must be specified, not left as placeholders.

---

## Pre-implementation: Define the end-to-end flow

Before coding, answer these questions:

1. **What format does `design:generate` need?** Trace the design pipeline input to determine whether it reads from `agentforge/spec/prd.yaml`, `docs/prd.md`, or another location.
2. **Does approval auto-trigger the next pipeline stage?** Or does the user manually initiate design from the project page?
3. **What does the project home page show after creation?** "Ready to design" with a button? A status overview? Pipeline progress?

---

## Phase 1: Enhance `POST /api/projects` to accept PRD content

**File:** `packages/dashboard/src/app/api/projects/route.ts`

- Add optional `prdContent` field to the Zod request schema
- Add optional `assumptions` field (array of assumption objects)
- When `prdContent` is provided, write it to the appropriate location within the new project (path TBD per pre-implementation Q1)
- When `assumptions` is provided, write to `{projectRoot}/agentforge/spec/assumptions.yaml`
- The existing `scaffoldProject` + `createProject` flow handles directory creation and `agentforge.yaml`

## Phase 2: Implement `handleApprove` in `/new` page

**File:** `packages/dashboard/src/app/(dashboard)/new/page.tsx`

Replace `onApprove={() => {}}` with a handler that:

1. Calls `POST /api/projects` with PRD content + assumptions
2. Sets the new project as active in dashboard preferences
3. Shows a Mantine success toast (`notifications.show()`)
4. Navigates to the project home page (`/projects/{projectId}`)
5. Shows error toast on failure, re-enables button

Add `[approving, setApproving]` state for button loading.

## Phase 3: Tests

### E2E tests

**File:** `e2e/clarifier-new-project.spec.ts`

| Test | Description |
|------|-------------|
| `approve creates project and navigates to project page` | Mock `POST /api/projects` → 201, click "Approve & Continue", verify navigation to `/projects/{id}` |
| `approve shows loading state while creating` | Click button, verify disabled state during mock delay |
| `approve shows error on API failure` | Mock `POST /api/projects` → 500, verify error toast appears |

### Unit tests

**File:** `packages/dashboard/src/app/api/_lib/__tests__/project-creation-prd.test.ts` (new)

| Test | Description |
|------|-------------|
| `POST /api/projects with prdContent writes PRD file` | Send request with prdContent, verify file created on disk |
| `POST /api/projects with assumptions writes assumptions.yaml` | Send request with assumptions array, verify YAML file created |

## Phase 4: Verification

- `nx run dashboard:typecheck` — clean
- `nx run dashboard:test` — all pass
- `npx playwright test e2e/clarifier-new-project.spec.ts` — all pass including new approval tests
- Browser manual: submit prompt → answer questions → pipeline completes → click "Approve & Continue" → project created → navigated to project page

---

## Key files

| File | Change |
|------|--------|
| `packages/dashboard/src/app/api/projects/route.ts` | Accept `prdContent` + `assumptions` |
| `packages/dashboard/src/app/(dashboard)/new/page.tsx` | Wire `handleApprove` handler |
| `e2e/clarifier-new-project.spec.ts` | Add approval E2E tests |
| `packages/dashboard/src/app/api/_lib/__tests__/project-creation-prd.test.ts` | New: PRD save tests |

---

## Open decisions (ALL RESOLVED — see M1)

- [x] PRD artifact format and path → `enriched-requirement.yaml` (YAML) + `docs/prd.md` (markdown via `renderPrdToMarkdown`)
- [x] Auto-trigger vs. manual next-stage initiation → Manual from project page
- [x] Project home page content after creation → Not changed in M1
