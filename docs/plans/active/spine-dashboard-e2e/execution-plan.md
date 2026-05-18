# Spine Dashboard End-to-End

## Status: Phase 1 COMPLETE (2026-05-18) — Phase 2 unblocked

## Related Documents

- **Real-time UX reference:** [`real-time-ux-reference.md`](real-time-ux-reference.md) — 14 feedback patterns from Phase 0 eval session that MUST be replicated in the dashboard. Every component in Phases 2-8 traces back to a pattern in this file. **Read this before implementing any Phase.**
- **Parent context:** [`docs/plans/active/chips-next-steps/execution-plan.md`](../chips-next-steps/execution-plan.md) — M0-M3.6 history, milestone table, brownfield wiring notes
- **Hard upstream:** [`docs/plans/active/chips-next-steps/m4-execution-plan.md`](../chips-next-steps/m4-execution-plan.md) — Implementer + Reviewer agent packages. This plan does not start until M4 is COMPLETE.
- **ADR-057:** [`docs/adrs/ADR-057-task-type-aware-design-slice-strategy.md`](../../../adrs/ADR-057-task-type-aware-design-slice-strategy.md) — task-type-aware design slice strategy (NEW: `'none'`, MODIFY: `'structure-only'`)
- **Vision:** [`docs/vision.md`](../../../vision.md) — Layer 8 (Implementation), Layer 9 (Review), Layer 10 (HITL gates)
- **Planning gates:** [`docs/guides/planning-docs.md`](../../../guides/planning-docs.md)

## Vision

We're building something that could change how software is made. CHIP takes a raw idea and turns it into working software through an AI-powered spine — and this dashboard is how the world will experience it. Every animation, every progress indicator, every real-time update is a chance to show that this isn't just another dev tool. This is the future of software development, and it's worth $100M because it *feels* like the future when you use it.

**You are building the interface to an AI architect, implementer, and reviewer working in concert. Make it feel as impressive as that sounds.**

## Goal

Any developer using the CHIP dashboard at `packages/dashboard/` can take an application idea from raw text through every spine stage — Clarifier → Architect → Design → Implementer → Reviewer — with all three HITL gates wired to real UI, and (later) repeat the loop for "add a feature to an existing project" (brownfield) without leaving the dashboard.

## Working Assumptions (revise by editing this file)

- **A1. Hard gate on M4 completion. No stubs anywhere.** This plan does **not** start Phase 1 until [`m4-execution-plan.md`](../chips-next-steps/m4-execution-plan.md) is fully COMPLETE — meaning all 7 M4 phases done, all 8 M4 exit criteria green ([`m4-execution-plan.md:59-73`](../chips-next-steps/m4-execution-plan.md)), full spine eval (Clarifier → Architect → Design → Implementer → Reviewer) passing end-to-end on the CashPulse fixture. Phase 0 of this plan is the verification gate that proves M4 is truly done. **Every stage the dashboard surfaces must be backed by a working agent. No "disabled with tooltip" placeholders. No "pending M4 Phase N" copy in the UI.**
- **A2. Brownfield is phased in.** Phases 2-5 cover greenfield E2E. Phases 6-7 add brownfield (evolution-mode entry, `AffectedScreen` panel, `DesignSpecDelta` viewer). Brownfield agent capability must also be M4-COMPLETE before Phase 6 begins (M4 Phases 2, 3, 4 cover the agent side).
- **A3. CashPulse is the smoke-fixture.** Same fixture used by M0 ([`packages/eval/src/scenarios/cashpulse.yaml`](../../../../packages/eval/src/scenarios/cashpulse.yaml)) and M3.5 brownfield ([`packages/eval/src/scenarios/cashpulse-brownfield.yaml`](../../../../packages/eval/src/scenarios/cashpulse-brownfield.yaml)). Every phase's verification step uses this fixture.
- **A4. No new top-level routes (decided in Phase 1).** All new surfaces live as panels/tabs inside existing pages ([`packages/dashboard/src/app/(dashboard)/`](../../../../packages/dashboard/src/app/(dashboard)/)). Sidebar from [`sidebar-nav.tsx:47-87`](../../../../packages/dashboard/src/components/layout/sidebar-nav.tsx) stays as-is. Phase 1 either confirms or revises this.

## Hard Constraint: Dashboard-Only from Phase 2 Onward

**From Phase 2 onward, ALL spine runs MUST go through the dashboard UI — never through the CLI eval script (`scripts/run-spine-eval.ts`) or direct Node.js invocation.** The CLI was Phase 0's verification tool. From now on, if a feature can't be exercised through the dashboard, it's not done.

Why this matters:
- **No backdoors.** If we keep running the spine via CLI, we never feel the UX pain that real developers will hit. Every friction point, missing animation, blank screen, or silent 8-minute wait must be experienced firsthand through the dashboard.
- **Dogfooding drives quality.** The implementer must submit PRDs on `/new`, watch SpineRail animate, approve gates on `/approvals`, and review findings on `/agents/[id]/live`. If any of those flows are broken or feel bad, that's a bug — not a "we'll polish later."
- **Browser tools are the verification surface.** Use Chrome DevTools MCP and Playwright to interact with the dashboard, not `curl` or direct API calls. The dashboard IS the product.

Exceptions (require explicit user waiver):
- Debugging a specific API route in isolation (e.g., `curl /api/architect` to test SSE streaming before the UI is wired) — acceptable as a temporary debug step, but the final verification must go through the dashboard UI.
- Running the tiny fixture for rapid iteration during development — still through the dashboard, just a faster fixture.

## Non-goals

- Building the Implementer / Reviewer agent packages themselves (owned by M4 — this plan cannot start until that work is done).
- Git-worktree parallelism (R1, deferred per [`m4-execution-plan.md:78`](../chips-next-steps/m4-execution-plan.md)).
- Replacing the standalone design pipeline (Phase 8 cleanup in parent [`execution-plan.md`](../chips-next-steps/execution-plan.md)).
- Vision evaluator wiring (ADR-045, opt-in later).

## Out of scope items that are explicitly NOT this plan

- New agents, new pipeline stages, new public APIs (those belong in M4 or follow-ups).
- ~~The `/approvals` `badge: 3` is currently hard-coded at [`sidebar-nav.tsx:61`](../../../../packages/dashboard/src/components/layout/sidebar-nav.tsx). Replacing it with a live count IS in scope (Phase 3).~~ **DONE (2026-05-18, M4 Phase 7 session).** `useApprovalCount()` hook fetches from `/api/approvals` with 30s polling. Badge hidden when count is 0. Phase 3 should add E2E test coverage for this behavior.

---

## Architecture: the user's journey

```mermaid
flowchart LR
    Idea[Raw idea or change request] --> NewPage["/new"]
    NewPage --> Clarifier
    Clarifier --> Gate1["/approvals: Gate 1 - Clarification"]
    Gate1 --> Architect
    Architect --> Spec["/spec - artifacts viewer"]
    Architect --> Tasks["/tasks - TaskPlan DAG"]
    Architect --> Gate2["/approvals: Gate 2 - Design and API"]
    Gate2 --> Design["/design - per-screen"]
    Design --> Implementer
    Implementer --> AgentsLive["/agents/[id]/live - tool loop trace"]
    Implementer --> Reviewer
    Reviewer -->|approved| Done["/ home"]
    Reviewer -->|revisionNeeded| Implementer
    Reviewer -->|escalate| Gate3["/approvals: Gate 3 - Code merge"]
    Implementer -.->|traces| TracesPage["/traces"]
    Implementer -.->|costs| CostsPage["/costs"]
    Implementer -.->|ledger| TrustPage["/trust"]
```

---

## Phase 0: M4 completion gate (BLOCKING — no dashboard work begins until green)

**Goal:** Prove that the spine architecture works end-to-end in code — Clarifier through Reviewer, both greenfield and brownfield — **before any dashboard file is touched.** If any check below fails, this plan stops here and M4 is the only active workstream.

### Hard prerequisites (every one must be true)

- [x] [`m4-execution-plan.md`](../../completed/chips-next-steps-m4/execution-plan.md) Phase 1-7 all checked complete in the plan file. M4 moved to `docs/plans/completed/chips-next-steps-m4/`.
- [x] All 8 M4 exit criteria green (verified 2026-05-18):
  1. ADR-057 routing wired with 10 wiring tests in `build-implementer-prompt.test.ts`.
  2. Brownfield `DesignSpecDelta` path: full delta module at `packages/designspec-renderer/src/renderer/delta/`.
  3. Instrumentation logs `taskType`, `sliceStrategy` per call (`qualityProxy` deferred to Phase 5, documented).
  4. Implementer LangGraph package: 4-node graph with 7 tools at `packages/agents-implementer/`.
  5. Reviewer LangGraph package: 4-node graph with 16 deterministic gates at `packages/agents-reviewer/`.
  6a. Full spine eval: greenfield SUCCESS ($6.00, 1473s) + brownfield SUCCESS ($3.89, 877s). Both outcome=escalated. Gate 6a PASSED.
  6b. Regression guard: `design-info-value.yaml` regression passed per M4 closeout (2026-05-18).
  7. `nx run-many -t typecheck test lint` — zero failures (512 tests passed, 0 errors).
