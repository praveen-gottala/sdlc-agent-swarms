# Option 2: Build Bottom-Up with Independently Verifiable PRs

## The Problem This Solves

The plan has 4 phases with ~15 numbered tasks. Executing them all at once creates a massive diff that's hard to review, hard to verify, and hard to roll back if one section has problems. A single mistake in the prompt overlap matrix (Phase 3) might not be caught until after the worked examples (Phase 2) are already committed — and now the examples reference incorrect overlap analysis.

This option splits the work into 4 small, independently verifiable PRs. Each PR can be reviewed, merged, and validated before the next one starts. If the analysis in PR 2 reveals that the scenarios in PR 3 need adjustment, you catch it before writing them.

## How It Works

### PR 1: Structural Fixes (zero risk, pure editorial)

**What goes in:**
- Staleness admonition at document top
- Line-range citations → schema/function names (20+ replacements)
- ASCII lifecycle diagram → Mermaid (§3.4)
- Architect 7-node flow diagram (§1.6)
- Design pipeline redistribution diagram (§2.2)
- HITL gates diagram (§5)
- Bold recommendations → admonitions (`!!! tip`, `??? info`)
- "Related" section at the end

**What does NOT go in:**
- No new analysis sections
- No content changes to existing text (only formatting)
- No scenario walkthroughs

**Verification:**
```bash
# 1. Build docs — zero warnings
python3 -m mkdocs build 2>&1 | grep -i "warning\|error"

# 2. All cited file paths still valid
grep -oP '`[^`]*\.(ts|md|yaml|json)[^`]*`' docs/research/architect-codebase-grounded-design.md \
  | sort -u | while read f; do test -f "$f" && echo "OK $f" || echo "MISS $f"; done

# 3. Visual check — Mermaid renders in backstage
cd backstage && yarn dev  # preview at localhost:3003
```

**Example change (line-range → schema name):**

Before:
```markdown
The type exists (`cross-boundary-artifacts.schemas.ts:167-174`):
```

After:
```markdown
The type exists (`cross-boundary-artifacts.schemas.ts` → `ChangeClassificationSchema`):
```

**Example change (bold recommendation → admonition):**

Before:
```markdown
**Recommendation: Option A** — a lightweight classifier node inside the Architect graph.
Rationale: the classification is only consumed by the Architect's own nodes...
```

After:
```markdown
!!! tip "Recommendation: Lightweight Architect Node 0.5 (Option A)"

    A lightweight classifier node inside the Architect graph. The classification
    is only consumed by the Architect's own nodes (it determines which Contract
    Designer specialists to invoke). Option B would couple the Clarifier to
    brownfield concerns architecturally owned by the Architect. Option C adds
    ceremony for a single LLM call.
```

**Effort: 2-3 hours. Reviewable in 15 minutes.**

---

### PR 2: Analysis Sections (medium risk, verifiable against code)

**What goes in:**
- Part 2: Design Pipeline Stage Analysis
  - Per-stage data flow diagram (Mermaid)
  - Prompt coverage table (9 categories × 3 prompts)
  - Clarifier → Research duplication table
  - Evaluator reality vs claims table + admonition

**What does NOT go in:**
- No stage fate recommendations (those depend on the analysis being correct)
- No worked examples (those depend on the recommendations)

**Verification for each table:**

*Prompt coverage table — verify every cell:*
```bash
# Container treatments in Planning prompt
grep -c "container\|Elevated\|Outlined\|Flat\|Inset\|Separated" \
  packages/agents-ux/src/prompts/ux-planning-system.md

# Container treatments in DesignSpec prompt
grep -c "container\|Elevated\|Outlined\|Flat\|Inset\|Separated" \
  packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md

# Typography in DesignSpec prompt
grep -n "heading-1\|heading-2\|heading-3\|body\|label" \
  packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md
```

*Clarifier → Research duplication — verify root cause:*
```bash
# Confirm pipeline receives flat strings, not structured PRD
grep -n "prdRequirements" packages/agents-ux/src/design-pipeline/nodes.ts
grep -n "prdRequirements" packages/cli/src/commands/design-page.ts

# Confirm Research output schema has flat arrays
grep -A 10 "UXResearchOutput" packages/agents-ux/src/schemas.ts
```

*Evaluator reality — verify pipeline evaluator:*
```bash
# Confirm evaluatorNode calls only structural gate
grep -A 20 "evaluatorNode" packages/agents-ux/src/design-pipeline/nodes.ts

# Confirm evaluateDesign is NOT imported by nodes.ts
grep "evaluateDesign\|design-evaluator" packages/agents-ux/src/design-pipeline/nodes.ts
```

**Example verification output:**
```
$ grep -c "Elevated\|Outlined\|Flat\|Inset\|Separated" packages/agents-ux/src/prompts/ux-planning-system.md
0   <-- NOT in Planning prompt (corrects our table: Planning only has token binding, not the 5 treatments)

$ grep -c "Elevated\|Outlined\|Flat\|Inset\|Separated" packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md
11  <-- Present in DesignSpec prompt ✓
```

This kind of mechanical verification catches errors BEFORE they're committed. If a cell in the table is wrong, we fix it in this PR rather than propagating the error into the recommendations PR.

