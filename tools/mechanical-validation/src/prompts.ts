import { PromptSpec, VALID_CATALOG, SEMANTIC_TOKENS } from "./types.js";

const tokenNames = Object.keys(SEMANTIC_TOKENS);
const catalogNames = VALID_CATALOG.join(", ");

// ── Base system prompt — teaches the schema, NOT the checks ───────────

export const BASE_SYSTEM = `You are a UI layout generator. You produce DesignSpec JSON — a flat node map representing a flexbox layout tree.

SCHEMA RULES:
- Top-level keys: "screen" (string), "width" (number, always 1440), "nodes" (object)
- Every node has: "parent" (string nodeId or null for root), "order" (number, 0-indexed among siblings)
- Exactly one node must have "parent": null — this is the root

NODE TYPES (set via "type" field):
- "page": root container, always width 1440
- "container": generic flex container
- "section": card-like container (typically has background, shadow, radius)
- "header": top-level header bar
- "text": leaf node with "content", "typography", "color"
- "divider": visual separator with "width"/"height" and "background"

CATALOG NODES (set via "catalog" field, NO "type" field):
Available catalog values: ${catalogNames}
Catalog nodes have "catalog", "label" (for buttons/badges/chips), optionally "value" (for stat).
Catalog nodes are leaf nodes — they never have children.

LAYOUT PROPERTIES (optional "layout" object on container-type nodes):
- "dir": "row" | "column"
- "gap": number (pixels)
- "align": "flex-start" | "center" | "flex-end" | "stretch"
- "justify": "flex-start" | "center" | "flex-end" | "space-between"
- "px": number (horizontal padding)
- "py": number (vertical padding)

DIMENSION PROPERTIES:
- "width": number (pixels) or "fill" (flex: 1)
- "height": number (pixels)
- "radius": number (border-radius)

STYLE PROPERTIES:
- "background": semantic token name
- "border": semantic token name
- "shadow": "sm" | "md" | "lg"

TEXT PROPERTIES (only on type:"text"):
- "content": the text string
- "typography": "heading-1" | "heading-2" | "heading-3" | "body" | "label" | "small"
- "color": semantic token name
- "weight": number (font-weight override)

VALID SEMANTIC TOKENS: ${tokenNames.join(", ")}

CONSTRAINTS:
- Produce 10-20 nodes total
- Every nodeId must be a valid, unique, kebab-case string
- Every "parent" must reference an existing nodeId (except root which is null)
- No orphaned nodes — every non-root node's parent must exist
- Sibling "order" values must be unique within the same parent
- All token references must use names from the valid list above

OUTPUT: Return ONLY the raw JSON object. No markdown fences, no explanation, no preamble.`;

// ── Category-specific prompts ─────────────────────────────────────────

