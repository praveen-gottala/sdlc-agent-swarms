import { buildComponentCatalogPrompt } from '@agentforge/agents-ux';
import {
  loadTasks,
  updateTaskStatus,
  saveTasks,
  createRealFs,
  debugLog,
} from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import { getActiveProjectRoot } from './project-reader';
import type { PageEntry, DesignTokensFile } from './shared-types';

/* ------------------------------------------------------------------ */
/*  Design model configuration                                         */
/* ------------------------------------------------------------------ */

/** Models available for design generation. */
export const DESIGN_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'] as const;
export type DesignModel = (typeof DESIGN_MODELS)[number];
export const DEFAULT_DESIGN_MODEL: DesignModel = 'claude-sonnet-4-6';

/** Validate a model string from the request. Returns the default if invalid. */
export function resolveDesignModel(raw: string | undefined | null): DesignModel {
  if (raw && (DESIGN_MODELS as readonly string[]).includes(raw)) {
    return raw as DesignModel;
  }
  return DEFAULT_DESIGN_MODEL;
}

/* ------------------------------------------------------------------ */
/*  LLM response metadata                                              */
/* ------------------------------------------------------------------ */

export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface LLMCallMeta {
  model: string;
  usage: LLMUsage;
  durationMs: number;
  costUsd: number;
}

export interface LLMResult {
  ok: boolean;
  designSpec?: Record<string, unknown>;
  error?: string;
  meta?: LLMCallMeta;
}

/* ------------------------------------------------------------------ */
/*  Icon names for design spec generation                              */
/* ------------------------------------------------------------------ */

export const DESIGN_SPEC_ICON_NAMES = [
  'home', 'menu', 'arrow-left', 'arrow-right', 'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right', 'external-link', 'arrow-up', 'arrow-down',
  'search', 'filter', 'sort', 'plus', 'minus', 'edit', 'delete', 'copy', 'share', 'download', 'upload', 'refresh', 'more', 'more-vertical', 'close',
  'expand', 'collapse', 'undo', 'redo',
  'check', 'check-circle', 'x-circle', 'alert-circle', 'info', 'alert-triangle', 'clock', 'loader', 'circle', 'circle-dot',
  'user', 'users', 'mail', 'phone', 'calendar', 'file', 'file-text', 'folder', 'image', 'link', 'tag', 'bookmark', 'star', 'heart', 'thumbs-up',
  'map-pin', 'globe', 'hash', 'list', 'grid', 'bar-chart', 'pie-chart', 'trending-up', 'trending-down',
  'shopping-cart', 'credit-card', 'dollar-sign', 'receipt', 'wallet', 'percent',
  'bell', 'message-circle', 'message-square', 'send', 'at-sign',
  'settings', 'lock', 'unlock', 'eye', 'eye-off', 'toggle-left', 'toggle-right', 'shield', 'key', 'log-out', 'log-in', 'zap', 'help-circle',
] as const;

/* ------------------------------------------------------------------ */
/*  Task status transition                                             */
/* ------------------------------------------------------------------ */

