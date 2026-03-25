/**
 * @module @agentforge/agents-ux/ux-dashboard-planning
 *
 * UX Dashboard Planning agent: translates design briefs into component specs
 * with token bindings, responsive rules, and 4-stage implementation sequences.
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
  DesignTokensSpec,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readSpecs,
  loadDesignTokens,
  loadBrandSpec,
  loadComponentLibrary,
  recordPromptTrace,
} from '@agentforge/core';
import type { UXDashboardResearchOutput } from '../ux-research/ux-dashboard-research.js';
import type { ComponentTreeNode, ResponsiveRule, ImplementationStage, ScreenDefinition } from '../types.js';
import { diskDesignTokensRequiredErr, diskDesignTokensRequiredMessage } from '../disk-design-tokens-required.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard planning agent. */
export interface UXDashboardPlanningInput {
  readonly briefId: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly designBrief: UXDashboardResearchOutput;
}

/** Output produced by the UX dashboard planning agent. */
export interface UXDashboardPlanningOutput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly componentTree: readonly ComponentTreeNode[];
  readonly tokenBindings: Readonly<Record<string, string>>;
  readonly responsiveRules: readonly ResponsiveRule[];
  readonly implementationStages: readonly ImplementationStage[];
  /** Optional screen partitioning for per-screen design generation. */
  readonly screens?: readonly ScreenDefinition[];
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard planning agent. */
export const UX_DASHBOARD_PLANNING_CONTRACT: AgentContract = {
  role: 'ux_dashboard_planning',
  description: 'Translates design briefs into component specs with token bindings, responsive rules, and 4-stage implementation sequences',
  category: 'design',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 30000 },
  tools: [],
  permissions: ['read_spec', 'read_design', 'read_design_system', 'write_spec'],
  denied: ['write_code', 'create_branch'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 30000, max_cost_per_task_usd: 1.0 },
  on_complete: 'ComponentSpecReady',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-dashboard-planning-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse the LLM output as a UX dashboard planning JSON object. */
