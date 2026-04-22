/**
 * Data-driven property registry: maps CSS labels to NodeSpec paths
 * with input type metadata for the design inspector.
 *
 * This is the single source of truth for which properties the inspector
 * can display and edit. Adding a new property = adding one entry here.
 */

export type PropertyInputType = 'number' | 'text' | 'select' | 'color';

export interface PropertyDef {
  /** NodeSpec dot-path, e.g. 'layout.gap' */
  path: string;
  /** CSS-style display label, e.g. 'gap' */
  cssLabel: string;
  /** Input widget type */
  type: PropertyInputType;
  /** Options for select inputs */
  options?: { label: string; value: string }[];
  /** Default value when adding the property */
  defaultValue?: string | number;
}

export const PROPERTY_REGISTRY: PropertyDef[] = [
  // --- Layout ---
  {
    path: 'layout.dir',
    cssLabel: 'flex-direction',
    type: 'select',
    options: [
      { label: 'row', value: 'row' },
      { label: 'column', value: 'column' },
    ],
    defaultValue: 'row',
  },
  {
    path: 'layout.gap',
    cssLabel: 'gap',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.justify',
    cssLabel: 'justify-content',
    type: 'select',
    options: [
      { label: 'start', value: 'start' },
      { label: 'center', value: 'center' },
      { label: 'end', value: 'end' },
      { label: 'space-between', value: 'space-between' },
    ],
    defaultValue: 'start',
  },
  {
    path: 'layout.align',
    cssLabel: 'align-items',
    type: 'select',
    options: [
      { label: 'start', value: 'start' },
      { label: 'center', value: 'center' },
      { label: 'end', value: 'end' },
      { label: 'stretch', value: 'stretch' },
    ],
    defaultValue: 'start',
  },
  {
    path: 'layout.px',
    cssLabel: 'padding-x',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.py',
    cssLabel: 'padding-y',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.pt',
    cssLabel: 'padding-top',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.pb',
    cssLabel: 'padding-bottom',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.mx',
    cssLabel: 'margin-x',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.my',
    cssLabel: 'margin-y',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.mt',
    cssLabel: 'margin-top',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.mb',
    cssLabel: 'margin-bottom',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.ml',
    cssLabel: 'margin-left',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'layout.mr',
    cssLabel: 'margin-right',
    type: 'number',
    defaultValue: 0,
  },

  // --- Dimensions ---
  {
    path: 'width',
    cssLabel: 'width',
    type: 'text',
    defaultValue: '',
  },
  {
    path: 'height',
    cssLabel: 'height',
    type: 'number',
    defaultValue: 0,
  },

  // --- Typography ---
  {
    path: 'color',
    cssLabel: 'color',
    type: 'color',
    defaultValue: '',
  },
  {
    path: 'background',
    cssLabel: 'background',
    type: 'color',
    defaultValue: '',
  },
  {
    path: 'typography',
    cssLabel: 'font-family',
    type: 'text',
    defaultValue: '',
  },
  {
    path: 'weight',
    cssLabel: 'font-weight',
    type: 'number',
    defaultValue: 400,
  },
  {
    path: 'textAlign',
    cssLabel: 'text-align',
    type: 'select',
    options: [
      { label: 'left', value: 'left' },
      { label: 'center', value: 'center' },
      { label: 'right', value: 'right' },
    ],
    defaultValue: 'left',
  },

  // --- Appearance ---
  {
    path: 'radius',
    cssLabel: 'border-radius',
    type: 'number',
    defaultValue: 0,
  },
  {
    path: 'shadow',
    cssLabel: 'box-shadow',
    type: 'text',
    defaultValue: '',
  },
];

/** Index by path for O(1) lookups. */
const BY_PATH = new Map<string, PropertyDef>();
for (const def of PROPERTY_REGISTRY) {
  BY_PATH.set(def.path, def);
}

/** Look up a property definition by its NodeSpec path. */
export function getPropertyDef(path: string): PropertyDef | undefined {
  return BY_PATH.get(path);
}

/** Get properties not present on a node (for the "Add property" dropdown). */
export function getAddableProperties(existingPaths: string[]): PropertyDef[] {
  const existing = new Set(existingPaths);
  return PROPERTY_REGISTRY.filter((def) => !existing.has(def.path));
}

/** Read a nested value from a node object by dot-path: 'layout.gap' → node.layout.gap */
export function getNodeValue(node: any, path: string): string | number | undefined {
  if (!node) return undefined;
  const parts = path.split('.');
  let current = node;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current as string | number | undefined;
}
