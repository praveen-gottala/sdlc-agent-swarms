# Prototype Rendering Data Flow

> End-to-end trace of how DesignSpec v2 JSON renders as an interactive
> prototype in the browser. Companion to
> [`design-pipeline-dataflow.md`](design-pipeline-dataflow.md) (design
> generation, Stages 0-7).

Read this doc when modifying: the prototype API route, spec-split
chrome stripping, the iframe bridge, DesignSpecRenderer CSS mapping,
LayoutShell, or PrototypeApp.

---

## 1. Overview

```
                         DesignSpec v2 JSON files on disk
                                    |
                                    v
               +--------------------------------------------+
               |  GET /api/prototype                        |
               |  1. Load specs (designs/ > previews/)      |
               |  2. Strip duplicate chrome                 |
               |  3. Strip persistent overlays              |
               |  4. Load tokens, catalog, chromeSpec       |
               +--------------------------------------------+
                                    |
                          JSON response
                                    |
                                    v
               +--------------------------------------------+
               |  Dashboard (page.tsx)                      |
               |  handleLoadPrototype()                     |
               |  bridgeRef.current.loadPrototype(payload)  |
               +--------------------------------------------+
                                    |
                        postMessage (load-prototype)
                                    |
                                    v
               +--------------------------------------------+
               |  Renderer iframe (localhost:4100)          |
               |  main.tsx -> onLoadPrototype()             |
               |  Mounts <PrototypeApp>                     |
               +--------------------------------------------+
                                    |
                                    v
        +------------------+  +--------------------------+
        | LayoutShell      |  | DesignSpecRenderer       |
        | (persistent      |  | (per-screen content)     |
        |  header/footer)  |  | Accelerators + Catalog   |
        +------------------+  +--------------------------+
```

---

## 2. Spec Sources & Precedence

Two directories store DesignSpec v2 JSON:

| Directory | Writer | Purpose |
|-----------|--------|---------|
| `agentforge/designs/{pageId}.json` | Dashboard (Save button, dashboard generator) | Design canvas source of truth |
| `.agentforge/previews/{moduleId}/scripts/designspec-v2.json` | CLI pipeline (`design:page`, `design:page:all`) | Pipeline working output |

**Precedence rule:** `agentforge/designs/` wins. The prototype API overrides
each screen's `specPath` to point to `agentforge/designs/{screenId}.json`
when that file exists. If it doesn't (page generated via CLI but never saved
in the dashboard), the preview spec is used as fallback.

**Other files loaded by the prototype API:**

| File | Source | Purpose |
|------|--------|---------|
| `.agentforge/previews/shared-chrome.json` | `design:page:all` chrome pass | Shared navigation bar/footer for LayoutShell |
| `shared-chrome.e2e.json` (repo root) | Committed fallback | E2E tests without a local generate step |
| `.agentforge/previews/prototype.json` | `design:page:all` stage 4 | Navigation manifest (screen list + bindings) |
| `agentforge/spec/design-tokens.yaml` | `agentforge init` / user-edited | Color, typography, spacing tokens |
| `agentforge/spec/component-catalog.yaml` | `agentforge init` / user-edited | Catalog component definitions |

**Key file:** `packages/dashboard/src/app/api/prototype/route.ts`

### Trap: wrong spec source

The prototype API originally preferred `.agentforge/previews/` specs, which
are older pipeline outputs. When the user edited and saved a design in the
canvas, the prototype still showed stale preview data. Fix: always prefer
`agentforge/designs/` when it exists.

---

## 3. Spec Scrubbing

Before serving specs to the renderer, the API scrubs three categories of
nodes. All functions live in
`packages/designspec-renderer/src/renderer/browser/spec-split.ts`.

### 3.1 Chrome duplicate removal

The shared chrome (from `shared-chrome.json`) defines header/sidebar/footer
regions. Page specs may contain their own copies of these components (from
separate LLM runs). Rendering both produces a double navigation bar.

