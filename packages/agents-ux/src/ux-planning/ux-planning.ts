/**
 * @module @agentforge/agents-ux/ux-planning
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
  BrandSpec,
  DesignConfig,
  PageContext,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readSpecs,
  recordPromptTrace,
  recordPromptTraceResponse,
  debugLog,
  logDefaults,
} from '@agentforge/core';
import type { UXResearchOutput } from '../ux-research/ux-research.js';
import type { ComponentTreeNode, ResponsiveRule, ScreenDefinition } from '../types.js';
import { diskDesignTokensRequiredErr, diskDesignTokensRequiredMessage } from '../disk-design-tokens-required.js';
import { formatPageContextPrompt } from '../page-context-prompt.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard planning agent. */
export interface UXPlanningInput {
  readonly briefId: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly designBrief: UXResearchOutput;
  /** Optional design config from project manifest for viewport constraints. */
  readonly designConfig?: DesignConfig;
  /** Structured page context from pages.yaml for spec-driven design. */
  readonly pageContext?: PageContext;
}

/** Output produced by the UX dashboard planning agent. */
export interface UXPlanningOutput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly componentTree: readonly ComponentTreeNode[];
  readonly tokenBindings: Readonly<Record<string, string>>;
  readonly responsiveRules: readonly ResponsiveRule[];
  /** Optional screen partitioning for per-screen design generation. */
  readonly screens?: readonly ScreenDefinition[];
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard planning agent. */
export const UX_PLANNING_CONTRACT: AgentContract = {
  role: 'ux_planning',
  description: 'Translates design briefs into component specs with token bindings and responsive rules',
  category: 'design',
  provider: 'claude-sonnet-4-6',
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
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-planning-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Structured output schema
// ============================================================================

/** JSON Schema for structured output via Anthropic output_config.
 *  Anthropic requires additionalProperties: false on all object types. */
const PLANNING_OUTPUT_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      specRef: { type: 'string' },
      moduleId: { type: 'string' },
      componentTree: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            props: { type: 'array', items: { type: 'string' } },
            children: { type: 'array', items: { type: 'string' } },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
      tokenBindings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['key', 'value'],
          additionalProperties: false,
        },
      },
      responsiveRules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            breakpoint: { type: 'string' },
            behavior: { type: 'string' },
            width: { type: 'number' },
            layout: { type: 'string' },
            changes: { type: 'array', items: { type: 'string' } },
          },
          required: ['breakpoint', 'behavior'],
          additionalProperties: false,
        },
      },
      screens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            components: { type: 'array', items: { type: 'string' } },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    required: ['specRef', 'moduleId', 'componentTree', 'tokenBindings', 'responsiveRules'],
    additionalProperties: false,
  },
};

/**
 * Normalize tokenBindings from either an object (text fallback) or
 * an array of {key, value} pairs (structured output schema).
 */
const normalizeTokenBindings = (raw: unknown): Record<string, string> => {
  if (Array.isArray(raw)) {
    const bindings: Record<string, string> = {};
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && 'key' in entry && 'value' in entry) {
        bindings[entry.key as string] = entry.value as string;
      }
    }
    return bindings;
  }
  if (raw && typeof raw === 'object') {
    return raw as Record<string, string>;
  }
  return {};
};

/**
 * Extract a UXPlanningOutput from a parsed JSON object.
 * Used by both the structured output path and the text-fallback parser.
 */
const extractPlanningFields = (parsed: Record<string, unknown>): UXPlanningOutput => {
  logDefaults('extractPlanningFields', {
    specRef: [parsed.specRef, "''"],
    moduleId: [parsed.moduleId, "''"],
    componentTree: [parsed.componentTree, '[]'],
    responsiveRules: [parsed.responsiveRules, '[]'],
  });

  return {
    specRef: (parsed.specRef as string) ?? '',
    moduleId: (parsed.moduleId as string) ?? '',
    componentTree: (parsed.componentTree as ComponentTreeNode[]) ?? [],
    tokenBindings: normalizeTokenBindings(parsed.tokenBindings),
    responsiveRules: (parsed.responsiveRules as ResponsiveRule[]) ?? [],
    screens: (parsed.screens as ScreenDefinition[] | undefined),
  };
};

