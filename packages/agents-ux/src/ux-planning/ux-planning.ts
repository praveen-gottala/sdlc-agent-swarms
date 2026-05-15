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
  DesignConfig,
  PageContext,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readSpecs,
  debugLog,
  logDefaults,
  extractJson,
  parsePromptFrontmatter,
  extractValidTokenNames,
  filterNonTokenBindings,
  validateTokenBindings,
  parseTokenBindingsCorrection,
  applyDotNotationFallback,
  MAX_TOKEN_BINDING_RETRIES,
  buildTokenAllowlist,
  buildTokenCorrectionPrompt,
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
let promptVersionCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-planning-system.md');
  const raw = readFileSync(promptPath, 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  systemPromptCache = parsed.body;
  promptVersionCache = parsed.frontmatter.version;
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
            defaultValues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  value: { oneOf: [{ type: 'number' }, { type: 'string' }] },
                },
                required: ['key', 'value'],
                additionalProperties: false,
              },
            },
            navigateTo: { type: 'string' },
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
 * Normalize defaultValues on componentTree nodes from either a map (text fallback)
 * or an array of {key, value} pairs (structured output schema).
 */
const normalizeComponentTree = (raw: unknown): ComponentTreeNode[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((node: unknown) => {
    const n = node as Record<string, unknown>;
    if (!n.defaultValues) return n as unknown as ComponentTreeNode;
    if (Array.isArray(n.defaultValues)) {
      const map: Record<string, number | string> = {};
      for (const entry of n.defaultValues as Array<{ key: string; value: number | string }>) {
        if (entry && typeof entry === 'object' && 'key' in entry && 'value' in entry) {
          map[entry.key] = entry.value;
        }
      }
      return { ...n, defaultValues: map } as unknown as ComponentTreeNode;
    }
    return n as unknown as ComponentTreeNode;
  });
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
    componentTree: normalizeComponentTree(parsed.componentTree),
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
  const jsonStr = extractJson(output);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse UX dashboard planning output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }

  return Ok(extractPlanningFields(parsed as Record<string, unknown>));
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

  // 3. Build prompt with cache control on shared prefix
  const systemPrompt = loadSystemPrompt();

  // Shared context (same across all pages — cacheable)
  const sharedParts = [
    `\nExisting specs:\n${specsContent}`,
    ...(tokenContext ? [tokenContext] : []),
    ...(componentLibContext ? [componentLibContext] : []),
    ...(learnings.length > 0 ? [`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`] : []),
  ];

  // Viewport config (same across all pages)
  if (input.designConfig) {
    const { responsive_breakpoints, primary_viewport, layout_strategy } = input.designConfig;
    if (responsive_breakpoints === false) {
      sharedParts.push(
        `\n## Viewport Configuration\nThis project is configured for desktop-only at ${primary_viewport}px. Generate responsiveRules for desktop only. Do NOT include tablet or mobile breakpoints — they will be added later when responsive_breakpoints is enabled.`,
      );
    } else if (responsive_breakpoints === true) {
      const breakpoints = layout_strategy === 'mobile-first'
        ? [375, 768, 1440]
        : [1440, 768, 375];
      sharedParts.push(
        `\n## Viewport Configuration\nTarget breakpoints: ${breakpoints.join('px, ')}px (${layout_strategy}). Generate responsiveRules for all listed breakpoints.`,
      );
    } else if (Array.isArray(responsive_breakpoints) && responsive_breakpoints.length > 0) {
      sharedParts.push(
        `\n## Viewport Configuration\nTarget breakpoints: ${responsive_breakpoints.join('px, ')}px (${layout_strategy}). Generate responsiveRules for all listed breakpoints.`,
      );
    }
  }

  const sharedContext = sharedParts.join('\n');

  // Page-specific context (unique per page)
  const pageParts = [
    `Module ID: ${moduleId}`,
    `\nDesign Brief:\n${JSON.stringify(designBrief, null, 2)}`,
    ...(input.pageContext ? [formatPageContextPrompt(input.pageContext)] : []),
  ];
  const pageSpecificContext = pageParts.join('\n');

  const prompt = {
    system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
    messages: [{
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: sharedContext, cache_control: { type: 'ephemeral' as const } },
        { type: 'text' as const, text: pageSpecificContext },
      ],
    }],
  };

  // 3. Call LLM with structured output schema
  if (!context.resolvedModel) {
    debugLog(`[planning] resolvedModel not set, falling back to contract default: ${UX_PLANNING_CONTRACT.provider}`);
  }

  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? UX_PLANNING_CONTRACT.provider,
    maxTokens: 8000,
    temperature: 0,
    responseSchema: PLANNING_OUTPUT_SCHEMA,
    promptVersion: promptVersionCache,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

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

      const retryResult = await provider.complete(retryPrompt, {
        model: context.resolvedModel ?? UX_PLANNING_CONTRACT.provider,
        maxTokens: 2000,
        temperature: 0,
        promptVersion: promptVersionCache,
      });

      if (!retryResult.ok) {
        // eslint-disable-next-line no-console
        console.warn('[planning] Token binding correction LLM call failed, falling back to DOT_NOTATION_HINTS');
        break;
      }

      const retryContent = (retryResult.value as { content: string }).content;

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
