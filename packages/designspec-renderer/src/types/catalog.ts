/**
 * @module @agentforge/designspec-renderer/types/catalog
 * Catalog types for the flat renderer format.
 */

import type { AcceleratorType, LayoutSpec, SegmentedOption } from './design-spec-v2.js';

/**
 * A flat catalog entry — output of loadCatalogForRenderer().
 * All properties are flat (no nested states/anatomy).
 */
export interface CatalogEntry {
  /** Component type identifier. */
  readonly type: string;
  /** Variant name (e.g., 'primary', 'secondary'). */
  readonly variant?: string;
  /** ID of the catalog entry this one extends. */
  readonly extends?: string;
  /** Height in pixels. */
  readonly height?: number;
  /** Border radius in pixels. */
  readonly radius?: number;
  /** Background color token reference. */
  readonly background?: string;
  /** Text color token reference. */
  readonly text_color?: string;
  /** Typography role reference for text content. */
  readonly text_typography?: string;
  /** Font weight for text content. */
  readonly text_weight?: number;
  /** Border color token reference. */
  readonly border_color?: string;
  /** Border width in pixels. */
  readonly border_width?: number;
  /** Box shadow CSS value. */
  readonly shadow?: string;
  /** Uniform padding in pixels. */
  readonly padding?: number;
  /** Horizontal padding in pixels. */
  readonly padding_x?: number;
  /** Vertical padding in pixels. */
  readonly padding_y?: number;
  /** Minimum height in pixels. */
  readonly min_height?: number;
  /** Width (number in px or 'fill'). */
  readonly width?: number | 'fill';
  /** Library-specific metadata. */
  readonly library?: Readonly<Record<string, unknown>>;
  /** Allow additional flat properties. */
  readonly [key: string]: unknown;
}

/** Map of catalog entry ID -> CatalogEntry. */
export type CatalogMap = Readonly<Record<string, CatalogEntry>>;

/**
 * A fully resolved node — catalog defaults merged with node overrides.
 */
export interface ResolvedNode {
  /** Node identifier. */
  readonly id: string;
  /** Parent node ID, null for root. */
  readonly parent: string | null;
  /** Sibling order (0-based). */
  readonly order: number;
  /** Whether this node has been fully resolved. */
  readonly resolved: boolean;

  // Source
  /** Inline accelerator type. */
  readonly type?: AcceleratorType;
  /** Original catalog entry ID. */
  readonly catalogId?: string;
  /** Resolved catalog entry. */
  readonly catalogEntry?: CatalogEntry;

  // Content
  /** Display label. */
  readonly label?: string;
  /** Text content. */
  readonly content?: string;
  /** Current value. */
  readonly value?: string | number;
  /** Placeholder text. */
  readonly placeholder?: string;
  /** Helper text. */
  readonly helper?: string;
  /** Title text. */
  readonly title?: string;
  /** Options for segmented controls. */
  readonly options?: readonly SegmentedOption[];

  // Layout
  /** Flex layout configuration. */
  readonly layout?: LayoutSpec;
  /** Width (number in px or 'fill'). */
  readonly width?: number | 'fill';
  /** Height in pixels. */
  readonly height?: number;

  // Appearance (resolved from catalog + overrides)
  /** Typography role reference. */
  readonly typography?: string;
  /** Text color token reference. */
  readonly color?: string;
  /** Font weight. */
  readonly weight?: number;
  /** Background color token reference. */
  readonly background?: string;
  /** Border radius in pixels. */
  readonly radius?: number;
  /** Border color token reference. */
  readonly border_color?: string;
  /** Border width in pixels. */
  readonly border_width?: number;
  /** Box shadow CSS value. */
  readonly shadow?: string;
  /** Uniform padding in pixels. */
  readonly padding?: number;
  /** Horizontal padding in pixels. */
  readonly padding_x?: number;
  /** Vertical padding in pixels. */
  readonly padding_y?: number;

  // Overrides passthrough
  /** Arbitrary overrides that were applied. */
  readonly overrides?: Readonly<Record<string, unknown>>;
  /** Data items for list/repeater components. */
  readonly items?: readonly Readonly<Record<string, unknown>>[];
}

/**
 * Tree node — the result of buildTree().
 * Same as NodeSpec but with children array attached.
 */
export interface TreeNode {
  /** Node identifier. */
  readonly id: string;
  /** Parent node ID, null for root. */
  readonly parent: string | null;
  /** Sibling order (0-based). */
  readonly order: number;
  /** Inline accelerator type. */
  readonly type?: AcceleratorType;
  /** Catalog entry reference. */
  readonly catalog?: string;
  /** Display label. */
  readonly label?: string;
  /** Text content. */
  readonly content?: string;
  /** Current value. */
  readonly value?: string | number;
  /** Placeholder text. */
  readonly placeholder?: string;
  /** Helper text. */
  readonly helper?: string;
  /** Title text. */
  readonly title?: string;
  /** Options for segmented controls. */
  readonly options?: readonly SegmentedOption[];
  /** Flex layout configuration. */
  readonly layout?: LayoutSpec;
  /** Width (number in px or 'fill'). */
  readonly width?: number | 'fill';
  /** Height in pixels. */
  readonly height?: number;
  /** Typography role reference. */
  readonly typography?: string;
  /** Text color token reference. */
  readonly color?: string;
  /** Font weight. */
  readonly weight?: number;
  /** Background color token reference. */
  readonly background?: string;
  /** Arbitrary overrides. */
  readonly overrides?: Readonly<Record<string, unknown>>;
  /** Data items for list/repeater components. */
  readonly items?: readonly Readonly<Record<string, unknown>>[];
  /** Child nodes, sorted by order. */
  readonly children: readonly TreeNode[];
}
