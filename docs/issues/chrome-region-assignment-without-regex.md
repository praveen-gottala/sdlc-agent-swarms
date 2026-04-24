# Shared Chrome Region Assignment — Replace Name/Regex Heuristics

## Summary

Chrome Pass today maps shared components (e.g. `TopBar`, `NavigationTabs`) to `LayoutShell` regions (`header`, `footer`, `sidebar`) using **regex and string rules** on **component names** from `pages.yaml`. That does **not** encode product intent: the **per-page DesignSpec** already expresses intent through **structure and order** (e.g. tabs directly under the top bar). We should **remove regex as the authority** for region placement and derive regions from **layout truth** (reference page graph / order) or from **explicit configuration**, with regex at most as a deprecated fallback.

## Problem Statement

1. **Intent lives in the spec tree, not in the name.**  
   The LLM places `NavigationTabs` under `TopBar` in document order for a desktop-style dashboard. Classifying `NavigationTabs` → `footer` because the string matches `/tabs$/i` **overrides** that intent and produces **studio vs prototype drift** (tabs at top in canvas, tabs in the footer slot in `LayoutShell`).

2. **Regex on component names is not a semantic model.**  
   Renames (`PrimaryNav`, `AppTabs`), catalog gaps, and ambiguous names (`SomethingTabs` vs footer legal block) make output **arbitrary** or wrong without any signal from the actual node graph.

3. **Operators cannot predict behavior.**  
   “Why did my chrome move?” requires reading implementation heuristics in `resolve-shared-components.ts`, which is a poor contract for a product-facing pipeline.

## Current Behavior (Reference)

- **Discovery of shared components:** `resolveSharedComponents()` in `packages/agents-ux/src/prototype/resolve-shared-components.ts` — counts components listed on every approved `page`-type screen in `pages.yaml`.
- **Region assignment:** `positionFor(componentName)` uses regex / catalog substring rules (e.g. `/tabs$/i` → `footer`, `nav|header|top|bar` → `header`, default → `header`).
- **Region → node ids:** `buildSharedChromeRegions()` in `packages/agents-ux/src/prototype/merge-frozen-chrome.ts` maps component names to root node ids on a **reference page** spec.
- **Runtime:** `LayoutShell` renders `header` / `sidebar` / `footer` in a fixed vertical column; footer is **physically** at the bottom regardless of how the reference page drew the same subtree.

Related: ADR-039 (Chrome Pass, derived layout), Plan B docs (`docs/feature-plans/screen-types-plan-b.md`), `LayoutShell` in `packages/designspec-renderer/.../LayoutShell.tsx`.

## Goals

- **Primary:** Region assignment should **align with the reference page’s layout intent** (order and parent relationships in `DesignSpecV2`), not with **string matching** on catalog component names.
- **Secondary:** When layout is ambiguous, require **explicit** human or structured agent output (YAML / planning artifact), not silent regex defaults.
- **Non-goal (for this issue):** Changing how `LayoutShell` draws regions (header always top, etc.) — that stays; we fix **what goes into which region**.

## Proposed Directions (Pick or Combine)

### A. Order- and graph-based assignment (preferred first step)

Use the **reference page** (same as today) and, for each shared component root node:

1. Resolve the **root-level child order** under `root` (or a defined chrome band).
2. Define a **deterministic policy** from **order and siblings**, e.g.:
   - All shared roots that appear **above** the first “main content” heuristic (first non-chrome large subtree, or first node not in shared set) → **`header` region** (preserve top-to-bottom order within header).
   - Shared roots **below** main content or **after** a known content root → **`footer`**.
   - Optional: **sidebar** if `layout` / `parent` indicates a side column (needs a clear rule set).

3. **Deprecate** `positionFor()` regex for components that appear in the reference spec graph; keep name rules only for **missing** nodes (with a loud warning / telemetry).

**Pros:** Matches “order gives intent” observation; no new user-facing schema for the common case.  
**Cons:** Requires robust definitions for “main content” boundary; may need tuning per app archetype.

### B. Explicit `chrome_regions` (or similar) in project config

Extend `agentforge.yaml` or `pages.yaml` (or a small `agentforge/spec/chrome-layout.yaml`) with:

```yaml
chrome_regions:
  header: [TopBar]
  footer: [NavigationTabs]
```

Chrome Pass **reads** this first; regex is **not used** when present.

**Pros:** Intent is explicit; easy for humans and CI to validate.  
**Cons:** Another file to generate and keep in sync; onboarding must write defaults.

### C. Planning-stage structured output

Planning agent emits **which shared components are header vs footer** once per project. Chrome Pass consumes that artifact.

**Pros:** Semantic; can use cross-page reasoning.  
**Cons:** More pipeline surface; must validate against actual specs.

## Success Criteria

- [ ] No production path uses **regex on component names** as the **sole** decider for region placement for components that exist on the reference page spec (regex may remain **fallback** with logged warning).
- [ ] PET (or fixture equivalent): **prototype** tab strip placement **matches** reference page **vertical intent** (tabs under top bar for desktop PET) **or** mismatch is **explicitly** opted in via config (B), not accidental.
- [ ] Documented contract: “How chrome regions are chosen” lives in **one** place (ADR or plan update), not only in code comments.
- [ ] Tests: unit tests for region derivation from a **small synthetic DesignSpec** (order variants); regression test so `NavigationTabs` is not forced to `footer` when it sits under header in the graph (unless config says otherwise).

## Risks / Constraints

- **Backward compatibility:** Existing `shared-chrome.json` files in the wild may assume current footer placement; migration may need a one-time re-run of Chrome Pass or a version flag on `shared-chrome.json`.
- **Multi-page divergence:** If two pages order shared roots differently, policy must define **reference page wins** (already the case for id mapping) and optionally **warn** on drift.
- **Scope:** `packages/agents-ux/src/prototype/resolve-shared-components.ts` and callers in `design-page-all` (and any dashboard path that duplicates logic) must stay in sync.

## Open Questions

1. Should **sidebar** be purely graph-derived, or config-only for v1?
2. Do we version **`shared-chrome.json`** (e.g. `regions_meta.source: order-v1`) for debugging?
3. Should the **canvas** optionally render **LayoutShell** for parity, or is “single-page raw spec” acceptable if docs are clear?

## References

- `packages/agents-ux/src/prototype/resolve-shared-components.ts` — `resolveSharedComponents`, `positionFor`
- `packages/agents-ux/src/prototype/merge-frozen-chrome.ts` — `buildSharedChromeRegions`, `buildSharedChromeFilePayload`
- `docs/adrs/ADR-039-chrome-pass-shared-layouts.md` (if present) — Chrome Pass decision context
- `docs/feature-plans/screen-types-plan-b.md` — Plan B shared chrome / prototype behavior

---

**Status:** Problem / direction document — **no implementation in this change.** Track implementation in a dedicated task or ADR when work starts.
