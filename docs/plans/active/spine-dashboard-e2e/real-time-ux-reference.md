# Real-Time UX Reference — Phase 0 Eval Session (2026-05-18)

This file captures every feedback pattern observed during the Phase 0 spine eval runs.
**Every pattern listed here MUST be replicated in the dashboard UI.** This is the UX
quality bar for the $100M investment demo.

## Raw Eval Output (what the backend produces)

### Greenfield Run (24.5 min, $6.00)

```
[spine-eval] Scenario: CashPulse Full Spine — Greenfield (rep 1)
[spine-eval] Path: greenfield, Architect mode: greenfield

--- Stage 1: Clarifier (fixture) ---
  Loaded enriched requirement + assumption ledger from fixtures.

--- Stage 2: Architect ---
  [architect] Starting (mode=greenfield)...
  [architect:contextAssembler] 0.0s
  [architect:optionsExplorer] 487.8s
  [architect:architectureWriter] 179.6s
  [architect:contractDesigner] 324.1s
  [architect:taskPlanner] 236.1s
  [architect:critic] 0.0s
  [architect:taskPlanner] 233.4s       ← retry (critic sent it back)
  [architect:critic] 0.0s              ← retry passed
  [architect:__interrupt__] 0.0s
  [architect] Gate 2 interrupt — auto-approve
  [architect] Done in 1461.0s, $5.8847

  Selected task: ui-primitives — Build shared UI primitives with CVA variants
    (type=frontend, mode=NEW)

--- Stage 3: Implementer ---
  [implementer] Starting task=ui-primitives type=frontend mode=NEW
  [implementer:loadTaskContext] 0.0s
  [implementer:runDesignSpecialist] 0.0s
  [implementer:generateCode] 3.0s
  [implementer:reportCompletion] 0.0s
  [implementer] Done in 3.0s, $0.1044, 0 artifacts

--- Stage 4: Reviewer ---
  [reviewer:deterministicGates] 0.0s
  [reviewer:llmReview] 8.8s
  [reviewer:assumptionValidator] 0.0s
  [reviewer:emitReviewResult] 0.0s
  [reviewer] Done in 8.8s, $0.0117, outcome=escalated

--- Result: SUCCESS ---
  Total cost: $6.0009
  Total duration: 1472.9s
  Gate 6a: PASSED
```

### Brownfield Run (14.6 min, $3.89)

```
[spine-eval] Scenario: CashPulse Full Spine — Brownfield (rep 1)
[spine-eval] Path: brownfield, Architect mode: brownfield

--- Stage 1: Clarifier (fixture) ---
  Loaded enriched requirement + assumption ledger from fixtures.

--- Stage 2: Architect ---
  [architect] Starting (mode=brownfield)...
  [architect:changeClassifier] 0.0s   ← brownfield-only node
  [architect:contextAssembler] 0.0s
  [architect:optionsExplorer] 277.6s
  [architect:architectureWriter] 134.7s
  [architect:contractDesigner] 129.0s
  [architect:taskPlanner] 165.1s
  [architect:critic] 0.0s
  [architect:taskPlanner] 157.9s       ← retry
  [architect:critic] 0.0s              ← retry passed
  [architect:__interrupt__] 0.0s
  [architect] Gate 2 interrupt — auto-approve
  [architect] Done in 864.3s, $3.8110

  Selected task: design-tokens-recurring — Add CSS custom properties and
    shared UI atoms for recurring features (type=frontend, mode=MODIFY)

--- Stage 3: Implementer ---
  [implementer] Starting task=design-tokens-recurring type=frontend mode=MODIFY
  [implementer:loadTaskContext] 0.0s
  [implementer:runDesignSpecialist] 0.0s
  [implementer:generateCode] 4.1s
  [implementer:reportCompletion] 0.0s
  [implementer] Done in 4.1s, $0.0701, 0 artifacts

--- Stage 4: Reviewer ---
  [reviewer:deterministicGates] 0.0s
  [reviewer:llmReview] 8.7s
  [reviewer:assumptionValidator] 0.0s
  [reviewer:emitReviewResult] 0.0s
  [reviewer] Done in 8.7s, $0.0110, outcome=escalated

--- Result: SUCCESS ---
  Total cost: $3.8922
  Total duration: 877.1s
  Gate 6a: PASSED
```