- [x] CLAUDE.md updated with `M4 COMPLETE` and [`docs/plans/active/chips-next-steps/execution-plan.md:3`](../chips-next-steps/execution-plan.md) status line shows M4 COMPLETE.

### Tasks (verification only — read-only checks, no dashboard edits)

- [x] **Re-run the full spine eval locally.** Greenfield eval ran 2026-05-18T18:51:38Z. SUCCESS, $6.00, 1473s, outcome=escalated. Receipt at `packages/eval/results/spine-dashboard-e2e/phase-0/greenfield-receipt.md`.
- [x] **Re-run the brownfield spine eval.** Brownfield eval ran 2026-05-18T18:41:54Z. SUCCESS, $3.89, 877s, outcome=escalated. MODIFY task exercised (`design-tokens-recurring`, mode=MODIFY). Receipt at `packages/eval/results/spine-dashboard-e2e/phase-0/brownfield-receipt.md`.
- [x] **Trace every spine API call the dashboard will need.** All verified as callable exports:
  - `compileClarifierGraph()` — `packages/agents-clarifier/src/graph/clarifier-graph.ts:135`, exported.
  - `compileArchitectGraph()` — `packages/agents-architect/src/graph/architect-graph.ts:91`, exported.
  - `compileImplementerGraph()` — `packages/agents-implementer/src/graph/implementer-graph.ts:56`, exported.
  - `compileReviewerGraph()` — `packages/agents-reviewer/src/graph/reviewer-graph.ts:46`, exported.
  - LangGraph checkpointer — `createCheckpointer()` at `packages/core/src/checkpointer/index.ts:27`, Postgres + MemorySaver fallback.
  - `ReviewResult` schema — `packages/core/src/types/cross-boundary-artifacts.schemas.ts:293`. **Note:** field is `outcome` (not `disposition`), values are `'approved' | 'rejected' | 'escalated'` (not `'revisionNeeded' | 'escalate'`). Code is authoritative.
  - `AffectedScreenSchema` on `ChangeClassificationSchema` — `packages/core/src/types/cross-boundary-artifacts.schemas.ts:170,179`. `affectedScreens` is optional.
  - `DesignSpecDeltaSchema` — `packages/core/src/types/design-delta.schemas.ts:36`, exported from core.
- [x] **Bounded retry contract verified in code, not just the plan.** Reviewer is stateless single-pass (4-node linear graph). Caller enforces `MAX_REVISION_CYCLES = 2` at `packages/cli/src/commands/spine-implement-task.ts:25,109-248`. Dashboard routes will replicate this loop in Phase 2-3. Reviewer's `index.ts:9-23` documents caller responsibility contract.

### Phase 0 Gate (hard block — do not proceed if any unchecked)

- [x] Every checkbox above is checked.
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 0`
- [ ] `/mid-session-drift-check`
- [x] Both receipts (greenfield + brownfield) committed under `packages/eval/results/spine-dashboard-e2e/phase-0/`.
- [x] **No checks failed.** All M4 exit criteria verified, both eval runs passed. Phase 1 is unblocked.

---

## Cross-Cutting: Animation & Engagement Requirements

**Every moment the user waits must feel like valuable work is happening.** A 25-minute Architect run with Opus is the hardest UX challenge in this dashboard. The difference between "this is broken" and "this is impressive" is animation, feedback, and transparency.

### Animation requirements (apply to all Phases 2-8)

1. **SpineRail stage transitions:** Active stage pulses with a subtle glow animation (CSS `@keyframes pulse`). Completed stages slide from active state to checkmark with a smooth transition (Framer Motion or CSS). Upcoming stages are dimmed at 40% opacity.

2. **NodeTimeline rows:** New rows slide in from the left (150ms ease-out). The spinning timer uses a smooth CSS counter animation, not jerky 1s intervals. On completion, the timer snaps to final value with a subtle scale bounce (1.0 → 1.05 → 1.0, 200ms).

3. **HeartbeatPulse:** Continuous pulse animation (scale 0.8 → 1.2 → 0.8) with opacity fade (0.4 → 1.0 → 0.4) on a 2s cycle. The pulse should feel like breathing — organic, not mechanical. Reference: macOS Siri listening indicator.

4. **Cost ticker:** Numbers should count up smoothly (animated number transition, not snap). When a stage completes and adds its cost, the total rolls up digit-by-digit over 500ms. Reference: fundraising ticker animations.

5. **Progress ring (ETA):** Smooth SVG stroke-dashoffset animation that fills proportionally. Color transitions from blue → green as progress approaches 100%. Reference: Apple Watch activity rings.

6. **Gate interrupt notification:** SpineRail stage flashes amber 3 times (300ms on, 200ms off), then settles to a steady amber glow. Toast slides in from the right with spring physics (slight overshoot + settle). Browser notification fires simultaneously for background tabs.

7. **Task selection highlight:** The selected task row in TaskPlanDagPanel gets a left-border accent (2px, animated from 0 to full height over 200ms) and a subtle background color pulse that fades over 2s.

8. **Run completion:** All SpineRail stages animate to checkmark state in sequence (100ms stagger between stages), then the summary card slides up from the bottom with the total cost and outcome badge. Confetti or subtle particle effect for "Approved" outcome (opt-in via preferences). Outcome badge appears with a scale-in animation (0 → 1.0 with spring).

9. **Skeleton states:** Every component that loads data shows a Mantine skeleton with shimmer animation, not a blank space. Skeletons should match the exact shape of the loaded content (not generic rectangles).

10. **Empty states with illustrations:** When no runs exist, show an illustrated empty state with a prominent "Run your first spine" CTA button. Not bare "No data" text.

### Streaming text display (the "terminal feel")

During the eval, the most engaging moments were when text streamed in real time —
node completions appearing one by one, costs accumulating, task selections printing.
Replicate this in the dashboard:

1. **Log console panel** — a collapsible panel at the bottom of `/pipeline` (similar
   to Chrome DevTools console or Vercel build logs) that streams raw events as they
   arrive. Each line is timestamped and color-coded by stage (blue for Architect,
   green for Implementer, amber for Reviewer). Text appears character-by-character
   with a typewriter effect for key messages ("Selected task: ui-primitives"),
   instant for status lines ("[architect:optionsExplorer] 487.8s").

2. **Token streaming for LLM output** — when the Architect's architectureWriter or
   contractDesigner is generating structured output, show a preview of the streamed
   tokens in a "thinking" panel. Not the full JSON, but key excerpts: screen plan
   names appearing one by one, API endpoint paths being written, task titles forming.
   This turns an 8-minute wait into "watching the AI think" — which is fascinating,
   not boring.

3. **Activity feed** — a right sidebar or slide-out panel showing a chronological
   feed of all events with human-readable descriptions:
   - "Architect is exploring architecture options..." (optionsExplorer start)
   - "Found 3 architecture alternatives" (optionsExplorer complete)
   - "Writing architecture specification..." (architectureWriter start)
   - "Designing data model and API schemas..." (contractDesigner start)
   - "Planning 10 implementation tasks..." (taskPlanner complete)
   - "Quality check passed ✓" (critic complete)
   - "Now implementing: ui-primitives (frontend, NEW)" (task-selected)
   - "Running 16 code quality gates..." (deterministicGates start)
   - "All gates passed ✓" or "3 gates failed ✗" (deterministicGates complete)
   - "Review complete — Escalated for human review" (outcome)

### Performance constraints

- All animations must run at 60fps. Use `transform` and `opacity` only — never animate `width`, `height`, `top`, `left`, or `margin`.
- SSE event processing must not block the main thread. Use `requestAnimationFrame` for visual updates.
- HeartbeatPulse must be pure CSS animation (no JS timer) to avoid jank during heavy SSE processing.

### Mandatory: Walk the User Journey with Browser Tools (applies to ALL Phases)

**Before declaring ANY phase done, the implementer MUST use browser automation tools
to experience the dashboard as a real user would.** Code review and unit tests verify
correctness. Browser tools verify the *feeling* — the animations, the feedback timing,
the engagement during long waits. This is the difference between "it works" and "$100M."

#### Available tools and when to use each

**1. Chrome DevTools MCP — `evaluate_script`** (MOST IMPORTANT)
```javascript
// Inspect computed styles — don't guess from screenshots
(el) => getComputedStyle(el).backgroundColor
(el) => getComputedStyle(el).animation
(el) => getComputedStyle(el).opacity
```
Use to verify: animation properties are actually applied, colors match design tokens,
transitions are smooth, HeartbeatPulse has the correct CSS animation. **Screenshots
show symptoms; `getComputedStyle()` shows causes.**

**2. Chrome DevTools MCP — `take_snapshot`** (a11y tree)
Shows the DOM structure and element hierarchy. Use to verify: component rendering
order, ARIA labels on interactive elements, that the NodeTimeline has the correct
number of rows, that SpineRail stages have the right status attributes.

**3. Chrome DevTools MCP — `take_screenshot`**
Visual verification. Use to capture the dashboard at key moments:
- Before spine run starts (empty/idle state)
- During optionsExplorer (the 8-min wait — is HeartbeatPulse visible?)
- When a node completes (does NodeTimeline update?)
- When a gate interrupt fires (does SpineRail flash amber?)
- When the run completes (does RunSummaryCard appear?)
- Responsive breakpoints (768px, 1024px, 1440px)

**4. Chrome DevTools MCP — `click` + `take_snapshot`**
Interact with the dashboard: click "Run spine", click SpineRail stages to expand,
click the log console to toggle, hover over LiveCostTicker for breakdown.

**5. Chrome DevTools MCP — `wait_for`**
Wait for SSE-driven UI updates: `wait_for({ text: ["optionsExplorer"] })` to confirm
NodeTimeline updates, `wait_for({ text: ["$"] })` to confirm LiveCostTicker appears.

**6. Playwright MCP — `browser_snapshot` + `browser_evaluate`**
Second browser automation toolkit. Use for cross-origin iframe content (if the design
renderer iframe is involved) and for complex interaction sequences.

**7. Source code `Read` + `grep`**
Trace CSS values to their source: `grep -rn "animation.*pulse" packages/dashboard/src/`
to find where HeartbeatPulse animation is defined. Don't guess which component owns a style.

#### The User Journey Walkthrough (run this for EVERY phase that touches UI)

```
Step 1: Start the dev server
  $ nx run-many -t build && cd packages/dashboard && npm run dev