/** Transition task status safely (load -> update -> save). Best-effort — logs but does not throw. */
export function transitionTaskStatus(taskId: string, newStatus: Parameters<typeof updateTaskStatus>[2]): void {
  try {
    const projectRoot = getActiveProjectRoot();
    const fs = createRealFs();
    const loadResult = loadTasks(projectRoot, fs);
    if (!loadResult.ok) return;
    const updateResult = updateTaskStatus(loadResult.value, taskId, newStatus);
    if (!updateResult.ok) return;
    saveTasks(projectRoot, updateResult.value, fs);
  } catch (err) {
    debugLog(`transitionTaskStatus: failed to transition task ${taskId} to ${newStatus}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  LLM prompt builder for DesignSpec v2                               */
/* ------------------------------------------------------------------ */

/** Build the LLM system prompt for DesignSpec v2 JSON generation, including tokens, brand, catalog, and navigation context. */
export function buildDesignSpecSystemPrompt(
  description: string,
  components: string[],
  designTokens: DesignTokensFile | null,
  componentCatalog: Record<string, unknown> | null,
  modelsYaml: { models?: Array<{ id: string; name: string; fields?: Array<{ name: string; type?: string }> }> } | null,
  brandYaml: Record<string, unknown> | null,
  allPages: PageEntry[],
  currentPageId: string,
): string {
  const sections: string[] = [];

  sections.push(
    'You are a UX design agent that generates DesignSpec v2 JSON for application pages.',
    'You produce a flat node adjacency list where every visual element is a node with parent references and sibling ordering.',
    '',
    'IMPORTANT RULES:',
    '- Exactly one node must have parent: null (the root page node).',
    '- Every other node must reference an existing node ID as its parent.',
    '- Use the "type" field for structural elements (page, container, section, header, divider, spacer, text).',
    '- Use the "catalog" field for design-system components (button-primary, input-text, card, etc.).',
    '- type and catalog are mutually exclusive on each node.',
    '- Use semantic token names for colors (e.g. "text-primary", "background-primary").',
    '- Create a realistic, complete layout — not just placeholders.',
    '- Layout supports flex (default) and grid modes via the layout object.',
    '- Use layout.display: "grid" with layout.columns for multi-column card grids (e.g. 3-column bookmark grid).',
    '- Use layout.wrap: true for horizontal lists that should wrap (e.g. chip rows, tag lists).',
    '- Width "fill" means stretch to parent in flex contexts. Use numeric width for fixed sizes.',
    '',
  );

  if (designTokens?.tokens) {
    sections.push('## Design Tokens');
    const t = designTokens.tokens;
    if (t.colors) {
      sections.push('Colors:');
      for (const [name, value] of Object.entries(t.colors)) {
        sections.push(`  ${name}: ${value}`);
      }
    }
    if (t.typography) {
      sections.push(`Font Family: ${t.typography.fontFamily ?? 'Inter, system-ui, sans-serif'}`);
      if (t.typography.scale) {
        sections.push('Type Scale:');
        for (const [name, value] of Object.entries(t.typography.scale)) {
          sections.push(`  ${name}: ${value}`);
        }
      }
    }
    if (t.spacing) {
      sections.push(`Spacing Unit: ${t.spacing.unit ?? '0.25rem'}`);
    }
    if (t.borderRadius) {
      sections.push('Border Radius:');
      for (const [name, value] of Object.entries(t.borderRadius)) {
        sections.push(`  ${name}: ${value}`);
      }
    }
    sections.push('');
  }

  if (brandYaml) {
    const brand = brandYaml as Record<string, Record<string, unknown>>;
    sections.push('## Brand Guidelines');
    if ((brand.identity as Record<string, unknown> | undefined)?.tone) {
      sections.push(`Tone: ${(brand.identity as Record<string, unknown>).tone}`);
    }
    if ((brand.illustration_style as Record<string, unknown> | undefined)?.direction) {
      sections.push(`Illustration style: ${(brand.illustration_style as Record<string, unknown>).direction}`);
    }
    if (brand.motion_principles) {
      const m = brand.motion_principles as Record<string, unknown>;
      sections.push(`Motion: transitions=${m.page_transitions || 'none'}, easing=${m.easing || ''}, duration=${m.duration_base_ms || 200}ms`);
    }
    if ((brand.accessibility as Record<string, unknown> | undefined)?.wcag_level) {
      sections.push(`Accessibility: WCAG ${(brand.accessibility as Record<string, unknown>).wcag_level}`);
    }
    sections.push('');
  }

  sections.push('## Icons');
  sections.push('Use `catalog: "icon"` with `overrides: { "name": "<icon-name>" }` for standalone icons.');
  sections.push('Use `overrides: { "icon": "<icon-name>" }` on buttons, search inputs, and alerts when an inline icon improves clarity.');
  sections.push('Use only these semantic icon names:');
  sections.push(`  ${DESIGN_SPEC_ICON_NAMES.join(', ')}`);
  sections.push('');

  sections.push('## Images and Illustrations');
  sections.push('Use `catalog: "image"` or `catalog: "illustration"` for placeholder visual assets.');
  sections.push('Set width, height, and `overrides.alt` to describe the intended visual.');
  sections.push('');

  if (componentCatalog) {
    const catalogPrompt = buildComponentCatalogPrompt(componentCatalog as unknown as Parameters<typeof buildComponentCatalogPrompt>[0]);
    if (catalogPrompt) {
      sections.push(catalogPrompt);
    }
    const comps = (componentCatalog as Record<string, unknown>).components;
    if (comps && typeof comps === 'object') {
      const names = Object.keys(comps as Record<string, unknown>);
      for (const builtIn of ['icon', 'image', 'illustration']) {
        if (!names.includes(builtIn)) names.push(builtIn);
      }
      sections.push('## Valid catalog values');
      sections.push('When setting catalog: on a node, use ONLY these exact names:');
      sections.push(names.map(n => `  - ${n}`).join('\n'));
      sections.push('');
    }
  }

  if (components.length > 0) {
    sections.push('## Required Components');
    sections.push('The design MUST include these components:');
    for (const c of components) {
      sections.push(`  - ${c}`);
    }
    sections.push('');
  }

  if (modelsYaml?.models) {
    sections.push('## Data Models');
    sections.push('Use real field names from these models in labels and mock data:');
    for (const model of modelsYaml.models) {
      if (model.fields) {
        const fieldList = model.fields
          .map(f => `${f.name} (${f.type || 'string'})`)
          .join(', ');
        sections.push(`### ${model.name || model.id}`);
        sections.push(`Fields: ${fieldList}`);
      }
    }
    sections.push('');
  }

  if (allPages.length > 1) {
    sections.push('## Other Pages in This Application');
    sections.push('These are valid navigation targets:');
    for (const p of allPages) {
      if (p.id !== currentPageId) {
        const status = p.designStatus || p.status || 'draft';
        sections.push(`  - ${p.name} (${p.route}) — ${status}`);
      }
    }
    sections.push('');
  }

  sections.push('## Page to Design');
  sections.push(description);

  return sections.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Research / Planning stage caller                                    */
