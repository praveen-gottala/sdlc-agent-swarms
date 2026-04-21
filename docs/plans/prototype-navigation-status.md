---
name: Prototype & Navigation Current State
description: Status of prototype mode, navigation bindings, and screen type work as of 2026-04-19
type: project
originSessionId: a5b0e784-a207-4209-b7ce-ff972357371c
---
## What's Done (implemented & browser-tested)
- Parallel design pipeline (Research → Planning → Design across pages concurrently)
- Prompt caching for cost reduction, plateau detection in correction loop, Opus 4.7 evaluator
- Prototype mode in dashboard: full-width iframe, screen selector bar, Navigation popover
- Click-to-select navigation: user clicks element → picks target → saves with exact `source_node`
- Auto-detect which screen a picked node belongs to (scans all specs)
- Spec-driven navigation: `navigates_to` field on `PageEntry` with `target`, `trigger`, `source_node`
- Navigation persists to `pages.yaml` via PUT /api/navigation
- Prototype refreshes after save via `protoKey` counter mechanism
- Figma-style hotspot CSS: `.nav-hotspot` with blue outline on hover, flash on empty click
- `sendSpecToBridge` guard prevents race condition (load-spec overwriting load-prototype)
- Renderer `inPrototypeMode` guard ignores load-spec when prototype is active
- `window.location.hash` try/catch fix for iframe sandbox navigation

## What's Not Done (planned in plan file)
- **Screen types**: `screen_type` field on PageEntry (page | overlay | modal | drawer)
- **Shared layout components**: TopNavigation declared once, applied to all pages
- **NavigationBar renderer enhancement**: render bell icon/avatar/links from overrides (currently pass-through)
- **Overlay rendering in PrototypeApp**: slide-over panels, modals on top of current screen
- **Viewport resolution by screen type**: overlay=400px, modal=560px
- **E2E Playwright tests** for prototype feature
- **Debug console.log cleanup** in DesignSpecRenderer.tsx and PrototypeApp.tsx

## Key Bug Fix: iframe sandbox
**Why:** `window.location.hash = '...'` throws inside `sandbox="allow-scripts allow-same-origin"` iframe, preventing `setActiveScreenId` from executing.
**Fix:** Call `setActiveScreenId` BEFORE the hash assignment, wrap hash in try/catch.

## Key Bug Fix: load-spec race condition  
**Why:** Parent component's spec-loading effects fired `loadSpec` after prototype mode activated, overwriting the PrototypeApp.
**Fix:** `prototypeModeRef` guard on `sendSpecToBridge` + `inPrototypeMode` flag in renderer's main.tsx.

**How to apply:** Plan file at `.claude/plans/you-will-review-the-golden-hamming.md` has the full 8-phase implementation plan.