**Effort: 3-4 hours. Reviewable in 30 minutes (each table independently).**

---

### PR 3: Worked Examples + Recommendations (highest risk, needs most review)

**What goes in:**
- Part 0: How the Pipeline Works (Scenario 1 greenfield + Scenario 2 brownfield + dark mode variation)
- Part 3: Stage Fate Recommendations (with before/after code)
- Part 4: Key Decisions Required (5 admonitions)
- Part 10: Plans Required Before Implementation (5 prerequisites)

**Why this is the riskiest PR:**
- Scenarios describe unbuilt components — higher chance of inaccuracy
- Recommendations are opinionated — may not match the user's architectural preferences
- Before/after code sketches must be type-correct against existing interfaces

**Verification:**

*Type-check code sketches:*
```bash
# Verify PipelineInput interface matches existing type
grep -A 20 "interface PipelineInput\|type PipelineInput" \
  packages/agents-ux/src/design-pipeline/types.ts

# Verify ChangeClassificationSchema has the 5 axes shown
grep -A 10 "ChangeClassificationSchema" \
  packages/core/src/types/cross-boundary-artifacts.schemas.ts

# Verify ScreenPlan schema fields match scenario
grep -A 15 "ScreenPlanSchema" \
  packages/core/src/types/cross-boundary-artifacts.schemas.ts
```

*Verify each "Key Question Answered" callout:*

| Callout | Verification |
|---------|-------------|
| "Greenfield skips repo-map subagents" | Check `vision.md` Layer 3 for greenfield/brownfield distinction |
| "Sequential inside a single node" | Check `vision.md` Layer 8 for single-threaded implementer |
| "Single-writer rule: no two tasks write the same file" | Check `vision.md` Layer 8 for single-writer constraint |
| "Git-mediated coordination" | Check `vision.md` Layer 8 for worktree parallelism |
| "Delta specification" | Check if DesignSpecV2 type supports delta — **it doesn't yet, flag as prerequisite** |

**Example of what review catches:**

The scenario says:
```
Screen spec specialist → produces ScreenPlan[] using existing schema:
  { id: 'expense-entry', screenType: 'page', route: '/expenses/new',
    components: ['AmountInput','CategoryPicker',...],
    dataBindings: ['Expense.amount','Expense.category_id'],
    navigationTargets: [{ trigger: 'submit', target: 'dashboard' }] }
```

Reviewer checks:
```bash
grep -A 15 "ScreenPlanSchema" packages/core/src/types/cross-boundary-artifacts.schemas.ts
```

Actual schema:
```typescript
export const ScreenPlanSchema = z.object({
  id: z.string(),
  featureId: z.string(),         // <-- scenario omits this
  screenType: ScreenTypeSchema,
  route: z.string().optional(),  // <-- scenario shows as required
  components: z.array(z.string()),
  dataBindings: z.array(z.string()),
  navigationTargets: z.array(z.object({
    trigger: z.string(),
    target: z.string(),
  })).optional(),                // <-- scenario shows as required
});
```

Finding: scenario shows `featureId` as absent and `navigationTargets` as required, but the schema has `featureId` as required and `navigationTargets` as optional. Fix the scenario before merging.

**Effort: 4-6 hours. Reviewable in 1 hour.**

---

### PR 4: TL;DR Update + Section Reordering + Final Polish

**What goes in:**
- Updated TL;DR (6 bullets)
- Section reordering to match final structure
- Any cross-reference fixes from reordering
- Final `mkdocs build` verification

**Verification:**
```bash
python3 -m mkdocs build 2>&1 | grep -i "warning\|error"
# Must be zero warnings
```

**Effort: 1 hour. Reviewable in 10 minutes.**

---

## Incremental Schedule

| Week | PR | What | Verification |
|------|-----|------|-------------|
| Day 1 | PR 1 | Structural fixes (diagrams, admonitions, citations) | `mkdocs build` + file path check |
| Day 1-2 | PR 2 | Analysis sections (4 tables with grep verification) | Mechanical grep of prompts and code |
| Day 2-3 | PR 3 | Worked examples + recommendations | Type-check against schemas + vision.md cross-ref |
| Day 3 | PR 4 | TL;DR + reorder + polish | `mkdocs build` + visual check |

**Total: 2-3 days across sessions. Each PR is independently valuable.**

## When to Use This Option

- When you want to ship improvements incrementally (diagrams and formatting first, content later)
- When you want each section mechanically verified before building on it
- When you want the ability to pause between PRs without losing progress
- When the document needs to stay usable during the revision (readers see incremental improvements, not a half-finished rewrite)

## When NOT to Use This Option

- If the document needs a complete rewrite where sections deeply reference each other (the worked examples in PR 3 reference the analysis in PR 2 — if PR 2 changes significantly during review, PR 3 needs rework)
- If speed is more important than verification rigor

## What This Option Does NOT Cover

- It doesn't validate scenarios against real Clarifier output (Option 1 covers that)
- It doesn't have a blind reviewer challenge each section (Option 3 covers that)
- The verification is mechanical (grep, type-check) — it catches factual errors in citations but not logical errors in recommendations
