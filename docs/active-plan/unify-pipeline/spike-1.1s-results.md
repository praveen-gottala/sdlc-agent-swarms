# Spike 1.1s Results — Single-Shot Patch Validation

**Date:** 2026-04-25
**Provider:** Vertex AI (`claude-sonnet-4-6`)
**Fixture:** `fixtures/claim-filling-sample/agentforge/designs/dashboard.json` (274 nodes)
**Threshold:** 2/3 messages must produce valid patches

## Results

| # | Message | Result | Nodes patched | Detail |
|---|---------|--------|---------------|--------|
| 1 | "Change the header background color to blue" | **PASS** | 1 | Changed nav bar background token |
| 2 | "Add a search bar below the navigation" | **PASS** | 4 | Modified existing container nodes to accommodate search (no new node IDs needed) |
| 3 | "Make the card grid use 3 columns instead of 2" | **PASS** | 5 | Changed stats-row layout to grid with 3 columns |

**Score: 3/3** (threshold: 2/3)

## Verdict

**PASS — proceed with single-shot `FeedbackAdapter` using `reviewDesign(spec, userMessage) → DesignSpecPatch`.**

## Observations

- Message 2 ("add a search bar") was expected to fail because the patch format doesn't support node creation. The LLM worked around this by repurposing existing container nodes. This is acceptable for the feedback adapter but may produce less-than-ideal results for complex additions.
- All 3 responses validated via `DesignSpecPatchSchema.safeParse()`.
- All patches survived `sanitizePatches()` (non-empty after CSS alias mapping + validation).
- Response times: 7.5s, 10.0s, 9.1s (acceptable for interactive feedback).
- Zero hallucinated node IDs — all patch keys matched real spec node IDs.

## Implications for FeedbackAdapter

- Single-shot is sufficient for common chat messages (color changes, layout adjustments).
- Node addition is a known limitation of the patch format. Complex structural changes may need future extension (`additions` field) or full redesign.
- The `BrowserFeedbackAdapter` should use the same prompt pattern tested here: spec JSON + user message → `{ patches, reasoning }`.
