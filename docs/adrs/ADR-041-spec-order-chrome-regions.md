# ADR-041: Spec-Order Chrome Region Assignment

**Status:** Accepted  
**Date:** 2026-04-21  
**Supersedes:** Regex-based `positionFor()` in `resolve-shared-components.ts`

## Context

Chrome Pass assigned shared components to LayoutShell regions (header/footer/sidebar) using regex on component names. The rule `/tabs$/i` sent `NavigationTabs` to `footer`, overriding the design intent where tabs sit directly under TopBar at the top of the page.

## Decision

Replace regex-based region assignment with spec-order derivation from the reference page's DesignSpec after Stage 3.

**Algorithm:** Get root-level children of the reference page sorted by `order`. Chrome nodes before the first content node → `header`. Chrome nodes after the last content node → `footer`.

**Function:** `deriveRegionsFromPageSpec()` in `packages/agents-ux/src/prototype/merge-frozen-chrome.ts`.

**Tab navigation:** `propagateNavigateToChromeTabs()` matches chrome tab text content to page names and sets `navigateTo` deterministically (Chrome Pass LLM omits it).

**Active tab detection:** `applyChromeActiveForPage()` detects tabs by `navigateTo` presence, not by node ID regex suffix.

## Alternatives Considered

1. **Explicit `chrome_regions` config in YAML** — rejected for v1; adds schema maintenance burden for the common case.
2. **Planning-stage structured output** — the planning tree's component order is logical, not visual (NavigationTabs appeared at index 19, after all content). The designed spec's order is the ground truth.
3. **Keep regex as fallback** — rejected; incorrect behavior is worse than no fallback.

## Consequences

- Region assignment aligns with designed layout intent, not name heuristics.
- Sidebar detection is not addressed (v1 — would need explicit config or layout analysis).
- `resolveSharedComponents()` now only discovers shared components; it returns `regions: []`.
- The post-Stage-3 derivation reads the reference page's designed spec from `designedSpecs` map — no extra file I/O.
