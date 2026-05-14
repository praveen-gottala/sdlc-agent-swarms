# Option 3: Challenge-Then-Write (Blind Reviewer Per Section)

## The Problem This Solves

Options 1 and 2 catch different kinds of errors:
- Option 1 catches **data errors** (does the Clarifier actually produce this output?)
- Option 2 catches **citation errors** (does this schema actually have this field?)

Neither catches **reasoning errors** — places where the analysis is internally consistent and correctly cited but the conclusion doesn't follow, or where an important implication was missed. Examples:

- The prompt overlap matrix correctly identifies container treatments as duplicated 3x, but the recommendation "remove from Planning prompt" might break standalone mode because standalone Planning depends on those instructions without the Architect providing them.
- The brownfield scenario correctly shows `ChangeClassification` scoping which specialists run, but misses that the component composition specialist for a MODIFIED screen needs the existing DesignSpec v2 as input — and no current code loads existing designs for comparison. The scenario silently assumes a capability that doesn't exist.
- The evaluator wiring solution shows `state.planning` being passed to `evaluateDesign()`, but the pipeline's evaluator node is called after the design stage and the planning output isn't guaranteed to be in the state at that point (it is, but the argument for WHY it's safe is missing).

These are **logical gaps** that survive mechanical verification. A human reviewer would catch them, but the document is long and complex. A blind AI reviewer — given no context from this conversation and asked to find flaws — is a faster way to surface these gaps.

## How It Works

### The Core Protocol

For each major section of the document, before writing it:

1. **Draft the section** based on the research and plan
2. **Spawn a blind challenger agent** with no context from this conversation
3. **Give the challenger access to the codebase** and ask it to find factual errors, logical gaps, and missing implications
4. **Fix every finding** before committing the section
5. **Document the challenge results** in the PR description (what was found, what was fixed)

### Example: Challenging the Prompt Overlap Matrix

**Section under challenge:** The prompt coverage table claiming container treatments are duplicated in Planning, DesignSpec, and Penpot prompts.

**Challenger prompt:**
```
You are reviewing a claim about prompt file overlap in the CHIP design pipeline.

CLAIM: "Container treatment patterns (Elevated, Outlined, Flat, Inset, Separated)
are duplicated in three prompt files: ux-planning-system.md, ux-penpot-designspec-v2.md,
and ux-penpot-design-system.md."

RECOMMENDATION: "Remove from Planning prompt and Penpot prompt. Make DesignSpec
prompt the sole owner."

Your job: Read ALL THREE prompt files. For each one, answer:
1. Does the file actually contain container treatment instructions? Quote them.
2. Are the instructions identical, similar, or different in purpose?
3. Would removing them from the Planning prompt break standalone mode?
4. Would removing them from the Penpot prompt break the V1 legacy path?

Files to read:
- packages/agents-ux/src/prompts/ux-planning-system.md
- packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md
- packages/agents-ux/src/prompts/ux-penpot-design-system.md

Report findings with quoted evidence.
```

**Example challenger finding:**
```
FINDING 1: The Planning prompt does NOT contain the 5 container treatment patterns.
It contains token binding guidance that references "elevation-0/1/etc." (line 169)
but does NOT list Elevated/Outlined/Flat/Inset/Separated. The overlap matrix cell
"Token binding for elevation" is correct but the claim "duplicated in Planning" is
misleading — Planning references elevation tokens, not the treatment taxonomy.

IMPACT: The deduplication recommendation "remove from Planning" is a no-op.
Planning doesn't have the full treatment list to remove. The real duplication
is between DesignSpec and Penpot only.

FINDING 2: Removing container treatments from the Penpot prompt would break V1
legacy path. The Penpot prompt (lines 143-167) includes Penpot-specific API code
samples for each treatment (e.g., stroke configuration for Outlined, shadow
configuration for Elevated). The DesignSpec prompt has the same treatment taxonomy
but with DesignSpec JSON fields, not Penpot API calls. These are NOT identical
instructions — they're the same taxonomy rendered for different targets.

IMPACT: Recommendation should be "Keep treatment taxonomy in both DesignSpec and
Penpot prompts, but extract the shared taxonomy definition into a shared constant
so they don't drift."
```

**What we learn:** The overlap matrix was partially wrong. The deduplication recommendation was too aggressive. Without the challenge, we'd have committed a recommendation to "remove from Planning" that is a no-op, and a recommendation to "remove from Penpot" that would break the V1 path.

### Example: Challenging the Brownfield Scenario

**Section under challenge:** The brownfield scenario's claim about delta specification for modified screens.

**Challenger prompt:**
```
The document proposes a "delta specification" for brownfield screen modifications:
- unchanged nodes: referenced by ID, not re-specified
- new nodes: full specification
- modified nodes: ID + changed fields only
- removed nodes: listed by ID

Your job:
1. Does DesignSpecV2 (in packages/designspec-renderer/src/types/design-spec-v2.ts)
   support any notion of delta/incremental updates? Read the type.
2. Does the design stage (browser-design-work.ts or penpot-v2-pipeline.ts)
   have any code path for receiving an existing design and producing a delta?
3. Does the evaluator handle delta specs, or does it expect a complete spec?
4. What would need to change to support this delta specification?

Read the actual files and report with file paths and line numbers.
```

**Example challenger finding:**
```
FINDING: DesignSpecV2 has NO delta support. The type defines a complete spec:
- Every node must have parent, order, type/catalog (design-spec-v2.ts line 45-89)
- The submit_design tool schema requires a complete node list
- browser-design-work.ts line 245 calls extractDesignSpecFromToolCall()
  which expects a full spec, not a delta

The scenario describes delta specification as if it exists. It should be
flagged as a PREREQUISITE CAPABILITY, not described as a current feature.

Additionally, the evaluator (structural-quality-gate.ts) counts total nodes
and computes ratios. A delta spec with only new/modified nodes would
produce incorrect catalog adoption scores because unchanged nodes would
be missing from the count.

PREREQUISITE WORK NEEDED:
1. Add delta mode to DesignSpecV2 type (or create a DeltaDesignSpec type)
2. Add merge logic: delta + existing → complete spec
3. Update evaluator to accept merged specs, not deltas
4. Update the submit_design tool schema for delta mode
```

**What we learn:** The delta spec concept is correct architecturally but the scenario presents it as if the infrastructure exists. The document needs to be explicit: this is a prerequisite capability (#2 in the plans-required table), and the scenario should show the prerequisite clearly rather than glossing over it.

### Example: Challenging the Evaluator Wiring Solution

**Challenger prompt:**
```
The plan proposes wiring evaluateDesign() into the pipeline evaluator node:

```typescript
if (state.enableVisionEval && state.screenshotPath) {
  const visionResult = await evaluateDesign({
    screenshotPath: state.screenshotPath,
    planning: state.planning,
    designTokens: state.designTokensSpec,
    catalogMap: state.catalogMap,
  });
  return { evaluation: { ...visionResult, structural: false } };
}
```

Your job:
1. Read evaluateDesign() in design-evaluator.ts. What parameters does it
   actually take? Does the proposed call match its signature?
2. Where does screenshotPath come from in the pipeline? Does any current
   pipeline stage capture a screenshot?
3. state.planning is set by the planningNode. Is it guaranteed to exist
   when the evaluatorNode runs? Read the pipeline stage ordering.
4. What model does evaluateDesign() use? What's the cost per call?

Read the files and verify each assumption.
```

**Example challenger finding:**
```
FINDING 1: evaluateDesign() signature (design-evaluator.ts:172) takes:
  evaluateDesign(options: EvaluateDesignOptions)
where EvaluateDesignOptions has:
  screenshotPath: string           ✓ matches
  designSpec: string               ✗ plan passes JSON.stringify(spec), but
                                     the function expects buildEvaluationContext()
                                     output, not raw JSON — see line 272
  options.structuralNavCheck       ✗ plan passes `planning` directly, but the
                                     function expects it nested under
                                     options.structuralNavCheck.planning

The proposed code would pass the wrong argument shapes.

FINDING 2: No pipeline stage captures a screenshot. The browser-design-work.ts
design stage produces a DesignSpec JSON but never takes a browser screenshot.
Screenshots are taken by the CLI design:page command (design-page.ts:738) AFTER
the pipeline completes. The evaluator would need a new "screenshot capture"
step between design and evaluation, or the design stage needs to output a
screenshot path.

FINDING 3: state.planning IS guaranteed to exist — the pipeline runs stages
sequentially (pipeline.ts:68 loop), and planning (index 1) runs before
evaluator (index 3). This assumption is correct.

CORRECTED CODE:
```typescript
if (state.enableVisionEval) {
  // Capture screenshot first (new step needed)
  const screenshotPath = await captureDesignScreenshot(state.design.spec);
  const evalContext = buildEvaluationContext(state.design.spec as DesignSpecV2);
  const visionResult = await evaluateDesign({
    screenshotPath,
    designSpec: evalContext,  // compact context, not raw JSON
    structuralNavCheck: state.planning
      ? { planning: state.planning }
      : undefined,
    designTokens: state.designTokensSpec,
    catalogMap: state.catalogMap,
  });
  return { evaluation: { ...visionResult, structural: false } };
}
```

**What we learn:** The before/after code sketch had 3 bugs that would only be caught at implementation time. Fixing them in the document prevents future implementers from copying incorrect code.

---

## The Challenge-Then-Write Workflow

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  For each section of the document:                   │
│                                                      │
│  1. DRAFT the section from plan + research           │
│                    ↓                                  │
│  2. SPAWN blind challenger agent                     │
│     • No conversation context                        │
│     • Full codebase access                           │
│     • Specific claims to verify                      │
│                    ↓                                  │
│  3. RECEIVE challenger findings                      │
│     • Factual errors (wrong line numbers, fields)    │
│     • Logical gaps (missing prerequisites)           │
│     • Incorrect code sketches (wrong signatures)     │
│                    ↓                                  │
│  4. FIX every finding in the draft                   │
│                    ↓                                  │
│  5. COMMIT with challenge results in PR description  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Sections That Benefit Most From Challenging

Not every section needs a challenge. Prioritize by risk:

| Section | Risk level | Why challenge it? |
|---------|-----------|------------------|
| Prompt overlap matrix | **High** | Claims about what's in each prompt — easy to be subtly wrong about scope |
| Before/after code sketches | **High** | Function signatures, parameter shapes, state availability — bugs here get copied |
| Brownfield scenario steps | **High** | Assumes capabilities (delta spec, existing design loader) that may not exist |
| Stage fate recommendations | **Medium** | Recommendations may have unintended side effects on standalone mode |
| Evaluator reality table | **Low** | Already verified by grep in this session — challenge would be redundant |
| Mermaid diagrams | **Low** | Visual, not factual — errors are cosmetic |

**Recommended: Challenge the top 4, skip the bottom 2.**

## Incremental Implementation

| Step | Section | Challenge focus | Effort |
|------|---------|----------------|--------|
| 1 | Prompt overlap matrix | Are the overlap claims accurate? | 30 min (challenger) + 1 hr (fixes) |
| 2 | Before/after code sketches | Do the proposed interfaces match actual types? | 30 min + 1 hr |
| 3 | Brownfield scenario | Does the delta spec concept have codebase support? | 30 min + 1 hr |
| 4 | Stage fate recommendations | Would removing prompt content break standalone? | 30 min + 1 hr |
| 5 | Write all sections with fixes applied | — | 4-6 hours |

**Total: 2-3 days. Produces the highest-accuracy document but takes longest.**

## When to Use This Option

- When the document will be the authoritative source that implementation plans are written against
- When accuracy matters more than speed (this is a "measure twice, cut once" approach)
- When you've been burned before by documents that looked right but contained subtle errors
- When the document contains code sketches that future implementers will copy

## When NOT to Use This Option

- When speed matters — each challenge adds 1-2 hours per section
- When the document is a first draft that will be revised after implementation starts
- When the claims are easily verifiable by grep (use Option 2's mechanical verification instead)

## Combining With Other Options

This option works best combined with Option 2:

1. **PR 1** (Option 2): Structural fixes — no challenge needed
2. **PR 2** (Option 2 + 3): Analysis sections — **challenge the prompt overlap matrix and evaluator table**
3. **PR 3** (Option 2 + 3): Worked examples — **challenge brownfield scenario and code sketches**
4. **PR 4** (Option 2): Final polish — no challenge needed

Option 1 (real Clarifier run) can be added to PR 3 to validate the greenfield scenario against real data.

**The combined approach:**
- Option 2 for incremental delivery structure
- Option 3 for the 4 highest-risk sections
- Option 1 for Scenario 1 validation (if time permits)

This gives you the best accuracy-to-effort ratio: mechanical verification where it suffices, blind challenges where reasoning errors are likely, and real data where the Clarifier's actual behavior matters.
