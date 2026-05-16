# CHIP Brownfield Experience: UX Vision

**Status:** Vision draft (2026-05-16)
**Scope:** The end-to-end user experience for requesting, previewing, refining, and applying changes to existing CHIP-generated projects.
**Sequencing:** Near-term work (R10 — Visual Delta Rendering) unblocks the preview layer of this vision. Mid-term work extends the rest. M4 is the technical substrate; this vision describes what should sit on top of it.

## Why this matters now

M3.5 shipped the brownfield wiring foundation — `DesignSpecDelta`, `AffectedScreen` impact classification, slice-aware context routing. M3.6 will inform the default slice strategy. M4 will implement the spine end-to-end. At that point the brownfield path will *work* technically, but it will work in developer mode — through scripts, JSON outputs, manual schema reading.

This document captures the experience the engineering substrate should serve. The intent is not to commit to a timeline but to fix the direction — so every M4-onward decision can be evaluated against "does this take us closer to or further from the vision."

## The user's mental model

Strip away CHIP-specific terminology. A user who has built an app and wants to change it wants to make four moves, in order:

1. **Describe** what they want, in their own words
2. **See** what will change before it changes
3. **Refine** if it's not right
4. **Apply** atomically, with a clean rollback if they regret it

Every CHIP-internal step — Clarifier, Architect, Implementer, Reviewer, ContractBundle, ScreenPlan, DesignSpec, DesignSpecDelta, slice strategies, ContextRefs — is plumbing in service of those four moves. The user should never see plumbing. The product's job is to make those four moves feel like the canonical version of themselves: chat for description, visual diff for preview, conversational iteration for refinement, atomic apply with versioned rollback.

This is a different design center than "expose the spine to the user with a nice wrapper." The spine is build infrastructure; the user wants a verdict, not a trace.

## Principles

**The spine is invisible by default.** Today's project view prominently displays Clarify → Architect → Implement → Review. That's a useful internal abstraction but an exposed implementation detail. The mature project view shows the app itself, its history of changes, and an input box. The spine is reachable through a "debug" or "advanced" view for power users; default users never know it exists.

**Visual diff is the preview format for design changes.** Not JSON. Not lists of affected screens. Not code diffs. The user requested a visual change; the preview shows that visual change. Code preview is available behind a collapsed panel for technical users, but it is not the default surface.

**Refinement is conversation, not regeneration.** If a user approves the dashboard delta but wants the new card smaller, the system should apply a targeted refinement — not rerun the whole pipeline producing a different overall plan. Cursor's apply/refine pattern, not Bolt's "I'll generate it again."

**Approval is per-screen, not all-or-nothing.** A multi-screen change should let the user accept screens independently. The architecture supports this — the spine's single-writer-per-screen rule keeps screen changes orthogonal. What's missing is UI that exposes that orthogonality.

**Rollback is the silent UX feature.** Every applied change must be revertible as a unit. This is what lets users approve confidently. Without it, every change request feels high-stakes; with it, the user can try things.

**The current state is always visible.** The user shouldn't have to remember what existed before — before/after should be one toggle away wherever a change is shown.

## End-to-end walkthrough

To make the abstractions concrete, here is "Add recurring transactions" against the existing CashPulse project as the mature experience would unfold.

The user opens their project. The view shows the app's current screens (thumbnails of dashboard, add expense, settings, etc.), recent change history, and an input at the top: *"What would you like to change?"*

The user types: *"Let users mark transactions as recurring (weekly, monthly, yearly) and show upcoming recurrences on the dashboard."*

The Clarifier — running in evolution mode against the project's existing PRD — asks two questions inline: *"Should existing transactions become recurring retroactively, or only new ones?"* and *"On the dashboard, show only the next upcoming recurrence per series, or all upcoming in the next 7 days?"*

The user answers both. The Clarifier closes out, the Architect runs in the background. 30 seconds in, the user lands on the preview screen.

The preview is captioned: ***3 screens will change.*** Below, three cards:

> **Dashboard** — new section added
> Visual: existing dashboard render, with a soft green highlight overlay on a new "Upcoming Recurring" card section between the budget summary and the recent expenses list. A small "Added" pill in the corner of the highlighted region. Click to expand into full preview with side-by-side / overlay / slider toggle. Buttons: Approve · Refine · Reject.
>
> **Add Expense** — modified
> Visual: add-expense form render, with a yellow outline highlight on a new "Recurring?" toggle row inserted after the amount field. "Modified" pill. Approve · Refine · Reject.
>
> **Transactions List** — modified
> Visual: list of transaction rows, three rows highlighted with yellow outlines showing new recurring badges next to the description. "Modified" pill. Approve · Refine · Reject.

