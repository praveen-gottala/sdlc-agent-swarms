/**
 * @module @agentforge/agents-ux/ux-design
 *
 * UX Dashboard Design agent: creates Figma designs from component specs
 * using the TalkToFigma MCP WebSocket bridge. Enables a collaborative
 * design loop where humans see changes in Figma live.
 *
 * Pipeline: ComponentSpecReady → Design Agent → FigmaDesignReady → HITL → Implementation Agent
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  Result,
  EventBus,
  ComponentSpecReady,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  recordPromptTrace,
} from '@agentforge/core';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import type { FigmaCreationStep, DesignSnapshotData, ScreenDefinition, PerScreenResult, ComponentTreeNode } from '../types.js';
import { resolveAndTransformParams } from './param-transforms.js';
import { captureFigmaScreenshotViaBridge, captureFigmaScreenshot } from './figma-screenshot.js';
import { captureDesignSnapshot } from './capture-design-snapshot.js';
import { evaluateDesign } from './design-evaluator.js';
import { executeDesignFixes } from './design-fixer.js';
import { extractScreenSubtree, inferSingleScreen, flattenTree, screenGridPosition, groupMissingByScreen } from './screen-partitioner.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard design agent. */
export interface UXDesignInput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly planningOutput: UXPlanningOutput;
  /** Human-readable description of the app/page being designed. */
  readonly description?: string;
  /** Project-specific design system prompt (colors, typography, spacing from design tokens + brand). Overrides hardcoded defaults. */
  readonly designSystemPrompt?: string;
  /** Component catalog prompt for shared anatomy definitions. */
  readonly componentCatalogPrompt?: string;
}

// Re-export ComponentSnapshot from shared types for backward compatibility
export type { ComponentSnapshot } from '../types.js';

