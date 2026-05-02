# Focused Deep Audit (Vision) — Execution Plan

## Problem

The Deep Audit (Vision) feature in the dashboard Quality panel always audits the **entire screen**. When a user selects a specific node in the canvas, the vision audit ignores that selection — `selectedNode` state exists but is never passed to the audit handler or API.

This was discovered during a renderer visual audit session where a `badge-success` pill stretched full-width inside a flex-column parent. The issue was invisible to:
- **Mechanical audit** — CSS properties matched the spec (radius, color, label all correct)
- **Full-page vision audit** — too much visual noise to catch one badge's width behavior
- **Manual inspection** — missed because the auditor checked content fidelity, not visual shape

The issue was only caught when the research brief's design constraint ("pill border-radius 9999px") was compared against the rendered output for that specific component. The full-page vision audit has no access to the research brief or planning spec — it only sees the design spec.

A second lesson emerged when fixing a `select` renderer bug: the research brief prescribed `background: surface-elevated` for the category filter dropdown. The fix applied that token, but the resolved color (#293548) made the dropdown visually heavy — a filter should be recessive, not attention-grabbing. The user manually adjusted to `#10172a` (near `background-primary`), letting the border define the element instead. **Lesson: token bindings are design intent, not pixel-perfect truth. The visual result must serve the component's role — judge by what looks right in context, not just what the upstream spec says.**

## Current Architecture

### Data flow (what exists today)

```
User clicks "Run Deep Audit"
  → handleRunVisionAudit() [design/page.tsx L361]
    → POST /api/design/audit/vision { pageId: selectedId }
      → selectedId = screen name (e.g. "dashboard"), NOT the clicked node
      → selectedNode (L119) is NEVER sent
      → Loads FULL spec: readDesignSpecText(projectRoot, pageId)
      → Renders FULL page screenshot via openBrowserSession()
      → Calls evaluateDesign() with full spec + full screenshot
        → buildEvaluationContext(spec) — compact tree of ALL nodes
        → Sends to claude-opus-4-7
      → Returns { score, overallQuality, issues }
```

### Key state variables in design/page.tsx

| Variable | Line | What it holds | Used by vision audit? |
|----------|------|--------------|----------------------|
| `selectedId` | L73 | Screen name from sidebar ("dashboard") | YES — sent as `pageId` |
| `selectedNode` | L119 | `{ nodeId, catalogType, computedStyles }` from canvas click | **NO — disconnected** |
| `designSpec` | L124 | Full DesignSpecV2 for the selected screen | NO — re-loaded by API |

### Key files

| File | Role |
|------|------|
| `packages/dashboard/src/app/(dashboard)/design/page.tsx` | Design page — owns `selectedNode` state, `handleRunVisionAudit()` |
| `packages/dashboard/src/components/design/audit-tab.tsx` | Quality panel UI — "Run Deep Audit" button, receives `onRunVisionAudit` callback |
| `packages/dashboard/src/app/api/design/audit/vision/route.ts` | API route — loads spec, renders screenshot, calls evaluator |
| `packages/agents-ux/src/ux-design/design-evaluator.ts` | Vision evaluator — builds prompt, calls claude-opus-4-7 |
| `packages/agents-ux/src/ux-design/evaluation-context.ts` | `buildEvaluationContext()` — compact tree text (300-600 tokens) |
| `fixtures/<project>/agentforge/designs/<screen>/research-brief.json` | Design constraints + reference patterns (intent) |
| `fixtures/<project>/agentforge/designs/<screen>/planning-spec.json` | Component props + token bindings (structure) |

## Solution

When a selected container has ≤N child nodes, the "Run Deep Audit" button switches to **focused mode**:
- Passes the selected `nodeId` to the API
- API loads research brief + planning spec for upstream intent
- Takes a screenshot with the target container's border highlighted (gold outline)
- Builds focused evaluation context (target subtree + parent/sibling context + design constraints)
- Sends to vision LLM with a focused prompt

When no node is selected OR the node has >N children, the button keeps its current behavior (full-page audit).

## Phases

### Phase 1 — Wire selectedNode to the audit flow

**Goal:** Pass the selected node ID from the canvas through to the API. No behavior change yet — just plumbing.

- [ ] **1.1** Update `AuditTabProps` to accept `selectedNodeId?: string` and `selectedNodeChildCount?: number`
  - File: `packages/dashboard/src/components/design/audit-tab.tsx`

- [ ] **1.2** Compute child count when `selectedNode` changes
  - File: `packages/dashboard/src/app/(dashboard)/design/page.tsx`
  - When `selectedNode` is set, count descendant nodes in `designSpec.nodes` (walk `parent` chain)
  - Store as `selectedNodeChildCount` in state

- [ ] **1.3** Update `handleRunVisionAudit` to pass `nodeId` when in focused mode
  - File: `packages/dashboard/src/app/(dashboard)/design/page.tsx`
  - If `selectedNode` exists AND `childCount ≤ N`: send `{ pageId, nodeId: selectedNode.nodeId }`
  - Otherwise: send `{ pageId }` (current behavior)

- [ ] **1.4** Update API route to accept optional `nodeId`
  - File: `packages/dashboard/src/app/api/design/audit/vision/route.ts`
  - Parse `nodeId` from request body
  - For now, log it and continue with full-page behavior (no functional change)

- [ ] **1.5** Update button label in focused mode
  - File: `packages/dashboard/src/components/design/audit-tab.tsx`
  - When `selectedNodeId` is set and `childCount ≤ N`: show "Deep Audit: `<nodeId>`"
  - Otherwise: show "Run Deep Audit" (current)

**Gate:** `selectedNode.nodeId` arrives at the API route. Verify with a console.log. All existing tests pass.

### Phase 2 — Load upstream context (research brief + planning spec)

**Goal:** Make the research brief's design constraints and planning spec's token bindings available to the evaluator.

- [ ] **2.1** Create upstream context API route
  - File: `packages/dashboard/src/app/api/pages/[pageId]/design/upstream/route.ts` (NEW)
  - Reads `agentforge/designs/<pageId>/research-brief.json`
  - Reads `agentforge/designs/<pageId>/planning-spec.json`
  - Returns `{ designConstraints, referencePatterns, componentTree, tokenBindings }`
  - Returns empty arrays/objects if files don't exist (graceful degradation)

- [ ] **2.2** Fetch upstream context in focused mode handler
  - File: `packages/dashboard/src/app/(dashboard)/design/page.tsx`
  - In `handleRunVisionAudit`, when focused mode: fetch `/api/pages/${selectedId}/design/upstream`
  - Pass upstream context to the vision audit API as part of the request body

- [ ] **2.3** Accept upstream context in vision audit API
  - File: `packages/dashboard/src/app/api/design/audit/vision/route.ts`
  - Parse `upstreamContext` from request body (optional)
  - Pass through to evaluator (Phase 3 consumes it)

**Gate:** Upstream context arrives at the API route. Verify research brief constraints are loaded for PET dashboard.

### Phase 3 — Focused screenshot + context

**Goal:** When `nodeId` is provided, take a targeted screenshot and build focused evaluation context.

- [ ] **3.1** Highlight target node in screenshot
  - File: `packages/dashboard/src/app/api/design/audit/vision/route.ts`
  - After opening browser session, inject CSS: `[data-node="<nodeId>"] { outline: 3px solid #F59E0B; outline-offset: 2px; }`
  - Take screenshot after injection

- [ ] **3.2** Build focused evaluation context
  - File: `packages/agents-ux/src/ux-design/evaluation-context.ts`
  - Add `buildFocusedEvaluationContext(spec, nodeId, upstreamContext)`:
    - Target node + all descendants (full detail)
    - Parent node (name, type, layout — spatial context)
    - Sibling nodes (name, type only — opaque blocks, no children)
    - Relevant design constraints from research brief (match component names)
    - Relevant token bindings from planning spec

- [ ] **3.3** Use focused context in evaluator when nodeId is present
  - File: `packages/agents-ux/src/ux-design/design-evaluator.ts`
  - Add optional `nodeId` + `upstreamContext` parameters to `evaluateDesign()`
  - When provided, use `buildFocusedEvaluationContext()` instead of `buildEvaluationContext()`
  - Use `FOCUSED_EVALUATION_SYSTEM_PROMPT` instead of the generic scoring prompt

- [ ] **3.4** Focused evaluation system prompt
  - File: `packages/agents-ux/src/ux-design/design-evaluator.ts`
  - The full-page prompt scores 5 generic dimensions (layout, hierarchy, content, spacing, treatment).
    The focused prompt does something fundamentally different — it compares rendered output against
    **stated design intent** for a specific component. The prompt design is informed by a session
    where a badge pill-width issue was missed by both mechanical checks and full-page vision audit,
    but caught when the research brief's constraint was compared against the rendered output.

  **Prompt structure:**

  ```
  You are a focused design quality auditor. The gold-outlined container in the screenshot is
  your audit target. Your job is to compare what IS rendered against what SHOULD BE rendered,
  using three layers of intent provided below.

  ## What to check

  For each child element in the target container, evaluate these dimensions IN ORDER:

  1. **Shape & Sizing** — Does each element occupy the correct amount of space?
     - A pill badge should hug its text, not stretch full-width
     - A progress bar should show a visible track behind the fill
     - Containers should not collapse to zero height or stretch unexpectedly
     - Check: does the element look like what its catalog type implies? (a "badge" should look
       like a badge, not a full-width bar)

  2. **Spatial Relationships** — How do elements relate to each other within the container?
     - Are elements that should be grouped visually connected?
     - Are elements that should be separated visually distinct?
     - Does the visual hierarchy within the container match the intent?

  3. **Token Fidelity vs. Visual Fitness** — Do colors, typography, and spacing serve the
     component's purpose?
     - Compare rendered colors against the stated token bindings — but DO NOT stop at
       "token matches." Ask: does the resolved color actually look right in context?
     - A token binding is design intent, not pixel-perfect truth. If the research brief
       says `background: surface-elevated` but the resolved color (#293548) makes a filter
       dropdown visually heavy and attention-grabbing when it should be recessive, that's
       a visual fitness problem even though the token technically matches.
     - Rule: **the visual result must serve the component's role.** A filter dropdown should
       be subtle (the data it filters is the star). A CTA button should be prominent. A
       status badge should draw the eye. Judge the color by what the component IS, not just
       what the token says.
     - Check typography roles (heading-1 for amounts, label for captions, etc.)
     - Verify spacing matches the stated gaps and padding

  4. **Design Constraint Compliance** — For each design constraint from the research brief
     that applies to this container, does the rendered output satisfy it?
     - Quote the specific constraint
     - State whether it is satisfied or violated
     - If violated, describe what you see vs. what the constraint requires
     - If satisfied but the visual result doesn't serve the component's purpose (see #3),
       flag as "token-correct-but-visually-wrong"

  ## How to report

  For each issue found:
  - issueId: stable kebab-case (e.g., "badge-stretches-full-width")
  - severity: "intent-gap" (renders correctly per spec but violates upstream intent),
    "renderer-bug" (spec says X, browser shows Y), or "spec-quality" (design spec
    deviates from research/planning intent)
  - component: the node ID or component name
  - constraint: the research brief constraint it violates (if applicable, quote it)
  - description: what you see vs. what should be there
  - fix: specific fix instruction (which layer to change — spec, renderer, or upstream)

  Respond ONLY with a JSON object:
  {
    "issues": [
      {
        "issueId": "<stable-kebab-case-id>",
        "severity": "intent-gap" | "renderer-bug" | "spec-quality",
        "component": "<node id or name>",
        "constraint": "<quoted research brief constraint, if applicable>",
        "description": "<what you see vs. what should be>",
        "fix": "<specific fix instruction>"
      }
    ]
  }
  ```

  **Key differences from the full-page prompt:**
  - No numeric scoring (focused audit is pass/fail per constraint, not a score)
  - Shape & Sizing is the FIRST check (this is what caught the badge issue — content was correct
    but shape was wrong, and the full-page prompt checked content before shape)
  - Three severity types map to the three layers: `renderer-bug` (renderer), `intent-gap`
    (design spec vs research brief), `spec-quality` (design spec structure)
  - Each issue links back to the specific research brief constraint it violates
  - Fix instructions specify WHICH layer to change (renderer code vs. design spec vs. upstream)

**Gate:** Run focused deep audit on `budget-summary-card`. Verify:
- Screenshot shows gold outline around the budget card
- Context includes research brief constraint about pill badge and progress bar
- Issues returned include: badge-stretches-full-width (intent-gap), progress-bar-missing-track (intent-gap)
- Each issue quotes the relevant research brief constraint

### Phase 4 — Polish + threshold tuning

- [ ] **4.1** Make child count threshold configurable
  - Store as constant `FOCUSED_AUDIT_MAX_CHILDREN = 10` (starting point)
  - Can be adjusted after experimentation

- [ ] **4.2** Show focused mode indicator in Quality panel
  - When focused: show which node is being audited + child count
  - When unfocused: current behavior

- [ ] **4.3** Typecheck + test + lint gate
  - `nx run-many -t typecheck` — all green
  - `nx run-many -t test` — all green
  - `nx run-many -t lint` — all green
  - Manual: verify full-page audit still works (regression)

## Open questions

- **Child count threshold:** Starting at 10. Needs experimentation — too low misses useful containers, too high loses focus. Should be a constant, not hardcoded in conditionals.
- **Cost display:** The current UI shows "~$0.05-0.10 per page". Focused mode should be cheaper (smaller screenshot, less context). Should we update the cost estimate?
- **Fallback when no research brief exists:** Some screens may not have a research-brief.json (e.g., if they were generated outside the pipeline). The focused context should gracefully degrade to design-spec-only evaluation.
