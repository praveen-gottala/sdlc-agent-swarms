import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  readYamlFile,
  writeYamlFile,
  readTextFile,
  fileExists,
  getActiveProjectRoot,
} from '../../../_lib/project-reader';

export const dynamic = 'force-dynamic';
import { startRun, updateRunStatus, completeRun, failRun } from '../../../_lib/run-manager';
import { emitStageEvent, emitLLMCallEvent, emitAgentLogEvent } from '../../../_lib/event-writer';
import {
  addTask,
  saveTasks,
  loadTasks,
  createRealFs,
} from '@agentforge/core';
import type { TaskEntry } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import { getClaudeProvider, NO_CLAUDE_AUTH_ERROR } from '../../../_lib/llm-provider';
import {
  resolveDesignModel,
  buildDesignSpecSystemPrompt,
  callPipelineStage,
  callClaudeDesignAPI,
  transitionTaskStatus,
  DEFAULT_DESIGN_MODEL,
} from '../../../_lib/pipeline-helpers';
import type { DesignModel } from '../../../_lib/pipeline-helpers';
import type { PageEntry, PagesFile, DesignTokensFile } from '../../../_lib/shared-types';

/* ------------------------------------------------------------------ */
/*  GET /api/pages/[pageId]/design                                     */
/*  Returns design metadata for a page.                                */
/* ------------------------------------------------------------------ */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const page = pages.find((p) => p.id === pageId);

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const specPath = `agentforge/designs/${pageId}.json`;
  const screenshotPath = `agentforge/designs/${pageId}.png`;

  // Read mechanical issues from the stored issues file if it exists
  let mechanicalIssues: unknown[] = [];
  const issuesContent = readTextFile(`agentforge/designs/${pageId}.issues.json`);
  if (issuesContent) {
    try {
      mechanicalIssues = JSON.parse(issuesContent);
    } catch {
      // ignore parse errors
    }
  }

  return NextResponse.json({
    designStatus: page.designStatus ?? 'draft',
    specPath: fileExists(specPath) ? specPath : null,
    screenshotPath: fileExists(screenshotPath) ? screenshotPath : null,
    mechanicalIssues,
    correctionIteration: page.correctionIteration ?? 0,
    score: page.designScore ?? null,
  });
}