---

## Monitoring Feedback Patterns (what the human observer provided)

These are the feedback patterns I gave the user during the 25+ minute eval runs.
**Every single one of these must have a dashboard equivalent.**

### Pattern 1: Per-Node Progress with Live Elapsed Time

During the eval, after each node completed I reported:
```
Brownfield output grew to 18 lines — another node completed.
[architect:architectureWriter] 134.7s
```

**Dashboard equivalent:** `NodeTimeline` component — a vertical list where each node
appears as a row the moment `node-start` fires, shows a spinning timer counting up,
and snaps to the final duration with a checkmark on `node-complete`.

**UX reference:** Vercel deployment logs — each build step appears as a collapsible
row with a timer, green checkmark when done. GitHub Actions workflow visualization.

---

### Pattern 2: Stage Transition Markers

```
--- Stage 2: Architect ---
--- Stage 3: Implementer ---
--- Stage 4: Reviewer ---
```

**Dashboard equivalent:** `SpineRail` stage transitions — the active stage pulses/glows,
completed stages show checkmarks with duration, upcoming stages are dimmed.

**UX reference:** Linear's project status timeline. Stripe's payment processing steps.

---

### Pattern 3: Process Health / Heartbeat Monitoring

During the 8-minute optionsExplorer node, I checked every 30-60s:
```
Both processes alive, ~5.5 min elapsed. 0% CPU is normal (waiting for LLM API response).
Active TCP connection to Google (Vertex AI). The LLM call is in progress.
```

This solved the "is it frozen?" anxiety. The user could see the system was alive.

**Dashboard equivalent:** `HeartbeatPulse` — animated dot that pulses on every
heartbeat SSE event (every 5s). Shows tooltip "Connected to Vertex AI — waiting
for response" during long nodes. Changes to amber "Waiting..." if no heartbeat
for 15s. Changes to red "Connection lost" if no heartbeat for 30s.

**UX reference:** Slack's connection status indicator. VS Code's language server
status in the status bar. The key insight: **silence is terrifying during long
operations — even a subtle pulse says "I'm alive."**

---

### Pattern 4: Estimated Time Remaining

```
optionsExplorer takes ~8 min based on prior runs. Should complete around the 8-10 min mark.
architectureWriter should complete soon (prior run was ~3 min).
Brownfield should complete first (~15 min total vs ~25 min greenfield).
```

**Dashboard equivalent:** `ETAIndicator` — shows "~3 min remaining" based on
historical baselines. Uses Phase 0 receipt timings as initial baselines, then
learns from each run. Progress ring fills proportionally.

**Baseline data (from Phase 0 receipts):**

| Node | Greenfield | Brownfield |
|------|-----------|------------|
| changeClassifier | — | <1s |
| contextAssembler | <1s | <1s |
| optionsExplorer | 488s (~8 min) | 278s (~4.6 min) |
| architectureWriter | 180s (~3 min) | 135s (~2.2 min) |
| contractDesigner | 324s (~5.4 min) | 129s (~2.2 min) |
| taskPlanner | 236s (~3.9 min) | 165s (~2.8 min) |
| critic | <1s | <1s |
| loadTaskContext | <1s | <1s |
| generateCode | 3s | 4s |
| deterministicGates | <1s | <1s |
| llmReview | 9s | 9s |

**UX reference:** macOS file copy progress — shows estimated time remaining.
Xcode build progress with per-target timers.

---

### Pattern 5: Live Cost Accumulation

After each stage I reported the cost immediately:
```
[architect] Done in 864.3s, $3.8110
[implementer] Done in 4.1s, $0.0701
[reviewer] Done in 8.7s, $0.0110
Total cost: $3.8922
```

