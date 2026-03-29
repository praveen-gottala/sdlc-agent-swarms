/**
 * @module @agentforge/agents-ux/ux-design/design-fixer
 *
 * Generates and executes Figma fix commands for design issues found
 * by the design evaluator. Part of the visual self-correction loop.
 */

import type { Result, MCPClient, PromptTrace } from '@agentforge/core';
import { Ok, DEFAULT_MODEL, recordPromptTrace, recordPromptTraceResponse } from '@agentforge/core';
import type { LLMProvider, ContentBlock, ToolDefinition } from '@agentforge/providers';
import type { DesignIssue, FixAttemptRecord } from './design-evaluator.js';
import type { FigmaCreationStep } from '../types.js';

/** Tool definition that forces the LLM to return structured fix steps. */
const FIX_STEPS_TOOL: ToolDefinition = {
  name: 'apply_fixes',
  description: 'Apply a list of Figma fix steps to resolve the design issue.',
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', description: 'Figma tool name (e.g., set_fill_color, create_text)' },
            params: { type: 'object', description: 'Tool parameters' },
            componentRef: { type: 'string', description: 'Component reference key for node tracking' },
            description: { type: 'string', description: 'Why this step is needed' },
          },
          required: ['tool', 'params'],
        },
      },
    },
    required: ['steps'],
  },
};

/** Result of executing design fixes. */
export interface FixResult {
  readonly fixed: number;
  readonly failed: number;
  /** Node IDs created during fixes — caller should merge into the nodeMap. */
  readonly createdNodes: Readonly<Record<string, string>>;
  /** Node types of created nodes (FRAME, TEXT, RECTANGLE, etc.). */
  readonly createdNodeTypes: Readonly<Record<string, string>>;
  /** Node IDs deleted during fixes — caller should remove from nodeMap/nodeTypes. */
  readonly deletedNodeIds: readonly string[];
  /** Per-issue fix attempt records for feeding back into evaluator history. */
  readonly fixAttempts: readonly FixAttemptRecord[];
  /** Steps that were successfully executed (write operations only). Used to build a consolidated replay script. */
  readonly successfulSteps: readonly FigmaCreationStep[];
}

/** Options for the design fixer. */
export interface FixerOptions {
  /** Base64-encoded screenshot so the fixer LLM can see the current visual state. */
  readonly screenshotBase64?: string;
  /** Previous fix attempts for this correction loop (helps avoid repeating failed approaches). */
  readonly previousAttempts?: readonly FixAttemptRecord[];
  /** Planning output (tokens, colors, typography, component spec) for design-aware fixes. */
  readonly planningOutput?: Record<string, unknown>;
  /** Design system prompt for consistent styling. */
  readonly designSystemPrompt?: string;
  /** Trace collector for recording LLM call inputs/outputs. */
  readonly traceCollector?: { promptTraces?: PromptTrace[] };
  /** Iteration number for trace stage naming. */
  readonly iterationNumber?: number;
}

/** Tools that the TalkToFigma bridge supports (upstream + AgentForge patch). */
const SUPPORTED_TOOLS = new Set([
  // Creation (upstream)
  'create_frame', 'create_rectangle', 'create_text', 'create_component_instance',
  // Creation (patched)
  'create_ellipse', 'create_line', 'create_vector', 'create_polygon', 'create_star',
  'create_component', 'create_boolean_operation',
  // Styling (upstream)
  'set_fill_color', 'set_stroke_color', 'set_text_content', 'set_multiple_text_contents',
  'set_corner_radius',
  // Styling (patched)
  'set_effects', 'set_gradient_fill', 'set_image_fill', 'set_font_properties',
  'set_opacity', 'set_name', 'set_constraints',
  // Layout
  'set_layout_mode', 'set_padding', 'set_item_spacing', 'set_axis_align', 'set_layout_sizing',
  // Transform
  'resize_node', 'move_node', 'clone_node', 'delete_node', 'delete_multiple_nodes',
  'group_nodes', 'flatten_node',
  // Read (fixer may use these for inspection)
  'get_node_info', 'get_nodes_info', 'scan_nodes_by_types', 'scan_text_nodes',
  // Navigation
  'set_focus',
]);

