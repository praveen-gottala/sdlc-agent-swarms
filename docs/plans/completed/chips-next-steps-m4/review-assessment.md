# M4 Execution Plan — Review Assessment

**Date:** 2026-05-17
**Reviewer:** Claude Opus 4.6 (independent review, no implementing-agent context)
**Plan reviewed:** [`m4-execution-plan.md`](m4-execution-plan.md)
**Parent plan:** [`execution-plan.md`](execution-plan.md)

---

## Review Summary

The M4 plan was reviewed in two passes:

1. **Initial review** — identified 5 moderate + 4 minor issues against the vision, ADR-057, R9/R9.4 briefs, and codebase state (10/10 file claims verified TRUE).
2. **Post-incorporation review** — verified all 9 items addressed, assessed tests, traced data flow, identified one remaining gap: **dashboard integration is missing**.

**Verdict:** Plan is architecturally sound and ready for implementation, with one enhancement needed (dashboard wiring — see §5).

---

## 1. Feedback Incorporation (9/9 Addressed)

| # | Issue | Resolution |
|---|-------|------------|
| M1 | Revision cycle orchestration | `ReviewResult.disposition` enum + bounded retry contract on caller + CLI smoke loop |
| M2 | Reviewer simplified beyond vision L9 | Deviation blockquote naming collapsed passes + trigger for splitting + Deferred table entry |
| M3 | Nx scaffolding tasks missing | Phase 1A dedicated scaffolding with `nx generate`, path mappings, "verify build" checkpoint |
| M4 | Phase 1 creates implementer prematurely | Phase 1 scaffolds both packages upfront (Option A) with rationale blockquote |
| M5 | `fixtures/deltas/` may not exist | Phase 3 task: "Verify or create delta fixture directory" with source instructions |
| m1 | Implementer tool set not enumerated | Phase 5 lists 7 v1 tools with deferred tools named |
| m2 | Token budget overflow unspecified | Phase 4: downgrade policy `structure-only` → `labels-only` → `'none'`, hard-fail if `'none'` overflows |
| m3 | Cost estimate absent | Phase 7 blockquote: ~$25 ceiling per pass, per-run capture into `cost-receipts.md` |
| m4 | EC6 phrasing ambiguous | Split into 6a (spine passes) and 6b (regression guard ±0.15 mean fidelity) |

---

## 2. Spine Wiring — No Stubs

Full data flow traced through all 7 phases:

```
Clarifier (exists) → EnrichedRequirement
  → Architect Node 0.5 (Phase 2: fills stub → real LLM + affectedScreens)
  → Architect Node 5 (Phase 4: adds mode + contextRefs for MODIFY)
  → Implementer loadTaskContext (Phase 1C/5: build-implementer-prompt + graph node)
  → Implementer runDesignSpecialist (Phase 5: calls real pipeline with Phase 3 brownfield)
  → Implementer generateCode (Phase 5: real LLM tool-loop, 7 tools)
  → Reviewer deterministicGates → llmReview → emitReviewResult (Phase 6)
  → CLI retry loop (Phase 6: disposition-driven bounded retry)
```

No stubs remain. Each phase produces working, testable output. The `ReviewResult.disposition` contract is reusable by the future orchestrator (R1) without refactoring.

---

## 3. Test Strategy Assessment

**15 tests specified: 13 KEY, 2 SUPPORTING. No unnecessary tests.**

| Category | Count | Examples |
|----------|-------|---------|
| Wiring (prompt substring assertions) | 4 | NEW → no DesignSpec; MODIFY → structure-only slice |
| Round-trip / integration | 3 | deltaApply → quality gate; RecordingProvider at graph level |
| Eval (LLM) | 3 | Architect brownfield; full spine greenfield+brownfield; regression guard |
| Deterministic gate | 2 | Missing file caught; escalation after 2 cycles |
| Instrumentation | 1 | Telemetry receives taskType/sliceStrategy/qualityProxy |
| Disposition loop | 2 | revisionNeeded → approved; 3 failures → escalate |

**Not over-tested:** No unit tests for trivial functions (`resolveDesignSliceStrategy`). No redundant tests — Phase 5 RecordingProvider test is justified as graph-level regression proof.

**Not under-tested:** All key behavioral boundaries covered. No browser E2E needed (M4 is CLI/spine, not dashboard UI — but see §5 for dashboard gap).

**One minor untested path:** `report_assumption_violation` tool propagation from Implementer to Reviewer. Acceptable for v1.

---

## 4. Verification Checkpoints

### Per-Phase Quick Reference