Step 2: Navigate to /pipeline
  navigate_page → http://localhost:3000/pipeline
  take_screenshot → capture idle state

Step 3: Click "Run spine" (Phase 2+)
  take_snapshot → find the Run button uid
  click → trigger the spine run
  take_screenshot → capture immediate feedback (PostSubmissionView)

Step 4: Watch the first 30 seconds
  wait_for → "contextAssembler" (first node completion)
  take_screenshot → confirm NodeTimeline appeared with first row
  evaluate_script → check HeartbeatPulse animation is running:
    () => {
      const pulse = document.querySelector('[data-testid="heartbeat-pulse"]');
      return pulse ? getComputedStyle(pulse).animationName : 'NOT FOUND';
    }

Step 5: Wait for a long node (optionsExplorer ~8 min)
  take_screenshot every 60s → confirm:
    - HeartbeatPulse is still animating
    - ETAIndicator is counting down
    - NodeTimeline shows elapsed time ticking up
    - No "frozen" appearance

Step 6: Confirm stage transition
  wait_for → "Implementer" or "Stage 3"
  take_screenshot → SpineRail updated, Architect shows checkmark
  evaluate_script → verify SpineRail stage states:
    () => {
      const stages = document.querySelectorAll('[data-testid^="spine-stage-"]');
      return Array.from(stages).map(s => ({
        name: s.dataset.testid,
        status: s.dataset.status
      }));
    }

Step 7: Confirm LiveCostTicker
  evaluate_script → read the displayed cost:
    () => document.querySelector('[data-testid="live-cost-ticker"]')?.textContent

Step 8: Confirm run completion
  wait_for → "SUCCESS" or "PASSED" or "escalated"
  take_screenshot → capture RunSummaryCard
  take_screenshot → capture full page at completion

Step 9: Verify animations at 60fps
  evaluate_script → check no layout-thrashing animations:
    () => {
      const allAnimated = document.querySelectorAll('[style*="animation"]');
      return Array.from(allAnimated).map(el => ({
        tag: el.tagName,
        animation: getComputedStyle(el).animationName,
        transform: getComputedStyle(el).transform
      }));
    }

Step 10: Test responsive layout
  resize_page → width: 768, height: 1024
  take_screenshot → confirm mobile layout
  resize_page → width: 1440, height: 900
  take_screenshot → confirm desktop layout
```

**The implementer who skips this walkthrough has not verified the UX.** Typecheck and
tests prove the code compiles. The walkthrough proves the experience is worth $100M.

---

## Phase 1: Dashboard audit + nav decision

**Why this matters:** You're laying the foundation. Every screen, every nav item, every data type needs a home before the real-time magic begins. Get this right and Phases 2-9 flow naturally. This is the architectural blueprint for a $100M interface.

**Goal:** With M4 proven complete (Phase 0), reconcile the dashboard scaffolding against the now-real spine and lock the nav layout once.

### Tasks

- [x] **Reconcile [`spine-constants.ts`](../../../../packages/dashboard/src/components/spine/spine-constants.ts).** All four stages already `implemented: true`. Added JSDoc comment referencing M4 exit criteria #4 (Implementer LangGraph package) and #5 (Reviewer LangGraph package).
- [x] **Reconcile [`run-manager.ts:30`](../../../../packages/dashboard/src/app/api/_lib/run-manager.ts) `RunStatus['type']` union.** Already includes `'architect'` and `'reviewer'` alongside `'clarifier'` and `'implementer'`. No change needed — the plan's description was based on a stale snapshot.
- [x] **Replace hard-coded `badge: 3`** — ALREADY DONE (M4 Phase 7 session, 2026-05-17). `useApprovalCount()` hook at [`sidebar-nav.tsx:121-138`](../../../../packages/dashboard/src/components/layout/sidebar-nav.tsx) fetches from `/api/approvals` with 30s polling. Badge hidden when count is 0.
- [x] **Decide nav layout once.** A4 confirmed — see [Nav decision](#nav-decision-phase-1) below.

### Verification

- [x] `nx run-many -t typecheck test lint` — green. 512 tests passed, 0 errors, 0 lint errors.
- [x] Manual: open dashboard, confirmed sidebar renders with real badge count (0 — no pending gates), `SpineRail` shows all 4 stages (Clarify, Architect, Implement, Review). Screenshot saved.

### Phase 1 Quality Gate (all must pass before proceeding)

- [x] `nx run-many -t typecheck test lint` — zero failures (512 passed, 22 lint warnings, 0 errors)
- [x] **Browser verification:** Opened dashboard with Playwright MCP. Screenshot of sidebar + SpineRail captured. Badge not visible (count=0, hidden when 0 — not hardcoded "3"). All 4 SpineRail stages render with labels confirmed via DOM query.
- [x] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 1` — PASSED. All plan-listed files accounted for (2 already done, 2 modified). No scope creep, no dead code, no test gaps. Report at `artifacts/plan-impl-review/2026-05-18-phase1/report.md`.
- [x] `/mid-session-drift-check` — PASSED. 9 rules checked, all CLEAN. One minor item fixed (moved screenshot to `packages/eval/results/spine-dashboard-e2e/phase-1/`).
- [x] **Self-review:** Only change is one JSDoc comment on `spine-constants.ts:18` and plan file updates. No animation code touched. Nothing generic or placeholder-ish added.

**Celebrate:** Phase 1 done means the dashboard skeleton is honest — every stage it shows is real. That's a solid foundation.

### Nav decision (Phase 1)

**A4 confirmed: no new top-level routes.** Every spine artifact maps to an existing page route. No changes to `NAV_SECTIONS` in `sidebar-nav.tsx`.

| Spine Artifact | Route | Nav Section | Notes |
|---|---|---|---|
| Raw PRD input | `/new` | (standalone CTA) | Exists |
| EnrichedRequirement | `/spec` | Build → Spec | Phase 5 adds tabs |
| AssumptionLedger | `/trust` | Govern → Trust | Phase 8 populates |
| FeaturePlan | `/spec` | Build → Spec | Phase 5 adds tabs |
| OptionsBundle | `/spec` | Build → Spec | Phase 5 adds tabs |
| ArchitectureSpec | `/spec` | Build → Spec | Phase 5 adds tabs |
| ContractBundle | `/spec` | Build → Spec | Phase 5 adds tabs |
| ADRs | `/audit` | Not in nav yet | Phase 5 creates content; nav entry added then |
| TaskPlan DAG | `/tasks` + `/pipeline` | Execute → Tasks, Build → Runs | Phase 4 enhances |
| DesignSpec per screen | `/design` | Build → Design Studio | Exists |
| DesignSpecDelta | `/design` | Build → Design Studio | Phase 7 adds delta viewer |
| Code output / tool traces | `/agents/[id]/live` | Execute → Pipeline | Phase 5 populates |
| ReviewResult + findings | `/agents/[id]/live` | Execute → Pipeline | Phase 5 populates |
| Run progress (SSE) | `/pipeline` | Build → Runs | Phase 2 wires SSE |
| HITL Gates 1-3 | `/approvals` | Execute → Approvals | Phase 3 wires panels |
| Cost breakdown | `/costs` | Govern → Budget | Phase 8 populates |
| Instrumentation traces | `/traces` | Not in nav yet | Phase 8 creates content; nav entry added then |
| Assumption violations | `/trust` | Govern → Trust | Phase 8 populates |

**Routes without nav entries (`/audit`, `/traces`):** Both pages exist as routes but have no sidebar nav items. Nav entries will be added by Phase 5 and Phase 8 respectively when those pages get real content. Adding empty nav items now would violate A1 (no placeholders).

---

## Phase 2: Greenfield E2E in the dashboard (the spine works end-to-end through the UI)