export const parsePlanningOutput = (output: string): Result<UXDashboardPlanningOutput> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return Ok({
      specRef: (parsed.specRef as string) ?? '',
      moduleId: (parsed.moduleId as string) ?? '',
      componentTree: (parsed.componentTree as ComponentTreeNode[]) ?? [],
      tokenBindings: (parsed.tokenBindings as Record<string, string>) ?? {},
      responsiveRules: (parsed.responsiveRules as ResponsiveRule[]) ?? [],
      implementationStages: (parsed.implementationStages as ImplementationStage[]) ?? [],
      screens: (parsed.screens as ScreenDefinition[] | undefined),
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse UX dashboard planning output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

// ============================================================================
// Token name helpers
// ============================================================================

/**
 * Extract the set of valid token names from a DesignTokensSpec.
 * Includes semantic color names, typography role names, spacing scale values,
 * and border radius names.
 */
export const extractValidTokenNames = (spec: DesignTokensSpec): Set<string> => {
  const names = new Set<string>();

  // Semantic color names (e.g., "background-primary", "surface-primary", "text-primary")
  for (const name of Object.keys(spec.colors.semantic)) {
    names.add(name);
  }

  // Typography role names (e.g., "heading-1", "body", "label")
  for (const entry of spec.typography.scale) {
    names.add(entry.role);
  }

  // Spacing scale values as strings (e.g., "4", "8", "24", "32")
  for (const value of spec.spacing.scale) {
    names.add(String(value));
  }

  // Border radius names (e.g., "small", "medium", "large", "pill")
  for (const name of Object.keys(spec.borders.radius)) {
    names.add(name);
  }

  return names;
};

/**
 * Build a token name allowlist section for the user message.
 * This explicitly tells the LLM which token names are valid.
 */
const buildTokenAllowlist = (spec: DesignTokensSpec): string => {
  const semanticColors = Object.keys(spec.colors.semantic).join(', ');
  const typographyRoles = spec.typography.scale.map(e => e.role).join(', ');
  const spacingValues = spec.spacing.scale.join(', ');
  const radiusNames = Object.keys(spec.borders.radius).join(', ');

  return `\n\nVALID TOKEN NAMES (use ONLY these in tokenBindings — any other name will fail downstream):
- Semantic colors: ${semanticColors}
- Typography roles: ${typographyRoles}
- Spacing values (px): ${spacingValues}
- Border radius: ${radiusNames}

IMPORTANT: Do NOT invent names like "color.surface.primary", "color.border.input", "spacing.lg", or "color.text.inverse". Use the exact names listed above.`;
};

/** Common dot-notation → semantic name mappings for warning messages. */
const DOT_NOTATION_HINTS: Record<string, string> = {
  'color.background.primary': 'background-primary',
  'color.surface.primary': 'surface-primary',
  'color.surface.secondary': 'surface-secondary',
  'color.surface.tertiary': 'surface-elevated',
  'color.surface.elevated': 'surface-elevated',
  'color.surface.accent': 'surface-elevated',
  'color.surface.disabled': 'surface-secondary',
  'color.text.primary': 'text-primary',
  'color.text.secondary': 'text-secondary',
  'color.text.inverse': 'text-on-cta',
  'color.text.accent': 'cta-primary',
  'color.text.disabled': 'text-disabled',
  'color.border.default': 'border-default',
  'color.border.input': 'border-default',
  'color.border.subtle': 'border-default',
  'color.border.focus': 'border-focus',
  'color.border.error': 'border-error',
  'color.primary': 'cta-primary',
  'color.error': 'error',
  'color.success': 'success',
  'color.warning': 'warning',
  'spacing.xs': '4',
  'spacing.sm': '8',
  'spacing.md': '16',
  'spacing.lg': '24',
  'spacing.xl': '32',
  'spacing.2xl': '48',
};

/**
 * Validate tokenBindings values against known token names.
 * Returns a list of warning messages for any unrecognized values.
 */
export const validateTokenBindings = (
  bindings: Readonly<Record<string, string>>,
  validNames: Set<string>,
): string[] => {
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(bindings)) {
    if (validNames.has(value)) continue;

    const hint = DOT_NOTATION_HINTS[value];
    if (hint) {
      warnings.push(`  "${key}": "${value}" → should be "${hint}" (dot-notation is not a valid token name)`);
    } else {
      warnings.push(`  "${key}": "${value}" is not a recognized token name`);
    }
  }

  return warnings;
};

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard planning agent's work function.
 * Called by runAgent after governance clears.
 */
export const uxDashboardPlanningWork: AgentWorkFn<UXDashboardPlanningInput, UXDashboardPlanningOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, designBrief } = input;

  // ── Input validation guards ──
  if (!moduleId) {
    return Err({ code: 'INVALID_STATE' as const, message: 'Planning input missing moduleId', recoverable: false });
  }
  if (!designBrief || !designBrief.briefId) {
    return Err({ code: 'INVALID_STATE' as const, message: 'Planning input missing designBrief — run research stage first', recoverable: false });
  }
  if (designBrief.designConstraints.length === 0 && designBrief.referencePatterns.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[planning] Warning: designBrief has no constraints or reference patterns — research output may be incomplete.');
  }

  // 1. Read existing specs for context
  const specDir = join(context.projectRoot, 'agentforge/spec');
  const existingSpecs = readSpecs(specDir, context.fs);
  const specsContent = existingSpecs.ok ? JSON.stringify(existingSpecs.value) : '{}';

  // 2. Design tokens — disk only (agentforge/spec/design-tokens.yaml); no MCP fallback
  const diskTokens = loadDesignTokens(context.projectRoot, context.fs);
  if (!diskTokens.ok) {
    // eslint-disable-next-line no-console
    console.error(diskDesignTokensRequiredMessage(context.projectRoot));
    return diskDesignTokensRequiredErr(context.projectRoot);
  }

  let tokenContext =
    `\nDesign Tokens (from project spec — design-tokens.yaml):\n${JSON.stringify(diskTokens.value, null, 2)}`;
  const validTokenNames = extractValidTokenNames(diskTokens.value);
  tokenContext += buildTokenAllowlist(diskTokens.value);
  const diskBrand = loadBrandSpec(context.projectRoot, context.fs);
  if (diskBrand.ok) {
    tokenContext += `\n\nBrand Spec (from project spec — brand.yaml):\n${JSON.stringify(diskBrand.value, null, 2)}`;
  }

  // 2b. Load component library for reference in token bindings
  const componentLibResult = loadComponentLibrary(context.projectRoot, context.fs);
  let componentLibContext = '';
  if (componentLibResult.ok) {
    const lib = componentLibResult.value;
    const mappingLines = Object.entries(lib.react_mappings).map(([component, mapping]) => {
      const variantNote = mapping.variant_prop ? ` (variant prop: ${mapping.variant_prop})` : '';
      return `- ${component}: ${mapping.component_name}${variantNote}`;
    });
    componentLibContext = `\nComponent Library: ${lib.library_name}\nAvailable components:\n${mappingLines.join('\n')}\n\nUse these component names in your componentTree and tokenBindings where applicable.`;
  }

  // 3. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessageParts = [
    `Module ID: ${moduleId}`,
    `\nDesign Brief:\n${JSON.stringify(designBrief, null, 2)}`,
    `\nExisting specs:\n${specsContent}`,
  ];

  if (tokenContext) {
    userMessageParts.push(tokenContext);
  }

  if (componentLibContext) {
    userMessageParts.push(componentLibContext);
  }

  if (learnings.length > 0) {
    userMessageParts.push(`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`);
  }

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessageParts.join('\n') }],
  };

  // 3a. Record prompt trace
  recordPromptTrace(context, 'planning', prompt, {
    model: UX_DASHBOARD_PLANNING_CONTRACT.provider,
    maxTokens: 8000,
  });

  // 3. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: UX_DASHBOARD_PLANNING_CONTRACT.provider,
    maxTokens: 8000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // 4. Parse output
  const parseResult = parsePlanningOutput(llmOutput);
  if (!parseResult.ok) {
    return parseResult;
  }

  // 5. Validate tokenBindings against known token names
  if (validTokenNames && Object.keys(parseResult.value.tokenBindings).length > 0) {
    const warnings = validateTokenBindings(parseResult.value.tokenBindings, validTokenNames);
    if (warnings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[planning] tokenBindings validation warnings:\n${warnings.join('\n')}`);
    }
  }

  return Ok(parseResult.value);
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard planning agent through the full governance pipeline.
 */
export const executeUXDashboardPlanning = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXDashboardPlanningInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_design',
    `module:${input.moduleId}`,
    `UX dashboard planning for module: ${input.moduleId}`,
    uxDashboardPlanningWork,
  );
};

/**
 * Register the UX dashboard planning agent to respond to DesignBriefCompleted events.
 */
export const registerUXDashboardPlanning = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_DASHBOARD_PLANNING_CONTRACT,
): void => {
  eventBus.subscribe('DesignBriefCompleted', (event) => {
    const input: UXDashboardPlanningInput = {
      briefId: event.briefId,
      moduleId: event.moduleId,
      taskId: event.taskId,
      designBrief: event as unknown as UXDashboardResearchOutput,
    };
    void executeUXDashboardPlanning(contract, context, input);
  });
};
