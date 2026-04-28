# React App → DesignSpec V2: Brownfield Import Pipeline

**Status**: Planning complete, ready for implementation
**Date**: 2026-04-08
**Goal**: Given an existing React application's source code, produce the highest-fidelity DesignSpec V2 JSON by combining source code analysis (primary signal) with runtime capture (validation signal).

---

## Pipeline: 4 Phases

```
Source Code ──────────────────────────────────────────────┐
  │                                                        │
  Phase 1: Source Intelligence (deterministic, zero LLM)   │
  ├─ package.json → stack + component library              │
  ├─ tailwind.config → design tokens                       │
  ├─ app/ or pages/ → route map                            │
  └─ imports scan → component inventory                    │
  │                                                        │
  Phase 2: Source → DesignSpec (LLM per page)               │
  ├─ Read page component + imported components              │
  ├─ Feed JSX + tokens to Claude with SUBMIT_DESIGN_TOOL   │
  └─ Output: DesignSpec V2 JSON per page                    │
  │                                                        │
  Phase 3: Runtime Validation (run the app)                 │
  ├─ npm install + npm run dev                      ◄──────┘
  ├─ Playwright: screenshot + accessibility tree per page
  ├─ Render generated DesignSpec → compare screenshots
  └─ Vision LLM scores fidelity → correction loop if < 80
  │
  Phase 4: Project Assembly
  ├─ Merge tokens → design-tokens.yaml
  ├─ Generate brand.yaml from theme analysis
  ├─ Generate pages.yaml from routes
  └─ Output: Complete AgentForge project
```

---

## Phase 1: Source Intelligence (Deterministic)

Zero LLM cost. Pure file reading and pattern matching.

### 1a. Stack Detection
Read `package.json` → identify:
- **Framework**: Next.js (`next`), Vite (`vite`), CRA (`react-scripts`), Remix (`@remix-run/react`)
- **Component library**: shadcn (`@radix-ui/react-*` + local `components/ui/`), MUI (`@mui/material`), Chakra (`@chakra-ui/react`), Ant Design (`antd`), Mantine (`@mantine/core`)
- **Styling**: Tailwind (`tailwindcss`), CSS modules (`.module.css` files), styled-components, emotion
- **TypeScript**: `typescript` in devDeps → `.tsx` files, else `.jsx`

Cross-reference detected library with AgentForge's existing presets in `packages/cli/src/commands/component-library-presets.ts` (all 6 libraries already mapped).

### 1b. Design Token Extraction
Read `tailwind.config.ts/js` → extract:
- `theme.extend.colors` → `design-tokens.yaml` `colors.primitive` + `colors.semantic`
- `theme.extend.spacing` → `spacing.scale`
- `theme.extend.borderRadius` → `borders.radius`
- `theme.extend.fontFamily` → `typography.font_families`
- `theme.extend.fontSize` → `typography.scale`
- `theme.extend.boxShadow` → `elevation.levels`

Also read CSS variable files (`globals.css`, `theme.css`) → extract `--` custom properties.

Map directly to AgentForge's `DesignTokensSpec` interface — this is a deterministic conversion.

### 1c. Route Discovery
- **Next.js App Router**: Glob `app/**/page.tsx` → path segments → routes
- **Next.js Pages Router**: Glob `pages/**/*.tsx` → routes
- **React Router**: Read router config (grep for `<Route`, `createBrowserRouter`)
- Each route → one entry in `pages.yaml`

### 1d. Component Inventory
Scan all `.tsx/.jsx` files:
- Extract import statements for the detected component library
- Build map: `{ "Button": 47 usages, "Card": 23 usages, "Input": 31 usages, ... }`
- Cross-reference with `base-component-catalog.yaml` (200+ components across 6 libraries)
- Identify which of the 24 DesignSpec catalog entries are used

**Output of Phase 1**: `SourceIntelligence` object:
```typescript
interface SourceIntelligence {
  framework: 'nextjs' | 'vite' | 'cra' | 'remix';
  componentLibrary: string;           // e.g., 'shadcn'
  stylingApproach: 'tailwind' | 'css-modules' | 'css-in-js';
  designTokens: DesignTokensSpec;     // extracted from tailwind config
  routes: RouteInfo[];                // discovered pages
  componentUsage: Record<string, number>;  // component → usage count
  libraryPreset: ComponentLibraryPreset;   // from AgentForge presets
}
```

---

## Phase 2: Source → DesignSpec (LLM, per page)

For each discovered route, read the source code and produce DesignSpec V2.

### 2a. Collect Page Context
For each page:
1. Read the page component file (e.g., `app/dashboard/page.tsx`)
2. Recursively read imported local components (follow `import` paths)
3. Cap at ~20 files or ~30K characters (to fit LLM context)
4. Include: the extracted design tokens, component library preset, and catalog reference