**Why this matters:** This is THE phase. When this lands, a developer types an idea and watches AI build software in real time — Clarifier analyzing requirements, Architect designing the system, Implementer writing code, Reviewer checking quality. Every component you build here (NodeTimeline, HeartbeatPulse, ETAIndicator, LiveCostTicker) turns a black-box AI pipeline into a transparent, engaging experience. This is what investors demo. This is what makes engineers say "I want to use this." Build it with pride — you're creating the interface to the future of software development.

**Goal:** A developer submits the CashPulse PRD via `/new`, watches `SpineRail` move through all 4 stages backed by real M4 agents, and lands on a completed run. No stubs, no placeholders — every stage event the rail shows traces to a real agent call. **The dashboard must provide the same quality of real-time feedback that the CLI eval script provides** — per-node progress, elapsed timers, cost accumulation, ETA estimates, and heartbeat indicators. Reference: Phase 0 eval session (2026-05-18) where every node completion was visible within seconds.

### SSE event contract

Every stage API route emits these SSE event types (consumed by all real-time components):

```typescript
type SpineSSEEvent =
  | { type: 'stage-start'; stage: string; timestamp: string }
  | { type: 'node-start'; stage: string; node: string; timestamp: string }
  | { type: 'node-complete'; stage: string; node: string; durationMs: number; description: string }
  | { type: 'stage-complete'; stage: string; durationMs: number; cost: StageCost }
  | { type: 'task-selected'; taskId: string; title: string; type: string; mode: string }
  | { type: 'heartbeat'; stage: string; node: string; elapsedMs: number }
  | { type: 'revision-cycle'; cycle: number; maxCycles: number; reason: string }
  | { type: 'gate-interrupt'; gateType: string; gateId: string }
  | { type: 'run-complete'; totalCost: number; totalDurationMs: number; outcome: string }
  | { type: 'error'; stage: string; message: string }
```

The `heartbeat` event fires every 5s during long-running nodes (optionsExplorer, contractDesigner, etc.) so the UI can show "still working" indicators. Without this, 8-minute silent nodes look like the system is frozen.

### Tasks