/** Output produced by the UX dashboard design agent. */
export interface UXDesignOutput extends DesignSnapshotData {
  readonly figmaFileId: string;
  readonly figmaPageId: string;
  readonly figmaNodeIds: Readonly<Record<string, string>>;
  readonly moduleId: string;
  readonly breakpoints: readonly string[];
  /**
   * The LLM-generated creation steps (Phase B).
   * Saved so the design can be replayed into Figma without calling the LLM again.
   * Use `--stage replay` to re-execute these steps.
   */
  readonly steps?: readonly FigmaCreationStep[];
  /** Per-screen results when screens were used. */
  readonly screenResults?: readonly PerScreenResult[];
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard design agent. */
export const UX_DESIGN_CONTRACT: AgentContract = {
  role: 'ux_design',
  description: 'Creates Figma designs from component specs using TalkToFigma MCP bridge',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 40000 },
  tools: [
    // Read tools (figma: prefix)
    'figma:get_document_info',
    'figma:get_selection',
    'figma:read_my_design',
    'figma:get_node_info',
    'figma:get_nodes_info',
    'figma:get_styles',
    'figma:get_local_components',
    'figma:scan_text_nodes',
    'figma:scan_nodes_by_types',
    'figma:get_instance_overrides',
    'figma-write:export_node_as_image',
    // Write tools (figma-write: prefix)
    'figma-write:create_frame',
    'figma-write:create_rectangle',
    'figma-write:create_text',
    'figma-write:create_component_instance',
    'figma-write:set_fill_color',
    'figma-write:set_stroke_color',
    'figma-write:set_text_content',
    'figma-write:set_multiple_text_contents',
    'figma-write:set_layout_mode',
    'figma-write:set_padding',
    'figma-write:set_item_spacing',
    'figma-write:set_axis_align',
    'figma-write:set_layout_sizing',
    'figma-write:resize_node',
    'figma-write:move_node',
    'figma-write:clone_node',
    'figma-write:delete_node',
    'figma-write:delete_multiple_nodes',
    'figma-write:set_corner_radius',
    'figma-write:set_instance_overrides',
    'figma-write:set_focus',
    // Extended capabilities (patched plugin)
    'figma-write:create_ellipse',
    'figma-write:create_line',
    'figma-write:create_vector',
    'figma-write:set_effects',
    'figma-write:set_gradient_fill',
    'figma-write:set_font_properties',
    'figma-write:set_opacity',
    'figma-write:set_name',
    'figma-write:group_nodes',
  ],
  permissions: ['read_spec', 'read_design', 'write_design', 'read_design_system'],
  denied: ['write_code', 'create_branch', 'merge_pr'],
  hitl_policy: 'full_approval',
  budget: { max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 },
  on_complete: 'FigmaDesignReady',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// Allowed tools set (for validation)
// ============================================================================

const ALLOWED_TOOLS = new Set([
  // Read
  'get_document_info',
  'get_selection',
  'read_my_design',
  'get_node_info',
  'get_nodes_info',
  'get_styles',
  'get_local_components',
  'scan_text_nodes',
  'scan_nodes_by_types',
  'get_instance_overrides',
  'export_node_as_image',
  // Create
  'create_frame',
  'create_rectangle',
  'create_text',
  'create_component_instance',
  // Style
  'set_fill_color',
  'set_stroke_color',
  'set_text_content',
  'set_multiple_text_contents',
  'set_corner_radius',
  // Layout
  'set_layout_mode',
  'set_padding',
  'set_item_spacing',
  'set_axis_align',
  'set_layout_sizing',
  // Transform
  'resize_node',
  'move_node',
  'clone_node',
  'delete_node',
  'delete_multiple_nodes',
  // Instance
  'set_instance_overrides',
  // Navigation
  'set_focus',
  // Extended (patched plugin)
  'create_ellipse',
  'create_line',
  'create_vector',
  'create_polygon',
  'create_star',
  'create_component',
  'create_boolean_operation',
  'set_effects',
  'set_gradient_fill',
  'set_image_fill',
  'set_font_properties',
  'set_opacity',
  'set_name',
  'set_constraints',
  'group_nodes',
  'flatten_node',
]);

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-design-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse LLM output into FigmaCreationStep[] with tool name validation. */
export const parseDesignSteps = (output: string): Result<{ steps: FigmaCreationStep[]; breakpoints: string[] }> => {
  // Try closed fence first, then open fence (truncated output), then raw
  const closedFence = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const openFence = /```json\s*\n?([\s\S]+)/.exec(output);
  let jsonStr = closedFence ? closedFence[1].trim()
    : openFence ? openFence[1].trim()
    : output.trim();

  // Strip trailing ``` if present (open fence matched it)
  jsonStr = jsonStr.replace(/```\s*$/, '').trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const rawSteps = (parsed.steps as Record<string, unknown>[]) ?? [];
    const breakpoints = (parsed.breakpoints as string[]) ?? [];

    // Common LLM misnaming → correct tool name
    const TOOL_ALIASES: Readonly<Record<string, string>> = {
      'set_stroke': 'set_stroke_color',
      'set_fill': 'set_fill_color',
      'set_color': 'set_fill_color',
      'set_background': 'set_fill_color',
      'set_text': 'set_text_content',
      'set_spacing': 'set_item_spacing',
      'set_radius': 'set_corner_radius',
    };

    const steps: FigmaCreationStep[] = [];
    for (const step of rawSteps) {
      // Accept "tool" or "name" (LLMs sometimes use either), then normalize aliases
      const rawTool = String(step.tool ?? step.name ?? '');
      const tool = TOOL_ALIASES[rawTool] ?? rawTool;
      if (!ALLOWED_TOOLS.has(tool)) {
        return Err({
          code: 'INVALID_STATE',
          message: `Invalid tool name "${tool}" — must be one of: ${[...ALLOWED_TOOLS].join(', ')}`,
          recoverable: true,
        });
      }
      steps.push({
        tool,
        params: (step.params as Record<string, unknown>) ?? {},
        componentRef: String(step.componentRef ?? ''),
        description: String(step.description ?? ''),
      });
    }

    return Ok({ steps, breakpoints });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT',
      message: `Failed to parse design steps output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

// ============================================================================
// Work function
// ============================================================================

/**
 * Private LLM provider interface for internal type casting.
 */
interface LLMProvider {
  complete: (prompt: { system: string; messages: { role: 'user'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<Result<{ content: string }>>;
}

// ============================================================================
// Step execution (shared between design work and replay)
// ============================================================================

/** Result of executing design steps via the Figma MCP bridge. */
export interface StepExecutionResult {
  readonly figmaNodeIds: Record<string, string>;
  readonly figmaNodeTypes: Record<string, string>;
  readonly figmaFileId: string;
  readonly figmaPageId: string;
}

/** Optional context to seed executeDesignSteps with pre-existing state. */
export interface ExistingDesignContext {
  /** Pre-resolved file ID (skips get_document_info call). */
  readonly figmaFileId?: string;
  /** Pre-resolved page ID (skips get_document_info call). */
  readonly figmaPageId?: string;
  /** Node IDs from previously executed screens (for cross-screen ref: resolution). */
  readonly existingNodeIds?: Readonly<Record<string, string>>;
}

/**
 * Execute FigmaCreationStep[] via the TalkToFigma MCP bridge.
 * Resolves ref: placeholders, tracks created node IDs, and applies
 * post-creation layout fixes.
 *
 * Used by both the normal design flow (Phase B) and `--stage replay`.
 */
export async function executeDesignSteps(
  steps: readonly FigmaCreationStep[],
  mcpClient: import('@agentforge/core').MCPClient,
  moduleId: string,
  existingContext?: ExistingDesignContext,
): Promise<StepExecutionResult> {
  const figmaNodeIds: Record<string, string> = { ...(existingContext?.existingNodeIds ?? {}) };
  const figmaNodeTypes: Record<string, string> = {};
  let figmaFileId = existingContext?.figmaFileId ?? '';
  let figmaPageId = existingContext?.figmaPageId ?? '';

  // Resolve file/page IDs from env or document info (skip if already provided).
  // AGENTFORGE_MCP_FIGMA_FILE_ID is required whenever we do not already have a file id
  // (REST API, Phase C, snapshots). No placeholders — fail fast.
  if (!figmaFileId || !figmaPageId) {
    const envFileId = process.env.AGENTFORGE_MCP_FIGMA_FILE_ID?.trim() ?? '';
    const docResult = await mcpClient.callTool('figma', 'get_document_info', {});
    if (docResult.ok) {
      const docInfo = docResult.value as Record<string, unknown>;
      const currentPage = docInfo.currentPage as Record<string, unknown> | undefined;

      if (!figmaFileId) {
        if (!envFileId) {
          throw new Error(
            'AGENTFORGE_MCP_FIGMA_FILE_ID is required. Set it to the file key from your Figma URL (figma.com/design/<FILE_ID>/...).',
          );
        }
        figmaFileId = envFileId;
      }

      if (!figmaPageId) {
        const resolvedPageId = currentPage?.id ?? docInfo.id;
        const raw =
          resolvedPageId !== undefined && resolvedPageId !== null ? String(resolvedPageId) : '';
        if (raw.length > 0 && raw !== 'undefined') {
          figmaPageId = raw;
        } else {
          throw new Error(
            'Could not resolve Figma page ID from get_document_info. Open a document in Figma and ensure the TalkToFigma plugin returns currentPage.',
          );
        }
      }
    } else {
      if (!figmaFileId) {
        if (!envFileId) {
          throw new Error(
            'AGENTFORGE_MCP_FIGMA_FILE_ID is required. Set it to the file key from your Figma URL (figma.com/design/<FILE_ID>/...).',
          );
        }
        figmaFileId = envFileId;
      }
      if (!figmaPageId) {
        throw new Error(
          `Cannot resolve Figma page ID: get_document_info failed (${docResult.error.message}). Ensure the Figma bridge is running, the plugin is connected, and a document is open.`,
        );
      }
    }
  }

  // Execute each creation step, resolving ref: placeholders to real node IDs
  let lastCreatedNodeId = '';
  const stepCount = steps.length;

  for (let i = 0; i < stepCount; i++) {
    const step = steps[i];
    const stepT0 = Date.now();

    const transformResult = resolveAndTransformParams(step, {
      nodeIds: figmaNodeIds,
      lastCreatedNodeId,
      stepIndex: i,
      stepCount,
    });

    // Skip steps with unresolved refs instead of sending invalid IDs to Figma
    if (transformResult.skipped) {
      // eslint-disable-next-line no-console
      console.warn(`        [step ${i + 1}/${stepCount}] ${step.tool} → SKIPPED (${transformResult.skipReason})`);
      continue;
    }

    const { resolvedParams, postCreateLayoutMode, postCreateSpacing, postCreatePadding } = transformResult;

    const prefix = (step.tool.startsWith('get_') || step.tool.startsWith('scan_') || step.tool === 'read_my_design')
      ? 'figma' : 'figma-write';
    const toolResult = await mcpClient.callTool(prefix, step.tool, resolvedParams);
    const stepMs = Date.now() - stepT0;

    if (toolResult.ok) {
      const result = toolResult.value as Record<string, unknown>;
      const createdNodeId = String(result.nodeId ?? result.id ?? '');
      if (step.componentRef && createdNodeId) {
        figmaNodeIds[step.componentRef] = createdNodeId;
        lastCreatedNodeId = createdNodeId;
        const toolToType: Record<string, string> = {
          create_frame: 'FRAME', create_rectangle: 'RECTANGLE',
          create_text: 'TEXT', create_ellipse: 'ELLIPSE',
          create_line: 'LINE', create_vector: 'VECTOR',
          create_polygon: 'POLYGON', create_star: 'STAR',
          create_component: 'COMPONENT',
          create_component_instance: 'INSTANCE',
        };
        if (toolToType[step.tool]) {
          figmaNodeTypes[step.componentRef] = toolToType[step.tool];
        }
      }
      // eslint-disable-next-line no-console
      console.log(`        [step ${i + 1}/${stepCount}] ${step.tool} → OK (${stepMs}ms)`);

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
          const spacingResult = await mcpClient.callTool('figma-write', 'set_item_spacing', {
            nodeId: createdNodeId,
            itemSpacing: postCreateSpacing,
          });
          if (!spacingResult.ok) {
            // eslint-disable-next-line no-console
            console.warn(`          ↳ set_item_spacing ${postCreateSpacing} → ERR: ${spacingResult.error.message}`);
          }
        }
        if (postCreatePadding) {
          const paddingResult = await mcpClient.callTool('figma-write', 'set_padding', {
            nodeId: createdNodeId,
            ...postCreatePadding,
          });
          if (!paddingResult.ok) {
            // eslint-disable-next-line no-console
            console.warn(`          ↳ set_padding → ERR: ${paddingResult.error.message}`);
          }
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`        [step ${i + 1}/${stepCount}] ${step.tool} → ERR: ${toolResult.error.message} (${stepMs}ms)`);
    }
  }

  return { figmaNodeIds, figmaNodeTypes, figmaFileId, figmaPageId };
}

// ============================================================================
// Per-screen prompt builder
// ============================================================================

/** Build the LLM prompt for a single screen's design generation. */
export const buildPerScreenPrompt = (opts: {
  screen: ScreenDefinition;
  screenIndex: number;
  screenPlanningOutput: UXPlanningOutput;
  description?: string;
  designSystemPrompt?: string;
  componentCatalogPrompt?: string;
  previousScreenRefs: readonly string[];
  learnings: readonly unknown[];
  moduleId: string;
}): { system: string; messages: { role: 'user'; content: string }[] } => {
  const { screen, screenIndex, screenPlanningOutput, description, designSystemPrompt, componentCatalogPrompt, previousScreenRefs, learnings, moduleId } = opts;

  const baseSystemPrompt = loadSystemPrompt();
  const systemPrompt = baseSystemPrompt
    .replace(
      '{{DESIGN_TOKENS}}',
      designSystemPrompt || '(No project tokens provided — use fallback palette below)',
    )
    .replace(
      '{{COMPONENT_CATALOG}}',
      componentCatalogPrompt || '(No component catalog available)',
    );

  const { x, y } = screenGridPosition(screenIndex);
  const userMessageParts = [
    `Module ID: ${moduleId}`,
    `\nScreen: ${screen.name} (${screen.screenId})${screen.route ? ` — route: ${screen.route}` : ''}`,
    `\nYou are designing ONLY the "${screen.name}" screen. It contains these components: ${screen.componentNames.join(', ')}.`,
    `\nRoot frame position: x=${x}, y=${y}`,
  ];

  if (previousScreenRefs.length > 0) {
    userMessageParts.push(`\nPrevious screens already created these components (do NOT recreate): ${previousScreenRefs.join(', ')}`);
  }

  if (description) {
    userMessageParts.push(`\nApp Description: ${description}`);
    userMessageParts.push(`\nIMPORTANT: Design this screen for the app described above. Use the componentTree below to determine which components to create. Populate all text with realistic, domain-appropriate content that matches this app.`);
  }

  userMessageParts.push(`\nPlanning Output:\n${JSON.stringify(screenPlanningOutput, null, 2)}`);

  if (learnings.length > 0) {
    userMessageParts.push(`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`);
  }

  return {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessageParts.join('\n') }],
  };
};

// ============================================================================
// Ref validation helper
// ============================================================================

/** Validate componentRefs and ref:X targets for consistency. Logs warnings for mismatches. */
const validateRefs = (
  steps: readonly FigmaCreationStep[],
  componentTree: readonly ComponentTreeNode[],
): void => {
  const allComponentRefs = new Set(steps.filter((s) => s.componentRef).map((s) => s.componentRef));
  const allRefTargets = new Set<string>();
  for (const step of steps) {
    for (const value of Object.values(step.params)) {
      if (typeof value === 'string') {
        const m = /^ref:(.+)$/.exec(value);
        if (m) allRefTargets.add(m[1]);
      }
    }
  }
  for (const target of allRefTargets) {
    if (!allComponentRefs.has(target)) {
      // eslint-disable-next-line no-console
      console.warn(`        [ref-validation] ref:${target} is referenced but no step defines componentRef "${target}"`);
    }
  }
  if (componentTree) {
    const treeNames = flattenTree(componentTree);
    for (const name of treeNames) {
      if (!allComponentRefs.has(name)) {
        // eslint-disable-next-line no-console
        console.warn(`        [ref-validation] componentTree name "${name}" has no matching componentRef in steps`);
      }
    }
  }
};

// ============================================================================
// Per-screen correction loop
// ============================================================================

/** Run Phase C visual self-correction for a single screen's root node. */
async function runScreenCorrection(opts: {
  rootNodeId: string;
  screenPlanningOutput: UXPlanningOutput;
  figmaNodeIds: Record<string, string>;
  figmaNodeTypes: Record<string, string>;
  figmaFileId: string;
  steps: FigmaCreationStep[];
  provider: unknown;
  context: import('@agentforge/core').AgentContext;
}): Promise<number | undefined> {
  const { rootNodeId, screenPlanningOutput, figmaNodeIds, figmaNodeTypes, figmaFileId, steps, provider, context } = opts;

  const hasBridge = await context.mcpClient.isAvailable('figma');
  const figmaToken = process.env.AGENTFORGE_MCP_FIGMA_TOKEN;
  const envFileIdForPhaseC = process.env.AGENTFORGE_MCP_FIGMA_FILE_ID;
  const hasRealFileId = envFileIdForPhaseC && !envFileIdForPhaseC.startsWith('file-');
  const canRunPhaseC = hasBridge || (figmaToken && hasRealFileId);

  if (!canRunPhaseC || !rootNodeId) return undefined;

  const MAX_CORRECTIONS = 3;
  const QUALITY_THRESHOLD = 80;

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const correctionHistory: import('./design-evaluator.js').CorrectionHistory[] = [];
  let allPreviousAttempts: import('./design-evaluator.js').FixAttemptRecord[] = [];
  let previousScore = -1;
  let finalScore: number | undefined;

  for (let correction = 0; correction < MAX_CORRECTIONS; correction++) {
    let screenshotResult = await captureFigmaScreenshotViaBridge(context.mcpClient, rootNodeId);

    if (!screenshotResult.ok && figmaToken && hasRealFileId) {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${correction + 1}] Bridge screenshot failed (${screenshotResult.error.message}), falling back to REST API...`);
      screenshotResult = await captureFigmaScreenshot(figmaToken, figmaFileId, rootNodeId);
    }

    if (!screenshotResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${correction + 1}] Screenshot failed: ${screenshotResult.error.message}`);
      break;
    }

    const evalProvider = provider as unknown as import('@agentforge/providers').LLMProvider;
    const evalResult = await evaluateDesign(
      screenshotResult.value.base64,
      JSON.stringify(screenPlanningOutput, null, 2),
      evalProvider,
      correctionHistory.length > 0 ? correctionHistory : undefined,
    );

    if (!evalResult.ok) {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${correction + 1}] Evaluation failed: ${evalResult.error.message}`);
      break;
    }

    const evaluation = evalResult.value;
    finalScore = evaluation.score;
    // eslint-disable-next-line no-console
    console.log(`        [correction ${correction + 1}] Score: ${evaluation.score}/100 (${evaluation.overallQuality}), issues: ${evaluation.issues.length}`);

    if (previousScore >= 0 && evaluation.score < previousScore) {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${correction + 1}] Score regressed from ${previousScore} to ${evaluation.score} after fixes.`);
      if (previousScore >= 75) break;
    }