/* ------------------------------------------------------------------ */
/*  POST /api/pages/[pageId]/design                                    */
/*  Generates a DesignSpec v2 JSON for the page using LLM, then runs   */
/*  optional mechanical checks via @agentforge/designspec-renderer.    */
/* ------------------------------------------------------------------ */

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  // Parse optional model from request body
  let requestedModel: string | undefined;
  try {
    const body = await _request.json();
    requestedModel = body?.model;
  } catch {
    // No body or invalid JSON — use defaults
  }
  const model = resolveDesignModel(requestedModel);

  // Check if full pipeline is requested
  const url = new URL(_request.url);
  const pipeline = url.searchParams.get('pipeline');

  if (pipeline === 'full') {
    return handleFullPipeline(pageId, model);
  }

  // Default: quick single-shot generation (existing behavior)
  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const idx = pages.findIndex((p) => p.id === pageId);

  if (idx === -1) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const page = pages[idx];

  // ── Set status to 'generating' ──
  pages[idx].designStatus = 'generating';
  pages[idx].correctionIteration = 0;
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  // ── Create a task for this quick-generate run ──
  const taskId = `task-design-${pageId}-${Date.now()}`;
  const projectRoot = getActiveProjectRoot();
  const fs = createRealFs();
  const loadResult = loadTasks(projectRoot, fs);
  const tasksData = loadResult.ok ? loadResult.value : { tasks: [] };
  const newTask: TaskEntry = {
    id: taskId,
    title: `Design page: ${page.name}`,
    phase: 'design',
    agent: 'penpot_design',
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

  // ── Read page description and project context ──
  const description = page.description || page.name || pageId;
  const components = page.components ?? [];

  // Read design tokens from project spec
  const designTokens = readYamlFile<DesignTokensFile>('agentforge/spec/design-tokens.yaml');

  // Read component catalog if it exists
  const componentCatalog = readYamlFile<Record<string, unknown>>('agentforge/spec/component-catalog.yaml');

  // Read models and brand for richer prompt context
  const modelsYaml = readYamlFile<{ models?: Array<{ id: string; name: string; fields?: Array<{ name: string; type?: string }> }> }>('agentforge/spec/models.yaml');
  const brandYaml = readYamlFile<Record<string, unknown>>('agentforge/spec/brand.yaml');

  // ── Attempt to call the design pipeline ──
  let specGenerated = false;
  let specPath: string | null = null;
  let screenshotPath: string | null = null;
  let mechanicalIssues: unknown[] = [];
  let pipelineNote: string | null = null;

  const claude = getClaudeProvider();

  if (!claude) {
    // No auth — cannot call LLM. Revert status and return error.
    pages[idx].designStatus = 'draft';
    writeYamlFile('agentforge/spec/pages.yaml', { pages });
    return NextResponse.json(
      { error: NO_CLAUDE_AUTH_ERROR, pageId, designStatus: 'draft' },
      { status: 503 },
    );
  }

  const provider = claude.provider;

  // Transition task to in_progress
  transitionTaskStatus(taskId, 'in_progress');
  emitStageEvent('quick-gen', 'design-generate', 'Design', 0, 1, 'started', 'penpot_design', undefined, taskId, `Generating design for: ${page.name}`);

  try {
    // Dynamic import so the dashboard can build even if dependencies are unavailable
    const { SUBMIT_DESIGN_TOOL } = await import('@agentforge/designspec-renderer');

    // Build the LLM prompt for DesignSpec v2 generation
    const systemPrompt = buildDesignSpecSystemPrompt(
      description,
      components,
      designTokens,
      componentCatalog,
      modelsYaml,
      brandYaml,
      pages,
      pageId,
    );

    // Call Claude via provider abstraction (supports both direct API and Vertex AI)
    const llmResponse = await callClaudeDesignAPI(provider, systemPrompt, description, SUBMIT_DESIGN_TOOL, model);

    if (!llmResponse.ok) {
      throw new Error(`LLM API call failed: ${llmResponse.error}`);
    }

    const designSpec = llmResponse.designSpec;

    // ── Emit LLM call event with token/cost data ──
    if (llmResponse.meta) {
      const m = llmResponse.meta;
      emitLLMCallEvent(
        'quick-gen', 'Design', 'penpot_design', taskId,
        m.model, m.usage.input_tokens, m.usage.output_tokens,
        m.costUsd, m.durationMs, `Design LLM call: ${m.usage.input_tokens + m.usage.output_tokens} tokens, $${m.costUsd.toFixed(4)}`,
      );
    }

    // ── Write spec to disk ──
    const designsDir = join(projectRoot, 'agentforge', 'designs');
    if (!existsSync(designsDir)) {
      mkdirSync(designsDir, { recursive: true });
    }

    const specFilePath = join(designsDir, `${pageId}.json`);
    writeFileSync(specFilePath, JSON.stringify(designSpec, null, 2), 'utf-8');
    specPath = `agentforge/designs/${pageId}.json`;
    specGenerated = true;

    // ── Run mechanical checks if available ──
    try {
      const renderer = await import('@agentforge/designspec-renderer');
      const { checkMechanicalIssues, validateDesignSpec, loadCatalogForRenderer } = renderer;

      if (typeof checkMechanicalIssues === 'function') {
        // checkMechanicalIssues requires DOMLayoutData which comes from a browser render.
        // Without a running browser session, we can validate the spec structurally instead.
        if (typeof validateDesignSpec === 'function') {
          // Load the default built-in catalog for validation
          const catalog = typeof loadCatalogForRenderer === 'function'
            ? loadCatalogForRenderer()
            : new Map();
          const validationResult = validateDesignSpec(designSpec as any, catalog as any);
          // Combine errors and warnings into a single issues list
          const allIssues = [...(validationResult.errors ?? []), ...(validationResult.warnings ?? [])];
          if (allIssues.length > 0) {
            mechanicalIssues = allIssues.map((issue) => ({
              nodeId: issue.nodeId ?? 'root',
              rule: issue.rule ?? 'validation',
              autoFixable: false,
              description: `[${issue.severity}] ${issue.message}`,
            }));
          }
        }

        // Store issues for GET endpoint
        writeFileSync(
          join(designsDir, `${pageId}.issues.json`),
          JSON.stringify(mechanicalIssues, null, 2),
          'utf-8',
        );

        pipelineNote =
          'Design spec generated via LLM. Structural validation completed. ' +
          'Full mechanical checks (overlap, overflow, zero-size, text-clip) require a browser render session ' +
          'with Playwright — run `npx playwright install` and use the correction pipeline for those.';
      }
    } catch (mechErr) {
      pipelineNote =
        'Design spec generated via LLM. Mechanical checks could not be run: ' +
        String(mechErr instanceof Error ? mechErr.message : mechErr);
    }

    // ── Update status to 'rendered' ──
    pages[idx].designStatus = 'rendered';
    pages[idx].designScore = null;
    writeYamlFile('agentforge/spec/pages.yaml', { pages });

    const quickGenCost = llmResponse.meta
      ? { totalCostUsd: llmResponse.meta.costUsd, tokensUsed: llmResponse.meta.usage.input_tokens + llmResponse.meta.usage.output_tokens }
      : undefined;
    emitStageEvent('quick-gen', 'design-generate', 'Design', 0, 1, 'completed', 'penpot_design', quickGenCost, taskId, 'Design spec generated successfully');
    transitionTaskStatus(taskId, 'completed');
  } catch (err) {
    // ── Pipeline failed — revert to 'draft' ──
    pages[idx].designStatus = 'draft';
    writeYamlFile('agentforge/spec/pages.yaml', { pages });

    const errorMessage = err instanceof Error ? err.message : String(err);
    emitStageEvent('quick-gen', 'design-generate', 'Design', 0, 1, 'failed', 'penpot_design', undefined, taskId, `Design generation failed: ${errorMessage}`);
    transitionTaskStatus(taskId, 'failed');
    return NextResponse.json(
      {
        error: `Design generation failed: ${errorMessage}`,
        pageId,
        designStatus: 'draft',
        pipelineNote:
          'The design pipeline requires: ' +
          '(1) Claude auth (ANTHROPIC_API_KEY or Vertex AI config), ' +
          '(2) @agentforge/designspec-renderer built and linked, ' +
          '(3) A valid page description in pages.yaml. ' +
          'For the full pipeline with Penpot export and browser correction, ' +
          'use the CLI: `agentforge design:page <pageId>`.',
      },
      { status: 500 },
    );
  }

  // ── Return result ──
  const response: Record<string, unknown> = {
    message: specGenerated ? 'Design spec generated successfully' : 'Design generation completed',
    pageId,
    taskId,
    designStatus: pages[idx].designStatus,
    specPath,
    screenshotPath,
    mechanicalIssues,
  };

  if (pipelineNote) {
    response.pipelineNote = pipelineNote;
  }

  return NextResponse.json(response, { status: specGenerated ? 200 : 202 });
}