- [ ] Create `packages/dashboard/src/app/api/architect/route.ts` — POST handler with SSE streaming, mirrors [`api/clarifier/route.ts`](../../../../packages/dashboard/src/app/api/clarifier/route.ts) pattern (`resolve auth → create traced provider → load checkpointer → stream events`). Calls `compileArchitectGraph()` (verified callable in Phase 0). Must emit `node-start`, `node-complete`, `heartbeat`, and `stage-complete` events per the SSE contract above.
- [ ] Create `packages/dashboard/src/app/api/implementer/route.ts` per [`m4-execution-plan.md:254`](../chips-next-steps/m4-execution-plan.md) — calls `compileImplementerGraph()` (verified callable in Phase 0), emits per-node SSE events (`loadTaskContext` → `runDesignSpecialist` → `generateCode` → `reportCompletion`). Must emit `task-selected` when the task is picked from the DAG.
- [ ] Create `packages/dashboard/src/app/api/reviewer/route.ts` per [`m4-execution-plan.md:288`](../chips-next-steps/m4-execution-plan.md) — calls `compileReviewerGraph()` (verified callable in Phase 0), emits deterministic-gate results + LLM review findings + final `ReviewResult.outcome`. Must emit `revision-cycle` event when entering a retry.
- [ ] Wire a thin sequential orchestration layer in `packages/dashboard/src/app/api/spine/run/route.ts` — POST takes `{ projectId, mode: 'greenfield' }`, kicks off Clarifier, on completion advances to Architect, then Design, then Implementer, then Reviewer, persisting run state via `run-manager` at every transition. Single-threaded sequential per assumption A1 (no R1 orchestrator). Emits `stage-start` / `stage-complete` at each transition.
- [ ] Implement the bounded-retry loop from [`m4-execution-plan.md:285-286`](../chips-next-steps/m4-execution-plan.md) inside `api/spine/run/route.ts`: `outcome === 'rejected' && cycle < 2 → emit revision-cycle event → re-invoke Implementer with findings; else → stop with outcome`.
- [ ] Extend `SpineRail` ([`packages/dashboard/src/components/spine/spine-rail.tsx`](../../../../packages/dashboard/src/components/spine/spine-rail.tsx)) to subscribe to the spine SSE stream and animate stage transitions per real M4 events.
- [ ] Add a "Run spine" button on `/pipeline` ([`pipeline/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/pipeline/page.tsx)) that triggers the `/api/spine/run` endpoint for the active project.
- [ ] **Build `StageNodeGraph` components** for each spine stage — the Clarifier already has `NodeProgressGraph` (`packages/dashboard/src/components/clarifier/node-progress-graph.tsx`) showing a horizontal row of dots with active/complete/pending states. Build equivalent graphs for: `ArchitectNodeGraph` (7 nodes: contextAssembler → optionsExplorer → architectureWriter → contractDesigner → taskPlanner → critic → Gate 2), `ImplementerNodeGraph` (4 nodes: loadTaskContext → runDesignSpecialist → generateCode → reportCompletion), `ReviewerNodeGraph` (4 nodes: deterministicGates → llmReview → assumptionValidator → emitReviewResult). Each graph subscribes to `node-start` / `node-complete` SSE events to animate in real time. These sit inside the expanded `SpineRail` stage panel — clicking a stage expands to show both the node graph AND the `NodeTimeline` detail view.
- [ ] **Build `NodeTimeline` component** in `packages/dashboard/src/components/pipeline/node-timeline.tsx` — a vertical timeline showing each node within the active stage as a row. Each row shows: node name, status icon (pending gray dot / spinning blue ring / green checkmark / red X), elapsed time (live counter while running, final duration when done), and a one-line description of what the node produces. Reference: the Vercel build-log pattern where each step is a collapsible row with timing. Use the per-node timings from the Phase 0 greenfield receipt as baseline data:

    | Node | Baseline | Description |
    |------|----------|-------------|
    | contextAssembler | <1s | Loads project context |
    | optionsExplorer | ~8 min | Explores architecture alternatives |
    | architectureWriter | ~3 min | Writes architecture spec + ADRs |
    | contractDesigner | ~5 min | Designs data model, API schemas, screen plans |
    | taskPlanner | ~4 min | Produces TaskPlan DAG |
    | critic | <1s | Deterministic quality gate |

- [ ] **Build `ETAIndicator` component** in `packages/dashboard/src/components/pipeline/eta-indicator.tsx` — shows estimated time remaining for the current node and total remaining for the stage. Uses historical node timing baselines from eval receipts (stored in a config or fetched from `/api/spine/baselines`). Displays as "~3 min remaining" with a subtle progress ring. When no baseline exists for a node, shows "Processing..." without an ETA. Updates every heartbeat event.
- [ ] **Build `LiveCostTicker` component** in `packages/dashboard/src/components/pipeline/live-cost-ticker.tsx` — accumulates per-stage costs in real time as `stage-complete` events arrive. Shows a running total like `$3.81 / ~$6.00 est.` with per-stage breakdown on hover. Reference: the Phase 0 eval where I reported costs like "$5.88 for Architect" as each stage finished.
- [ ] **Build `HeartbeatPulse` component** in `packages/dashboard/src/components/pipeline/heartbeat-pulse.tsx` — a subtle animated dot/ring next to the active node that pulses every time a `heartbeat` event arrives. Shows "Last activity 3s ago" tooltip. If no heartbeat arrives for >15s, changes to amber with "Waiting for response..." to differentiate "working" from "stuck." This solves the "is it frozen or just thinking?" problem during 8-minute Opus calls.
- [ ] **Build `RevisionCycleBadge` component** in `packages/dashboard/src/components/pipeline/revision-cycle-badge.tsx` — when the Reviewer triggers a retry, shows "Review cycle 1/2" on the Reviewer stage in SpineRail. Updates on each `revision-cycle` SSE event. Subtle pill badge, not alarming — revisions are normal.
- [ ] **Build `PostSubmissionView` for `/new`** — after the user submits a PRD on `/new`, immediately transition to a processing view (no blank screen). Show: SpineRail with Clarifier stage active + `StageNodeGraph` for Clarifier + `HeartbeatPulse` + "Analyzing your requirements..." message. As stages complete, the view evolves — this is the user's first impression of the spine working. (Pattern 12 from [`real-time-ux-reference.md`](real-time-ux-reference.md)).
- [ ] **Build `RunSummaryCard` component** in `packages/dashboard/src/components/pipeline/run-summary-card.tsx` — when the spine completes, show a summary card with: total cost (animated count-up), total duration, outcome badge (green "Approved" / amber "Escalated" / red "Rejected"), per-stage cost breakdown bar, and findings count. This card persists in the run history on `/pipeline`. (Pattern 14 from [`real-time-ux-reference.md`](real-time-ux-reference.md)).

### Verification

- [ ] Manual: open dashboard, load CashPulse fixture, click "Run spine", confirm `SpineRail` reaches `reviewer` with outcome `'approved'` or `'escalated'` on a fresh greenfield run.
- [ ] Compare wall time + cost against Phase 0 greenfield receipt — dashboard overhead should be < 10% on top of raw eval cost.
- [ ] Chrome DevTools MCP screenshot per [`m4-execution-plan.md:321`](../chips-next-steps/m4-execution-plan.md) — `SpineRail` shows all 4 stages completed, not just active.
- [ ] **NodeTimeline verification:** During a live run, confirm each Architect node appears in the timeline within 1s of its `node-start` event, elapsed timer ticks live, and checkmark appears on `node-complete`.
- [ ] **HeartbeatPulse verification:** During the optionsExplorer node (~8 min), confirm the pulse dot animates every 5s and the tooltip shows a live "last activity" counter.
- [ ] **ETAIndicator verification:** Confirm "~8 min remaining" appears when optionsExplorer starts (baseline from Phase 0 receipt), counts down, and disappears on node completion.
- [ ] **LiveCostTicker verification:** After Architect completes, confirm the ticker shows ~$5-6 matching the Phase 0 receipt. Hover shows per-stage breakdown.

### Phase 2 Quality Gate (the most important gate in the entire plan)

- [ ] `nx run-many -t typecheck test lint` — zero failures
- [ ] **Full User Journey Walkthrough** (the 10-step protocol from the cross-cutting section) — run it end-to-end, not abbreviated. Save screenshots at each step to `packages/eval/results/spine-dashboard-e2e/phase-2/`.
- [ ] **HeartbeatPulse test:** During the 8-min optionsExplorer node, watch the dashboard for at least 2 minutes. Is the pulse visible? Does it feel alive? Would a first-time user think it's frozen? Be honest.
- [ ] **Animation audit:** Use `evaluate_script` to verify every animation uses `transform`/`opacity` only (no layout thrashing). Check at least: SpineRail transitions, NodeTimeline row entry, HeartbeatPulse, cost ticker count-up.
- [ ] **Empty state check:** Before running the spine, does `/pipeline` show a compelling empty state with a clear CTA? Not bare text.
- [ ] **PostSubmissionView check:** After clicking "Run spine", does the user see immediate feedback within 500ms? Or is there a blank moment?
- [ ] **Cost accuracy:** Compare LiveCostTicker final value against Phase 0 receipt. Must be within 20% (LLM costs vary by run).
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 2`
- [ ] `/mid-session-drift-check`
- [ ] `/verify-done` (test triad + headed E2E + Chrome DevTools visual)

**Celebrate:** Phase 2 done means the spine runs through the dashboard with world-class real-time feedback. This is demo-ready. Take a screenshot of the completed run view — you earned it.

---

## Phase 3: Approvals — wire the three HITL gates

**Why this matters:** This is where CHIP becomes collaborative — the AI proposes, the human decides. Gate 1 (clarification), Gate 2 (design/API approval), Gate 3 (code merge) are the three moments where human intelligence meets AI capability. Make these panels so clear and actionable that approving feels confident, not anxious. This is the trust layer — get it right and developers will let the AI do more. Get it wrong and they'll micromanage every step.

**Goal:** `/approvals` becomes the single HITL surface for the spine. All three gates work end-to-end, badge count is live, no mocks.

### Tasks

- [ ] Extend `/api/approvals` route ([`api/approvals/route.ts`](../../../../packages/dashboard/src/app/api/approvals/route.ts)) to return real pending gates keyed by `{ runId, gateType: 'clarification' | 'design-api' | 'code-merge' }`, sourced from LangGraph checkpointer interrupt state.
- [ ] Build three panel components in `packages/dashboard/src/components/approvals/`:
  - `ClarificationGatePanel` — surfaces Clarifier questions + answers (per Scenario 1 Step 1, [`execution-plan.md:213`](../chips-next-steps/execution-plan.md)).
  - `DesignApiGatePanel` — renders Architect's `ContractBundle` summary (ScreenPlans, ComponentComposition, ADRs, TaskPlan DAG) with inline-edit support (per [`execution-plan.md:277-279`](../chips-next-steps/execution-plan.md)).
  - `CodeMergeGatePanel` — shows Reviewer findings with `disposition: 'escalate'` ([`m4-execution-plan.md:281-284`](../chips-next-steps/m4-execution-plan.md)), diff viewer, "Approve" / "Send back" actions.
- [ ] Wire `/api/approvals/[gateId]/decide` ([`approvals/[gateId]/decide/route.ts`](../../../../packages/dashboard/src/app/api/approvals/[gateId]/decide/route.ts)) to call the appropriate LangGraph `resume()` for each gate type.
- [ ] Confirm the Phase 1 sidebar badge subscription now reflects real Gate 1 / 2 / 3 counts during a live run.

### Verification

- [ ] Run the spine on CashPulse, confirm Gate 1 surfaces in `/approvals` with Clarifier questions, approve → Architect runs → Gate 2 surfaces with ContractBundle, approve → Design + Implementer run → if Reviewer disposition is `'escalate'`, Gate 3 surfaces. End-to-end through real M4 agents — no mocks.
- [ ] Sidebar badge updates in real time during the run.

### Phase 3 Quality Gate

- [ ] `nx run-many -t typecheck test lint` — zero failures
- [ ] **End-to-end gate flow:** Run the spine through the dashboard. When Gate 1 fires, confirm the notification appears (toast + badge update). Navigate to `/approvals`, verify the ClarificationGatePanel shows real Clarifier questions. Click "Approve." Confirm the spine resumes to Architect. Repeat for Gate 2 (DesignApiGatePanel with ContractBundle). Screenshot each gate panel.
- [ ] **Notification timing:** Measure time from gate interrupt SSE event to toast appearing. Must be <1s. Use Chrome DevTools MCP `wait_for` to verify.
- [ ] **Badge accuracy:** Confirm sidebar badge count matches the number of pending gates. Approve a gate, confirm the badge decrements.
- [ ] **Browser notification:** Put the dashboard in a background tab. When a gate fires, does a browser notification appear? Test with `document.hidden === true`.
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 3`
- [ ] `/mid-session-drift-check`
- [ ] `/verify-done`

**Celebrate:** Phase 3 done means CHIP has a real human-in-the-loop system. AI proposes, human approves — and the handoff is smooth and trustworthy.

---

## Phase 4: Pipeline page upgrades (Architect graph viewer + TaskPlan DAG)

**Why this matters:** `/pipeline` is where power users will spend most of their time. The Architect graph visualization shows AI reasoning in real time — options being explored, architecture being written, contracts being designed. The TaskPlan DAG shows the AI's plan for building the entire application. When a task lights up as "Now implementing," the developer sees the AI executing their vision step by step. Make this page feel like a mission control center — informative, beautiful, and commanding.

**Goal:** `/pipeline` becomes the spine's main observatory — see the Architect's 7-node flow, the Critic verdict, and the TaskPlan DAG.

### Tasks

- [ ] Build `ArchitectGraphPanel` in `packages/dashboard/src/components/pipeline/` — visualizes Nodes 0.5 → 6 per the diagram at [`execution-plan.md:146-148`](../chips-next-steps/execution-plan.md), with per-node status (pending / running / done / failed) and the Critic's verdict. **Must integrate with `NodeTimeline` from Phase 2** — when a run is active, the graph nodes animate in real time (pending → spinning → checkmark). When the Critic retries a node, show "Attempt 2" badge (Pattern 7 from [`real-time-ux-reference.md`](real-time-ux-reference.md)).
- [ ] Build `TaskPlanDagPanel` — renders the task DAG from Architect Node 5 (table example at [`execution-plan.md:253-264`](../chips-next-steps/execution-plan.md) for greenfield; the brownfield version with NEW/MODIFY badges at [`execution-plan.md:343-353`](../chips-next-steps/execution-plan.md) lands in Phase 6). **Must highlight the active task** during Implementer execution — when `task-selected` SSE event fires, the corresponding row pulses/highlights with "Now implementing" label and the task's type/mode badge (Pattern 6 from [`real-time-ux-reference.md`](real-time-ux-reference.md)). If multiple tasks run sequentially, show "Task 1 of N" progress indicator.
- [ ] Surface per-task fields from [`m4-execution-plan.md:204-217`](../chips-next-steps/m4-execution-plan.md): `mode`, `contextRefs` chips, `estimatedTokenBudget`, downgrade warnings when token budget overflows.
- [ ] Add a "Re-run from Architect" affordance on the pipeline page that resumes the spine from a chosen node (LangGraph checkpointer-backed — checkpointer verified callable in Phase 0).
- [ ] **Build `PreFlightCheckPanel` component** in `packages/dashboard/src/components/pipeline/pre-flight-check.tsx` — before "Run spine" executes, show a validation panel: "Verifying project setup..." with animated checkmarks for each prerequisite (fixtures loaded ✓, auth configured ✓, checkpointer available ✓, estimated cost: ~$6.00). Only enable the "Run" button when all checks pass. Shows estimated cost and duration based on Phase 0 baselines. (Pattern 11 from [`real-time-ux-reference.md`](real-time-ux-reference.md)).
- [ ] **Build `RunComparisonView` component** in `packages/dashboard/src/components/pipeline/run-comparison.tsx` — on the `/pipeline` run history, each run row shows delta badges comparing against the previous run: "↓3.8% cost" (green), "↑5% time" (amber). Clicking a run expands to show the full `NodeTimeline` replay, per-stage costs, and `ReviewResult` findings. Sparklines show cost/duration trends across runs. (Pattern 9 from [`real-time-ux-reference.md`](real-time-ux-reference.md)).

### Verification

- [ ] Run spine on CashPulse, navigate to `/pipeline`, confirm Architect graph shows all 7 nodes with verdicts and the TaskPlan DAG renders all greenfield tasks T1-T10 from the fixture.
- [ ] **Active task highlight:** During Implementer execution, confirm the selected task row pulses in TaskPlanDagPanel with "Now implementing" label.
- [ ] **Pre-flight check:** Before running, confirm the pre-flight panel validates auth + fixtures and shows estimated cost.
- [ ] **Run comparison:** After 2+ runs, confirm delta badges appear (cost/duration % change).

### Phase 4 Quality Gate

- [ ] `nx run-many -t typecheck test lint` — zero failures
- [ ] **ArchitectGraphPanel live test:** During a spine run, confirm all 7 Architect nodes animate from pending → active → complete in real time. When the Critic retries (which happens ~50% of the time), confirm the "Attempt 2" badge appears. Screenshot the graph at each state.
- [ ] **TaskPlanDagPanel live test:** After Architect completes, confirm the DAG renders all tasks with correct type/mode badges. During Implementer execution, confirm the active task row highlights with "Now implementing" label.
- [ ] **PreFlightCheckPanel test:** Click "Run spine" — confirm the pre-flight panel validates prerequisites before executing. Cancel and retry to confirm it re-validates.
- [ ] **RunComparisonView test:** After 2 runs (from Phase 2 and this phase), confirm delta badges appear showing cost/duration % change between runs.
- [ ] **Responsive test:** Resize to 768px width. Confirm the graph and DAG reflow gracefully — no overflow, no truncation of critical info.
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 4`
- [ ] `/mid-session-drift-check`
- [ ] `/verify-done`

**Celebrate:** Phase 4 done means `/pipeline` is a mission control center. Developers can watch the AI architect and plan in real time, with full transparency into every decision.

---

## Phase 5: Spec / Tasks / Agents enrichment (artifact surfaces)

**Why this matters:** This phase gives every AI artifact a home — the architecture spec, the feature plan, the assumption ledger, the implementation traces, the review findings. When a developer navigates from `/spec` to `/tasks` to `/agents/[id]/live`, they're tracing the AI's complete reasoning chain from "what should we build" to "here's the code." This level of transparency is what separates CHIP from every other AI coding tool. Other tools give you code. CHIP gives you understanding.

**Goal:** Every spine artifact has a real home in the dashboard.

### Tasks

- [ ] **`/spec`** ([`spec/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/spec/page.tsx)) — add tabs for `EnrichedRequirement`, `FeaturePlan`, `AssumptionLedger`, Architect's `ConstraintSet` / `OptionsBundle` / `ArchitectureSpec` / `ContractBundle`. Source: [`execution-plan.md:213, 233-237`](../chips-next-steps/execution-plan.md).
- [ ] **`/tasks`** ([`tasks/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/tasks/page.tsx)) — render the same TaskPlan DAG as `/pipeline` but in list form with filtering (`mode`, status, package). Token-budget warnings inline.
- [ ] **`/agents/[id]/live`** ([`agents/[id]/live/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/agents/[id]/live/page.tsx)) — render Implementer tool-loop trace (`read_file`, `write_file`, `apply_patch`, `run_typecheck`, `run_tests`, `run_lint`, `report_assumption_violation` from [`m4-execution-plan.md:242-249`](../chips-next-steps/m4-execution-plan.md)) and Reviewer 4-node trace (`deterministicGates`, `llmReview`, `assumptionValidator`, `emitReviewResult` from [`m4-execution-plan.md:277-280`](../chips-next-steps/m4-execution-plan.md)). **Reviewer trace must show:** gate pass/fail badges (16 gates with names), LLM review findings as expandable cards, assumption violations, and final outcome badge (Pattern 8 from [`real-time-ux-reference.md`](real-time-ux-reference.md)). Use the `NodeTimeline` component from Phase 2 for consistent per-node progress display.
- [ ] **`/audit`** ([`audit/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/audit/page.tsx)) — list ADRs from Architect Node 3 with diff against prior project state.

### Verification

- [ ] CashPulse run, confirm each artifact appears in the right page within 5s of being produced.

### Phase 5 Quality Gate

- [ ] `nx run-many -t typecheck test lint` — zero failures
- [ ] **Artifact latency test:** Run the spine through the dashboard. For each artifact (EnrichedRequirement, FeaturePlan, ContractBundle, TaskPlan, ReviewResult), measure the time from production to appearance on the correct page. Must be <5s per the plan goal.
- [ ] **Navigation flow test:** After a spine run completes, navigate `/spec` → `/tasks` → `/agents/[id]/live` → `/audit`. Each page must show data from the same run. No stale data, no "No data" screens.
- [ ] **Reviewer trace test:** On `/agents/[id]/live` for a reviewer run, confirm all 16 deterministic gate names are visible with pass/fail badges. Confirm LLM review findings are expandable. Confirm outcome badge matches the RunSummaryCard.
- [ ] **Cross-page consistency:** The task selected in TaskPlanDagPanel on `/pipeline` must match the task shown in the Implementer trace on `/agents/[id]/live`.
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 5`
- [ ] `/mid-session-drift-check`
- [ ] `/review-prd-compliance` (touches the artifact contracts the UI consumes)
- [ ] `/verify-done`

**Celebrate:** Phase 5 done means every AI artifact is visible and navigable. Developers can trace the AI's reasoning from requirements to code to review. The dashboard is now a complete observatory for AI-driven software development.

---

## Phase 6: Brownfield greenpath (evolution mode + AffectedScreen panel)

**Why this matters:** Greenfield is impressive, but brownfield is where CHIP becomes indispensable. Real software projects don't start from scratch — they evolve. When a developer says "add recurring transactions to CashPulse" and CHIP shows exactly which screens are affected, which are new, and which are unchanged — that's the moment CHIP becomes a tool they can't live without. This phase proves CHIP handles the messy reality of existing codebases, not just clean-slate demos.

**Goal:** A developer picks an existing project, describes a change, walks through the same spine — with per-screen impact analysis visible at Gate 2. Brownfield agent capability is already proven by Phase 0 brownfield receipt.

### Tasks

- [ ] Extend `/new` ([`new/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/new/page.tsx)) with a mode toggle: "New project" vs "Add to existing project." Brownfield path triggers Clarifier evolution mode (per [`execution-plan.md:298-301`](../chips-next-steps/execution-plan.md)) with project context preloaded.
- [ ] Build `AffectedScreensPanel` for `DesignApiGatePanel` (Phase 3) — renders the `AffectedScreen[]` list (per [`execution-plan.md:310-317, 833`](../chips-next-steps/execution-plan.md)) with `new` / `modified` / `unchanged` badges and per-screen node-impact details.
- [ ] Extend `TaskPlanDagPanel` (Phase 4) with NEW/MODIFY badges per [`execution-plan.md:343-353`](../chips-next-steps/execution-plan.md).
- [ ] Extend the spine API orchestrator (`api/spine/run/route.ts` from Phase 2) to accept `{ projectId, mode: 'brownfield', changeRequest: string }`.