// ============================================================================
// Output parser (text fallback)
// ============================================================================

/** Parse the LLM output as a UX dashboard planning JSON object (text fallback). */
export const parsePlanningOutput = (output: string): Result<UXPlanningOutput> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return Ok(extractPlanningFields(parsed));
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
 * border radius names, elevation levels, layout tokens, breakpoints,
 * touch targets, z-index names, and brand motion tokens.
 */
export const extractValidTokenNames = (spec: DesignTokensSpec, brand?: BrandSpec): Set<string> => {
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
  // Zero spacing is a valid design choice (e.g., no gap, no padding)
  names.add('0');
  for (const value of spec.spacing.scale) {
    names.add(String(value));
  }

  // Border radius names (e.g., "small", "medium", "large", "pill")
  for (const name of Object.keys(spec.borders.radius)) {
    names.add(name);
  }

  // Elevation levels (e.g., "elevation-0", "elevation-1")
  if (spec.elevation?.levels) {
    for (const entry of spec.elevation.levels) {
      names.add(`elevation-${entry.level}`);
    }
  }

  // Layout tokens
  if (spec.layout) {
    names.add('content-max-width');
    if (spec.layout.grid) {
      names.add('grid-columns');
      names.add('grid-gutter');
      names.add('grid-margin');
    }
    // Breakpoint names (e.g., "breakpoint-mobile", "breakpoint-tablet")
    if (spec.layout.breakpoints) {
      for (const name of Object.keys(spec.layout.breakpoints)) {
        names.add(`breakpoint-${name}`);
      }
    }
  }

  // Touch targets
  if (spec.touch_targets) {
    names.add('touch-min-height');
    names.add('touch-min-width');
  }

  // Z-index names (e.g., "z-dropdown", "z-modal")
  if (spec.z_index) {
    for (const name of Object.keys(spec.z_index)) {
      names.add(`z-${name}`);
    }
  }

  // Brand motion tokens
  if (brand?.motion_principles) {
    names.add('duration-base');
    names.add('easing-default');
  }

  return names;
};

/**
 * Build a token name allowlist section for the user message.
 * This explicitly tells the LLM which token names are valid.
 */
