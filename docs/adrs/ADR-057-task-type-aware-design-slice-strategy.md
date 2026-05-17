# ADR-057: Task-Type-Aware DesignSliceStrategy Default

**Status:** Accepted
**Date:** 2026-05-17
**Supersedes:** None (refines R9.3 provisional default of `'full'`)
**Related:** ADR-038 (TypeScript as contract truth), ADR-056 (Architect package boundary), R9 brownfield brief, R9.4 design-info value eval (M3.6)

## Context

The Implementer must decide how much design-stage context to include when generating
frontend code. R9.3 (`docs/research/briefs/R9-brownfield-design-delta.md`) proposed
slice-aware wiring via a `DesignSliceStrategy` enum (`'full' | 'labels-only' |
`'structure-only'`) with a conservative M4 default of `'full'` until empirical measurement
completed.

M3.6 (Design Info Value Eval) ran 90 cells: five context configurations × six tasks
(3 NEW, 3 MODIFY) × three repetitions. Scoring used a single-blind LLM reviewer on a
0–3 fidelity scale. Full results: `docs/research/briefs/R9_4-design-info-value-eval.md`.

**Key measurements:**

| Task type | Best config | Mean fidelity | Mean input tokens |
|-----------|-------------|--------------:|------------------:|
| NEW | A (baseline — no design context) | 1.89 | 720 |
| NEW | B–E (any design context) | 1.33 | 5,103–16,000 |
| MODIFY | C or E (full or structure-only) | 2.56 | 17,424–31,245 |
| MODIFY | A (baseline) | 2.22 | 772 |

Structure-only (`extractStructure()` in `packages/agents-architect/src/design-slice/index.ts`)
matches full DesignSpec fidelity for MODIFY at 44% lower token cost. Labels-only
underperforms for MODIFY (2.22 vs 2.56). Design context uniformly hurts NEW tasks.

Vision Layer 8 and R9 specify that MODIFY frontend tasks receive existing design state
(`existingDesignSpec + deltaTree`). M3.6 refines *how much* of that state enters the
implementer prompt — not whether brownfield tasks get design signal at all.

**Confidence: MEDIUM.** Direction is clear; effect sizes are modest on a 0–3 scale;
fixture set is six CashPulse tasks on Sonnet 4.6 only.

## Decision

**Adopt task-type-aware `DesignSliceStrategy` routing in the M4 Implementer:**

```typescript
const sliceStrategy: DesignSliceStrategy =
  task.mode === 'MODIFY' ? 'structure-only' : 'none';
```

| Task mode | Strategy | What enters the implementer prompt |
|-----------|----------|-----------------------------------|
| `NEW` | `'none'` | Task description + ContractBundle slice only. No ScreenPlan, ComponentComposition, or DesignSpec. |
| `MODIFY` | `'structure-only'` | Above + `extractStructure(existingDesignSpec)` (parent/order/type/catalog per node). |

**Enum extension:** Add `'none'` to `DesignSliceStrategy`:

`'none' | 'full' | 'labels-only' | 'structure-only'`

**Do not use `'labels-only'` as a default** for any task type. M3.6 showed it loses
structural information critical for MODIFY placement while adding tokens without benefit.

**Pre-registered decision rule (M3.6 execution plan):** If labels-only underperforms
full by >0.3 on MODIFY, prefer full; if structure-only matches full, prefer cheaper.
Both conditions fired → structure-only for MODIFY, none for NEW.

## Consequences

### Positive

- MODIFY implementer prompts save ~14K input tokens vs full DesignSpec (mean 17.4K vs 31.2K)
  with equivalent measured fidelity.
- NEW implementer prompts avoid 10K–23K tokens of design context that measurably reduced quality.
- Slice functions already exist in production code; M4 wires routing, not new algorithms.

### M4 implementation requirements

1. Define `DesignSliceStrategy` in `packages/core/src/types/architect.schemas.ts` (Zod enum).
2. Extend `ContextRefKindSchema` with `existingDesign` and `designDelta` per R9.3.
3. Branch Implementer context assembly on `task.mode` per the table above.
4. **Tests:** NEW task → assert design-spec absent from prompt; MODIFY task → assert
   structure-only slice present. Prevents silent regression to a single global default.
5. **Brownfield design specialist:** MODIFY eval assumed hand-crafted deltas; pipeline must
   emit `DesignSpecDelta` in production (R9, R10).
6. **Instrumentation:** Log `task.mode`, `sliceStrategy`, and quality proxy per invocation
   for post-launch validation.

### Negative / risks

- Findings may not generalize beyond CashPulse-style personal-finance UIs.
- Trivial MODIFY tasks (+6 nodes) scored higher without design context in one fixture;
  structure-only default may over-instrument simple changes (mitigate via instrumentation).
- Larger MODIFY tasks (section replacement, layout restructure) were not probed; may need
  `'full'` — revisit if production telemetry shows MODIFY underperformance.

### What would change this decision

- Larger multi-domain eval shows design context improves NEW fidelity above baseline →
  consider `'structure-only'` for NEW as well.
- Production MODIFY failure rate exceeds NEW → upgrade MODIFY default to `'full'` or add
  complexity-based routing (delta size threshold).
- Human reviewer calibration contradicts LLM reviewer on NEW-task regression → re-run
  matrix with human scoring before shipping `'none'`.

## References

- M3.6 eval brief: `docs/research/briefs/R9_4-design-info-value-eval.md` (§5 Recommendation, §9 Follow-throughs)
- Backstage guide: `docs/guides/design-info-value-eval.md`
- Regression scenario: `packages/eval/src/scenarios/design-info-value.yaml`
- R9.3 slice wiring: `docs/research/briefs/R9-brownfield-design-delta.md` §4, §6.4
- Slice functions: `packages/agents-architect/src/design-slice/index.ts`