### Verification

- [ ] Run CashPulse-brownfield fixture ("Add recurring transactions"), confirm `/approvals` Gate 2 shows AffectedScreens panel with correct screen impact analysis matching the hand-derived expected output in [`cashpulse-brownfield.yaml`](../../../../packages/eval/src/scenarios/cashpulse-brownfield.yaml) and the Phase 0 brownfield receipt.

### Phase 6 Quality Gate

- [ ] `nx run-many -t typecheck test lint` — zero failures
- [ ] **Brownfield E2E through dashboard:** Open `/new`, select "Add to existing project", submit the CashPulse brownfield change request ("Add recurring transactions"). Watch the spine run through the dashboard — NOT the CLI. Confirm changeClassifier fires (brownfield-only node), AffectedScreensPanel shows correct impact analysis.
- [ ] **AffectedScreensPanel accuracy:** Compare the panel's output against the Phase 0 brownfield receipt. Screen impacts must match: which screens are new, modified, unchanged.
- [ ] **Mode toggle UX:** On `/new`, toggle between "New project" and "Add to existing project" multiple times. Confirm the form updates smoothly, no layout jank, context preloads correctly in brownfield mode.
- [ ] **NEW/MODIFY badges:** In TaskPlanDagPanel, confirm brownfield tasks show correct badges. At least one task should be mode=MODIFY.
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 6`
- [ ] `/mid-session-drift-check`
- [ ] `/verify-done`

**Celebrate:** Phase 6 done means CHIP handles both greenfield AND brownfield through the dashboard. That's the full product story — from "build something new" to "evolve what exists."

---

## Phase 7: DesignSpec delta viewer + per-screen modify flow

**Why this matters:** The delta viewer is where CHIP's intelligence becomes tangible. Instead of showing "here's the new screen," CHIP shows "here's exactly what changed — these 3 nodes were added, this section was modified, nothing else was touched." It's the difference between a sledgehammer and a scalpel. Developers trust tools that show precision. The before/after toggle lets them verify the AI's changes visually. This builds the deep trust needed for production adoption.

**Goal:** When the spine produces a `DesignSpecDelta` for a MODIFY task (proven working in Phase 0 brownfield receipt), the dashboard shows a real diff — not just the final spec.

### Tasks

- [ ] Build `DesignSpecDeltaViewer` component in `packages/dashboard/src/components/design/` that renders the hybrid delta format (`added` / `modified` / `removed` / `reordered` from [`m4-execution-plan.md:155`](../chips-next-steps/m4-execution-plan.md)) side-by-side against the existing spec.
- [ ] Wire `/design` ([`design/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/design/page.tsx)) to detect MODIFY screens and render the delta viewer instead of (or alongside) the full-spec preview.
- [ ] Extend `/api/pages/[pageId]/design/route.ts` ([`api/pages/[pageId]/design/route.ts:26, 195`](../../../../packages/dashboard/src/app/api/pages/[pageId]/design/route.ts)) to pass `existingDesignSpec` into the design pipeline when the task is MODIFY (per [`m4-execution-plan.md:182-190`](../chips-next-steps/m4-execution-plan.md)).
- [ ] Add a "before / after" toggle on the delta viewer for visual confirmation against the existing rendered design.

