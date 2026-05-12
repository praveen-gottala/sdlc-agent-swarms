# CHIP DesignSpec v2.0 vs OpenUI — Standalone Research Document

## Purpose

This document compares two approaches to LLM-generated UI rendering: **CHIP's DesignSpec v2.0** (flat JSON adjacency list + catalog-first + deterministic renderer) and **Thesys's OpenUI** (custom text DSL + Zod-defined component library + streaming renderer). Every claim is backed by source code, documentation, or benchmarks.

---

## 1. Format & LLM Output Strategy

### CHIP: JSON via Anthropic Structured Output

The LLM produces a flat JSON adjacency list via a forced tool call (`submit_design`). Anthropic's `response_format` with JSON Schema guarantees valid output.

**Schema** (`packages/designspec-renderer/src/types/design-spec-v2.ts`):
```typescript
interface DesignSpecV2 {
  readonly screen: string;                          // "add-expense"
  readonly width: number;                           // 1440
  readonly nodes: Readonly<Record<string, NodeSpec>>; // flat map
  readonly screenType?: 'page' | 'modal' | 'drawer' | 'sheet';
  readonly regions?: Readonly<Record<string, readonly string[]>>;
}

interface NodeSpec {
  readonly parent: string | null;   // parent ID or null for root
  readonly order: number;           // 0-based sibling position
  readonly type?: AcceleratorType;  // OR catalog, never both
  readonly catalog?: string;        // catalog entry reference
  readonly label?: string;
  readonly content?: string;
  readonly value?: string | number;
  readonly placeholder?: string;
  readonly options?: readonly SegmentedOption[];
  readonly layout?: LayoutSpec;
  readonly width?: number | 'fill';
  readonly height?: number;
  readonly typography?: string;     // token ref: "heading-1"
  readonly color?: string;         // token ref: "text-primary"
  readonly weight?: number;
  readonly background?: string;    // token ref: "surface-primary"
  readonly shadow?: string;        // "sm", "md", "lg"
  readonly radius?: number;
  readonly overrides?: Readonly<Record<string, unknown>>;
  readonly navigateTo?: string;    // target screen ID
  readonly items?: readonly Readonly<Record<string, unknown>>[];
}
```

**Real output example** (from `fixtures/personal-expense-tracker/agentforge/designs/add-expense/penpot-design.json`):
```json
{
  "screen": "add-expense",
  "width": 1440,
  "nodes": {
    "root": {
      "parent": null, "order": 0, "type": "page",
      "width": 1440,
      "layout": { "dir": "column", "align": "stretch", "gap": 0 },
      "background": "background-primary"
    },
    "top-bar": {
      "parent": "root", "order": 0, "type": "container",
      "width": "fill", "height": 64,
      "background": "surface-primary", "shadow": "sm",
      "layout": { "dir": "row", "align": "center", "justify": "space-between", "px": 24 }
    },
    "top-bar-back-btn": {
      "parent": "top-bar", "order": 0,
      "catalog": "button-ghost",
      "label": "",
      "overrides": { "icon": "arrow-left", "aria-label": "Go back to Dashboard" },
      "navigateTo": "dashboard"
    },
    "top-bar-title": {
      "parent": "top-bar", "order": 1,
      "type": "text",
      "content": "Add Expense",
      "typography": "heading-2", "color": "text-primary", "weight": 700
    }
  }
}
```

**Generation pipeline** (`packages/agents-ux/src/design-pipeline/`):
1. Research → `UXResearchOutput` (Sonnet, 8K tokens)
2. Planning → `UXPlanningOutput` with token validation loop (Sonnet, 8K tokens)
3. Design → `DesignSpecV2` via forced `submit_design` tool call (Sonnet, 32K tokens)
4. Evaluator → 5-dimension quality assessment via vision LLM

Post-LLM deterministic processing:
- `promoteToCatalog()` — container + heading → Section, container with inputs → Form
- Chrome Pass injection — merges frozen shared chrome (header/sidebar/footer)
- `navigateTo` propagation from planning output