/* ------------------------------------------------------------------ */

/** Call the LLM for a research or planning stage, returning the text output and usage metadata. */
export async function callPipelineStage(
  provider: LLMProvider,
  stage: 'research' | 'planning',
  context: Record<string, string | null>,
  pageName?: string,
  model: DesignModel = DEFAULT_DESIGN_MODEL,
): Promise<{ text: string; meta: LLMCallMeta }> {
  const pageLabel = pageName ? ` for the page named '${pageName}'` : '';
  const systemPrompts: Record<string, string> = {
    research: [
      `You are a UX Research agent. Analyze the requirements${pageLabel} and produce a design brief.`,
      'Consider: user needs, accessibility, information architecture, interaction patterns.',
      'Output a structured research brief in markdown format.',
    ].join('\n'),
    planning: [
      `You are a UX Planning agent. Using the research brief${pageLabel}, create a component specification.`,
      'Define: component tree, layout rules, token bindings, responsive breakpoints.',
      'Output a structured planning specification in markdown format.',
    ].join('\n'),
  };

  const userMessage = Object.entries(context)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `## ${k}\n${v}`)
    .join('\n\n');

  const startTime = Date.now();

  const result = await provider.complete(
    {
      system: systemPrompts[stage],
      messages: [{ role: 'user', content: userMessage }],
    },
    { model, maxTokens: 8192 },
  );

  const durationMs = Date.now() - startTime;

  if (!result.ok) {
    const error = result.error;
    const detail = 'message' in error ? error.message : JSON.stringify(error);
    throw new Error(`${stage} stage API error (${error.code}): ${detail}`);
  }

  const usage: LLMUsage = {
    input_tokens: result.value.usage.inputTokens,
    output_tokens: result.value.usage.outputTokens,
  };
  const costUsd = result.value.cost.totalCostUsd;

  return {
    text: result.value.content,
    meta: { model, usage, durationMs, costUsd },
  };
}

/* ------------------------------------------------------------------ */
/*  Claude design API caller (uses provider abstraction for Vertex AI) */
/* ------------------------------------------------------------------ */

