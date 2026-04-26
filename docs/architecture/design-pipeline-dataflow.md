# Design Pipeline Architecture & Data Flow

> End-to-end trace of the AgentForge UX design pipeline — from project
> initialization through design generation to code output.

---

## End-to-End Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AgentForge Design Pipeline                          │
└─────────────────────────────────────────────────────────────────────────────┘

 ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────────┐
 │  Stage 0 │    │   Stage 1    │    │   Stage 2    │    │    Stage 3    │
 │   init   │───▶│design:generate│───▶│  Research    │───▶│   Planning   │
 │  wizard  │    │  app spec    │    │    Agent     │    │    Agent      │
 └──────────┘    └──────────────┘    └──────────────┘    └───────┬───────┘
                                                                  │
                                                                  ▼
 ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────────┐
 │  Stage 7 │    │   Stage 6    │    │   Stage 5    │    │    Stage 4    │
 │  Output  │◀───│Implementation│◀───│  Feedback    │◀───│ Design Agent  │
 │  Files   │    │    Agent     │    │    Loop      │    │(browser|penpot)│
 └──────────┘    └──────────────┘    └──────────────┘    └───────────────┘
```

**Orchestrated by `runDesignPipeline()`** in
`packages/agents-ux/src/design-pipeline/pipeline.ts` — single entry point
for both CLI and dashboard. Data flows left-to-right, top-to-bottom. Each
stage produces artifacts consumed by downstream stages. See ADR-046.

---

## Channels and Callers (Three-Layer Architecture)

```
┌──────────────────────────────────────────────────────────────┐
│  Layer C — Transport Callers                                 │
│                                                              │
│  CLI design:page.ts ──────┐                                  │
│  CLI design-page-all.ts ──┤── PipelineInput ──┐              │
│  Dashboard design/route.ts┘                   │              │
│                                               ▼              │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Layer B — Orchestrator: runDesignPipeline()           │   │
│  │                                                        │   │
│  │  Sequential: research → planning → design → evaluator  │   │
│  │  Caching: per-stage JSON artifacts for resume           │   │
│  │  Telemetry: PipelineTelemetrySink callbacks             │   │
│  │  Dispatch: designTool → browserDesignWork | penpotWork  │   │
│  └────────────────────────────────────────────────────────┘   │
│                         │                                     │
│                         ▼                                     │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Layer A — Work Functions (pure agent logic)           │   │
│  │                                                        │   │
│  │  uxResearchWork()    — typed UXResearchOutput           │   │
│  │  uxPlanningWork()    — typed UXPlanningOutput            │   │
│  │  browserDesignWork() — DesignSpecV2 via submit_design    │   │
│  │  penpotDesignWork()  — DesignSpecV2 via Penpot scripts   │   │
│  │  evaluateDesign()    — vision LLM evaluation             │   │
│  └────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

| Caller | Entry point | `designTool` | Sink |
|--------|-------------|------------|------|
| CLI `design:page` | `design-page.ts` | CLI flag `--tool` (default `browser`) | `CliStdoutSink` |
| CLI `design:page:all` | `design-page-all.ts` | CLI flag (default `browser`) | `CliStdoutSink` |
| Dashboard full pipeline | `design/route.ts` | Hardcoded `'browser'` | `DashboardSseSink` |

Both paths call `runDesignPipeline(input: PipelineInput)` from
`@agentforge/agents-ux`. Transport code never calls work functions directly.

### Chrome Pass (`chromePass` field on `PipelineInput`)

```typescript
chromePass?: {
  mode: 'generate' | 'consume';
  spec?: DesignSpecV2;       // when mode='consume': frozen chrome to inject
  activePageId?: string;     // when mode='consume': page ID for active tab state
}
```

- `mode: 'generate'` — reference page produces shared chrome spec.
- `mode: 'consume'` — subsequent pages receive frozen chrome to inject.
- Used by `design-page-all.ts` for cross-screen chrome consistency.

---

**Data flows left-to-right, top-to-bottom.** Each stage produces artifacts
consumed by downstream stages. The pipeline is orchestrated by the CLI
(`design:page` command) with per-stage caching for resumability.

---

## Stage 0: Onboarding (`agentforge init`)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INIT COMMAND                                │
│                                                                     │
│  Source: packages/cli/src/commands/init.ts                          │
│  Helpers: packages/cli/src/design/ (archetypes, tokens, tailwind)   │
│  Entry:  initCommand(rootDir, fileSystem?, input?, output?, config?)│
│                                                                     │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐     │
│  │  5-Question  │──▶│ Build Project │──▶│  Scaffold Files      │     │
│  │   Wizard     │   │  Manifest    │   │  (YAML + templates)  │     │
│  └─────────────┘   └──────────────┘   └──────────┬───────────┘     │
│                                                    │                │
│                                    ┌───────────────┴────────────┐   │
│                                    ▼                            ▼   │
│                          ┌─────────────────┐    ┌────────────────┐  │
│                          │ Pick Component  │    │ Generate Design│  │
│                          │   Library       │    │    Options     │  │
│                          └────────┬────────┘    └───────┬────────┘  │
│                                   │                     │           │
│                                   ▼                     ▼           │
│                          component-library.yaml   design-tokens.yaml│
│                          component-catalog.yaml   brand.yaml        │
│                                                   tailwind.config.ts│
│                                                   global.css        │
└─────────────────────────────────────────────────────────────────────┘
```

### Wizard Questions

| # | Question | Default | Stored As |
|---|----------|---------|-----------|
| 1 | Project name | — | `InitAnswers.name` |
| 2 | GitHub org/repo | — | `InitAnswers.repo` |
| 3 | Primary Slack channel | `#agentforge` | `InitAnswers.slackChannel` |
| 4 | Enable Telegram? | n | `InitAnswers.telegramEnabled` |

### Manifest Generation (`buildManifest()`)

Produces `agentforge.yaml` with:

- **Stack defaults**: `react` / `node` / `postgresql` / `tailwind`
- **Agent providers**: Sonnet 4.6 (default), Opus 4.6 (architecture), Haiku 4.5 (code review)
- **Sandbox**: GitHub Actions, 15-min timeout, 3 max retries
- **Channels**: Slack + optional Telegram + CLI