/** Tools that only work on FRAME nodes (with auto-layout). */
const FRAME_ONLY_TOOLS = new Set([
  'set_layout_mode', 'set_padding', 'set_item_spacing',
  'set_axis_align', 'set_layout_sizing',
]);

/** Tools that only work on TEXT nodes. */
const TEXT_ONLY_TOOLS = new Set(['set_text_content']);

/** Node types that can have children. */
const CONTAINER_TYPES = new Set(['FRAME', 'COMPONENT', 'GROUP']);

/**
 * Validate numeric parameters before sending to MCP.
 * Returns an error message if any parameter is invalid, undefined if OK.
 */
function validateNumericParams(
  tool: string,
  params: Record<string, unknown>,
): string | undefined {
  const isFinitePositive = (v: unknown): boolean =>
    typeof v === 'number' && Number.isFinite(v) && v > 0;
  const isFiniteNumber = (v: unknown): boolean =>
    typeof v === 'number' && Number.isFinite(v);
  const isUnitRange = (v: unknown): boolean =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

  // Dimension params must be positive
  for (const key of ['width', 'height', 'fontSize']) {
    if (key in params && !isFinitePositive(params[key])) {
      return `${key} must be a positive number, got ${JSON.stringify(params[key])}`;
    }
  }

  // Position params must be finite (zero is valid)
  for (const key of ['x', 'y']) {
    if (key in params && !isFiniteNumber(params[key])) {
      return `${key} must be a finite number, got ${JSON.stringify(params[key])}`;
    }
  }

  // Opacity must be 0-1
  if ('opacity' in params && !isUnitRange(params.opacity)) {
    return `opacity must be 0-1, got ${JSON.stringify(params.opacity)}`;
  }

  // Color component validation (inside color object)
  if (params.color && typeof params.color === 'object') {
    const color = params.color as Record<string, unknown>;
    for (const ch of ['r', 'g', 'b']) {
      if (ch in color && !isUnitRange(color[ch])) {
        return `color.${ch} must be 0-1, got ${JSON.stringify(color[ch])}`;
      }
    }
  }

  return undefined;
}