| Phase | Key Checkpoint | Command |
|-------|---------------|---------|
| 1A | Both packages build with empty barrels | `nx build agents-implementer && nx build agents-reviewer` |
| 1B | New schemas compile | `nx run-many -t typecheck` |
| 1C | Wiring tests pass (NEW absent, MODIFY structure-only) | `nx test agents-implementer` |
| 2 | Screen-impact algorithm passes against brownfield fixture | `nx test agents-architect` |
| 3 | Round-trip delta test passes structural quality gate | `nx test designspec-renderer` or `agents-ux` |
| 4 | Architect eval: TaskPlan has MODIFY tasks with existingDesign refs | `RUN_LLM_TESTS=true nx test eval` |
| 5 | CLI smoke: implement one task from TaskPlan YAML | `node packages/cli/dist/bin.js spine-implement-task --task <fixture>` |
| 6 | CLI smoke: Implementer → Reviewer → retry → approved/escalate | Same CLI with review loop |
| 7 | Full spine eval passes (greenfield + brownfield) | `RUN_LLM_TESTS=true scripts/run-spine-eval.ts` |
| 7 | Regression guard: ±0.15 mean fidelity | `scripts/run-design-info-eval.ts` |
| End | Test triad zero failures | `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint` |

---

## 5. Gap: Dashboard Integration

### Finding

M4 only wires the spine into CLI (`spine-implement-task.ts`). The dashboard already has infrastructure expecting Implementer and Reviewer:

- **`spine-constants.ts`** — `SPINE_STAGES` lists `implementer` and `reviewer` with `implemented: false`
- **`SpineRail`** component — visual 4-stage progress rail on the pipeline page
- **`run-manager.ts`** — `RunStatus` with stage tracking, per-stage timings
- **Clarifier API route** — established SSE streaming + checkpointer + HITL resume pattern

The parent plan's Phase 8 (battle-tested criteria) requires "Dashboard and CLI both invoke the spine (no standalone `design:page` path remains)" — meaning dashboard integration must happen before Phase 8. M4 is the natural place for it.

### Recommendation: Add Dashboard Wiring to M4

**Option A (recommended): Extend Phases 5 and 6 with API routes + spine-constants update.**

When each LangGraph package is built, also create its dashboard API route following the Clarifier pattern. Minimal scope — no new dashboard pages, just API routes + flag flip.

For Phase 5 (Implementer), add:

- `packages/dashboard/src/app/api/implementer/route.ts` — POST handler, SSE streaming, calls `compileImplementerGraph()`, emits stage events (loadTaskContext → runDesignSpecialist → generateCode → reportCompletion).
- Update `run-manager.ts` — add `'implementer'` to `RunStatus['type']` union.
- Update `spine-constants.ts` — flip `implementer.implemented` to `true`.

For Phase 6 (Reviewer), add:

- `packages/dashboard/src/app/api/reviewer/route.ts` — POST handler, calls `compileReviewerGraph()`, emits deterministic gate results + LLM review findings + disposition.
- Update `spine-constants.ts` — flip `reviewer.implemented` to `true`.
- Update `run-manager.ts` — add `'reviewer'` type.

For Phase 7 (Eval), add:

- **Dashboard smoke test:** Navigate to pipeline page, verify `SpineRail` shows all 4 stages as implemented. Take screenshot via Chrome DevTools MCP.
- This is NOT a full E2E Playwright test (no dashboard pages for triggering runs yet) — just visual verification that the spine-constants update renders correctly.

**Option B (if scope is too large): Create a Phase 7.5 for dashboard wiring.**

Separate phase between eval and end-of-plan gate. Keeps Phases 5-6 focused on the LangGraph packages and CLI. Adds ~2-3 tasks.

**Option C (if dashboard UX needs design): Defer to M4.5.**

If the Implementer/Reviewer dashboard pages need UX design (code editor view, diff viewer, review findings panel), that's M4.5 scope. But the API routes + spine-constants are mechanical and should be in M4.

### What Each Option Delivers

| Aspect | Option A (extend 5/6) | Option B (Phase 7.5) | Option C (M4.5) |
|--------|----------------------|---------------------|-----------------|
| API routes | Phase 5/6 | Phase 7.5 | M4.5 |
| spine-constants flags | Phase 5/6 | Phase 7.5 | M4.5 |
| Dashboard pages | M4.5 | M4.5 | M4.5 |
| SpineRail visual proof | Phase 7 | Phase 7.5 | M4.5 |
| Phase 8 unblocked | Yes | Yes | No (gap) |

### Decision: **Option A selected** (2026-05-17)

Extend Phases 5 and 6 with API routes + spine-constants flag flip. Dashboard pages (code editor view, diff viewer, review findings panel) deferred to M4.5. This unblocks Phase 8 battle-tested criteria.

**Tasks to add to M4 execution plan:**

Phase 5 (Implementer), append:
- [ ] Create `packages/dashboard/src/app/api/implementer/route.ts` — POST handler with SSE streaming, calls `compileImplementerGraph()`, emits stage events per node (loadTaskContext → runDesignSpecialist → generateCode → reportCompletion). Follow Clarifier route pattern (`api/clarifier/route.ts`).
- [ ] Update `packages/dashboard/src/app/api/_lib/run-manager.ts` — add `'implementer'` to `RunStatus['type']` union.
- [ ] Update `packages/dashboard/src/components/spine/spine-constants.ts` — set `implementer.implemented = true`.