/* ------------------------------------------------------------------ */
/*  Full pipeline handler (Research → Planning → Design)               */
/* ------------------------------------------------------------------ */

async function handleFullPipeline(pageId: string, model: DesignModel = DEFAULT_DESIGN_MODEL): Promise<NextResponse> {
  const claude = getClaudeProvider();
  if (!claude) {
    return NextResponse.json(
      { error: NO_CLAUDE_AUTH_ERROR },
      { status: 503 },
    );
  }

  const pipelineProvider = claude.provider;

  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx === -1) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Create run
  const runResult = startRun('design-penpot', { pageId });
  if (!runResult.ok) {
    return NextResponse.json(
      { error: runResult.error, activeRun: runResult.activeRun },
      { status: 409 },
    );
  }

  const { run } = runResult;
  const runId = run.runId;

  // Create a real task for this pipeline run
  const taskId = `task-design-${pageId}-${Date.now()}`;
  const projectRoot = getActiveProjectRoot();
  const fs = createRealFs();
  const loadResult = loadTasks(projectRoot, fs);
  const tasksFile = loadResult.ok ? loadResult.value : { tasks: [] };

  const newTask: TaskEntry = {
    id: taskId,
    title: `Design page: ${pages[idx].name}`,
    phase: 'design',
    agent: 'ux_research',
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

  const addResult = addTask(tasksFile, newTask);
  if (addResult.ok) {
    saveTasks(projectRoot, addResult.value, fs);
  }

  // Set page to generating
  pages[idx].designStatus = 'generating';
  pages[idx].correctionIteration = 0;
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  // Fire-and-forget: run pipeline in background
  runFullPipelineAsync(runId, pageId, pipelineProvider, taskId, model).catch(() => {
    // Ensure we always fail the run on uncaught error
    failRun(runId, 'Unexpected pipeline error');
  });

  // Return immediately with run ID
  return NextResponse.json({ runId, pageId, taskId, status: 'running' });
}

