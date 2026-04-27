/**
 * @module @agentforge/agents-ux/design-system-context
 *
 * Shared design system context builder used by both Penpot collaboration
 * sessions and the feedback loop. Extracted from design-collaboration.ts
 * to decouple from any specific design tool.
 */

import type { DesignTokensSpec, BrandSpec, ComponentCatalogSpec } from '@agentforge/core';
import { debugLog } from '@agentforge/core';
import type { UXDesignOutput } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/** Record of a single design change applied via the collaboration session. */
export interface DesignChangeRecord {
  readonly nodeId: string;
  readonly field: string;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly changedAt: number;
}

/** A live collaboration session for iterating on designs. */
export interface DesignCollaborationSession {
  /** Start watching for design changes (polling). */
  startWatching(): void;
  /** Stop watching for design changes. */
  stopWatching(): void;
  /** Apply human feedback to the current design. */
  applyFeedback(feedback: string): Promise<import('@agentforge/core').Result<UXDesignOutput>>;
  /** Get the history of all changes made during this session. */
  getChangeHistory(): readonly DesignChangeRecord[];
}

/** Design system context for feedback-loop-aware modifications. */
export interface DesignSystemContext {
  /** Full design system prompt (typography, spacing, layout rules, component patterns). */
  readonly designSystemPrompt: string;
  /** Color palette with shade scales for darker/lighter navigation. */
  readonly colorPalette: ReadonlyArray<{
    readonly name: string;
    readonly rgb: { readonly r: number; readonly g: number; readonly b: number };
    readonly usage: string;
    readonly family: string;
    readonly shade: string;
  }>;
  /** Shade scales per color family (Tailwind-based) for relative adjustments. */
  readonly shadeScales: Readonly<Record<string, ReadonlyArray<{
    readonly shade: string;
    readonly rgb: { readonly r: number; readonly g: number; readonly b: number };
  }>>>;
  /** Component tree from planning — semantic hierarchy. */
  readonly componentTree: ReadonlyArray<{
    readonly name: string;
    readonly props: readonly string[];
    readonly children: ReadonlyArray<unknown>;
  }>;
  /** Token bindings — component.property → design token path. */
  readonly tokenBindings: Readonly<Record<string, string>>;
  /** Typography scale from the design system. */
  readonly typographyScale: ReadonlyArray<{
    readonly role: string;
    readonly fontSize: number;
    readonly fontWeight: number;
    readonly lineHeight?: number;
  }>;
  /** Spacing scale from the design system. */
  readonly spacingScale: ReadonlyArray<{
    readonly role: string;
    readonly value: number;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

/** Tailwind shade scales matching common design system palettes. */
const SHADE_SCALES: Readonly<Record<string, ReadonlyArray<{ shade: string; rgb: { r: number; g: number; b: number } }>>> = {
  slate: [
    { shade: '50', rgb: { r: 0.97, g: 0.98, b: 0.98 } },
    { shade: '100', rgb: { r: 0.94, g: 0.95, b: 0.96 } },
    { shade: '200', rgb: { r: 0.89, g: 0.90, b: 0.92 } },
    { shade: '300', rgb: { r: 0.80, g: 0.82, b: 0.85 } },
    { shade: '400', rgb: { r: 0.58, g: 0.63, b: 0.69 } },
    { shade: '500', rgb: { r: 0.40, g: 0.45, b: 0.53 } },
    { shade: '600', rgb: { r: 0.28, g: 0.33, b: 0.41 } },
    { shade: '700', rgb: { r: 0.20, g: 0.25, b: 0.33 } },
    { shade: '800', rgb: { r: 0.12, g: 0.16, b: 0.23 } },
    { shade: '900', rgb: { r: 0.06, g: 0.09, b: 0.16 } },
    { shade: '950', rgb: { r: 0.01, g: 0.02, b: 0.06 } },
  ],
  blue: [
    { shade: '400', rgb: { r: 0.38, g: 0.57, b: 0.97 } },
    { shade: '500', rgb: { r: 0.24, g: 0.47, b: 0.96 } },
    { shade: '600', rgb: { r: 0.15, g: 0.39, b: 0.92 } },
    { shade: '700', rgb: { r: 0.11, g: 0.31, b: 0.85 } },
    { shade: '800', rgb: { r: 0.12, g: 0.27, b: 0.70 } },
  ],
  green: [
    { shade: '400', rgb: { r: 0.29, g: 0.78, b: 0.47 } },
    { shade: '500', rgb: { r: 0.13, g: 0.72, b: 0.35 } },
    { shade: '600', rgb: { r: 0.09, g: 0.60, b: 0.29 } },
    { shade: '700', rgb: { r: 0.08, g: 0.49, b: 0.25 } },
  ],
  amber: [
    { shade: '400', rgb: { r: 0.98, g: 0.74, b: 0.18 } },
    { shade: '500', rgb: { r: 0.96, g: 0.62, b: 0.04 } },
    { shade: '600', rgb: { r: 0.85, g: 0.50, b: 0.01 } },
    { shade: '700', rgb: { r: 0.71, g: 0.38, b: 0.01 } },
  ],
  red: [
    { shade: '400', rgb: { r: 0.97, g: 0.44, b: 0.44 } },
    { shade: '500', rgb: { r: 0.94, g: 0.27, b: 0.27 } },
    { shade: '600', rgb: { r: 0.86, g: 0.15, b: 0.15 } },
    { shade: '700', rgb: { r: 0.73, g: 0.11, b: 0.11 } },
  ],
};

const TYPOGRAPHY_SCALE: ReadonlyArray<{ role: string; fontSize: number; fontWeight: number }> = [
  { role: 'metric-value', fontSize: 32, fontWeight: 700 },
  { role: 'page-title', fontSize: 24, fontWeight: 700 },
  { role: 'section-header', fontSize: 18, fontWeight: 600 },
  { role: 'body', fontSize: 14, fontWeight: 400 },
  { role: 'label', fontSize: 12, fontWeight: 400 },
  { role: 'small', fontSize: 12, fontWeight: 500 },
];

const SPACING_SCALE: ReadonlyArray<{ role: string; value: number }> = [
  { role: 'page-padding', value: 32 },
  { role: 'section-gap', value: 24 },
  { role: 'card-gap', value: 16 },
  { role: 'card-padding', value: 20 },
  { role: 'card-internal', value: 8 },
  { role: 'table-cell-padding', value: 12 },
];

// ============================================================================
// Color parsing
// ============================================================================

/** Parse color palette entries from the design system markdown. */
const parseColorPalette = (markdown: string): DesignSystemContext['colorPalette'] => {
  const palette: Array<{
    name: string;
    rgb: { r: number; g: number; b: number };
    usage: string;
    family: string;
    shade: string;
  }> = [];

  const colorRegex = /^- (.+?):\s*`?\{\s*r:\s*([\d.]+),\s*g:\s*([\d.]+),\s*b:\s*([\d.]+)\s*\}`?\s*(?:\((.+?)\))?/gm;
  let match: RegExpExecArray | null;
  while ((match = colorRegex.exec(markdown)) !== null) {
    const usage = match[1].trim();
    const r = parseFloat(match[2]);
    const g = parseFloat(match[3]);
    const b = parseFloat(match[4]);
    const hint = match[5]?.trim() ?? '';

    const shadeMatch = /^(slate|blue|green|amber|red)-(\d+)$/.exec(hint);
    const family = shadeMatch ? shadeMatch[1] : 'custom';
    const shade = shadeMatch ? shadeMatch[2] : '';
    if (!shadeMatch) {
      debugLog(`[design-system-context] parseColorPalette: no shade match for hint "${hint}", defaulting family='custom', shade=''`);
    }

    palette.push({
      name: usage.replace(/\s+/g, '-').toLowerCase(),
      rgb: { r, g, b },
      usage,
      family,
      shade,
    });
  }

  return palette;
};

/** Epsilon for comparing floating-point RGB values. */
const COLOR_EPSILON = 0.03;

/**
 * Match an RGB color to a palette family+shade name using epsilon tolerance.
 * Returns e.g. "slate-800" or null if no match.
 */
export const matchColorToFamily = (
  rgb: { r: number; g: number; b: number },
  shadeScales: DesignSystemContext['shadeScales'],
): string | null => {
  for (const [family, shades] of Object.entries(shadeScales)) {
    for (const s of shades) {
      if (
        Math.abs(rgb.r - s.rgb.r) < COLOR_EPSILON &&
        Math.abs(rgb.g - s.rgb.g) < COLOR_EPSILON &&
        Math.abs(rgb.b - s.rgb.b) < COLOR_EPSILON
      ) {
        return `${family}-${s.shade}`;
      }
    }
  }
  return null;
};

// ============================================================================
// Design system prompt loader — REMOVED
// ============================================================================
// loadDesignSystemPrompt (loading ux-design-system.md, the Figma prompt) was
// dead code: browser-design-work.ts defines its own local function that loads
// ux-penpot-designspec-v2.md instead. Removed in Phase 2.5 of the visual
// diversity plan.


// ============================================================================
// Sizing constraints
// ============================================================================

/**
 * Extract sizing constraints from componentTree defaultValues into prompt lines.
 */
const extractSizingConstraints = (
  tree: readonly { name: string; children: readonly unknown[]; defaultValues?: Readonly<Record<string, number | string>> }[],
): string[] => {
  const lines: string[] = [];
  const walk = (nodes: readonly { name: string; children: readonly unknown[]; defaultValues?: Readonly<Record<string, number | string>> }[]) => {
    for (const node of nodes) {
      if (node.defaultValues && Object.keys(node.defaultValues).length > 0) {
        const vals = Object.entries(node.defaultValues)
          .map(([k, v]) => `${k}=${typeof v === 'number' ? `${v}px` : v}`)
          .join(', ');
        lines.push(`- ${node.name}: ${vals}`);
      }
      if (node.children && Array.isArray(node.children)) {
        walk(node.children as typeof nodes);
      }
    }
  };
  walk(tree);
  return lines;
};

// ============================================================================
// Context builders
// ============================================================================

/**
 * Build a DesignSystemContext from the planning output and design system prompt.
 * When structured `tokens` and `brand` are provided, uses actual project values.
 * Falls back to markdown parsing only when tokens are unavailable.
 */
export const buildDesignSystemContext = (
  planningOutput: {
    componentTree: readonly { name: string; props: readonly string[]; children: readonly unknown[] }[];
    tokenBindings: Record<string, string>;
  },
  designSystemPrompt: string,
  tokens?: DesignTokensSpec,
  brand?: BrandSpec,
): DesignSystemContext => {
  if (tokens) {
    if (!brand) {
      debugLog('[design-system-context] brand spec not provided, using fallback defaults (professional/AA)');
    }
    return buildDesignSystemContextFromSpec(
      tokens,
      brand ?? {
        version: '1.0',
        created_by: 'fallback',
        identity: { tone: 'professional', audience: 'general' },
        illustration_style: { direction: 'minimal', description: 'Simple and clean' },
        motion_principles: { page_transitions: 'fade', interaction_feel: 'snappy', easing: 'ease-in-out', duration_base_ms: 200 },
        accessibility: { wcag_level: 'AA' },
      },
      planningOutput,
    );
  }

  return {
    designSystemPrompt,
    colorPalette: parseColorPalette(designSystemPrompt),
    shadeScales: SHADE_SCALES,
    componentTree: planningOutput.componentTree,
    tokenBindings: planningOutput.tokenBindings,
    typographyScale: TYPOGRAPHY_SCALE,
    spacingScale: SPACING_SCALE,
  };
};

/**
 * Build a DesignSystemContext from structured DesignTokensSpec and BrandSpec.
 * This is the primary path when project-specific design tokens are available.
 */
export const buildDesignSystemContextFromSpec = (
  tokens: DesignTokensSpec,
  brand: BrandSpec,
  planningOutput: {
    componentTree: readonly { name: string; props: readonly string[]; children: readonly unknown[]; defaultValues?: Readonly<Record<string, number | string>> }[];
    tokenBindings: Record<string, string>;
  },
): DesignSystemContext => {
  const colorPalette: DesignSystemContext['colorPalette'] = Object.entries(tokens.colors.primitive).map(([name, hex]) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return {
      name,
      rgb: { r, g, b },
      usage: name,
      family: 'custom',
      shade: '',
    };
  });

  const typographyScale: DesignSystemContext['typographyScale'] = tokens.typography.scale.map((entry) => ({
    role: entry.role,
    fontSize: entry.size,
    fontWeight: entry.weight,
    ...(entry.line_height !== undefined ? { lineHeight: entry.line_height } : {}),
  }));

  const spacingScale: DesignSystemContext['spacingScale'] = tokens.spacing.scale.map((value, i) => ({
    role: `spacing-${i}`,
    value,
  }));

  const promptLines = [
    `# Design System — ${brand.identity.tone}`,
    `Audience: ${brand.identity.audience}`,
    `WCAG: ${brand.accessibility.wcag_level}`,
    '',
    '## Colors',
    ...Object.entries(tokens.colors.primitive).map(([name, hex]) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return `- ${name}: \`{ r: ${r.toFixed(2)}, g: ${g.toFixed(2)}, b: ${b.toFixed(2)} }\``;
    }),
    '',
    '## Semantic Roles',
    '(Maps semantic names used in component tokens to actual color values)',
    ...Object.entries(tokens.colors.semantic).map(([role, ref]) => {
      const resolved = ref.startsWith('#') ? ref : (tokens.colors.primitive[ref] ?? ref);
      return `- ${role} -> ${ref}${ref !== resolved ? ` (${resolved})` : ''}`;
    }),
    '',
    '## Typography',
    ...tokens.typography.scale.map((e) => `- ${e.role}: ${e.size}px/${e.line_height ?? 'auto'}, weight ${e.weight} (${e.family})`),
    '',
    '## Spacing',
    `Unit: ${tokens.spacing.unit}px | Scale: ${tokens.spacing.scale.join(', ')}`,
  ];

