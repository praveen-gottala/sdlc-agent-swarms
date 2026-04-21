# Screen Types, Shared Layouts & Overlay Navigation

## Problem Statement

The design pipeline has a **category error**: every entry in `pages.yaml` is treated as a standalone full-screen page, but some entries are fundamentally different:

- **NotificationsPanel** is described as a "slide-over panel accessible from the bell icon" with `type: slide-over` and `width: 400px` — but the pipeline generates it as a 1440px standalone page
- **TopNavigation** (with notification bell, user avatar) is declared independently on each page — there's no shared component concept
- **The bell icon doesn't exist** in any rendered design — the NavigationBar renderer is a pass-through container that doesn't auto-render its catalog anatomy (bell, avatar, nav links)

This affects three layers: the spec schema, the LLM pipeline, and the renderer.

## Root Causes

1. **No `screen_type` field** on `PageEntry` — everything is "page"
2. **No shared component concept** — planning prompt says "every component must appear in exactly one screen"
3. **NavigationBar renderer is a pass-through** — doesn't render bell/avatar/links from overrides
4. **Viewport defaults to 1440px** — no type-based width resolution (overlay=400px, modal=560px)
5. **`PageSpec` type duplicated** in 3+ locations with no shared source of truth

## Prerequisites (already done in prior session)

The following is already implemented and working:
- Prototype mode in dashboard (full-width, screen selector bar, clean toolbar)
- Click-to-select navigation binding (user clicks element → picks target → saves with `source_node`)
- Navigation popover with screen tabs
- `navigates_to` field on `PageEntry` with `target`, `trigger`, `source_node`
- `NavigationTarget` and `NavigationBinding` types
- Screen-to-screen navigation in prototype (hash-based routing, iframe sandbox fix)
- Hotspot CSS indicators (blue outline on hover, Figma-style flash)
- Race condition guards (`sendSpecToBridge` + renderer `inPrototypeMode`)
- Prototype API reads from both `.agentforge/previews/` and `agentforge/designs/`
- `extractNavigationFromSpecs()` for deterministic nav extraction from `NodeSpec.navigateTo`
- LLM fallback via `analyzeNavigation()` when no spec-driven bindings exist

See memory file `project_prototype_navigation.md` for details.

## Solution Architecture

Inspired by:
- **Figma**: overlay frame properties + component instances for shared elements
- **Next.js**: layout slots (persistent UI) + parallel routes (overlays)
- **Material Design 3**: surface classification (page vs overlay vs modal)

### Data Model Changes

```yaml
# pages.yaml — PROPOSED
pages:
  - id: dashboard
    name: Dashboard
    route: /dashboard
    screen_type: page           # NEW: page | overlay | modal | drawer
    description: ...
    components: [...]

  - id: notifications-panel
    name: NotificationsPanel
    route: /notifications
    screen_type: overlay        # NEW: renders as slide-over, not full page
    overlay_width: 400          # NEW: width when rendered as overlay
    trigger_from: bell-icon     # NEW: what element triggers this overlay
    description: Slide-over panel accessible from the bell icon...
    components: [...]

# NEW section: shared components that persist across all pages
layout:
  components:
    - id: shared-top-nav
      name: TopNavigation
      type: navigation
      props:
        showNotificationBell: true
        showUserMenu: true
```

```typescript
// PageEntry — PROPOSED additions
export interface PageEntry {
  // ... existing fields ...
  readonly screen_type?: 'page' | 'overlay' | 'modal' | 'drawer';
  readonly overlay_width?: number;
  readonly trigger_from?: string;  // node ID that triggers this overlay
}
```

## Implementation Phases

### Phase 1: Core Types & Spec Schema
**Files:**
- `packages/core/src/types/spec-types.ts` — Add `screen_type`, `overlay_width`, `trigger_from` to `PageEntry`
- `packages/core/src/index.ts` — Export new types
- `packages/designspec-renderer/src/types/design-spec-v2.ts` — Add `screenType` to `DesignSpecV2`
- `packages/designspec-renderer/src/types/prototype-manifest.ts` — Add `mode` to `NavigationBinding`, add `screenType` to `PrototypeScreen`

### Phase 2: App Spec Generation (design:generate)
**Files:**
- `packages/cli/src/commands/design-generate.ts`:
  - Update `GeneratedPage` with `screen_type` field
  - Update `buildSystemPrompt()` to teach the LLM about screen types:
    - "If a screen is a slide-over panel, modal dialog, or drawer, set screen_type accordingly"
    - "Overlays should NOT include TopNavigation — they appear on top of pages that already have it"
    - "Set overlay_width for non-page screens (400 for slide-overs, 560 for modals)"
  - Update `writeSpecFiles()` to write `screen_type` and `overlay_width`

### Phase 3: Layout & Shared Components
**Files:**
- `packages/core/src/types/spec-types.ts` — Add `layout` section to `PagesSpec` for shared components
- `packages/agents-ux/src/prompts/ux-planning-system.md`:
  - Remove rule "every component must appear in exactly one screen"
  - Add concept of shared layout components that persist across pages
  - Add rule: "Overlay screens should NOT include shared layout components"
