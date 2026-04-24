# ADR-039: Chrome Pass for shared app shell (Plan B)

## Status

Accepted (2026-04-20)

## Context

Plan B (`docs/feature-plans/screen-types-plan-b.md`) requires designing TopBar, NavigationTabs, and similar components once, then reusing them across page DesignSpecs. Research rejected adding a new `layout` block to `pages.yaml` (no consumers; duplicates detection already in `page-context-prompt.ts`).

## Decision

1. **Derive** shared chrome with `resolveSharedComponents()` from `status === 'approved'` page entries and the component catalog (category + name heuristics). No new YAML schema.

2. **Chrome Pass** runs after planning and before per-page design: one V2 design call with a planning slice limited to the shared component names (`extractScreenSubtree`), `PenpotDesignInput.chromeOnly: true`, and `moduleId` `__shared-chrome__`. Output is saved as `agentforge/shared-chrome.json` with `screen: "__chrome__"` and a `regions` map (header / footer / sidebar root node ids).

3. **Per-page design** passes `frozenChromeSpec` + `frozenChromePageId` into the V2 pipeline. After the browser correction loop, `applyFrozenChromeToPageSpec` overwrites node entries present in the frozen spec and sets `active` on `catalog === "tab"` nodes where `navigateTo ===` current page id.

4. On Chrome Pass **failure**, the CLI logs a warning and continues (legacy unconstrained per-page chrome).

## Consequences

- Deterministic chrome alignment does not depend on the LLM copying frozen JSON verbatim; merge enforces node-level equality for ids present in the frozen spec.
- `shared-chrome.json` is an app-level artifact (alongside `prototype.json`), not under a `bookshelf-*` module dir.
- Phase B2 (LayoutShell) will read `shared-chrome.json` for persistent chrome in the renderer.
