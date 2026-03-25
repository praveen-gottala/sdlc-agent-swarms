/**
 * @module @agentforge/agents-ux/design-collaboration
 *
 * Design collaboration session for live Figma feedback loops.
 * Enables humans to provide feedback on Figma designs, which the agent
 * translates into modification steps via the TalkToFigma MCP bridge.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Result, DesignTokensSpec, BrandSpec, ComponentCatalogSpec } from '@agentforge/core';
import { Ok, Err, DEFAULT_MODEL } from '@agentforge/core';
import type { UXDesignOutput } from './ux-design.js';
import { parseDesignSteps } from './ux-design.js';
import { resolveAndTransformParams } from './param-transforms.js';

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

/** MCP client interface for Figma bridge communication. */
interface MCPClient {
  callTool: (server: string, tool: string, params: Record<string, unknown>) => Promise<Result<unknown>>;
}

/** LLM provider interface for generating modification steps. */
interface LLMProvider {
  complete: (prompt: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<Result<{ content: string }>>;
}

/** A single message in the conversation history. */
interface ConversationMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/** A live collaboration session for iterating on Figma designs. */
export interface DesignCollaborationSession {
  /** Start watching for Figma changes (polling). */
  startWatching(): void;
  /** Stop watching for Figma changes. */
  stopWatching(): void;
  /** Apply human feedback to the current design. */
  applyFeedback(feedback: string): Promise<Result<UXDesignOutput>>;
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
// Design system context builder
// ============================================================================

/** Tailwind shade scales matching the existing design system palette. */
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

/** Typography scale from the design system. */
const TYPOGRAPHY_SCALE: ReadonlyArray<{ role: string; fontSize: number; fontWeight: number }> = [
  { role: 'metric-value', fontSize: 32, fontWeight: 700 },
  { role: 'page-title', fontSize: 24, fontWeight: 700 },
  { role: 'section-header', fontSize: 18, fontWeight: 600 },
  { role: 'body', fontSize: 14, fontWeight: 400 },
  { role: 'label', fontSize: 12, fontWeight: 400 },
  { role: 'small', fontSize: 12, fontWeight: 500 },
];

/** Spacing scale from the design system. */
const SPACING_SCALE: ReadonlyArray<{ role: string; value: number }> = [
  { role: 'page-padding', value: 32 },
  { role: 'section-gap', value: 24 },
  { role: 'card-gap', value: 16 },
  { role: 'card-padding', value: 20 },
  { role: 'card-internal', value: 8 },
  { role: 'table-cell-padding', value: 12 },
];

/** Parse color palette entries from the design system markdown. */
const parseColorPalette = (markdown: string): DesignSystemContext['colorPalette'] => {
  const palette: Array<{
    name: string;
    rgb: { r: number; g: number; b: number };
    usage: string;
    family: string;
    shade: string;
  }> = [];

  // Match lines like: - Page background: `{ r: 0.97, g: 0.97, b: 0.96 }` (warm gray)
  const colorRegex = /^- (.+?):\s*`?\{\s*r:\s*([\d.]+),\s*g:\s*([\d.]+),\s*b:\s*([\d.]+)\s*\}`?\s*(?:\((.+?)\))?/gm;
  let match: RegExpExecArray | null;
  while ((match = colorRegex.exec(markdown)) !== null) {
    const usage = match[1].trim();
    const r = parseFloat(match[2]);
    const g = parseFloat(match[3]);
    const b = parseFloat(match[4]);
    const hint = match[5]?.trim() ?? '';

    // Derive family and shade from hint (e.g., "slate-900", "blue-600")
    const shadeMatch = /^(slate|blue|green|amber|red)-(\d+)$/.exec(hint);
    const family = shadeMatch ? shadeMatch[1] : 'custom';
    const shade = shadeMatch ? shadeMatch[2] : '';

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

/**
 * Load the design system prompt from disk.
 * Uses the same path resolution pattern as ux-design.ts:loadSystemPrompt().
 */
export const loadDesignSystemPrompt = (): string => {
  const promptPath = join(dirname(fileURLToPath(import.meta.url)),
    '..', 'prompts', 'ux-design-system.md');
  return readFileSync(promptPath, 'utf-8');
};

/**
 * Build a DesignSystemContext from the planning output and design system prompt.
 * Captures the full design system knowledge for use in feedback loop modifications.
 *
 * When structured `tokens` and `brand` are provided, uses actual project values
 * instead of regex-parsing the markdown prompt. Falls back to markdown parsing
 * only when tokens are unavailable.
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
  // When structured tokens are available, prefer them over regex-parsing markdown
  if (tokens) {
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
 * Build a DesignSystemContext from structured DesignTokensSpec and BrandSpec
 * instead of parsing from markdown. This is the primary path when project-specific
 * design tokens are available.
 */
export const buildDesignSystemContextFromSpec = (
  tokens: DesignTokensSpec,
  brand: BrandSpec,
  planningOutput: {
    componentTree: readonly { name: string; props: readonly string[]; children: readonly unknown[] }[];
    tokenBindings: Record<string, string>;
  },
): DesignSystemContext => {
  // Convert hex colors to RGB palette entries
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

  // Map typography scale
  const typographyScale: DesignSystemContext['typographyScale'] = tokens.typography.scale.map((entry) => ({
    role: entry.role,
    fontSize: entry.size,
    fontWeight: entry.weight,
    ...(entry.line_height !== undefined ? { lineHeight: entry.line_height } : {}),
  }));

  // Map spacing scale
  const spacingScale: DesignSystemContext['spacingScale'] = tokens.spacing.scale.map((value, i) => ({
    role: `spacing-${i}`,
    value,
  }));

  // Build a design system prompt from the spec
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
      // Resolve primitive reference to hex, or use direct hex value
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

  // Serialize component tokens if present
  if (tokens.components) {
    promptLines.push('');
    promptLines.push('## Component Tokens');
    promptLines.push('When creating any UI element, check these component token bindings first.');
    promptLines.push('Use the exact token references specified — do not choose colors independently.');
    promptLines.push('If a component variant is not defined below, use the closest matching variant.');
    promptLines.push('');

    for (const [componentName, variants] of Object.entries(tokens.components)) {
      if (!variants || typeof variants !== 'object') continue;
      const title = componentName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      promptLines.push(`### ${title}`);
      for (const [variantName, props] of Object.entries(variants as Record<string, Record<string, unknown>>)) {
        if (!props || typeof props !== 'object') continue;
        const propStr = Object.entries(props)
          .map(([k, v]) => `${k}={${String(v)}}`)
          .join(', ');
        promptLines.push(`- ${variantName}: ${propStr}`);
      }
      promptLines.push('');
    }
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
// Component catalog prompt builders
// ============================================================================

/**
 * Build a design-agent-focused prompt section from the component catalog.
 * Groups components by category and renders anatomy, states, spacing, and accessibility.
 * Returns empty string when catalog is undefined (graceful fallback).
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

    // Anatomy
    lines.push('**Anatomy:**');
    for (const slot of entry.anatomy) {
      const opt = slot.optional ? ' *(optional)*' : '';
      const typo = slot.typography_role ? ` [${slot.typography_role}]` : '';
      lines.push(`- **${slot.name}**${opt}: ${slot.contents}${typo}`);
    }
    lines.push('');

    // Variants
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

    // States
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

    // Token Bindings
    if (entry.token_bindings) {
      lines.push('**Token Bindings:**');
      for (const [prop, value] of Object.entries(entry.token_bindings)) {
        lines.push(`- ${prop}: ${value}`);
      }
      lines.push('');
    }

    // Min Height
    if (entry.min_height) {
      lines.push(`**Min Height:** ${entry.min_height}px`);
      lines.push('');
    }

    // Spacing
    lines.push(`**Spacing:** padding=${entry.spacing.padding}, gap=${entry.spacing.internal_gap}`);
    lines.push('');

    // Accessibility
    lines.push('**Accessibility:**');
    if (entry.accessibility.focus_visible) lines.push('- Focus ring: visible');
    for (const label of entry.accessibility.aria_labels) {
      lines.push(`- ${label}`);
    }
    if (entry.accessibility.keyboard_nav) {
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

/**
 * Build an implementation-agent-focused prompt section from the component catalog.
 * Emphasizes library_mapping (filtered to active library when known) and anatomy for JSX structure.
 * Omits visual state details (covered by design-tokens.yaml).
 * Returns empty string when catalog is undefined (graceful fallback).
 */
export const buildComponentCatalogImplPrompt = (
  catalog: ComponentCatalogSpec | undefined,
  libraryId?: string,
): string => {
  if (!catalog) return '';

  const lines: string[] = ['# Component Anatomy Reference\n'];
  lines.push('Use these definitions to structure JSX components and determine correct import paths.\n');

  for (const [name, entry] of Object.entries(catalog.components)) {
    lines.push(`### ${name}`);
    lines.push(`${entry.description} (${entry.category})`);
    lines.push('');

    // Anatomy → JSX structure
    lines.push('**Structure:**');
    for (const slot of entry.anatomy) {
      const opt = slot.optional ? ' *(optional)*' : '';
      lines.push(`- ${slot.name}${opt}: ${slot.contents}`);
    }
    lines.push('');

    // Library mapping (filtered if libraryId provided)
    const mappings = libraryId
      ? Object.entries(entry.library_mapping).filter(([id]) => id === libraryId)
      : Object.entries(entry.library_mapping);

    if (mappings.length > 0) {
      lines.push('**Library:**');
      for (const [libId, mapping] of mappings) {
        lines.push(`- ${libId}: \`${mapping.component_name}\` from \`${mapping.import_path}\``);
        if (mapping.variant_prop) lines.push(`  - variant_prop: \`${mapping.variant_prop}\``);
        if (mapping.size_prop) lines.push(`  - size_prop: \`${mapping.size_prop}\``);
        if (mapping.slot_mapping) {
          for (const [slot, component] of Object.entries(mapping.slot_mapping)) {
            lines.push(`  - ${slot} → \`${component}\``);
          }
        }
      }
      lines.push('');
    }

    // Variants
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

    // Token Bindings
    if (entry.token_bindings) {
      lines.push('**Token Bindings:**');
      for (const [prop, value] of Object.entries(entry.token_bindings)) {
        lines.push(`- ${prop}: ${value}`);
      }
      lines.push('');
    }

    // Spacing
    lines.push(`**Spacing:** padding=${entry.spacing.padding}, gap=${entry.spacing.internal_gap}`);
    lines.push('');
  }

  return lines.join('\n');
};

// ============================================================================
// Design system prompt builder
// ============================================================================

/** Build the system prompt section for design system context. */
const buildDesignSystemPromptSection = (ctx: DesignSystemContext): string => {
  const sections: string[] = [];

  // Color palette
  sections.push('## Color Palette\n');
  for (const color of ctx.colorPalette) {
    const familyInfo = color.family !== 'custom' ? ` (${color.family}-${color.shade})` : '';
    sections.push(`- ${color.usage}: { r: ${color.rgb.r}, g: ${color.rgb.g}, b: ${color.rgb.b} }${familyInfo}`);
  }

  // Shade scales
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

  // Typography scale
  sections.push('\n## Typography Scale\n');
  sections.push('When the user says "bigger text", move to the NEXT LARGER size in this scale.');
  sections.push('When the user says "smaller text", move to the NEXT SMALLER size.\n');
  for (const t of ctx.typographyScale) {
    sections.push(`- ${t.role}: ${t.fontSize}px, weight ${t.fontWeight}`);
  }

  // Spacing scale
  sections.push('\n## Spacing Scale\n');
  sections.push('When the user says "more space", move to the NEXT LARGER value.');
  sections.push('When the user says "less space" or "tighter", move to the NEXT SMALLER value.\n');
  for (const s of ctx.spacingScale) {
    sections.push(`- ${s.role}: ${s.value}px`);
  }

  // Component hierarchy
  if (ctx.componentTree.length > 0) {
    sections.push('\n## Component Hierarchy\n');
    for (const comp of ctx.componentTree) {
      const childNames = (comp.children as Array<{ name?: string }>)
        .map(c => c.name ?? '(unnamed)')
        .join(', ');
      sections.push(`- ${comp.name}${childNames ? ` → [${childNames}]` : ''}`);
    }
  }

  // Token bindings
  if (Object.keys(ctx.tokenBindings).length > 0) {
    sections.push('\n## Token Bindings (component.property → design token)\n');
    for (const [binding, token] of Object.entries(ctx.tokenBindings)) {
      sections.push(`- ${binding} → ${token}`);
    }
  }

  return sections.join('\n');
};

// ============================================================================
// Structured state summary (Change 6)
// ============================================================================

/** Epsilon for comparing floating-point RGB values. */
const COLOR_EPSILON = 0.03;

/**
 * Match an RGB color to a palette family+shade name using epsilon tolerance.
 * Returns e.g. "slate-800" or null if no match.
 */
const matchColorToFamily = (
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

/**
 * Build a concise, structured summary of the current design state
 * instead of dumping raw Figma JSON. Maps node IDs to known component
 * names and annotates colors with palette family names.
 */
const buildStructuredStateDescription = (
  rawDocInfo: Record<string, unknown>,
  figmaNodeIds: Readonly<Record<string, string>>,
  shadeScales: DesignSystemContext['shadeScales'],
): string => {
  // Reverse map: nodeId → component name
  const idToName: Record<string, string> = {};
  for (const [name, id] of Object.entries(figmaNodeIds)) {
    idToName[id] = name;
  }

  const lines: string[] = ['## Current Design State\n'];

  // Recursively walk nodes from the doc info
  const walkNode = (node: Record<string, unknown>, depth: number): void => {
    const nodeId = String(node.id ?? '');
    const nodeName = String(node.name ?? '');
    const componentName = idToName[nodeId];
    const indent = '  '.repeat(depth);
    const label = componentName ? `**${componentName}** (${nodeName})` : nodeName;

    const props: string[] = [];

    // Extract fill color
    const fills = node.fills as Array<Record<string, unknown>> | undefined;
    if (fills && fills.length > 0) {
      const fill = fills[0];
      const color = fill.color as { r?: number; g?: number; b?: number } | undefined;
      if (color && typeof color.r === 'number') {
        const familyName = matchColorToFamily(
          { r: color.r, g: color.g ?? 0, b: color.b ?? 0 },
          shadeScales,
        );
        const colorStr = `r:${(color.r).toFixed(2)} g:${(color.g ?? 0).toFixed(2)} b:${(color.b ?? 0).toFixed(2)}`;
        props.push(familyName ? `fill: ${familyName} (${colorStr})` : `fill: ${colorStr}`);
      }
    }

    // Extract text content
    if (node.characters && typeof node.characters === 'string') {
      const text = node.characters as string;
      props.push(`text: "${text.length > 40 ? text.slice(0, 40) + '...' : text}"`);
    }

    // Extract layout mode
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      props.push(`layout: ${node.layoutMode as string}`);
    }

    // Extract dimensions
    if (typeof node.width === 'number' && typeof node.height === 'number') {
      props.push(`size: ${Math.round(node.width as number)}x${Math.round(node.height as number)}`);
    }

    const propsStr = props.length > 0 ? ` [${props.join(', ')}]` : '';
    lines.push(`${indent}- ${label} (id: ${nodeId})${propsStr}`);

    // Walk children
    const children = node.children as Array<Record<string, unknown>> | undefined;
    if (children) {
      for (const child of children) {
        walkNode(child, depth + 1);
      }
    }
  };

  // Start from document root or currentPage
  const currentPage = rawDocInfo.currentPage as Record<string, unknown> | undefined;
  const root = currentPage ?? rawDocInfo;
  const children = root.children as Array<Record<string, unknown>> | undefined;
  if (children) {
    for (const child of children) {
      walkNode(child, 0);
    }
  } else {
    // Flat doc info — just list what we know from figmaNodeIds
    lines.push('(No tree structure available — using node ID map only)');
    for (const [name, id] of Object.entries(figmaNodeIds)) {
      lines.push(`- ${name}: ${id}`);
    }
  }

  return lines.join('\n');
};

// ============================================================================
// Feedback helper
// ============================================================================

/**
 * Apply human design feedback by generating modification steps via LLM
 * and executing them through TalkToFigma MCP.
 *
 * Accepts optional conversation history for multi-round context (Change 4).
 */
export const applyDesignFeedback = async (
  feedback: string,
  currentDesign: UXDesignOutput,
  mcpClient: MCPClient,
  provider: LLMProvider,
  designSystemContext?: DesignSystemContext,
  conversationHistory?: ConversationMessage[],
): Promise<Result<UXDesignOutput>> => {
  // 1. Read current Figma state
  const docResult = await mcpClient.callTool('figma', 'get_document_info', {});
  const rawDocInfo = docResult.ok ? (docResult.value as Record<string, unknown>) : {};

  // 2. Build structured state description (Change 6) or fall back to JSON
  let stateDescription: string;
  if (designSystemContext && docResult.ok) {
    stateDescription = buildStructuredStateDescription(
      rawDocInfo,
      currentDesign.figmaNodeIds,
      designSystemContext.shadeScales,
    );
  } else {
    stateDescription = JSON.stringify(rawDocInfo);
  }

  // 3. Build system prompt — with or without design system context
  const toolReference = `Available tools (use ONLY these exact names):

READ (inspection):
- get_document_info, get_selection, read_my_design
- get_node_info (params: nodeId) — get full details of a specific node
- get_nodes_info (params: nodeIds[]) — batch node inspection
- scan_text_nodes (params: nodeId) — find all text nodes in a subtree
- scan_nodes_by_types (params: nodeId, types[]) — find child nodes by type (e.g. ["TEXT", "FRAME"])
- get_styles — get all document styles
- get_local_components — list all local components
- get_instance_overrides (params: nodeId?) — get override properties from instance
- export_node_as_image (params: nodeId, format?: "PNG"|"JPG"|"SVG"|"PDF", scale?)

CREATE:
- create_frame (params: x, y, width, height, name?, parentId?, fillColor?, layoutMode?, padding*, itemSpacing?)
- create_rectangle (params: x, y, width, height, name?, parentId?)
- create_text (params: x, y, text, fontSize?, fontWeight?, fontColor?, name?, parentId?)
- create_component_instance (params: componentId or componentKey, x, y, parentId?)

STYLE:
- set_fill_color (params: nodeId, r, g, b, a? — 0-1 floats)
- set_stroke_color (params: nodeId, r, g, b, a?, weight?)
- set_text_content (params: nodeId, text)
- set_multiple_text_contents (params: nodeId, text: [{nodeId, text}])
- set_corner_radius (params: nodeId, radius, corners?: [bool,bool,bool,bool])

LAYOUT:
- set_layout_mode (params: nodeId, layoutMode: "HORIZONTAL"|"VERTICAL"|"NONE", layoutWrap?)
- set_padding (params: nodeId, paddingTop?, paddingRight?, paddingBottom?, paddingLeft?)
- set_item_spacing (params: nodeId, itemSpacing?, counterAxisSpacing?)
- set_axis_align (params: nodeId, primaryAxisAlignItems?, counterAxisAlignItems?)
- set_layout_sizing (params: nodeId, layoutSizingHorizontal?, layoutSizingVertical?)

TRANSFORM:
- resize_node (params: nodeId, width, height)
- move_node (params: nodeId, x, y)
- clone_node (params: nodeId, x?, y?)
- delete_node (params: nodeId)
- delete_multiple_nodes (params: nodeIds[])
- set_instance_overrides (params: sourceInstanceId, targetNodeIds[])
- set_focus (params: nodeId) — select and center viewport on node`;

  let systemPrompt: string;

  if (designSystemContext) {
    const dsSection = buildDesignSystemPromptSection(designSystemContext);
    // Change 5: Improved system prompt with color-family-aware rules
    systemPrompt = `You are a Figma design modification assistant with full knowledge of the project's design system. Given the current design state and human feedback, produce modification steps as JSON.

# Design System

${dsSection}

# Interpretation Rules

- When interpreting relative terms ("darker", "lighter", "bigger", "smaller", "more space"), always use the scales above — never pick arbitrary values.
- Preserve palette harmony: if the user changes one element, ensure related elements still look cohesive.
- Use token bindings to understand which component uses which design token when making changes.

# Color-Aware Modification Rules

- When changing a color, FIRST identify the current color family of the element from the design state above (annotated as e.g. "slate-800").
- Pick the appropriate shade from THAT SAME family (e.g., for "darker header" use slate-900, not an arbitrary dark color like #333).
- When darkening a background, ALSO update text colors on that background for contrast (dark bg → white/light text, light bg → dark text).
- List ALL dependent changes needed for harmony. For example: header bg dark → header title text light, header subtitle text light, header icon colors light.
- When changing an accent color (e.g., "change accent to green"), update ALL elements using the current accent color, not just one.

# Output Format (STRICT)

{
  "steps": [
    {
      "tool": "<tool_name>",
      "params": { "nodeId": "<id>", ... },
      "componentRef": "<optional label>",
      "description": "<what this step does>"
    }
  ],
  "breakpoints": []
}

${toolReference}

IMPORTANT: The "tool" field must be one of the exact names above. Use nodeId values from the provided node IDs map. For colors, use {r, g, b, a} with values 0.0 to 1.0.`;
  } else {
    systemPrompt = `You are a Figma design modification assistant. Given the current design state and human feedback, produce modification steps as JSON.

Output format (STRICT):
{
  "steps": [
    {
      "tool": "<tool_name>",
      "params": { "nodeId": "<id>", ... },
      "componentRef": "<optional label>",
      "description": "<what this step does>"
    }
  ],
  "breakpoints": []
}

${toolReference}

IMPORTANT: The "tool" field must be one of the exact names above. Use nodeId values from the provided node IDs map. For colors, use {r, g, b, a} with values 0.0 to 1.0.`;
  }

  // 4. Build messages with conversation history (Change 4)
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];

  // Include prior conversation rounds for multi-turn context
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Current feedback message
  messages.push({
    role: 'user',
    content: `${stateDescription}\n\nCurrent node IDs:\n${JSON.stringify(currentDesign.figmaNodeIds, null, 2)}\n\nFeedback:\n${feedback}\n\nProduce modification steps as JSON.`,
  });

  // 5. Send to LLM (Change 7: maxTokens 4000 → 8000)
  const completionResult = await provider.complete(
    { system: systemPrompt, messages },
    { model: DEFAULT_MODEL, maxTokens: 8000, temperature: 0 },
  );

  if (!completionResult.ok) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: 'Failed to generate design feedback modifications',
      recoverable: true,
    });
  }

  const llmOutput = (completionResult.value as { content: string }).content;
  const parseResult = parseDesignSteps(llmOutput);
  if (!parseResult.ok) {
    return parseResult as Result<never>;
  }

  // 6. Execute modification steps with ref-resolution + param transforms (Changes 1+2)
  const updatedNodeIds = { ...currentDesign.figmaNodeIds };
  let lastCreatedNodeId = '';
  const stepCount = parseResult.value.steps.length;
  const appliedSteps: string[] = [];

  for (let i = 0; i < stepCount; i++) {
    const step = parseResult.value.steps[i];
    const stepT0 = Date.now();

    const { resolvedParams, postCreateLayoutMode, postCreateSpacing, postCreatePadding } =
      resolveAndTransformParams(step, {
        nodeIds: updatedNodeIds,
        lastCreatedNodeId,
        stepIndex: i,
        stepCount,
      });

    const prefix = step.tool.startsWith('get_') ? 'figma' : 'figma-write';
    const toolResult = await mcpClient.callTool(prefix, step.tool, resolvedParams);
    const stepMs = Date.now() - stepT0;

    // Change 3: Error logging for MCP tool calls
    if (toolResult.ok) {
      const result = toolResult.value as Record<string, unknown>;
      const createdNodeId = String(result.nodeId ?? result.id ?? '');
      if (step.componentRef && createdNodeId) {
        updatedNodeIds[step.componentRef] = createdNodeId;
        lastCreatedNodeId = createdNodeId;
      }
      // eslint-disable-next-line no-console
      console.log(`        [feedback step ${i + 1}/${stepCount}] ${step.tool} → OK (${stepMs}ms) — ${step.description}`);
      appliedSteps.push(`${step.tool}: ${step.description}`);

      // Post-creation: enforce auto-layout with separate calls
      if (step.tool === 'create_frame' && postCreateLayoutMode && createdNodeId) {
        const layoutResult = await mcpClient.callTool('figma-write', 'set_layout_mode', {
          nodeId: createdNodeId,
          layoutMode: postCreateLayoutMode,
        });
        if (layoutResult.ok) {
          // eslint-disable-next-line no-console
          console.log(`          ↳ set_layout_mode ${postCreateLayoutMode} → OK`);
        }
        if (postCreateSpacing !== undefined) {
          await mcpClient.callTool('figma-write', 'set_item_spacing', {
            nodeId: createdNodeId,
            itemSpacing: postCreateSpacing,
          });
        }
        if (postCreatePadding) {
          await mcpClient.callTool('figma-write', 'set_padding', {
            nodeId: createdNodeId,
            ...postCreatePadding,
          });
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`        [feedback step ${i + 1}/${stepCount}] ${step.tool} → ERR: ${toolResult.error.message} (${stepMs}ms)`);
    }
  }

  // Build summary of applied changes for conversation history (Change 4)
  const changeSummary = appliedSteps.length > 0
    ? `Applied ${appliedSteps.length} change(s):\n${appliedSteps.map(s => `- ${s}`).join('\n')}`
    : 'No changes applied.';

  // Append to conversation history if provided
  if (conversationHistory) {
    conversationHistory.push(
      { role: 'user', content: feedback },
      { role: 'assistant', content: changeSummary },
    );
  }

  return Ok({
    ...currentDesign,
    figmaNodeIds: updatedNodeIds,
    breakpoints: parseResult.value.breakpoints.length > 0
      ? parseResult.value.breakpoints
      : currentDesign.breakpoints,
  });
};

// ============================================================================
// Session factory
// ============================================================================

/** Polling interval for watching Figma changes (30 seconds). */
const POLL_INTERVAL_MS = 30_000;

/**
 * Create a design collaboration session for iterating on Figma designs
 * with human feedback. Maintains conversation history across rounds (Change 4).
 */
export const createDesignCollaborationSession = (
  mcpClient: MCPClient,
  provider: LLMProvider,
  initialDesign: UXDesignOutput,
  designSystemContext?: DesignSystemContext,
): DesignCollaborationSession => {
  let currentDesign = initialDesign;
  const changeHistory: DesignChangeRecord[] = [];
  const conversationHistory: ConversationMessage[] = [];
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  return {
    startWatching(): void {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        void mcpClient.callTool('figma', 'get_document_info', {});
      }, POLL_INTERVAL_MS);
    },

    stopWatching(): void {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    },

    async applyFeedback(feedback: string): Promise<Result<UXDesignOutput>> {
      const result = await applyDesignFeedback(
        feedback,
        currentDesign,
        mcpClient,
        provider,
        designSystemContext,
        conversationHistory,
      );
      if (result.ok) {
        // Record changes
        const oldIds = currentDesign.figmaNodeIds;
        const newIds = result.value.figmaNodeIds;
        for (const key of Object.keys(newIds)) {
          if (oldIds[key] !== newIds[key]) {
            changeHistory.push({
              nodeId: newIds[key],
              field: 'figmaNodeId',
              previousValue: oldIds[key] ?? null,
              newValue: newIds[key],
              changedAt: Date.now(),
            });
          }
        }
        currentDesign = result.value;
      }
      return result;
    },

    getChangeHistory(): readonly DesignChangeRecord[] {
      return [...changeHistory];
    },
  };
};