### 2b. LLM Call (Claude Sonnet 4.6, vision not needed)
System prompt instructs Claude to:
- Read the JSX source code
- Map each React component to a DesignSpec node
- Use `type` for structural elements (divs, sections, headers)
- Use `catalog` for library components (Button → `button-primary`, Card → `card`)
- Convert Tailwind classes to LayoutSpec properties
- Use the extracted semantic token names (not raw hex/Tailwind classes)
- Produce the flat adjacency list

Force output via `tool_choice: { type: 'tool', name: 'submit_design' }` — same schema already battle-tested in the existing pipeline.

### Why source-first LLM is better than vision-first

| Mapping | Vision-based (DOM only) | Source-based |
|---------|------------------------|--------------|
| `<Button variant="destructive">` | Guess from red background + button role | **Exact**: `catalog: "button-destructive"` |
| `className="flex flex-col gap-4 p-6"` | Infer from computed styles | **Exact**: `layout: { dir: "column", gap: 16, px: 24, py: 24 }` |
| `<Card className="shadow-md">` | Detect shadow + border-radius | **Exact**: `catalog: "card", shadow: "md"` |
| Conditional: `{isAdmin && <Panel>}` | Only see current state | See all possible states |

**LLM model**: Sonnet 4.6, temp 0, 16K max_tokens, forced tool_choice
**Cost per page**: ~$0.10-0.30 (depending on component count)

---

## Phase 3: Runtime Validation

Run the app to verify the generated DesignSpec matches the actual UI.

### 3a. Setup
- `npm install` in the app directory
- Detect start command from `package.json` scripts (`dev`, `start`, `serve`)
- Launch dev server, wait for ready (poll `http://localhost:PORT`)

### 3b. Per-Page Capture (Playwright)
For each route:
1. Navigate via Playwright
2. Wait for network idle + 2s hydration
3. Capture:
   - **Screenshot** (base64 PNG) — ground truth visual
   - **Accessibility tree** (ariaSnapshot) — semantic structure

### 3c. Fidelity Comparison
1. Render generated DesignSpec V2 through existing browser renderer (`screenshotDesignSpec()`)
2. Vision LLM (`evaluateDesign()`) compares:
   - Original app screenshot vs rendered DesignSpec screenshot
   - Scores fidelity 0-100 across: layout accuracy, component presence, color matching, spacing, typography

### 3d. Correction Loop (if score < 80)
If fidelity is low:
1. Feed Claude both screenshots + the generated DesignSpec JSON + the original source code
2. Ask: "What nodes are missing or incorrect? Produce a corrected DesignSpec."
3. Re-render and re-evaluate (max 3 iterations)

---

## Phase 4: Project Assembly

After all pages are processed:

### 4a. Design System Files
- `design-tokens.yaml` — from Phase 1 Tailwind extraction (already deterministic)
- `brand.yaml` — LLM infers tone/motion from the overall app aesthetic
- `component-library.yaml` — from detected library
- `component-catalog.yaml` — filtered from base catalog for detected library (reuse `generateProjectCatalog()`)

### 4b. Spec Files
- `pages.yaml` — from route discovery, enriched with component lists from Phase 2
- `agentforge.yaml` — project manifest

### 4c. Output Structure
```
{project}/
├── agentforge.yaml
├── agentforge/
│   ├── spec/
│   │   ├── design-tokens.yaml       # From tailwind.config
│   │   ├── brand.yaml               # LLM-inferred
│   │   ├── component-library.yaml   # From package.json detection
│   │   ├── component-catalog.yaml   # Filtered base catalog
│   │   └── pages.yaml               # From route discovery + Phase 2
│   └── designs/
│       ├── dashboard.json            # DesignSpec V2 per page
│       ├── settings.json
│       └── profile.json
├── .agentforge/
│   └── import/
│       ├── source-intelligence.json  # Phase 1 output
│       ├── screenshots/              # Phase 3 original screenshots
│       └── fidelity-report.json      # Phase 3 comparison scores
```

---

## New Files to Create

### Extraction library (designspec-renderer)
```
packages/designspec-renderer/src/extraction/
  types.ts                          — SourceIntelligence, RouteInfo, ExtractionConfig
  detect-stack.ts                   — Read package.json → framework + library + styling
  detect-stack.test.ts
  extract-tailwind-tokens.ts        — Parse tailwind.config → DesignTokensSpec
  extract-tailwind-tokens.test.ts
  discover-routes.ts                — Scan app/ or pages/ → RouteInfo[]
  discover-routes.test.ts
  scan-component-usage.ts           — Grep imports → component inventory
  scan-component-usage.test.ts
```

### Import agent (agents-ux)
```
packages/agents-ux/src/ux-import/
  import-agent.ts                   — Orchestrates 4-phase pipeline
  import-agent.test.ts
  source-to-designspec.ts           — Phase 2: read source + LLM → DesignSpec V2
  source-to-designspec.test.ts
  fidelity-checker.ts               — Phase 3: compare screenshots
  fidelity-checker.test.ts
  project-assembler.ts              — Phase 4: produce AgentForge project files
  project-assembler.test.ts
```

### Prompt
```
packages/agents-ux/src/prompts/
  ux-import-system.md               — System prompt for source→DesignSpec conversion
```

