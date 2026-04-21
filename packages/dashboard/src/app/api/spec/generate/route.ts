import { NextResponse } from 'next/server';
import {
  readYamlFile,
  readTextFile,
  getActiveProjectRoot,
} from '../../_lib/project-reader';
import { startRun, updateRunStatus, completeRun, failRun } from '../../_lib/run-manager';
import { emitStageEvent } from '../../_lib/event-writer';
import { getClaudeProvider, NO_CLAUDE_AUTH_ERROR } from '../../_lib/llm-provider';
import { debugLog } from '@agentforge/core';

interface SpecResult {
  pages: Array<{
    id: string;
    name: string;
    route: string;
    description: string;
    components: string[];
    dataSources: string[];
    screen_type?: 'page' | 'modal' | 'drawer' | 'sheet';
    navigates_to?: Array<{ target: string; trigger: string }>;
  }>;
  models: Array<{
    id: string;
    name: string;
    fields: Array<{ name: string; type: string; required?: boolean }>;
  }>;
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
    request?: string;
    response?: string;
  }>;
}

export interface LogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

/**
 * POST /api/spec/generate
 * Generates pages.yaml, models.yaml, api.yaml from project context using LLM.
 */
export async function POST() {
  const logs: LogEntry[] = [];
  const log = (level: LogEntry['level'], message: string) => {
    logs.push({ ts: Date.now(), level, message });
  };

  const claude = getClaudeProvider();
  if (!claude) {
    log('error', NO_CLAUDE_AUTH_ERROR);
    return NextResponse.json(
      { error: NO_CLAUDE_AUTH_ERROR, logs },
      { status: 503 },
    );
  }
  log('info', `Claude auth resolved (method: ${claude.authMethod})`);

  // Resolve active project
  let projectRoot: string;
  try {
    projectRoot = getActiveProjectRoot();
    log('info', `Active project root: ${projectRoot}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', `Failed to resolve active project: ${message}`);
    return NextResponse.json({ error: message, logs }, { status: 500 });
  }

  // Create a run
  const runResult = startRun('design-generate');
  if (!runResult.ok) {
    log('error', `Cannot start run: ${runResult.error}`);
    return NextResponse.json(
      { error: runResult.error, activeRun: runResult.activeRun, logs },
      { status: 409 },
    );
  }

  const { run } = runResult;
  const runId = run.runId;
  log('info', `Run started: ${runId}`);

  // Start the run
  updateRunStatus(runId, {
    status: 'running',
    stage: 'Reading project context',
    progress: { current: 1, total: 3, label: 'Reading context' },
  });

  emitStageEvent(runId, 'design-generate', 'Reading context', 0, 3, 'started');

  try {
    // Read project context — log each file
    const projectConfig = readYamlFile<Record<string, unknown>>('agentforge.yaml');
    if (projectConfig) {
      const projName = (projectConfig as { project?: { name?: string } }).project?.name;
      log('info', `agentforge.yaml: loaded (project: "${projName ?? 'unknown'}")`);
    } else {
      log('warn', 'agentforge.yaml: not found — LLM will have no project context');
    }

    const prdContent = readTextFile('docs/prd.md');
    if (prdContent) {
      log('info', `docs/prd.md: loaded (${prdContent.length} chars)`);
    } else {
      log('warn', 'docs/prd.md: not found — LLM will generate without PRD');
    }

    const designTokens = readYamlFile<Record<string, unknown>>('agentforge/spec/design-tokens.yaml');
    if (designTokens) {
      log('info', 'agentforge/spec/design-tokens.yaml: loaded');
    } else {
      log('warn', 'agentforge/spec/design-tokens.yaml: not found');
    }

    const brandSpec = readYamlFile<Record<string, unknown>>('agentforge/spec/brand.yaml');
    if (brandSpec) {
      log('info', 'agentforge/spec/brand.yaml: loaded');
    } else {
      log('warn', 'agentforge/spec/brand.yaml: not found');
    }

    emitStageEvent(runId, 'design-generate', 'Reading context', 0, 3, 'completed');

    // Build prompt and log its size
    const systemPrompt = buildSpecGenerationPrompt(projectConfig, prdContent, designTokens, brandSpec);
    log('info', `System prompt built (${systemPrompt.length} chars)`);

    // Call LLM for spec generation
    updateRunStatus(runId, {
      stage: 'Generating spec via LLM',
      progress: { current: 2, total: 3, label: 'LLM generation' },
      agentRole: 'spec_writer',
    });

    emitStageEvent(runId, 'design-generate', 'LLM generation', 1, 3, 'started', 'spec_writer');
    log('info', `Calling Claude API (model: claude-sonnet-4-6, auth: ${claude.authMethod}, max_tokens: 16384)`);

    const llmResult = await claude.provider.complete(
      {
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: 'Generate the complete application specification based on the project context provided. Return a JSON object with pages, models, and endpoints arrays.',
          },
        ],
      },
      { model: 'claude-sonnet-4-6', maxTokens: 16384 },
    );

    if (!llmResult.ok) {
      const error = llmResult.error;
      const detail = 'message' in error ? error.message : JSON.stringify(error);
      log('error', `Claude API error (${error.code}): ${detail}`);
      throw new Error(`Claude API error (${error.code}): ${detail}`);
    }

    debugLog(`spec-generate: LLM call succeeded (auth=${claude.authMethod}, tokens=${llmResult.value.usage.inputTokens}+${llmResult.value.usage.outputTokens})`);
    log('info', `Claude API responded OK (${llmResult.value.usage.inputTokens}+${llmResult.value.usage.outputTokens} tokens, ${llmResult.value.latencyMs}ms)`);

    const responseText = llmResult.value.content;
    if (!responseText) {
      log('error', 'No text content in LLM response');
      throw new Error('No text content in LLM response');
    }

    log('info', `LLM response received (${responseText.length} chars)`);

    // Parse the JSON from the response
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, responseText];
    const spec = JSON.parse(jsonMatch[1]?.trim() ?? responseText) as SpecResult;

    log('info', `Parsed spec: ${spec.pages?.length ?? 0} pages, ${spec.models?.length ?? 0} models, ${spec.endpoints?.length ?? 0} endpoints`);

    emitStageEvent(runId, 'design-generate', 'LLM generation', 1, 3, 'completed', 'spec_writer');

    // Complete the run
    updateRunStatus(runId, {
      stage: 'Complete',
      progress: { current: 3, total: 3, label: 'Done' },
    });

    emitStageEvent(runId, 'design-generate', 'Complete', 2, 3, 'completed');
    completeRun(runId);

    log('info', 'Spec generation complete');
    return NextResponse.json({ runId, spec, logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', `Generation failed: ${message}`);
    emitStageEvent(runId, 'design-generate', 'Failed', 0, 3, 'failed');
    failRun(runId, message);
    return NextResponse.json({ error: message, runId, logs }, { status: 500 });
  }
}

function buildSpecGenerationPrompt(
  projectConfig: Record<string, unknown> | null,
  prdContent: string | null,
  designTokens: Record<string, unknown> | null,
  brandSpec: Record<string, unknown> | null,
): string {
  const sections: string[] = [];

  sections.push(
    'You are a software architect that generates application specifications.',
    'Given a project context and PRD, produce a JSON specification with:',
    '1. pages: Array of page definitions with id, name, route, description, components, dataSources, screen_type, navigates_to',
    '2. models: Array of data model definitions with id, name, fields (name, type, required)',
    '3. endpoints: Array of API endpoint definitions with method, path, description',
    '',
    'Each page MUST include:',
    '- screen_type: "page" | "modal" | "drawer" | "sheet"',
    '  - "page" (default) — full-screen views (dashboard, list, detail, form)',
    '  - "modal" — centered dialog overlays for confirmations, focused forms, or detail views',
    '  - "drawer" — side panels for auxiliary content (notifications, filters, settings)',
    '  - "sheet" — bottom-anchored panels for mobile content (share menu, action picker)',
    '  Most screens should be "page". Use modal/drawer/sheet when the screen is clearly auxiliary.',
    '- navigates_to: Array of { target: "other-page-id", trigger: "Click button label" }',
    '  Capture how users flow between pages. Navigation bars and tabs on multiple pages should have consistent targets.',
    '',
    'Output ONLY valid JSON wrapped in ```json``` code fences.',
    '',
  );

  if (projectConfig) {
    sections.push('## Project Configuration');
    sections.push(JSON.stringify(projectConfig, null, 2));
    sections.push('');
  }

  if (prdContent) {
    sections.push('## Product Requirements Document');
    sections.push(prdContent);
    sections.push('');
  }

  if (designTokens) {
    sections.push('## Design Tokens');
    sections.push(JSON.stringify(designTokens, null, 2));
    sections.push('');
  }

  if (brandSpec) {
    sections.push('## Brand Specification');
    sections.push(JSON.stringify(brandSpec, null, 2));
    sections.push('');
  }

  return sections.join('\n');
}