    if (evaluation.score >= QUALITY_THRESHOLD) {
      // eslint-disable-next-line no-console
      console.log(correction === 0
        ? `        [Phase C] First evaluation passed (${evaluation.score} >= ${QUALITY_THRESHOLD})`
        : `        [correction] Quality threshold met (${evaluation.score} >= ${QUALITY_THRESHOLD})`);
      break;
    }

    if (previousScore >= 0 && evaluation.score === previousScore) {
      // eslint-disable-next-line no-console
      console.log(`        [correction] Score not improving (${evaluation.score} === ${previousScore}), stopping`);
      break;
    }
    previousScore = evaluation.score;

    if (evaluation.issues.length === 0) break;

    const fixResult = await executeDesignFixes(
      evaluation.issues,
      context.mcpClient,
      figmaNodeIds,
      evalProvider,
      figmaNodeTypes,
      {
        screenshotBase64: screenshotResult.value.base64,
        previousAttempts: allPreviousAttempts.length > 0 ? allPreviousAttempts : undefined,
        planningOutput: screenPlanningOutput as unknown as Record<string, unknown>,
        designSystemPrompt: loadSystemPrompt(),
      },
    );

    if (fixResult.ok) {
      for (const deletedId of fixResult.value.deletedNodeIds) {
        for (const [name, id] of Object.entries(figmaNodeIds)) {
          if (id === deletedId) {
            delete figmaNodeIds[name];
            delete figmaNodeTypes[name];
          }
        }
      }
      for (const [name, id] of Object.entries(fixResult.value.createdNodes)) {
        figmaNodeIds[name] = id;
      }
      for (const [name, type] of Object.entries(fixResult.value.createdNodeTypes)) {
        figmaNodeTypes[name] = type;
      }
      // eslint-disable-next-line no-console
      console.log(`        [correction ${correction + 1}] Fixed: ${fixResult.value.fixed}, Failed: ${fixResult.value.failed}`);

      const totalAttempted = fixResult.value.fixAttempts.reduce((sum: number, a: import('./design-evaluator.js').FixAttemptRecord) => sum + a.stepsAttempted, 0);
      const totalSkipped = fixResult.value.fixAttempts.reduce((sum: number, a: import('./design-evaluator.js').FixAttemptRecord) => sum + a.stepsSkipped, 0);
      const totalExecuted = totalAttempted - totalSkipped;

      if (totalExecuted === 0 && totalAttempted > 0) {
        // eslint-disable-next-line no-console
        console.log(`        [correction ${correction + 1}] All fix attempts failed validation`);
        break;
      }

      if (fixResult.value.successfulSteps.length > 0) {
        steps.push(...fixResult.value.successfulSteps);
      }

      correctionHistory.push({
        iteration: correction + 1,
        score: evaluation.score,
        issues: evaluation.issues,
        fixAttempts: fixResult.value.fixAttempts,
      });
      allPreviousAttempts = [...allPreviousAttempts, ...fixResult.value.fixAttempts];

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      // eslint-disable-next-line no-console
      console.warn(`        [correction ${correction + 1}] Fix execution failed: ${fixResult.error.message}`);
      break;
    }
  }

  return finalScore;
}

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard design agent's work function.
 * Per-screen approach:
 * - For each screen: Phase A (prompt → LLM → steps) → Phase B (execute) → Phase C (correction)
 * - Phase D: Completeness check + snapshot capture
 */
