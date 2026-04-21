/**
 * @module @agentforge/designspec-renderer/types/design-spec-v2
 *
 * DesignSpec v2 — Flat adjacency list with catalog references.
 * Every node in the design is a flat entry in the `nodes` map.
 * Parent-child relationships are expressed via the `parent` field.
 * Sibling ordering is expressed via the `order` field.
 */

/** Layout-only structural primitives. No visual identity. */
export type AcceleratorType = 'page' | 'container' | 'section' | 'header' | 'divider' | 'spacer' | 'text';

/** Layout configuration for containers — flex (default) or CSS grid. */
export interface LayoutSpec {
  readonly dir: 'row' | 'column';
  /** Layout mode. Default: 'flex'. Use 'grid' for multi-column card grids. */
  readonly display?: 'flex' | 'grid';
  /** Number of equal grid columns — only with display: 'grid'. Maps to `grid-template-columns: repeat(N, 1fr)`. */
  readonly columns?: number;
  /** Enable flex wrapping — only with display: 'flex'. Maps to `flex-wrap: wrap`. */
  readonly wrap?: boolean;
  readonly gap?: number;
  readonly align?: 'start' | 'center' | 'end' | 'stretch';
  readonly justify?: 'start' | 'center' | 'end' | 'space-between';
  readonly px?: number;
  readonly py?: number;
  readonly pt?: number;
  readonly pb?: number;
  /** Vertical margin (top + bottom) in px — maps to flex child margin in Penpot / Tailwind on React. */
  readonly my?: number;
  /** Horizontal margin (left + right) in px. */
  readonly mx?: number;
  readonly mt?: number;
  readonly mb?: number;
  readonly ml?: number;
  readonly mr?: number;
}

/** A single option in a segmented control. */
export interface SegmentedOption {
  readonly label: string;
  readonly selected: boolean;
}

/**
 * A single node in the design spec.
 *
 * STRICT MODE BUDGET: 22 of 24 optional fields used.
 * Do NOT add fields without checking Anthropic's 24-optional-field limit.
 * Move new properties to catalog defaults or overrides instead.
 */
export interface NodeSpec {
  /** Parent node ID, null for root. */
  readonly parent: string | null;
  /** Sibling order (0-based). */
  readonly order: number;

  // Source — ONE of these two:
  /** Inline accelerator type. */
  readonly type?: AcceleratorType;
  /** Catalog entry reference. */
  readonly catalog?: string;

  // Content
  /** Display label for the node. */
  readonly label?: string;
  /** Text content for the node. */
  readonly content?: string;
  /** Current value (for inputs, sliders, etc.). */
  readonly value?: string | number;
  /** Placeholder text (for inputs). */
  readonly placeholder?: string;
  /** Helper text displayed below the node. */
  readonly helper?: string;
  /** Title text for the node. */
  readonly title?: string;
  /** Options for segmented controls. */
  readonly options?: readonly SegmentedOption[];

  // Layout
  /** Flex layout configuration. */
  readonly layout?: LayoutSpec;
  /** Width of the node (number in px or 'fill'). */
  readonly width?: number | 'fill';
  /** Height of the node in px. */
  readonly height?: number;

  // Typography & appearance (direct on node for text accelerators)
  /** Typography role reference (e.g., 'heading-1', 'body'). */
  readonly typography?: string;
  /** Text color token reference (e.g., 'text-primary', 'cta-primary'). */
  readonly color?: string;
  /** Font weight override. */
  readonly weight?: number;
  /** Background color token reference. */
  readonly background?: string;
  /** Shadow elevation reference (e.g., 'sm', 'md', 'lg'). */
  readonly shadow?: string;
  /** Border radius in pixels. */
  readonly radius?: number;
  /** Text alignment ('left', 'center', 'right'). */
  readonly textAlign?: 'left' | 'center' | 'right';

  // Catalog overrides
  /** Arbitrary overrides applied on top of catalog defaults. */
  readonly overrides?: Readonly<Record<string, unknown>>;

  // Navigation
  /** Target page ID for navigation. When set, this node acts as a navigation trigger. */
  readonly navigateTo?: string;
  /** Selected state for tabs/segmented items (prototype + Chrome Pass). */
  readonly active?: boolean;

  // Data (for list components)
  /** Data items for list/repeater components. */
  readonly items?: readonly Readonly<Record<string, unknown>>[];
}

/**
 * DesignSpec v2 — the root document.
 * Flat adjacency list: nodeId -> NodeSpec.
 */
export interface DesignSpecV2 {
  /** Screen name identifier. */
  readonly screen: string;
  /** Screen width in pixels. */
  readonly width: number;
  /** Flat map of node ID -> NodeSpec. */
  readonly nodes: Readonly<Record<string, NodeSpec>>;
  /** Screen rendering mode. Determines how PrototypeApp renders this screen (full-page vs overlay). */
  readonly screenType?: 'page' | 'modal' | 'drawer' | 'sheet';
}