### Agent Scaffolding (`buildAgentsYaml()`)

Generates 7 agent role definitions in `agentforge/spec/agents.yaml`:

| Role | SDLC Phase | Provider | On Complete Event |
|------|-----------|----------|-------------------|
| `ux_researcher` | design | claude-sonnet-4-6 | `DesignBriefCompleted` |
| `wireframer` | design | claude-sonnet-4-6 | `WireframeReady` |
| `spec_writer` | spec | claude-opus-4-6 | `SpecDraftReady` |
| `task_decomposer` | spec | claude-sonnet-4-6 | `TasksDecomposed` |
| `code_generator` | code | claude-sonnet-4-6 | `CodeDraftReady` |
| `test_writer` | code | claude-sonnet-4-6 | `TestSuiteReady` |
| `code_reviewer` | code | claude-haiku-4-5 | `ReviewCompleted` |

### Component Library Selection (`pickComponentLibrary()`)

**Source**: `packages/cli/src/commands/design-system.ts`

```
User chooses library ──▶ Write component-library.yaml
                         + Generate filtered component-catalog.yaml
```

| Library | ID | Package |
|---------|----|---------|
| shadcn/ui | `shadcn` | `@shadcn/ui` |
| MUI v5 | `mui` | `@mui/material` |
| Chakra UI | `chakra` | `@chakra-ui/react` |
| Ant Design v5 | `antd` | `antd` |
| Radix Themes | `radix` | `@radix-ui/themes` |
| Mantine | `mantine` | `@mantine/core` |

**Component Catalog** (`generateProjectCatalog()`): Filters the base catalog
(1468-line YAML with 10+ component definitions) to the selected library,
applies `min_height` from touch targets, and validates token bindings.

### Design Options Generation (`generateDesignOptions()`)

**Source**: `packages/cli/src/commands/generate-design-options.ts`
**Helpers**:
- `packages/cli/src/design/archetypes.ts` — fallback archetype definitions (`buildDesignTokensSpec`, `buildBrandSpec`)
- `packages/cli/src/design/design-tokens-defaults.ts` — shared DEFAULT_* constants
- `packages/cli/src/design/preview-helpers.ts` — color utilities (`resolveColor`, `isLight`, `hexWithOpacity`)
- `packages/cli/src/design/preview-html.ts` — `generatePreviewHtml()` (HTML comparison page)
- `packages/cli/src/design/tailwind-generator.ts` — `generateTailwindConfig()`, `generateGlobalCss()`
- `packages/cli/src/design/design-system-writer.ts` — `writeDesignSystemFiles()` (consolidated file writer)

```
┌───────────────────────────────────────────────────────────────────┐
│                   DESIGN OPTIONS PIPELINE                         │
│                                                                   │
│  Input:  App name, description, target audience, PRD (optional;    │
│          provided directly or loaded from docs/prd.md)             │
│  Model:  claude-sonnet-4-6 (temp=0.8, maxTokens=8192)            │
│                                                                   │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌────────────┐   │
│  │  LLM    │───▶│ Parse &  │───▶│ Backfill │───▶│  Validate  │   │
│  │ Generate│    │ Validate │    │ Defaults │    │  & Convert │   │
│  │ 3 opts  │    │ Options  │    │          │    │            │   │
│  └─────────┘    └──────────┘    └──────────┘    └─────┬──────┘   │
│       │                                                │          │
│       │ (on failure)                                   ▼          │
│       ▼                                         ┌────────────┐   │
│  ┌──────────┐                                   │ HTML       │   │
│  │ Fallback │──────────────────────────────────▶│ Preview    │   │
│  │ 3 Arche- │                                   │ + User     │   │
│  │  types   │                                   │   Choice   │   │
│  └──────────┘                                   └────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

**LLM generates per option:**
- `label` — theme name
- `vibe` — one-liner feel
- `colors.primitive` — 5-8 hex colors (kebab-case names)
- `colors.semantic` — 17 required semantic mappings (reference primitives)
- `fonts` — display + body (Google Fonts only)
- `brand` — tone, illustration direction/description, motion feel
- `elevation` — 4-level shadow system
- `components` — button/card/input/tab_bar/badge/avatar/progress_bar variants

**Backfill pipeline** (fills gaps if LLM truncates):

| Step | Function | What It Fills |
|------|----------|---------------|
| 1 | `backfillSemanticColors()` | Missing semantic color keys (17 required) |
| 2 | `backfillComponents()` | Default component variant token bindings |
| 3 | `backfillElevation()` | 4-level shadow system if missing |

**Fallback archetypes** (when no API key or LLM fails):

| Archetype | Palette | Fonts |
|-----------|---------|-------|
| Warm & Inviting | cream, teal, coral | Nunito / Open Sans |
| Clean & Professional | white, slate, blue | — |
| Bold & Modern | dark, violet, lime | — |

**Shared fixed tokens** (never LLM-generated, code-enforced):

```yaml
spacing:      { unit: 8, scale: [4, 8, 12, 16, 24, 32, 48, 64] }
borders:      { radius: { small: 8, medium: 12, large: 16, pill: 9999 } }
touch_targets: { minimum_height: 44, minimum_width: 44 }
layout:
  grid:       { columns: 12, gutter: 24, margin: 24 }
  content_max_width: 1280
  breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 }
z_index:      { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 }
typography_scale:
  heading-1: 32px/700  heading-2: 24px/700  heading-3: 18px/600
  body: 14px/400       label: 12px/500      small: 11px/400
