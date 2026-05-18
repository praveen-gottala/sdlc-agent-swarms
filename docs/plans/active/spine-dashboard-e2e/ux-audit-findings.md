# Dashboard UX Audit Findings

## Methodology

- **Date:** 2026-05-18
- **Viewport:** 1540x768 (default), 1024x768, 768x1024 (responsive)
- **Browser:** Chromium via Playwright MCP
- **Tools:** Playwright screenshots + a11y snapshots
- **Quality bar:** Linear, Vercel, Cursor ($100M investment standard)
- **Primary lens:** Progress visibility — ALL feedback flows through the dashboard, never backend CLI

## Executive Summary

**Investment-readiness score: 4/10**

The dashboard has strong structural bones — a well-organized 3-panel layout (sidebar/main/activity), consistent dark theme, competent Mantine v9 component usage, and a working design studio with page registry. However, it fundamentally fails the $100M investor test on the single most important axis: **progress visibility during pipeline execution.** An investor watching a 25-minute spine run sees static icons, no ETA, no stage transitions, no cost accrual, no notifications, and a hardcoded approval badge. The dashboard tells you what *happened* (past tense) but never what *is happening right now*.

**The gap is not polish — it's architecture.** The dashboard lacks a real-time communication layer (WebSocket/SSE) to surface pipeline progress. Until that exists, no amount of CSS will make it investor-ready.

---

## Progress Visibility Gap Analysis (P0)

Every gap below represents a moment where the user is left without feedback. Mapped to spine stages:

| Pipeline Stage | What User Sees Now | What User Should See |
|---|---|---|
| **Pre-run** | Static SpineRail icons, "CODE GEN PHASE" badge | "Ready to run" state, clear CTA ("Run Pipeline"), estimated duration |
| **Clarifier running** | Nothing changes | Stage 1 highlighted, elapsed time, "Analyzing requirements..." |
| **Clarifier → Architect transition** | Nothing | Stage 1 turns green + checkmark, Stage 2 activates with pulse |
| **Architect running (25+ min)** | Nothing for 25 minutes | Current node name (contextAssembler, optionsExplorer...), progress bar, ETA, cost accumulating in header |
| **Gate 2 interrupt (HITL)** | Sidebar badge stays "3" | Notification toast, badge increments, Approvals page shows pending item |
| **Implementer running** | Nothing | Stage 3 active, file paths appearing in real-time, token/cost counter |
| **Reviewer running** | Nothing | Stage 4 active, review outcome preview |
| **Pipeline complete** | No notification. User must navigate to /pipeline and check | Toast notification: "Pipeline complete — Review: APPROVED", auto-refresh on current page |
| **Pipeline failed** | Alert card appears on Home (after manual navigation) | Immediate toast, error details, retry button, diagnostic link to Langfuse trace |

**Root cause:** No real-time data channel. The dashboard uses REST polling (or static page loads). Pipeline events go to the file system and CLI `console.log`. The dashboard has NO way to know a pipeline is running until the user refreshes a page.

---

## Per-Page Findings

### Home `/`
**Screenshot:** `dashboard-smoke-home.png`

**P0 — Blocks investment demo:**
- SpineRail is purely decorative — 4 static icons with dashes, no indication of which stage is active, no animation, no progress. Compare to Vercel's deploy timeline which pulses on the active step.
- No "Run Pipeline" CTA. User must know to navigate to the CLI. The dashboard should be THE entry point for running the spine.
- Error alert text truncated: "Pipeline timed out — stuck in 'running' for 31min (auto-clea" — cut off mid-word.

**P1 — Quality gap:**
- "CODE GEN PHASE" badge in header appears hardcoded. Should reflect actual pipeline phase or not be shown.
- Budget bar "$27.50 / $200" — inconsistency: header shows $27.50 but Costs page shows $0.00. Data is not synced.
- Timer "00:27" in header — no label. Is this session time? Run time? Unclear.
- Activity panel shows events from 12-17 days ago with no grouping. Would benefit from "Today", "This Week", "Earlier" sections like Linear's activity feed.
- Quick action cards ("Runs", "Design Studio", "1/1 TASKS", "+ New") have no descriptions or context.

**P2 — Polish:**
- Tech stack label "react / node / postgresql / tailwind" — could use framework icons instead of text.
- Project avatar "PE" is generic. Consider allowing custom icons/colors.

### Pipeline/Runs `/pipeline`
**Screenshot:** `dashboard-smoke-pipeline.png`

