# DesignSpec: Declarative Design Rendering for AgentForge

## Requirements Document v1.0

**Author:** AgentForge Architecture Team
**Date:** March 25, 2026
**Status:** Draft

---

## 1. Executive Summary

AgentForge's current design pipeline generates Penpot designs by having an LLM produce 600+ line JavaScript scripts that call the Penpot Plugin API. This approach is fragile — the LLM must know every API quirk (text `growType`, `layoutChild` timing, flex direction bugs, children ordering), resulting in designs with truncated text, collapsed sections, and overlapping elements. Fixing these requires an ever-growing prompt (currently ~2,000 lines) that teaches API workarounds.

DesignSpec replaces imperative script generation with a declarative JSON specification. The LLM describes *what* the design should contain (components, layout, tokens, content). A deterministic renderer converts the spec to correct Penpot API calls. A complementary extractor reads Penpot shapes back into DesignSpec format, enabling precise change detection for human-agent collaboration flows.

### Key Outcomes

- Eliminates all Penpot API bugs (growType, layoutChild, flex direction, children ordering)
- Reduces LLM output from ~18K tokens to ~4K tokens per screen (77% reduction)
- Reduces design prompt from ~45K tokens to ~5K tokens (89% reduction)
- Enables property-level JSON diffing for human edit detection (Flow B & C)
- Enables Anthropic SDK structured output — near-zero retry rate
- Reduces per-screen design cost from ~$0.53 to ~$0.08 (85% reduction)
- Deterministic renderer produces identical output for identical input — testable, debuggable

---

## 2. Problem Statement

### 2.1 Current Architecture

```
Planning Agent → Component Tree + Token Bindings (JSON)
                         ↓
Design Agent (LLM) → Penpot JavaScript Script (~660 lines)
                         ↓
Penpot Plugin API → execute_code → Shapes on Canvas
                         ↓
Screenshot → Evaluator (LLM) → Score + Issues
                         ↓
Fix Script (LLM) → More JS → execute_code → Patched Shapes
```

The LLM performs two jobs simultaneously:
1. **Design decisions** — what components, what layout, what content, what tokens
2. **API translation** — how to call `penpot.createBoard()`, manage flex layouts, handle text sizing

Job #1 is what LLMs are good at. Job #2 is what LLMs are bad at.

### 2.2 Documented Failures

| Failure | Root Cause | Frequency |
|---------|-----------|-----------|
| Text truncation ("Split the b...") | No `growType = 'auto-height'` on text nodes | Every generation |
| Sections collapse to zero width | No `layoutChild.horizontalSizing = 'fill'` after appendChild | Every generation |
| Elements overlap ($0.00 over Amount label) | Fixed-size text without wrap | Frequent |
| Flex columns render as rows | `flex.dir = 'column'` on returned object silently fails (Penpot bug) | Every column layout |
| Fix scripts use wrong colors | Correction loop doesn't have token map context | Every correction |
| Entire sections missing | Script exceeds token budget, gets truncated | Complex screens |
| 30% retry rate | LLM produces malformed JSON wrapper around script | 1 in 3 generations |

### 2.3 Why Prompt Fixes Don't Scale

Each bug fix adds more rules to the design prompt. The prompt has grown from ~500 lines to ~2,000 lines over the development cycle. Every new rule competes for the LLM's attention with existing rules. Adding text sizing rules doesn't guarantee the LLM won't forget shadow rules it learned earlier. The prompt is approaching the point where adding more instructions decreases overall quality — the LLM can't reliably attend to 2,000 lines of API instructions while also making creative design decisions.

---

## 3. Proposed Architecture

### 3.1 Overview

```
Planning Agent → Component Tree + Token Bindings (JSON)
                         ↓
Design Agent (LLM) → DesignSpec JSON (~230 lines)
        ↑                ↓
  Structured Output    Renderer (deterministic code)
  via Anthropic SDK         ↓
                    Penpot Plugin API → Shapes on Canvas
                              ↓
                    Screenshot → Evaluator → Score
                              ↓
                    If issues: LLM produces DesignSpec patch (JSON diff)
                              ↓
                    Renderer applies patch → Updated Shapes
```

### 3.2 Separation of Concerns