export const uxDesignWork: AgentWorkFn<UXDesignInput, UXDesignOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, planningOutput, description, designSystemPrompt, componentCatalogPrompt } = input;
  const llm = provider as unknown as LLMProvider;

  // ── Input validation guards ──
  if (!moduleId) {
    return Err({ code: 'INVALID_STATE' as const, message: 'Design input missing moduleId', recoverable: false });
  }
  if (!planningOutput || !planningOutput.componentTree || planningOutput.componentTree.length === 0) {
    return Err({ code: 'INVALID_STATE' as const, message: 'Design input missing planningOutput.componentTree — run planning stage first', recoverable: false });
  }
  if (!designSystemPrompt) {
    // eslint-disable-next-line no-console
    console.warn('[design] Warning: no designSystemPrompt provided — using hardcoded defaults. Run `agentforge design:system` for brand-accurate designs.');
  }

  // ── Determine screens ──
  const screens = planningOutput.screens ?? inferSingleScreen(planningOutput);
  // eslint-disable-next-line no-console
  console.log(`\n        [design] ${screens.length} screen(s) to generate: ${screens.map((s) => s.name).join(', ')}`);

  const allSteps: FigmaCreationStep[] = [];
  const allNodeIds: Record<string, string> = {};
  const allNodeTypes: Record<string, string> = {};
  const screenResults: PerScreenResult[] = [];
  let sharedContext: ExistingDesignContext = {};
  let allBreakpoints: string[] = [];

  // ── Per-screen loop ──
  for (let si = 0; si < screens.length; si++) {
    const screen = screens[si];
    const screenPlanningOutput = extractScreenSubtree(planningOutput, screen);

    // eslint-disable-next-line no-console
    console.log(`\n        [screen ${si + 1}/${screens.length}] "${screen.name}" — ${screen.componentNames.length} components`);

    // Phase A: Generate steps for THIS screen only
    const prompt = buildPerScreenPrompt({
      screen,
      screenIndex: si,
      screenPlanningOutput,
      description,
      designSystemPrompt,
      componentCatalogPrompt,
      previousScreenRefs: Object.keys(allNodeIds),
      learnings,
      moduleId,
    });

    recordPromptTrace(context, `design-screen-${si + 1}-${screen.name}`, prompt, {
      model: UX_DESIGN_CONTRACT.provider,
      maxTokens: 16000,
    });

    const completionResult = await llm.complete(prompt, {
      model: context.resolvedModel ?? UX_DESIGN_CONTRACT.provider,
      maxTokens: 16000,
      temperature: 0,
    });

    if (!completionResult.ok) {
      return completionResult as Result<never>;
    }

    const llmOutput = (completionResult.value as { content: string }).content;
    const parseResult = parseDesignSteps(llmOutput);
    if (!parseResult.ok) {
      return parseResult as Result<never>;
    }

    const screenSteps: FigmaCreationStep[] = [...parseResult.value.steps];
    if (si === 0) {
      allBreakpoints = parseResult.value.breakpoints;
    }

    // Ref validation for this screen
    validateRefs(screenSteps, screenPlanningOutput.componentTree);

    // Phase B: Execute steps for THIS screen
    let execResult: StepExecutionResult;
    try {
      execResult = await executeDesignSteps(
        screenSteps,
        context.mcpClient,
        moduleId,
        sharedContext,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Err({ code: 'INVALID_STATE' as const, message: msg, recoverable: false });
    }

    // Merge results
    Object.assign(allNodeIds, execResult.figmaNodeIds);
    Object.assign(allNodeTypes, execResult.figmaNodeTypes);
    allSteps.push(...screenSteps);
    sharedContext = {
      figmaFileId: execResult.figmaFileId,
      figmaPageId: execResult.figmaPageId,
      existingNodeIds: { ...allNodeIds },
    };

    // Find this screen's root node ID (first node created in this batch)
    const screenNodeEntries = Object.entries(execResult.figmaNodeIds);
    const rootNodeId = screenNodeEntries.length > 0 ? screenNodeEntries[0][1] : '';

    // Phase C: Per-screen correction loop
    // eslint-disable-next-line no-console
    console.log(`\n        [Phase C] Visual self-correction for "${screen.name}"`);
    const correctionScore = await runScreenCorrection({
      rootNodeId,
      screenPlanningOutput,
      figmaNodeIds: allNodeIds,
      figmaNodeTypes: allNodeTypes,
      figmaFileId: execResult.figmaFileId,
      steps: allSteps,
      provider,
      context,
    });

    screenResults.push({
      screenId: screen.screenId,
      screenName: screen.name,
      rootNodeId,
      nodeIds: { ...execResult.figmaNodeIds },
      steps: screenSteps,
      correctionScore,
    });
  }

  // ── Completeness check across all screens ──
  const treeNames = flattenTree(planningOutput.componentTree);
  const allComponentRefs = new Set(allSteps.filter((s) => s.componentRef).map((s) => s.componentRef));
  const missingComponents = treeNames.filter((name) => !allComponentRefs.has(name));

  if (missingComponents.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`\n        [completeness] ${missingComponents.length} missing component(s): ${missingComponents.join(', ')}`);

    const missingByScreen = groupMissingByScreen(missingComponents, screens);
    for (const [screenId, missing] of Object.entries(missingByScreen)) {
      const screen = screens.find((s) => s.screenId === screenId);
      const screenResult = screenResults.find((r) => r.screenId === screenId);
      if (!screen || !screenResult) continue;

      // eslint-disable-next-line no-console
      console.log(`        [completeness] Generating ${missing.length} missing component(s) for "${screen.name}": ${missing.join(', ')}`);

      const followUpPrompt = buildPerScreenPrompt({
        screen: { ...screen, componentNames: missing },
        screenIndex: screens.indexOf(screen),
        screenPlanningOutput: extractScreenSubtree(planningOutput, { ...screen, componentNames: missing }),
        description,
        designSystemPrompt,
        componentCatalogPrompt,
        previousScreenRefs: Object.keys(allNodeIds),
        learnings,
        moduleId,
      });

      const followUpResult = await llm.complete(followUpPrompt, {
        model: context.resolvedModel ?? UX_DESIGN_CONTRACT.provider,
        maxTokens: 8000,
        temperature: 0,
      });

      if (followUpResult.ok) {
        const followUpParsed = parseDesignSteps((followUpResult.value as { content: string }).content);
        if (followUpParsed.ok) {
          let followUpExec: StepExecutionResult;
          try {
            followUpExec = await executeDesignSteps(
              followUpParsed.value.steps,
              context.mcpClient,
              moduleId,
              sharedContext,
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return Err({ code: 'INVALID_STATE' as const, message: msg, recoverable: false });
          }
          Object.assign(allNodeIds, followUpExec.figmaNodeIds);
          Object.assign(allNodeTypes, followUpExec.figmaNodeTypes);
          allSteps.push(...followUpParsed.value.steps);
        }
      }
    }
  }

  // ── Phase D: Capture design snapshot (shared with Penpot) ──
  const snapshotData = await captureDesignSnapshot({
    tool: 'figma',
    moduleId,
    projectRoot: context.projectRoot,
    nodeIds: allNodeIds,
    nodeTypes: allNodeTypes,
    mcpClient: context.mcpClient,
    captureScreenshot: captureFigmaScreenshotViaBridge,
    extractProperties: async (client, nodeId) => {
      const result = await client.callTool('figma', 'get_node_info', { nodeId });
      if (!result.ok) return result;
      return result as import('@agentforge/core').Result<Record<string, unknown>>;
    },
  });

  return Ok({
    figmaFileId: sharedContext.figmaFileId ?? `file-${moduleId}`,
    figmaPageId: sharedContext.figmaPageId ?? `page-${moduleId}`,
    figmaNodeIds: allNodeIds,
    moduleId,
    breakpoints: allBreakpoints,
    steps: allSteps,
    screenResults,
    ...snapshotData,
  });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard design agent through the full governance pipeline.
 */
export const executeUXDesign = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXDesignInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_design',
    `module:${input.moduleId}`,
    `UX dashboard design for module: ${input.moduleId}`,
    uxDesignWork,
  );
};

/**
 * Register the UX dashboard design agent to respond to ComponentSpecReady events.
 */
export const registerUXDesign = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_DESIGN_CONTRACT,
): void => {
  eventBus.subscribe('ComponentSpecReady', (event: ComponentSpecReady) => {
    const input: UXDesignInput = {
      specRef: event.specRef,
      moduleId: event.moduleId,
      taskId: event.taskId,
      planningOutput: {
        specRef: event.specRef,
        moduleId: event.moduleId,
        componentTree: event.componentTree.map((name) => ({ name, props: [], children: [] })),
        tokenBindings: event.tokenBindings,
        responsiveRules: [],
        implementationStages: [],
      },
    };
    void executeUXDesign(contract, context, input);
  });
};
