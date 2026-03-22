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
import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { UXDashboardDesignOutput } from './ux-dashboard-design.js';
import { parseDesignSteps } from './ux-dashboard-design.js';
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
  applyFeedback(feedback: string): Promise<Result<UXDashboardDesignOutput>>;
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
 * Uses the same path resolution pattern as ux-dashboard-design.ts:loadSystemPrompt().
 */
export const loadDesignSystemPrompt = (): string => {
  const promptPath = join(dirname(fileURLToPath(import.meta.url)),
    '..', 'prompts', 'ux-dashboard-design-system.md');
  return readFileSync(promptPath, 'utf-8');
};

/**
 * Build a DesignSystemContext from the planning output and design system prompt.
 * Captures the full design system knowledge for use in feedback loop modifications.
 */
export const buildDesignSystemContext = (
  planningOutput: {
    componentTree: readonly { name: string; props: readonly string[]; children: readonly unknown[] }[];
    tokenBindings: Record<string, string>;
  },
  designSystemPrompt: string,
): DesignSystemContext => {
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
  currentDesign: UXDashboardDesignOutput,
  mcpClient: MCPClient,
  provider: LLMProvider,
  designSystemContext?: DesignSystemContext,
  conversationHistory?: ConversationMessage[],
): Promise<Result<UXDashboardDesignOutput>> => {
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
- get_document_info, get_selection
- create_frame, create_rectangle, create_text, create_ellipse, create_component, create_instance
- set_fill_color (params: nodeId, color: {r,g,b,a} with 0-1 floats)
- set_stroke_color (params: nodeId, color: {r,g,b,a}, weight?)
- set_text_content (params: nodeId, text)
- set_layout_mode (params: nodeId, layoutMode: "HORIZONTAL"|"VERTICAL"|"NONE")
- set_padding (params: nodeId, paddingTop?, paddingRight?, paddingBottom?, paddingLeft?)
- set_item_spacing (params: nodeId, itemSpacing)
- set_axis_align (params: nodeId, primaryAxisAlignItems?, counterAxisAlignItems?)
- set_layout_sizing (params: nodeId, layoutSizingHorizontal?, layoutSizingVertical?)
- resize_node (params: nodeId, width, height)
- move_node (params: nodeId, x, y)
- set_corner_radius (params: nodeId, radius)
- set_opacity (params: nodeId, opacity)`;

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
    { model: 'claude-sonnet-4', maxTokens: 8000, temperature: 0 },
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
  initialDesign: UXDashboardDesignOutput,
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

    async applyFeedback(feedback: string): Promise<Result<UXDashboardDesignOutput>> {
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
