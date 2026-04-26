/**
 * @module @agentforge/agents-ux/app-spec
 *
 * Shared app spec generation: LLM call + retry + Zod-validated parsing.
 * Callers handle file writing, status assignment, and approval flow.
 */

import type { DesignTokensSpec, BrandSpec, PromptTrace, Result } from '@agentforge/core';
import { Ok, Err, recordPromptTrace } from '@agentforge/core';
import { GeneratedAppSpecSchema } from './app-spec-schemas.js';
import type { GeneratedAppSpec } from './app-spec-schemas.js';
import { buildAppSpecSystemPrompt, buildAppSpecUserPrompt } from './app-spec-prompts.js';
import type { AppSpecPromptContext } from './app-spec-prompts.js';

/** Minimal provider interface — structurally compatible with both LLMProvider and LLMProviderRef. */
export interface AppSpecProvider {
  complete(prompt: unknown, options: unknown): Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>;
}

/** Input for generateAppSpec. */
export interface GenerateAppSpecInput {
  readonly appName: string;
  readonly description?: string;
  readonly prdContent?: string;
  readonly designTokens?: DesignTokensSpec;
  readonly brandSpec?: BrandSpec;
  readonly projectConfig?: Record<string, unknown>;
  readonly provider: AppSpecProvider;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly maxRetries?: number;
  readonly promptTraces?: PromptTrace[];
}

export interface AppSpecError {
  readonly code: 'INVALID_JSON' | 'MISSING_REQUIRED_FIELDS' | 'LLM_ERROR' | 'EXHAUSTED_RETRIES';
  readonly message: string;
  readonly recoverable: boolean;
}

/** Parse raw LLM response text into a validated GeneratedAppSpec. */
export function parseAppSpecResponse(raw: string): Result<GeneratedAppSpec, AppSpecError> {
  let parsed: unknown;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return Err({ code: 'INVALID_JSON', message: 'Response is not valid JSON', recoverable: true });
  }

  const result = GeneratedAppSpecSchema.safeParse(parsed);
  if (!result.success) {
    return Err({
      code: 'MISSING_REQUIRED_FIELDS',
      message: `Schema validation failed: ${result.error.issues.map(i => i.message).join('; ')}`,
      recoverable: true,
    });
  }

  const spec = result.data;

  const validPageIds = new Set(spec.pages.map(p => p.id));
  const pages = spec.pages.map(p => {
    if (!p.navigates_to) return p;
    const validNav = p.navigates_to.filter(n => validPageIds.has(n.target));
    return validNav.length > 0 ? { ...p, navigates_to: validNav } : { ...p, navigates_to: undefined };
  });

  return Ok({ ...spec, pages });
}

/** Generate a complete app spec via LLM with retries and Zod validation. */
export async function generateAppSpec(
  input: GenerateAppSpecInput,
): Promise<Result<GeneratedAppSpec, AppSpecError>> {
  const maxRetries = input.maxRetries ?? 2;
  const model = input.model ?? 'claude-sonnet-4-6';
  const maxTokens = input.maxTokens ?? 16384;
  const temperature = input.temperature ?? 0.7;

  const systemPrompt = buildAppSpecSystemPrompt();
  const context: AppSpecPromptContext = {
    appName: input.appName,
    description: input.description,
    prdContent: input.prdContent,
    designTokens: input.designTokens,
    brandSpec: input.brandSpec,
    projectConfig: input.projectConfig,
  };
  const userPrompt = buildAppSpecUserPrompt(context);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const messages: { role: 'user'; content: string }[] = [
      { role: 'user', content: userPrompt },
    ];
    if (attempt > 0) {
      messages.push({
        role: 'user',
        content: 'Your previous response was not valid JSON. Please respond with ONLY the JSON object wrapped in ```json``` code fences.',
      });
    }

    const prompt = { system: systemPrompt, messages };
    const opts = { model, maxTokens, temperature };

    recordPromptTrace({ promptTraces: input.promptTraces }, 'app-spec-generation', prompt, opts);

    const llmResult = await input.provider.complete(prompt, opts);
    if (!llmResult.ok) {
      const err = llmResult.error as unknown;
      const errMsg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: string }).message)
        : JSON.stringify(err);
      return Err({ code: 'LLM_ERROR', message: errMsg, recoverable: false });
    }

    const value = llmResult.value as { content?: string } | undefined;
    const responseText = value?.content;
    if (!responseText) {
      if (attempt < maxRetries) continue;
      return Err({ code: 'LLM_ERROR', message: 'No text content in LLM response', recoverable: false });
    }

    const parseResult = parseAppSpecResponse(responseText);
    if (parseResult.ok) return parseResult;

    if (attempt < maxRetries) continue;
  }

  return Err({ code: 'EXHAUSTED_RETRIES', message: `Failed to generate valid app spec after ${maxRetries + 1} attempts`, recoverable: true });
}