const buildTokenAllowlist = (spec: DesignTokensSpec, brand?: BrandSpec): string => {
  const semanticColors = Object.keys(spec.colors.semantic).join(', ');
  const typographyRoles = spec.typography.scale.map(e => e.role).join(', ');
  const spacingValues = spec.spacing.scale.join(', ');
  const radiusNames = Object.keys(spec.borders.radius).join(', ');

  const sections = [
    `- Semantic colors: ${semanticColors}`,
    `- Typography roles: ${typographyRoles}`,
    `- Spacing values (px): ${spacingValues}`,
    `- Border radius: ${radiusNames}`,
  ];

  if (spec.elevation?.levels) {
    const elevationNames = spec.elevation.levels.map(e => `elevation-${e.level}`).join(', ');
    sections.push(`- Elevation: ${elevationNames} (not raw box-shadow values like "0 2px 8px rgba(...)")`);
  }

  if (spec.layout) {
    const layoutNames = ['content-max-width'];
    if (spec.layout.grid) {
      layoutNames.push('grid-columns', 'grid-gutter', 'grid-margin');
    }
    if (spec.layout.breakpoints) {
      for (const name of Object.keys(spec.layout.breakpoints)) {
        layoutNames.push(`breakpoint-${name}`);
      }
    }
    sections.push(`- Layout: ${layoutNames.join(', ')} (not raw numbers like "1280")`);
  }

  if (spec.touch_targets) {
    sections.push(`- Touch targets: touch-min-height, touch-min-width (not raw numbers like "44")`);
  }

  if (spec.z_index) {
    const zNames = Object.keys(spec.z_index).map(n => `z-${n}`).join(', ');
    sections.push(`- Z-index: ${zNames} (not raw numbers like "1000")`);
  }

  if (brand?.motion_principles) {
    sections.push(`- Animation: duration-base, easing-default (not raw values like "200")`);
  }

  return `\n\nVALID TOKEN NAMES (use ONLY these in tokenBindings — any other name will fail downstream):
${sections.join('\n')}

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
  'text-on-primary': 'text-on-cta',
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
  // Elevation
  'elevation.0': 'elevation-0',
  'elevation.1': 'elevation-1',
  'elevation.2': 'elevation-2',
  'elevation.3': 'elevation-3',
  'shadow.0': 'elevation-0',
  'shadow.1': 'elevation-1',
  'shadow.2': 'elevation-2',
  'shadow.3': 'elevation-3',
  // Layout
  'layout.maxWidth': 'content-max-width',
  'layout.contentMaxWidth': 'content-max-width',
  'layout.max_width': 'content-max-width',
  'layout.gridColumns': 'grid-columns',
  'layout.gridGutter': 'grid-gutter',
  'layout.gridMargin': 'grid-margin',
  // Touch targets
  'touch.minHeight': 'touch-min-height',
  'touch.minWidth': 'touch-min-width',
  'touch.minimum_height': 'touch-min-height',
  'touch.minimum_width': 'touch-min-width',
  'touchTarget.minHeight': 'touch-min-height',
  'touchTarget.minWidth': 'touch-min-width',
  // Z-index
  'zIndex.dropdown': 'z-dropdown',
  'zIndex.sticky': 'z-sticky',
  'zIndex.modal': 'z-modal',
  'zIndex.toast': 'z-toast',
  'zIndex.tooltip': 'z-tooltip',
  'z_index.dropdown': 'z-dropdown',
  'z_index.sticky': 'z-sticky',
  'z_index.modal': 'z-modal',
  'z_index.toast': 'z-toast',
  'z_index.tooltip': 'z-tooltip',
  // Motion
  'motion.duration': 'duration-base',
  'motion.durationBase': 'duration-base',
  'motion.easing': 'easing-default',
  'animation.duration': 'duration-base',
  'animation.easing': 'easing-default',
};

/**
 * Regex patterns for non-token binding keys.
 * Shared between filterNonTokenBindings() and applyDotNotationFallback() safety net.
 * Defined at module level to prevent drift.
 */

// These key suffixes are NEVER design tokens regardless of value
const ALWAYS_NON_TOKEN_KEYS = /\.(columns|rows|itemCount|maxItems|ariaLive|ariaLabel|role)$/;

// These key suffixes are non-tokens ONLY when the value is not a recognized token name
const DIMENSION_KEYS = /\.(width|height|maxWidth|minWidth|maxHeight|minHeight|cardWidth|imageHeight|thumbnailSize|columnWidth|buttonSize|searchMaxWidth)$/;

/**
 * Remove entries from tokenBindings that are fundamentally not design tokens.
 * These are component-specific dimensions, counts, and accessibility attributes
 * that the LLM incorrectly places in tokenBindings instead of defaultValues.
 *
 * Filter logic uses BOTH key suffix AND value to avoid false positives:
 * - Keys like .ariaLive, .columns are ALWAYS non-tokens (regardless of value)
 * - Keys like .width, .height are non-tokens ONLY when the value is not a valid token name
 *   (e.g., "280" is not a token, but "touch-min-height" could be)
 */
export function filterNonTokenBindings(
  bindings: Record<string, string>,
  validNames: Set<string>,
): { cleaned: Record<string, string>; removed: string[] } {
  const cleaned: Record<string, string> = {};
  const removed: string[] = [];

  for (const [key, value] of Object.entries(bindings)) {
    if (ALWAYS_NON_TOKEN_KEYS.test(key)) {
      removed.push(key);
    } else if (DIMENSION_KEYS.test(key) && !validNames.has(value)) {
      removed.push(key);
    } else {
      cleaned[key] = value;
    }
  }

  return { cleaned, removed };
}

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

/** Maximum number of token binding correction retries. */
const MAX_TOKEN_BINDING_RETRIES = 2;

/**
 * Parse a tokenBindings-only correction response from the LLM.
 * Accepts both bare JSON and code-fenced JSON.
 */
export const parseTokenBindingsCorrection = (output: string): Record<string, string> | null => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const bindings = parsed.tokenBindings as Record<string, string> | undefined;
    if (bindings && typeof bindings === 'object') {
      return bindings;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Build a focused correction prompt for the LLM to fix only tokenBindings.
 * Includes the validation errors and the complete valid name list.
 */
const buildTokenCorrectionPrompt = (
  originalOutput: string,
  warnings: string[],
  validNames: Set<string>,
): string => {
  const validNamesList = Array.from(validNames).join(', ');
  return `Your previous output contained invalid token binding names. Here are the problems:

IMPORTANT: If a property is a component-specific dimension (width, height, maxWidth, cardWidth, imageHeight, buttonSize, thumbnailSize, etc.), a count (columns, rows), or an accessibility attribute (ariaLive, ariaLabel), REMOVE it from tokenBindings entirely. These are NOT design tokens — they belong in the component's defaultValues, not in tokenBindings. Do not try to find a matching token name for these properties; just remove them.

${warnings.join('\n')}

The ONLY valid token names are: ${validNamesList}

Please output a corrected JSON object with ONLY the "tokenBindings" field. Use exact names from the valid list above. Do NOT use dot-notation (like "color.surface.primary") or invent names.

Your previous full output was:
${originalOutput}

Respond with ONLY a JSON object like:
\`\`\`json
{
  "tokenBindings": {
    "Component.property": "valid-token-name"
  }
}
\`\`\``;
};