The user approves the dashboard immediately. Clicks "Refine" on the transactions list and types *"Make the badge less prominent — muted color, smaller."* The system applies a targeted modification, re-renders just that screen's preview. The user approves. Accepts the add-expense change too.

Bottom of the screen: *"All 3 screens approved. Apply changes?"* Big button. The user clicks.

Progress indicator for ~10 seconds. The Implementer ships the code changes. The system shows: *"Applied. View change history."* The screen returns to the project view, now showing the new state — and a new entry in the change history: *"Add recurring transactions" — Tuesday, 4:32pm — Revert*.

That whole flow took maybe two minutes of the user's time. They never saw the spine, never read JSON, never thought about DesignSpec or schema versions. The system did all the engineering invisibly.

This is the experience the architecture should be evaluated against.

## What each phase looks like

### Change request entry

A single input on the project view. Natural language. Optional attachments (screenshots, reference designs, sketches). No structured fields — the Clarifier extracts structure.

For larger or more contested changes, the user can attach context: *"like this Figma file"* with a link, or *"matching the style of [other screen]."* But the default path is pure prose.

The input may suggest auto-detected scope: *"This will likely touch the Dashboard and Transactions List. Confirm?"* But this is editable — the user might know it should touch screens the system wouldn't infer. The detection comes from a lightweight Architect probe that reads the request and the existing PRD without running the full pipeline.

### Clarification phase

The Clarifier runs in evolution mode. Compressed compared to bootstrap mode because the brownfield context is already grounded. Two to four questions, each presented as a single-tap multi-choice with an "Other" free-text escape (the converged production clarifier UX from the existing CHIP research). Inline, not a modal.

If the user already gave enough detail in the request, the Clarifier may have zero questions. Asking-when-not-needed is a measurable failure mode (per the Clarifier Option Quality Overhaul work).

### Impact preview

Once clarification closes, the Architect runs in evolution mode against the modified `EnrichedRequirement`. Node 0.5 (Change Classifier) produces `AffectedScreen[]`. The UI shows: ***N screens will change***, with thumbnails of each affected screen showing the current rendered state with a small badge ("New" / "Modified") and a one-line summary of what's changing.

Click any card to expand into the full visual delta preview.

### Per-screen delta preview

The core experience. For each affected screen, the user sees the rendered visual delta — the existing screen with overlays showing what's being added, modified, or removed.

Three view modes, toggleable:

- **Overlay** (default): the after-state rendered on top, with semantic highlighting on changed regions
- **Side-by-side**: before on the left, after on the right, with highlights on both
- **Slider**: an interactive before/after with a draggable divider

Highlighting conventions (specified in R10):
- *Added* regions: green outline + subtle green fill behind the component
- *Modified* regions: yellow outline + subtle yellow fill
- *Removed* regions: red dashed outline + 50% opacity + strikethrough

Each highlighted region carries a small badge identifying the change type and, on hover or click, a description ("New: Upcoming Recurring card showing transactions for the next 7 days"). For modified regions, hover or click expands a field-level diff ("Background: surface → recurring-tint; Label: '' → 'Monthly'").

Per-screen actions: **Approve**, **Refine**, **Reject**.

- *Approve*: marks this screen's delta as accepted; will be applied in the atomic commit
- *Refine*: opens a small chat input scoped to this screen; user describes the refinement; system applies a targeted modification and re-renders just this screen
- *Reject*: marks this screen's delta as rejected; will NOT be applied. The user is shown alternatives if any exist, or asked whether they want to revise the whole request

Below the visual preview, collapsed by default: *"View code changes"* — expands to show the diff of generated code if the user wants to inspect it. Power-user surface; not on the default path.

### Refinement loop

The hardest piece of the vision and the part that's furthest from current architecture.

When the user refines a screen-level delta, the system should NOT rerun the design pipeline from scratch. It should apply a targeted modification to the existing delta. This requires the design specialist to be capable of editing an in-flight delta rather than producing a new one from a fresh prompt.

Cursor's apply/refine pattern is the analog. The user's refinement instruction becomes a small edit prompt: *"Apply this refinement to the existing delta: [refinement]. Output the modified delta."*

Refinement is bounded — three refinements per screen by default, then the user is offered to *Reject and revise the whole request* instead. This prevents indefinite iteration loops where the user can't articulate what's wrong.

For the first version, refinement-as-regeneration is acceptable as a fallback. The vision target is targeted edits, but the substrate that makes that work (delta-aware design specialist that can apply edits to an existing delta) is M5/M6 work.

### Atomic apply

Once all affected screens are either approved or rejected, the user hits *Apply Changes*. The system:

1. Aggregates approved deltas into a single named **change set**
2. Applies all approved deltas atomically to the project's DesignSpec store
3. Triggers M4's Implementer to generate code changes against the approved deltas
4. Records the change set in the project's change history with a one-line summary derived from the original request