| Concern | Owner | Format |
|---------|-------|--------|
| What components to create | LLM (Design Agent) | DesignSpec JSON |
| What layout/spacing to use | LLM (Design Agent) | DesignSpec JSON |
| What semantic tokens to apply | LLM (Design Agent) | DesignSpec JSON |
| What text content to display | LLM (Design Agent) | DesignSpec JSON |
| How to call Penpot API | Renderer (your code) | TypeScript |
| How to handle text sizing | Renderer (your code) | TypeScript |
| How to manage flex layouts | Renderer (your code) | TypeScript |
| How to resolve tokens to hex | Renderer (your code) | TypeScript |

### 3.3 Where the Renderer Helps in the Pipeline

```
agentforge init
    │
    ├── design-tokens.yaml     ── Gate 1 (WCAG contrast) ✓
    ├── component-catalog.yaml  ── Generated from base catalog ✓
    └── component-library.yaml  ── Library mappings ✓
          │
          ▼
Research Agent (reasoning, tools: [])
    │ Output: Design Brief JSON
    ▼
Planning Agent (reasoning, tools: [])
    │ Output: Component Tree + Token Bindings JSON
    │         Gate 2 (token allowlist + auto-correct) ✓
    ▼
Design Agent (LLM)
    │ Output: DesignSpec JSON (schema-validated via Anthropic SDK)
    │         ◀── RENDERER TAKES OVER HERE
    ▼
┌─────────────────────────────────────────────────────┐
│  RENDERER (deterministic, zero LLM cost)            │
│                                                     │
│  DesignSpec JSON                                    │
│       ↓                                             │
│  Token Resolver (semantic name → hex from tokens)   │
│       ↓                                             │
│  Component Renderers (15-20 types)                  │
│       ↓                                             │
│  Penpot Script (correct API calls, every time)      │
│       ↓                                             │
│  execute_code → Shapes on Canvas                    │
│                                                     │
│  Gate 3 (script validation) ✓ — now trivial,        │
│         renderer output is always valid              │
└─────────────────────────────────────────────────────┘
    │
    ▼
Screenshot → Evaluator (LLM)
    │ Gate 4 (visual quality score)
    ▼
If issues: LLM produces DesignSpec PATCH (not a JS fix script)
    │
    ▼
Renderer applies patch → Updated Shapes
    │ No hardcoded hex, no API bugs in fixes
    ▼
Human Review (HITL)
    │
    ├── Approved → Implementation Agent
    │
    └── Human edits in Penpot
            │
            ▼
    ┌─────────────────────────────────────────┐
    │  EXTRACTOR (Penpot → DesignSpec)        │
    │                                         │
    │  Read shape tree via Plugin API         │
    │  Reverse-map hex → semantic tokens      │
    │  Infer component types from structure   │
    │  Produce DesignSpec JSON                │
    │       ↓                                 │
    │  JSON diff against original spec        │
    │       ↓                                 │
    │  Precise change list (Flow B & C)       │
    └─────────────────────────────────────────┘
            │
            ▼
Agent receives structured diff:
  "TipSelector.options added '25%'"
  "CTA label changed to 'Split Now'"
  "GrandTotal moved above TipSection"
            │
            ▼
Code update agent patches implementation
```

---

## 4. DesignSpec Schema

### 4.1 Core Types

```typescript
/** Root specification for a single screen/page design. */
interface DesignSpec {
  screen: string;                    // Screen identifier (e.g., "bill-entry")
  width: number;                     // Canvas width in pixels (e.g., 1440)
  tokens: TokenMap;                  // Resolved token hex values for this spec
  root: ComponentSpec;               // Root component (the page)
}

/** Resolved token values — renderer uses these directly. */
interface TokenMap {
  [semanticName: string]: string;    // e.g., "cta-primary": "#0F6E56"
}

/** Any component in the design tree. */
interface ComponentSpec {
  name: string;                      // Unique name within the screen
  type: ComponentType;               // Component type (see 4.2)
  children?: ComponentSpec[];        // Child components

  // Layout
  width?: number | 'fill';          // Pixel width or fill parent
  height?: number | 'auto';         // Pixel height or auto-size
  layout?: LayoutSpec;              // Flex layout configuration
  mt?: number;                      // Margin top (spacing from previous sibling)
  mb?: number;                      // Margin bottom

  // Appearance
  background?: string;              // Semantic token name (e.g., "surface-primary")
  shadow?: 'sm' | 'md' | 'lg';     // Elevation level
  radius?: number;                  // Border radius in px
  border_color?: string;            // Semantic token name for border
  border_width?: number;            // Border width in px
  border_opacity?: number;          // Border opacity 0-1
  opacity?: number;                 // Element opacity 0-1

  // Type-specific properties (see 4.2)
  [key: string]: unknown;
}

interface LayoutSpec {
  dir: 'row' | 'column';
  gap?: number;                     // Row or column gap in px
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  px?: number;                      // Horizontal padding
  py?: number;                      // Vertical padding
  pt?: number;                      // Individual padding overrides
  pr?: number;
  pb?: number;
  pl?: number;
}
```