**Dashboard equivalent:** `LiveCostTicker` — running cost total that updates on
each `stage-complete` event. Shows breakdown on hover:

```
$3.89 total
├── Clarifier    $0.00  (fixture)
├── Architect    $3.81  ████████████████░░  (98%)
├── Implementer  $0.07  ░░░░░░░░░░░░░░░░░░  (2%)
└── Reviewer     $0.01  ░░░░░░░░░░░░░░░░░░  (<1%)
```

Also shows token counts (input/output) per stage on expand.

**UX reference:** AWS Cost Explorer real-time view. Stripe billing dashboard.

---

### Pattern 6: Task Selection with Full Context

```
Selected task: ui-primitives — Build shared UI primitives with CVA variants
  (type=frontend, mode=NEW)
```

**Dashboard equivalent:** When the Implementer picks a task from the TaskPlan DAG,
that task row highlights/pulses in the `TaskPlanDagPanel` (Phase 4). A toast or
inline notification says "Now implementing: ui-primitives (frontend, NEW)".

If multiple tasks will be implemented sequentially, show "Task 1 of 10" progress.

**UX reference:** CI/CD job matrix in GitHub Actions — the currently running job
is highlighted while others wait.

---

### Pattern 7: Critic Retry Visibility

The eval showed the Architect retrying:
```
[architect:taskPlanner] 236.1s
[architect:critic] 0.0s
[architect:taskPlanner] 233.4s      ← retry!
[architect:critic] 0.0s             ← passed on retry
```

**Dashboard equivalent:** In `NodeTimeline`, when a node re-runs after the critic
rejects it, show "Attempt 2" badge next to the node name. The first attempt row
stays visible (dimmed, with an "×" icon and "Critic: needs revision" note), and
the retry row appears below it. This tells the user "the system caught a problem
and self-corrected" — which builds trust.

**UX reference:** Test retry indicators in CI systems (Cypress retry badges).

---

### Pattern 8: Reviewer Outcome with Findings

```
[reviewer] Done in 8.7s, $0.0110, outcome=escalated
```

**Dashboard equivalent:** The Reviewer stage in SpineRail shows the outcome as a
colored badge: green "Approved", amber "Escalated (needs review)", red "Rejected".
The `ReviewResult.findings` array count shows as a secondary badge: "3 findings".
Clicking opens the detailed findings panel.

**UX reference:** GitHub PR review badges — "Approved", "Changes requested",
"Review required".

---

### Pattern 9: Comparative Run Analysis

After both runs I compared against the prior M4 run:
```
| Metric | M4 Phase 7 | Phase 0 | Delta |
|--------|-----------|---------|-------|
| Total Cost | $6.24 | $6.00 | -$0.24 (-3.8%) |
| Total Duration | 1,498s | 1,473s | -25s (-1.7%) |
```

**Dashboard equivalent:** Run history with sparklines showing cost/duration trends
across runs. On the `/pipeline` page, each run row shows delta badges:
"↓3.8% cost" in green, "↓1.7% time" in green, "↑5% cost" in amber.

**UX reference:** Lighthouse CI trend graphs. DataDog dashboard comparisons.

---

### Pattern 10: Parallel Run Monitoring

I ran greenfield and brownfield simultaneously and tracked both:
```
Both processes alive — greenfield at optionsExplorer (8 min), brownfield past
contractDesigner. Brownfield should complete first.
```

**Dashboard equivalent:** If the user kicks off multiple spine runs (e.g., testing
greenfield + brownfield), the `/pipeline` page shows a split view or tabbed view
with both runs' `NodeTimeline` visible. Each run has its own `HeartbeatPulse`,
`ETAIndicator`, and `LiveCostTicker`.

**UX reference:** Docker Compose log view — multiple containers' output interleaved
with color-coded prefixes.

---

### Pattern 11: Dry-Run Validation Before Real Run

