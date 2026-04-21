# ADR-040: Scrub duplicate chrome and persistent overlays at the prototype runtime

## Status

Accepted (2026-04-20)

## Context

Plan B Phase B2 (`docs/plans/screen-types-plan-b.md`) ships `LayoutShell`, which renders header/footer/sidebar regions from `shared-chrome.json` as persistent DOM around a swappable content area. While verifying the Personal Expense Tracker fixture end-to-end, two user-visible regressions surfaced that are not caused by the LayoutShell itself but by the upstream LLM-generated page specs:

1. **Duplicate chrome.** `shared-chrome.json` declares header region `topbar`. Individual page specs (`dashboard.json`, etc.) still include a root-level `top-bar` (hyphenated) node with near-identical structure. Both render — one inside `LayoutShell`'s `[data-persistent="header"]`, one as the first child of `[data-persistent="content"]` — producing a visibly doubled header.

2. **Persistent overlay modals.** LLM page specs occasionally emit a root-level node with `position: absolute | fixed`, a full-viewport rect, `background: overlay` (or similar), and a high `zIndex` — representing a settings/confirm dialog — without any open/close state. Once rendered, it covers the content on every visit.

Both bugs also affect Phase A (single-page) rendering, but B2's persistent content area (`overflow: auto`, fixed viewport height) makes them much more visible: the overlay no longer scrolls off-screen, the duplicate header now consumes chrome-shell space plus content-area space.

We considered three options:

- **A. Fix at spec generation.** Strengthen UX-design prompts + correction loop to (i) never emit a chrome-equivalent node in a page spec when `frozenChromeSpec` is provided, (ii) never emit a persistent overlay without an `open` state in the catalog binding.
- **B. Fix at ingest.** Post-process specs when they are written to `.agentforge/previews/<page>/scripts/designspec-v2.json` (i.e. in `applyFrozenChromeToPageSpec` or a sibling step).
- **C. Fix at the runtime boundary.** Scrub specs inside `GET /api/prototype` before they are handed to the renderer.

## Decision

Adopt **Option C** for the two regressions above, with `findPageChromeRootIds`, `stripPersistentOverlays`, and `isPersistentOverlayBackdrop` living in `packages/designspec-renderer/src/renderer/browser/spec-split.ts` and applied inside `packages/dashboard/src/app/api/prototype/route.ts` before serialization.

Scrubbing rules:

1. For each page spec, match root-level children against `shared-chrome.json` region ids using (i) exact id match, (ii) compact (hyphen-insensitive) match, (iii) region-specific pattern + catalog type fallback. Remove matches with `stripChromeFromSpec`.
2. For each page spec, detect root-level children that are absolute/fixed full-viewport nodes with an overlay-like background and no owning open/close state, and remove them with `stripChromeFromSpec`.
3. Filter screens whose `screenId` starts with `__` out of the prototype manifest (and any nav bindings referencing them).

The runtime path is idempotent and does not mutate the stored spec files; a subsequent `design:page:all` that fixes these upstream simply makes the scrub a no-op.

## Rationale

- **Regressions are user-visible and already shipping.** Waiting for LLM prompt work to land before unblocking B2 verification penalizes the correct layer (renderer + runtime) for an upstream defect.
- **The scrub is narrow and deterministic.** The three rules encode invariants that `shared-chrome.json` + the DesignSpec schema already imply (chrome is shared; root-level persistent overlays without state are bugs; `__*` ids are internal markers). No LLM output is silently "improved"; we only remove nodes the renderer has no safe way to display.
- **Option A is still the right long-term fix.** The scrub is a safety net, not a replacement. A follow-up item in Plan B (post-B2.5) is to tighten the UX-design prompt + correction loop so the scrubbing rules fire zero times on new apps; the scrub then becomes tripwire-only.
- **Option B (fix at ingest) was rejected** because the stored spec is the LLM's artifact of record and tools downstream of the renderer (Penpot round-trip, component catalog evolution, future export) may legitimately want the raw form. Mutating at ingest would hide the upstream defect from those tools too.

## Consequences

### Positive
- Phase B2 manual verification passes for the PET fixture without waiting on UX-design prompt changes.
- Any new LLM-generated app that hits either of these two defects renders correctly the first time.
- Unit tests in `spec-split.test.ts` lock the scrubbing rules; any change to the rules is reviewed deliberately.

### Negative
- **Divergence between stored spec and rendered spec.** Debugging "why does the prototype look different from `designspec-v2.json`?" now has two possible answers (scrubbed chrome, scrubbed overlay). Mitigation: `/api/prototype` should log (at debug level) which rule fired for which page.
- **Scrubbing drift risk.** If Chrome Pass is later disabled, `findPageChromeRootIds` has no shared-chrome ids to match against and returns `[]` — the duplicate-chrome bug re-emerges by design. This is acceptable because disabling Chrome Pass disables LayoutShell itself.
- **Temptation to add more rules.** Each new scrub rule should have a corresponding ADR or lesson entry and a unit test; otherwise `/api/prototype` becomes an opaque LLM-output laundering layer.

### Follow-ups
- Plan B Phase B2.5 adds Playwright regression tests for both rules (`@b2.5-visual-pet`, `@b2.5-chrome-consistency`).
- A later Plan B phase (or a UX-design prompt task) should eliminate both defects upstream and convert the scrub rules into assertions that log-and-skip when they match (so regressions surface in telemetry, not silently).
- If a third scrub rule is proposed, stop and revisit whether Option A/B is now cheaper.