### 4.2 Component Types

Each type has specific properties the renderer knows how to handle.

#### Primitive Types (renderer handles directly)

```typescript
type ComponentType =
  // Structure
  | 'page'              // Root canvas board
  | 'container'         // Grouping board (transparent or with background)
  | 'section'           // Section with title (uses heading-2 + column layout)
  | 'header'            // App/page header bar
  | 'divider'           // Horizontal line separator

  // Content
  | 'text'              // Text node
  | 'display'           // Read-only value display (label + value)

  // Input
  | 'input'             // Text input with label, placeholder, helper
  | 'button'            // Clickable button (primary, secondary, ghost, destructive)
  | 'segmented-control' // N options in a pill-shaped row, one selected
  | 'stepper'           // Increment/decrement control with label and value
  | 'checkbox'          // Checkbox with label
  | 'radio'             // Radio button with label
  | 'switch'            // Toggle switch with label
  | 'select'            // Dropdown select with label

  // Data Display
  | 'badge'             // Small status indicator
  | 'avatar'            // User avatar (image or initials)
  | 'card'              // Elevated content container (shadow, padding, radius)
  | 'stat'              // Metric display (label, large value, optional trend)

  // Composite
  | 'list'              // Repeating items from a template
  | 'tooltip'           // Icon + message inline
  | 'form'              // Form container with field groups + actions
  ;
```

#### Type-Specific Properties

```typescript
// Text
interface TextProps {
  content: string;                   // The text content
  typography: string;                // Typography role (heading-1, body, label, small)
  color: string;                     // Semantic token name
  weight?: number;                   // Override font weight
  align?: 'left' | 'center' | 'right';
}

// Input
interface InputProps {
  variant?: 'text' | 'currency' | 'email' | 'password';
  label: string;
  placeholder?: string;
  prefix?: string;                   // e.g., "$"
  suffix?: string;                   // e.g., "%"
  value?: string;                    // Pre-filled value for design mockup
  helper?: string;                   // Helper text below input
  error?: string;                    // Error message (replaces helper)
  typography?: string;               // Override typography for value text
  autofocus?: boolean;               // Visual focus state indicator
}

// Button
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive';
  label: string;
  icon?: string;                     // Icon name (optional leading/trailing)
  disabled?: boolean;
}

// Segmented Control
interface SegmentedControlProps {
  options: Array<{
    label: string;
    selected: boolean;
  }>;
  selected_bg: string;              // Semantic token for selected state
  selected_text: string;            // Semantic token for selected text
  unselected_bg: string;            // Semantic token for unselected
  unselected_text: string;          // Semantic token for unselected text
}

// Stepper
interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  button_size?: number;             // Default 40
}

// Display (read-only value)
interface DisplayProps {
  label: string;
  value: string;
  suffix?: string;                  // e.g., "incl. tax + tip"
  typography?: string;              // For the value
  color?: string;                   // For the value
}

// List (repeating items)
interface ListProps {
  items: Array<Record<string, unknown>>;   // Data for each item
  item_template: ComponentSpec;             // Template with slot references
}

// Badge
interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'error' | 'info';
}

// Stat
interface StatProps {
  label: string;
  value: string;
  trend?: string;                   // e.g., "+12%"
  trend_direction?: 'up' | 'down';
}

// Section
interface SectionProps {
  title: string;                    // Section heading text
}

// Tooltip
interface TooltipProps {
  icon?: 'error' | 'warning' | 'info';
  message: string;
}
```

### 4.3 Token Resolution

The DesignSpec uses semantic token names throughout. The renderer resolves them to hex at render time using the project's `design-tokens.yaml`:

```
DesignSpec: { background: "cta-primary" }
         ↓
Token Resolver: design-tokens.yaml → semantic.cta-primary → primitive.deep-teal → #0F6E56
         ↓
Penpot API: shape.fills = [{ fillColor: '#0F6E56', fillOpacity: 1 }]
```