/**
 * Apply deterministic DOT_NOTATION_HINTS corrections as a last-resort fallback.
 * Returns a corrected copy of the bindings and lists of corrections made / remaining issues.
 */
export const applyDotNotationFallback = (
  bindings: Readonly<Record<string, string>>,
  validNames: Set<string>,
): { corrected: Record<string, string>; corrections: string[]; remaining: string[] } => {
  const corrected: Record<string, string> = { ...bindings };
  const corrections: string[] = [];
  const remaining: string[] = [];

  for (const [key, value] of Object.entries(corrected)) {
    if (validNames.has(value)) continue;

    const hint = DOT_NOTATION_HINTS[value];
    if (hint && validNames.has(hint)) {
      corrected[key] = hint;
      corrections.push(`  "${key}": "${value}" → "${hint}"`);
    } else {
      remaining.push(`  "${key}": "${value}" has no known mapping`);
    }
  }

  // Final cleanup: strip any remaining non-token bindings that slipped through
  for (const key of Object.keys(corrected)) {
    if (ALWAYS_NON_TOKEN_KEYS.test(key)) {
      delete corrected[key];
    } else if (DIMENSION_KEYS.test(key) && !validNames.has(corrected[key])) {
      delete corrected[key];
    }
  }

  return { corrected, corrections, remaining };
};

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard planning agent's work function.
 * Called by runAgent after governance clears.
 */