```

### Stage 0 Output Files

| File | Path | Generated By |
|------|------|-------------|
| Project manifest | `agentforge.yaml` | `scaffoldProject()` |
| Agent definitions | `agentforge/spec/agents.yaml` | `buildAgentsYaml()` |
| PRD template | `agentforge/spec/prd.yaml` | `scaffoldProject()` |
| Design tokens | `agentforge/spec/design-tokens.yaml` | `saveDesignTokens()` |
| Brand spec | `agentforge/spec/brand.yaml` | `saveBrandSpec()` |
| Component library | `agentforge/spec/component-library.yaml` | `saveComponentLibrary()` |
| Component catalog | `agentforge/spec/component-catalog.yaml` | `saveComponentCatalog()` |
| Tailwind config | `tailwind.config.ts` | `generateTailwindConfig()` |
| Global CSS | `src/styles/global.css` | `generateGlobalCss()` |
| Env template | `.env.example` | `scaffoldProject()` |

---

## Stage 1: App Spec Generation (`design:generate`)

```
┌──────────────────────────────────────────────────────────────────────┐
│                     DESIGN:GENERATE COMMAND                          │
│                                                                      │
│  Shared:  packages/agents-ux/src/app-spec/generate-app-spec.ts        │
│  CLI:     packages/cli/src/commands/design-generate.ts                │
│  Dashboard: packages/dashboard/src/app/api/spec/generate/route.ts    │
│  Entry:  generateAppSpec(input) → Result<GeneratedAppSpec>            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                     INPUT                                       │  │
│  │  agentforge.yaml ──▶ project name, description                  │  │
│  │  docs/prd.md     ──▶ PRD content (markdown)                     │  │
│  │  design-tokens.yaml ──▶ colors, typography, layout              │  │
│  │  brand.yaml      ──▶ tone, audience, WCAG level                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                           │                                          │
│                           ▼                                          │
│                    ┌─────────────┐                                    │
│                    │   LLM Call  │                                    │
│                    │ Sonnet 4.6  │                                    │
│                    │ temp=0.7    │                                    │
│                    │ 16384 tokens│                                    │
│                    └──────┬──────┘                                    │
│                           │                                          │
│              ┌────────────┼────────────┐                             │
│              ▼            ▼            ▼                             │
│        ┌──────────┐ ┌──────────┐ ┌──────────┐                      │
│        │pages.yaml│ │models.yaml│ │ api.yaml │                      │
│        └──────────┘ └──────────┘ └──────────┘                      │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                   HTML PREVIEW                                  │  │
│  │  Overview (counts) │ Pages (cards) │ Models (fields) │ API      │  │
│  │  User approves: (y)es / (r)egenerate / (n)o                    │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### LLM Prompt Requirements

The system prompt instructs the LLM to generate:

- **3-6 pages** with complete user journeys
- Each page: `id`, `name`, `description`, `route`, `components[]`, `data_sources[]`, `viewports`
- **Models**: `id`, `name`, `fields[]` (with `id` + `created_at` minimum), `db_table`
- **Endpoints**: RESTful (GET/POST/PUT/DELETE), `query_params`, `response` schema refs, `auth`
- Component names should be descriptive (e.g., `BookCard`, `SearchBar`, `NavigationHeader`)

### Output Types

```typescript
interface GeneratedAppSpec {
  pages: GeneratedPage[];       // 3-6 app pages with routes + components
  models: GeneratedModel[];     // Data models with fields + db_table
  endpoints: GeneratedEndpoint[]; // REST API endpoints
}

interface GeneratedPage {
  id: string;            // kebab-case
  name: string;          // human readable
  description: string;
  route: string;         // URL path
  components: string[];  // component names
  data_sources: string[];
  viewports?: number[];  // [1440] default, optional 768/390
}

interface GeneratedModel {
  id: string;
  name: string;          // PascalCase
  fields: { name: string; type: string; nullable?: boolean }[];
  db_table: string;
}

interface GeneratedEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;          // prefixed with /api
  description: string;
  query_params: { name: string; type: string }[];
  response: { type: string; schema_ref: string };
  auth: string;
}
```

### Stage 1 Output Files

| File | Path | Content |
|------|------|---------|
| Pages spec | `agentforge/spec/pages.yaml` | Pages with routes, components, data sources |
| Models spec | `agentforge/spec/models.yaml` | Data models with fields and db tables |
| API spec | `agentforge/spec/api.yaml` | REST endpoints with params and responses |

---

## Stage 2: Research Agent