/** Call Claude via the provider abstraction to generate a DesignSpec v2 JSON using tool use. Retries once on empty nodes. */
export async function callClaudeDesignAPI(
  provider: LLMProvider,
  systemPrompt: string,
  userMessage: string,
  submitDesignTool: { name: string; description: string; parameters: Record<string, unknown> },
  model: DesignModel = DEFAULT_DESIGN_MODEL,
): Promise<LLMResult> {
  const maxTokens = 64000;
  const MAX_EMPTY_NODES_RETRIES = 1;

  let totalCostUsd = 0;
  let totalDurationMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let attemptNumber = 0;

  const buildMeta = (): LLMCallMeta => ({
    model,
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
    durationMs: totalDurationMs,
    costUsd: totalCostUsd,
  });

  let currentUserContent =
    `Generate a DesignSpec v2 JSON for this page. Use the submit_design tool to provide the complete specification.\n\nPage: ${userMessage}`;

  for (let emptyNodesRetry = 0; emptyNodesRetry <= MAX_EMPTY_NODES_RETRIES; emptyNodesRetry++) {
    attemptNumber++;
    const attemptStartTime = Date.now();

    const result = await provider.complete(
      {
        system: systemPrompt,
        messages: [{ role: 'user', content: currentUserContent }],
        tools: [
          {
            name: submitDesignTool.name,
            description: submitDesignTool.description,
            parameters: submitDesignTool.parameters,
          },
        ],
      },
      {
        model,
        maxTokens,
        temperature: 0.7,
        toolChoice: { type: 'tool', name: 'submit_design' },
      },
    );

    const attemptDurationMs = Date.now() - attemptStartTime;

    if (!result.ok) {
      const error = result.error;
      const detail = 'message' in error ? error.message : JSON.stringify(error);
      return { ok: false, error: `Claude API error (${error.code}): ${detail}`, meta: buildMeta() };
    }

    totalCostUsd += result.value.cost.totalCostUsd;
    totalDurationMs += attemptDurationMs;
    totalInputTokens += result.value.usage.inputTokens;
    totalOutputTokens += result.value.usage.outputTokens;

    const finishReason = result.value.finishReason;

    debugLog(
      `callClaudeDesignAPI: attempt ${attemptNumber} — ` +
      `model=${model}, maxTokens=${maxTokens}, finishReason=${finishReason}, ` +
      `outputTokens=${result.value.usage.outputTokens}/${maxTokens}, ` +
      `cost=$${result.value.cost.totalCostUsd.toFixed(4)}`,
    );

    if (finishReason === 'max_tokens') {
      return {
        ok: false,
        error: `LLM response was truncated (finishReason: max_tokens, outputTokens: ${result.value.usage.outputTokens}/${maxTokens}). ` +
               `The page may be too complex for a single generation pass.`,
        meta: buildMeta(),
      };
    }

    const toolCall = result.value.toolCalls.find((tc) => tc.name === 'submit_design');

    if (!toolCall) {
      return {
        ok: false,
        error: `LLM response did not contain a submit_design tool use block ` +
               `(finishReason: ${finishReason}, outputTokens: ${result.value.usage.outputTokens})`,
        meta: buildMeta(),
      };
    }

    const input = toolCall.args;
    const nodes = input?.nodes;
    if (!nodes || typeof nodes !== 'object' || Object.keys(nodes as object).length === 0) {
      if (emptyNodesRetry < MAX_EMPTY_NODES_RETRIES) {
        debugLog(
          `callClaudeDesignAPI: empty nodes on attempt ${attemptNumber} ` +
          `(finishReason: ${finishReason}), retrying with reinforced prompt`,
        );
        currentUserContent =
          `Generate a DesignSpec v2 JSON for this page. Use the submit_design tool to provide the complete specification.\n\n` +
          `CRITICAL: Your previous attempt returned an empty 'nodes' object. You MUST include a non-empty 'nodes' object. ` +
          `Every page requires a complete node tree — one root node (parent: null) and all child UI elements.\n\n` +
          `Page: ${userMessage}`;
        continue;
      }

      return {
        ok: false,
        error: `LLM returned a design spec with no nodes after ${attemptNumber} attempt(s). ` +
               `The LLM completed normally (finishReason: ${finishReason}) but produced an empty nodes object. ` +
               `This is an incomplete generation, not a truncation.`,
        meta: buildMeta(),
      };
    }

    return { ok: true, designSpec: input, meta: buildMeta() };
  }

  return { ok: false, error: 'Design generation exhausted all retry attempts.', meta: buildMeta() };
}
