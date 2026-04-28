/**
 * @module @agentforge/agents-ux/ux-implementation
 *
 * UX Dashboard Implementation agent: generates React 19 + Tailwind CSS code
 * from component specs produced by the planning agent. Uses streaming mode.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  Result,
  EventBus,
  CostRecord,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readSpecs,
  safeParse,
  parsePromptFrontmatter,
} from '@agentforge/core';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import type { ImplementationStage, DesignSnapshotData } from '../types.js';
import { UXImplementationOutputSchema } from '../schemas.js';
import { diskDesignTokensRequiredErr, diskDesignTokensRequiredMessage } from '../disk-design-tokens-required.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard implementation agent. */
export interface UXImplementationInput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly componentSpec: UXPlanningOutput;
  readonly stage: ImplementationStage['stage'];
  /**
   * Design snapshot data from the design stage (screenshots + extracted styles).
   * When provided, the implementation agent uses visual references and extracted
   * colors/typography/spacing to produce more accurate code.
   */
  readonly designSnapshot?: DesignSnapshotData;
  /**
   * Figma/Penpot node IDs mapped by component name.
   * Allows the implementation agent to reference specific design nodes.
   */
  readonly designNodeIds?: Readonly<Record<string, string>>;
  /**
   * Figma file/page IDs for reference links.
   */
  readonly designFileId?: string;
}

/** A single generated file with path and content. */
export interface GeneratedFile {
  readonly filePath: string;
  readonly content: string;
}

/** Output produced by the UX dashboard implementation agent. */
export interface UXImplementationOutput {
  readonly moduleId: string;
  readonly stage: ImplementationStage['stage'];
  readonly files: readonly GeneratedFile[];
  readonly totalCostUsd: number;
}

// ============================================================================
// Stream helpers (local — agents-ux does not depend on @agentforge/providers)
// ============================================================================

/** Minimal stream chunk shape matching the provider contract. */
interface StreamChunk {
  readonly type: 'token' | 'done';
  readonly content?: string;
  readonly cost?: CostRecord;
}

