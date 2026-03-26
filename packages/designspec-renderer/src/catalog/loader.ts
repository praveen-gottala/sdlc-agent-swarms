/**
 * @module @agentforge/designspec-renderer/catalog/loader
 * Transforms ComponentCatalogSpec (core format) to flat CatalogMap (renderer format).
 * Also provides V2 built-in catalog entries.
 */
import type { CatalogEntry, CatalogMap } from '../types/catalog.js';
import type { RendererTokens } from '../types/tokens.js';
import { V2_BUILTIN_CATALOG } from '../__fixtures__/catalog-entries.js';

/**
 * Raw component catalog spec shape (mirrors @agentforge/core ComponentCatalogSpec).
 * Defined here to avoid cross-package imports.
 */
export interface RawCatalogSpec {
  readonly version: string;
  readonly created_by: string;
  readonly components: Readonly<Record<string, RawCatalogEntry>>;
}

/** Raw catalog entry shape (mirrors ComponentCatalogEntry from core). */
export interface RawCatalogEntry {
  readonly description: string;
  readonly renderer_defaults?: Readonly<Record<string, unknown>>;
  readonly category: string;
  readonly min_height?: number;
  readonly anatomy: readonly {
    name: string;
    contents: string;
    typography_role?: string;
    optional?: boolean;
  }[];
  readonly states: Readonly<
    Record<
      string,
      {
        bg: string;
        text: string;
        border?: string;
        border_width?: number;
        shadow?: string;
        opacity?: number;
      }
    >
  >;
  readonly token_bindings?: Readonly<Record<string, string | number | undefined>>;
  readonly spacing: { padding: string; internal_gap: string };
  readonly library_mapping: Readonly<
    Record<
      string,
      {
        component_name: string;
        import_path: string;
        slot_mapping?: Record<string, string>;
        variant_prop?: string;
        size_prop?: string;
      }
    >
  >;
  readonly accessibility: { focus_visible: boolean; aria_labels: readonly string[] };
}

/**
 * Convert PascalCase to kebab-case.
 * e.g., "NavigationBar" -> "navigation-bar", "Card" -> "card"
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Transform a single raw catalog entry to a flat CatalogEntry.
 */
function transformEntry(name: string, raw: RawCatalogEntry, tokens?: RendererTokens): CatalogEntry {

  if (raw.renderer_defaults) {
    const entry: Record<string, unknown> = { ...raw.renderer_defaults };

    if (raw.library_mapping) {
      const lib: Record<string, unknown> = {};
      for (const [libId, mapping] of Object.entries(raw.library_mapping)) {
        lib[libId] = {
          component: mapping.component_name,
          import: mapping.import_path,
          ...(mapping.slot_mapping ? { slot_mapping: mapping.slot_mapping } : {}),
          ...(mapping.variant_prop ? { variant_prop: mapping.variant_prop } : {}),
          ...(mapping.size_prop ? { size_prop: mapping.size_prop } : {}),
        };
      }
      entry.library = lib;
    }

    return entry as CatalogEntry;
  }

  const entry: Record<string, unknown> = {
    type: toKebabCase(name),
  };

  // states.default -> background, text_color
  if (raw.states?.default) {
    entry.background = raw.states.default.bg;
    entry.text_color = raw.states.default.text;
    if (raw.states.default.border) {
      entry.border_color = raw.states.default.border;
    }
    if (raw.states.default.border_width) {
      entry.border_width = raw.states.default.border_width;
    }
    if (raw.states.default.shadow) {
      entry.shadow = raw.states.default.shadow;
    }
  }

  // token_bindings
  if (raw.token_bindings) {
    const tb = raw.token_bindings;
    if (tb['border-radius'] !== undefined) {
      const raw = tb['border-radius'];
      entry.radius = typeof raw === 'string' && tokens?.borders?.radius?.[raw] !== undefined
        ? tokens.borders.radius[raw]
        : raw;
    }
    if (tb['padding-x'] !== undefined) {
      entry.padding_x = tb['padding-x'];
    }
    if (tb['padding-y'] !== undefined) {
      entry.padding_y = tb['padding-y'];
    }
    if (tb.font !== undefined) {
      entry.text_typography = tb.font;
    }
  }

  // spacing.internal_gap -> gap (store as number)
  if (raw.spacing?.internal_gap) {
    const gap = parseInt(raw.spacing.internal_gap, 10);
    if (!isNaN(gap)) {
      entry.gap = gap;
    }
  }

  // min_height
  if (raw.min_height !== undefined) {
    entry.min_height = raw.min_height;
  }

  // library_mapping -> library (transform to simpler format)
  if (raw.library_mapping) {
    const lib: Record<string, unknown> = {};
    for (const [libId, mapping] of Object.entries(raw.library_mapping)) {
      lib[libId] = {
        component: mapping.component_name,
        import: mapping.import_path,
        ...(mapping.slot_mapping ? { slot_mapping: mapping.slot_mapping } : {}),
        ...(mapping.variant_prop ? { variant_prop: mapping.variant_prop } : {}),
        ...(mapping.size_prop ? { size_prop: mapping.size_prop } : {}),
      };
    }
    entry.library = lib;
  }

  return entry as CatalogEntry;
}

/**
 * Load catalog for renderer.
 * Transforms raw ComponentCatalogSpec format into flat CatalogMap,
 * then merges with V2 built-in entries.
 *
 * Merge order: V2 built-ins are DEFAULTS, project entries OVERRIDE them.
 *
 * @param rawCatalog - Optional raw catalog spec from project. If undefined, only built-ins are used.
 * @param tokens - Optional renderer tokens for resolving token references (e.g., border-radius: 'medium').
 * @returns Flat CatalogMap ready for the renderer.
 */
export function loadCatalogForRenderer(rawCatalog?: RawCatalogSpec, tokens?: RendererTokens): CatalogMap {
  // Start with V2 built-in entries
  const result: Record<string, CatalogEntry> = { ...V2_BUILTIN_CATALOG };

  // Transform and merge project catalog entries
  if (rawCatalog) {
    for (const [name, entry] of Object.entries(rawCatalog.components)) {
      const kebabName = toKebabCase(name);
      result[kebabName] = transformEntry(name, entry, tokens);
    }
  }

  return result;
}