The renderer builds a `TokenMap` (semantic name → hex) at startup and uses it for every color reference. If a semantic name doesn't resolve, the renderer logs a warning and uses a visible fallback color (e.g., magenta `#FF00FF`) so missing tokens are immediately obvious in the design.

### 4.4 Shadow Levels

The renderer maps shadow levels to concrete Penpot shadow objects:

```typescript
const SHADOW_MAP = {
  sm: { style: 'drop-shadow', offsetX: 0, offsetY: 2, blur: 8, spread: 0, color: { r: 0, g: 0, b: 0, opacity: 0.06 } },
  md: { style: 'drop-shadow', offsetX: 0, offsetY: 4, blur: 16, spread: 0, color: { r: 0, g: 0, b: 0, opacity: 0.10 } },
  lg: { style: 'drop-shadow', offsetX: 0, offsetY: 8, blur: 32, spread: 0, color: { r: 0, g: 0, b: 0, opacity: 0.14 } },
};
```

These values come from `design-tokens.yaml` elevation spec. The LLM just says `"shadow": "sm"` — it never needs to know the Penpot shadow object structure.

---

## 5. Renderer Architecture

### 5.1 Overview

```typescript
/** Convert a DesignSpec to a Penpot JavaScript script string. */
function renderToScript(spec: DesignSpec, tokens: DesignTokensSpec): string {
  const tokenMap = buildTokenMap(tokens);
  const ctx: RenderContext = { tokenMap, contentWidth: spec.width, indent: 0, varCounter: 0 };
  const lines: string[] = [];

  // Emit token map
  lines.push(emitTokenMap(tokenMap));

  // Emit component tree recursively
  lines.push(renderComponent(spec.root, null, ctx));

  // Emit return statement with node IDs
  lines.push(emitReturn(ctx));

  return lines.join('\n');
}
```

### 5.2 Component Renderers

Each component type has a renderer function that produces correct Penpot API calls:

```typescript
type ComponentRenderer = (spec: ComponentSpec, parentVar: string, ctx: RenderContext) => string;

const renderers: Record<ComponentType, ComponentRenderer> = {
  'page': renderPage,
  'container': renderContainer,
  'section': renderSection,
  'text': renderText,
  'input': renderInput,
  'button': renderButton,
  'segmented-control': renderSegmentedControl,
  'stepper': renderStepper,
  'display': renderDisplay,
  'divider': renderDivider,
  'list': renderList,
  'card': renderCard,
  'header': renderHeader,
  'badge': renderBadge,
  'avatar': renderAvatar,
  'stat': renderStat,
  'tooltip': renderTooltip,
  'checkbox': renderCheckbox,
  'radio': renderRadio,
  'switch': renderSwitch,
  'select': renderSelect,
  'form': renderForm,
};
```

### 5.3 What Each Renderer Guarantees

Every renderer handles the Penpot API correctly — the LLM never needs to know these details:

| API Concern | How the Renderer Handles It |
|-------------|---------------------------|
| Text `growType` | Short text (≤20 chars) → `auto-width`. Long text → `resize(parentWidth)` then `growType = 'auto-height'` |
| `layoutChild` timing | Always set AFTER `parent.appendChild(child)` |
| Flex direction | Always uses `board.flex.dir = 'column'` workaround |
| Children ordering | Renderer reverses order if Penpot requires it |
| Section width | Always sets `resize(parentWidth)` or `layoutChild.horizontalSizing = 'fill'` |
| Token resolution | All colors resolved from `TokenMap` — never hardcoded hex |
| Shadow objects | Mapped from `'sm'`/`'md'`/`'lg'` to full Penpot shadow spec |
| Typography | Font size, weight, line height resolved from typography role |
| Border radius | Mapped from component type defaults (card=20, input=12, chip=8) |
| Spacing | 8px grid enforced — values snapped to nearest grid unit |
| Touch targets | Minimum 44px height enforced on interactive components |

### 5.4 Example Renderer: Input