```
┌──────────────────────────────────────────────────────────────────────┐
│                      UX RESEARCH AGENT                               │
│                                                                      │
│  Source: packages/agents-ux/src/ux-research/ux-research.ts           │
│  Entry:  uxResearchWork(input, context)                              │
│  Role:   ux_research                                                 │
│  Event:  UXModuleRequested → DesignBriefCompleted                    │
│                                                                      │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐    │
│  │       INPUT           │    │           LLM CALL               │    │
│  │                       │    │                                  │    │
│  │  moduleId             │    │  Model:    claude-sonnet-4-6     │    │
│  │  taskId               │    │  Tokens:   8000                  │    │
│  │  prdRequirements[]    │───▶│  Temp:     0                     │    │
│  │  designTokensSpec?    │    │  Prompt:   ux-research-system.md │    │
│  │  pageContext?         │    │                                  │    │
│  └──────────────────────┘    └──────────────┬───────────────────┘    │
│                                              │                       │
│  ┌───────────────────────────────────────────▼──────────────────┐    │
│  │                        OUTPUT                                │    │
│  │                                                              │    │
│  │  briefId: string           ── unique brief identifier        │    │
│  │  moduleId: string          ── echoed from input              │    │
│  │  requirementIds: string[]  ── mapped PRD requirements        │    │
│  │  designConstraints: string[] ── extracted constraints        │    │
│  │  referencePatterns: string[] ── applicable design patterns   │    │
│  │  accessibilityRequirements: string[]                         │    │
│  │  dataModelDependencies: string[]                             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Permissions: read_spec, read_design, read_design_system             │
│  Denied:      write_code, write_design, create_branch                │
│  HITL:        notify_only                                            │
│  Budget:      40k tokens, $1.50/task                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Input Validation Guards

- `prdRequirements` must be non-empty array
- Warns if entries are < 50 chars (likely labels, not full PRD content)
- Missing `designTokensSpec` returns `diskDesignTokensRequiredErr`

### Data Flow to Stage 3

Research output is emitted as `DesignBriefCompleted` event. The planning agent
subscribes to this event:

```typescript
eventBus.subscribe('DesignBriefCompleted', (event) => {
  // Feeds entire research output as designBrief to planning
  const input: UXPlanningInput = {
    briefId: event.briefId,
    moduleId: event.moduleId,
    taskId: event.taskId,
    designBrief: event as UXResearchOutput,
  };
});
```

---

## Stage 3: Planning Agent

```
┌──────────────────────────────────────────────────────────────────────┐
│                      UX PLANNING AGENT                               │
│                                                                      │
│  Source: packages/agents-ux/src/ux-planning/ux-planning.ts           │
│  Entry:  uxPlanningWork(input, context)                              │
│  Role:   ux_planning                                                 │
│  Event:  DesignBriefCompleted → ComponentSpecReady                   │
│                                                                      │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐    │
│  │       INPUT           │    │           LLM CALL               │    │
│  │                       │    │                                  │    │
│  │  briefId              │    │  Model:    claude-sonnet-4-6     │    │
│  │  moduleId             │    │  Tokens:   8000                  │    │
│  │  designBrief          │───▶│  Temp:     0                     │    │
│  │  (UXResearchOutput)   │    │  Schema:   PLANNING_OUTPUT_SCHEMA│    │
│  │  designConfig?        │    │  + design tokens, brand, catalog │    │
│  │  pageContext?         │    │                                  │    │
│  └──────────────────────┘    └──────────────┬───────────────────┘    │
│                                              │                       │
│  ┌───────────────────────────────────────────▼──────────────────┐    │
│  │                        OUTPUT                                │    │
│  │                                                              │    │
│  │  specRef: string                                             │    │
│  │  componentTree: ComponentTreeNode[]  ── hierarchical layout  │    │
│  │  tokenBindings: Record<string, string> ── property→token     │    │
│  │  responsiveRules: ResponsiveRule[]  ── breakpoint+width+layout │    │
│  │  screens?: ScreenDefinition[]                                │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              TOKEN BINDING VALIDATION LOOP                   │    │
│  │                                                              │    │
│  │  validateTokenBindings() ──▶ valid? ──▶ done                 │    │
│  │          │ (invalid)                                         │    │
│  │          ▼                                                   │    │
│  │  LLM correction (max 2 retries, 2000 tokens)                │    │
│  │          │ (still invalid)                                   │    │
│  │          ▼                                                   │    │
│  │  applyDotNotationFallback() ── deterministic mapping         │    │
│  │  (e.g., "color.surface.primary" → "surface-primary")        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Permissions: read_spec, read_design, read_design_system, write_spec │
│  Denied:      write_code, create_branch                              │
│  HITL:        review_and_override                                    │
│  Budget:      30k tokens, $1.00/task                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Tree Structure

```typescript
interface ComponentTreeNode {
  name: string;                            // e.g., "GameHomeLayout"
  props: string[];                         // e.g., ["title", "subtitle"]
  children: ComponentTreeNode[];           // nested components
  defaultValues?: Record<string, string>;  // e.g., { title: "Welcome" }
}
```

### Token Binding Validation

Valid token names are extracted from the design system spec:
- Semantic color names (`background-primary`, `cta-primary`, etc.)
- Typography roles (`heading-1`, `body`, `label`, etc.)
- Spacing scale values (`4`, `8`, `12`, etc.)
- Border radius names (`small`, `medium`, `large`, `pill`)
- Elevation levels (`0`, `1`, `2`, `3`)
- Layout tokens (breakpoints, grid settings)
- Z-index names (`dropdown`, `modal`, etc.)

### Implementation Stages

The planning agent defines a 4-stage implementation plan:

| Stage | Purpose |
|-------|---------|
| `layout` | Structural layout with component hierarchy |
| `theme` | Apply design tokens (colors, typography, spacing) |
| `animation` | Motion and transitions per brand spec |
| `implementation` | Full interactive React components |

---

## Stage 4: Design Agent (browser | penpot)

The design stage dispatches based on `designTool` in `PipelineInput`:

```
designNode(state, ctx)
  │
  ├── designTool === 'browser' → browserDesignWork()
  │     Source: packages/agents-ux/src/design-pipeline/browser-design-work.ts
  │     LLM → submit_design tool-use → DesignSpecV2 JSON
  │     Handles: Chrome Pass injection, screen_type/viewport, navigateTo
  │     Retry: empty-node retry on malformed LLM output
  │
  └── designTool === 'penpot' → penpotDesignWork()
        Source: packages/agents-ux/src/ux-design/ux-penpot-design.ts
        LLM → Penpot script → execute → screenshot → self-correct
```