  const sizingLines = extractSizingConstraints(planningOutput.componentTree);
  if (sizingLines.length > 0) {
    promptLines.push('', '## Sizing Constraints', '(From planning agent — use these exact values for component dimensions)', ...sizingLines);
  }

  return {
    designSystemPrompt: promptLines.join('\n'),
    colorPalette,
    shadeScales: SHADE_SCALES,
    componentTree: planningOutput.componentTree,
    tokenBindings: planningOutput.tokenBindings,
    typographyScale,
    spacingScale,
  };
};

// ============================================================================
// Component catalog prompt builder
// ============================================================================

/**
 * Build a design-agent-focused prompt section from the component catalog.
 * Groups components by category and renders anatomy, states, spacing, and accessibility.
 */
export const buildComponentCatalogPrompt = (
  catalog: ComponentCatalogSpec | undefined,
): string => {
  if (!catalog) return '';

  const byCategory = new Map<string, string[]>();
  for (const [name, entry] of Object.entries(catalog.components)) {
    const lines = byCategory.get(entry.category) ?? [];

    lines.push(`### ${name}`);
    lines.push(`${entry.description}`);
    lines.push('');

    lines.push('**Anatomy:**');
    for (const slot of entry.anatomy) {
      const opt = slot.optional ? ' *(optional)*' : '';
      const typo = slot.typography_role ? ` [${slot.typography_role}]` : '';
      lines.push(`- **${slot.name}**${opt}: ${slot.contents}${typo}`);
    }
    lines.push('');

    if (entry.variants && Object.keys(entry.variants).length > 0) {
      lines.push('**Variants:**');
      for (const [variant, tokens] of Object.entries(entry.variants)) {
        const parts: string[] = [];
        if (tokens.bg) parts.push(`bg=${tokens.bg}`);
        if (tokens.text) parts.push(`text=${tokens.text}`);
        if (tokens.border) parts.push(`border=${tokens.border}`);
        if (tokens.shadow) parts.push(`shadow=${tokens.shadow}`);
        if (tokens.opacity !== undefined) parts.push(`opacity=${tokens.opacity}`);
        lines.push(`- **${variant}**: ${parts.join(', ')}`);
      }
      lines.push('');
    }

    lines.push('**States:**');
    for (const [state, tokens] of Object.entries(entry.states)) {
      const parts = [`bg=${tokens.bg}`, `text=${tokens.text}`];
      if (tokens.border) parts.push(`border=${tokens.border}`);
      if (tokens.border_width) parts.push(`border-width=${tokens.border_width}px`);
      if (tokens.shadow) parts.push(`shadow=${tokens.shadow}`);
      if (tokens.opacity !== undefined) parts.push(`opacity=${tokens.opacity}`);
      lines.push(`- **${state}**: ${parts.join(', ')}`);
    }
    lines.push('');

    if (entry.token_bindings) {
      lines.push('**Token Bindings:**');
      for (const [prop, value] of Object.entries(entry.token_bindings)) {
        lines.push(`- ${prop}: ${value}`);
      }
      lines.push('');
    }

    if (entry.min_height) {
      lines.push(`**Min Height:** ${entry.min_height}px`);
      lines.push('');
    }

    if (entry.spacing) {
      lines.push(`**Spacing:** padding=${entry.spacing?.padding ?? 'n/a'}, gap=${entry.spacing?.internal_gap ?? 'n/a'}`);
      lines.push('');
    }

    lines.push('**Accessibility:**');
    if (entry.accessibility?.focus_visible) lines.push('- Focus ring: visible');
    for (const label of entry.accessibility?.aria_labels ?? []) {
      lines.push(`- ${label}`);
    }
    if (entry.accessibility?.keyboard_nav) {
      lines.push(`- Keyboard: ${entry.accessibility.keyboard_nav}`);
    }
    lines.push('');

    byCategory.set(entry.category, lines);
  }

  const sections: string[] = ['# Component Catalog\n'];
  const categoryLabels: Record<string, string> = {
    layout: 'Layout',
    data_display: 'Data Display',
    input: 'Input',
    feedback: 'Feedback',
    navigation: 'Navigation',
    composite: 'Composite',
  };

  for (const [cat, label] of Object.entries(categoryLabels)) {
    const lines = byCategory.get(cat);
    if (!lines || lines.length === 0) continue;
    sections.push(`## ${label}\n`);
    sections.push(lines.join('\n'));
  }

  return sections.join('\n');
};