### CLI command
```
packages/cli/src/commands/
  design-import.ts                  — `agentforge design:import <path>`
  design-import.test.ts
```

### Dashboard API
```
packages/dashboard/src/app/api/import/
  route.ts                          — POST /api/import { sourcePath, options }
```

---

## Existing Code to Reuse

| What | File | Phase |
|------|------|-------|
| Component library presets | `packages/cli/src/commands/component-library-presets.ts` | 1a |
| Base component catalog | `packages/core/src/catalogs/base-component-catalog.yaml` | 1d |
| generateProjectCatalog | `packages/core/src/catalogs/generate-project-catalog.ts` | 4 |
| SUBMIT_DESIGN_TOOL | `packages/designspec-renderer/src/sdk/submit-design-tool.ts` | 2b |
| validateDesignSpec | `packages/designspec-renderer/src/validation/validate.ts` | 2b |
| screenshotDesignSpec | `packages/designspec-renderer/src/renderer/browser/screenshot.ts` | 3c |
| evaluateDesign | `packages/agents-ux/src/ux-design/design-evaluator.ts` | 3c |
| Playwright transport | `packages/core/src/mcp/playwright-transport.ts` | 3b |
| Token resolver | `packages/designspec-renderer/src/renderer/token-resolver.ts` | 4a |
| FileSystem abstraction | `packages/core/src/fs/file-system.ts` | All |
| CLI command patterns | `packages/cli/src/commands/design-penpot.ts` | CLI |

---

## CLI Interface

```
agentforge design:import <source-path> [options]

Arguments:
  source-path               Path to React app root (must contain package.json)

Options:
  --pages <routes...>       Specific routes to import (e.g., /dashboard /settings)
  --width <px>              Viewport width (default: 1440)
  --skip-runtime            Skip Phase 3 (no npm install, no dev server)
  --verify                  Run fidelity comparison (requires runtime)
  --project-dir <path>      Output AgentForge project directory
  --dev-url <url>           Use already-running dev server instead of launching one
  --mock                    Mock LLM for testing (use deterministic mappings only)
```

---

## Risks & Mitigations

### Large codebases (>100 files)
**Risk**: Too much source code to fit in LLM context.
**Mitigation**: Phase 1 identifies the key files per page. Only read the page component + direct imports (cap at 20 files/30K chars). For deeply nested component trees, read top 3 levels only.

### Non-Tailwind styling
**Risk**: CSS modules, styled-components, emotion don't have a clean config file to extract tokens from.
**Mitigation**: For CSS modules → scan `.module.css` files for color values, font sizes. For CSS-in-JS → read theme objects (MUI's `createTheme()`, Chakra's `extendTheme()`). Each library has a known theme pattern. Fallback: the runtime screenshot + vision LLM fills the gap.

### Custom/proprietary components
**Risk**: App uses components not in any of the 6 supported libraries.
**Mitigation**: Custom components decompose into structural primitives (container + text + divider). The LLM can still read the JSX and produce a reasonable structural mapping. Log a warning for unmapped components.

### Runtime setup failures
**Risk**: `npm install` or dev server fails (missing env vars, database deps, etc.).
**Mitigation**: Phase 3 is optional (`--skip-runtime`). Source-only extraction still produces good results. The `--dev-url` flag lets users point to an already-running instance.

---

## Implementation Order

### Step 0: Build Brownfield Test App (`fixtures/agentforge-brownfield-app/`)
Create a realistic sample React app to develop and test the import pipeline against.

- **Stack**: Next.js 15 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Custom theme**: Non-default colors (e.g., teal/coral palette), custom fonts, custom shadows
- **Pages** (3-4):
  - `/` — Dashboard: stat cards, charts placeholder, recent activity table
  - `/settings` — Settings: form inputs, switches, selects, button variants
  - `/users` — Users list: data table, badges, avatars, search input
- **shadcn components used**: Button (all variants), Card, Input, Select, Badge, Table, Avatar, Switch, Checkbox
- **Layout patterns**: Sidebar nav, grid layouts, flex rows, responsive breakpoints

### Step 1: Phase 1 — Source Intelligence
Implement deterministic source analysis (detect-stack, extract-tailwind-tokens, discover-routes, scan-component-usage).
Test against brownfield app.

### Step 2: Phase 2 — Source → DesignSpec
Implement LLM prompt + SUBMIT_DESIGN_TOOL integration.
Test against brownfield app pages.

### Step 3: Phase 3 — Runtime Validation
Implement Playwright capture + fidelity comparison.
Test by running brownfield app + comparing screenshots.

### Step 4: CLI Command + Integration
Wire it all together as `agentforge design:import`.

---

## Verification Plan

1. `nx run designspec-renderer:test` — extraction unit tests
2. `nx run agents-ux:test` — import agent tests
3. `nx run-many -t typecheck` — full type check
4. Manual test: Run `agentforge design:import fixtures/agentforge-brownfield-app/` and verify output
5. Round-trip test: Generate DesignSpec → render → import → compare (>=80% node preservation)