Phase 6 (Reviewer), append:
- [ ] Create `packages/dashboard/src/app/api/reviewer/route.ts` — POST handler, calls `compileReviewerGraph()`, emits deterministic gate results + LLM review findings + `ReviewResult.disposition`.
- [ ] Update `run-manager.ts` — add `'reviewer'` to type union.
- [ ] Update `spine-constants.ts` — set `reviewer.implemented = true`.

Phase 7 (Eval), append:
- [ ] **Dashboard smoke:** navigate to pipeline page via Chrome DevTools MCP, verify `SpineRail` shows all 4 stages as `implemented`. Take screenshot as receipt.

---

## 6. M4 Outcome

When M4 is COMPLETE:

1. **Working end-to-end spine** — Raw idea → Clarifier → Architect → Design → Implement → Review, runnable from CLI (+ dashboard API routes if §5 adopted)
2. **Two new LangGraph packages** — `agents-implementer` (4-node graph, 7 tools) and `agents-reviewer` (3-node graph, disposition contract)
3. **Task-type-aware routing** — NEW: no design context; MODIFY: structure-only slice (ADR-057)
4. **Brownfield design deltas** — MODIFY screens emit `DesignSpecDelta`, not full-screen regen
5. **Production instrumentation** — Every Implementer LLM call logged with taskType, sliceStrategy, qualityProxy in Langfuse
6. **Regression guard** — M3.6 baseline preserved (±0.15 fidelity)
7. **Bounded revision cycle** — Reviewer → Implementer retry (≤2 cycles, then escalate)

---

## 7. Next Steps After M4

| Priority | Item | Trigger |
|----------|------|---------|
| **1** | **R10 research brief — Spine UX + competitive analysis** | M4 stable (can start during M4 Phase 7) |
| **2** | **M4.5 — Skill-derived quality gates + spine dashboard UX** | R10 complete + M4 stable |
| **3** | **Orchestrator + git worktrees (R1)** | Parallel execution needed |
| **4** | **Phase 8 — Backward compat cleanup** | Spine battle-tested |
| **5** | **M3.6 v2 eval** | Production MODIFY underperformance |
| **6** | **Cross-screen coherence (Layer 7)** | Design pipeline maturity priority |

### R10: Spine UX + Competitive Analysis (research brief)

**Scope:** How should a user experience a multi-stage agent pipeline (Clarify → Architect → Design → Implement → Review)? Compare CHIP's spine architecture and UX against competitors.

**Competitors to study:** Cursor (background agent mode), Devin (full IDE), Bolt/Lovable (streaming code gen), v0 (single-stage design), Windsurf (cascading flows), Replit Agent, GitHub Copilot Workspace.

**Questions to answer:**
1. What does the user see during each stage? (Progress, artifacts, intervention points)
2. Single page vs multi-page vs IDE workspace pattern?
3. How do competitors handle HITL gates? (Inline approval, separate review page, chat-based)
4. How is artifact accumulation shown? (PRD → architecture → design → code → review)
5. What differentiates CHIP's 4-stage spine from competitors' approaches?
6. Which UX patterns preserve the "context quality + write-coupling" invariant at the UI level?

**Output:** `docs/research/briefs/R10-spine-ux-competitive-analysis.md`
**Blocks:** M4.5 dashboard pages (not M4 API routes)

### M4.5 Expanded Scope (updated from review)

M4.5 now covers three workstreams:

1. **Skill-derived quality gates** (original sketch) — extract `/review-plan-impl`, `/mid-session-drift-check`, `/review-prd-compliance` logic into Reviewer deterministic gates. Also splits vision L9 passes 3+4.
2. **Spine dashboard pages** (new, informed by R10) — build the user-facing dashboard experience for the full spine flow. Pattern chosen based on R10 findings.
3. **Dashboard UX integration tests** — Playwright E2E tests for spine dashboard pages (mandatory per e2e-coverage.md).

---

## 8. Minimal-Test Stub Plan (`.cursor/plans/m4_full_spine_7626f4b4.plan.md`)

**Recommendation: Discard.** The file does not exist on the filesystem — it's a Cursor-internal artifact. The M4 execution plan at `docs/plans/active/chips-next-steps/m4-execution-plan.md` is comprehensive and supersedes any Cursor stub. Safe to dismiss/archive in Cursor.

---

## 9. Structural Changes Verified (from incorporation)

| Change | Verified |
|--------|----------|
| Phase 1 → three sub-phases (1A scaffold → 1B schemas → 1C context+tests) | YES — cleaner than original suggestion |
| Reviewer is 3-node v1 with documented Vision L9 deviation | YES — deviation blockquote + Deferred table |
| Revision cycle is caller contract, not Reviewer node | YES — `disposition` enum, CLI loop, R1-portable |
| M4.5 is sketched-but-not-written | YES — 6-phase sketch in Deferred section |