/** Build the system prompt section for design system context. */
export const buildDesignSystemPromptSection = (ctx: DesignSystemContext): string => {
  const sections: string[] = [];

  sections.push('## Color Palette\n');
  for (const color of ctx.colorPalette) {
    const familyInfo = color.family !== 'custom' ? ` (${color.family}-${color.shade})` : '';
    sections.push(`- ${color.usage}: { r: ${color.rgb.r}, g: ${color.rgb.g}, b: ${color.rgb.b} }${familyInfo}`);
  }

  sections.push('\n## Shade Scales (for darker/lighter adjustments)\n');
  sections.push('When the user says "darker", move to the NEXT HIGHER shade number in the same color family.');
  sections.push('When the user says "lighter", move to the NEXT LOWER shade number.');
  sections.push('NEVER leave the palette — always pick the closest available shade.\n');
  for (const [family, shades] of Object.entries(ctx.shadeScales)) {
    sections.push(`### ${family}`);
    for (const s of shades) {
      sections.push(`  ${s.shade}: { r: ${s.rgb.r}, g: ${s.rgb.g}, b: ${s.rgb.b} }`);
    }
  }

  sections.push('\n## Typography Scale\n');
  sections.push('When the user says "bigger text", move to the NEXT LARGER size in this scale.');
  sections.push('When the user says "smaller text", move to the NEXT SMALLER size.\n');
  for (const t of ctx.typographyScale) {
    sections.push(`- ${t.role}: ${t.fontSize}px, weight ${t.fontWeight}`);
  }

  sections.push('\n## Spacing Scale\n');
  sections.push('When the user says "more space", move to the NEXT LARGER value.');
  sections.push('When the user says "less space" or "tighter", move to the NEXT SMALLER value.\n');
  for (const s of ctx.spacingScale) {
    sections.push(`- ${s.role}: ${s.value}px`);
  }

  if (ctx.componentTree.length > 0) {
    sections.push('\n## Component Hierarchy\n');
    for (const comp of ctx.componentTree) {
      const childNames = (comp.children as Array<{ name?: string }>)
        .map(c => c.name ?? '(unnamed)')
        .join(', ');
      sections.push(`- ${comp.name}${childNames ? ` → [${childNames}]` : ''}`);
    }
  }

  if (Object.keys(ctx.tokenBindings).length > 0) {
    sections.push('\n## Token Bindings (component.property → design token)\n');
    for (const [binding, token] of Object.entries(ctx.tokenBindings)) {
      sections.push(`- ${binding} → ${token}`);
    }
  }

  return sections.join('\n');
};
