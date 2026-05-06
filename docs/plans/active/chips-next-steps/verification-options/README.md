# Verification Options for Architect-Codebase-Grounded Design Overhaul

Three approaches to improve accuracy and implement incrementally. Each catches different error types. Best results come from combining them.

## Quick Comparison

| | Option 1: Real Clarifier Run | Option 2: Bottom-Up PRs | Option 3: Challenge-Then-Write |
|---|---|---|---|
| **Catches** | Data errors (does the LLM actually produce this?) | Citation errors (does this schema have this field?) | Reasoning errors (does this conclusion follow?) |
| **Effort** | ~1 day | 2-3 days (4 PRs) | 2-3 days (adds ~1.5 hrs per risky section) |
| **Risk reduction** | High for scenarios | Medium across all sections | Highest for code sketches + brownfield |
| **When to use** | Scenarios will be acceptance criteria | Want incremental delivery | Document is authoritative source for implementation |
| **Prerequisite** | API keys + Clarifier working | None | None |

## Error Types Each Option Catches

```
                    Option 1        Option 2        Option 3
                    (Real Data)     (Grep+Type)     (Blind Review)
                    ───────────     ───────────     ─────────────
Data errors          ████████         ██               ██
Citation errors         ██           ████████          ████
Logical gaps            ██              ██           ████████
Code sketch bugs        ──              ████         ████████
Side-effect risks       ──              ──           ████████
```

## Recommended Combination

For maximum accuracy with reasonable effort:

1. **PR 1** — Structural fixes (Option 2, no verification needed beyond `mkdocs build`)
2. **PR 2** — Analysis sections (Option 2 mechanical grep + Option 3 challenge on prompt overlap matrix)
3. **PR 3** — Scenarios + recommendations (Option 1 real Clarifier run + Option 3 challenge on brownfield + code sketches)
4. **PR 4** — TL;DR + polish (Option 2, quick)

Total: 3-4 days. Produces a document where every claim is either mechanically verified, challenged by a blind reviewer, or validated against real pipeline output.

## Files

- [Option 1: Validate with Real Clarifier](option-1-validate-with-real-clarifier.md) — run the actual Clarifier, diff output against scenario claims
- [Option 2: Bottom-Up Incremental PRs](option-2-bottom-up-incremental-prs.md) — 4 small PRs, each independently verifiable
- [Option 3: Challenge-Then-Write](option-3-challenge-then-write.md) — blind reviewer agent per risky section, fix before commit
