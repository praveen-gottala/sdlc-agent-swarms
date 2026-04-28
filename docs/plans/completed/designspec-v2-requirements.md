# DesignSpec v2.0 — Requirements & Architecture Document

**For: AgentForge Design Pipeline**
**Date:** March 25, 2026
**Status:** Ready for implementation

---

## IMPORTANT: Read This First (For Claude Code)

This document is both a requirements specification AND a knowledge base. Before implementing anything:

1. Read the entire document — every section has a "WHY" block explaining the reasoning
2. Create ADRs in docs/adrs/ following the existing project convention. Use the next available number (check docs/adrs/ for the latest)
3. When you face an ambiguous choice during implementation, check Section 13 (Decision Framework) before asking the user
4. After completing each phase, append to `docs/lessons-learned.md` document.

The document is structured so you can implement top-to-bottom in order. Each section builds on the previous one.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Why This Architecture Exists](#2-why-this-architecture-exists)
3. [Architecture Overview](#3-architecture-overview)
4. [The Three-Layer Component Model](#4-the-three-layer-component-model)
5. [Flat Adjacency List Schema](#5-flat-adjacency-list-schema)
6. [Component Catalog](#6-component-catalog)
7. [Token System](#7-token-system)
8. [Anthropic SDK Integration](#8-anthropic-sdk-integration)
9. [Dual Renderer Architecture](#9-dual-renderer-architecture)
10. [Penpot Plugin Data & Extractor](#10-penpot-plugin-data--extractor)
11. [Validation Layer](#11-validation-layer)
12. [Complete Example: Bill Entry Screen](#12-complete-example-bill-entry-screen)
13. [Decision Framework for Future Design Agents](#13-decision-framework-for-future-design-agents)
14. [Implementation Plan](#14-implementation-plan)
15. [Appendix: Research Findings](#15-appendix-research-findings)

---

## 1. Executive Summary

DesignSpec v2 replaces the current approach where an LLM generates 600+ line Penpot JavaScript scripts directly. Instead:

- The LLM produces a **flat JSON adjacency list** describing WHAT the design contains
- A **component catalog** pre-encodes visual quality — the LLM selects and configures, doesn't define from scratch
- A **deterministic renderer** converts the spec to correct Penpot API calls AND React/HTML code
- **Anthropic SDK structured output** (`strict: true`) guarantees valid JSON — near-zero retry rate
- **Penpot Plugin Data** tags every shape, enabling 100% accurate round-trip extraction for human edit detection

### Key Metrics

| Metric | Current (v1) | DesignSpec v2 | Change |
|--------|-------------|---------------|--------|
| LLM output per screen | ~18K tokens (660 lines JS) | ~2K tokens (177 lines JSON) | -89% |
| Prompt size | ~45K tokens (2000 lines) | ~5K tokens (~200 lines) | -89% |
| Retry rate | ~30% (malformed output) | ~0% (structured output) | -100% |
| Penpot API bugs | Every generation | Zero (renderer handles) | -100% |
| Per-screen LLM cost (Sonnet) | ~$0.53 | ~$0.06 | -89% |
| Diff precision | Unusable (code varies) | Property-level JSON diff | New capability |
| Render targets | Penpot only | Penpot + React/HTML | New capability |
| Max fields per node | 30+ optional | 7 max | Strict mode safe |

---

## 2. Why This Architecture Exists

> **WHY (for Claude Code):** Document this reasoning in ADR with separate section named "Motivation." Understanding the WHY prevents you from making changes that accidentally re-introduce the problems we're solving.

### Problem 1: The LLM is bad at API mechanics

The LLM makes two kinds of decisions simultaneously: WHAT to design (components, layout, content) and HOW to call the Penpot API (createBoard, addFlexLayout, growType). The LLM is good at WHAT but bad at HOW. Every bug we've debugged is in the HOW:

```
BUG: Text truncation    → LLM forgot growType = 'auto-height'
BUG: Collapsed sections  → LLM forgot layoutChild.horizontalSizing = 'fill'
BUG: Flex direction wrong → LLM used flex.dir instead of board.flex.dir (Penpot bug)
BUG: Fix scripts use wrong colors → Correction loop doesn't have token map context
```

If you in {module}/.agentforge/previews/{screen}/scripts eg: split-breakdown/.agentforge/previews/split-breakdown/scripts

**Solution:** Separate WHAT (LLM decides, produces JSON) from HOW (renderer handles, always correct).
### Problem 1: The LLM is improving at API mechanics — but improvements are habits, not guarantees

Recent prompt fixes have addressed three of four documented bugs. The latest generated code (split-breakdown, March 25 2026) shows:

- **Text growType (BUG 1): PARTIALLY FIXED.** The `makeText` helper now supports `wrapWidth` parameter that triggers `resize()` + `growType = 'auto-height'`. But it's opt-in — the LLM must remember to pass `wrapWidth` for every long string. Some long texts still don't get it. The renderer makes auto-height automatic for ALL text >18 characters.

- **layoutChild after appendChild (BUG 2): FIXED by prompt.** The LLM now consistently sets `layoutChild.horizontalSizing = 'fill'` after every `appendChild` — 15 instances in the latest script, zero missed. The renderer guarantees this structurally rather than relying on the LLM's consistency.

- **Flex direction workaround (BUG 3): FIXED by prompt.** The LLM now uses `board.flex.dir = 'column'` (the workaround) instead of the broken `flexVar.dir = 'column'` pattern — every instance in the latest script uses the correct pattern. The renderer guarantees this structurally.

- **Fix scripts use wrong colors (BUG 4): STILL PRESENT.** Fix scripts use hardcoded hex values (`#2D6A4F`, `#FFFFFF`) instead of project tokens (`#0F6E56` cta-primary, `#FFF8E7` text-on-cta). The correction loop generates scripts in a separate LLM call without the original `const T = {}` token map context. DesignSpec JSON patches eliminate this entirely — the renderer re-renders with correct tokens.

The core argument for DesignSpec v2 is not that the current approach is broken — it's working for SplitEase. The argument is that prompt-trained habits don't scale: a different app type, a more complex screen, or a model update could regress any of the three fixed bugs. The renderer converts "the LLM usually remembers" into "the code always does it."

### Problem 2: Anthropic structured output has hard limits

Research (GitHub issue #1185, anthropic-sdk-python) found four hard constraints. Here's how each one maps to our actual codebase:

#### Limit 1: 24 optional parameters max

Every schema field NOT in the `required` array is optional. Each optional field roughly doubles the grammar's state space. 24 is the hard ceiling.

**Our planning-spec.json — PersonBreakdownCard alone has 15 props:**
```json
// From planning-spec.json — ONE component's props
{
  "name": "PersonBreakdownCard",
  "props": [
    "personName", "totalShare", "subtotalShare", "taxShare", "tipShare",
    "roundingAdjustment", "isExpanded", "ariaExpanded", "ariaControls",
    "elevation", "background", "borderRadius", "paddingX", "paddingY", "gap"
  ]
}
```

If we made a single strict-mode schema covering ALL component types (PersonBreakdownCard + StickyActionBar + CopiedToClipboardToast + ...), the union of their optional fields would exceed 30. The API would reject it.

**v2 solution:** The catalog carries `elevation`, `background`, `borderRadius`, `paddingX`, `paddingY`, `gap` as defaults. The LLM's schema only has ~12 optional fields per node — well under 24.
```
v1 schema per node: ~30 optional fields  → BREAKS strict mode
v2 schema per node: ~12 optional fields  → safe (catalog carries the rest)
```

#### Limit 2: 16 union-type parameters max

A "union type" is any field that accepts MORE THAN ONE type. Most common: nullable fields (`string | null`). Each union consumes one slot out of 16.

**Our design.js uses unions everywhere without realizing it:**
```javascript
// design.js line 28 — wrapWidth is number OR undefined
function makeText(content, fontSize, fontWeight, color, opacity, wrapWidth) { ... }

// design.js line 44 — fillColor is string OR null
b.fills = fillColor ? [{ fillColor: fillColor, fillOpacity: 1 }] : [];
```

In a strict schema, every nullable/optional-typed field compiles as `anyOf: [type, null]` — consuming one union slot. Our v1 DesignSpec had nullable on `shadow`, `color`, `background`, `border_color`, `typography`, `weight`, `align`, `prefix`, `suffix` — 10+ unions just from styling fields.

**v2 solution:** Only 3 unions in the entire schema:
```
parent: string | null     → root node has null parent
width:  number | "fill"   → pixels or stretch
value:  string | number   → "Person 1" or 3
```

Everything else is single-typed. Styling properties live in the catalog, not the schema.

#### Limit 3: Recursive schemas return 400 error

A recursive schema is when a type refers to ITSELF. The grammar compiler cannot handle infinite nesting — the API rejects it immediately.

**Our planning-spec.json IS a recursive tree:**
```json
// planning-spec.json — componentTree is recursive
{ "name": "PersonBreakdownCard",
  "children": ["Card", "VenmoDeepLinkButton", "ShareBreakdownRow"] }
// VenmoDeepLinkButton has children too:
{ "name": "VenmoDeepLinkButton",
  "children": ["Button"] }
```

As a TypeScript type, this requires recursion:
```typescript
// BREAKS strict mode — 400 Bad Request
interface ComponentTreeNode {
  name: string;
  props: string[];
  children: ComponentTreeNode[];  // ← refers to itself
}
```

**v2 solution:** Flat adjacency list — no type refers to itself:
```json
{
  "personCard":     { "parent": "personList", "order": 0, "catalog": "card" },
  "venmoBtn":       { "parent": "personCard", "order": 1, "catalog": "button-primary" },
  "shareBreakdown": { "parent": "personCard", "order": 2, "type": "container" }
}
```

Parent-child expressed as string references. The renderer reconstructs the tree.

#### Limit 4: ~50 properties + 5 nesting levels = "grammar too large"

Even without recursion, deeply nested schemas hit a 180-second grammar compilation timeout. Complexity grows multiplicatively across levels.

**Our design.js has 6 levels of nesting:**
```
Level 1: root (SplitBreakdownLayout)
  Level 2: mainContent
    Level 3: personList
      Level 4: card (PersonBreakdownCard)
        Level 5: cardHeaderRow
          Level 6: nameCol → personName text
          Level 6: amountCol → totalAmount text
          Level 6: venmoBtn → venmoTxt text
```

If each level had 8 properties in the schema: `8^6 = 262,144 grammar states`. GitHub issue #1185 documented failure at roughly 50 properties across 5 levels.

**v2 solution:** Only 2 levels — the root object and the flat node objects:
```
Level 1: { screen, width, nodes }           → 3 fields
Level 2: { parent, order, catalog, label }   → ~12 fields per node

Grammar: 3 × 12 = 36 states (vs 262,144)
```

Our v1 DesignSpec had 30+ optional fields per ComponentSpec in a recursive tree. This CANNOT work with strict mode.

**Solution:** Flat adjacency list (no recursion) + component catalog (fewer optional fields per node — max 7).

### Problem 3: LLMs produce monotonous designs regardless of approach

Research found:
- Direct code generation (v0.dev, Bolt, Lovable) converges on "the mathematical average of the internet" — Inter font, purple gradients, three-column layouts
- Catalog-based approaches (json-render, A2UI) are constrained by catalog entries
- Both paths produce sameness — but for different reasons

**Solution:** Design variety comes from three sources, not from the component library:
1. **Design tokens** — different color palettes, typography, spacing create visually distinct apps
2. **Composition patterns** — how components are arranged (not what components exist)
3. **Override escape hatch** — per-node overrides for emphasis, hierarchy, differentiation

### Problem 4: No way to detect human edits precisely

With imperative scripts, you can't diff two versions meaningfully — the LLM restructures code differently each time. This blocks Flow B (human edits in Penpot) and Flow C (feedback loop).

**Solution:** JSON adjacency list is trivially diffable. Penpot Plugin Data tags enable 100% accurate extraction. JSON diff between v1 and v2 shows exactly what changed at the property level.

---

## 3. Architecture Overview

```
Planning Agent (reasoning, tools: [])
  │ Output: Component tree + token bindings (JSON)
  │ Decides: section ordering, component selection, data flow
  ▼
Design Agent (LLM with Anthropic structured output)
  │ Input: Planning output + component catalog + design tokens + PRD context
  │ Output: DesignSpec v2 JSON (flat adjacency list)
  │ Decides: composition, content, catalog selections, overrides
  │
  │ Uses Anthropic SDK tool_choice: { type: 'tool', name: 'submit_design' }
  │ strict: true → output guaranteed to match schema
  ▼
┌──────────────────────────────────────────────────────────┐
│ RENDERER (deterministic, zero LLM cost)                  │
│                                                          │
│ DesignSpec JSON                                          │
│     ↓                                                    │
│ Catalog Resolver (merge catalog defaults + overrides)    │
│     ↓                                                    │
│ Tree Reconstructor (flat list → parent-child tree)       │
│     ↓                                                    │
│ ┌─────────────────┐    ┌──────────────────┐              │
│ │ Penpot Renderer  │    │ React/HTML Renderer│            │
│ │ (JS script)      │    │ (JSX/HTML string)  │            │
│ └────────┬─────────┘    └────────┬──────────┘            │
│          ↓                       ↓                       │
│   execute_code              Preview HTML                 │
│   → Shapes on Canvas       → Browser preview             │
└──────────────────────────────────────────────────────────┘
  ↓                                    ↓
Screenshot → Evaluator            Code generation
  ↓                                    ↓
If issues: LLM produces             Implementation
  DesignSpec PATCH (JSON diff)        Agent uses JSX
  → Renderer re-renders
```

---

## 4. The Three-Layer Component Model

> **WHY (for Claude Code):** This classification comes from Yesenia Perez-Cruz's experience leading Shopify's Polaris design system (89% adoption across Shopify). She identified that design systems fail when they don't distinguish between structural infrastructure and identity-defining components. Log this in decisions.md as "Component Classification Model."

### Layer 1: Accelerators (~6 types)

Unopinionated structural primitives. They have no visual identity of their own — they're invisible infrastructure that enables layout. The LLM uses these to compose differentiators into page layouts.

```yaml
accelerators:
  page:       # Root canvas board
  container:  # Transparent grouping board with flex layout
  section:    # Container with a title (heading-3 + children)
  header:     # Full-width bar with row layout
  divider:    # 1px horizontal line
  spacer:     # Explicit gap (when layout gap isn't enough)
```

**Accelerators are always defined inline** (type field in the node). They never use the catalog — they have so few properties that catalog lookup adds overhead without benefit.

### Layer 2: Differentiators (~15 types)

Opinionated, visually distinct components. They define the app's visual identity. Each has a catalog entry with sensible defaults — the LLM references the catalog and optionally overrides specific properties.

```yaml
differentiators:
  # Inputs (interactive)
  input-text:           # Standard text input with label + helper
  input-currency:       # Currency input with "$" prefix
  button-primary:       # CTA button (cta-primary bg, text-on-cta)
  button-secondary:     # Outlined button (border, no fill)
  button-ghost:         # Text-only button
  segmented-control:    # Pill-shaped option selector
  stepper:              # Increment/decrement with label
  checkbox:             # Checkbox with label
  select:               # Dropdown trigger

  # Data display
  display-readonly:     # Label + value (no border, read-only indicator)
  badge:                # Small status pill
  stat:                 # Metric card (label + large value + trend)
  card:                 # Elevated content container
  avatar:               # Circular initial/image
  tooltip:              # Icon + message inline
```

**Differentiators are always referenced via catalog.** The LLM writes `"catalog": "input-currency"` and the renderer looks up all defaults. The LLM only specifies what's different from the defaults via `"overrides"`.

### Layer 3: Compositions (NOT cataloged)

How differentiators are arranged on the page. This is where design variety lives. The LLM decides compositions freely — the catalog doesn't constrain arrangement.

```
The SAME catalog produces DIFFERENT compositions:

Composition A (vertical scroll):
  header → tagline → bill section → divider → tip → divider → people → CTA

Composition B (card-based):
  header → [bill card | tip card] side by side → [people card] → CTA

Composition C (wizard):
  header → step indicator → [current section only] → next/back

Composition D (split layout):
  [left: bill + tip] | [right: people + live preview]
```

**The planning agent decides the high-level composition** (which sections, what order). The design agent decides the detailed arrangement (gaps, grouping, emphasis). Neither is constrained by the catalog.

> **WHY this matters for variety:** When someone says "all AI designs look the same," they're seeing the same compositions, not the same components. A button looks like a button everywhere — that's good (consistency). What makes designs feel different is how elements are grouped, weighted, and spaced. That's composition, and it's unconstrained in our system.

---

## 5. Flat Adjacency List Schema

> **WHY (for Claude Code):** We use a flat adjacency list instead of a nested tree because:
> 1. Recursive schemas (`ComponentSpec { children: ComponentSpec[] }`) break Anthropic's strict mode — the API returns 400
> 2. LLMs generate flat structures more reliably than deeply nested ones (Vercel json-render research)
> 3. Flat structures are trivially diffable — property-level changes show up as simple key changes
> 4. Vercel's json-render (13K+ GitHub stars) uses this exact pattern in production
>
> Log this as "ADR: Flat adjacency list over nested tree" in decisions.md.

### TypeScript Schema

```typescript
/**
 * DesignSpec v2 — Flat adjacency list with catalog references.
 *
 * ARCHITECTURE NOTE: Every node in the design is a flat entry in the `nodes` map.
 * Parent-child relationships are expressed via the `parent` field (string ID reference).
 * Sibling ordering is expressed via the `order` field (integer).
 *
 * This avoids recursive schemas that break Anthropic's strict mode.
 * The renderer reconstructs the tree at render time from the flat map.
 */

// ─── Root Spec ─────────────────────────────────────────────
interface DesignSpecV2 {
  screen: string;           // Screen identifier (e.g., "bill-entry")
  width: number;            // Canvas width (e.g., 1440)
  nodes: Record<string, NodeSpec>;  // Flat map: nodeId → node definition
}

// ─── Node Spec (union of catalog-ref and inline-defined) ───
interface NodeSpec {
  // Identity (required)
  parent: string | null;    // Parent node ID, null for root
  order: number;            // Sibling order (0-based)

  // Source — ONE of these two:
  type?: AcceleratorType;   // Inline-defined (accelerators)
  catalog?: string;         // Catalog reference (differentiators)

  // Content (depends on component type)
  label?: string;
  content?: string;
  value?: string | number;
  placeholder?: string;
  helper?: string;
  title?: string;           // For sections
  options?: SegmentedOption[];  // For segmented-control

  // Layout (for containers/sections)
  layout?: LayoutSpec;
  width?: number | 'fill';
  height?: number;

  // Appearance overrides (override catalog defaults)
  overrides?: Record<string, unknown>;

  // Data (for list components)
  items?: Record<string, unknown>[];
}

type AcceleratorType = 'page' | 'container' | 'section' | 'header' | 'divider' | 'spacer';

interface LayoutSpec {
  dir: 'row' | 'column';
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between';
  px?: number;   // Horizontal padding
  py?: number;   // Vertical padding
  pt?: number;   // Individual padding overrides
  pb?: number;
}

interface SegmentedOption {
  label: string;
  selected: boolean;
}
```

### Why this is strict-mode safe

| Constraint | Limit | Our usage | Status |
|-----------|-------|-----------|--------|
| Optional parameters per schema | 24 max | NodeSpec has ~12 optional | Safe |
| Union/nullable types | 16 max | parent (string/null), width (number/'fill') = 2 | Safe |
| Recursive schemas | Not supported | None — flat map, no children[] | Safe |
| Total schema complexity | ~50 properties at 5 levels | ~15 properties at 2 levels | Safe |

### How the renderer reconstructs the tree

```typescript
function buildTree(nodes: Record<string, NodeSpec>): TreeNode {
  // 1. Find root (parent === null)
  const rootId = Object.entries(nodes).find(([_, n]) => n.parent === null)?.[0];

  // 2. Group children by parent
  const childrenOf = new Map<string, Array<{ id: string; node: NodeSpec }>>();
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parent) {
      const siblings = childrenOf.get(node.parent) ?? [];
      siblings.push({ id, node });
      childrenOf.set(node.parent, siblings);
    }
  }

  // 3. Sort each group by order
  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => a.node.order - b.node.order);
  }

  // 4. Recursively build tree
  function build(id: string): TreeNode {
    const node = nodes[id];
    const children = childrenOf.get(id)?.map(c => build(c.id)) ?? [];
    return { id, ...node, children };
  }

  return build(rootId!);
}
```

---

## 6. Component Catalog

> **WHY (for Claude Code):** The catalog exists because:
> 1. Pre-encoding visual quality into components means the LLM doesn't need to know shadow values, border widths, or color opacity — it just says "use this component"
> 2. Each catalog reference replaces 15-20 optional fields with a single string, keeping us under strict mode's 24-optional-parameter limit
> 3. Every successful production system (Vercel json-render, Google A2UI, Airbnb SDUI) uses catalogs — research confirms this is the proven pattern
> 4. You already have `component-catalog.yaml` — this extends it with rendering defaults
>
> Log this as "ADR: Catalog-first component model" in decisions.md.

### Catalog YAML Format

File: `agentforge/spec/component-catalog.yaml`

```yaml
# ─── Input Components ────────────────────────────────────

input-text:
  type: input
  variant: text
  height: 48
  radius: 12
  border_color: border-default
  border_width: 1
  typography: body
  label_typography: label
  label_color: text-secondary
  background: surface-primary
  helper_typography: small
  helper_color: text-secondary
  helper_opacity: 0.7
  min_height: 44               # Touch target minimum
  # Library mapping (for code generation)
  library:
    shadcn: { component: 'Input', import: '@/components/ui/input' }

input-currency:
  extends: input-text           # Inherits all input-text defaults
  variant: currency
  prefix: "$"
  # Everything else inherited from input-text
  # LLM only needs to specify: label, placeholder, and any overrides

# ─── Button Components ───────────────────────────────────

button-primary:
  type: button
  variant: primary
  height: 48
  radius: 12
  background: cta-primary
  text_color: text-on-cta
  text_typography: body
  text_weight: 600
  width: fill
  shadow: none
  border: none
  library:
    shadcn: { component: 'Button', import: '@/components/ui/button', props: { variant: 'default' } }

button-secondary:
  type: button
  variant: secondary
  height: 44
  radius: 12
  background: surface-primary
  text_color: text-primary
  text_typography: body
  text_weight: 500
  border_color: border-default
  border_width: 1
  shadow: none
  library:
    shadcn: { component: 'Button', import: '@/components/ui/button', props: { variant: 'outline' } }

button-ghost:
  type: button
  variant: ghost
  height: 44
  radius: 0
  background: transparent
  text_color: cta-primary
  text_typography: body
  text_weight: 500
  border: none
  shadow: none
  library:
    shadcn: { component: 'Button', import: '@/components/ui/button', props: { variant: 'ghost' } }

# ─── Segmented Control ───────────────────────────────────

segmented-control:
  type: segmented-control
  height: 48
  radius: 24                    # Pill shape
  inner_radius: 20              # Buttons slightly smaller than container
  padding: 4                    # Container padding around buttons
  container_background: surface-elevated
  container_border_color: border-default
  container_border_opacity: 0.5
  selected_bg: cta-primary
  selected_text: text-on-cta
  selected_weight: 600
  unselected_bg: transparent
  unselected_text: text-primary
  unselected_weight: 400
  text_size: 14
  library:
    shadcn: { component: 'Tabs', import: '@/components/ui/tabs' }

# ─── Stepper ─────────────────────────────────────────────

stepper:
  type: stepper
  height: 56
  radius: 12
  background: surface-elevated
  shadow: sm
  button_size: 40
  minus_bg: surface-secondary
  minus_border: border-default
  minus_border_opacity: 0.5
  minus_text_color: text-secondary
  plus_bg: cta-primary
  plus_text_color: text-on-cta
  count_typography: heading-2
  count_color: text-primary
  library:
    shadcn: { component: 'div', note: 'Custom composition — no direct shadcn equivalent' }

# ─── Display (Read-Only) ─────────────────────────────────

display-readonly:
  type: display
  typography: heading-3
  color: text-secondary
  label_typography: label
  label_color: text-secondary
  background: surface-elevated
  border: none
  height: 48
  radius: 8
  padding_x: 16
  library:
    shadcn: { component: 'div', note: 'Display-only, no interactive component needed' }

# ─── Card ────────────────────────────────────────────────

card:
  type: card
  background: surface-primary
  shadow: sm
  radius: 20
  padding: 24
  border: none                  # Cards use shadow, not border
  library:
    shadcn: { component: 'Card', import: '@/components/ui/card' }

# ─── Badge ───────────────────────────────────────────────

badge:
  type: badge
  height: 24
  radius: 8
  padding_x: 8
  padding_y: 2
  text_size: 11
  text_weight: 500
  # Variant-specific styling resolved at render time:
  # success: bg=success@0.15, text=success
  # warning: bg=warning@0.15, text=warning
  # error:   bg=error@0.15,   text=error
  # info:    bg=cta-primary@0.15, text=cta-primary
  library:
    shadcn: { component: 'Badge', import: '@/components/ui/badge' }

# ─── Stat ────────────────────────────────────────────────

stat:
  type: stat
  background: surface-primary
  shadow: sm
  radius: 20
  padding_x: 24
  padding_y: 20
  label_typography: body
  label_color: text-secondary
  value_typography: heading-1
  value_color: text-primary
  trend_typography: small
  trend_up_color: success
  trend_down_color: error
  library:
    shadcn: { component: 'Card', import: '@/components/ui/card', note: 'Stat is a styled Card' }

# ─── Avatar ──────────────────────────────────────────────

avatar:
  type: avatar
  size: 36
  color: cta-primary
  bg_opacity: 0.12
  text_size: 14
  text_weight: 700
  library:
    shadcn: { component: 'Avatar', import: '@/components/ui/avatar' }

# ─── Tooltip ─────────────────────────────────────────────

tooltip:
  type: tooltip
  height: 40
  radius: 8
  shadow: sm
  padding_x: 16
  icon_size: 16
  text_size: 11
  text_color: text-primary
  library:
    shadcn: { component: 'Alert', import: '@/components/ui/alert' }

# ─── Checkbox ────────────────────────────────────────────

checkbox:
  type: checkbox
  box_size: 16
  box_radius: 4
  box_border: border-default
  box_checked_bg: cta-primary
  check_color: text-on-cta
  label_typography: body
  label_color: text-primary
  min_height: 44
  library:
    shadcn: { component: 'Checkbox', import: '@/components/ui/checkbox' }

# ─── Select ──────────────────────────────────────────────

select:
  extends: input-text
  variant: select
  chevron_color: text-secondary
  chevron_size: 12
  library:
    shadcn: { component: 'Select', import: '@/components/ui/select' }
```

### How catalog resolution works

```typescript
function resolveNode(nodeId: string, node: NodeSpec, catalog: CatalogMap): ResolvedNode {
  // Accelerator — no catalog lookup needed
  if (node.type) {
    return { id: nodeId, ...node, resolved: true };
  }

  // Differentiator — merge catalog defaults with overrides
  const catalogEntry = catalog[node.catalog!];
  if (!catalogEntry) {
    console.warn(`Unknown catalog entry: ${node.catalog}`);
    return { id: nodeId, type: 'container', ...node, resolved: false };
  }

  // Handle `extends` chain
  let base = catalogEntry;
  if (catalogEntry.extends) {
    const parent = catalog[catalogEntry.extends];
    base = { ...parent, ...catalogEntry };
    delete base.extends;
  }

  // Merge: catalog defaults ← node overrides
  const resolved = { ...base, ...node };
  if (node.overrides) {
    Object.assign(resolved, node.overrides);
    delete resolved.overrides;
  }

  return { id: nodeId, ...resolved, resolved: true };
}
```

### Dynamic catalog — NOT static

> **WHY (for Claude Code):** The user asked "are we literally keeping static components or can they be dynamically changed?" The answer: catalog entries are static DEFINITIONS but the system is dynamic in three ways. Document this distinction in decisions.md.

1. **Design tokens make the same catalog look completely different across projects.**
   `input-currency` in a warm playful theme (cream bg, teal border) vs a cold corporate theme (white bg, blue border) — same catalog entry, completely different visual result. Changing `design-tokens.yaml` re-skins every component without touching the catalog.

2. **Overrides let the LLM customize any specific instance.**
   The catalog says `input-currency.height = 48`. The LLM says `overrides: { height: 72, typography: heading-1 }` for the bill total input. The bill total gets special treatment; every other currency input uses the default 48px. This is per-node, per-screen customization.

3. **The catalog itself is generated at `agentforge init` time.**
   `generateProjectCatalog(baseCatalog, libraryId, designTokens)` filters the base catalog for the selected library (shadcn), resolves token references, and writes the project-specific catalog. Different projects get different catalogs based on their library choice and token system. Future: the planning agent can add project-specific catalog entries (e.g., `person-row` for SplitEase).

---

## 7. Token System

> **WHY (for Claude Code):** Tokens are the primary source of visual variety across projects. Two apps using the same component catalog but different tokens look completely different. This is the correct architecture — Shopify, Airbnb, and Stripe all achieve visual variety through tokens, not through different component libraries. Log "ADR: Tokens for variety, catalog for consistency" in decisions.md.

### Two-layer token resolution

```
Design Tokens YAML (library-agnostic):
  colors.primitive: { 'warm-cream': '#FFF8E7', 'deep-teal': '#0F6E56' }
  colors.semantic: { 'cta-primary': 'deep-teal', 'surface-primary': 'warm-cream' }

         ↓ resolved at render time

Token Map (semantic name → hex):
  { 'cta-primary': '#0F6E56', 'surface-primary': '#FFF8E7' }

         ↓ used by renderer

Penpot:  shape.fills = [{ fillColor: '#0F6E56', fillOpacity: 1 }]
React:   <Button className="bg-primary text-primary-foreground" />
```

### How tokens enable variety without changing the catalog

```yaml
# Project A: SplitEase (playful-warm)
primitive:
  warm-cream: '#FFF8E7'
  deep-teal: '#0F6E56'
semantic:
  cta-primary: warm-cream    # → warm cream backgrounds, teal CTAs
  surface-primary: warm-cream

# Project B: InvoiceTracker (professional-cold)
primitive:
  slate-900: '#0F172A'
  blue-600: '#2563EB'
semantic:
  cta-primary: blue-600      # → dark backgrounds, blue CTAs
  surface-primary: slate-900
```

Same `button-primary` catalog entry. Same `input-currency`. Completely different visual output. This is how the system produces variety.

---

## 8. Anthropic SDK Integration

> **WHY (for Claude Code):** Structured output is the backbone of reliability. Without it, ~30% of generations produce malformed JSON requiring regex parsing and retries. With strict mode, the model literally cannot produce tokens that violate the schema grammar — this is constrained decoding, not prompt-based. BUT there are hard limits. Document every limit you encounter in decisions.md under "SDK Constraints."

### Tool definition

```typescript
const submitDesignTool = {
  name: 'submit_design',
  description: 'Submit the declarative design specification for rendering',
  input_schema: {
    type: 'object',
    required: ['screen', 'width', 'nodes'],
    properties: {
      screen: { type: 'string', description: 'Screen identifier' },
      width: { type: 'number', description: 'Canvas width in pixels' },
      nodes: {
        type: 'object',
        description: 'Flat map of nodeId → NodeSpec. Keys are camelCase identifiers.',
        additionalProperties: {
          type: 'object',
          required: ['parent', 'order'],
          properties: {
            parent: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Parent node ID, null for root'
            },
            order: { type: 'integer', description: 'Sibling order (0-based)' },
            type: {
              type: 'string',
              enum: ['page', 'container', 'section', 'header', 'divider', 'spacer'],
              description: 'Accelerator type (mutually exclusive with catalog)'
            },
            catalog: {
              type: 'string',
              description: 'Catalog entry ID (e.g., input-currency, button-primary)'
            },
            label: { type: 'string' },
            content: { type: 'string' },
            value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
            placeholder: { type: 'string' },
            helper: { type: 'string' },
            title: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                required: ['label', 'selected'],
                properties: {
                  label: { type: 'string' },
                  selected: { type: 'boolean' }
                }
              }
            },
            layout: {
              type: 'object',
              required: ['dir'],
              properties: {
                dir: { type: 'string', enum: ['row', 'column'] },
                gap: { type: 'integer' },
                align: { type: 'string', enum: ['start', 'center', 'end', 'stretch'] },
                justify: { type: 'string', enum: ['start', 'center', 'end', 'space-between'] },
                px: { type: 'integer' },
                py: { type: 'integer' },
                pt: { type: 'integer' },
                pb: { type: 'integer' }
              }
            },
            width: { anyOf: [{ type: 'number' }, { type: 'string', enum: ['fill'] }] },
            height: { type: 'number' },
            overrides: { type: 'object', description: 'Override catalog defaults' }
          }
        }
      }
    }
  }
};
```

### Usage in design agent

```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4',
  max_tokens: 8000,
  tools: [submitDesignTool],
  tool_choice: { type: 'tool', name: 'submit_design' },
  // strict: true,  // Enable when schema is finalized and tested
  system: designSystemPrompt,  // ~200 lines — composition rules, token usage, catalog list
  messages: [{
    role: 'user',
    content: buildDesignPrompt(planningOutput, designTokens, componentCatalog, prdContext)
  }],
});

// Extract the structured output
const toolUseBlock = response.content.find(b => b.type === 'tool_use');

// Check stop_reason — strict mode can still fail on safety refusals or truncation
if (response.stop_reason === 'end_turn' && toolUseBlock) {
  const designSpec: DesignSpecV2 = toolUseBlock.input;
  // Guaranteed valid JSON matching the schema
  // No regex parsing needed
  // No retry for malformed output
} else if (response.stop_reason === 'max_tokens') {
  // Output was truncated — retry with higher max_tokens or simpler prompt
  console.error('Design spec truncated — increase max_tokens or reduce screen complexity');
}
```

### Reduced prompt (what remains)

The design prompt shrinks from ~2000 lines to ~200 because we remove:
- All Penpot API reference (renderer handles)
- All API anti-patterns and workarounds (renderer handles)
- All code examples (replaced by 2-3 JSON examples)

What stays:
- Composition principles (visual hierarchy, spacing, grouping)
- Token usage rules (which semantic token for which purpose)
- Catalog component list (what's available and when to use each)
- 2-3 DesignSpec JSON examples
- PRD-specific context from the planning agent

---

## 9. Dual Renderer Architecture

> **WHY (for Claude Code):** The user chose Penpot + React/HTML as render targets. This means the same DesignSpec JSON produces both a Penpot design (for visual design review) and React/HTML code (for implementation). The renderer is pluggable — a third target (Flutter, React Native) can be added later. Log "ADR: Dual render targets from single spec" in decisions.md.

### Renderer interface

```typescript
interface Renderer<T> {
  render(spec: DesignSpecV2, tokens: DesignTokensSpec, catalog: CatalogMap): T;
}

// Penpot renderer produces a JavaScript string
class PenpotRenderer implements Renderer<string> {
  render(spec, tokens, catalog): string {
    // 1. Build token map
    // 2. Reconstruct tree from flat adjacency list
    // 3. Walk tree, emit Penpot API calls per node
    // 4. Return valid JS script string
  }
}

// React renderer produces JSX string
class ReactRenderer implements Renderer<string> {
  render(spec, tokens, catalog): string {
    // 1. Reconstruct tree
    // 2. Walk tree, emit JSX per node
    // 3. Use catalog library_mapping for correct shadcn imports
    // 4. Return JSX component string
  }
}
```

### Penpot renderer guarantees

Every Penpot renderer function MUST implement these patterns (the bugs we're permanently fixing):

```typescript
// 1. FLEX DIRECTION WORKAROUND
board.flex.dir = 'column';     // ✓ Use board.flex.dir
// flex.dir = 'column';        // ✗ Silently fails

// 2. LAYOUTCHILD AFTER APPENDCHILD
parent.appendChild(child);
child.layoutChild.horizontalSizing = 'fill';  // ✓ After appendChild

// 3. TEXT GROWTYPE
if (text.length > 20) {
  textNode.resize(parentWidth, fontSize * 2);
  textNode.growType = 'auto-height';  // ✓ Long text wraps
}

// 4. PLUGIN DATA TAGGING
board.setPluginData('ds_type', 'button');
board.setPluginData('ds_name', nodeId);
board.setPluginData('ds_catalog', 'button-primary');
board.setPluginData('ds_token_bg', 'cta-primary');

// 5. ALL COLORS VIA TOKEN MAP
board.fills = [{ fillColor: T.ctaPrimary, fillOpacity: 1 }];  // ✓
```

### React renderer output example

For the same bill-entry spec, the React renderer produces:

```tsx
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';

export function BillEntryScreen() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between h-16 px-[420px] bg-card shadow-sm">
        <span className="text-lg font-bold text-primary">SplitEase</span>
        <span className="text-sm text-muted-foreground">Split bills fairly</span>
      </header>

      {/* Content */}
      <main className="mx-auto w-[600px] py-8">
        {/* Tagline */}
        <div className="space-y-1 pb-4">
          <h2 className="text-2xl font-bold">Split it fair. Split it fast.</h2>
          <p className="text-sm text-muted-foreground">Enter your bill details...</p>
        </div>

        {/* Bill Section */}
        <section className="space-y-4 py-6">
          <h3 className="text-lg font-semibold">The Bill</h3>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Bill Total</label>
            <Input className="h-[72px] text-3xl font-bold border-2 border-primary" placeholder="$ 0.00" />
            <p className="text-xs text-muted-foreground/70">Enter the subtotal before tax and tip</p>
          </div>
          {/* ... more components */}
        </section>

        <Button className="w-full h-14 rounded-full text-lg shadow-lg">Calculate Split</Button>
      </main>
    </div>
  );
}
```

The `library` field in the catalog maps each component to the correct shadcn import and props.

---

## 10. Penpot Plugin Data & Extractor

> **WHY (for Claude Code):** The Plugin Data system is what makes Flow B (human edits) and Flow C (feedback loops) possible. Without it, we'd need a vision model to guess what a human changed — which is 70-85% accurate. With plugin data, extraction is 100% accurate because we're reading metadata, not interpreting screenshots. Log "ADR: Plugin data over vision model for extraction" in decisions.md.

### Renderer tags every shape

When the Penpot renderer creates a shape, it stores metadata:

```javascript
// Renderer output (inside the generated script):
const board = penpot.createBoard();
board.name = 'BillTotalInput';
board.setPluginData('ds_id', 'billTotal');            // DesignSpec node ID
board.setPluginData('ds_catalog', 'input-currency');  // Catalog entry used
board.setPluginData('ds_token_bg', 'surface-primary');// Token reference for background
board.setPluginData('ds_token_border', 'border-focus');
board.setPluginData('ds_overrides', JSON.stringify({ typography: 'heading-1', height: 72 }));
```

### Extractor reads tags + actual values

```javascript
function extractFromPenpot(page) {
  const nodes = {};

  function readShape(shape, parentId) {
    const dsId = shape.getPluginData('ds_id');
    if (!dsId) return; // Skip shapes not created by renderer

    const node = {
      parent: parentId,
      order: shape.parentIndex,
      catalog: shape.getPluginData('ds_catalog') || undefined,
      type: shape.getPluginData('ds_type') || undefined,
    };

    // Read ACTUAL values (may differ from spec if human edited)
    if (shape.fills?.length) {
      node._actualFill = shape.fills[0].fillColor;
    }
    if (shape.type === 'text') {
      node.content = shape.characters; // Actual text content
    }
    if (shape.width) node._actualWidth = shape.width;
    if (shape.height) node._actualHeight = shape.height;

    nodes[dsId] = node;

    // Recurse children
    shape.children?.forEach(child => readShape(child, dsId));
  }

  page.children.forEach(child => readShape(child, null));
  return { screen: page.name, nodes };
}
```

### Change detection via JSON diff

```typescript
import { diff } from 'deep-diff';

const originalSpec = loadFromDisk('designspec-bill-entry.json');
const extractedSpec = extractFromPenpot(penpot.currentPage);
const changes = diff(originalSpec.nodes, extractedSpec.nodes);

// Output:
// [
//   { kind: 'E', path: ['ctaButton', 'label'], lhs: 'Calculate Split', rhs: 'Split Now' },
//   { kind: 'E', path: ['billTotal', '_actualHeight'], lhs: 72, rhs: 96 },
//   { kind: 'N', path: ['newSection'], rhs: { type: 'section', title: 'Tips', ... } }
// ]
```

---

## 11. Validation Layer

> **WHY (for Claude Code):** Even with strict mode guaranteeing schema conformance, the VALUES inside the schema can be wrong. The schema says `catalog` is a string, but it can't enforce that the string is a valid catalog entry. The validation layer catches these content-level errors. Log validation rules in decisions.md under "Validation Rules."

### Validation rules (run after LLM output, before rendering)

```typescript
function validateDesignSpec(spec: DesignSpecV2, catalog: CatalogMap, tokens: TokenMap): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Exactly one root node (parent === null)
  const roots = Object.entries(spec.nodes).filter(([_, n]) => n.parent === null);
  if (roots.length !== 1) errors.push(`Expected 1 root node, found ${roots.length}`);

  // 2. All parent references point to existing nodes
  for (const [id, node] of Object.entries(spec.nodes)) {
    if (node.parent && !spec.nodes[node.parent]) {
      errors.push(`Node "${id}" references non-existent parent "${node.parent}"`);
    }
  }

  // 3. No orphan cycles
  // Walk from every node to root — if any node can't reach root, it's an orphan
  for (const [id, node] of Object.entries(spec.nodes)) {
    let current = id;
    const visited = new Set<string>();
    while (current && spec.nodes[current]?.parent) {
      if (visited.has(current)) { errors.push(`Cycle detected at "${id}"`); break; }
      visited.add(current);
      current = spec.nodes[current].parent!;
    }
  }

  // 4. All catalog references are valid
  for (const [id, node] of Object.entries(spec.nodes)) {
    if (node.catalog && !catalog[node.catalog]) {
      errors.push(`Node "${id}" references unknown catalog entry "${node.catalog}"`);
    }
  }

  // 5. Node has either type OR catalog, not both, not neither
  for (const [id, node] of Object.entries(spec.nodes)) {
    if (node.type && node.catalog) {
      warnings.push(`Node "${id}" has both type and catalog — catalog takes precedence`);
    }
    if (!node.type && !node.catalog) {
      errors.push(`Node "${id}" has neither type nor catalog`);
    }
  }

  // 6. Minimum touch targets (44px)
  for (const [id, node] of Object.entries(spec.nodes)) {
    const isInteractive = node.catalog?.startsWith('button') || node.catalog?.startsWith('input')
      || node.catalog === 'checkbox' || node.catalog === 'segmented-control';
    if (isInteractive) {
      const height = node.overrides?.height ?? node.height ?? catalog[node.catalog!]?.height ?? 0;
      if (height < 44) {
        warnings.push(`Interactive node "${id}" has height ${height}px, minimum is 44px`);
      }
    }
  }

  // 7. No sibling order gaps
  const siblingGroups = new Map<string, number[]>();
  for (const [_, node] of Object.entries(spec.nodes)) {
    if (node.parent) {
      const orders = siblingGroups.get(node.parent) ?? [];
      orders.push(node.order);
      siblingGroups.set(node.parent, orders);
    }
  }
  for (const [parentId, orders] of siblingGroups) {
    orders.sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i) {
        warnings.push(`Children of "${parentId}" have non-sequential order values`);
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

---

## 12. Complete Example: Bill Entry Screen

> **WHY (for Claude Code):** This is the reference implementation. When you're unsure how a component should be represented, refer back to this example. When you're testing the renderer, render this spec and compare against the existing design.js output.

### What the LLM produces (177 lines)

```json
{
  "screen": "bill-entry",
  "width": 1440,
  "nodes": {
    "root": {
      "type": "page",
      "parent": null,
      "order": 0,
      "background": "background-primary",
      "layout": { "dir": "column", "align": "center" }
    },
    "header": {
      "type": "header",
      "parent": "root",
      "order": 0,
      "height": 64,
      "layout": { "dir": "row", "align": "center", "justify": "space-between", "px": 420 }
    },
    "logo": {
      "type": "text",
      "parent": "header",
      "order": 0,
      "content": "SplitEase",
      "typography": "heading-3",
      "color": "cta-primary"
    },
    "navHint": {
      "type": "text",
      "parent": "header",
      "order": 1,
      "content": "Split bills fairly",
      "typography": "body",
      "color": "text-secondary"
    },
    "content": {
      "type": "container",
      "parent": "root",
      "order": 1,
      "width": 600,
      "layout": { "dir": "column", "gap": 0, "py": 32 }
    },
    "tagline": {
      "type": "container",
      "parent": "content",
      "order": 0,
      "layout": { "dir": "column", "gap": 4, "pb": 16 }
    },
    "taglineHeading": {
      "type": "text",
      "parent": "tagline",
      "order": 0,
      "content": "Split it fair. Split it fast.",
      "typography": "heading-2",
      "color": "text-primary"
    },
    "taglineBody": {
      "type": "text",
      "parent": "tagline",
      "order": 1,
      "content": "Enter your bill details below and we will calculate exactly who owes what.",
      "typography": "body",
      "color": "text-secondary"
    },
    "billSection": {
      "type": "section",
      "parent": "content",
      "order": 1,
      "title": "The Bill",
      "layout": { "dir": "column", "gap": 16, "py": 24 }
    },
    "billTotal": {
      "catalog": "input-currency",
      "parent": "billSection",
      "order": 0,
      "label": "Bill Total",
      "placeholder": "0.00",
      "overrides": { "typography": "heading-1", "height": 72, "border_color": "border-focus", "border_width": 2 },
      "helper": "Enter the subtotal before tax and tip"
    },
    "taxAmount": {
      "catalog": "input-currency",
      "parent": "billSection",
      "order": 1,
      "label": "Tax Amount",
      "placeholder": "0.00"
    },
    "tipControl": {
      "catalog": "segmented-control",
      "parent": "billSection",
      "order": 2,
      "options": [
        { "label": "15%", "selected": false },
        { "label": "18%", "selected": true },
        { "label": "20%", "selected": false },
        { "label": "25%", "selected": false },
        { "label": "Custom", "selected": false }
      ]
    },
    "tipDisplay": {
      "catalog": "display-readonly",
      "parent": "billSection",
      "order": 3,
      "label": "Tip Amount",
      "value": "$0.00"
    },
    "grandTotal": {
      "catalog": "display-readonly",
      "parent": "billSection",
      "order": 4,
      "label": "Grand Total",
      "value": "$0.00",
      "overrides": { "typography": "heading-2", "color": "success", "background": "surface-elevated", "border_color": "success", "border_opacity": 0.3 }
    },
    "divider1": { "type": "divider", "parent": "content", "order": 2 },
    "peopleSection": {
      "type": "section",
      "parent": "content",
      "order": 3,
      "title": "The People",
      "layout": { "dir": "column", "gap": 16, "py": 24 }
    },
    "peopleStepper": {
      "catalog": "stepper",
      "parent": "peopleSection",
      "order": 0,
      "label": "Number of People",
      "value": 2,
      "overrides": { "min": 2, "max": 20 }
    },
    "splitToggle": {
      "catalog": "segmented-control",
      "parent": "peopleSection",
      "order": 1,
      "options": [
        { "label": "Equal", "selected": true },
        { "label": "Custom", "selected": false }
      ]
    },
    "person1": {
      "catalog": "input-text",
      "parent": "peopleSection",
      "order": 2,
      "value": "Person 1"
    },
    "person2": {
      "catalog": "input-text",
      "parent": "peopleSection",
      "order": 3,
      "value": "Person 2"
    },
    "divider2": { "type": "divider", "parent": "content", "order": 4 },
    "ctaButton": {
      "catalog": "button-primary",
      "parent": "content",
      "order": 5,
      "label": "Calculate Split",
      "overrides": { "height": 56, "radius": 28, "shadow": "lg" }
    }
  }
}
```

### What the current approach produces for the same screen: 660 lines of JavaScript

The file at `/mnt/user-data/uploads/design.js` (visible in transcript) contains the hand-written Penpot script for this exact screen. It's 660 lines of `penpot.createBoard()`, `addFlexLayout()`, `appendChild()`, `resize()`, and manual token references. Every one of those 660 lines is now produced deterministically by the renderer from the 177-line JSON above.

---

## 13. Decision Framework for Future Design Agents

> **WHY (for Claude Code):** When you encounter design decisions in future work, use this framework instead of asking the user for every decision. Document each decision you make using this framework in decisions.md.

### Framework: When to add a new catalog entry

Ask these three questions (from Josh Cusick, ex-Microsoft Fluent):

1. Is this component used in **3+ places** across screens? → If yes, catalog it
2. Is it **generic enough** for future apps (not just this PRD)? → If yes, catalog it
3. Would it **reduce the LLM's decision space** meaningfully? → If yes, catalog it

If any answer is no → use a **custom composition** (accelerators + existing differentiators)

Example: `person-row` (avatar + name input + amount badge). Used in SplitEase's bill-entry and breakdown screens. Is it generic? Not really — it's domain-specific to bill splitting. Would it reduce LLM decision space? Marginally. **Decision: custom composition, not catalog entry.**

### Framework: When to use overrides vs new catalog entry

```
Override if: The change is cosmetic (bigger, different color, more shadow)
  → { catalog: "input-currency", overrides: { height: 72, typography: "heading-1" } }

New catalog if: The change affects anatomy (different sub-components, different layout)
  → input-search: { extends: input-text, icon: "search", clear_button: true }
```

### Framework: Composition vs catalog for layout patterns

```
Catalog: Components (atoms + molecules)
  → button, input, badge, card, stat

NOT catalog: Layouts (organisms + pages)
  → "header with logo left nav right" — use accelerators
  → "4 stat cards in a grid" — use container with row layout
  → "form with sections and dividers" — use section + divider accelerators

Rationale: Cataloging layouts constrains variety without improving quality.
The LLM is GOOD at deciding "put these 4 stats in a row."
The LLM is BAD at deciding "use borderRadius 12 and shadow sm."
Catalog the things the LLM is bad at. Let it decide the things it's good at.
```

### Framework: When to fall back to non-strict mode

```
Use strict mode for: Standard screens (forms, dashboards, lists, detail views)
  → 90% of screens. Schema handles all components.

Fall back to prompt-based JSON for:
  → Screens with 50+ nodes (grammar compilation might timeout at 180s)
  → Novel component types not in catalog (the LLM needs to describe them freely)
  → Data visualization screens (charts are opaque to the catalog)

When falling back:
  1. Remove strict: true from the tool definition
  2. Keep the same schema in the prompt as a JSON example
  3. Add client-side validation using the validation layer (Section 11)
  4. Log the fallback in telemetry for catalog expansion decisions
```

### Framework: When to add a render target

```
Add a new renderer when:
  1. The target has a different component model (React vs Flutter vs native)
  2. You need it for more than one project
  3. The catalog's library_mapping section has entries for it

DO NOT create a new renderer for:
  → Different CSS frameworks (Tailwind vs CSS Modules) — theme the React renderer
  → Different React libraries (MUI vs Chakra) — update library_mapping in catalog
  → Preview purposes — use the React/HTML renderer with an iframe
```

---

## 14. Implementation Plan

### Integration principle: build separately, plug in when ready

The DesignSpec v2 renderer is developed as a standalone package (`packages/designspec-renderer/`) with ZERO dependencies on the existing pipeline. The current pipeline continues to work unchanged throughout development.

**What does NOT change (Stages 0-3, 5-7):**
```
Stage 0: init wizard           → agentforge.yaml, design-tokens.yaml, etc.
Stage 1: design:generate        → pages.yaml, models.yaml, api.yaml
Stage 2: Research Agent          → research-brief.json
Stage 3: Planning Agent          → planning-spec.json
Stage 5: Feedback Loop           → user commands (approve/review/feedback)
Stage 6: Implementation Agent    → generated .tsx files
Stage 7: Output Files            → src/components/**/*.tsx
```

None of these stages are modified. Their inputs and outputs remain identical.

**What changes (Stage 4 only — and only when the renderer is proven):**
```
CURRENT Stage 4 (penpotDesignWork):
  Planning spec → LLM generates JS script (660 lines)
                → parsePenpotDesignScript() regex parse
                → execute_code → Penpot shapes
                → Screenshot → Evaluator
                → LLM generates fixes.js → execute_code

FUTURE Stage 4 (penpotDesignWork with renderer):
  Planning spec → LLM generates DesignSpec JSON (177 lines, structured output)
                → validateDesignSpec() schema validation
                → renderToScript(spec, tokens) → JS script (deterministic)
                → execute_code → Penpot shapes
                → Screenshot → Evaluator
                → LLM generates JSON patch → apply patch → re-render
```

The change is inside `penpotDesignWork()` in `packages/agents-ux/src/ux-design/ux-penpot-design.ts`. The function signature, inputs (planning spec + design tokens), and outputs (PenpotDesignReady event with nodeIds) remain the same. Downstream stages see no difference.

**Integration is a single code change:**
```typescript
// In packages/agents-ux/src/ux-design/ux-penpot-design.ts

// BEFORE (current):
const llmOutput = await provider.complete(designPrompt, options);
const { script } = parsePenpotDesignScript(llmOutput);

// AFTER (with renderer):
const designSpec = await provider.complete(designPromptV2, {
  ...options,
  tools: [submitDesignTool],
  tool_choice: { type: 'tool', name: 'submit_design' }
});
const spec = designSpec.content.find(b => b.type === 'tool_use')?.input;
const script = renderToScript(spec, projectTokens, componentCatalog);
```

Everything downstream of `script` — `execute_code`, screenshot, evaluator, feedback loop — remains unchanged because the renderer produces the same kind of output: a valid Penpot JavaScript string.

**When to integrate:**

Do NOT integrate until:
1. All renderer unit tests pass (token resolution, typography, shadows, all component types)
2. The bill-entry integration test produces valid JS that can be parsed by `new Function()`
3. The rendered output creates the same visual shapes as the current design.js (manual comparison)
4. At least 2 different screen types have been tested (form + dashboard or breakdown)

Only then: swap the single code block above, run the full pipeline end-to-end, and compare screenshots.

### Phase 1: Foundation (Week 1)

Build the standalone renderer project with the updated v2 architecture.

1. `src/types/design-spec-v2.ts` — DesignSpecV2, NodeSpec, flat adjacency list types
2. `src/catalog/loader.ts` — Load and resolve catalog YAML with `extends` chains
3. `src/catalog/resolver.ts` — Merge catalog defaults with node overrides
4. `src/renderer/tree-builder.ts` — Reconstruct tree from flat adjacency list
5. `src/renderer/token-resolver.ts` — Semantic token → hex (from Step 1 prompt)
6. `src/renderer/typography.ts` — Typography role → font properties
7. `src/renderer/shadows.ts` — Shadow level → values
8. `src/validation/validate.ts` — All 7 validation rules
9. Tests for all of the above using bill-entry fixture

### Phase 2: Penpot Renderer (Week 1-2)

10. `src/renderer/penpot/index.ts` — Main renderToScript()
11. `src/renderer/penpot/components/*.ts` — One file per component type
12. Each renderer emits setPluginData calls for extractor
13. Integration test: render bill-entry spec, verify output is valid JS
14. Comparison test: render output vs existing design.js — same shapes created

### Phase 3: React Renderer (Week 2)

15. `src/renderer/react/index.ts` — Main renderToJSX()
16. `src/renderer/react/components/*.ts` — One file per component type
17. Uses catalog library_mapping for correct shadcn imports
18. Integration test: render bill-entry spec, verify output is valid JSX

### Phase 4: SDK Integration (Week 2-3)

19. Tool definition for Anthropic SDK
20. Design agent updated to use structured output
21. Reduced design prompt (~200 lines)
22. Correction loop produces DesignSpec patches (JSON diff)
23. End-to-end test: PRD → planning → design agent → renderer → Penpot

### Phase 5: Extractor (Week 3-4)

24. Penpot plugin for reading shapes + pluginData
25. Reverse token map (hex → semantic name)
26. JSON diff tool
27. Flow B wiring: human edits → extract → diff → agent receives changes
28. Flow C wiring: agent proposes → human modifies → extract → diff → feedback

---

## 15. Appendix: Research Findings

> **WHY (for Claude Code):** These research findings should be referenced whenever you're making architectural decisions. They're not theoretical — they come from real production systems and published benchmarks. Store this appendix in `docs/research/designspec-research-findings.md`.

### Anthropic structured output limits (verified)

| Constraint | Hard Limit | Source |
|-----------|-----------|--------|
| Optional parameters | 24 total across all strict schemas | Anthropic docs |
| Union/nullable types | 16 total | Anthropic docs |
| Strict tools per request | 20 max | Anthropic docs |
| Recursive schemas | Not supported — 400 error | GitHub issue #1185 |
| Grammar compilation timeout | 180 seconds | Anthropic docs |
| ~50 properties + 5 nesting levels | "Compiled grammar too large" | GitHub issue #1185 |
| Numerical constraints (min/max) | Silently stripped by SDK — moved to descriptions | Anthropic docs |

### Production systems using this pattern

| System | Org | Pattern | Scale |
|--------|-----|---------|-------|
| json-render | Vercel | Flat adjacency list + component catalog | 13K+ GitHub stars |
| A2UI | Google | JSONL messages + client widget catalog | Open protocol |
| Ghost Platform | Airbnb | Server-driven UI + LayoutsPerFormFactor | Millions of screens |
| UIDL | TeleportHQ | JSON UI definition → multi-framework codegen | Published ACM paper |

### Design variety research

| Finding | Source |
|---------|--------|
| LLMs produce "mathematical average of the internet" regardless of approach | AXE-WEB, March 2026 |
| 3 different AI tools given same prompt produced nearly identical designs | Design Bootcamp comparison |
| Google Generative UI preferred 82.8% over markdown, but gap vs human expert is "not wide" | Google Research 2025 |
| Variety comes from tokens + composition, not from more component types | Shopify Polaris experience |
| "Over time, more components results in less productivity" | Josh Cusick, ex-Microsoft Fluent |
| Catalog sweet spot: 50-70 components for enterprise, 30-40 for product | Ant Design, MUI, Polaris data |

---

*End of DesignSpec v2.0 Requirements Document*
