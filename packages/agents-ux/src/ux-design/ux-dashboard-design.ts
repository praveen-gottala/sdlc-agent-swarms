/**
 * @module @agentforge/agents-ux/ux-dashboard-design
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
} from '@agentforge/core';
import type { UXDashboardPlanningOutput } from '../ux-planning/ux-dashboard-planning.js';
import type { FigmaCreationStep } from '../types.js';
import { resolveAndTransformParams } from './param-transforms.js';
import { captureFigmaScreenshot } from './figma-screenshot.js';
import { evaluateDesign } from './design-evaluator.js';
import { executeDesignFixes } from './design-fixer.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard design agent. */
export interface UXDashboardDesignInput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly planningOutput: UXDashboardPlanningOutput;
}

/** Output produced by the UX dashboard design agent. */
export interface UXDashboardDesignOutput {
  readonly figmaFileId: string;
  readonly figmaPageId: string;
  readonly figmaNodeIds: Readonly<Record<string, string>>;
  readonly moduleId: string;
  readonly breakpoints: readonly string[];
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard design agent. */
export const UX_DASHBOARD_DESIGN_CONTRACT: AgentContract = {
  role: 'ux_dashboard_design',
  description: 'Creates Figma designs from component specs using TalkToFigma MCP bridge',
  category: 'design',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 40000 },
  tools: [
    // Read tools (figma: prefix)
    'figma:get_document_info',
    'figma:get_selection',
    // Write tools (figma-write: prefix)
    'figma-write:create_frame',
    'figma-write:create_rectangle',
    'figma-write:create_text',
    'figma-write:create_ellipse',
    'figma-write:create_component',
    'figma-write:create_instance',
    'figma-write:set_fill_color',
    'figma-write:set_stroke_color',
    'figma-write:set_text_content',
    'figma-write:set_layout_mode',
    'figma-write:set_padding',
    'figma-write:set_item_spacing',
    'figma-write:set_axis_align',
    'figma-write:set_layout_sizing',
    'figma-write:resize_node',
    'figma-write:move_node',
    'figma-write:set_corner_radius',
    'figma-write:set_opacity',
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
  'get_document_info',
  'get_selection',
  'create_frame',
  'create_rectangle',
  'create_text',
  'create_ellipse',
  'create_component',
  'create_instance',
  'set_fill_color',
  'set_stroke_color',
  'set_text_content',
  'set_layout_mode',
  'set_padding',
  'set_item_spacing',
  'set_axis_align',
  'set_layout_sizing',
  'resize_node',
  'move_node',
  'set_corner_radius',
  'set_opacity',
]);

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-dashboard-design-system.md');
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

/**
 * The UX dashboard design agent's work function.
 * Two-phase approach:
 * - Phase A: Build prompt from planning output → LLM → parse FigmaCreationStep[]
 * - Phase B: Execute steps via TalkToFigma MCP bridge → collect node IDs → build output
 */