### Penpot Path — 3-Phase Pipeline

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PENPOT DESIGN AGENT                                │
│                                                                      │
│  Source: packages/agents-ux/src/ux-design/ux-penpot-design.ts        │
│  Entry:  penpotDesignWork(input, provider, mcpClient, traceCollector)│
│  Role:   penpot_design                                               │
│  Event:  ComponentSpecReady → PenpotDesignReady                      │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                     PHASE A: LLM Script Generation            │   │
│  │                                                               │   │
│  │  1. discoverPenpotAPI(mcpClient)                              │   │
│  │     └─ penpot:high_level_overview                             │   │
│  │     └─ penpot:penpot_api_info (Board, FlexLayout, Fill, etc.) │   │
│  │                                                               │   │
│  │  2. LLM Call                                                  │   │
│  │     Model:    claude-sonnet-4-6 (configurable via UI)         │   │
│  │     Tokens:   64000                                           │   │
│  │     Temp:     0.7                                             │   │
│  │     Prompt:   ux-penpot-design-system.md                      │   │
│  │       {{DESIGN_SYSTEM}}      ← design tokens + brand          │   │
│  │       {{PENPOT_API_DOCS}}    ← dynamic API discovery          │   │
│  │       {{COMPONENT_CATALOG}}  ← component anatomy              │   │
│  │       + pageContext?         ← from pages.yaml (nav, models)  │   │
│  │                                                               │   │
│  │  3. parsePenpotDesignScript() → { script, breakpoints }       │   │
│  │     Guard: rejects scripts with direct `layoutChild = ...`    │   │
│  │            (Penpot `layoutChild` is getter-only)              │   │
│  └─────────────────────────────────────┬─────────────────────────┘   │
│                                        │                             │
│  ┌─────────────────────────────────────▼─────────────────────────┐   │
│  │                     PHASE B: Script Execution                 │   │
│  │                                                               │   │
│  │  1. Wrap script in try/catch error handler                    │   │
│  │  2. Execute via penpot:execute_code (single MCP call)         │   │
│  │  3. Extract: rootId (root shape) + nodeIds (name→shapeID)     │   │
│  │  4. Error detection: syntax errors, runtime errors, MCP fail  │   │
│  └─────────────────────────────────────┬─────────────────────────┘   │
│                                        │                             │
│  ┌─────────────────────────────────────▼─────────────────────────┐   │
│  │               PHASE C: Visual Self-Correction                 │   │
│  │               (max 3 iterations, threshold: 80/100)           │   │
│  │                                                               │   │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │   │
│  │  │Screenshot│──▶│ Evaluate │──▶│ Generate │──▶│ Execute  │  │   │
│  │  │ export   │   │  Design  │   │   Fixes  │   │  Fixes   │  │   │
│  │  │  shape   │   │  (vision)│   │  (LLM)   │   │  (MCP)   │  │   │
│  │  └──────────┘   └──────────┘   └──────────┘   └──────────┘  │   │
│  │       ▲                                             │         │   │
│  │       └─────────────── loop ◀───────────────────────┘         │   │
│  │                                                               │   │
│  │  Exit conditions:                                             │   │
│  │    • score >= 80 (quality threshold)                          │   │
│  │    • score not improving over iterations                      │   │
│  │    • max 3 iterations reached                                 │   │
│  │    • max 5 fixes per iteration                                │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │                        OUTPUT                                 │    │
│  │                                                               │    │
│  │  penpotProjectId: string      ── Penpot project ID            │    │
│  │  penpotPageId: string         ── Penpot page ID               │    │
│  │  penpotNodeIds: Record<string, string>  ── name→shapeID       │    │
│  │  breakpoints: string[]        ── responsive breakpoints       │    │
│  │  script?: string              ── raw JS (for replay)          │    │
│  │  fixScripts?: string[]        ── Phase C correction scripts   │    │
│  │  screenshotPath?: string      ── final screenshot             │    │
│  │  componentSnapshots?: ComponentSnapshot[]                     │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Tools:   penpot:execute_code, penpot:high_level_overview,           │
│           penpot:penpot_api_info, penpot:export_shape                 │
│  HITL:    full_approval                                              │
│  Budget:  40k tokens, $1.50/task                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### MCP Tool Usage

| Tool | Phase | Purpose |
|------|-------|---------|
| `penpot:high_level_overview` | A | Discover API surface |
| `penpot:penpot_api_info` | A | Get type details (Board, FlexLayout, Fill, Stroke) |
| `penpot:execute_code` | B, C | Run design scripts + fix scripts |
| `penpot:export_shape` | C | ~~Broken~~ — use `execute_code` + `shape.export()` instead |

---

### Stage 4b: DesignSpec v2 Renderer (Alternative Path)

```
┌──────────────────────────────────────────────────────────────────────┐
│               DESIGNSPEC V2 RENDERER (Deterministic)                 │
│                                                                      │
│  Package: packages/designspec-renderer/                              │
│  Entry:   renderToScript(spec, tokens, catalog) → RenderResult       │
│  ADRs:    034 (flat adjacency list), 035 (catalog-first),           │
│           036 (text accelerator), 037 (standalone package)           │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Input: DesignSpecV2 JSON (flat adjacency list)                │  │
│  │   + RendererTokens (colors, typography, elevation, borders)   │  │
│  │   + CatalogMap (V2 built-in + project catalog entries)        │  │
│  └──────────────────────────────┬─────────────────────────────────┘  │
│                                 │                                    │
│  ┌──────────────────────────────▼─────────────────────────────────┐  │
│  │ 1. buildTokenMap()  — semantic → hex color map                │  │
│  │ 2. buildTree()      — flat adjacency list → parent-child tree │  │
│  │ 3. resolveNode()    — catalog defaults + extends + overrides  │  │
│  │ 4. Walk tree depth-first, dispatch to component renderers     │  │
│  │    - 7 accelerators: page, container, section, header,        │  │
│  │      divider, spacer, text                                    │  │
│  │    - 15 differentiators: input-text, input-currency,          │  │
│  │      button-primary/secondary/ghost, segmented-control,       │  │
│  │      stepper, display-readonly, badge, stat, card, avatar,    │  │
│  │      tooltip, checkbox, select                                │  │
│  │ 5. Emit preamble (try, token map, makeText helper)            │  │
│  │ 6. Emit postamble (return nodeIds, catch)                     │  │
│  └──────────────────────────────┬─────────────────────────────────┘  │
│                                 │                                    │
│  ┌──────────────────────────────▼─────────────────────────────────┐  │
│  │ Output: RenderResult                                          │  │
│  │   script:   string    — valid JS for penpot:execute_code      │  │
│  │   warnings: string[]  — non-fatal issues (unknown catalog)    │  │
│  │   nodeIds:  string[]  — all rendered node IDs                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Structural guarantees (bugs fixed permanently):                     │
│    • board.flex.dir (not bare flex.dir)                              │
│    • layoutChild always after appendChild                            │
│    • auto-height for text > 18 chars                                 │
│    • All colors via T.tokenName (zero raw hex)                       │
│    • Every shape tagged with setPluginData for extraction            │
│                                                                      │
│  Status: Phase 1+2+3 complete. renderToScript() replaces LLM-       │
│          generated JS scripts for deterministic Penpot output.       │
│  Integration: wired into ux-penpot-design.ts (V2 pipeline path)     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Stage 5: Visual Self-Correction (Design Evaluator)

**Feature gate:** `AGENTFORGE_ENABLE_VISION_LLM` (defaults to enabled; set `=false` to disable).

```
┌──────────────────────────────────────────────────────────────────────┐
│                      DESIGN EVALUATOR                                │
│                                                                      │
│  Source: packages/agents-ux/src/ux-design/design-evaluator.ts        │
│  Entry:  evaluateDesign(screenshot, designSpec, provider, history)    │
│                                                                      │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐    │
│  │       INPUT           │    │        VISION LLM CALL           │    │
│  │                       │    │                                  │    │
│  │  screenshotBase64     │    │  Model:    claude-opus-4-7       │    │
│  │  (PNG, base64)        │───▶│  Tokens:   4096 max output       │    │
│  │  compact spec context │    │  Schema:   EVALUATION_OUTPUT_SCHEMA│   │
│  │  correctionHistory?   │    │  Input:    image + compact tree  │    │
│  │  designTokens?        │    │  Retry:    2x on RATE_LIMITED    │    │
│  │  catalogMap?           │    │                                  │    │
│  └──────────────────────┘    └──────────────┬───────────────────┘    │
│                                              │                       │
│  ┌───────────────────────────────────────────▼──────────────────┐    │
│  │                        OUTPUT                                │    │
│  │                                                              │    │
│  │  score: 0-100                                                │    │
│  │  overallQuality: 'good' (80+) | 'needs_fixes' (50-79)       │    │
│  │                  | 'poor' (0-49)                              │    │
│  │  issues: DesignIssue[]                                       │    │
│  │    { severity, component, description, fix, issueId }        │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Input Context (compact, not raw JSON)