**P0 — Blocks investment demo:**
- All runs are "Spec Generation" type — no "Spine Run" type exists yet. The run history doesn't reflect the 4-stage spine at all.
- Cost column shows "—" for every Spec Generation run. Only Browser Design runs show "$0.000". Cost tracking is broken or not wired.
- No "active run" indicator. When a spine eval is running (right now!), this page shows nothing. Should have a live row at the top with an animated spinner, elapsed time, current stage, and cost accruing.
- Run durations like "967m 17s" (16+ hours) and "1028m 21s" (17+ hours) suggest zombie runs that were never cleaned up. These damage credibility.

**P1 — Quality gap:**
- SpineRail on this page shows HITL gate labels ("Clarification gate", "Design approval gate", "Code review gate") — good! But they're static, never change state.
- "Pause All" and "Abort All" buttons are disabled with no tooltip explaining why.
- Status badges alternate between "failed" (red) and "complete" (green) but the visual contrast between them is insufficient at a glance. The green is too dark.
- No filters by status (show only failed, show only this week).

**P2 — Polish:**
- Run history table is very long (30+ rows visible) with no pagination or virtual scroll.
- "Phase" column is blank for all entries — wasted horizontal space.

### New Project `/new`
**Screenshot:** `dashboard-smoke-new.png`

**P0 — Blocks investment demo:**
- After submitting a PRD, there is NO progress feedback visible in the dashboard. The Clarifier starts running in the backend but the user sees nothing change. This is the FIRST thing an investor would try: "Let me create a project." They type a description, press submit, and... nothing visible happens.
- No "what happens next" copy. After submitting, the user should see "Analyzing your requirements... The Clarifier will identify gaps and ask targeted questions."

**P1 — Quality gap:**
- The input area is well-designed with a clean Claude-like aesthetic (placeholder text, model selector "Opus", submit button). Good visual quality.
- The "+" button in the bottom-left of the input box has no tooltip — unclear what it does (attach file?).
- No sample prompts or templates like "Build a project management app" to help first-time users.

**P2 — Polish:**
- Large empty space below the input area. Could show recent projects, templates, or "How CHIP works" onboarding content.

### Design Studio `/design`
**Screenshot:** `dashboard-smoke-design.png`

**P1 — Quality gap:**
- Page registry with 10 pages is well-organized with status dots (yellow = designed, gray = not designed). Good information hierarchy.
- "Select a page" empty state in the canvas area is adequate but could be more inviting.
- Progress indicator "5 of 10 designed" in top-right is useful.
- Toolbar (Prototype, Edit, Connect, Link, Play) is professional-looking.
- "Logs (1)" bar at the bottom suggests there are console errors — this shouldn't be visible in production.
- Test pages ("Draft test 1777750651257", "Pipeline test 1777750652682") pollute the page registry. Test data should be cleaned up or filtered.

**P2 — Polish:**
- Filter input "Filter screens..." could have keyboard shortcut hint (Cmd+K).
- Page descriptions are truncated ("The home screen showing...", "A focused single-column..."). Consider showing full description on hover.

### Tasks `/tasks`
**Screenshot:** `dashboard-smoke-tasks.png`

**P0 — Blocks investment demo:**
- Only 1 task visible ("Design page: Dashboard" in Done column) — this is a design-era task, NOT from the Architect's TaskPlan. The Kanban board doesn't display spine-generated tasks (scaffold-project, db-schema-seed, etc.).
- Backlog, Blocked, In Progress, In Review columns all show "No tasks" with just the text — no helpful empty state illustration or guidance.

**P1 — Quality gap:**
- Board/List toggle in top-right is clean.
- Status filter pills (All, Backlog, Blocked, In Progress, In Review, Done) with counts work well.
- Task card shows agent ("ux_research"), CI status ("Passed" green bar), and cost ("$0.00"). Good data density for a card.
- Dashed column borders (Blocked=red, In Progress=blue, In Review=purple, Done=green) are a nice touch.

**P2 — Polish:**
- "1 tasks across 1 agents" — grammar: "1 task across 1 agent".

### Approvals `/approvals`
**Screenshot:** `dashboard-smoke-approvals.png`

**P0 — Blocks investment demo:**
- Sidebar badge shows "3" but page shows "0 PENDING". This is a credibility-destroying inconsistency. An investor would immediately notice and lose trust.
- "Recent Decisions" table is empty ("No recent decisions"). Combined with the fake badge, this page looks broken, not empty.