```typescript
function renderInput(spec: ComponentSpec, parentVar: string, ctx: RenderContext): string {
  const props = spec as ComponentSpec & InputProps;
  const v = nextVar(ctx, spec.name);
  const w = resolveWidth(spec.width, ctx);
  const h = props.height ?? 48;
  const radius = spec.radius ?? 12;
  const lines: string[] = [];

  // Wrapper (label + input + helper)
  lines.push(`const ${v} = penpot.createBoard();`);
  lines.push(`${v}.name = '${spec.name}';`);
  lines.push(`const ${v}f = ${v}.addFlexLayout();`);
  lines.push(`${v}.flex.dir = 'column';`);  // Workaround: use board.flex.dir
  lines.push(`${v}f.rowGap = 4;`);
  lines.push(`${parentVar}.appendChild(${v});`);
  lines.push(`${v}.layoutChild.horizontalSizing = 'fill';`);  // Always fill parent

  // Label
  if (props.label) {
    const lv = nextVar(ctx, 'label');
    lines.push(`const ${lv} = penpot.createText('${escape(props.label)}');`);
    lines.push(`${lv}.fontSize = 12;`);
    lines.push(`${lv}.fontWeight = '500';`);
    lines.push(`${lv}.fills = [{ fillColor: T.textSecondary, fillOpacity: 1 }];`);
    lines.push(`${v}.appendChild(${lv});`);
    lines.push(`${lv}.layoutChild.horizontalSizing = 'fill';`);
  }

  // Input box
  const bv = nextVar(ctx, 'box');
  lines.push(`const ${bv} = penpot.createBoard();`);
  lines.push(`${bv}.name = 'Input-${spec.name}';`);
  lines.push(`${bv}.resize(${w}, ${h});`);
  lines.push(`${bv}.borderRadius = ${radius};`);
  lines.push(`${bv}.fills = [{ fillColor: T.surfacePrimary, fillOpacity: 1 }];`);
  const bc = props.border_color ? `T.${camelCase(props.border_color)}` : 'T.borderDefault';
  const bw = props.border_width ?? 1;
  lines.push(`${bv}.strokes = [{ strokeColor: ${bc}, strokeOpacity: 1, strokeWidth: ${bw}, strokeAlignment: 'inner' }];`);
  lines.push(`const ${bv}f = ${bv}.addFlexLayout();`);
  lines.push(`${bv}f.dir = 'row';`);
  lines.push(`${bv}f.alignItems = 'center';`);
  lines.push(`${bv}f.leftPadding = 16;`);
  lines.push(`${bv}f.rightPadding = 16;`);
  lines.push(`${bv}f.columnGap = 8;`);
  lines.push(`${v}.appendChild(${bv});`);
  lines.push(`${bv}.layoutChild.horizontalSizing = 'fill';`);

  // Prefix (e.g., "$")
  if (props.prefix) {
    const pv = nextVar(ctx, 'prefix');
    lines.push(`const ${pv} = penpot.createText('${props.prefix}');`);
    lines.push(`${pv}.fontSize = ${resolveTypographySize(props.typography ?? 'body')};`);
    lines.push(`${pv}.fills = [{ fillColor: T.textSecondary, fillOpacity: 0.5 }];`);
    lines.push(`${bv}.appendChild(${pv});`);
  }

  // Value or placeholder
  const tv = nextVar(ctx, 'text');
  const displayText = props.value ?? props.placeholder ?? '';
  const isPlaceholder = !props.value;
  lines.push(`const ${tv} = penpot.createText('${escape(displayText)}');`);
  lines.push(`${tv}.fontSize = ${resolveTypographySize(props.typography ?? 'body')};`);
  const textColor = isPlaceholder ? 'T.textSecondary' : 'T.textPrimary';
  const textOpacity = isPlaceholder ? 0.45 : 1;
  lines.push(`${tv}.fills = [{ fillColor: ${textColor}, fillOpacity: ${textOpacity} }];`);
  lines.push(`${bv}.appendChild(${tv});`);

  // Helper text
  if (props.helper) {
    const hv = nextVar(ctx, 'helper');
    lines.push(`const ${hv} = penpot.createText('${escape(props.helper)}');`);
    lines.push(`${hv}.fontSize = 11;`);
    lines.push(`${hv}.fills = [{ fillColor: T.textSecondary, fillOpacity: 0.7 }];`);
    // Long helper text needs auto-height
    if (props.helper.length > 20) {
      lines.push(`${hv}.resize(${w}, 22);`);
      lines.push(`${hv}.growType = 'auto-height';`);
    }
    lines.push(`${v}.appendChild(${hv});`);
    lines.push(`${hv}.layoutChild.horizontalSizing = 'fill';`);
  }

  return lines.join('\n');
}
```