The evaluator sends a **compact tree representation** of the DesignSpec, not the raw JSON. The vision LLM sees the screenshot — it already knows layout, spacing, and colors. The text context conveys only intent: component names, text content, catalog entries, `navigateTo` targets, and background token references.

Built by `buildEvaluationContext()` in `evaluation-context.ts`. Reduces input from ~4,000-15,000 tokens (raw JSON) to ~300-600 tokens.

### Token Budget

| Component | Est. tokens | Notes |
|-----------|-------------|-------|
| System prompt | ~375 | Scoring dimensions + instructions |
| Screenshot (1440px PNG) | ~1,400 | Claude vision charge for base64 image |
| Compact spec context | ~300-600 | Component tree, text, navigateTo |
| Token compliance | ~200 | Color palette, typography scale, spacing |
| Catalog compliance | ~100-300 | Used catalog entries + their definitions |
| **Total** | **~2,400-2,700** | Was ~6,000-18,000 with raw JSON |

Vertex AI basic quota for claude-opus-4-7 can be as low as 4,000 TPM. The compact context keeps single-request cost under that threshold.

### Downstream Consumers

| Consumer | Connection | Status |
|----------|-----------|--------|
| Correction loop (`correction-loop.ts`) | Issues → patches → re-render → loop | Active |
| Dashboard Deep Audit (`audit-tab.tsx`) | Displays score + issues | Active |
| CLI exit status | Returns final score | Active |
| Implementation agent | Could inject issues into code gen prompt | Future (ADR-045 stub) |
| Cross-screen coherence (Roadmap Phase 4) | Multi-screen evaluation | Future |

### Error Handling

- **RATE_LIMITED (429):** Retries up to 2x with min(retryAfterMs, 30s) wait. Wall-time capped at 50s.
- **AUTH_FAILED:** No retry. Returns 503.
- **PROVIDER_DOWN:** No retry. Returns 502.

### Evaluation Dimensions & Scoring Deductions

| Dimension | Checks | Deduction |
|-----------|--------|-----------|
| Visual hierarchy | Heading sizes, spacing, structure | varies |
| Text presence | All expected text nodes exist | -15 (truncation) |
| Color application | Colors match spec, no blank areas | -5 per violation |
| Spacing & alignment | Padding, auto-layout, alignment | -5 to -10 |
| Completeness | All specified components present | varies |
| Content density | No excessive dead space | -10 to -15 |
| Typography | Scale compliance | -3 per node |
| Text overlap | Text nodes overlapping | -10 |
| navigateTo compliance | Planning vs spec binding count | -5 per missing |

---