```
findPageChromeRootIds(pageSpec, chromeSpec.regions)
  1. Exact match: chrome region ID === page root child ID
  2. Compact match: strip hyphens, lowercase ("top-bar" matches "topbar")
  3. Pattern match: regex (/^(top-?bar|header|nav-?bar)(-|$)/i)

stripChromeFromSpec(spec, matchedIds)
  - Removes matched root children and ALL their descendants
  - Removes empty root-level spacers (type=spacer, no children)
  - Converts non-empty spacers to containers (LLM mislabeling)
  - Coerces root from type:'page' to type:'container'
```

### 3.2 Persistent overlay removal

LLM page specs sometimes embed a modal dialog as a root-level
absolute-positioned container with `background: 'overlay'`. Since
DesignSpec has no open/close state, this would cover content permanently.

```
stripPersistentOverlays(spec)
  - Finds root children with position:absolute/fixed + overlay background
  - Strips them via stripChromeFromSpec()
```

### 3.3 Pseudo-screen filtering

Screens with `__`-prefixed IDs (e.g., `__shared-chrome__`) are removed from
the manifest. They are delivery vehicles for the chrome pass, not navigation
destinations.

### Trap: hardcoded root ID

All functions use `findRootId(spec)` to discover the actual root node
(the node with `parent === null`). Different LLM runs produce different root
IDs: `root`, `page-root`, `screen-root`. Never hardcode `'root'`.

**Reference:** ADR-040

---

## 4. iframe Bridge Protocol

The dashboard and renderer communicate via `postMessage` across a
cross-origin iframe boundary (localhost:3000 ↔ localhost:4100).

### Parent → Child (dashboard → renderer)

| Message Type | Payload | Purpose |
|---|---|---|
| `load-spec` | `specJson: string` | Design canvas: render single spec |
| `load-prototype` | `payload: string` | Prototype: render multi-screen with chrome |
| `enable-tagging` | — | Enable click-to-select mode |
| `disable-tagging` | — | Disable click-to-select mode |
| `highlight-node` | `nodeId` | Highlight a specific node |
| `clear-highlights` | — | Remove all highlights |
| `update-node-style` | `nodeId`, `styles` | Live inspector property edit |

### Child → Parent (renderer → dashboard)

| Message Type | Payload | Purpose |
|---|---|---|
| `ready` | — | Renderer is initialized and accepting messages |
| `render-complete` | `success`, `nodeCount` | Spec finished rendering |
| `node-clicked` | `nodeId`, `catalogType`, `computedStyles` | User clicked a node |
| `node-hovered` | `nodeId`, `rect`, `catalogType` | Mouse over a node |
| `log` | `level`, `message`, `logSource` | Renderer log forwarding |

All messages carry `source: 'agentforge'` for filtering.

**Mode locking:** Once in prototype mode, `load-spec` messages are ignored
(`main.tsx:129`). The renderer stays in prototype mode until unmounted.

### Trap: bridge race condition

When transitioning from design canvas to prototype mode, the stale bridge
from the unmounted DesignCanvas iframe has `isReady: true`. The payload-
sending effect fires immediately, calls `loadPrototype()` on the stale
bridge, and the message goes to a dead iframe. The polling backup never
starts because the first send "succeeded."

**Fix:** Clear `bridgeRef.current = null` before setting
`prototypeMode(true)`. This forces the effect to poll until the new
PrototypeView bridge fires `ready`.

**Key files:**
- `packages/designspec-renderer/src/renderer/browser/app/src/iframe-bridge.ts`
- `packages/dashboard/src/lib/hooks/use-renderer-bridge.ts`
- `packages/dashboard/src/app/(dashboard)/design/page.tsx` (handleLoadPrototype)

---

## 5. DesignSpec-to-CSS Mapping

The renderer converts DesignSpec v2 nodes to React elements with inline CSS.
Core logic is in
`packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`.

### Rendering pipeline

```
spec.nodes (flat adjacency list)
  → buildTree()          : parent-child tree
  → resolveNode()        : merge catalog defaults + extends + overrides
  → renderNode()         : dispatch to accelerator or catalog renderer
    → renderAccelerator(): page | container | section | header | text | divider | spacer
    → renderCatalog()   : button | badge | card | input | progress-bar | tabs | ...
```

### Key style functions