This renderer produces correct Penpot code every time — no matter what the LLM does, the text will have proper growType, the layoutChild will be set after appendChild, and the flex direction will use the workaround.

---

## 6. Extractor Architecture (Phase 2)

### 6.1 Purpose

The extractor reads the Penpot shape tree and produces a DesignSpec JSON that can be diffed against the original spec. This enables:

- **Flow B:** Human edits design → extractor reads → diff against agent's spec → precise change list
- **Flow C:** Agent proposes → human modifies → extractor reads → diff IS the feedback

### 6.2 Shape-to-Spec Mapping

```typescript
function extractDesignSpec(page: PenpotPage, tokens: DesignTokensSpec): DesignSpec {
  const reverseTokenMap = buildReverseTokenMap(tokens);  // hex → semantic name

  function shapeToSpec(shape: PenpotShape): ComponentSpec {
    const spec: ComponentSpec = {
      name: shape.name,
      type: inferType(shape),
      width: shape.width,
      height: shape.height,
    };

    // Reverse-map fills to semantic token names
    if (shape.fills?.length && shape.fills[0].fillColor) {
      const tokenName = reverseTokenMap[shape.fills[0].fillColor.toUpperCase()];
      if (tokenName) {
        spec.background = tokenName;
      } else {
        spec.background = shape.fills[0].fillColor;  // Unknown color — flag for review
        spec._unknownColors = [shape.fills[0].fillColor];
      }
    }

    // Extract text content
    if (shape.type === 'text') {
      spec.content = shape.characters;
      spec.typography = inferTypographyRole(shape.fontSize, shape.fontWeight);
      spec.color = reverseTokenMap[shape.fills?.[0]?.fillColor?.toUpperCase()] ?? 'unknown';
    }

    // Extract flex layout
    if (shape.flex) {
      spec.layout = {
        dir: shape.flex.dir,
        gap: shape.flex.dir === 'column' ? shape.flex.rowGap : shape.flex.columnGap,
      };
      if (shape.flex.topPadding || shape.flex.leftPadding) {
        spec.layout.py = shape.flex.topPadding;
        spec.layout.px = shape.flex.leftPadding;
      }
    }

    // Extract shadows → shadow level
    if (shape.shadows?.length) {
      spec.shadow = inferShadowLevel(shape.shadows[0]);
    }

    // Recurse children
    if (shape.children?.length) {
      spec.children = shape.children.map(shapeToSpec);
    }

    return spec;
  }

  const rootShape = page.children[0];  // Assumes first child is the root board
  return {
    screen: page.name,
    width: rootShape.width,
    tokens: buildTokenMap(tokens),
    root: shapeToSpec(rootShape),
  };
}
```

### 6.3 Type Inference

```typescript
function inferType(shape: PenpotShape): ComponentType {
  // Text node
  if (shape.type === 'text') return 'text';

  // Board with no children, height ≤ 2 → divider
  if (shape.type === 'board' && shape.height <= 2 && !shape.children?.length) return 'divider';

  // Board with flex layout
  if (shape.flex) {
    // Has border + text child → input
    if (shape.strokes?.length && shape.children?.some(c => c.type === 'text')) {
      const hasLabel = shape.children.some(c =>
        c.type === 'text' && c.fontSize <= 12 && c.fontWeight === '500'
      );
      if (hasLabel) return 'input';
    }

    // Single row, height ≤ 64, full width → header
    if (shape.flex.dir === 'row' && shape.height <= 80 && shape.width > 600) return 'header';

    // Has shadow, padding > 16, multiple children → card
    if (shape.shadows?.length && shape.children?.length > 1) return 'card';
  }

  // Default
  return 'container';
}
```

### 6.4 Change Detection

```typescript
import { diff } from 'json-diff';  // or similar deep diff library

function detectChanges(original: DesignSpec, modified: DesignSpec): DesignChange[] {
  const rawDiff = diff(original.root, modified.root);
  return flattenDiff(rawDiff).map(change => ({
    path: change.path,           // e.g., "TipSelector.options[2].selected"
    type: change.type,           // 'added' | 'removed' | 'changed'
    oldValue: change.oldValue,   // true
    newValue: change.newValue,   // false
    component: extractComponentName(change.path),  // "TipSelector"
  }));
}
```