## Stage 6: Interactive Feedback Loop

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DESIGN FEEDBACK LOOP                               │
│                                                                      │
│  Source: packages/agents-ux/src/ux-design/design-feedback-loop.ts    │
│  Entry:  runDesignFeedbackLoop(options)                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                    INTERACTIVE COMMANDS                       │     │
│  │                                                              │     │
│  │  approve / y  ──▶ Accept design, exit loop                   │     │
│  │  quit / q     ──▶ Reject design, exit loop                   │     │
│  │  review / r   ──▶ Screenshot + evaluate (score + issues)     │     │
│  │  implement    ──▶ Generate React + Tailwind code             │     │
│  │  help / h     ──▶ Show available commands                    │     │
│  │  <any text>   ──▶ Send as design feedback                    │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                    FEEDBACK FLOW                              │     │
│  │                                                              │     │
│  │  User feedback ──▶ session.applyFeedback(text)               │     │
│  │                        │                                     │     │
│  │                        ▼                                     │     │
│  │               ┌───────────────┐                              │     │
│  │               │ LLM generates │  (Penpot: JS code)           │     │
│  │               │ modifications │                              │     │
│  │               └───────┬───────┘                              │     │
│  │                       ▼                                      │     │
│  │               ┌───────────────┐                              │     │
│  │               │ Execute via   │                              │     │
│  │               │ MCP tools     │                              │     │
│  │               └───────┬───────┘                              │     │
│  │                       ▼                                      │     │
│  │               Auto-review (screenshot + evaluate)            │     │
│  │               Display score + issues to user                 │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  Modes:                                                              │
│    TTY input  → interactive loop (prompts user)                      │
│    Piped/CI   → auto-approve immediately                             │
│    EOF/SIGINT → treat as quit (unapproved)                           │
│                                                                      │
│  Output: { approved, finalDesign, changeCount, implementedFiles? }   │
└──────────────────────────────────────────────────────────────────────┘
```

### Penpot Collaboration Session

**Source**: `packages/agents-ux/src/ux-design/penpot-collaboration.ts`

The collaboration session maintains conversation history for coherent multi-turn
feedback. On each feedback:

1. LLM generates JavaScript code to modify the design
2. Code is wrapped with `findByName()` helper for shape lookup
3. Executed via `penpot:execute_code`
4. Node IDs updated if shapes were added/removed

### Design System Context (shared across agents)

```typescript
interface DesignSystemContext {
  designSystemPrompt: string;                    // Full design system rules
  colorPalette: Array<{ name: string; hex: string }>;
  shadeScales: Record<string, string[]>;         // Color families
  componentTree: ComponentTreeNode[];            // From planning
  tokenBindings: Record<string, string>;         // Property → token name
  typographyScale: Array<{ role: string; size: number; weight: number }>;
  spacingScale: number[];
}
```

Built by `buildDesignSystemContextFromSpec()` from design tokens + brand spec +
planning output.

---

## Stage 7: Implementation Agent

```
┌──────────────────────────────────────────────────────────────────────┐
│                   UX IMPLEMENTATION AGENT                             │
│                                                                      │
│  Source: packages/agents-ux/src/ux-implementation/ux-implementation.ts│
│  Entry:  uxImplementationWork(input, context)                        │
│  Role:   ux_implementation                                           │
│  Event:  PenpotDesignReady → ImplementationDraftReady                │
│                                                                      │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐    │
│  │       INPUT           │    │     LLM CALL (STREAMING)         │    │
│  │                       │    │                                  │    │
│  │  componentSpec        │    │  Model:    claude-sonnet-4-6     │    │
│  │  (UXPlanningOutput)   │    │  Tokens:   16000                 │    │
│  │  stage: 'layout' |   │───▶│  Temp:     0                     │    │
│  │    'theme' |          │    │  Prompt:   ux-implementation-    │    │
│  │    'animation' |      │    │            system.md             │    │
│  │    'implementation'   │    │  Mode:     streaming             │    │
│  │  designSnapshot?      │    │  + tokens, brand, library,      │    │
│  │  designNodeIds?       │    │    screenshots                   │    │
│  │  designFileId?        │    │                                  │    │
│  └──────────────────────┘    └──────────────┬───────────────────┘    │
│                                              │                       │
│  ┌───────────────────────────────────────────▼──────────────────┐    │
│  │                        OUTPUT                                │    │
│  │                                                              │    │
│  │  moduleId: string                                            │    │
│  │  stage: string                                               │    │
│  │  files: GeneratedFile[]                                      │    │
│  │    { filePath: string, content: string }                     │    │
│  │  totalCostUsd: number                                        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Context provided to LLM:                                            │
│    • Component spec (tree, token bindings, responsive rules)         │
│    • Design tokens (colors, typography, spacing)                     │
│    • Brand direction (tone, audience, WCAG level)                    │
│    • Component library import mappings (shadcn/mui/etc.)             │
│    • Design snapshots (screenshots + extracted styles)               │
│    • Learnings from previous runs                                    │
│                                                                      │
│  Permissions: read_spec, read_design, read_design_system,            │
│               write_code, create_branch                              │
│  Denied:      deploy_staging, deploy_production, merge_pr            │
│  HITL:        review_and_override                                    │
│  Budget:      60k tokens, $2.00/task                                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Generated Files

The implementation agent outputs React + Tailwind CSS files. File paths are
relative to the project root and include component files, page layouts, and
shared utilities.

---

## CLI Orchestration (`design:page`)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    design:page COMMAND                                │
│                                                                      │
│  Source: packages/cli/src/commands/design-page.ts                    │
│  Entry:  designPageCommand(pageId, output, options)                  │
│                                                                      │
│  Options:                                                            │
│    --stage research|planning|design                                  │
│    --tool  browser|penpot  (default: browser)                        │
│    --width <px>  (default: 1440)                                     │
│    --no-wait     (exit after design, skip feedback)                  │
│    --implement   (skip feedback, generate code directly)             │
│    --project-dir (resolve paths against this dir, not cwd)           │
│    --fresh       (force re-run all stages, ignore cache)             │
│                                                                      │
│  Execution Flow:                                                     │
│                                                                      │
│  1. Setup                                                            │
│     ├─ Load .env (ANTHROPIC_API_KEY)                                 │
│     ├─ Load pages.yaml → resolve pageId → build PageContext          │
│     │  (filters models/api to page data_sources, sibling nav)        │
│     ├─ Use page.id as moduleId                                       │
│     ├─ Load project manifest                                         │
│     ├─ Load PRD (docs/prd.md)                                        │
│     └─ Load design system (tokens, brand, catalog)                   │
│                                                                      │
│  2. Build PipelineInput + resolve provider                           │
│     └─ designTool from --tool flag (default: 'browser')              │
│     └─ Connection preflight only when --tool=penpot                  │
│                                                                      │
│  3. runDesignPipeline(pipelineInput)                                  │
│     ├─ Research (auto-reuse cache or run fresh)                      │
│     ├─ Planning (auto-reuse cache or run fresh)                      │
│     ├─ Design (dispatches on designTool)                             │
│     │  └─ browser: browserDesignWork() → designspec-v2.json          │
│     │  └─ penpot:  penpotDesignWork()  → penpot-design.json          │
│     └─ Evaluator (vision LLM, gated by AGENTFORGE_ENABLE_VISION_LLM)│
│                                                                      │
│  4. Post-Pipeline                                                    │
│     ├─ --implement: uxImplementationWork() → generated files         │
│     └─ interactive: FeedbackAdapter loop                             │
│        ├─ browser: BrowserFeedbackAdapter (single-shot LLM patch)    │
│        └─ penpot:  PenpotFeedbackAdapter (collaboration session)     │
└──────────────────────────────────────────────────────────────────────┘
```

### Per-Stage Caching & Resume

Each stage saves artifacts to `.agentforge/preview/{moduleId}/`. When using
`--stage`, prior stages are loaded from cache:

```
.agentforge/preview/{moduleId}/
├── research-brief.json            ← Stage 2 output
├── planning-spec.json             ← Stage 3 output
├── penpot-design.json             ← Stage 4 output
├── research-prompt.md             ← LLM prompt trace
├── planning-prompt.md             ← LLM prompt trace
├── design-prompt.md               ← LLM prompt trace
├── design-token-correction-prompt.md  ← if token retries
└── scripts/
    ├── design.js                  ← Phase A generated script
    └── fixes.js                   ← Phase C correction scripts