**P1 — Quality gap:**
- Page title "Approval Center" with "0 PENDING" badge is correctly styled.
- Table headers (ID, Title, Agent, Decision, When) are good but the empty state should suggest what approvals look like: "When the pipeline reaches a HITL gate, pending approvals appear here."
- No way to configure which gates require approval from this page. Should link to HITL Configuration.

### Agents `/agents`
**Screenshot:** `dashboard-smoke-agents.png`

**P1 — Quality gap:**
- Agent cards show 7 agents (ux_researcher, wireframer, spec_writer, task_decomposer, code_generator, test_writer, code_reviewer) with detailed info: role, model, status badges (IDLE), confidence percentages, task counts. Good data density.
- Cards have "Full Approvals" expandable sections.
- Agent Learnings table at the bottom with columns (Learning, Confidence, Status, Date) adds transparency.
- **But**: these are the OLD design-era agents, not the spine agents (Clarifier, Architect, Implementer, Reviewer). The page should reflect the current architecture.
- No live status during a run. When the Architect is active, its card should show "ACTIVE" with current node, elapsed time, token usage.

**P2 — Polish:**
- Agent names use snake_case (ux_researcher, code_generator). Should be human-readable: "UX Researcher", "Code Generator".

### Trust `/trust`
**Screenshot:** `dashboard-smoke-trust.png`

**P1 — Quality gap:**
- Progressive Trust concept is well-explained with the intro text: "Agents earn autonomy through consecutive successful approvals."
- 7 agent trust cards with Escalate/Degrade/Reset actions are functional.
- Trust progress bars (0/10 consecutive approvals) provide a clear metric.
- Toggle switches per agent are intuitive.
- All agents show "FULL APPROVAL" status and "APPROVED" last outcome — this appears to be default state, not earned through actual runs.

**P2 — Polish:**
- Trust cards use a red-tinted dark background — slightly more aggressive visually than necessary. Consider neutral dark card backgrounds with colored accents only on status badges.
- "Reset" button in red is good for destructive action visibility.

### Budget/Costs `/costs`
**Screenshot:** `dashboard-smoke-costs.png`

**P1 — Quality gap:**
- Three summary cards (Monthly Budget $0.00/$200.00, Phase Budget $0.00/$25.00, Per-Task Limit $0.00/$2.00) with progress bars are well-structured.
- Cost by Phase breakdown (Design, Spec, Code Gen, CI/CD, Observe) — all $0.00. No real cost data flows in.
- Cost by Agent table (only ux_research with $0.00, 1 task) — sparse.
- **Inconsistency**: Header shows "$27.50 / $200" but this page shows "$0.00 / $200.00". The header budget data is fake/stale.
- No real-time cost accrual during runs. Should show cost ticking up as LLM calls happen.

**P2 — Polish:**
- Phase bars are dark blue on dark background — low contrast, hard to see the fill level.

### Integrations `/integrations`
**Screenshot:** `dashboard-smoke-integrations.png`

**P1 — Quality gap:**
- Tab navigation (Channels, MCP Servers, LLM Providers, Design Pipeline, Design Tools) is well-organized.
- Channel cards (Slack, Cli) show connection status, priority, routing type. Good info density.
- "Connected" green dots are clear.
- Escalation Policy section with timeout values (60 min, 120 min) and "Auto-approve on timeout is never allowed" safety message is thoughtful.
- "FULL" and "BASIC" routing badges are clear.
- "Last ping: never" — connection status should be periodically checked.

**P2 — Polish:**
- "Test" and "Settings" buttons on cards are clean but have no visual distinction (both look like text links).

### Spec `/spec`
**Screenshot:** `dashboard-smoke-spec.png`

**P1 — Quality gap:**
- File browser (api.yaml, brand.yaml, component-catalog.yaml, etc.) with code viewer is professional-looking.
- Syntax highlighting on YAML is good (green keys, cyan values, white comments).
- Line numbers are clear.
- "Generate Spec" CTA (red/purple gradient) is prominent. "Specced" badge shows status.
- "Edit" button per file is useful.
- "+ New Page" action is accessible.

**P2 — Polish:**
- "Generate Spec" button color (red/purple gradient) doesn't match the brand palette. Other CTAs are purple/blue. This inconsistency draws attention.

---

## Cross-Cutting Issues

### 1. No Real-Time Communication Layer (P0)
The dashboard has NO mechanism to receive live updates from the backend during pipeline execution. Every page loads data on mount and never updates. This is the foundational gap — all progress visibility issues stem from this.

