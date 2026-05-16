# R9 Brownfield Design Delta — Verification Review

**Reviewed:** `docs/research/briefs/R9-brownfield-design-delta.md` (664 lines, post-correction)
**Date:** 2026-05-15
**Method:** Fresh-context subagent read each cited file/line in the live repo. No implementation context inherited.

---

## Section A — Verification Findings

| # | Citation | File:Line | Verdict | Notes |
|---|----------|-----------|---------|-------|
| 1 | `ChangeClassificationSchema` — 6-field Zod object | `cross-boundary-artifacts.schemas.ts:168-175` | **Accurate** | All fields and constraints match verbatim. |
| 2 | `ScopeAxisSchema` — 5 enum values (`ui`, `component`, `design-system`, `api`, `data-model`) | `cross-boundary-artifacts.schemas.ts:19-25` | **Accurate** | Exact values in exact order. |
| 3 | `DesignSpecV2` — 5-field interface | `design-spec-v2.ts:116-127` | **Accurate** | Fields and JSDoc match verbatim. |
| 4 | `NodeSpec` — "19 of 24 optional fields" | `design-spec-v2.ts:54-110` | **Accurate** | File's own comment at lines 48-52 confirms the budget count. Manual count of optional fields yields 19. |
| 5 | `ContextRefKindSchema` — 5 enum values | `architect.schemas.ts:132-138` | **Accurate** | |
| 6 | `TaskNodeSchema` — fields including `mode`, `contextRefs`, `estimatedTokenBudget` | `architect.schemas.ts:168-181` | **Accurate** | `estimatedTokenBudget` confirmed as `.max(120_000)`. |
| 7 | `sliceContractBundle()` — signature and 5-kind routing | `context-slicer.ts:47-124` | **Accurate** | Switch cases at lines 63-78 match all 5 kinds. |
| 8 | `readDesignSpec(projectRoot, pageId)` | `design-spec-store.ts:38` | **Accurate** | Corrected during review. Originally omitted `projectRoot` parameter — now shows full two-parameter form. |
| 9 | `designNode` — exported, produces DesignSpecV2 | `nodes.ts:80` | **Editorial-addition** | Actually returns `Result<Partial<DesignPhaseState>>`. The DesignSpecV2 is nested at `state.design.spec`. The brief's claim is directionally correct but simplified. M4 implementers must note that the interception point for delta-aware dispatch is inside `browserDesignWork` or the penpot design call path, not at `designNode`'s return boundary. |
| 10 | `applyFrozenChromeToPageSpec()` | `merge-frozen-chrome.ts:114-134` | **Accurate** | Signature: `(pageSpec: DesignSpecV2, frozen: DesignSpecV2, pageId: string): DesignSpecV2`. |
| 11 | Node 0.5 placeholder with TODO | `change-classifier.ts:26-31` | **Accurate** | TODO comment and `return { existingFiles }` confirmed. |
| 12 | Dashboard DesignSpec: 159 nodes | `fixtures/personal-expense-tracker/agentforge/designs/dashboard.json` | **Accurate** | Grep count of `"parent":` = 159. |
| 13 | add-expense: 157 nodes | Same path, `add-expense.json` | **Accurate** | |
| 14 | confirm-delete: 22 nodes | Same path, `confirm-delete.json` | **Accurate** | |
| 15 | `docs/design-decisions.md` parallel-writer rejection; `docs/vision.md` single-writer rule | Both files | **Accurate** | Corrected during review. Original cited `docs/lessons-learned-rules.md` which does NOT contain the single-writer rule — changed to `docs/vision.md` Layer 3. |

**Summary:** 13 Accurate, 1 Editorial-addition, 2 Drift (both corrected in-place before this review was finalized).

---

## Section B — Suggested Edits

### B1. `designNode` return type (claim 9) — informational note

The brief says `designNode` "emits a single delta." This is editorial shorthand — `designNode` returns `Result<Partial<DesignPhaseState>>` and the DesignSpecV2 lives at `state.design.spec`. For M4 implementation, the delta-aware dispatch point is inside the design work function (e.g., `browserDesignWork` or `penpotDesignWorkV2`), not at the `designNode` return boundary.

**Suggested action:** No edit to the brief needed — the editorial simplification is appropriate for a research document. M4's execution plan should note the actual interception point.

### B2. Mermaid diagram `readDesignSpec()` label (claim 8)

The mermaid diagram in §2 shows `readDesignSpec()` without parameters in the flowchart node label. Mermaid node labels are inherently abbreviated — this is acceptable given the corrected prose text now shows the full signature.

**Suggested action:** No edit needed.

---

## Section C — M4 Implementation Implications

### C1. Delta dispatch interception point

The brief's design for `submit_design_delta` assumes a new tool added to the design specialist prompt. The actual wiring must intercept inside `browserDesignWork` or `penpotDesignWorkV2` within `designNode`, not at the node's return boundary. M4 should:

1. Add an `existingDesignSpec?: DesignSpecV2` field to `PenpotDesignInput` (the brief proposes this but doesn't specify the exact interface location).
2. Inside the design work function, check if `existingDesignSpec` is present. If yes, load the delta-aware system prompt and offer `submit_design_delta` tool. If no, use the existing `submit_design` flow.
3. After receiving the delta, call `deltaApply(existingSpec, delta)` and set the result as `state.design.spec`.

### C2. Screen name matching (impact analysis)

The brief's comparison algorithm (§2) relies on matching semantic screen names from the Clarifier output (e.g., "Dashboard — Upcoming Recurring Card") to existing file-based page IDs (e.g., `dashboard`). The matching logic needs `pages.yaml` as the authoritative mapping. If `pages.yaml` is absent or stale, the algorithm should fall back to normalized name substring matching with a confidence penalty.

### C3. Token budget validation

The measured token budget (~25-35K for a MODIFY dashboard task against a 76K ceiling) leaves substantial headroom. M4 can ship with `sliceStrategy: 'full'` and let M3.6 determine whether narrowing is warranted. No M4 work is blocked by M3.6's findings.
