/**
 * @module @agentforge/agents-ux/ux-design/design-fixer
 *
 * Generates and executes Figma fix commands for design issues found
 * by the design evaluator. Part of the visual self-correction loop.
 */

import type { Result, MCPClient } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import type { DesignIssue } from './design-evaluator.js';
import type { FigmaCreationStep } from '../types.js';

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
}

/** Tools that only work on FRAME nodes (with auto-layout). */
const FRAME_ONLY_TOOLS = new Set([
  'set_layout_mode', 'set_padding', 'set_item_spacing',
  'set_axis_align', 'set_layout_sizing',
]);

/** Tools that only work on TEXT nodes. */
const TEXT_ONLY_TOOLS = new Set(['set_text_content']);

/** Node types that can have children. */
const CONTAINER_TYPES = new Set(['FRAME', 'COMPONENT', 'GROUP']);

const FIX_GENERATION_SYSTEM_PROMPT = `You are a Figma design fix generator. Given a design issue and the current node map
(with node types), generate the minimal set of Figma tool calls to fix the issue.

CRITICAL RULES:
1. ALWAYS modify EXISTING nodes — do NOT create duplicates of nodes that already exist.
2. Check the node TYPE before choosing a tool:
   - FRAME: supports set_layout_mode, set_padding, set_item_spacing, set_fill_color, resize_node, and can have children
   - RECTANGLE: supports set_fill_color, set_corner_radius, resize_node, move_node. Does NOT support set_layout_mode, set_padding, children.
   - TEXT: supports set_text_content, set_fill_color, move_node, resize_node. Does NOT support set_layout_mode, children.
   - ELLIPSE: supports set_fill_color, resize_node, move_node.
3. Only FRAME nodes can be parents (parentId) for create_* operations.
4. If a node is a RECTANGLE but needs to be a FRAME (e.g., needs children or auto-layout), you must
   delete it and create a new FRAME in its parent. Use "delete_node" then "create_frame".
5. Colors are objects: { "r": 0.5, "g": 0.5, "b": 0.5, "a": 1 } (0-1 floats).
6. If you create a node, reference it in later steps using "$step:N" (0-based step index).
7. set_padding/set_item_spacing require layoutMode != NONE. Call set_layout_mode FIRST.
8. move_node MUST include both "x" and "y".
9. set_item_spacing uses "itemSpacing" (not "spacing").
10. Keep fixes minimal — 1-5 steps per issue.

Available tools:
  Modify: set_fill_color, set_stroke_color, set_text_content, set_layout_mode, set_padding,
          set_item_spacing, set_corner_radius, set_opacity, resize_node, move_node, delete_node
  Create: create_frame, create_rectangle, create_text, create_ellipse

Respond ONLY with a JSON array:
[{ "tool": "<name>", "params": { ... }, "componentRef": "<key>", "description": "<why>" }]`;

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
 * @returns Count of fixed and failed issues
 */