**Key constraint:** Anthropic strict mode limits (documented in GitHub anthropic-sdk-python issue #1185):
- 24 optional parameters max per schema object
- 16 union-type parameters max
- Recursive schemas return 400 error
- ~50 properties + 5 nesting levels = grammar compilation timeout

DesignSpec v2 uses 19 of 24 optional slots, 3 unions, 2 nesting levels (36 grammar states vs 262,144 for 6 levels). See `docs/plans/completed/designspec-v2-requirements.md` §2.

---

### OpenUI: Custom Text DSL via System Prompt

The LLM produces free text conforming to "OpenUI Lang" — a line-oriented, assignment-based DSL. **No structured output mode** (`response_format` / JSON Schema). Validated by a streaming parser at render time.

**DSL format:**
```
identifier = ComponentName(arg1, arg2, ..., keywordArg=value)
```

Arguments are positional, mapped to Zod schema keys by order. First statement must be `root = ...`. Forward references allowed (hoisting).

**Real output example** (from `benchmarks/samples/dashboard.oui` in the OpenUI repo):
```
root = Stack([headerCard, kpiRow, chartsRow1, featuresCard, revenueCard], "column", "l")
headerCard = Card([header], "card")
header = CardHeader("Product Analytics Dashboard", "Usage, acquisition, feature adoption, and revenue trends")
kpiRow = Stack([kpi1, kpi2, kpi3, kpi4], "row", "m", "stretch", "start", true)
kpi1 = Card([kpi1Title, kpi1Value, kpi1Note], "sunk")
kpi1Title = TextContent("Monthly Active Users (MAU)", "small-heavy")
kpi1Value = TextContent("128,400", "large-heavy")
kpi1Note = TextContent("+6.2% vs last month", "small")
mauChart = BarChart(mauLabels, [mauSeries], "grouped", "Month", "Users")
mauLabels = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]
mauSeries = Series("MAU", [84500, 87200, 90100, 93800, ...])
featuresTable = Table(featureCols, featureRows)
featureCols = [Col("Feature", "string"), Col("Weekly Active Users", "number"), ...]
```

**Generation pipeline:**
1. `defineComponent()` — register components with Zod schemas + React renderers
2. `createLibrary()` — group components into a library
3. `library.prompt()` — auto-generate system prompt with syntax rules + component signatures
4. LLM generates OpenUI Lang text as a stream
5. Parser processes line-by-line → AST (18 node kinds: Comp, Str, Num, Bool, Arr, Obj, Ref, Ph, etc.)
6. Evaluator resolves references → component tree
7. Renderer maps components to React elements progressively

**Key constraint avoided:** No JSON schema constraints at all. The DSL sidesteps recursive schemas, optional field limits, union type limits, and grammar complexity. The tradeoff: parser must handle malformed output gracefully.

**Source:** [OpenUI GitHub](https://github.com/thesysdev/openui), [OpenUI Lang Overview](https://www.openui.com/docs/openui-lang/overview), [OpenUI SKILL.md](https://github.com/thesysdev/openui/blob/main/skills/openui/SKILL.md)

---

### Comparison: Format

| Dimension | CHIP DesignSpec v2.0 | OpenUI |
|-----------|---------------------|--------|
| Format | JSON flat adjacency list | Custom text DSL (OpenUI Lang) |
| LLM output mode | Structured output (`response_format` + JSON Schema) | Free text via system prompt instruction |
| Validation | Schema-guaranteed at generation time | Parser validates at render time |
| Streaming | No (batch — need closing `}` to parse) | Yes (line-by-line progressive parsing) |
| Malformed output rate | ~0% (strict mode guarantees) | Non-zero (parser drops invalid components) |
| Token overhead | JSON delimiters + key repetition | Minimal (no braces, no key repetition) |

**Where they align:** Both rejected direct code generation. Thesys published "Why Generating Code for Generative UI is a bad idea" (Aug 2025) citing a June 2025 study showing most models struggle to compile valid React. CHIP documented the same finding independently: LLMs are bad at Penpot API mechanics but good at design intent (DesignSpec v2 requirements §2, Problem 1).

**Where they differ:** CHIP chose JSON because guaranteed validity matters in a batch pipeline where each failed generation costs $0.06-$0.53 and minutes of pipeline time. OpenUI chose a DSL because their product is real-time chat UI where streaming is the primary UX requirement — users see UI build progressively.

---

## 2. Flatness Strategy

### CHIP: Parent ID References
```json
"billTotal": { "parent": "billSection", "order": 0, "catalog": "input-currency" }
```
Tree reconstructed at render time by `buildTree()` in `packages/designspec-renderer/src/renderer/tree-builder.ts`:
```typescript
export function buildTree(nodes: Readonly<Record<string, NodeSpec>>): TreeNode {
  // 1. Find root (parent === null)
  // 2. Group children by parent
  // 3. Sort siblings by order
  // 4. Recursively build TreeNode tree
}
```

### OpenUI: Inline Array References
```
root = Stack([header, content], "column")
content = Grid([s1, s2])
```
Tree reconstructed by evaluator resolving forward references. Parser supports hoisting — `root` can reference `content` before it's defined.

### Analysis
Both are flat. Same architectural insight, different motivations:
- CHIP: flatness avoids recursive JSON `$ref` that breaks Anthropic strict mode (grammar states explosion: 2 levels = 36 states vs 6 levels = 262,144)
- OpenUI: flatness enables line-by-line streaming (each line independently parseable)

---

## 3. Component Model

### CHIP: Three-Layer Catalog

**Layer 1 — Accelerators** (7 types, defined inline via `type` field):
`page`, `container`, `section`, `header`, `divider`, `spacer`, `text`
Layout-only structural primitives with no visual identity.

**Layer 2 — Differentiators** (25+ entries, referenced via `catalog` field):
Inputs (`input-text`, `input-currency`, `search-input`, `select`), buttons (`button-primary`, `button-secondary`, `button-ghost`, `button-destructive`), controls (`checkbox`, `switch`, `segmented-control`, `chip`), data (`data-table`, `stepper`, `avatar`, `badge`), display (`card`, `stat`, `alert`, `skeleton`, `loading-spinner`), navigation (`link`, `tooltip`), assets (`icon`, `image`, `illustration`).

Pre-encoded visual quality in YAML catalog files. LLM specifies only differences via `overrides`.

**Layer 3 — Compositions:** How components arrange. Not cataloged — LLM decides freely.

**Catalog resolution** (`packages/designspec-renderer/src/catalog/resolver.ts`):
```typescript
export function resolveNode(nodeId: string, node: NodeSpec, catalog: CatalogMap): ResolvedNode {
  // Accelerator (type field) → pass through, no catalog lookup
  // Differentiator (catalog field) → merge chain:
  //   catalog defaults ← extends chain (max 5 deep) ← node overrides
  // Fuzzy matching: "data-table-compact-striped" → "data-table-compact" → "data-table"
}
```

**Catalog entry type** (`packages/designspec-renderer/src/types/catalog.ts`):
```typescript
interface CatalogEntry {
  readonly type: string;            // "button", "input", etc.
  readonly variant?: string;        // "primary", "secondary"
  readonly extends?: string;        // inherit from another entry
  readonly height?: number;
  readonly radius?: number;
  readonly background?: string;     // token ref
  readonly text_color?: string;     // token ref
  readonly text_typography?: string;
  readonly text_weight?: number;
  readonly border_color?: string;
  readonly border_width?: number;
  readonly shadow?: string;
  readonly padding?: number;
  readonly padding_x?: number;
  readonly padding_y?: number;
  readonly min_height?: number;
  readonly width?: number | 'fill';
  readonly library?: Readonly<Record<string, unknown>>; // shadcn imports/props
  readonly required_fields?: readonly string[];
  readonly recommended_fields?: readonly string[];
}
```

**Design rationale:** From Yesenia Perez-Cruz's Shopify Polaris work — distinguish structural infrastructure (accelerators) from identity-defining components (differentiators). Cited in ADR-035.

### OpenUI: Zod-Defined Component Library

~50+ built-in components in `@openuidev/react-ui`:
- **Layout:** Stack, Grid, Card, CardHeader, Accordion, Tabs, Modal, SectionBlock, Separator
- **Charts (13 types):** BarChart, LineChart, AreaChart, PieChart, RadarChart, RadialChart, ScatterChart, HorizontalBarChart, plus condensed/mini variants
- **Forms:** Input, TextArea, Select, DatePicker, CheckBoxGroup, RadioGroup, SwitchGroup, Slider, FormControl, Button, IconButton
- **Content:** TextContent, TextCallout, CodeBlock, Image, ImageGallery, MarkDownRenderer, ListBlock, Carousel, Steps, Calendar
- **Chat shells:** CopilotShell, Shell, BottomTray, OpenUIChat

Definition pattern:
```typescript
defineComponent({
  name: 'Card',
  props: z.object({
    children: z.array(z.any()),
    title: z.string().optional(),
    variant: z.enum(['card', 'sunk', 'outline']).optional(),
  }),
  description: 'A card container with optional title and variant',
  component: CardComponent,  // React component
})
```

`library.prompt()` auto-generates system prompt with component signatures derived from Zod introspection:
```
Card(children: Component[], title?: string, variant?: "card" | "sunk" | "outline")
```

**Source:** [OpenUI GitHub packages/react-ui/](https://github.com/thesysdev/openui/tree/main/packages/react-ui)

### Comparison: Component Model

| Dimension | CHIP | OpenUI |
|-----------|------|--------|
| Component count | ~7 accelerators + ~25 differentiators | ~50+ built-in |
| Definition format | YAML catalog files | `defineComponent()` with Zod schemas |
| Schema validation | Catalog resolver with fuzzy matching | Zod props validation at parse time |
| Structural vs visual | Explicit (accelerator vs differentiator) | Implicit (all components equal) |
| Prompt generation | Template + dynamic injection (`{{COMPONENT_CATALOG}}`, `{{RENDERABLE_CATALOG_IDS}}`, token tables auto-populated at runtime) | Fully auto-generated from Zod schemas via `library.prompt()` |
| Visual defaults | Data (YAML catalog) | Code (React component styling) |
| Inheritance | `extends` field in catalog | Component variants via Zod enums |

**Key difference:** CHIP's prompt is a static template with dynamic injection — component catalog, renderable IDs, and design tokens are populated at runtime from structured YAML/JSON sources, so they can't desync. However, the *format rules* (DesignSpec v2 field names, allowed values, structural constraints) remain static in the template and could drift from `design-spec-v2.ts` types. OpenUI's `library.prompt()` auto-generates everything from Zod schemas, eliminating all desync risk. CHIP could adopt auto-generation for the format rules portion specifically.

---

## 4. Design Tokens & Visual Diversity

### CHIP: Full Token System

Two-layer color resolution: primitive → semantic → hex.

**Token types** (`packages/designspec-renderer/src/types/tokens.ts`, derived from `@agentforge/core`):
```typescript
type RendererTokens = {
  colors?: {
    primitive?: PrimitiveColors;  // { 'warm-cream': '#FFF8E7', ... }
    semantic?: SemanticColors;    // { 'surface-primary': 'warm-cream', ... }
  };
  typography?: TypographySpec;    // { 'heading-1': { fontFamily, fontSize, ... } }
  elevation?: ElevationSpec;      // { 'sm': {...}, 'md': {...}, 'lg': {...} }
  spacing?: SpacingSpec;
  borders?: BorderSpec;
  touch_targets?: TouchTargetSpec;
  z_index?: ZIndexSpec;
  opacity?: OpacitySpec;
  motion?: MotionSpec;
  state?: StateTokensSpec;
  border_width?: BorderWidthSpec;
  text_extras?: TextExtrasSpec;
};
```

**Token resolution** (`packages/designspec-renderer/src/renderer/token-resolver.ts`):
Builds a flat `TokenColorMap` from the two-layer system. Nodes reference semantic names (`surface-primary`), never raw hex. Renderer resolves at render time.

**Diversity mechanism:** Same catalog + different tokens = different visual identity per project. Research backing: DesignSpec v2 requirements §2, Problem 3; design-decisions.md §9, citing AAAI 2025 and ScienceDirect research on LLM design monotony.

### OpenUI: Component Variants Only

No design token layer. Visual variety comes from component variant props:
```
Card([...], "card")   // default variant
Card([...], "sunk")   // inset variant
Card([...], "outline") // outlined variant
TextContent("Title", "large-heavy")  // size variant
TextContent("Note", "small")         // smaller variant
```

Components ship with SCSS styling and CSS custom properties for basic theming via `ThemeProvider`.

### Comparison: Visual Diversity

| Dimension | CHIP | OpenUI |
|-----------|------|--------|
| Color system | Two-layer (primitive → semantic → hex) | CSS custom properties |
| Typography system | Token scale (heading-1, body, label, ...) | Component size variants (large-heavy, small, ...) |
| Elevation system | Named levels (sm, md, lg) | Per-component styling |
| LLM selects per project? | Yes (different tokens = different identity) | No (same library = same look) |
| Diversity mechanism | Tokens + catalog + composition | Variants only |

**Key difference:** CHIP addresses the "mathematical average of the internet" problem — all LLM-generated UIs converging on the same visual style. The token system is the primary countermeasure. OpenUI has no equivalent — apps using the same component library will look the same. This matters for CHIP's use case (generating diverse apps) but not for OpenUI's (consistent chat-embedded UI).

---

## 5. Rendering Architecture

### CHIP: Three Targets from One Spec

**Browser renderer** (`packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`):
- Uses real shadcn/ui components (Button, Badge, Avatar, Card, Input, Textarea, Skeleton, Progress, Checkbox, Pagination)
- Full icon bundle from lucide-react
- Runs as standalone Vite app on port 4100 in an iframe
- Processes: `buildTree()` → `resolveNode()` against catalog → `buildTokenMap()` → recursive `renderNode()` dispatching to accelerator or catalog renderers
- Node tagging: every rendered element gets `data-node={nodeId}` and `data-catalog={type}` for iframe bridge communication

**Penpot renderer** (`packages/designspec-renderer/src/renderer/penpot/index.ts`):
- Generates JavaScript Penpot API code
- Chunked output (40KB limit per script)
- Subtree recovery for large specs

**React codegen** (`packages/designspec-renderer/src/renderer/react/index.ts`):
- Emits TSX component code with shadcn/ui imports

### OpenUI: Multi-Framework Runtime Rendering

**React renderer** (`@openuidev/react-lang`):
- `<Renderer />` component takes raw text, parses, evaluates AST, renders React components
- Streaming: re-parses accumulated text on every chunk
- Forward references render as skeletons until definitions arrive
- `ElementErrorBoundary` wraps each component — shows last good state on error

**Additional frameworks:**
- `@openuidev/vue-lang` — Vue adapter
- `@openuidev/svelte-lang` — Svelte adapter
- React Native — example in repo

Core parser/evaluator shared across frameworks in `@openuidev/lang-core`.

### Comparison: Rendering

| Dimension | CHIP | OpenUI |
|-----------|------|--------|
| Runtime renderers | 3 targets: React (JSX components), Penpot (JS API scripts), Browser DOM (Playwright screenshots + interactive preview) | React, Vue, Svelte, React Native |
| Design tool output | Yes (Penpot JavaScript) | No |
| Code generation | Yes (TSX files) | No |
| Streaming | No (batch) | Yes (line-by-line progressive) |
| Rendering host | Standalone Vite app in iframe | Embedded in host application |
| Error resilience | Fallback for unresolved catalog | Drop invalid, show last good state |

---

## 6. Multi-Screen & Navigation

### CHIP: Full App Prototyping

- Multiple screens per project with `screens[]` definitions
- `navigateTo` field on nodes for inter-screen links
- Hash-based navigation (`#/screen-id`) in `PrototypeApp.tsx`
- Overlay rendering for modals/drawers/sheets via `<dialog>`
- Shared chrome (persistent header/sidebar/footer) via `LayoutShell.tsx`
- Chrome Pass: first page generates shared chrome → subsequent pages consume it frozen
- Chrome stripping from individual page specs to avoid duplication (`spec-split.ts`)
- Iframe bridge protocol between dashboard (port 3000) and renderer (port 4100)

**Prototype navigation data flow:**
1. `NavigationBinding` objects map source nodes to target screens
2. Inline `navigateTo` on NodeSpec takes precedence over external bindings
3. Click handler resolves mode (`navigate` vs `overlay`) from binding metadata
4. Hash update triggers screen switch or overlay open

### OpenUI: Single UI Per Response

- Each LLM response generates one component tree
- No concept of multiple screens, routes, or navigation
- `@OpenUrl("https://...")` for external links
- `@ToAssistant("message")` for conversational continuation
- Designed for chat-embedded artifacts: one dashboard, one form, one chart per message

### Analysis
Fundamentally different scope. CHIP generates multi-screen applications with navigation, overlays, persistent chrome, and a prototype preview. OpenUI generates individual UI artifacts embedded in chat responses. This reflects the core use case difference.

---

## 7. Evaluation & Quality Correction

### CHIP: Multi-Layer Quality Pipeline

1. **Schema validation** — Zod + `validateDesignSpec()`: single root, valid parents, contiguous orders, valid catalog refs, `type` XOR `catalog`
2. **Structural heuristics** — container diversity (-10 points), catalog adoption (-10), touch targets (44px min)
3. **Vision deep audit** — screenshot → vision LLM assessment against 5-dimension anchored rubric:
   - Layout (alignment, grid usage)
   - Hierarchy (visual weight, information flow)
   - Completeness (missing components vs spec)
   - Spacing (consistency, breathing room)
   - Treatment (container diversity: elevated, inset, outlined, separated, flat, bare)
4. **Progressive evaluator** — generate → evaluate → patch → re-render → re-evaluate. Correction LLM returns `{ patches: { nodeId: partialNodeSpec } }` shallow-merged into existing spec (`browser-correction-adapter.ts:executeFixes()`). Deterministic gates decide "done" (design-decisions.md §5.3: LLM never self-declares success)
5. **Chat-driven iteration** — human feedback via `POST /api/pages/[pageId]/design/chat` (ADR-042)

**Key finding:** Design LLM ignores diversity/quality rules in prompts (Phase 2.6 testing, 2026-04-27). Evaluator-as-enforcer pattern: separate LLM enforces compliance because the design LLM won't self-police. (design-decisions.md §9.4)

### OpenUI: Structural Validation + Error Reporting

1. **Parser validation** — unknown components, missing required props, null required props, excess arguments
2. **`OpenUIError` type** — structured errors with `hint` field designed for LLM re-prompting:
   ```typescript
   interface OpenUIError {
     source: "parser" | "runtime" | "query" | "mutation";
     code: OpenUIErrorCode;  // "unknown-component", "missing-required", etc.
     message: string;
     statementId?: string;
     component?: string;
     hint?: string;  // actionable fix for LLM
   }
   ```
3. **Edit mode** — LLM patches individual statements by name (incremental, not full regeneration)
4. **No vision/screenshot evaluation**
5. **No quality rubric or scoring**

### Comparison: Evaluation

| Dimension | CHIP | OpenUI |
|-----------|------|--------|
| Schema validation | Yes (Zod + custom validators) | Yes (Zod at parse time) |
| Structural heuristics | Yes (diversity, adoption, touch targets) | No |
| Visual quality assessment | Yes (vision LLM + 5D rubric) | No |
| Correction strategy | Incremental node-level patching (`executeFixes()` → `{ patches: { nodeId: partialNodeSpec } }`, shallow-merged) | Incremental statement patching |
| Quality enforcement | Evaluator-as-enforcer (separate LLM) | None |
| Error reporting for correction | Structured `DesignIssue` objects (`severity`, `component`, `description`, `fix`, `issueId`) — flattened to prose for correction LLM | Structured `OpenUIError` objects (`source`, `code`, `message`, `hint`) — kept structured end-to-end |

**Key difference:** CHIP evaluates *visual quality* (does it look good?). OpenUI evaluates *structural correctness* (does it parse?). This gap makes sense for their respective contexts — design quality matters for full applications; structural correctness suffices for chat artifacts.

**Where they converge:** Both systems independently arrived at incremental patching for corrections — OpenUI patches individual DSL statements by name; CHIP patches individual nodes by ID via `executeFixes()`. The remaining difference: OpenUI keeps error objects structured end-to-end; CHIP flattens `DesignIssue` objects to prose before passing to the correction LLM.

---

## 8. Token Efficiency

### OpenUI Benchmarks (from `benchmarks/samples/metrics.json`)

| Scenario | Tokens | TTFT (ms) | Total (ms) | Throughput (tps) |
|----------|--------|-----------|------------|------------------|
| Simple Table | 151 | 1,032 | 3,297 | 66.67 |
| Chart + Data | 234 | 984 | 3,556 | 90.98 |
| Contact Form | 297 | 1,851 | 4,693 | 104.50 |
| Settings Panel | 543 | 1,703 | 7,619 | 91.78 |
| E-commerce Product | 1,169 | 1,827 | 16,908 | 77.51 |
| Pricing Page | 1,198 | 992 | 15,720 | 81.34 |
| Dashboard | 1,229 | 769 | 16,496 | 78.15 |

OpenUI claims 52-67% fewer tokens than equivalent JSON. Specifically:
- -56.5% vs Vercel json-render (simple table)
- -67.1% vs Vercel json-render (contact form)
- -52.8% average across scenarios

**Source:** [OpenUI Benchmarks](https://www.openui.com/docs/openui-lang/benchmarks), raw data in `benchmarks/samples/metrics.json`

### CHIP Metrics (from `docs/plans/completed/designspec-v2-requirements.md` §1)

| Metric | v1 (Penpot JS) | v2 (JSON) | Change |
|--------|----------------|-----------|--------|
| LLM output per screen | ~18K tokens (660 lines) | ~1.5K–9.4K tokens (min: confirm dialog, max: dashboard) | -89% avg |
| Prompt size | ~45K tokens | ~5K tokens | -89% |
| Retry rate | ~30% | ~0% | Eliminated |
| Per-screen cost (Sonnet) | ~$0.53 | ~$0.06 | -89% |

### Analysis
CHIP v2 output ranges from ~1.5K tokens (simple confirm dialog) to ~9.4K tokens (complex dashboard with many nodes). OpenUI's dashboard benchmark is ~1.2K tokens. For comparable complexity (dashboard), OpenUI uses ~87% fewer tokens — a wider gap than previously stated. JSON key repetition (`"parent":`, `"order":`, `"catalog":`, `"type":`, `"layout":`) and rich per-node properties account for the overhead.

However, CHIP's tokens carry richer per-screen information — design tokens, catalog overrides with rich property sets, navigation targets, screen types, chrome regions — that OpenUI doesn't support. The comparison is not apples-to-apples: CHIP's 9.4K-token dashboard spec encodes visual identity, semantic tokens, and navigation context that OpenUI's 1.2K-token spec delegates to pre-built component styling.

---

## 9. Layout System

### CHIP: CSS Property-Based

Layout is a `LayoutSpec` on each node:
```typescript
interface LayoutSpec {
  readonly dir: 'row' | 'column';
  readonly display?: 'flex' | 'grid';
  readonly columns?: number;
  readonly wrap?: boolean;
  readonly gap?: number;
  readonly align?: 'start' | 'center' | 'end' | 'stretch';
  readonly justify?: 'start' | 'center' | 'end' | 'space-between';
  readonly px?: number; readonly py?: number;
  readonly pt?: number; readonly pb?: number;
  readonly mx?: number; readonly my?: number;
  readonly mt?: number; readonly mb?: number;
  readonly ml?: number; readonly mr?: number;
}
```

Renderer converts to CSS properties (`DesignSpecRenderer.tsx:137-169`):
```typescript
function getLayoutStyles(layout: LayoutSpec | undefined): React.CSSProperties {
  if (layout.display === 'grid' && layout.columns) {
    return { display: 'grid', gridTemplateColumns: `repeat(${layout.columns}, 1fr)`, ... };
  }
  return { display: 'flex', flexDirection: layout.dir === 'row' ? 'row' : 'column', ... };
}
```

### OpenUI: Component-Based

Layout via `Stack` and `Grid` components with positional props:
```
Stack([children], direction?, gap?, align?, justify?, wrap?)
Grid([children], columns?, gap?)
```

No arbitrary CSS. LLM picks from component props, not CSS properties.

### Comparison
CHIP gives more layout control (arbitrary padding, margins, grid columns). OpenUI gives simpler LLM interface (fewer layout choices = fewer errors). Tradeoff: expressiveness vs reliability.

---

## 10. Production Maturity

| Dimension | CHIP | OpenUI |
|-----------|------|--------|
| Production history | Development stage | 2+ years commercial (C1 API, 10K+ devs) |
| Open source date | Project-internal | MIT, March 2026 |
| GitHub stars | N/A | 2.2K |
| Enterprise adoption | None yet | Japanese materials science multinational |
| npm packages | Not published | `@openuidev/*` v0.2.4 |
| Community | Solo developer | Discord, Product Hunt (#4), HN frontpage |
| Agent integrations | CHIP-internal pipeline | Vercel AI SDK, LangChain, CrewAI, OpenAI Agents SDK, Anthropic Agents SDK, Google ADK, MCP |

**Source:** [OpenUI GitHub](https://github.com/thesysdev/openui), [Thesys Enterprise Case Study](https://www.thesys.dev/blogs/casestudy-1)

---

## 11. Shared Insights (Independently Arrived At)

Both systems independently converged on these architectural principles:

1. **Separate WHAT from HOW** — Don't let the LLM handle rendering mechanics. CHIP: LLM produces JSON intent, renderer handles Penpot/React mechanics. OpenUI: LLM produces DSL intent, renderer maps to React components. Both cite code generation failures as the motivation.

2. **Flat over nested** — Avoid deep nesting in LLM output. CHIP: flat adjacency list (schema constraint). OpenUI: flat assignment list (streaming constraint). Different motivations, same architecture.

3. **Constrained component set** — LLM can only generate registered components. CHIP: catalog entries. OpenUI: library components. Both validate against the registered set.

4. **Structural validation + correction mechanism** — Both provide structured error information designed for LLM self-correction.

5. **Code generation is wrong** — Both explicitly reject generating raw code. Both cite reliability problems from production experience.

6. **Incremental patching for corrections** — Both independently arrived at patching individual elements rather than regenerating full specs. CHIP: `executeFixes()` returns `{ patches: { nodeId: partialNodeSpec } }` shallow-merged into existing spec. OpenUI: edit mode patches individual DSL statements by name. Different formats, same insight — regeneration is wasteful when only a few elements need fixing.

---

## 12. Fundamental Divergences

| Dimension | CHIP's Choice | OpenUI's Choice | Reason for Divergence |
|-----------|---------------|-----------------|----------------------|
| **Format** | JSON (structured output) | Text DSL (free text) | Guaranteed validity for batch pipeline vs streaming for chat UX |
| **Streaming** | Batch | Progressive line-by-line | Design pipeline vs chat copilot |
| **Visual diversity** | Design token system | Component variants only | Generating distinct apps vs consistent chat widgets |
| **Multi-screen** | Full app prototyping | Single artifact per response | Apps vs widgets |
| **Evaluation** | Vision LLM + rubric + correction loop | Structural validation only | Design quality for apps vs correctness for chat |
| **Design tools** | Penpot output | None | Design workflow vs developer workflow |
| **Prompt generation** | Template + dynamic injection (catalog, tokens, IDs auto-populated; format rules static) | Fully auto-generated from Zod schemas | CHIP injects data dynamically; remaining gap is format rule generation |
| **Token efficiency** | ~1.5K–9.4K tokens/screen (JSON overhead + richer per-node data) | ~1.2K tokens/screen | DSL eliminates JSON delimiters; CHIP encodes more per node |
| **Rendering targets** | 3 targets: React JSX, Penpot scripts, Browser DOM | React, Vue, Svelte, React Native | Design-tool integration vs framework breadth |
| **Correction** | Incremental node-level patching (`executeFixes()`) | Incremental statement patching | Both converged independently on incremental patching |

---

## 13. Actionable Learnings for CHIP

### Genuine remaining gaps (verified against codebase)

1. **Format-rule auto-generation from TypeScript types.** CHIP already injects component catalog, renderable IDs, and design tokens dynamically at runtime via template placeholders (`{{COMPONENT_CATALOG}}`, `{{RENDERABLE_CATALOG_IDS}}`, token tables). However, the DesignSpec v2 *format rules* (field names, allowed values, structural constraints like `type` XOR `catalog`) remain static in the template and could drift from `design-spec-v2.ts` types. OpenUI's `library.prompt()` auto-generates everything from Zod schemas, eliminating all desync risk. A `generateFormatRulesFromSchema()` targeting only the format rules portion would close this last gap.

2. **Per-component React ErrorBoundary.** CHIP's renderer has graceful fallback rendering — unresolved nodes render as `<div>` containers with available layout styles, missing catalog entries get fallback render, missing images get placeholder icons. But there's no React `ErrorBoundary` wrapping individual components to catch runtime errors and show last-good state (as OpenUI does with `ElementErrorBoundary`). Low priority since structured output prevents most parse failures, but would improve resilience for edge cases.

### Already converged (no adoption needed)

1. **Incremental patching for corrections.** Both systems independently arrived at incremental patching. CHIP's `executeFixes()` in `browser-correction-adapter.ts` returns `{ patches: { nodeId: partialNodeSpec } }` shallow-merged into the existing spec. `BrowserFeedbackAdapter.applyPatch()` does per-node merge. The correction loop in `correction-loop.ts` iterates screenshot→evaluate→patch, never regenerating full specs.

2. **Structured error objects.** CHIP's evaluator produces typed `DesignIssue` objects with `severity` (critical/major/minor), `component`, `description`, `fix`, and stable `issueId` for tracking across correction iterations (defined in `design-evaluator.ts`, validated by `DesignEvaluationOutputSchema` in `schemas.ts`). Additionally, `MechanicalIssue` objects in `mechanical-fixes.ts` add Tier 1/Tier 2 classification with `autoFixable` flag and `suggestedFix`. The remaining difference from OpenUI: CHIP flattens these structured objects to prose format before passing to the correction LLM, while OpenUI keeps `OpenUIError` structured end-to-end.

### What CHIP has that OpenUI lacks

1. **Design token system** — two-layer (primitive → semantic → hex) color resolution + typography scale + elevation + spacing + motion tokens. Fundamental for visual diversity across projects — same catalog + different tokens = different visual identity.
2. **Multi-screen prototyping** — `navigateTo` field on nodes, hash-based navigation in `PrototypeApp.tsx`, shared chrome persistence in `LayoutShell.tsx`, overlay rendering for modals/drawers/sheets.
3. **Visual quality evaluation** — vision LLM + 5-dimension anchored rubric + progressive correction loop. Evaluator-as-enforcer pattern: separate LLM enforces compliance because design LLM ignores quality rules in prompts (proven empirically, Phase 2.6 testing 2026-04-27, documented in `design-decisions.md` §9.4).
4. **Three rendering targets** — React JSX components, Penpot JS API scripts, Browser DOM via Playwright (screenshots + interactive preview).
5. **Richer per-node specification** — semantic token references, typography roles, shadow elevations, catalog overrides with inheritance chains, navigation targets, screen type metadata.

---

## Sources

### CHIP (Internal)
- `packages/designspec-renderer/src/types/design-spec-v2.ts` — NodeSpec, DesignSpecV2 interfaces
- `packages/designspec-renderer/src/types/catalog.ts` — CatalogEntry, ResolvedNode, TreeNode
- `packages/designspec-renderer/src/types/tokens.ts` — RendererTokens
- `packages/designspec-renderer/src/renderer/tree-builder.ts` — flat → tree conversion
- `packages/designspec-renderer/src/catalog/resolver.ts` — catalog resolution + fuzzy matching
- `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx` — browser renderer
- `packages/designspec-renderer/src/renderer/browser/app/src/PrototypeApp.tsx` — multi-screen prototype
- `packages/designspec-renderer/src/renderer/browser/app/src/LayoutShell.tsx` — chrome layout
- `packages/agents-ux/src/design-pipeline/pipeline.ts` — generation orchestrator
- `packages/agents-ux/src/design-pipeline/browser-design-work.ts` — LLM → DesignSpec v2
- `packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md` — authoritative spec format prompt
- `docs/plans/completed/designspec-v2-requirements.md` — full spec + research (1,628 lines)
- `docs/design-decisions.md` — settled principles + rejected alternatives
- `docs/architecture/design-pipeline-dataflow.md` — pipeline data flow (1,108 lines)
- `docs/architecture/prototype-rendering-dataflow.md` — rendering data flow (412 lines)
- ADR-034 (flat adjacency), ADR-035 (catalog-first), ADR-037 (standalone renderer), ADR-042 (chat iteration), ADR-046 (unified pipeline), ADR-047 (browser default)
- `docs/lessons-learned.md` — "Separate WHAT from HOW" rule
- `fixtures/personal-expense-tracker/agentforge/designs/add-expense/penpot-design.json` — real output example

### OpenUI (External)
- [OpenUI GitHub Repository](https://github.com/thesysdev/openui) — source code, 2.2K stars
- [OpenUI Lang Overview](https://www.openui.com/docs/openui-lang/overview) — language specification
- [OpenUI Benchmarks](https://www.openui.com/docs/openui-lang/benchmarks) — token efficiency data
- [OpenUI SKILL.md](https://github.com/thesysdev/openui/blob/main/skills/openui/SKILL.md) — agent documentation
- [Thesys Blog: Why We're Open Sourcing OpenUI](https://www.thesys.dev/blogs/openui) — rationale
- [Thesys Blog: C1 Architecture](https://www.thesys.dev/blogs/generative-ui-architecture) — design decisions
- [Thesys Blog: Why Code Generation is Bad](https://www.thesys.dev/blogs/generating-code-for-generative-ui-is-a-bad-idea) — code gen study (June 2025)
- [Thesys Enterprise Case Study](https://www.thesys.dev/blogs/casestudy-1) — production deployment
- `benchmarks/samples/metrics.json` — raw benchmark data
- `benchmarks/samples/dashboard.oui` — real DSL output example
- Anthropic SDK Python issue #1185 — structured output limits documentation

---

## 14. Accuracy Audit (2026-05-12)

This document was verified against the CHIP codebase on 2026-05-12. The following corrections were applied:

### Claims corrected

| Original claim | Correction | Evidence |
|----------------|------------|----------|
| CHIP uses "full regeneration" for corrections | Incremental node-level patching via `executeFixes()` returning `{ patches: { nodeId: partialNodeSpec } }` | `browser-correction-adapter.ts`, `browser-adapter.ts:applyPatch()`, `correction-loop.ts` |
| CHIP prompt is "manually maintained" | Template with dynamic injection — catalog, tokens, renderable IDs populated at runtime. Only format rules are static. | `browser-design-work.ts:163-165`, `design-system-context.ts:buildComponentCatalogPrompt()`, `prompt-template-builder.ts:buildPromptFromTokens()` |
| CHIP evaluator uses "implicit/prose" error reporting | Structured `DesignIssue` objects with typed fields (`severity`, `component`, `description`, `fix`, `issueId`). Flattened to prose only at the correction LLM call boundary. | `design-evaluator.ts:47-54`, `schemas.ts:DesignEvaluationOutputSchema` |
| CHIP renders to "React only" at runtime | 3 targets: React JSX, Penpot JS API scripts, Browser DOM (Playwright) | `packages/designspec-renderer/src/index.ts:94-117` |
| Token efficiency "~2K tokens/screen" | Range: 1.5K (confirm dialog) to 9.4K (complex dashboard). ~2K is the minimum, not average. | `fixtures/personal-expense-tracker/agentforge/designs/` measured |

### Claims confirmed

| Claim | Status | Evidence |
|-------|--------|----------|
| JSON structured output guarantees validity | Confirmed | Anthropic `response_format` + JSON Schema in `browser-design-work.ts` |
| Design tokens enable visual diversity | Confirmed | Two-layer resolution in `token-resolver.ts`, diversity mechanism in `design-decisions.md` §9 |
| Multi-screen navigation works as described | Confirmed | `navigateTo` field + `PrototypeApp.tsx` hash routing + `LayoutShell.tsx` chrome persistence |
| No streaming (batch) | Confirmed | All LLM calls use `provider.complete()`, no SSE/streaming endpoints |
| Evaluator-as-enforcer pattern | Confirmed | `design-decisions.md` §9.4, Phase 2.6 testing (2026-04-27), `assess-container-diversity.ts` |

### Audit methodology
Three parallel code exploration agents searched: (1) prompt assembly pipeline, (2) evaluator/correction data flow, (3) renderer targets + token efficiency + production evidence. Each claim traced to specific file paths and line numbers.