const FIX_GENERATION_SYSTEM_PROMPT = `You are a Figma design fix generator. Given a design issue, the current node map
(with node types), and optionally a screenshot of the current design state,
generate the minimal set of Figma tool calls to fix the issue.

If a screenshot is provided, use it to understand the actual visual state — look at
what is visible, what is missing, what is misaligned, and generate fixes that
address the specific visual problem you can see.

DESIGN COHERENCE:
- If a design system context is provided, ALWAYS use its exact token values for colors,
  typography, and spacing. Never use arbitrary values.
- Match the visual style of existing elements (same font family, same color palette).
- Use the planning spec's component hierarchy to understand parent-child relationships.

CRITICAL RULES:
1. ALWAYS modify EXISTING nodes — do NOT create duplicates of nodes that already exist.
2. Check the node TYPE before choosing a tool:
   - FRAME: supports set_layout_mode, set_padding, set_item_spacing, set_fill_color, resize_node, and can have children
   - RECTANGLE: supports set_fill_color, set_corner_radius, resize_node, move_node. Does NOT support set_layout_mode, set_padding, children.
   - TEXT: supports set_text_content, set_fill_color, move_node, resize_node. Does NOT support set_layout_mode, children.
   - ELLIPSE: supports set_fill_color, set_effects, resize_node, move_node. Use create_ellipse to create circles/ovals.
   - LINE: supports set_stroke_color, move_node. Use create_line for chart axes and separators.
   - VECTOR: supports set_fill_color, set_stroke_color, resize_node. Use create_vector with SVG path data for chart lines.
3. Only FRAME nodes can be parents (parentId) for create_* operations.
4. If a node is a RECTANGLE but needs to be a FRAME (e.g., needs children or auto-layout), you must
   delete it and create a new FRAME in its parent. Use "delete_node" then "create_frame".
5. Colors are objects: { "r": 0.5, "g": 0.5, "b": 0.5, "a": 1 } (0-1 floats).
6. If you create a node, reference it in later steps using "$step:N" (0-based step index).
7. set_padding/set_item_spacing require layoutMode != NONE. Call set_layout_mode FIRST.
8. move_node MUST include both "x" and "y".
9. set_item_spacing uses "itemSpacing" (not "spacing").
10. Keep fixes minimal — 1-5 steps per issue.
11. counterAxisAlignItems ONLY accepts: "MIN"|"MAX"|"CENTER"|"BASELINE". NEVER use "STRETCH".
12. primaryAxisAlignItems ONLY accepts: "MIN"|"MAX"|"CENTER"|"SPACE_BETWEEN".
13. All numeric parameters (width, height, x, y, fontSize) MUST be positive numbers. Never pass null, undefined, or NaN.
14. NEVER add children to ELLIPSE, RECTANGLE, LINE, VECTOR, POLYGON, or STAR nodes. Only FRAME and COMPONENT nodes can contain children.
15. Only emit write operations (create, resize, set_fill, move) as fix steps. Do NOT emit read operations (scan_text_nodes, get_node_info) — they don't change anything.

Available tools:
  Read:   get_node_info (nodeId), scan_nodes_by_types (nodeId, types[]), scan_text_nodes (nodeId)
  Create: create_frame, create_rectangle, create_text, create_ellipse, create_line,
          create_vector (SVG path data), create_polygon, create_star,
          create_component, create_component_instance (componentId/componentKey)
  Style:  set_fill_color, set_stroke_color, set_text_content, set_multiple_text_contents,
          set_corner_radius, set_effects (drop shadow, blur), set_gradient_fill,
          set_font_properties (fontFamily, fontSize, lineHeight), set_opacity, set_name
  Layout: set_layout_mode, set_padding, set_item_spacing, set_corner_radius,
          set_axis_align, set_layout_sizing, set_constraints, resize_node, move_node, clone_node
  Group:  group_nodes (nodeIds[]), create_boolean_operation (UNION/SUBTRACT/INTERSECT/EXCLUDE)
  Delete: delete_node, delete_multiple_nodes (nodeIds[]), flatten_node
  TIP: Use scan_nodes_by_types to find existing child nodes before creating duplicates.
  TIP: Use get_node_info to inspect a node's current properties before modifying it.
  TIP: Use create_vector with vectorPaths [{data: "M0 0 L100 50 L200 20", windingRule: "EVENODD"}] for chart lines.
  TIP: Use set_effects for card shadows: [{type:"DROP_SHADOW",offsetX:0,offsetY:2,radius:4,color:{r:0,g:0,b:0,a:0.1}}]

Use the apply_fixes tool to return your fix steps. Each step needs "tool" (Figma tool name) and "params" (tool parameters).
Optionally include "componentRef" (node reference key) and "description" (why this step is needed).`;

/**
 * Parse LLM-generated fix steps from raw output.
 * Handles: markdown fences, trailing commas, text around JSON,
 * single object instead of array, and multiple JSON blocks.
 */
function parseFixSteps(content: string): FigmaCreationStep[] {
  // 1. Try extracting from markdown fence
  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(content);
  let jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();

  // 2. If no fence, try to find the JSON array in the text
  if (!fenceMatch) {
    const arrayStart = jsonStr.indexOf('[');
    const arrayEnd = jsonStr.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
    }
  }

  // 3. Strip trailing commas before ] or } (common LLM mistake)
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  // 4. Try parsing
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    // If LLM returned a single object instead of array, wrap it
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return [parsed as FigmaCreationStep];
    }
    if (Array.isArray(parsed)) {
      return parsed as FigmaCreationStep[];
    }
    throw new Error('Expected array or object');
  } catch (firstErr) {
    // 5. Last resort: try to find and parse individual JSON objects
    const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const matches = jsonStr.match(objectPattern);
    if (matches && matches.length > 0) {
      const steps: FigmaCreationStep[] = [];
      for (const m of matches) {
        try {
          const obj = JSON.parse(m.replace(/,\s*([}\]])/g, '$1')) as FigmaCreationStep;
          if (obj.tool) steps.push(obj);
        } catch {
          // skip unparseable objects
        }
      }
      if (steps.length > 0) return steps;
    }
    throw firstErr;
  }
}

/**
 * Reorder steps so set_layout_mode comes before set_padding/set_item_spacing for the same node.
 */