Atomic means: either all approved screens get their deltas applied and corresponding code generated, or none of them do. Partial failure rolls back the whole change set.

Change-set semantics are an extension to the DesignSpec store. Today `design-spec-store.ts` has per-page backups (one previous version per page). The mature version groups per-page versions under a named change set, enabling atomic apply and atomic revert.

### Post-apply review and rollback

After application, the project view shows the new state. The change history grows by one entry, with a *Revert* action. Reverting a change set restores all affected screens to their pre-change state in a single atomic operation. No partial reverts — that's a future capability.

Each change-set history entry is clickable and opens a read-only view of the diff that was applied — the same visual delta preview the user saw before approving. This makes the history feel honest and inspectable.

## How this maps to CHIP architecture

The vision aligns with the existing committed direction:

- **Sequential spine.** No change. The visible UX is one input → one verdict; the spine runs internally.
- **DesignSpecDelta hybrid schema** (R9 §6.2). The schema is the data shape for everything in the preview layer.
- **Symmetric greenfield/brownfield** (architect-design.md §4). Both flows produce the same artifact (DesignSpec), brownfield additionally produces deltas to apply.
- **Slice-aware context wiring** (R9 §6.3). The Implementer receives the relevant slice; the visual delta preview is independent of the slice strategy.
- **Per-screen single-writer rule** (vision Layer 3). This is what makes per-screen approval safe.

What needs to be added or extended:

- **Visual delta rendering.** Extension to `designspec-renderer`. Detailed in R10 (separate document).
- **Brownfield request UI in dashboard.** Next.js work; chat input + Clarifier evolution-mode wiring + impact preview + per-screen delta preview. Currently no UI for evolution mode in the dashboard.
- **Change-set versioning in DesignSpec store.** Extension to `design-spec-store.ts`. Today: per-page backups. Mature: per-change-set versioned history with atomic apply/revert.
- **Refinement-as-conversation infrastructure.** Implementer extension to support edits to in-flight deltas. The hardest and farthest-out piece.
- **Code diff surface (collapsed panel).** Reuses existing Implementer outputs; UI work to present it cleanly.
- **Auto-detected scope hint at request entry.** Light Architect probe before full clarification to suggest which screens might be affected.

## Sequencing

**Near-term (next 1-2 milestones after M4):**
- R10 — Visual Delta Rendering (the unblocking piece for everything else)
- Dashboard brownfield request UI with impact preview and visual delta preview
- Change-set versioning in DesignSpec store
- Per-screen approval flow

**Mid-term:**
- Refinement-as-conversation (first version, may fall back to regeneration)
- Code diff surface
- Change history view with click-to-replay diff
- Atomic revert with safety checks (don't revert if downstream changes depend on it)

**Blue-sky:**
- Multi-variant preview (show the user 2-3 alternative approaches, let them pick)
- Component-level (not just screen-level) approval
- Refinement-as-conversation with full targeted edits
- Cross-project change patterns (apply the same change to multiple projects)
- Collaborative review (commenting on regions, multiple approvers, version histories per branch)

## Open questions

These should be resolved before committing to the mid-term roadmap.

1. **Refinement fallback semantics.** When refinement-as-conversation isn't available (first versions), is regeneration acceptable as a fallback or do we restrict refinement to "reject and revise"? Trade-off: regeneration may produce a wildly different delta the user has to re-evaluate; rejection-only is more constraining but more predictable.

2. **Code diff visibility for non-technical users.** The collapsed code panel is for power users. Should it be hidden entirely for users tagged as non-technical, or always available behind a click? Risk of hiding: power users can't access it from the default flow.

3. **Change set granularity.** A change request that touches 5 screens — is that one change set or five? Argument for one: the user thinks of it as one change. Argument for five: enables partial revert later. Committing to "one" simplifies the model; committing to "many with a parent" preserves flexibility but adds complexity.

4. **Concurrent change requests.** If user A and user B both file change requests against the same project, what's the semantic? Likely deferred to multi-user collaboration scope, but worth flagging.

5. **Change history retention.** How far back? Unlimited but storage-capped? Time-bounded?

6. **Approval timeouts.** If a user opens a preview but doesn't act on it, how long are the proposed deltas valid? Indefinite (preview persists until acted on) or bounded (preview expires after N hours, requires regeneration)? Bounded preserves the assumption that the project state hasn't drifted; indefinite is friendlier but risks stale previews.

## What this document is and isn't

It's a fix on the user-facing direction so that engineering decisions made between now and the M4 launch can be evaluated against an explicit target. It's not a commitment to deliver every piece of it on a fixed timeline.

The single biggest near-term enabler is visual delta rendering. R10 (next document) is the standalone proposal for that piece.