export const uxPlanningWork: AgentWorkFn<UXPlanningInput, UXPlanningOutput> = async (
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

  // 2. Design tokens — extracted from readSpecs result (no redundant disk reads)
  const tokensSpec = existingSpecs.ok ? existingSpecs.value.designTokens : undefined;
  if (!tokensSpec) {
    // eslint-disable-next-line no-console
    console.error(diskDesignTokensRequiredMessage(context.projectRoot));
    return diskDesignTokensRequiredErr(context.projectRoot);
  }

  const brandSpec = existingSpecs.ok ? existingSpecs.value.brand : undefined;
  const validTokenNames = extractValidTokenNames(tokensSpec, brandSpec);
  let tokenContext =
    `\nDesign Tokens (from project spec — design-tokens.yaml):\n${JSON.stringify(tokensSpec, null, 2)}`;
  tokenContext += buildTokenAllowlist(tokensSpec, brandSpec);
  if (brandSpec) {
    tokenContext += `\n\nBrand Spec (from project spec — brand.yaml):\n${JSON.stringify(brandSpec, null, 2)}`;
  }

  // 2b. Component library for reference in token bindings (from readSpecs)
  const componentLibSpec = existingSpecs.ok ? existingSpecs.value.componentLibrary : undefined;
  let componentLibContext = '';
  if (componentLibSpec) {
    const lib = componentLibSpec;
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

  // Inject viewport configuration constraints from project manifest
  if (input.designConfig) {
    const { responsive_breakpoints, primary_viewport, layout_strategy } = input.designConfig;
    if (responsive_breakpoints === false) {
      userMessageParts.push(
        `\n## Viewport Configuration\nThis project is configured for desktop-only at ${primary_viewport}px. Generate responsiveRules for desktop only. Do NOT include tablet or mobile breakpoints — they will be added later when responsive_breakpoints is enabled.`,
      );
    } else if (responsive_breakpoints === true) {
      const breakpoints = layout_strategy === 'mobile-first'
        ? [375, 768, 1440]
        : [1440, 768, 375];
      userMessageParts.push(
        `\n## Viewport Configuration\nTarget breakpoints: ${breakpoints.join('px, ')}px (${layout_strategy}). Generate responsiveRules for all listed breakpoints.`,
      );
    } else if (Array.isArray(responsive_breakpoints) && responsive_breakpoints.length > 0) {
      userMessageParts.push(
        `\n## Viewport Configuration\nTarget breakpoints: ${responsive_breakpoints.join('px, ')}px (${layout_strategy}). Generate responsiveRules for all listed breakpoints.`,
      );
    }
  }

  if (learnings.length > 0) {
    userMessageParts.push(`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`);
  }

  // Inject structured page context if available
  if (input.pageContext) {
    userMessageParts.push(formatPageContextPrompt(input.pageContext));
  }

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessageParts.join('\n') }],
  };

  // 3a. Record prompt trace
  recordPromptTrace(context, 'planning', prompt, {
    model: UX_PLANNING_CONTRACT.provider,
    maxTokens: 8000,
  });

  // 3. Call LLM with structured output schema
  if (!context.resolvedModel) {
    debugLog(`[planning] resolvedModel not set, falling back to contract default: ${UX_PLANNING_CONTRACT.provider}`);
  }

  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? UX_PLANNING_CONTRACT.provider,
    maxTokens: 8000,
    temperature: 0,
    responseSchema: PLANNING_OUTPUT_SCHEMA,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // Record response trace
  const planningCompletion = completionResult.value as { content: string; structured?: Record<string, unknown>; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }; cost?: { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number }; latencyMs?: number; finishReason?: string };
  recordPromptTraceResponse(context, 'planning', {
    content: planningCompletion.content,
    structured: planningCompletion.structured,
    usage: planningCompletion.usage,
    cost: planningCompletion.cost,
    latencyMs: planningCompletion.latencyMs,
    finishReason: planningCompletion.finishReason,
  });

  // 4. Parse output — prefer structured output, fall back to text parsing
  const structured = (completionResult.value as { structured?: Record<string, unknown> }).structured;
  const parseResult = structured
    ? Ok(extractPlanningFields(structured))
    : parsePlanningOutput(llmOutput);
  if (!parseResult.ok) {
    return parseResult;
  }

  // 5. Validate and retry tokenBindings against known token names
  let finalOutput = parseResult.value;

  if (validTokenNames && Object.keys(finalOutput.tokenBindings).length > 0) {
    // Filter out non-token bindings before validation to avoid wasting correction retries
    {
      const { cleaned, removed } = filterNonTokenBindings(
        finalOutput.tokenBindings as Record<string, string>,
        validTokenNames,
      );
      if (removed.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[planning] Removed ${removed.length} non-token bindings (component dimensions/counts/a11y attributes): ${removed.join(', ')}`,
        );
        finalOutput = { ...finalOutput, tokenBindings: cleaned };
      }
    }

    let warnings = validateTokenBindings(finalOutput.tokenBindings, validTokenNames);

    // Apply deterministic DOT_NOTATION_HINTS corrections BEFORE LLM retries.
    // This resolves ~40% of invalid bindings without an extra LLM call.
    if (warnings.length > 0) {
      const { corrected, corrections, remaining } = applyDotNotationFallback(
        finalOutput.tokenBindings,
        validTokenNames,
      );
      finalOutput = { ...finalOutput, tokenBindings: corrected };

      if (corrections.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[planning] Applied deterministic token corrections (pre-LLM):\n${corrections.join('\n')}`);
      }
      // Re-validate after deterministic fix — only remaining issues need LLM
      warnings = remaining.length > 0
        ? validateTokenBindings(corrected, validTokenNames)
        : [];
    }

    for (let attempt = 0; attempt < MAX_TOKEN_BINDING_RETRIES && warnings.length > 0; attempt++) {
      // eslint-disable-next-line no-console
      console.warn(
        `[planning] tokenBindings validation failed (attempt ${attempt + 1}/${MAX_TOKEN_BINDING_RETRIES}), requesting LLM correction:\n${warnings.join('\n')}`,
      );

      const correctionMessage = buildTokenCorrectionPrompt(llmOutput, warnings, validTokenNames);

      const retryPrompt = {
        system: prompt.system,
        messages: [
          ...prompt.messages,
          { role: 'assistant' as const, content: llmOutput },
          { role: 'user' as const, content: correctionMessage },
        ],
      };

      recordPromptTrace(context, 'planning-token-correction', retryPrompt, {
        model: UX_PLANNING_CONTRACT.provider,
        maxTokens: 2000,
      });

      const retryResult = await provider.complete(retryPrompt, {
        model: context.resolvedModel ?? UX_PLANNING_CONTRACT.provider,
        maxTokens: 2000,
        temperature: 0,
      });

      if (!retryResult.ok) {
        // eslint-disable-next-line no-console
        console.warn('[planning] Token binding correction LLM call failed, falling back to DOT_NOTATION_HINTS');
        break;
      }

      const retryContent = (retryResult.value as { content: string }).content;

      // Record correction response trace
      const correctionCompletion = retryResult.value as { content: string; usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }; cost?: { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number }; latencyMs?: number; finishReason?: string };
      recordPromptTraceResponse(context, 'planning-token-correction', {
        content: correctionCompletion.content,
        usage: correctionCompletion.usage,
        cost: correctionCompletion.cost,
        latencyMs: correctionCompletion.latencyMs,
        finishReason: correctionCompletion.finishReason,
      });

      const correctedBindings = parseTokenBindingsCorrection(retryContent);

      if (correctedBindings) {
        // Filter non-token bindings from corrected output too
        const { cleaned: filteredCorrected, removed: retryRemoved } = filterNonTokenBindings(correctedBindings, validTokenNames);
        if (retryRemoved.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[planning] Removed ${retryRemoved.length} non-token bindings from correction: ${retryRemoved.join(', ')}`,
          );
        }
        finalOutput = { ...finalOutput, tokenBindings: filteredCorrected };
        warnings = validateTokenBindings(filteredCorrected, validTokenNames);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[planning] Failed to parse correction response, falling back to DOT_NOTATION_HINTS');
        break;
      }
    }

    // Final pass: re-apply deterministic fallback after LLM corrections
    if (warnings.length > 0) {
      const { corrected, corrections, remaining } = applyDotNotationFallback(
        finalOutput.tokenBindings,
        validTokenNames,
      );
      finalOutput = { ...finalOutput, tokenBindings: corrected };

      if (corrections.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[planning] Applied deterministic token corrections (post-LLM):\n${corrections.join('\n')}`);
      }
      if (remaining.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[planning] Unresolvable token bindings (accepted with warnings):\n${remaining.join('\n')}`);
      }
    }
  }

  return Ok(finalOutput);
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard planning agent through the full governance pipeline.
 */
export const executeUXPlanning = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXPlanningInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_design',
    `module:${input.moduleId}`,
    `UX dashboard planning for module: ${input.moduleId}`,
    uxPlanningWork,
  );
};

/**
 * Register the UX dashboard planning agent to respond to DesignBriefCompleted events.
 */
export const registerUXPlanning = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_PLANNING_CONTRACT,
): void => {
  eventBus.subscribe('DesignBriefCompleted', (event) => {
    const input: UXPlanningInput = {
      briefId: event.briefId,
      moduleId: event.moduleId,
      taskId: event.taskId,
      designBrief: event as unknown as UXResearchOutput,
    };
    void executeUXPlanning(contract, context, input);
  });
};