function reorderStepsForLayoutDeps(steps: FigmaCreationStep[]): FigmaCreationStep[] {
  const result = [...steps];
  const layoutDepTools = new Set(['set_padding', 'set_item_spacing']);

  for (let i = 0; i < result.length; i++) {
    if (!layoutDepTools.has(result[i].tool)) continue;
    const targetNodeId = result[i].params.nodeId as string | undefined;
    if (!targetNodeId) continue;

    for (let j = i + 1; j < result.length; j++) {
      if (result[j].tool === 'set_layout_mode' && result[j].params.nodeId === targetNodeId) {
        const [layoutStep] = result.splice(j, 1);
        result.splice(i, 0, layoutStep);
        break;
      }
    }
  }
  return result;
}

/**
 * Find the most recent creation step of a given tool type before the current index.
 */
function findLastCreationStep(
  steps: readonly FigmaCreationStep[],
  beforeIdx: number,
  toolName: string,
): number | undefined {
  for (let i = beforeIdx - 1; i >= 0; i--) {
    if (steps[i].tool === toolName) return i;
  }
  return undefined;
}

/**
 * Check if a tool is compatible with a node type.
 * Returns an error message if incompatible, or undefined if OK.
 */
function checkToolCompatibility(
  tool: string,
  nodeId: string,
  nodeTypes: Readonly<Record<string, string>>,
  nodeMap: Readonly<Record<string, string>>,
): string | undefined {
  // Find the componentRef for this nodeId
  const ref = Object.entries(nodeMap).find(([, id]) => id === nodeId)?.[0];
  if (!ref) return undefined; // unknown node — let Figma handle it

  const nodeType = nodeTypes[ref];
  if (!nodeType) return undefined; // type unknown — let it through

  if (FRAME_ONLY_TOOLS.has(tool) && nodeType !== 'FRAME' && nodeType !== 'COMPONENT') {
    return `${tool} requires FRAME but "${ref}" is ${nodeType}`;
  }

  if (TEXT_ONLY_TOOLS.has(tool) && nodeType !== 'TEXT') {
    return `${tool} requires TEXT but "${ref}" is ${nodeType}`;
  }

  return undefined;
}

/**
 * Check if a nodeId can be used as parentId for create_* operations.
 */
function checkParentCompatibility(
  parentId: string,
  nodeTypes: Readonly<Record<string, string>>,
  nodeMap: Readonly<Record<string, string>>,
): string | undefined {
  const ref = Object.entries(nodeMap).find(([, id]) => id === parentId)?.[0];
  if (!ref) return undefined;

  const nodeType = nodeTypes[ref];
  if (!nodeType) return undefined;

  if (!CONTAINER_TYPES.has(nodeType)) {
    return `Cannot add children to "${ref}" (${nodeType}) — only FRAME nodes support children`;
  }

  return undefined;
}

/**
 * Execute design fixes for issues found by the evaluator.
 * Filters to critical and major issues only.
 *
 * @param issues - Issues from the design evaluator
 * @param mcpClient - MCP client connected to Figma bridge
 * @param nodeMap - Map of componentRef to Figma node IDs
 * @param provider - LLM provider for generating fix commands
 * @param nodeTypes - Map of componentRef to Figma node types (FRAME, RECTANGLE, TEXT, etc.)
 * @param options - Optional screenshot and previous attempt history
 * @returns Count of fixed and failed issues, plus per-issue attempt records
 */