export async function executeDesignFixes(
  issues: readonly DesignIssue[],
  mcpClient: MCPClient,
  nodeMap: Readonly<Record<string, string>>,
  provider: LLMProvider,
  nodeTypes?: Readonly<Record<string, string>>,
): Promise<Result<FixResult>> {
  const types = nodeTypes ?? {};

  // Filter to actionable issues
  const actionableIssues = issues.filter(
    (issue) => issue.severity === 'critical' || issue.severity === 'major',
  );

  if (actionableIssues.length === 0) {
    return Ok({ fixed: 0, failed: 0, createdNodes: {}, createdNodeTypes: {}, deletedNodeIds: [] });
  }

  let fixed = 0;
  let failed = 0;
  const allCreatedNodes: Record<string, string> = {};
  const allCreatedNodeTypes: Record<string, string> = {};
  const allDeletedNodeIds: string[] = [];

  for (const issue of actionableIssues) {
    try {
      // Generate fix steps via LLM — include node types in the prompt
      const nodeInfo = Object.entries(nodeMap).map(([name, id]) => {
        const type = types[name] ?? 'UNKNOWN';
        return `  "${name}": "${id}" (${type})`;
      }).join('\n');

      const fixResult = await provider.complete(
        {
          system: FIX_GENERATION_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Issue to fix:
  Component: ${issue.component}
  Severity: ${issue.severity}
  Problem: ${issue.description}
  Suggested fix: ${issue.fix}

Existing Figma nodes (name: "nodeId" (TYPE)):
${nodeInfo}

Generate the minimal fix steps. Check node types before choosing tools.`,
            },
          ],
        },
        {
          model: 'claude-sonnet-4',
          maxTokens: 2048,
          temperature: 0,
        },
      );

      if (!fixResult.ok) {
        // eslint-disable-next-line no-console
        console.warn(`        [fix] Failed to generate fix for ${issue.component}: LLM error`);
        failed++;
        continue;
      }

      // Parse fix steps
      const content = fixResult.value.content;
      const fenceMatch = /```json\s*\n?([\s\S]*?)```/.exec(content);
      const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();

      let steps: FigmaCreationStep[];
      try {
        steps = JSON.parse(jsonStr) as FigmaCreationStep[];
      } catch {
        // eslint-disable-next-line no-console
        console.warn(`        [fix] Failed to parse fix steps for ${issue.component}`);
        failed++;
        continue;
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

      for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
        const step = steps[stepIdx];

        // If a dependency failed, skip all steps that reference it
        if (hasBrokenDependency) {
          const hasStepRef = Object.values(step.params).some(
            (v) => typeof v === 'string' && /^\$step:\d+$/.test(v),
          );
          if (hasStepRef) {
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
          continue;
        }

        // Validate color params are objects (not strings)
        if ((step.tool === 'set_fill_color' || step.tool === 'set_stroke_color') && resolvedParams.color != null) {
          if (typeof resolvedParams.color !== 'object') {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: color must be an object`);
            continue;
          }
        }

        // Validate move_node
        if (step.tool === 'move_node' && (resolvedParams.x == null || resolvedParams.y == null)) {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: missing x or y`);
          continue;
        }

        // Final validation: mutation tools MUST have a valid nodeId
        if (!step.tool.startsWith('create_') && step.tool !== 'delete_node') {
          const nid = resolvedParams.nodeId;
          if (!nid || nid === 'undefined' || nid === 'null') {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: no valid nodeId`);
            continue;
          }
        }

        // delete_node also needs a valid nodeId
        if (step.tool === 'delete_node') {
          const nid = resolvedParams.nodeId;
          if (!nid || nid === 'undefined' || nid === 'null') {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: no valid nodeId`);
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
            continue;
          }
        }

        // Pre-flight: check parent compatibility for create_* tools
        if (step.tool.startsWith('create_') && resolvedParams.parentId) {
          const incompatible = checkParentCompatibility(
            resolvedParams.parentId as string, types, nodeMap,
          );
          if (incompatible) {
            // eslint-disable-next-line no-console
            console.warn(`        [fix] ${step.tool} for ${issue.component} -> SKIP: ${incompatible}`);
            hasBrokenDependency = true; // downstream $step:N refs will fail too
            continue;
          }
        }

        const prefix = step.tool.startsWith('get_') ? 'figma' : 'figma-write';
        const toolResult = await mcpClient.callTool(prefix, step.tool, resolvedParams);

        if (toolResult.ok) {
          stepSucceeded = true;
          // eslint-disable-next-line no-console
          console.log(`        [fix] ${step.tool} for ${issue.component} -> OK`);

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
              };
              allCreatedNodeTypes[nodeName] = toolTypeMap[step.tool] ?? 'FRAME';
            }
          }

          // Track deleted node IDs so caller can remove them from nodeMap
          if (step.tool === 'delete_node' && resolvedParams.nodeId) {
            allDeletedNodeIds.push(resolvedParams.nodeId as string);
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn(`        [fix] ${step.tool} for ${issue.component} -> ERR: ${toolResult.error.message}`);

          // If a create failed, mark dependency as broken
          if (step.tool.startsWith('create_')) {
            hasBrokenDependency = true;
          }
        }
      }

      if (stepSucceeded) {
        fixed++;
      } else {
        failed++;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`        [fix] Unexpected error fixing ${issue.component}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  return Ok({ fixed, failed, createdNodes: allCreatedNodes, createdNodeTypes: allCreatedNodeTypes, deletedNodeIds: allDeletedNodeIds });
}