- `packages/agents-ux/src/page-context-prompt.ts` — Include layout/shared components in prompt context

### Phase 4: Viewport Resolution by Screen Type
**Files:**
- `packages/core/src/config/viewport-resolver.ts` — Add screen type parameter:
  - `page` → default viewport (1440)
  - `overlay` → `overlay_width` or 400
  - `modal` → `overlay_width` or 560
  - `drawer` → `overlay_width` or 320
- `packages/cli/src/commands/design-page-all.ts` — Pass `screen_type` to viewport resolver

### Phase 5: NavigationBar Renderer Enhancement
**Files:**
- `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`:
  - Update the `navigation-bar` case to render from overrides:
    - `brand_name` → logo/app name
    - `nav_links` → link elements with active state
    - `actions` → bell icon (with badge), user avatar
  - Bell icon node should have `data-node` and be targetable for navigation binding

### Phase 6: PrototypeApp Overlay Rendering
**Files:**
- `packages/designspec-renderer/src/renderer/browser/app/src/PrototypeApp.tsx`:
  - Track `overlayScreenId: string | null` state
  - When `navigateTo` fires and target screen has `screenType: 'overlay'`:
    - Keep current screen rendered
    - Render overlay screen in a fixed right panel (width from manifest, backdrop, close button)
  - When `screenType: 'modal'`:
    - Centered dialog with backdrop
  - Close on backdrop click or X button
- `packages/designspec-renderer/src/renderer/browser/app/src/globals.css`:
  - Overlay/modal backdrop styles
  - Slide-in animation for overlays

### Phase 7: Dashboard Navigation Editor — Mode Selector
**Files:**
- `packages/dashboard/src/components/design/navigation-editor.tsx`:
  - After picking element and target screen, show mode selector if target has `screen_type` != 'page'
  - Auto-detect mode from target's `screen_type` (user can override)
- `packages/dashboard/src/app/api/prototype/route.ts` — Pass `mode` and `screenType` through
- `packages/dashboard/src/app/api/navigation/route.ts` — Accept `mode` field

### Phase 8: Cleanup
- Remove debug `console.log` from `DesignSpecRenderer.tsx` and `PrototypeApp.tsx`
- Remove standalone test data directory if recreated
- Clean up any `as any` casts introduced during debugging
- Write Playwright E2E tests for all prototype interactions

## Key Design Decisions

1. **`screen_type` on PageEntry, not NavigationBinding** — the screen itself knows what it is (overlay vs page). The binding mode is derived from the target's screen type, not set per-binding.

2. **Layout section in pages.yaml** — shared components (TopNavigation) defined once, applied to all `screen_type: page` entries. Overlays/modals explicitly exclude layout components.

3. **NavigationBar renders its own anatomy** — instead of being a pass-through, it reads `brand_name`, `nav_links`, `actions` from overrides and renders bell icon, avatar, links. This makes the bell icon a real node that can be a navigation trigger.

4. **LLM generates screen_type during design:generate** — the LLM already knows from the PRD which screens are overlays/modals. It just needs the schema field to express it.

## Verification

1. `npx nx run-many -t typecheck` — zero errors
2. `npx nx run-many -t test` — all pass
3. Generate a new app spec → verify `screen_type` and `overlay_width` in pages.yaml
4. Design all pages → verify overlay screens get correct width (400px, not 1440px)
5. Prototype view → bell icon visible on NavigationBar
6. Click bell icon → NotificationsPanel slides in as overlay on the right
7. Click backdrop → overlay closes, current page still visible
8. Screen navigation still works (Dashboard → ClaimsList full switch)
9. E2E tests cover all interaction modes

## Files Summary (all phases)

| File | Change |
|---|---|
| `packages/core/src/types/spec-types.ts` | `screen_type`, `overlay_width`, `trigger_from` on PageEntry; layout section |
| `packages/core/src/config/viewport-resolver.ts` | Screen-type-aware width resolution |
| `packages/cli/src/commands/design-generate.ts` | LLM prompt for screen types; GeneratedPage; writeSpecFiles |
| `packages/cli/src/commands/design-page-all.ts` | Pass screen_type to viewport resolver |
| `packages/agents-ux/src/prompts/ux-planning-system.md` | Shared components; overlay screen rules |
| `packages/agents-ux/src/page-context-prompt.ts` | Layout components in prompt context |
| `packages/designspec-renderer/src/types/design-spec-v2.ts` | `screenType` on DesignSpecV2 |
| `packages/designspec-renderer/src/types/prototype-manifest.ts` | `mode` on NavigationBinding; `screenType` on PrototypeScreen |
| `packages/designspec-renderer/.../DesignSpecRenderer.tsx` | NavigationBar anatomy rendering; cleanup debug logs |
| `packages/designspec-renderer/.../PrototypeApp.tsx` | Overlay/modal rendering; cleanup debug logs |
| `packages/designspec-renderer/.../globals.css` | Overlay/modal styles |
| `packages/dashboard/.../navigation-editor.tsx` | Mode selector (auto-detect from screen_type) |
| `packages/dashboard/.../prototype/route.ts` | Pass mode + screenType |
| `packages/dashboard/.../navigation/route.ts` | Accept mode field |