export const uxDashboardDesignWork: AgentWorkFn<UXDashboardDesignInput, UXDashboardDesignOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, planningOutput } = input;
  const llm = provider as unknown as LLMProvider;

  // ── Phase A: Generate creation plan via LLM ──

  const systemPrompt = loadSystemPrompt();
  const userMessageParts = [
    `Module ID: ${moduleId}`,
    `\nPlanning Output:\n${JSON.stringify(planningOutput, null, 2)}`,
  ];

  if (learnings.length > 0) {
    userMessageParts.push(`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`);
  }

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessageParts.join('\n') }],
  };

  const completionResult = await llm.complete(prompt, {
    model: UX_DASHBOARD_DESIGN_CONTRACT.provider,
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

  const { steps, breakpoints } = parseResult.value;

  // ── Phase B: Execute steps via TalkToFigma MCP bridge ──

  const figmaNodeIds: Record<string, string> = {};
  let figmaFileId = '';
  let figmaPageId = '';

  // Use env var for file ID if available, fall back to document info
  // Support both AGENTFORGE_MCP_FIGMA_* and legacy FIGMA_* naming conventions
  const envFileId = process.env.AGENTFORGE_MCP_FIGMA_FILE_ID ?? process.env.FIGMA_TEST_FILE_ID;

  const docResult = await context.mcpClient.callTool('figma', 'get_document_info', {});
  if (docResult.ok) {
    const docInfo = docResult.value as Record<string, unknown>;
    const currentPage = docInfo.currentPage as Record<string, unknown> | undefined;
    figmaFileId = envFileId ?? `file-${moduleId}`;
    if (!envFileId) {
      // eslint-disable-next-line no-console
      console.warn('        [design] AGENTFORGE_MCP_FIGMA_FILE_ID not set — using placeholder. Set it for Figma REST API features.');
    }
    figmaPageId = String(currentPage?.id ?? docInfo.id ?? `page-${moduleId}`);
  } else {
    figmaFileId = envFileId ?? `file-${moduleId}`;
    figmaPageId = `page-${moduleId}`;
  }

  // Execute each creation step, resolving ref: placeholders to real node IDs
  let lastCreatedNodeId = '';
  const stepCount = steps.length;
  // Track the Figma node type for each componentRef (FRAME, RECTANGLE, TEXT, etc.)
  const figmaNodeTypes: Record<string, string> = {};

  for (let i = 0; i < stepCount; i++) {
    const step = steps[i];
    const stepT0 = Date.now();

    const { resolvedParams, postCreateLayoutMode, postCreateSpacing, postCreatePadding } =
      resolveAndTransformParams(step, {
        nodeIds: figmaNodeIds,
        lastCreatedNodeId,
        stepIndex: i,
        stepCount,
      });

    const prefix = step.tool.startsWith('get_') ? 'figma' : 'figma-write';
    const toolResult = await context.mcpClient.callTool(prefix, step.tool, resolvedParams);
    const stepMs = Date.now() - stepT0;

    if (toolResult.ok) {
      const result = toolResult.value as Record<string, unknown>;
      const createdNodeId = String(result.nodeId ?? result.id ?? '');
      if (step.componentRef && createdNodeId) {
        figmaNodeIds[step.componentRef] = createdNodeId;
        lastCreatedNodeId = createdNodeId;
        // Track node type based on creation tool
        const toolToType: Record<string, string> = {
          create_frame: 'FRAME', create_rectangle: 'RECTANGLE',
          create_text: 'TEXT', create_ellipse: 'ELLIPSE',
          create_component: 'COMPONENT',
        };
        if (toolToType[step.tool]) {
          figmaNodeTypes[step.componentRef] = toolToType[step.tool];
        }
      }
      // eslint-disable-next-line no-console
      console.log(`        [step ${i + 1}/${stepCount}] ${step.tool} → OK (${stepMs}ms)`);

      // Post-creation: enforce auto-layout with separate calls (inline layoutMode is unreliable)
      if (step.tool === 'create_frame' && postCreateLayoutMode && createdNodeId) {
        const layoutResult = await context.mcpClient.callTool('figma-write', 'set_layout_mode', {
          nodeId: createdNodeId,
          layoutMode: postCreateLayoutMode,
        });
        if (layoutResult.ok) {
          // eslint-disable-next-line no-console
          console.log(`          ↳ set_layout_mode ${postCreateLayoutMode} → OK`);
        }
        if (postCreateSpacing !== undefined) {
          const spacingResult = await context.mcpClient.callTool('figma-write', 'set_item_spacing', {
            nodeId: createdNodeId,
            itemSpacing: postCreateSpacing,
          });
          if (!spacingResult.ok) {
            // eslint-disable-next-line no-console
            console.warn(`          ↳ set_item_spacing ${postCreateSpacing} → ERR: ${spacingResult.error.message}`);
          }
        }
        if (postCreatePadding) {
          const paddingResult = await context.mcpClient.callTool('figma-write', 'set_padding', {
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

  // ── Phase C: Visual self-correction loop (optional) ──

  const figmaToken = process.env.AGENTFORGE_MCP_FIGMA_TOKEN ?? process.env.FIGMA_ACCESS_TOKEN;
  const hasRealFileId = envFileId && !envFileId.startsWith('file-');

  if (figmaToken && hasRealFileId) {
    const MAX_CORRECTIONS = 3;
    const QUALITY_THRESHOLD = 80;

    // eslint-disable-next-line no-console
    console.log('\n        [Phase C] Visual self-correction loop');

    // Find the root node ID (first created node)
    const rootNodeId = Object.values(figmaNodeIds)[0];

    if (rootNodeId) {
      // Wait for Figma to finish rendering newly created nodes before first screenshot
      await new Promise((resolve) => setTimeout(resolve, 5000));

      for (let correction = 0; correction < MAX_CORRECTIONS; correction++) {
        // Capture screenshot
        const screenshotResult = await captureFigmaScreenshot(
          figmaToken,
          figmaFileId,
          rootNodeId,
        );

        if (!screenshotResult.ok) {
          // eslint-disable-next-line no-console
          console.warn(`        [correction ${correction + 1}] Screenshot failed: ${screenshotResult.error.message}`);
          break;
        }

        // Evaluate design
        const evalProvider = provider as unknown as import('@agentforge/providers').LLMProvider;
        const evalResult = await evaluateDesign(
          screenshotResult.value.base64,
          JSON.stringify(planningOutput, null, 2),
          evalProvider,
        );

        if (!evalResult.ok) {
          // eslint-disable-next-line no-console
          console.warn(`        [correction ${correction + 1}] Evaluation failed: ${evalResult.error.message}`);
          break;
        }

        const evaluation = evalResult.value;
        // eslint-disable-next-line no-console
        console.log(`        [correction ${correction + 1}] Score: ${evaluation.score}/100 (${evaluation.overallQuality}), issues: ${evaluation.issues.length}`);

        if (evaluation.score >= QUALITY_THRESHOLD) {
          // eslint-disable-next-line no-console
          console.log(`        [correction] Quality threshold met (${evaluation.score} >= ${QUALITY_THRESHOLD})`);
          break;
        }

        if (evaluation.issues.length === 0) {
          break;
        }

        // Execute fixes
        const fixResult = await executeDesignFixes(
          evaluation.issues,
          context.mcpClient,
          figmaNodeIds,
          evalProvider,
          figmaNodeTypes,
        );

        if (fixResult.ok) {
          // Remove deleted nodes from nodeMap and nodeTypes
          for (const deletedId of fixResult.value.deletedNodeIds) {
            for (const [name, id] of Object.entries(figmaNodeIds)) {
              if (id === deletedId) {
                delete figmaNodeIds[name];
                delete figmaNodeTypes[name];
              }
            }
          }

          // Merge newly created nodes into the nodeMap for subsequent corrections
          for (const [name, id] of Object.entries(fixResult.value.createdNodes)) {
            figmaNodeIds[name] = id;
          }
          for (const [name, type] of Object.entries(fixResult.value.createdNodeTypes)) {
            figmaNodeTypes[name] = type;
          }
          // eslint-disable-next-line no-console
          console.log(`        [correction ${correction + 1}] Fixed: ${fixResult.value.fixed}, Failed: ${fixResult.value.failed}`);

          // Wait for Figma to render the changes before next screenshot
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
          // eslint-disable-next-line no-console
          console.warn(`        [correction ${correction + 1}] Fix execution failed: ${fixResult.error.message}`);
          break;
        }
      }
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('\n        [Phase C] Skipped — set AGENTFORGE_MCP_FIGMA_TOKEN and AGENTFORGE_MCP_FIGMA_FILE_ID for visual self-correction');
  }

  return Ok({
    figmaFileId,
    figmaPageId,
    figmaNodeIds,
    moduleId,
    breakpoints,
  });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard design agent through the full governance pipeline.
 */
export const executeUXDashboardDesign = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXDashboardDesignInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_design',
    `module:${input.moduleId}`,
    `UX dashboard design for module: ${input.moduleId}`,
    uxDashboardDesignWork,
  );
};

/**
 * Register the UX dashboard design agent to respond to ComponentSpecReady events.
 */
export const registerUXDashboardDesign = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_DASHBOARD_DESIGN_CONTRACT,
): void => {
  eventBus.subscribe('ComponentSpecReady', (event: ComponentSpecReady) => {
    const input: UXDashboardDesignInput = {
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
    void executeUXDashboardDesign(contract, context, input);
  });
};