Example output:
```json
[
  { "path": "TipSelector.options[4].label", "type": "changed", "oldValue": "Custom", "newValue": "25%", "component": "TipSelector" },
  { "path": "CalculateSplitButton.label", "type": "changed", "oldValue": "Calculate Split", "newValue": "Split Now", "component": "CalculateSplitButton" },
  { "path": "PeopleSection.children[3]", "type": "added", "newValue": { "type": "text", "content": "Tax is split proportionally" }, "component": "PeopleSection" }
]
```

### 6.5 Limitations and Mitigations

| Limitation | Mitigation |
|-----------|------------|
| Human creates shapes without AgentForge naming | Match by position + content. Flag unmatched shapes for human review. |
| Type inference is heuristic | Use shape name prefix convention (e.g., `Input-BillTotal`) when agent creates. Fall back to structural heuristics for human-created shapes. |
| Colors outside token system | Flag as `_unknownColors` in extracted spec. Agent asks: "I see #FF0000 which isn't in your design tokens — should I add it as a new semantic color?" |
| Complex nested layouts | Recurse depth-first. The tree structure is preserved regardless of complexity. |

---

## 7. LLM Integration

### 7.1 Structured Output via Anthropic SDK

The design agent uses Anthropic SDK tool use to force the LLM to produce valid DesignSpec JSON:

```typescript
const designTool = {
  name: 'submit_design',
  description: 'Submit the design specification for rendering',
  input_schema: {
    type: 'object',
    required: ['screen', 'width', 'root'],
    properties: {
      screen: { type: 'string' },
      width: { type: 'number' },
      root: { $ref: '#/$defs/ComponentSpec' },
    },
    $defs: {
      ComponentSpec: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['page', 'container', 'section', 'text', 'input', 'button', /* ... */] },
          children: { type: 'array', items: { $ref: '#/$defs/ComponentSpec' } },
          // ... all properties
        }
      }
    }
  }
};

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4',
  max_tokens: 8000,
  tools: [designTool],
  tool_choice: { type: 'tool', name: 'submit_design' },
  system: designSystemPrompt,  // ~200 lines, not ~2000
  messages: [{ role: 'user', content: userMessage }],
});

// Output is guaranteed valid JSON matching the schema
const designSpec = response.content.find(b => b.type === 'tool_use')?.input as DesignSpec;
```

### 7.2 Reduced Prompt

The design prompt shrinks from ~2,000 lines to ~200 lines because it no longer needs to teach:
- Penpot Plugin API reference (removed — renderer handles)
- API anti-patterns and workarounds (removed — renderer handles)
- Working code examples (removed — replaced with DesignSpec JSON examples)
- Text overflow prevention rules (removed — renderer handles)
- Shadow/border/radius API syntax (removed — renderer handles)

What remains in the prompt:
- Component type catalog with descriptions (what each type is for)
- Layout and composition principles (spacing, visual hierarchy, grouping)
- Token usage rules (which semantic names to use where)
- 1-2 DesignSpec JSON examples (much shorter than JS examples)
- The screen brief from the planning agent

### 7.3 Correction Loop

When the evaluator identifies issues, instead of generating a JS fix script, the LLM produces a DesignSpec patch:

```json
{
  "patches": [
    { "path": "root.children[1].children[0].children[0]", "op": "replace", "value": { "type": "text", "content": "Split the bill, not the friendship.", "typography": "heading-1", "color": "text-primary" } },
    { "path": "root.children[1].children[2].layout.gap", "op": "replace", "value": 24 }
  ]
}
```

The renderer applies the patch to the spec, then re-renders the entire screen. No partial JS fixes, no hardcoded hex, no API bugs in corrections.

---

## 8. Cost Analysis

### 8.1 Per-Screen Comparison

| Metric | Script Approach | DesignSpec Approach |
|--------|----------------|-------------------|
| Prompt tokens (input) | ~45,000 | ~5,000 |
| Output tokens | ~18,000 | ~4,000 |
| Retry probability | ~30% | ~0% (structured output) |
| Correction loop iterations | 2-4 | 0-1 |
| Per-screen LLM cost (Sonnet) | ~$0.53 | ~$0.08 |
| Renderer execution cost | N/A | ~0 (deterministic code) |

### 8.2 10-Screen App

| Metric | Script Approach | DesignSpec Approach | Savings |
|--------|----------------|-------------------|---------|
| Total input tokens | ~450K | ~50K | 89% |
| Total output tokens | ~180K | ~40K | 78% |
| Retries | ~60K tokens | ~0 | 100% |
| Correction loops | ~200K tokens | ~20K | 90% |
| Total LLM cost | ~$5.25 | ~$0.75 | 86% |
| Time per screen | ~45 sec | ~15 sec | 67% |
| Total pipeline time | ~8 min | ~3 min | 63% |

