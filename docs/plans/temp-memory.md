# Brownfield Import Pipeline — Session Context

**Purpose**: Cross-session memory for agents picking up this work. Read this file at session start.

---

## What We're Building

A "brownfield import" feature for AgentForge: given an existing React app's source code, produce DesignSpec V2 JSON files that can feed into the existing rendering/correction pipeline (Penpot, React renderer, browser renderer).

## Key Design Decision: Source-First, Not Vision-First

We explored two approaches:
1. **Vision-based (rejected as primary)**: Screenshot + DOM accessibility tree → LLM guesses components. Loses component identity, props, and layout intent.
2. **Source-first (chosen)**: Read JSX/TSX source code directly → LLM knows exact components, props, Tailwind classes. Runtime is used only for validation.

**Why source-first wins**: Reading `<Button variant="destructive">Delete</Button>` gives exact catalog mapping. Reading `className="flex flex-col gap-4 p-6"` gives exact LayoutSpec. No guessing needed.

## Architecture Overview

4-phase pipeline:
1. **Source Intelligence** (deterministic): package.json → stack detection, tailwind.config → token extraction, app/ → route discovery, imports → component inventory
2. **Source → DesignSpec** (LLM): Read page JSX + tokens → Claude with SUBMIT_DESIGN_TOOL → DesignSpec V2 JSON
3. **Runtime Validation** (optional): Run app → screenshot → compare with rendered DesignSpec → fidelity score
4. **Project Assembly**: Generate agentforge.yaml, design-tokens.yaml, pages.yaml, etc.

## Brownfield Test App

A sample React app at `fixtures/agentforge-brownfield-app/` serves as the development and test target:
- Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui
- 3 pages: Dashboard, Settings, Users
- Uses: Button, Card, Input, Select, Badge, Table, Avatar, Switch, Checkbox
- Custom teal/coral theme (non-default colors to test token extraction)

## Key Existing Code to Reuse

| Module | Path | What it provides |
|--------|------|-----------------|
| SUBMIT_DESIGN_TOOL | `packages/designspec-renderer/src/sdk/submit-design-tool.ts` | LLM output schema (forced tool_choice) |
| validateDesignSpec | `packages/designspec-renderer/src/validation/validate.ts` | Post-generation validation |
| Component library presets | `packages/cli/src/commands/component-library-presets.ts` | shadcn/MUI/Chakra mappings (6 libraries) |
| Base component catalog | `packages/core/src/catalogs/base-component-catalog.yaml` | 200+ component definitions |
| evaluateDesign | `packages/agents-ux/src/ux-design/design-evaluator.ts` | Vision LLM fidelity scoring |
| DesignSpecV2 types | `packages/designspec-renderer/src/types/design-spec-v2.ts` | Target type definitions |
| DOM extraction | `packages/designspec-renderer/src/renderer/browser/dom-extraction.ts` | Playwright DOM walker (DesignSpec-specific, needs generalized version) |
| Playwright transport | `packages/core/src/mcp/playwright-transport.ts` | Browser automation MCP tools |

## DesignSpec V2 Format Summary

Flat adjacency list JSON:
```json
{
  "screen": "dashboard-overview",
  "width": 1440,
  "nodes": {
    "page-root": { "parent": null, "order": 0, "type": "page", "layout": { "dir": "column" } },
    "stat-card": { "parent": "page-root", "order": 0, "catalog": "card", "shadow": "sm" },
    "cta-btn": { "parent": "page-root", "order": 1, "catalog": "button-primary", "label": "View" }
  }
}
```

Rules:
- One root (parent: null, type: "page")
- Each node: `type` (accelerator) XOR `catalog` (component)
- 7 accelerator types: page, container, section, header, divider, spacer, text
- 24 catalog components: button-*, input-*, card, badge, stat, avatar, select, etc.
- Semantic tokens for colors (text-primary, cta-primary), not hex
- Typography roles (heading-1, body, label), not font sizes

## Current Progress

- [x] Plan written at `docs/plans/brownfield-import-pipeline.md`
- [x] Step 0: Build brownfield test app
- [x] Step 1: Phase 1 source intelligence (4 modules, 13 tests pass, typecheck clean)
- [x] Step 2: Phase 2 source → DesignSpec (prompt + provider + converter, 10 tests pass including real Claude API call: 68 nodes, 5 catalog IDs, 0 validation errors)
- [ ] Step 3: Phase 3 runtime validation
- [ ] Step 4: CLI command + integration

## Brownfield App Details

**Location**: `fixtures/agentforge-brownfield-app/`
**Stack**: Next.js 16.2.2 + TypeScript + Tailwind CSS v4 + shadcn/ui
**Build**: Passes with zero errors (`npx next build`)

**Pages**:
- `/` (Dashboard) — `src/app/page.tsx`: 4 stat cards (Card + Badge), revenue chart placeholder, top performers (Avatar), recent activity (Table with Badge statuses)
- `/settings` — `src/app/settings/page.tsx`: Profile form (Input, Select, Label), notification toggles (Switch), feature checkboxes (Checkbox), danger zone (Button destructive), preferences sidebar (Select, Checkbox), plan card (Badge)
- `/users` — `src/app/users/page.tsx`: User stats (4 Cards), searchable user table (Table + Avatar + Badge for role/status + Checkbox for selection + Button ghost)

**Layout**: `src/app/layout.tsx` + `src/components/sidebar-nav.tsx` — sidebar with logo, nav links, user profile section

**Theme**: Custom teal/coral palette using oklch in `globals.css`:
- Primary: teal (`oklch(0.55 0.15 175)`)
- Accent: coral (`oklch(0.75 0.15 55)`)
- Non-default colors for all variables

**shadcn components installed**: button, card, input, badge, avatar, switch, checkbox, select, table, separator, label

**Expected import pipeline detection**:
- Stack: Next.js + shadcn + Tailwind
- 3 routes: /, /settings, /users
- Components: Button (5 variants), Card, Input, Select, Badge, Table, Avatar, Switch, Checkbox, Separator, Label

## Codebase Rules (from CLAUDE.md)

- Strict TypeScript, no `any`, use `unknown` + type guards
- ES modules only, no CommonJS
- Result pattern (never throw), typed errors extending AgentForgeError
- kebab-case files, PascalCase interfaces, camelCase functions
- Tests next to source (foo.ts → foo.test.ts)
- Must run `nx run-many -t typecheck` and `nx run-many -t test` after changes
- Must update `docs/architecture/design-pipeline-dataflow.md` for pipeline changes