/** Collect all chunks from a provider stream into a single string + cost. */
const collectStreamOutput = async (
  stream: AsyncIterable<unknown>,
): Promise<Result<{ content: string; cost: CostRecord }>> => {
  let content = '';
  let finalCost: CostRecord | undefined;

  for await (const rawChunk of stream) {
    const chunk = rawChunk as StreamChunk;
    if (chunk.type === 'token') {
      content += chunk.content ?? '';
    } else if (chunk.type === 'done') {
      finalCost = chunk.cost;
    }
  }

  if (!finalCost) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: 'Stream ended without a done chunk containing cost data',
      recoverable: true,
    });
  }

  return Ok({ content, cost: finalCost });
};

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard implementation agent. */
export const UX_IMPLEMENTATION_CONTRACT: AgentContract = {
  role: 'ux_implementation',
  description: 'Generates React 19 + Tailwind CSS code from component specs with design token bindings',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'stream', progress_events: true, max_context_tokens: 60000 },
  tools: ['github.create_branch', 'github.push_files'],
  permissions: ['read_spec', 'read_design', 'read_design_system', 'write_code', 'create_branch'],
  denied: ['deploy_staging', 'deploy_production', 'merge_pr'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 60000, max_cost_per_task_usd: 2.0 },
  on_complete: 'ImplementationDraftReady',
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
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-implementation-system.md');
  const raw = readFileSync(promptPath, 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  systemPromptCache = parsed.body;
  promptVersionCache = parsed.frontmatter.version;
  return systemPromptCache;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse the LLM output as a UX dashboard implementation JSON object. */
export const parseImplementationOutput = (output: string): Result<UXImplementationOutput> => {
  return safeParse(output, UXImplementationOutputSchema, 'UX Implementation') as Result<UXImplementationOutput>;
};

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard implementation agent's work function.
 * Called by runAgent after governance clears. Uses streaming mode.
 */
export const uxImplementationWork: AgentWorkFn<UXImplementationInput, UXImplementationOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, componentSpec, stage, designSnapshot, designNodeIds, designFileId } = input;

  // 1. Read existing specs for context
  const specDir = join(context.projectRoot, 'agentforge/spec');
  const existingSpecs = readSpecs(specDir, context.fs);
  const specsContent = existingSpecs.ok ? JSON.stringify(existingSpecs.value) : '{}';

  // Extract design tokens, component library, and brand from readSpecs (no redundant disk reads)
  const tokens = existingSpecs.ok ? existingSpecs.value.designTokens : undefined;
  if (!tokens) {
    // eslint-disable-next-line no-console
    console.error(diskDesignTokensRequiredMessage(context.projectRoot));
    return diskDesignTokensRequiredErr(context.projectRoot);
  }

  const componentLibSpec = existingSpecs.ok ? existingSpecs.value.componentLibrary : undefined;

  // 2. Build prompt — replace {{MODULE_ID}} so file paths use the real module
  const systemPrompt = loadSystemPrompt().replace(/\{\{MODULE_ID\}\}/g, moduleId);
  const userMessageParts = [
    `Module ID: ${moduleId}`,
    `Implementation Stage: ${stage}`,
    `\nComponent Spec:\n${JSON.stringify(componentSpec, null, 2)}`,
    `\nExisting specs:\n${specsContent}`,
  ];

  // Inject component library import mappings if configured
  if (componentLibSpec) {
    const lib = componentLibSpec;
    const mappingLines = Object.entries(lib.react_mappings).map(([component, mapping]) => {
      const variantNote = mapping.variant_prop ? ` (variant prop: ${mapping.variant_prop})` : '';
      return `- ${component}: import { ${mapping.component_name} } from '${mapping.import_path}'${variantNote}`;
    });
    userMessageParts.push(
      `\n## Component Library Import Mappings`,
      `Library: ${lib.library_name}`,
      ...mappingLines,
      `\nUse these exact import paths and component names. Do not use generic or hardcoded imports.`,
    );
  }

  const tokenParts: string[] = ['\n## Design Tokens'];
  tokenParts.push(`\n### Colors`);
  for (const [name, hex] of Object.entries(tokens.colors.primitive)) {
    tokenParts.push(`- ${name}: ${hex}`);
  }
  if (tokens.colors.semantic) {
    tokenParts.push(`\n### Semantic Colors`);
    for (const [role, ref] of Object.entries(tokens.colors.semantic)) {
      tokenParts.push(`- ${role}: ${ref}`);
    }
  }
  tokenParts.push(`\n### Typography`);
  for (const entry of tokens.typography.scale) {
    tokenParts.push(`- ${entry.role}: ${entry.size}px, weight ${entry.weight}, family "${entry.family}"`);
  }
  tokenParts.push(`\n### Spacing`);
  tokenParts.push(`Unit: ${tokens.spacing.unit}px | Scale: ${tokens.spacing.scale.join(', ')}`);
  tokenParts.push(`\nUse these exact values for colors, typography, and spacing. Map to Tailwind classes where possible.`);
  userMessageParts.push(tokenParts.join('\n'));

  // Inject responsive design rules from planning output
  if (componentSpec.responsiveRules && componentSpec.responsiveRules.length > 0) {
    const responsiveParts: string[] = ['\n## Responsive Design Rules'];
    responsiveParts.push('Generate responsive Tailwind classes for each breakpoint:');
    for (const rule of componentSpec.responsiveRules) {
      const widthNote = rule.width ? ` (${rule.width}px)` : '';
      responsiveParts.push(`\n### ${rule.breakpoint}${widthNote}`);
      responsiveParts.push(`Layout: ${rule.behavior}`);
      if (rule.layout) {
        responsiveParts.push(`Strategy: ${rule.layout}`);
      }
      if (rule.changes && rule.changes.length > 0) {
        responsiveParts.push('Changes:');
        for (const change of rule.changes) {
          responsiveParts.push(`- ${change}`);
        }
      }
    }
    responsiveParts.push('\nUse Tailwind responsive prefixes: sm: (≥640px), md: (≥768px), lg: (≥1024px), xl: (≥1280px).');
    responsiveParts.push('The desktop design is the reference. Apply mobile/tablet rules as overrides via responsive classes.');
    userMessageParts.push(responsiveParts.join('\n'));
  }

  const brandSpec = existingSpecs.ok ? existingSpecs.value.brand : undefined;
  if (brandSpec) {
    userMessageParts.push(
      `\n## Brand Direction`,
      `Tone: ${brandSpec.identity.tone}`,
      `Audience: ${brandSpec.identity.audience}`,
      `WCAG Level: ${brandSpec.accessibility.wcag_level}`,
    );
  }

  // Include design snapshot data if available (colors, typography, spacing from Figma/Penpot)
  if (designSnapshot) {
    const snapshotContext: string[] = ['\n## Design Visual References'];

    if (designSnapshot.screenshotPath) {
      snapshotContext.push(`Full-page screenshot: ${designSnapshot.screenshotPath}`);
    }

    if (designSnapshot.componentSnapshots && designSnapshot.componentSnapshots.length > 0) {
      snapshotContext.push('\n### Extracted Component Styles');
      for (const snap of designSnapshot.componentSnapshots) {
        const parts = [`- **${snap.name}** (${snap.nodeType ?? 'unknown'})`];
        if (snap.screenshotPath) {
          parts.push(`  Screenshot: ${snap.screenshotPath}`);
        }
        if (snap.properties) {
          parts.push(`  Styles: ${JSON.stringify(snap.properties)}`);
        }
        snapshotContext.push(parts.join('\n'));
      }
    }

    if (designNodeIds) {
      snapshotContext.push(`\nDesign node mapping: ${JSON.stringify(designNodeIds)}`);
    }
    if (designFileId) {
      snapshotContext.push(`Design file: https://www.figma.com/file/${designFileId}`);
    }

    snapshotContext.push('\nUse these extracted styles to produce pixel-accurate Tailwind classes.');
    snapshotContext.push('Map the exact colors, font sizes, spacing, and border radii from the design to your output.');
    userMessageParts.push(snapshotContext.join('\n'));
  }

  if (learnings.length > 0) {
    userMessageParts.push(`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`);
  }

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessageParts.join('\n') }],
  };

  // 3. Call LLM via streaming
  const stream = provider.stream(prompt, {
    model: context.resolvedModel ?? UX_IMPLEMENTATION_CONTRACT.provider,
    maxTokens: 16000,
    temperature: 0,
    promptVersion: promptVersionCache,
  });

  const collectResult = await collectStreamOutput(stream);
  if (!collectResult.ok) {
    return collectResult as Result<never>;
  }


  // 4. Parse output
  const parseResult = parseImplementationOutput(collectResult.value.content);
  if (!parseResult.ok) {
    return parseResult;
  }

  // Attach actual cost from stream
  const result: UXImplementationOutput = {
    ...parseResult.value,
    totalCostUsd: collectResult.value.cost.totalCostUsd,
  };

  return Ok(result);
};

// ============================================================================
// File writing helper
// ============================================================================

/**
 * Write implementation output files to disk.
 * Creates directories as needed and returns the list of written paths.
 */
export const writeImplementationFiles = (
  files: readonly GeneratedFile[],
  targetDir: string,
): string[] => {
  const writtenPaths: string[] = [];

  for (const file of files) {
    const fullPath = join(targetDir, file.filePath);
    const dir = dirname(fullPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
    writtenPaths.push(fullPath);
  }

  return writtenPaths;
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard implementation agent through the full governance pipeline.
 */
export const executeUXImplementation = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXImplementationInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_code',
    `module:${input.moduleId}`,
    `UX dashboard implementation (${input.stage}) for module: ${input.moduleId}`,
    uxImplementationWork,
  );
};

/**
 * Register the implementation agent on the event bus.
 * Implementation is invoked explicitly by the CLI orchestrator after design
 * approval (via --implement flag or feedback loop `implement` command).
 */
export const registerUXImplementation = (
  _eventBus: EventBus,
  _context: AgentContext,
  _contract: AgentContract = UX_IMPLEMENTATION_CONTRACT,
): void => {
  // Event-driven triggering will be wired when the full pipeline orchestrator is built.
};