### 8.3 Renderer Build Cost (one-time)

| Component | Estimated Effort |
|-----------|-----------------|
| Core renderer framework (tree walker, token resolver, script emitter) | 4-6 hours |
| 6 primitive renderers (page, container, section, text, divider, header) | 2-3 hours |
| 5 input renderers (input, button, segmented-control, stepper, select) | 3-4 hours |
| 4 data display renderers (display, badge, stat, card) | 2-3 hours |
| 3 composite renderers (list, tooltip, form) | 2-3 hours |
| Schema definition + validation | 2-3 hours |
| Tests for all renderers | 4-6 hours |
| Extractor (Phase 2) | 8-12 hours |
| **Total** | **~3-4 days** |

---

## 9. Implementation Plan

### Phase 1: Renderer + Schema (Week 1)

1. Define `DesignSpec` TypeScript types in `packages/core/src/types/design-spec.ts`
2. Implement token resolver in `packages/core/src/catalogs/token-resolver.ts`
3. Build renderer framework in `packages/agents-ux/src/renderer/index.ts`
4. Implement component renderers (start with primitives, then inputs, then composites)
5. Write tests for each renderer — input DesignSpec → output Penpot script → verify script correctness
6. Wire into design agent: LLM outputs DesignSpec → renderer produces script → execute_code

### Phase 2: Structured Output + Reduced Prompt (Week 1-2)

7. Define Anthropic SDK tool schema matching DesignSpec types
8. Update design agent to use `tool_choice: { type: 'tool', name: 'submit_design' }`
9. Rewrite design prompt — remove API reference, keep composition rules, add DesignSpec examples
10. Remove `parsePenpotDesignScript()` regex parsing — structured output guarantees valid JSON
11. Update correction loop to produce DesignSpec patches instead of JS fix scripts

### Phase 3: Extractor + Diff (Week 2-3)

12. Build Penpot shape-to-DesignSpec extractor as a Penpot plugin script
13. Implement reverse token map (hex → semantic name)
14. Implement type inference heuristics
15. Build JSON diff tool for change detection
16. Wire into Flow B: human edits → extractor → diff → agent receives change list
17. Wire into Flow C: agent proposes → human modifies → extractor → diff → feedback signal

### Phase 4: Deprecate Script Path (Week 3)

18. Remove Penpot API reference from design prompt
19. Remove imperative script generation code path
20. Remove fix script generation in correction loop
21. Update all tests and documentation

---

## 10. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Schema can't express some design patterns | Medium | New component type needed | Keep a script fallback for v1. Add new renderers incrementally as patterns emerge. |
| Penpot Plugin API changes | Low | Renderer needs updating | Renderer is ~500 lines of focused code — much easier to update than 2,000 lines of prompt + unbounded LLM-generated scripts. |
| LLM output quality drops with simpler prompt | Low | Designs are less creative | The prompt still contains composition rules, visual hierarchy guidance, and token usage. Only API mechanics are removed. |
| Extractor type inference fails on complex layouts | Medium | Human edits aren't detected accurately | Use naming conventions from agent-created shapes. Flag uncertain inferences for human confirmation. |
| Structured output schema too restrictive | Medium | LLM can't express edge cases | Keep schema extensible with `[key: string]: unknown` on ComponentSpec. Add new typed properties as patterns stabilize. |

---

## 11. Success Criteria

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Zero Penpot API bugs in generated designs | Manual review of 10 screens | 0 truncation, 0 overlap, 0 collapsed sections |
| LLM cost reduction | Token usage comparison | ≥80% reduction vs script approach |
| Retry rate | Structured output failures | ≤2% (down from ~30%) |
| Change detection precision | Flow B test: human makes 5 edits, diff detects all 5 | 100% recall, ≤1 false positive |
| Renderer test coverage | Unit tests for all component renderers | 100% type coverage, ≥90% branch coverage |
| Design quality maintained | Evaluator scores for 10 screens | Average score ≥ 80 (same as current) |

---

## 12. Appendix: Sample DesignSpec

See `docs/samples/bill-entry-design-spec.json` for a complete 231-line DesignSpec of the SplitEase bill-entry screen, compared to the current 660-line imperative script.
