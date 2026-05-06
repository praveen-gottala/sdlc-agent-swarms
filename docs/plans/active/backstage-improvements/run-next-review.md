# Backstage Improvements — Execution Prompts

Copy the next unchecked prompt into a new Claude Code session. Each is self-contained.
After completion, mark it `[x]` here and move to the next.

---

## Phase 1: Execute existing child plans (dependency order)

The order below follows the execution-plan.md dependency chain (D1-D14).

### Step 1 — Plan 3: Research Report

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/research-report-review.md (child plan 3). This is the first plan to execute — it fixes source material that downstream concept pages cite and quote.

Apply all fixes from the findings table. Pay attention to cross-plan decision D4 (brand rename cascade to clarifier-pipeline.md line 15).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan (docs/plans/active/backstage-improvements/execution-plan.md) child plan table status
3. Update CLAUDE.md plan #8 (Backstage Improvements) status line
```

---

### Step 2 — Plan 6: Architecture

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/architecture-review.md (child plan 6). This rewrites the system architecture page from stale 5-phase model to 4-stage spine.

Apply all fixes from the findings table. Pay attention to cross-plan decisions D7 (scope boundary with spine-implementation.md), D8 (downstream consumers — dashboard.md citations).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 3 — Plan 4: Clarifier Pipeline

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/clarifier-pipeline-review.md (child plan 4). This fixes the canonical Clarifier page — node count, structure, stale limitations.

Apply all fixes from the findings table. Pay attention to cross-plan decisions D2 (Clarifier detail ownership), D3 (stale "6 nodes" — fix canonical page + downstream reference in clarifier-question-generation.md line 179), D4 (brand fix at line 15 should already be done by Plan 3).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 4 — Plan 5: Coordination & State

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/coordination-state-review.md (child plan 5). This rewrites the opener, replaces the Clarifier topology diagram with a generic channels pattern, and fixes jargon.

Apply all fixes from the findings table. Pay attention to cross-plan decisions D6 (Plan 5 owns all changes to this file — Plan 1 no longer touches it), D3 (fix Components table "8 nodes" → "9 nodes"), D13 (content boundary with state-persistence.md).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 5 — Plan 10: State Persistence

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/state-persistence-review.md (child plan 10). This adds missing template sections, fixes incorrect citation, defines jargon, and adds spine context.

Apply all fixes from the findings table. Pay attention to cross-plan decision D13 (content boundary with coordination-and-state.md — physical view here, logical view there).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 6 — Plan 11: Observability

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/observability-review.md (child plan 11). This fixes wrong env var (LANGFUSE_HOST → LANGFUSE_BASE_URL), adds template sections, and fixes diagram labels.

Apply all fixes from the findings table. Pay attention to cross-plan decision D1 (spine diagram colors — status-encoding fills are exempt).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 7 — Plan 2: Agent Taxonomy

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/agent-taxonomy-review.md (child plan 2). This fixes stale node count (6→9), removes phantom predecessor framing, and fixes aspirational tense.

Apply all fixes from the findings table. Pay attention to cross-plan decisions D2 (Clarifier detail — keep summary paragraph, link to clarifier-pipeline.md for node-level detail), D3 (node count — canonical list now fixed in Plan 4).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 8 — Plan 7: SDLC Agents Spec

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/sdlc-agents-review.md (child plan 7). This fixes the internal contradiction (5 parallel agents vs single-threaded mandate), stale brand, and aspirational tense.

Apply all fixes from the findings table. Pay attention to cross-plan decisions D8 (verify architecture.md citations after Plan 6 rewrite), D9 (preserve Section 11 phase structure — fix factual errors within phases, do NOT restructure headings).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 9 — Plan 8: HITL Governance

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/hitl-governance-review.md (child plan 8). This rewrites the opener for non-engineer readers, replaces the spine-replica diagram with a gate-focused diagram, and consolidates LangGraph details.

Apply all fixes from the findings table. Pay attention to cross-plan decisions D10 (HITL content ownership — concept level here, implementation level in spine-impl §9), D11 (Plan 8 owns all hitl-governance diagram work — previously scoped in Plan 1 Step 2).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 10 — Plan 9: Design Pipeline

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/design-pipeline-review.md (child plan 9). This restructures the opener (purpose before function refs), adds spine integration context, and updates the Three-Layer diagram.

Apply all fixes from the findings table. Pay attention to cross-plan decision D12 (design pipeline concept/integration scope boundary — concept level here, integration level in spine-impl §4).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 11 — Plan 1: Concepts Overview

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/concepts-overview-review.md (child plan 1). This restructures and slims the overview page. Depends on Plans 2-11 being complete.

Apply all fixes from the findings table. Pay attention to cross-plan decisions D2 (Clarifier detail — 1-2 sentences + link only), D6 (Plan 1 no longer touches coordination-and-state.md — handled by Plan 5), D11 (hitl-governance diagram handled by Plan 8 — verify it looks correct). Verify that links to pages fixed by Plans 2-11 are accurate.

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 12 — Plan 1 Part 2: Cross-Section De-duplication

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/concepts-overview-review.md (child plan 1, Part 2 section). This handles remaining cross-section de-duplication.

Apply remaining cross-section fixes. The hitl-governance diagram and coordination-and-state.md work are already handled (D11, D6). Focus on any remaining diagram or content duplication across concept pages.

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 13 — Plan 13: Dashboard Architecture

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/dashboard-architecture-review.md (child plan 13). This fixes stale API route count, misleading diagram arrows, redundant section, and sidebar label.

Apply all fixes from the findings table. Self-contained fixes — no hard dependencies.

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 14 — Plan 14: Clarifier Question Generation

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/clarifier-question-generation-review.md (child plan 14). This fixes the fabricated blockquote, grounds jargon, removes defensive framing, and adds missing template sections.

Apply all fixes from the findings table. Verify D3 node count fix at line 179 (should already be done by Plan 4 step 10).

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 15 — Plan 15: Vision Overview

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/vision-overview-review.md (child plan 15). This relocates the Single Invariant section, removes banned test counts, and eliminates locked decisions table duplication.

Apply all fixes from the findings table. Self-contained fixes — no hard dependencies.

After applying fixes:
1. Spot-check that all cited file paths and anchor links exist
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

### Step 16 — Plan 16: Architecture README

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/architecture-readme-review.md (child plan 16). This rewrites the section landing page with CHIP-specific opener, reading path, and nav position promotion (D14).

Apply all fixes from the findings table. Pay attention to D14 (README.md promoted to nav position 1 — update mkdocs.yml Architecture section order).

After applying fixes:
1. Verify mkdocs.yml Architecture section nav order is updated per D14
2. Update the child plan status to "Complete" and update the master plan child plan table
3. Update CLAUDE.md plan #8 status line
```

---

## Phase 2: Review remaining docs

After all 16 child plans above are complete, use this prompt to process the next pending file from batches 4-12:

- [ ] Copy this prompt:

```
Read docs/plans/active/backstage-improvements/pending-files-to-review.md. Find the first entry with "[ ] Planned" status. Extract the file path and issue description for that entry.

Run /backstage review on that file.

After the review is complete, follow the "After the review is complete:" instructions from that entry's prompt block — create the child plan (if 3+ findings), check conflicts against existing child plans and cross-plan decisions (D1-D14+), update the master plan table and CLAUDE.md plan #8 status. Mark the entry as "[x] Done" in pending-files-to-review.md.

Don't execute the child plan fixes — planning only.
```

Repeat this prompt for each remaining file. There are 47 entries across batches 4-12.

---

## Cleanup

Delete this file and `pending-files-to-review.md` when all entries are done.