async function runFullPipelineAsync(
  runId: string,
  pageId: string,
  provider: LLMProvider,
  taskId: string,
  model: DesignModel = DEFAULT_DESIGN_MODEL,
): Promise<void> {
  const TOTAL_STAGES = 3;
  const projectRoot = getActiveProjectRoot();

  // Re-read pages from disk to avoid stale data from the HTTP handler
  const freshPagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = freshPagesFile?.pages ?? [];
  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    failRun(runId, `Page ${pageId} no longer exists in pages.yaml`);
    transitionTaskStatus(taskId, 'failed');
    return;
  }
  const description = page.description || page.name || pageId;

  // Transition task to in_progress
  transitionTaskStatus(taskId, 'in_progress');

  try {
    // Load project context
    const designTokens = readYamlFile<DesignTokensFile>('agentforge/spec/design-tokens.yaml');
    const brandYaml = readYamlFile<Record<string, unknown>>('agentforge/spec/brand.yaml');
    const prdContent = readTextFile('docs/prd.md');

    // ── Stage 1: Research ──
    updateRunStatus(runId, {
      status: 'running',
      stage: 'Research',
      progress: { current: 0, total: TOTAL_STAGES, label: 'Research' },
      agentRole: 'ux_research',
      stageDescription: 'Loading project context',
    });
    emitStageEvent(runId, 'design-penpot', 'Research', 0, TOTAL_STAGES, 'started', 'ux_research', undefined, taskId, 'Research: analyzing page requirements');

    // Accumulate cost across all stages
    let totalCostUsd = 0;
    let totalTokensUsed = 0;

    emitAgentLogEvent(runId, 'Research', 'ux_research', taskId, 'info',
      `Loaded project context: PRD (${prdContent ? `${(prdContent.length / 1024).toFixed(0)}KB` : 'missing'}), design tokens (${designTokens ? 'found' : 'missing'}), brand guidelines (${brandYaml ? 'found' : 'missing'})`,
      { descriptionLength: description.length, prdLength: prdContent?.length ?? 0 });

    emitAgentLogEvent(runId, 'Research', 'ux_research', taskId, 'info',
      'Calling LLM for UX research analysis — this may take 1-2 minutes...');
    updateRunStatus(runId, { stageDescription: 'Calling LLM for UX research analysis' });

    const researchResponse = await callPipelineStage(provider, 'research', {
      description,
      prdContent,
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
      `Research LLM complete: ${researchResponse.meta.usage.input_tokens + researchResponse.meta.usage.output_tokens} tokens, $${researchResponse.meta.costUsd.toFixed(4)}, ${(researchResponse.meta.durationMs / 1000).toFixed(1)}s`,
    );

    emitAgentLogEvent(runId, 'Research', 'ux_research', taskId, 'info',
      `Research brief generated: ${(researchResult.length / 1024).toFixed(1)}KB`);

    emitStageEvent(runId, 'design-penpot', 'Research', 0, TOTAL_STAGES, 'completed', 'ux_research',
      { totalCostUsd: researchResponse.meta.costUsd, tokensUsed: researchResponse.meta.usage.input_tokens + researchResponse.meta.usage.output_tokens },
      taskId, 'Research stage complete');

    // ── Stage 2: Planning ──
    updateRunStatus(runId, {
      stage: 'Planning',
      progress: { current: 1, total: TOTAL_STAGES, label: 'Planning' },
      agentRole: 'ux_planning',
      stageDescription: 'Preparing planning context',
    });
    emitStageEvent(runId, 'design-penpot', 'Planning', 1, TOTAL_STAGES, 'started', 'ux_planning', undefined, taskId, 'Planning stage started');

    emitAgentLogEvent(runId, 'Planning', 'ux_planning', taskId, 'info',
      `Feeding research brief (${(researchResult.length / 1024).toFixed(1)}KB) into planning agent`);

    emitAgentLogEvent(runId, 'Planning', 'ux_planning', taskId, 'info',
      'Calling LLM for component tree and layout planning — this may take 1-2 minutes...');
    updateRunStatus(runId, { stageDescription: 'Calling LLM for layout planning' });

    const planningResponse = await callPipelineStage(provider, 'planning', {
      description,
      researchBrief: researchResult,
      designTokens: designTokens ? JSON.stringify(designTokens) : null,
    }, page.name, model);
    const planningResult = planningResponse.text;

    totalCostUsd += planningResponse.meta.costUsd;
    totalTokensUsed += planningResponse.meta.usage.input_tokens + planningResponse.meta.usage.output_tokens;

    emitLLMCallEvent(
      runId, 'Planning', 'ux_planning', taskId,
      planningResponse.meta.model, planningResponse.meta.usage.input_tokens, planningResponse.meta.usage.output_tokens,
      planningResponse.meta.costUsd, planningResponse.meta.durationMs,
      `Planning LLM complete: ${planningResponse.meta.usage.input_tokens + planningResponse.meta.usage.output_tokens} tokens, $${planningResponse.meta.costUsd.toFixed(4)}, ${(planningResponse.meta.durationMs / 1000).toFixed(1)}s`,
    );

    emitAgentLogEvent(runId, 'Planning', 'ux_planning', taskId, 'info',
      `Planning spec generated: ${(planningResult.length / 1024).toFixed(1)}KB`);

    emitStageEvent(runId, 'design-penpot', 'Planning', 1, TOTAL_STAGES, 'completed', 'ux_planning',
      { totalCostUsd: planningResponse.meta.costUsd, tokensUsed: planningResponse.meta.usage.input_tokens + planningResponse.meta.usage.output_tokens },
      taskId, 'Planning stage complete');

    // ── Stage 3: Design ──
    updateRunStatus(runId, {
      stage: 'Design',
      progress: { current: 2, total: TOTAL_STAGES, label: 'Design' },
      agentRole: 'penpot_design',
      stageDescription: 'Preparing design context',
    });
    emitStageEvent(runId, 'design-penpot', 'Design', 2, TOTAL_STAGES, 'started', 'penpot_design', undefined, taskId, 'Design stage started');

    const { SUBMIT_DESIGN_TOOL } = await import('@agentforge/designspec-renderer');
    const componentCatalog = readYamlFile<Record<string, unknown>>('agentforge/spec/component-catalog.yaml');
    const modelsYaml = readYamlFile<{ models?: Array<{ id: string; name: string; fields?: Array<{ name: string; type?: string }> }> }>('agentforge/spec/models.yaml');

    const catalogKeys = componentCatalog
      ? Object.keys((componentCatalog as Record<string, unknown>).components ?? {})
      : [];
    emitAgentLogEvent(runId, 'Design', 'penpot_design', taskId, 'info',
      `Design input: ${(page.components ?? []).length} components, ${catalogKeys.length} catalog entries, research + planning context from prior stages`);

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
      description,
      '',
      '## Research Brief',
      researchResult,
      '',
      '## Planning Specification',
      planningResult,
    ].join('\n');

    emitAgentLogEvent(runId, 'Design', 'penpot_design', taskId, 'info',
      `Calling LLM to generate DesignSpec v2 JSON (${(systemPrompt.length / 1024).toFixed(0)}KB prompt) — this is the longest stage, typically 2-3 minutes...`);
    updateRunStatus(runId, { stageDescription: 'Generating DesignSpec via LLM' });

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
        `Design LLM complete: ${m.usage.input_tokens + m.usage.output_tokens} tokens, $${m.costUsd.toFixed(4)}, ${(m.durationMs / 1000).toFixed(1)}s`,
      );
    }

    const specNodes = llmResponse.designSpec?.nodes;
    const nodeCount = specNodes && typeof specNodes === 'object' ? Object.keys(specNodes as object).length : 0;
    emitAgentLogEvent(runId, 'Design', 'penpot_design', taskId, 'info',
      `Design spec generated: ${nodeCount} nodes for page "${page.name}"`);
    updateRunStatus(runId, { stageDescription: 'Saving design artifacts' });

    // Write spec to disk
    const designsDir = join(projectRoot, 'agentforge', 'designs');
    if (!existsSync(designsDir)) {
      mkdirSync(designsDir, { recursive: true });
    }

    // Save research and planning artifacts
    const artifactsDir = join(designsDir, pageId);
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }
    writeFileSync(join(artifactsDir, 'research.json'), JSON.stringify({ brief: researchResult }, null, 2));
    writeFileSync(join(artifactsDir, 'planning.json'), JSON.stringify({ spec: planningResult }, null, 2));

    // Write design spec
    writeFileSync(join(designsDir, `${pageId}.json`), JSON.stringify(llmResponse.designSpec, null, 2));

    emitAgentLogEvent(runId, 'Design', 'penpot_design', taskId, 'info',
      `Artifacts saved: research.json, planning.json, ${pageId}.json`);

    emitStageEvent(runId, 'design-penpot', 'Design', 2, TOTAL_STAGES, 'completed', 'penpot_design',
      llmResponse.meta
        ? { totalCostUsd: llmResponse.meta.costUsd, tokensUsed: llmResponse.meta.usage.input_tokens + llmResponse.meta.usage.output_tokens }
        : undefined,
      taskId, 'Design spec generated successfully');

    // Update page status
    const freshPages = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
    if (freshPages) {
      const pi = freshPages.pages.findIndex((p) => p.id === pageId);
      if (pi !== -1) {
        freshPages.pages[pi].designStatus = 'rendered';
        freshPages.pages[pi].designScore = null;
        writeYamlFile('agentforge/spec/pages.yaml', freshPages);
      }
    }

    // Transition task to completed
    transitionTaskStatus(taskId, 'completed');

    completeRun(runId, { totalCostUsd, tokensUsed: totalTokensUsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitAgentLogEvent(runId, 'Pipeline', undefined, taskId, 'error',
      `Pipeline failed: ${message}`);
    emitStageEvent(runId, 'design-penpot', 'Failed', 0, TOTAL_STAGES, 'failed', undefined, undefined, taskId, `Pipeline failed: ${message}`);
    failRun(runId, message);

    // Transition task to failed
    transitionTaskStatus(taskId, 'failed');

    // Revert page status
    const freshPages = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
    if (freshPages) {
      const pi = freshPages.pages.findIndex((p) => p.id === pageId);
      if (pi !== -1) {
        freshPages.pages[pi].designStatus = 'draft';
        writeYamlFile('agentforge/spec/pages.yaml', freshPages);
      }
    }
  }
}