**Fix:** Implement SSE (Server-Sent Events) or WebSocket connection between the dashboard and the pipeline runner. The pipeline already emits events (the Activity feed shows "RequirementsClarified", "LLM generation started", etc.) — these just need to flow in real-time instead of being discovered on page reload.

**Estimated effort:** 3-5 days for the transport layer + per-page integration.

### 2. Stale/Fake Data Throughout (P0)
- Header budget "$27.50 / $200" doesn't match Costs page "$0.00 / $200.00"
- Approvals badge "3" doesn't match Approvals page "0 PENDING"
- "CODE GEN PHASE" appears hardcoded
- Timer "00:27" has no label or explanation
- "4 agents" count in header doesn't match 7 agents on Agents page

**Fix:** All header data should be fetched from the same API endpoints that feed the detail pages. Remove all hardcoded values.

**Estimated effort:** 1 day.

### 3. Legacy Agent Model vs Spine Architecture (P1)
The Agents page shows 7 old design-era agents (ux_researcher, wireframer, spec_writer, etc.) but the spine has 4 stages (Clarifier, Architect, Implementer, Reviewer). The Tasks page shows design-era tasks, not Architect TaskPlan output. The Run history shows "Spec Generation" runs, not "Spine Run" type.

**Fix:** Add spine agent entries. Wire Tasks to display TaskPlan output. Add "Spine Run" as a run type with per-stage breakdown.

**Estimated effort:** 2-3 days.

### 4. Empty States Are Bare (P1)
Most empty states just say "No tasks", "No recent decisions", "No data". Compare to Linear's empty states which include an illustration, explanation, and a CTA.

**Fix:** Design proper empty state components with icon, message, description, and primary CTA. e.g., "No pending approvals — When the pipeline reaches a HITL gate, review requests appear here."

**Estimated effort:** 1-2 days.

### 5. No Notification System (P0)
No toast notifications, no browser notifications, no badge updates, no sound cues. For a 25-minute pipeline run, the user must actively poll by navigating to pages and checking. This is unacceptable for the quality bar.

**Fix:** Mantine's notification system + browser Notification API for background tabs. Integrate with the SSE/WebSocket layer.

**Estimated effort:** 1-2 days (after real-time layer exists).

---

## Responsive Findings (1024px / 768px)

**Home at 1024px:** Layout holds. Sidebar remains visible. SpineRail icons compress slightly but remain readable. Quick action cards wrap correctly.

**Home at 768px:** Layout holds. Sidebar is slightly narrower but all labels visible. Main content area gets compressed. Quick action cards still fit in a row. Overall: responsive behavior is solid — no layout breaks.

**Verdict:** Responsive layout is well-implemented. No P0 or P1 responsive issues found.

---

## Priority Summary

| Severity | Count | Key Examples |
|---|---|---|
| **P0** | 5 | No real-time progress during 25-min runs; no notification system; stale/fake data in header and badges; no "Run Pipeline" CTA; no post-submission feedback on /new |
| **P1** | 8 | Legacy agent model vs spine; empty states are bare; run history shows only old types; cost data not flowing; agent names in snake_case; error text truncated |
| **P2** | 6 | Test data in page registry; grammar ("1 tasks"); dark progress bars; button color inconsistency; timer label missing; tech stack text vs icons |

## Recommended Fix Order (by investor impact)

1. **Wire real-time layer (SSE/WebSocket)** — Foundation for all progress visibility. Without this, nothing else matters. (3-5 days)
2. **Remove all hardcoded/fake data** — Header budget, approval badge, phase label, agent count. (1 day)
3. **Animate SpineRail** — Active stage pulses, completed stages get checkmarks, transitions animate. Needs the real-time layer. (1-2 days)
4. **Add notification system** — Toast on gate interrupt, completion, failure. Browser notification for background tabs. (1-2 days)
5. **Wire Tasks to Architect TaskPlan** — Show NEW/MODIFY tasks from the spine, not design-era tasks. (1-2 days)
6. **Add "Spine Run" type to run history** — Per-stage cost/duration breakdown, live row for active runs. (2 days)
7. **Design proper empty states** — Icon + message + CTA for all empty pages. (1 day)
8. **Post-submission UX on /new** — After PRD submission, show Clarifier progress with stage indicators. (1 day)
9. **Update Agents page to spine model** — Show Clarifier, Architect, Implementer, Reviewer as the primary agents. (1 day)
10. **Polish pass** — Error text truncation, button colors, grammar, test data cleanup. (0.5 day)

**Total estimated effort: 12-18 days**