```

---

## Event Flow Summary

```
UXModuleRequested
  │  { moduleId, taskId, prdRequirements }
  │
  ▼
uxResearchWork()
  │
  ▼
DesignBriefCompleted
  │  { briefId, moduleId, requirementIds, designConstraints,
  │    referencePatterns, accessibilityRequirements, dataModelDependencies }
  │
  ▼
uxPlanningWork()
  │
  ▼
ComponentSpecReady
  │  { specRef, moduleId, componentTree, tokenBindings,
  │    responsiveRules, screens? }
  │
  ▼
penpotDesignWork()  ──── [Phase A → B → C self-correction loop]
  │
  ▼
PenpotDesignReady
  │  { penpotProjectId, penpotPageId, penpotNodeIds,
  │    breakpoints, script?, screenshotPath?, componentSnapshots? }
  │
  ▼
runDesignFeedbackLoop()  ──── [Human-in-the-loop review]
  │
  ▼
uxImplementationWork()
  │
  ▼
ImplementationDraftReady
    { moduleId, stage, files[], totalCostUsd }
```

---

## Complete File Artifacts Map

### Project Configuration (Stage 0: init)

| File | Path | Format | Purpose |
|------|------|--------|---------|
| Project manifest | `agentforge.yaml` | YAML | Name, repo, agents, stack, channels |
| Agent definitions | `agentforge/spec/agents.yaml` | YAML | 7 agent roles with providers, permissions, budgets |
| PRD template | `agentforge/spec/prd.yaml` | YAML | Empty PRD template |
| Env template | `.env.example` | text | API key placeholders |

### Design System (Stage 0: init)

| File | Path | Format | Purpose |
|------|------|--------|---------|
| Design tokens | `agentforge/spec/design-tokens.yaml` | YAML | Colors, typography, spacing, borders, elevation, layout |
| Brand spec | `agentforge/spec/brand.yaml` | YAML | Tone, illustration, motion, accessibility |
| Component library | `agentforge/spec/component-library.yaml` | YAML | Selected library + React import mappings |
| Component catalog | `agentforge/spec/component-catalog.yaml` | YAML | Component anatomy, states, token bindings |
| Tailwind config | `tailwind.config.ts` | TypeScript | Theme extension (HSL vars, shadows, screens) |
| Global CSS | `src/styles/global.css` | CSS | Google Fonts, CSS custom properties, Tailwind directives |

### App Specification (Stage 1: design:generate)

| File | Path | Format | Purpose |
|------|------|--------|---------|
| Pages spec | `agentforge/spec/pages.yaml` | YAML | Pages with routes, components, data sources |
| Models spec | `agentforge/spec/models.yaml` | YAML | Data models with fields and db tables |
| API spec | `agentforge/spec/api.yaml` | YAML | REST endpoints with params and responses |

### Pipeline Artifacts (Stages 2-7: design:page)

| File | Path | Format | Purpose |
|------|------|--------|---------|
| Research brief | `.agentforge/preview/{module}/research-brief.json` | JSON | Research agent output |
| Planning spec | `.agentforge/preview/{module}/planning-spec.json` | JSON | Planning agent output |
| Penpot design | `.agentforge/preview/{module}/penpot-design.json` | JSON | Design agent output |
| Design script | `.agentforge/preview/{module}/scripts/design.js` | JS | Generated Penpot script |
| Fix scripts | `.agentforge/preview/{module}/scripts/fixes.js` | JS | Phase C corrections |
| Prompt traces | `.agentforge/preview/{module}/*-prompt.md` | Markdown | LLM prompt records |
| Generated code | `src/components/**/*.tsx` | TSX | React + Tailwind implementation |

### Temporary Files

| File | Path | Purpose |
|------|------|---------|
| Design preview | `/tmp/agentforge-design-preview-{ts}.html` | Design options browser preview |
| App spec preview | `/tmp/agentforge-appspec-preview-{ts}.html` | App spec browser preview |

---

## LLM Usage Summary

| Stage | Agent | Model | Max Tokens | Temp | Mode |
|-------|-------|-------|-----------|------|------|
| 0 | Design Options | claude-sonnet-4-6 | 8192 | 0.8 | complete |
| 1 | App Spec | claude-sonnet-4-6 | 16384 | 0.7 | complete |
| 2 | Research | claude-sonnet-4-6 | 8000 | 0 | complete |
| 3 | Planning | claude-sonnet-4-6 | 8000 | 0 | structured |
| 3 | Token Correction | claude-sonnet-4-6 | 2000 | 0 | complete |
| 4A | Design Script | claude-sonnet-4-6 | 32000 | 0 | complete |
| 4B | DesignSpec v2 Gen | claude-sonnet-4-6 (configurable) | 64000 | 0.7 | tool_use (submit_design) |
| 4C | Fix Generation | claude-sonnet-4-6 | 8000 | 0 | structured |
| 5 | Evaluation | claude-opus-4-7 | 4096 | — | structured + vision (compact context) |
| 7 | Implementation | claude-sonnet-4-6 | 16000 | 0 | streaming |

---

## Budget & Governance Summary

| Agent | HITL Policy | Budget (tokens) | Budget (USD) | Retry |
|-------|-------------|-----------------|-------------|-------|
| ux_research | notify_only | 40k | $1.50 | 2 retries → notify + pause |
| ux_planning | review_and_override | 30k | $1.00 | 2 retries → notify + pause |
| penpot_design | full_approval | 40k | $1.50 | 2 retries → notify + pause |
| ux_implementation | review_and_override | 60k | $2.00 | 2 retries → notify + pause |

---

## What Happens Next: Prototype Rendering

This document covers design generation (Stages 0-7). For how the generated
DesignSpec JSON files are rendered as an interactive prototype in the browser,
see **[prototype-rendering-dataflow.md](prototype-rendering-dataflow.md)**.

Key topics covered there: spec source precedence (`agentforge/designs/` vs
`.agentforge/previews/`), chrome stripping (ADR-040), iframe bridge protocol,
and DesignSpec-to-CSS mapping.