export const PROMPTS: PromptSpec[] = [
  // ── Category 1: Sibling overlap (runs 1-3) ──────────────────────────
  {
    id: "overlap-01",
    category: "sibling-overlap",
    bias: "Many siblings in a row container with small or zero gap",
    systemSuffix: `Generate a UI fragment with a ROW container that holds 5-7 sibling nodes. Use small gap values (0-2px). Some siblings should have explicit pixel widths. The container should have a constrained width. This represents a dense toolbar or tag row.`,
  },
  {
    id: "overlap-02",
    category: "sibling-overlap",
    bias: "Fixed-width siblings whose total exceeds parent width",
    systemSuffix: `Generate a UI fragment with a ROW container of fixed width (e.g., 400px). Place 3-4 children inside it, each with explicit pixel widths. The children represent action buttons or stat cards. Make the layout feel like a real UI section.`,
  },
  {
    id: "overlap-03",
    category: "sibling-overlap",
    bias: "Mixed fixed and fill siblings competing for space",
    systemSuffix: `Generate a UI fragment with a ROW container. Mix children that have "width": "fill" with children that have explicit pixel widths. Include at least one catalog button and one text node. This represents a header bar with a title and action buttons.`,
  },

  // ── Category 2: Child overflow (runs 4-6) ───────────────────────────
  {
    id: "overflow-01",
    category: "child-overflow",
    bias: "Child with explicit width larger than its parent",
    systemSuffix: `Generate a UI fragment where a parent container has a fixed width, and at least one child has an explicit width larger than the parent. The parent should have padding. This represents a card that contains a wide data table or chart area.`,
  },
  {
    id: "overflow-02",
    category: "child-overflow",
    bias: "Deeply nested containers with cumulative padding",
    systemSuffix: `Generate a UI fragment with 4-5 levels of nesting. Each level should add padding (px/py values). The innermost node should have a fill width or explicit width. This represents a settings panel with indented sections.`,
  },
  {
    id: "overflow-03",
    category: "child-overflow",
    bias: "Fill-width child in narrow parent with large padding",
    systemSuffix: `Generate a UI fragment where a container has a narrow fixed width (150-200px) and significant padding (px: 24+). Place fill-width children inside it. This represents a sidebar widget with padded content.`,
  },

  // ── Category 3: Text clipping (runs 7-9) ────────────────────────────
  {
    id: "clipping-01",
    category: "text-clipping",
    bias: "Long text strings in narrow fixed-width containers",
    systemSuffix: `Generate a UI fragment where text nodes contain realistic but long content strings (20-60 characters — full sentences, email addresses, or file paths). Place them in containers with fixed widths of 100-180px. This represents a narrow sidebar with truncated labels.`,
  },
  {
    id: "clipping-02",
    category: "text-clipping",
    bias: "Multiple text nodes side-by-side in a row",
    systemSuffix: `Generate a UI fragment with a ROW container holding 3-4 text nodes. Each text node should contain a multi-word label (e.g., "Monthly Revenue Report"). Give the row a constrained width. This represents a breadcrumb trail or multi-column label row.`,
  },
  {
    id: "clipping-03",
    category: "text-clipping",
    bias: "Text in deeply nested narrow containers",
    systemSuffix: `Generate a UI fragment with 3-4 levels of nesting, each level reducing available width via fixed widths or padding. The leaf text nodes should have body-length content. This represents a comment thread or nested list.`,
  },

  // ── Category 4: Badge/chip oversizing (runs 10-12) ──────────────────
  {
    id: "badge-01",
    category: "badge-oversized",
    bias: "Badges with long label text",
    systemSuffix: `Generate a UI fragment that includes 3-5 badge or chip catalog components. Give them realistically long labels like "Awaiting Verification", "Under Investigation", or "Scheduled Maintenance". Place them inside a row or column container. This represents a status indicator area.`,
  },
  {
    id: "badge-02",
    category: "badge-oversized",
    bias: "Badges in a space-between row",
    systemSuffix: `Generate a UI fragment with a ROW container using "justify": "space-between". Place a text node on one side and badge catalog components on the other. The row should have a fill or wide width. This represents a list item header with status badges.`,
  },
  {
    id: "badge-03",
    category: "badge-oversized",
    bias: "Chip components in a fixed-width container",
    systemSuffix: `Generate a UI fragment with a fixed-width container (250-350px) containing 4-6 chip catalog components in a row with wrapping. Use small gaps. This represents a filter chip bar in a sidebar panel.`,
  },

  // ── Category 5: Zero-height collapse (runs 13-15) ───────────────────
  {
    id: "collapse-01",
    category: "zero-collapse",
    bias: "Containers with no children and no explicit height",
    systemSuffix: `Generate a UI fragment that includes 2-3 empty containers (no children, no explicit height) mixed in with containers that have content. This represents a layout with placeholder sections not yet populated.`,
  },
  {
    id: "collapse-02",
    category: "zero-collapse",
    bias: "Container with only whitespace or empty-string text children",
    systemSuffix: `Generate a UI fragment where some containers contain only text nodes with very short or empty-looking content (e.g., single space, dash, or empty string). Give these containers no explicit height. This represents a form with optional fields showing placeholder values.`,
  },
  {
    id: "collapse-03",
    category: "zero-collapse",
    bias: "Nested empty containers — outer has height, inner does not",
    systemSuffix: `Generate a UI fragment with a section container that has explicit height, containing 2-3 child containers. Some child containers should have children of their own, others should be empty. This represents a dashboard grid with empty widget slots.`,
  },
];