| Function | Input → Output |
|----------|----------------|
| `getSizeStyles(width, height)` | `fill` → `flex:'1 1 auto'; width:'100%'; minWidth:0`. Number → `width:Npx; flex:'none'` |
| `getLayoutStyles(layout)` | `dir/gap/align/justify/px/py` → flex or grid CSS |
| `getOverrideStyles(overrides)` | Allowlisted keys via `SAFE_OVERRIDE_KEYS` → inline CSS. Color keys validated by `looksLikeCssPaintValue()` |
| `getTypographyStyles(role, tokens)` | Token name → `fontFamily/fontSize/lineHeight/fontWeight` |
| `getShadowStyle(shadow, tokens)` | Token name → `boxShadow` CSS value |
| `getCommonNodeStyles(node, tokens)` | Combines spacing + size + shadow + position + overrides |

### Catalog resolution

```
normalizeCatalogIdToKebab("NavigationBar") → "navigation-bar"
Exact match → fuzzy match (strip last segment progressively)
  "progress-bar-error" → "progress-bar" → "progress"
Extends chain: max depth 5, circular ref guard
```

### Trap: `flex: 1` vs `flex: '1 1 auto'`

`flex: 1` is shorthand for `flex: 1 1 0%`. The `0%` flex-basis causes two
problems in column-direction parents:
1. Overrides explicit `height` (basis takes precedence over height in flex)
2. With `align-items: center`, width collapses to intrinsic content (often 0)

Fix: use `flex: '1 1 auto'` so flex-basis falls back to the `height`/`width`
property. Add `width: '100%'` for cross-axis fill in column parents.

---

## 6. LayoutShell & PrototypeApp

### LayoutShell

Renders persistent chrome (header/sidebar/footer) around swappable content.

```
<div style="display:flex; flexDirection:column; height:100vh">
  <Header>   filterSpecToNodes(chromeSpec, regions.header)   </Header>
  <div style="display:flex; flex:1">
    <Sidebar> filterSpecToNodes(chromeSpec, regions.sidebar) </Sidebar>
    <Content> {children} — page spec with chrome stripped    </Content>
  </div>
  <Footer>   filterSpecToNodes(chromeSpec, regions.footer)   </Footer>
</div>
```

Active tab state: `applyChromeActiveForPage(chrome, activePageId)` sets
`active: true` on tab nodes whose `navigateTo === activePageId`. Detects
tabs by `navigateTo` presence, not ID patterns.

### PrototypeApp

Manages screen navigation and overlay dialogs.

- `activeScreenId` / `overlayScreenId` state
- Hash-based routing: `window.location.hash = #/{screenId}`
- Navigation bindings from manifest + inline `navigateTo` on nodes
- Overlay screens (modal/drawer/sheet) render in `<dialog>` element
- `ScreenSelectorBar` at bottom for direct screen switching

**Key files:**
- `packages/designspec-renderer/src/renderer/browser/app/src/LayoutShell.tsx`
- `packages/designspec-renderer/src/renderer/browser/app/src/PrototypeApp.tsx`

---

## 7. File Map

| File | Role |
|------|------|
| `packages/dashboard/src/app/api/prototype/route.ts` | API: loads specs, scrubs chrome, returns JSON |
| `packages/dashboard/src/app/(dashboard)/design/page.tsx` | Dashboard: prototype mode toggle, bridge management |
| `packages/dashboard/src/lib/hooks/use-renderer-bridge.ts` | Dashboard: postMessage hook (send/receive) |
| `packages/designspec-renderer/src/renderer/browser/spec-split.ts` | Chrome stripping, overlay removal, root ID discovery |
| `packages/designspec-renderer/src/renderer/browser/app/src/main.tsx` | Renderer entry: routes to DesignSpecRenderer or PrototypeApp |
| `packages/designspec-renderer/src/renderer/browser/app/src/iframe-bridge.ts` | Renderer: postMessage listener/sender |
| `packages/designspec-renderer/src/renderer/browser/app/src/PrototypeApp.tsx` | Multi-screen navigation, overlays, ScreenSelectorBar |
| `packages/designspec-renderer/src/renderer/browser/app/src/LayoutShell.tsx` | Persistent chrome regions + content slot |
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx` | Core renderer: tree building, catalog resolution, CSS mapping |
| `packages/designspec-renderer/src/catalog/resolver.ts` | Catalog lookup: normalize ID, fuzzy match, extends chain |
