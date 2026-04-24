import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  readYamlFile,
  writeYamlFile,
  readTextFile,
  getActiveProjectRoot,
} from '../../../../_lib/project-reader';
import { startRun, updateRunStatus, completeRun, failRun } from '../../../../_lib/run-manager';
import { wrapResearchShallow, wrapPlanningShallow } from '../../../../_lib/shallow-wrappers';
import { emitStageEvent, emitLLMCallEvent, emitAgentLogEvent } from '../../../../_lib/event-writer';
import {
  addTask,
  saveTasks,
  loadTasks,
  createRealFs,
} from '@agentforge/core';
import type { TaskEntry } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import { getClaudeProvider, NO_CLAUDE_AUTH_ERROR } from '../../../../_lib/llm-provider';
import {
  resolveDesignModel,
  buildDesignSpecSystemPrompt,
  callPipelineStage,
  callClaudeDesignAPI,
  transitionTaskStatus,
  DEFAULT_DESIGN_MODEL,
} from '../../../../_lib/pipeline-helpers';
import type { DesignModel } from '../../../../_lib/pipeline-helpers';
import type { PagesFile, DesignTokensFile } from '../../../../_lib/shared-types';

/**
 * POST /api/pages/[pageId]/design/chat
 *
 * Accepts a free-text design change request and runs the 3-stage pipeline
 * (Research -> Planning -> Design) against the existing design spec.
 *
 * Body: { message: string, model?: string }
 * Returns: { runId, pageId, taskId, status: 'running' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
): Promise<NextResponse> {
  const { pageId } = await params;

  let body: { message?: string; model?: string };
  try {
    body = (await request.json()) as { message?: string; model?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required and must be non-empty' }, { status: 400 });
  }

  const model = resolveDesignModel(body.model);

  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx === -1) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const page = pages[idx];
  const projectRoot = getActiveProjectRoot();
  const specPath = join(projectRoot, 'agentforge', 'designs', `${pageId}.json`);

  if (!existsSync(specPath)) {
    return NextResponse.json(
      { error: 'No design spec exists for this page. Generate a design first.' },
      { status: 404 },
    );
  }

  const claude = getClaudeProvider();
  if (!claude) {
    return NextResponse.json({ error: NO_CLAUDE_AUTH_ERROR }, { status: 503 });
  }

  const runResult = startRun('design-chat-iterate', { pageId, message });
  if (!runResult.ok) {
    return NextResponse.json(
      { error: runResult.error, activeRun: runResult.activeRun },
      { status: 409 },
    );
  }

  const { run } = runResult;
  const runId = run.runId;

  const taskId = `task-chat-${pageId}-${Date.now()}`;
  const fs = createRealFs();
  const loadResult = loadTasks(projectRoot, fs);
  const tasksData = loadResult.ok ? loadResult.value : { tasks: [] };

  const newTask: TaskEntry = {
    id: taskId,
    title: `Chat iterate: ${page.name}`,
    phase: 'design',
    agent: 'chat_iterate',
    status: 'pending',
    depends_on: [],
    spec_ref: `agentforge/designs/${pageId}.json`,
    branch: null,
    pr_number: null,
    cost_usd: 0,
    tokens_used: 0,
    attempts: 0,
    max_attempts: 3,
    hitl_status: 'none',
    hitl_channel: null,
  };

  const addResult = addTask(tasksData, newTask);
  if (addResult.ok) {
    saveTasks(projectRoot, addResult.value, fs);
  }

  pages[idx].designStatus = 'generating';
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  runChatPipelineAsync(runId, pageId, message, claude.provider, taskId, model).catch(() => {
    failRun(runId, 'Unexpected chat pipeline error');
  });

  return NextResponse.json({ runId, pageId, taskId, status: 'running' });
}

async function runChatPipelineAsync(
  runId: string,
  pageId: string,
  chatMessage: string,
  provider: LLMProvider,
  taskId: string,
  model: DesignModel = DEFAULT_DESIGN_MODEL,
): Promise<void> {
  const TOTAL_STAGES = 3;
  const projectRoot = getActiveProjectRoot();

  const freshPagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = freshPagesFile?.pages ?? [];
  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    failRun(runId, `Page ${pageId} no longer exists in pages.yaml`);
    transitionTaskStatus(taskId, 'failed');
    return;
  }

  const description = page.description || page.name || pageId;

  let existingSpecJson: string;
  try {
    existingSpecJson = readFileSync(
      join(projectRoot, 'agentforge', 'designs', `${pageId}.json`),
      'utf-8',
    );
  } catch {
    failRun(runId, `Could not read existing design spec for ${pageId}`);
    transitionTaskStatus(taskId, 'failed');
    return;
  }

  transitionTaskStatus(taskId, 'in_progress');

  try {
    const designTokens = readYamlFile<DesignTokensFile>('agentforge/spec/design-tokens.yaml');
    const brandYaml = readYamlFile<Record<string, unknown>>('agentforge/spec/brand.yaml');
    const prdContent = readTextFile('docs/prd.md');

    let totalCostUsd = 0;
    let totalTokensUsed = 0;

    // Stage 1: Research
    updateRunStatus(runId, {
      status: 'running',
      stage: 'Research',
      progress: { current: 0, total: TOTAL_STAGES, label: 'Research' },
      agentRole: 'ux_research',
      stageDescription: 'Analyzing chat request against current design',
    });
    emitStageEvent(runId, 'design-chat-iterate', 'Research', 0, TOTAL_STAGES, 'started', 'ux_research', undefined, taskId, 'Research: analyzing chat iteration request');

    emitAgentLogEvent(runId, 'Research', 'ux_research', taskId, 'info',
      `Chat message: "${chatMessage.slice(0, 100)}${chatMessage.length > 100 ? '...' : ''}"`);

    const researchResponse = await callPipelineStage(provider, 'research', {
      description,
      prdContent,
      chatMessage,
      currentDesignSpec: existingSpecJson,
      designTokens: designTokens ? JSON.stringify(designTokens) : null,
      brandSpec: brandYaml ? JSON.stringify(brandYaml) : null,
    }, page.name, model);
    const researchResult = researchResponse.text;

    totalCostUsd += researchResponse.meta.costUsd;
    totalTokensUsed += researchResponse.meta.usage.input_tokens + researchResponse.meta.usage.output_tokens;

    emitLLMCallEvent(
      runId, 'Research', 'ux_research', taskId,
      researchResponse.meta.model, researchResponse.meta.usage.input_tokens, researchResponse.meta.usage.output_tokens,
      researchResponse.meta.costUsd, researchResponse.meta.durationMs,
      `Research LLM complete: ${researchResponse.meta.usage.input_tokens + researchResponse.meta.usage.output_tokens} tokens`,
    );

    emitStageEvent(runId, 'design-chat-iterate', 'Research', 0, TOTAL_STAGES, 'completed', 'ux_research',
      { totalCostUsd: researchResponse.meta.costUsd, tokensUsed: researchResponse.meta.usage.input_tokens + researchResponse.meta.usage.output_tokens },
      taskId, 'Research stage complete');

    // Stage 2: Planning
    updateRunStatus(runId, {
      stage: 'Planning',
      progress: { current: 1, total: TOTAL_STAGES, label: 'Planning' },
      agentRole: 'ux_planning',
      stageDescription: 'Planning structural changes',
    });
    emitStageEvent(runId, 'design-chat-iterate', 'Planning', 1, TOTAL_STAGES, 'started', 'ux_planning', undefined, taskId, 'Planning: determining component changes');

    const planningResponse = await callPipelineStage(provider, 'planning', {
      description,
      researchBrief: researchResult,
      chatMessage,
      currentDesignSpec: existingSpecJson,
      designTokens: designTokens ? JSON.stringify(designTokens) : null,
    }, page.name, model);
    const planningResult = planningResponse.text;

    totalCostUsd += planningResponse.meta.costUsd;
    totalTokensUsed += planningResponse.meta.usage.input_tokens + planningResponse.meta.usage.output_tokens;

    emitLLMCallEvent(
      runId, 'Planning', 'ux_planning', taskId,
      planningResponse.meta.model, planningResponse.meta.usage.input_tokens, planningResponse.meta.usage.output_tokens,
      planningResponse.meta.costUsd, planningResponse.meta.durationMs,
      `Planning LLM complete: ${planningResponse.meta.usage.input_tokens + planningResponse.meta.usage.output_tokens} tokens`,
    );

    emitStageEvent(runId, 'design-chat-iterate', 'Planning', 1, TOTAL_STAGES, 'completed', 'ux_planning',
      { totalCostUsd: planningResponse.meta.costUsd, tokensUsed: planningResponse.meta.usage.input_tokens + planningResponse.meta.usage.output_tokens },
      taskId, 'Planning stage complete');

    // Stage 3: Design
    updateRunStatus(runId, {
      stage: 'Design',
      progress: { current: 2, total: TOTAL_STAGES, label: 'Design' },
      agentRole: 'penpot_design',
      stageDescription: 'Generating updated design spec',
    });
    emitStageEvent(runId, 'design-chat-iterate', 'Design', 2, TOTAL_STAGES, 'started', 'penpot_design', undefined, taskId, 'Design: generating updated DesignSpec');

    const { SUBMIT_DESIGN_TOOL } = await import('@agentforge/designspec-renderer');
    const componentCatalog = readYamlFile<Record<string, unknown>>('agentforge/spec/component-catalog.yaml');
    const modelsYaml = readYamlFile<{ models?: Array<{ id: string; name: string; fields?: Array<{ name: string; type?: string }> }> }>('agentforge/spec/models.yaml');

    const systemPrompt = buildDesignSpecSystemPrompt(
      description,
      page.components ?? [],
      designTokens,
      componentCatalog,
      modelsYaml,
      brandYaml,
      pages,
      pageId,
    );

    const enrichedDescription = [
      `## User's Change Request`,
      chatMessage,
      '',
      '## Research Brief',
      researchResult,
      '',
      '## Planning Specification',
      planningResult,
      '',
      '## Current Design (MODIFY THIS)',
      'You are ITERATING on an existing design. Preserve all nodes and structure unless the user explicitly requested a change.',
      'Apply ONLY the changes described in the user\'s request above.',
      '',
      existingSpecJson,
    ].join('\n');

    updateRunStatus(runId, { stageDescription: 'Generating updated DesignSpec via LLM' });

    const llmResponse = await callClaudeDesignAPI(provider, systemPrompt, enrichedDescription, SUBMIT_DESIGN_TOOL, model);

    if (!llmResponse.ok) {
      emitAgentLogEvent(runId, 'Design', 'penpot_design', taskId, 'error',
        `Design LLM call failed: ${llmResponse.error}`);
      throw new Error(`Design LLM call failed: ${llmResponse.error}`);
    }

    if (llmResponse.meta) {
      const m = llmResponse.meta;
      totalCostUsd += m.costUsd;
      totalTokensUsed += m.usage.input_tokens + m.usage.output_tokens;

      emitLLMCallEvent(
        runId, 'Design', 'penpot_design', taskId,
        m.model, m.usage.input_tokens, m.usage.output_tokens,
        m.costUsd, m.durationMs,
        `Design LLM complete: ${m.usage.input_tokens + m.usage.output_tokens} tokens`,
      );
    }

    // Write updated spec
    const designsDir = join(projectRoot, 'agentforge', 'designs');
    if (!existsSync(designsDir)) {
      mkdirSync(designsDir, { recursive: true });
    }

    const iteration = (page.chatIteration ?? 0) + 1;
    const artifactsDir = join(designsDir, pageId, `chat-${iteration}`);
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }
    writeFileSync(join(artifactsDir, 'research.json'), JSON.stringify(wrapResearchShallow(pageId, researchResult), null, 2));
    writeFileSync(join(artifactsDir, 'planning.json'), JSON.stringify(wrapPlanningShallow(pageId, planningResult), null, 2));
    writeFileSync(join(artifactsDir, 'chat-message.txt'), chatMessage);

    writeFileSync(join(designsDir, `${pageId}.json`), JSON.stringify(llmResponse.designSpec, null, 2));

    emitStageEvent(runId, 'design-chat-iterate', 'Design', 2, TOTAL_STAGES, 'completed', 'penpot_design',
      llmResponse.meta
        ? { totalCostUsd: llmResponse.meta.costUsd, tokensUsed: llmResponse.meta.usage.input_tokens + llmResponse.meta.usage.output_tokens }
        : undefined,
      taskId, 'Design spec updated successfully');

    // Update page status
    const updatedPages = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
    if (updatedPages) {
      const pi = updatedPages.pages.findIndex((p) => p.id === pageId);
      if (pi !== -1) {
        updatedPages.pages[pi].designStatus = 'rendered';
        updatedPages.pages[pi].designScore = null;
        updatedPages.pages[pi].chatIteration = iteration;
        writeYamlFile('agentforge/spec/pages.yaml', updatedPages);
      }
    }

    transitionTaskStatus(taskId, 'completed');
    completeRun(runId, { totalCostUsd, tokensUsed: totalTokensUsed });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    emitAgentLogEvent(runId, 'Pipeline', undefined, taskId, 'error',
      `Chat pipeline failed: ${errMessage}`);
    emitStageEvent(runId, 'design-chat-iterate', 'Failed', 0, TOTAL_STAGES, 'failed', undefined, undefined, taskId, `Chat pipeline failed: ${errMessage}`);
    failRun(runId, errMessage);
    transitionTaskStatus(taskId, 'failed');

    const freshPages = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
    if (freshPages) {
      const pi = freshPages.pages.findIndex((p) => p.id === pageId);
      if (pi !== -1) {
        freshPages.pages[pi].designStatus = 'rendered';
        writeYamlFile('agentforge/spec/pages.yaml', freshPages);
      }
    }
  }
}