Before spending $10 on the eval, I ran a dry-run:
```
--- DRY RUN: Verifying fixtures ---
  [OK] spine-cashpulse-greenfield: enriched-requirement fixture found
  [OK] spine-cashpulse-greenfield: assumption-ledger fixture found
  [OK] spine-cashpulse-brownfield: enriched-requirement fixture found
  [OK] spine-cashpulse-brownfield: assumption-ledger fixture found
  [OK] spine-cashpulse-brownfield: design spec screen-001 found
```

**Dashboard equivalent:** Before "Run spine" executes, show a pre-flight check
panel: "Verifying project setup..." with checkmarks for each prerequisite
(fixtures loaded, auth configured, checkpointer available). Only enable the
"Run" button when all checks pass. Shows estimated cost before the user commits.

**UX reference:** Vercel deployment preview — shows what will happen before you
deploy. Stripe payment confirmation with cost breakdown.

---

### Pattern 12: Post-Submission Feedback on /new

After submitting a PRD on `/new`, the user currently sees nothing. During the eval,
every stage immediately showed activity:
```
--- Stage 1: Clarifier (fixture) ---
  Loaded enriched requirement + assumption ledger from fixtures.
```

**Dashboard equivalent:** After PRD submission on `/new`, immediately transition
to a "Processing" view showing the SpineRail with the Clarifier stage active,
NodeTimeline streaming events, and the HeartbeatPulse confirming the system is
working. Never show a blank screen after submission.

**UX reference:** ChatGPT's "thinking" indicator. Linear's issue creation with
instant feedback.

---

### Pattern 13: Gate Interrupt with Action Required

```
[architect] Gate 2 interrupt — using interrupt state (auto-approve, no resume needed).
```

**Dashboard equivalent:** When a HITL gate fires, the SpineRail stage flashes/pulses
amber. A toast notification appears: "Gate 2 ready for review — Design & API approval
needed." If the user is in another tab, a browser notification fires. The `/approvals`
badge updates. Clicking the notification navigates to the gate panel.

**Sound cue:** Optional subtle chime when a gate needs attention (user-configurable
via notification preferences, which already exist in `useNotificationPreferences`).

**UX reference:** Slack's notification for mentions. GitHub's PR review request
notification.

---

### Pattern 14: Summary with Pass/Fail Gate Status

```
============================================================
SUMMARY
============================================================
Total runs: 1
Successes: 1
Failures: 0
Failure rate: 0.0%
Total cost: $6.0009

Gate 6a: PASSED
```

**Dashboard equivalent:** When the spine completes, show a summary card on the
`/pipeline` page with: total cost, total duration, outcome badge, and per-stage
breakdown. This card persists in run history. Each run is a clickable row that
expands to show the full NodeTimeline, costs, and findings.

**UX reference:** Vercel deployment summary card. GitHub Actions workflow summary.

---

## UX Design Principles (derived from the eval session)

1. **Never leave the user in silence.** The longest node (optionsExplorer) takes
   8 minutes. Without feedback, 8 minutes feels like the system crashed. With a
   heartbeat pulse and ETA, 8 minutes feels like progress.

2. **Show the system self-correcting.** When the critic retries a node, that's a
   feature — it means the system caught a quality issue. Surface it as "Attempt 2:
   self-correcting" not as an error.

3. **Make costs transparent.** Users running Opus at $6/run need to see costs
   accumulate in real time, not as a surprise at the end. The cost ticker builds
   trust and lets users abort early if something goes wrong.

4. **Pre-flight checks prevent expensive mistakes.** A dry-run check before a
   $6+ run prevents wasted money on missing fixtures or auth issues.

5. **Context at every level.** Stage-level progress (SpineRail), node-level progress
   (NodeTimeline), and task-level progress (which task is being implemented) —
   the user should always know exactly what the system is doing and why.

6. **Comparison drives confidence.** Showing "this run vs last run" trends tells
   the user the system is stable and improving, not random.

7. **Notifications bridge the attention gap.** A 25-minute run means the user will
   leave the tab. Browser notifications for gate interrupts and completion are
   essential, not nice-to-have.