export async function executeDesignFixes(
  issues: readonly DesignIssue[],
  mcpClient: MCPClient,
  nodeMap: Readonly<Record<string, string>>,
  provider: LLMProvider,
  nodeTypes?: Readonly<Record<string, string>>,
  options?: FixerOptions,
): Promise<Result<FixResult>> {
  const types = nodeTypes ?? {};

  // Filter to actionable issues
  const actionableIssues = issues.filter(
    (issue) => issue.severity === 'critical' || issue.severity === 'major',
  );

  if (actionableIssues.length === 0) {
    return Ok({ fixed: 0, failed: 0, createdNodes: {}, createdNodeTypes: {}, deletedNodeIds: [], fixAttempts: [], successfulSteps: [] });
  }

  let fixed = 0;
  let failed = 0;
  const allCreatedNodes: Record<string, string> = {};
  const allCreatedNodeTypes: Record<string, string> = {};
  const allDeletedNodeIds: string[] = [];
  const allFixAttempts: FixAttemptRecord[] = [];
  const allSuccessfulSteps: FigmaCreationStep[] = [];

  for (const issue of actionableIssues) {
    try {
      // Generate fix steps via LLM — include node types in the prompt
      const nodeInfo = Object.entries(nodeMap).map(([name, id]) => {
        const type = types[name] ?? 'UNKNOWN';
        return `  "${name}": "${id}" (${type})`;
      }).join('\n');

      // Build message content — include screenshot if available
      const messageContent: ContentBlock[] = [];

      if (options?.screenshotBase64) {
        messageContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: options.screenshotBase64,
          },
        });
      }

      // Build previous attempts context for this component
      let previousContext = '';
      if (options?.previousAttempts && options.previousAttempts.length > 0) {
        const relevant = options.previousAttempts.filter(
          (a) => a.issueComponent === issue.component,
        );
        if (relevant.length > 0) {
          previousContext = `\n\nPREVIOUS FIX ATTEMPTS for "${issue.component}" (these did NOT solve the problem — try a DIFFERENT approach):
${relevant.map((a) => `  - "${a.issueDescription}": ${a.stepsSucceeded}/${a.stepsAttempted} steps succeeded, ${a.stepsSkipped} skipped`).join('\n')}`;
        }
      }

      // Build design context section if available
      let designContext = '';
      if (options?.planningOutput) {
        const spec = options.planningOutput;
        // Extract the most useful parts: tokens (colors, typography, spacing) and component tree
        const tokens = spec.tokens ?? spec.designTokens;
        const components = spec.components ?? spec.componentTree;
        if (tokens) {
          designContext += `\n\nDESIGN TOKENS (use these exact values — do NOT use arbitrary colors/sizes):\n${JSON.stringify(tokens, null, 2)}`;
        }
        if (components) {
          designContext += `\n\nCOMPONENT SPEC:\n${JSON.stringify(components, null, 2)}`;
        }
      }

      messageContent.push({
        type: 'text',
        text: `Issue to fix:
  Component: ${issue.component}
  Severity: ${issue.severity}
  Problem: ${issue.description}
  Suggested fix: ${issue.fix}

Existing Figma nodes (name: "nodeId" (TYPE)):
${nodeInfo}
${designContext}${previousContext}

Generate the minimal fix steps using the apply_fixes tool. Check node types before choosing tools.${options?.screenshotBase64 ? ' Use the screenshot above to understand the current visual state.' : ''}`,
      });

      const fixPromptObj = {
        system: FIX_GENERATION_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user' as const,
            content: messageContent,
          },
        ],
        tools: [FIX_STEPS_TOOL],
      };

      // Record fix prompt trace
      const iterNum = options?.iterationNumber ?? 0;
      const fixStageName = `fix-${iterNum}-${issue.component}`;
      if (options?.traceCollector) {
        const textContent = messageContent.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n');
        recordPromptTrace(options.traceCollector, fixStageName,
          { system: FIX_GENERATION_SYSTEM_PROMPT, messages: [{ role: 'user', content: textContent }] },
          { model: DEFAULT_MODEL, maxTokens: 2048 });
      }

      const fixResult = await provider.complete(fixPromptObj, {
        model: DEFAULT_MODEL,
        maxTokens: 2048,
        temperature: 0,
      });

      if (!fixResult.ok) {
        // eslint-disable-next-line no-console
        console.warn(`        [fix] Failed to generate fix for ${issue.component}: LLM error`);
        failed++;
        continue;
      }

      // Record fix response trace
      if (options?.traceCollector) {
        recordPromptTraceResponse(options.traceCollector, fixStageName, {
          content: fixResult.value.content,
          toolCalls: fixResult.value.toolCalls?.map(tc => ({ name: tc.name, args: tc.args })),
          usage: fixResult.value.usage ? { inputTokens: fixResult.value.usage.inputTokens, outputTokens: fixResult.value.usage.outputTokens, cacheReadTokens: fixResult.value.usage.cacheReadTokens, cacheWriteTokens: fixResult.value.usage.cacheWriteTokens } : undefined,
          cost: fixResult.value.cost ? { inputCostUsd: fixResult.value.cost.inputCostUsd, outputCostUsd: fixResult.value.cost.outputCostUsd, totalCostUsd: fixResult.value.cost.totalCostUsd } : undefined,
          latencyMs: fixResult.value.latencyMs,
          finishReason: fixResult.value.finishReason,
          hasVisionInput: !!options?.screenshotBase64,
        });
      }

      // Extract fix steps — prefer structured tool_use, fall back to text parsing
      let steps: FigmaCreationStep[];
      const toolCall = fixResult.value.toolCalls?.find((tc) => tc.name === 'apply_fixes');
      if (toolCall) {
        // Structured output via tool use — guaranteed valid JSON
        const args = toolCall.args as { steps?: FigmaCreationStep[] };
        steps = args.steps ?? [];
      } else {
        // Fallback: parse from text content (legacy behavior)
        const content = fixResult.value.content;
        try {
          steps = parseFixSteps(content);
        } catch (parseErr) {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] Failed to parse fix steps for ${issue.component}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
          failed++;
          continue;
        }
      }

      if (!Array.isArray(steps) || steps.length === 0) {
        failed++;
        continue;
      }

      // Enforce step limit — LLM often generates 20+ steps, cap at 10
      const MAX_STEPS_PER_ISSUE = 10;
      if (steps.length > MAX_STEPS_PER_ISSUE) {
        steps = steps.slice(0, MAX_STEPS_PER_ISSUE);
      }

      // Reorder steps: set_layout_mode must come before set_padding/set_item_spacing
      steps = reorderStepsForLayoutDeps(steps);

      // Execute fix steps — track created node IDs for $step:N references
      let stepSucceeded = false;
      let hasBrokenDependency = false;
      const createdNodeIds: Record<number, string> = {};
      let issueStepsAttempted = 0;
      let issueStepsSucceeded = 0;
      let issueStepsFailed = 0;
      let issueStepsSkipped = 0;

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];

        issueStepsAttempted++;

        // If a dependency failed, skip all steps that reference it
        if (hasBrokenDependency) {
          const hasStepRef = Object.values(step.params).some(
            (v) => typeof v === 'string' && /^\$step:\d+$/.test(v),
          );
          if (hasStepRef) {
            issueStepsSkipped++;
            continue; // silently skip — dependency chain is broken
          }
        }

        // Resolve ref: and $step:N placeholders in params
        const resolvedParams: Record<string, unknown> = {};
        let hasUnresolvedRef = false;

        for (const [key, value] of Object.entries(step.params)) {
          if (typeof value === 'string') {
            const stepRefMatch = /^\$step:(\d+)$/.exec(value);
            if (stepRefMatch) {
              const refIdx = parseInt(stepRefMatch[1], 10);
              if (createdNodeIds[refIdx]) {
                resolvedParams[key] = createdNodeIds[refIdx];
              } else {
                hasUnresolvedRef = true;
                hasBrokenDependency = true;
                break;
              }
            } else {
              const refMatch = /^ref:(.+)$/.exec(value);
              if (refMatch && nodeMap[refMatch[1]]) {
                resolvedParams[key] = nodeMap[refMatch[1]];
              } else {
                resolvedParams[key] = value;
              }
            }
          } else {
            resolvedParams[key] = value;
          }
        }

        if (hasUnresolvedRef) {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: broken dependency chain`);
          continue;
        }

        // Auto-resolve nodeId from componentRef for mutation tools
        if (!resolvedParams.nodeId && !step.tool.startsWith('create_') && step.tool !== 'delete_node') {
          const ref = step.componentRef;
          if (ref && nodeMap[ref]) {
            resolvedParams.nodeId = nodeMap[ref];
          }
        }

        // Validate set_text_content — auto-link to preceding create_text if nodeId missing
        if (step.tool === 'set_text_content' && !resolvedParams.nodeId) {
          const prevCreateIdx = findLastCreationStep(steps, stepIdx, 'create_text');
          if (prevCreateIdx !== undefined && createdNodeIds[prevCreateIdx]) {
            resolvedParams.nodeId = createdNodeIds[prevCreateIdx];
          }
        }

        // Auto-link mutation tools to preceding create_* if nodeId missing (issue #22b)
        if (!resolvedParams.nodeId && !step.tool.startsWith('create_') && step.tool !== 'delete_node') {
          // Find the most recent create_* step and use its output
          for (let k = stepIdx - 1; k >= 0; k--) {
            if (steps[k].tool.startsWith('create_') && createdNodeIds[k]) {
              resolvedParams.nodeId = createdNodeIds[k];
              break;
            }
          }
        }

        // Normalize set_item_spacing params
        if (step.tool === 'set_item_spacing') {
          if (!resolvedParams.itemSpacing && !resolvedParams.counterAxisSpacing) {
            if (resolvedParams.spacing != null) {
              resolvedParams.itemSpacing = resolvedParams.spacing;
              delete resolvedParams.spacing;
            } else {
              resolvedParams.itemSpacing = 8;
            }
          }
        }

        // Validate set_text_content has text param
        if (step.tool === 'set_text_content' && !resolvedParams.text) {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: missing text parameter`);
          issueStepsSkipped++;
          continue;
        }

        // Validate set_corner_radius has radius param (normalize cornerRadius → radius)
        if (step.tool === 'set_corner_radius') {
          if (resolvedParams.cornerRadius != null && resolvedParams.radius == null) {
            resolvedParams.radius = resolvedParams.cornerRadius;
            delete resolvedParams.cornerRadius;
          }
          if (resolvedParams.radius == null) {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: missing radius parameter`);
            issueStepsSkipped++;
            continue;
          }
        }

        // Validate color params are objects (not strings)
        if ((step.tool === 'set_fill_color' || step.tool === 'set_stroke_color') && resolvedParams.color != null) {
          if (typeof resolvedParams.color !== 'object') {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: color must be an object`);
            issueStepsSkipped++;
            continue;
          }
        }

        // Validate move_node
        if (step.tool === 'move_node' && (resolvedParams.x == null || resolvedParams.y == null)) {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: missing x or y`);
          issueStepsSkipped++;
          continue;
        }

        // Final validation: mutation tools MUST have a valid nodeId
        if (!step.tool.startsWith('create_') && step.tool !== 'delete_node') {
          const nid = resolvedParams.nodeId;
          if (!nid || nid === 'undefined' || nid === 'null') {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: no valid nodeId`);
            issueStepsSkipped++;
            continue;
          }
        }

        // delete_node also needs a valid nodeId
        if (step.tool === 'delete_node') {
          const nid = resolvedParams.nodeId;
          if (!nid || nid === 'undefined' || nid === 'null') {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: no valid nodeId`);
            issueStepsSkipped++;
            continue;
          }
        }

        // Pre-flight: check tool/node-type compatibility
        const targetNodeId = resolvedParams.nodeId as string | undefined;
        if (targetNodeId && !step.tool.startsWith('create_')) {
          const incompatible = checkToolCompatibility(step.tool, targetNodeId, types, nodeMap);
          if (incompatible) {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: ${incompatible}`);
            issueStepsSkipped++;
            continue;
          }
        }

        // Pre-flight: check parent compatibility for create_* tools
        if (step.tool.startsWith('create_') && resolvedParams.parentId) {
          const incompatible = checkParentCompatibility(
            resolvedParams.parentId as string, types, nodeMap,
          );
          if (incompatible) {
            // Auto-fix: redirect to the leaf node's parent container
            let autoFixed = false;
            try {
              const leafInfo = await mcpClient.callTool('figma', 'get_node_info', {
                nodeId: resolvedParams.parentId,
              });
              if (leafInfo.ok) {
                const info = leafInfo.value as Record<string, unknown>;
                const leafParentId = info.parentId as string | undefined;
                if (leafParentId) {
                  // eslint-disable-next-line no-console
                  console.warn(`        [fix] ${step.tool} for ${issue.component} -> AUTO-FIX: redirecting parent from leaf node to its container ${leafParentId}`);
                  resolvedParams.parentId = leafParentId;
                  autoFixed = true;
                }
              }
            } catch {
              // fall through to skip
            }
            if (!autoFixed) {
              // eslint-disable-next-line no-console
              console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: ${incompatible}`);
              issueStepsSkipped++;
              hasBrokenDependency = true;
              continue;
            }
          }
        }

        // Check tool is supported by the bridge
        if (!SUPPORTED_TOOLS.has(step.tool)) {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: unsupported tool`);
          issueStepsSkipped++;
          if (step.tool.startsWith('create_')) hasBrokenDependency = true;
          continue;
        }

        // Pre-flight: validate numeric parameters
        const numericError = validateNumericParams(step.tool, resolvedParams);
        if (numericError) {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: ${numericError}`);
          issueStepsSkipped++;
          if (step.tool.startsWith('create_')) hasBrokenDependency = true;
          continue;
        }

        const prefix = (step.tool.startsWith('get_') || step.tool.startsWith('scan_') || step.tool === 'read_my_design' || step.tool === 'export_node_as_image')
          ? 'figma' : 'figma-write';
        const toolResult = await mcpClient.callTool(prefix, step.tool, resolvedParams);

        if (toolResult.ok) {
          stepSucceeded = true;
          issueStepsSucceeded++;
          // eslint-disable-next-line no-console
          console.log(`        [fix] ${step.tool} for ${issue.component} -> OK`);

          // Collect successful write operations for consolidated replay script
          const isWriteOp = !step.tool.startsWith('get_') && !step.tool.startsWith('scan_')
            && step.tool !== 'read_my_design' && step.tool !== 'export_node_as_image';
          if (isWriteOp) {
            allSuccessfulSteps.push(step);
          }

          // Track created node IDs for subsequent steps and for caller
          if (step.tool.startsWith('create_')) {
            const result = toolResult.value as Record<string, unknown>;
            const newId = result.id ?? result.nodeId;
            if (typeof newId === 'string') {
              createdNodeIds[stepIdx] = newId;
              const nodeName = (resolvedParams.name as string | undefined) ?? `${issue.component}_fix_${stepIdx}`;
              allCreatedNodes[nodeName] = newId;
              // Map creation tool to Figma node type
              const toolTypeMap: Record<string, string> = {
                create_frame: 'FRAME', create_rectangle: 'RECTANGLE',
                create_text: 'TEXT', create_ellipse: 'ELLIPSE',
                create_line: 'LINE', create_vector: 'VECTOR',
                create_polygon: 'POLYGON', create_star: 'STAR',
                create_component: 'COMPONENT',
                create_component_instance: 'INSTANCE',
              };
              allCreatedNodeTypes[nodeName] = toolTypeMap[step.tool] ?? 'FRAME';
            }
          }

          // Track deleted node IDs so caller can remove them from nodeMap
          if (step.tool === 'delete_node' && resolvedParams.nodeId) {
            allDeletedNodeIds.push(resolvedParams.nodeId as string);
          }
          if (step.tool === 'delete_multiple_nodes' && Array.isArray(resolvedParams.nodeIds)) {
            allDeletedNodeIds.push(...(resolvedParams.nodeIds as string[]));
          }
        } else {
          issueStepsFailed++;
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${step.tool} for ${issue.component} -> ERR: ${toolResult.error.message}`);

          // If a create failed, mark dependency as broken
          if (step.tool.startsWith('create_')) {
            hasBrokenDependency = true;
          }
        }
      }

      // Record this issue's fix attempt for history tracking
      allFixAttempts.push({
        issueComponent: issue.component,
        issueDescription: issue.description,
        stepsAttempted: issueStepsAttempted,
        stepsSucceeded: issueStepsSucceeded,
        stepsFailed: issueStepsFailed,
        stepsSkipped: issueStepsSkipped,
      });

      if (stepSucceeded) {
        fixed++;
      } else {
        failed++;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`        [fix] Unexpected error fixing ${issue.component}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
      allFixAttempts.push({
        issueComponent: issue.component,
        issueDescription: issue.description,
        stepsAttempted: 0,
        stepsSucceeded: 0,
        stepsFailed: 0,
        stepsSkipped: 0,
      });
    }
  }

  return Ok({ fixed, failed, createdNodes: allCreatedNodes, createdNodeTypes: allCreatedNodeTypes, deletedNodeIds: allDeletedNodeIds, fixAttempts: allFixAttempts, successfulSteps: allSuccessfulSteps });
}