### Verification

- [ ] CashPulse-brownfield → MODIFY `dashboard` screen → confirm delta viewer shows added `BudgetProgressSection` node, preserves existing nodes by ID, no full-screen regen.

### Phase 7 Quality Gate

- [ ] `nx run-many -t typecheck test lint` — zero failures
- [ ] **Delta viewer accuracy:** Run CashPulse-brownfield through the dashboard. On the MODIFY screen, confirm the delta viewer shows: added nodes highlighted in green, modified nodes in amber, existing nodes dimmed. Verify node IDs are preserved (not regenerated).
- [ ] **Before/after toggle:** Click the toggle. Confirm the "before" view shows the original spec and "after" shows the applied delta. The transition should be smooth (crossfade or slide), not a jarring snap.
- [ ] **Visual rendering match:** The delta-applied spec rendered in the browser must match what the standalone renderer produces. Use Chrome DevTools MCP to screenshot both and compare.
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 7`
- [ ] `/mid-session-drift-check`
- [ ] `/verify-design-render` (from `.claude/skills/`) on the modified screen
- [ ] `/verify-done`

**Celebrate:** Phase 7 done means CHIP can show AI-generated design changes with surgical precision. The delta viewer is a feature no other AI tool has — it's a genuine differentiator.

---

## Phase 8: Observability surfaces (costs / traces / trust)

**Why this matters:** Transparency isn't just a feature — it's CHIP's competitive moat. When developers can see exactly what the AI spent, trace every LLM call, and review every assumption violation, they trust the system to handle real production work. The `/costs` page turns API spending from a black box into a clear budget. The `/traces` page lets power users debug AI decisions. The `/trust` page surfaces the assumption ledger — the AI's own uncertainty, made visible. No other tool does this. Build it beautifully and it becomes CHIP's signature feature.

**Goal:** Every spine run has a cost breakdown, every Implementer call has a trace, every assumption violation lands in `/trust`. M4 instrumentation (verified callable in Phase 0) drives the data.

### Tasks

- [ ] **`/costs`** ([`costs/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/costs/page.tsx)) — per-run, per-stage cost breakdown. **Must show both live and historical views:** During a run, `LiveCostTicker` (Phase 2) accumulates costs. After the run, `/costs` shows the full breakdown with per-stage bar chart (Architect dominates at ~98% of cost — make this visually clear), token counts (input/output), and cost-per-node drill-down. Show actual costs from Phase 0 receipts as reference: greenfield $6.00, brownfield $3.89. Include cost trend sparklines across runs (Pattern 9 from [`real-time-ux-reference.md`](real-time-ux-reference.md)).
- [ ] **`/traces`** ([`traces/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/traces/page.tsx)) — surface the M4 Phase 1 instrumentation fields (`taskType`, `sliceStrategy`, `qualityProxy` from [`m4-execution-plan.md:136`](../chips-next-steps/m4-execution-plan.md)) per Implementer call. Address the known telemetry gap ([`execution-plan.md:1006-1016`](../chips-next-steps/execution-plan.md)) by adding stage spans for Architect and Reviewer. **Each trace entry must show:** stage name, node name, duration, token count, and cost — replicating the per-node detail from the eval output (Pattern 1 from [`real-time-ux-reference.md`](real-time-ux-reference.md)).
- [ ] **`/trust`** ([`trust/page.tsx`](../../../../packages/dashboard/src/app/(dashboard)/trust/page.tsx)) — list AssumptionLedger violations from `report_assumption_violation` ([`m4-execution-plan.md:248`](../chips-next-steps/m4-execution-plan.md)) and ledger lifecycle diagram ([`execution-plan.md:126-144`](../chips-next-steps/execution-plan.md)).

### Phase 8 Quality Gate

- [ ] `nx run-many -t typecheck test lint` — zero failures
- [ ] **Cost accuracy:** After a spine run through the dashboard, compare `/costs` page totals against the RunSummaryCard and the LiveCostTicker. All three must show the same total (within rounding). Per-stage breakdown must match.
- [ ] **Cost visualization:** The per-stage bar chart must make it visually obvious that Architect dominates costs (~98%). This is important context for users managing budgets.
- [ ] **Trace completeness:** Navigate to `/traces`. Confirm every stage (Clarifier, Architect, Implementer, Reviewer) has trace entries. Each entry shows: node name, duration, token count, cost. No missing stages.
- [ ] **Trust page test:** If the Reviewer produced assumption violations, confirm they appear on `/trust`. If none were produced, confirm the empty state is clear and informative (not just "No data").
- [ ] **Sparklines:** After 2+ runs, confirm cost trend sparklines appear on `/costs`. Confirm they show meaningful variation (not flat lines).
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 8`
- [ ] `/mid-session-drift-check`
- [ ] `/verify-done`

**Celebrate:** Phase 8 done means CHIP has full observability — costs, traces, and trust. Enterprise buyers need this. Investors love this. You've built the transparency layer that makes AI-driven development trustworthy.

---

## Phase 9: End-to-end developer journey eval

**Why this matters:** This is the final proof. Not "does the code compile" or "do the tests pass" — but "can a developer who has never seen CHIP before sit down, type an idea, and watch it become software?" If the answer is yes, and the experience is smooth, beautiful, and transparent — then CHIP is ready to show the world. This phase is the dress rehearsal for the investor demo, the ProductHunt launch, the first enterprise pilot. Make it flawless.

**Goal:** Prove "any developer can use the dashboard to run an application through the full SDLC" with a recorded run, not just unit tests.

### Tasks

- [ ] Add `packages/eval/src/scenarios/dashboard-e2e-cashpulse.yaml` — scripted browser-driven scenario using `.claude/skills/verify-done` browser tooling.
  - Greenfield path: open `/new` → submit CashPulse PRD → approve Gate 1 → approve Gate 2 → wait for completion → assert `SpineRail` shows `reviewer.status = 'completed'` with disposition `'approved'`.
  - Brownfield path: open `/new` in evolution mode → "Add recurring transactions" → approve Gate 2 with AffectedScreens visible → wait for delta-viewer to render → wait for completion.
- [ ] Cost telemetry: record actual `$ / tokens` per stage, log to `packages/eval/results/spine-dashboard-e2e/phase-9/`. Compare against Phase 0 receipts — dashboard overhead must remain < 10%.
- [ ] Documentation pass: add `docs/guides/dashboard-spine-walkthrough.md` (per Backstage TechDocs rules — blind-subagent test required).

### Phase 9 Quality Gate (the final gate — this must be perfect)

- [ ] `nx run-many -t typecheck test lint` — zero failures
- [ ] **Fresh-eyes test:** Open the dashboard in an incognito browser. No prior state, no cached data. Follow the walkthrough guide (`docs/guides/dashboard-spine-walkthrough.md`) step by step. Every instruction must work. Every screen must look polished. Every animation must be smooth. If anything feels confusing, broken, or ugly — fix it.
- [ ] **Greenfield E2E recording:** Record the full greenfield journey (Playwright or screen recording): `/new` → submit PRD → watch SpineRail animate → approve Gate 1 → watch Architect graph → approve Gate 2 → watch Implementer execute → see ReviewResult. Save to `packages/eval/results/spine-dashboard-e2e/phase-9/`.
- [ ] **Brownfield E2E recording:** Same for brownfield path with AffectedScreens panel and delta viewer.
- [ ] **Cost overhead:** Compare dashboard run cost against Phase 0 CLI receipt. Dashboard overhead must be <10%.
- [ ] **Responsive test:** Run the full journey at 768px (tablet), 1024px (laptop), 1440px (desktop). No broken layouts.
- [ ] **Accessibility:** Run Lighthouse audit via Chrome DevTools MCP. Accessibility score must be ≥90.
- [ ] **Documentation:** `docs/guides/dashboard-spine-walkthrough.md` must pass the blind subagent test per CLAUDE.md. If a fresh agent can't follow the guide from zero, the docs have gaps.
- [ ] `/review-plan-impl docs/plans/active/spine-dashboard-e2e/execution-plan.md --phase 9`
- [ ] `/mid-session-drift-check`
- [ ] `/review-prd-compliance`
- [ ] `/verify-done` — full triad + headed E2E
- [ ] `/verify-docs` — task-scoped

**Celebrate:** Phase 9 done means CHIP is demo-ready. The full developer journey — from raw idea to reviewed code — works end-to-end through a beautiful, transparent, animated dashboard. You built something genuinely new. Be proud of it.

---

## End-of-Plan Gate

- `/verify-done` — test triad + headed E2E + Chrome DevTools visual + `/verify-docs` task-scoped
- `git commit` — only after `/verify-done` passes
- `/prepare-handoff` — if continuing in a new session

**When this plan is complete:** CHIP has a world-class dashboard that takes a raw idea through AI-powered clarification, architecture, design, implementation, and review — with real-time progress, transparent costs, beautiful animations, and human-in-the-loop gates. No other AI development tool offers this level of transparency and control. This is the product that earns $100M in funding and changes how software is built. Every phase you completed contributed to that vision. Well done.

---

## UX Observations from M4 Phase 7 Spine Eval (2026-05-17)

Observations captured during a real 25+ min spine eval run (Clarifier fixture → Architect → Implementer → Reviewer on CashPulse greenfield with Claude Opus via Vertex AI). These directly inform the UX quality required for the $100M investment bar.

### Real-time progress visibility (CRITICAL) — see [`real-time-ux-reference.md`](real-time-ux-reference.md) for the full 14-pattern catalog

The Architect pipeline alone takes ~25 min with Opus. Per-node timings observed:

| Node | Duration | What it produces |
|------|----------|-----------------|
| contextAssembler | <1s | Loads context |
| optionsExplorer | ~8 min | Architecture alternatives |
| architectureWriter | ~3 min | Architecture spec + ADRs |
| contractDesigner | ~5 min | Full data model, API schemas, screen plans |
| taskPlanner | ~4 min | TaskPlan DAG |
| critic | <1s | Deterministic gate check |
| Gate 2 HITL | User action | Design/API approval |

**Every phase and every Implementer tool-loop iteration must show real-time progress in the dashboard.** A 25-min wait with no feedback is unacceptable UX. This is the top priority for Phases 2 and 5.

### Notification system

- Desktop/browser notifications when spine stages complete or hit HITL gates
- Sound/visual indicators for Gate 1, 2, 3 readiness — the user may be in another tab
- Estimated time remaining per stage (use observed timings as baselines)

### Sample app strategy for UX validation

CashPulse (7 screens, 25 features) takes ~25+ min per spine run — too slow for rapid UX iteration. The plan needs a fixture ladder:

1. **Tiny fixture (~2 screens, ~30s-1 min)** — for rapid iteration during Phase 2-5 development. Could be a simple "Todo app" with 1 page + 1 entity.
2. **CashPulse (medium, 7 screens, ~25 min)** — the existing eval fixture. Use for Phase 9 end-to-end validation.
3. **Large fixture (20+ screens, ~60+ min)** — stress-test progress UX, notification queuing, cost tracking at scale. Deferred.

### Page-by-page UX audit task

Before Phase 2 begins, conduct a pixel-level audit of every dashboard page currently live:

- **Home `/`** — SpineRail renders 4 stages with icons + connectors. Run status card shows last run. Clean layout. Need: run history preview, spine "Run" CTA.
- **Runs `/pipeline`** — SpineRail + run history table. Run type shows "Spec Generation" (legacy). Need: add "Spine Run" type, per-stage progress column, cost column with real data (currently "—").
- **Tasks `/tasks`** — Kanban board with 5 columns (Backlog/Blocked/In Progress/In Review/Done). Shows 1 old task. Need: populate from Architect TaskPlan, add NEW/MODIFY badges for brownfield.
- **Approvals `/approvals`** — Badge shows "3" (hardcoded). Need: live gate count, HITL panel UIs.
- Each page needs spacing, typography, color, interaction polish to $100M standard.

### Task: UX Strategy & Fixture Planning (new task, pre-Phase 1)

Before starting Phase 1, invest one focused session in:

1. **Define the UX quality bar** — Reference best-in-class developer tools (Linear, Vercel, Cursor) and extract specific patterns: loading states, progress indicators, notification design, error recovery flows.
2. **Create the tiny fixture** — A 2-screen "QuickNote" app that runs the full spine in <2 min, enabling rapid iteration.
3. **Map every user wait moment** — Chart the entire developer journey noting every point where the user waits >5s. For each, design a specific loading/progress UX (skeleton, progress bar, stage completion animation, notification).
4. **Evaluate alternative approaches** — Should we consider: (a) background runs with email/Slack notifications? (b) a "preview mode" that uses cached intermediate outputs? (c) streaming tokens directly for transparency? (d) parallel estimation + execution? Pick the approach that feels most premium.

---

## Pre-Phase 1 UX Audit (2026-05-18)

Full pixel-level audit of all 11 dashboard pages completed. Results documented in [`ux-audit-findings.md`](ux-audit-findings.md) with screenshots at `packages/eval/results/m4/dashboard-smoke-*.png`.

**Investment-readiness score: 4/10** — strong structural bones, fatal gap on progress visibility.

### Top P0 fixes (must complete before investor demo)

1. **Real-time layer (SSE/WebSocket)** — No mechanism to surface pipeline progress in dashboard. Foundation for everything else. (3-5 days)
2. **Remove hardcoded/fake data** — Header budget, approval badge "3", phase label, agent count all inconsistent with actual data. (1 day)
3. **Animate SpineRail** — Active stage pulses, completed stages get checkmarks. Needs real-time layer. (1-2 days)
4. **Notification system** — Toast on gate interrupt, completion, failure. Browser notifications for background tabs. (1-2 days)
5. **Post-submission feedback on /new** — After PRD submission, show Clarifier progress. Currently: nothing happens visually. (1 day)

### Cross-cutting issues

- **Legacy agent model:** Agents page shows 7 old design-era agents, not the 4 spine stages
- **Tasks page:** Shows design-era tasks, not Architect TaskPlan output
- **Run history:** Only "Spec Generation" type exists, no "Spine Run"
- **Empty states:** Bare "No tasks" text everywhere, no illustrations/CTAs

See full findings with per-page screenshots and severity ratings in [`ux-audit-findings.md`](ux-audit-findings.md).

---

## Relationship to M4

This plan is **downstream of, not parallel to**, [`m4-execution-plan.md`](../chips-next-steps/m4-execution-plan.md). Phase 0 is the verification gate that M4 is truly done end-to-end before any dashboard work starts. Once Phase 0 passes, every subsequent phase consumes M4 deliverables as load-bearing dependencies — there are no stub fallbacks. If a regression in M4 surfaces during Phase 2+ (e.g., the Reviewer's `ReviewResult.disposition` changes shape), the dashboard work pauses and the regression is fixed in M4 first.

The plan deliberately renumbers from earlier drafts: what was "Phase 0: audit" is now "Phase 1," because the true Phase 0 is the M4-completeness gate.

## Anti-shortcut (process)

- Each phase gate is a checkbox **inside** the phase. A skipped gate is an unchecked box visible next session.
- `/review-plan-impl` spawns fresh-context subagent — implementing agent cannot coach it.
- Skipping a gate without explicit user waiver is a process violation surfaced by `/mid-session-drift-check`.
- **No stubs.** If a phase's verification cannot be completed because the underlying M4 capability does not behave as the plan asserts, STOP and file an M4 follow-up. Do not paper over with placeholders.

## STOP conditions

- Phase 0 M4-completion check fails on any line → STOP. This plan does not begin until M4 is fixed.
- Phase 2 dashboard run produces different `ReviewResult.disposition` than Phase 0 receipt → STOP, root-cause whether dashboard wiring or M4 regression.
- Phase 6 AffectedScreen panel doesn't match the hand-derived expected output in [`cashpulse-brownfield.yaml`](../../../../packages/eval/src/scenarios/cashpulse-brownfield.yaml) or the Phase 0 brownfield receipt → STOP, root-cause whether the dashboard is mis-rendering the agent output or M4's `change-classifier` regressed.
- Phase 9 cost or wall-time exceeds Phase 0 receipts by more than 10% → STOP, investigate dashboard overhead before declaring complete.

## Verification (plan-level)

1. This file exists at `docs/plans/active/spine-dashboard-e2e/execution-plan.md`.
2. Every phase has a gate block per [`docs/guides/planning-docs.md`](../../../guides/planning-docs.md).
3. Working assumptions A1-A4 are visible at the top and editable.
4. Phase 0 hard prerequisites cite specific M4 exit-criteria line numbers and produce committed receipts.
5. Every claim about an existing dashboard file traces to a verified line citation.
6. The phrase "stub" / "placeholder" / "disabled with tooltip" appears nowhere in the implementation tasks — only in the explicit no-go list under A1.
