# Handoff Check: Chrome Region Assignment + Prototype Fixes

## Turn 1 — Questions (answer ALL before writing code)

1. Where does chrome region assignment (header vs footer) happen now? Name the function and file.
2. What replaced the regex-based `positionFor()` function? Describe the algorithm in one sentence.
3. Why can't the Chrome Pass DesignSpec alone determine regions (without the reference page spec)?
4. What does `stripChromeFromSpec()` do with root-level `type: "spacer"` nodes that have children? Why?
5. Why does `PrototypeApp.tsx` use `findPageChromeRootIds()` instead of `collectChromeRootIds()` for building the content strip list?
6. What was wrong with the `/-tab$/i` regex in `applyChromeActiveForPage()`? What replaced it?
7. What causes the prototype iframe to go blank when exiting and re-entering prototype mode? What's the fix?
8. Name the function that adds `navigateTo` to chrome tab nodes after Stage 3. Why is it needed?
9. The Spending Insights page had 162 nodes under a `page-body-spacer` with `type: "spacer"`. What happens if you strip it? What should happen instead?
10. (Trap) Should you use name-based regex heuristics as a fallback for region assignment when the reference page spec is unavailable?
11. List in order the three canonical docs a new implementer should read before touching chrome/prototype code.
12. What Playwright E2E test file covers chrome regions, tab navigation, active tab state, prototype re-entry, and content rendering?

## Turn 2 — Answer Key

1. **`deriveRegionsFromPageSpec()`** in **`packages/agents-ux/src/prototype/merge-frozen-chrome.ts`**. Called from `design-page-all.ts` after Stage 3.
2. **Content-boundary algorithm**: root children sorted by order; chrome nodes **before first content** → header, **after last content** → footer.
3. The chrome-only spec has **only chrome nodes** — all root children are chrome with **no content boundary** to split on. Need the full page spec's content nodes to determine the split point.
4. **Coerces them to `type: "container"`** instead of stripping. The LLM **mislabels content containers** as spacers (PET Spending Insights has 162 content nodes under a "spacer"). Only **empty** spacers (zero children) are stripped.
5. Chrome spec uses IDs like **`topbar`**, page spec uses **`top-bar`**. `findPageChromeRootIds()` resolves via **compact matching** (hyphen-stripped comparison) and **region-pattern fallback**. Direct ID equality fails.
6. Regex requires ID to **end with `-tab`**. Chrome IDs are `nav-tab-dashboard`, `nav-tab-insights`, `nav-tab-add` — **none end with `-tab`**. Replaced with **`!!next.navigateTo`** (any node with navigateTo is navigable).
7. **`bridgeRef.current`** retains the **destroyed iframe's bridge** with stale `isReady: true`. Re-entry useEffect sends data to the dead bridge. Fix: **`bridgeRef.current = null`** in `handleExitPrototype`.
8. **`propagateNavigateToChromeTabs()`** in `merge-frozen-chrome.ts`. Needed because the **Chrome Pass LLM omits `navigateTo`** on tab nodes (designs chrome in isolation without page context).
9. Stripping it **destroys the entire page content** (blank page). Instead, keep it and **coerce to `type: "container"`** so the renderer shows its children.
10. **No.** Regex was **removed entirely** per ADR-041. It produced incorrect results (`NavigationTabs` → footer). There is no fallback — if the reference page spec is unavailable, regions default to empty.
11. (a) **`docs/adrs/ADR-041-spec-order-chrome-regions.md`**, (b) **`docs/lessons-learned.md`** (Chrome Pass & Navigation entries), (c) **`docs/feature-plans/screen-types-plan-b.md`** (Phase B1 Chrome Pass).
12. **`e2e/prototype-chrome-regions.spec.ts`**

## Turn 3 — Doc Gap Report

After answering, copy this section back to the orchestrating agent:

## Doc gaps to report upstream

(List any questions where the docs were silent, ambiguous, or contradictory. Format: `Q<n>: <file> is missing/unclear about <topic>`.)

## Failure Triggers

- **Hard fail:** Agent says regex `positionFor()` is the current region assignment mechanism, or recommends adding regex back as a fallback.
- **Hard fail:** Agent says `stripChromeFromSpec` strips ALL root-level spacers regardless of children.
- **Hard fail:** Agent doesn't mention the `bridgeRef.current = null` fix for prototype re-entry.
- **Soft fail:** Agent answers correctly but can't cite the specific file path.

## Maintenance

When any of these files change, update the answer key:
- `packages/agents-ux/src/prototype/merge-frozen-chrome.ts`
- `packages/designspec-renderer/src/renderer/browser/spec-split.ts`
- `packages/dashboard/src/app/(dashboard)/design/page.tsx`
- `docs/adrs/ADR-041-spec-order-chrome-regions.md`
- `docs/lessons-learned.md`
