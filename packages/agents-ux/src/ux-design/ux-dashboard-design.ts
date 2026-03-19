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
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const rawSteps = (parsed.steps as Record<string, unknown>[]) ?? [];
    const breakpoints = (parsed.breakpoints as string[]) ?? [];

    const steps: FigmaCreationStep[] = [];
    for (const step of rawSteps) {
      const tool = String(step.tool ?? '');
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
    maxTokens: 8000,
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
  const envFileId = process.env.AGENTFORGE_MCP_FIGMA_FILE_ID;

  const docResult = await context.mcpClient.callTool('figma', 'get_document_info', {});
  if (docResult.ok) {
    const docInfo = docResult.value as Record<string, unknown>;
    const currentPage = docInfo.currentPage as Record<string, unknown> | undefined;
    figmaFileId = envFileId ?? String(docInfo.fileId ?? `file-${moduleId}`);
    figmaPageId = String(currentPage?.id ?? docInfo.id ?? `page-${moduleId}`);
  } else {
    figmaFileId = envFileId ?? `file-${moduleId}`;
    figmaPageId = `page-${moduleId}`;
  }

  // Execute each creation step, resolving ref: placeholders to real node IDs
  let lastCreatedNodeId = '';
  const stepCount = steps.length;

  /** Convert hex color string to {r,g,b} 0-1 floats for Figma API. */
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  };

  for (let i = 0; i < stepCount; i++) {
    const step = steps[i];
    const stepT0 = Date.now();

    // Resolve ref:<componentRef> and legacy <parent> placeholders in params
    const resolvedParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(step.params)) {
      if (typeof value === 'string') {
        const refMatch = /^ref:(.+)$/.exec(value);
        if (refMatch) {
          const refName = refMatch[1];
          const realId = figmaNodeIds[refName];
          if (realId) {
            resolvedParams[key] = realId;
          } else {
            // eslint-disable-next-line no-console
            console.warn(`        [step ${i + 1}/${stepCount}] unresolved ref:${refName} — known refs: ${Object.keys(figmaNodeIds).join(', ')}`);
            resolvedParams[key] = value; // leave unresolved (will error in Figma)
          }
        } else if (value === '<parent>' && lastCreatedNodeId) {
          // Legacy fallback: <parent> → last created node
          resolvedParams[key] = lastCreatedNodeId;
        } else {
          resolvedParams[key] = value;
        }
      } else {
        resolvedParams[key] = value;
      }
    }

    // ── Param transforms: bridge bypasses MCP server, so we must match plugin's expected format ──

    /** Wrap flat r,g,b,a or hex string into { r, g, b, a } color object. */
    const wrapColor = (params: Record<string, unknown>, colorKey: string): void => {
      const raw = params[colorKey];
      if (typeof raw === 'string') {
        const rgb = hexToRgb(raw);
        if (rgb) params[colorKey] = { ...rgb, a: 1 };
      } else if (raw === undefined && typeof params.r === 'number') {
        params[colorKey] = {
          r: params.r, g: params.g, b: params.b,
          a: typeof params.a === 'number' ? params.a : 1,
        };
        delete params.r; delete params.g; delete params.b; delete params.a;
      }
    };

    // set_fill_color: plugin expects { nodeId, color: { r, g, b, a } }
    if (step.tool === 'set_fill_color') {
      wrapColor(resolvedParams, 'color');
    }

    // set_stroke_color: plugin expects { nodeId, color: { r, g, b, a }, weight? }
    if (step.tool === 'set_stroke_color') {
      wrapColor(resolvedParams, 'color');
    }

    // set_layout_mode: plugin expects { nodeId, layoutMode, layoutWrap? }
    // LLM may send "mode" instead of "layoutMode"
    if (step.tool === 'set_layout_mode') {
      if (resolvedParams.mode && !resolvedParams.layoutMode) {
        resolvedParams.layoutMode = resolvedParams.mode;
        delete resolvedParams.mode;
      }
      // spacing/padding are separate commands — strip them here
      delete resolvedParams.spacing;
      delete resolvedParams.paddingLeft;
      delete resolvedParams.paddingRight;
      delete resolvedParams.paddingTop;
      delete resolvedParams.paddingBottom;
    }

    // create_frame: wrap fillColor/strokeColor into objects if flat r,g,b
    if (step.tool === 'create_frame') {
      if (resolvedParams.fillColor && typeof resolvedParams.fillColor !== 'object') {
        const rgb = typeof resolvedParams.fillColor === 'string' ? hexToRgb(resolvedParams.fillColor as string) : null;
        if (rgb) resolvedParams.fillColor = { ...rgb, a: 1 };
      }
      if (resolvedParams.strokeColor && typeof resolvedParams.strokeColor !== 'object') {
        const rgb = typeof resolvedParams.strokeColor === 'string' ? hexToRgb(resolvedParams.strokeColor as string) : null;
        if (rgb) resolvedParams.strokeColor = { ...rgb, a: 1 };
      }
      // Remap "mode" → "layoutMode" if present
      if (resolvedParams.mode && !resolvedParams.layoutMode) {
        resolvedParams.layoutMode = resolvedParams.mode;
        delete resolvedParams.mode;
      }
    }

    // create_text: fontWeight must be numeric, fontColor must be object
    if (step.tool === 'create_text') {
      if (typeof resolvedParams.fontWeight === 'string') {
        resolvedParams.fontWeight = parseInt(resolvedParams.fontWeight as string, 10) || 400;
      }
      if (resolvedParams.fontColor && typeof resolvedParams.fontColor === 'string') {
        const rgb = hexToRgb(resolvedParams.fontColor as string);
        if (rgb) resolvedParams.fontColor = { ...rgb, a: 1 };
      }
    }

    const prefix = step.tool.startsWith('get_') ? 'figma' : 'figma-write';
    const toolResult = await context.mcpClient.callTool(prefix, step.tool, resolvedParams);
    const stepMs = Date.now() - stepT0;

    if (toolResult.ok) {
      const result = toolResult.value as Record<string, unknown>;
      if (step.componentRef) {
        const nodeId = String(result.nodeId ?? result.id ?? '');
        if (nodeId) {
          figmaNodeIds[step.componentRef] = nodeId;
          lastCreatedNodeId = nodeId;
        }
      }
      // eslint-disable-next-line no-console
      console.log(`        [step ${i + 1}/${stepCount}] ${step.tool} → OK (${stepMs}ms)`);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`        [step ${i + 1}/${stepCount}] ${step.tool} → ERR: ${toolResult.error.message} (${stepMs}ms)`);
    }
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
