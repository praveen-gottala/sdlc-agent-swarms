import { NextRequest, NextResponse } from 'next/server';
import { writeDesignSpec, loadProjectManifest } from '@agentforge/core';
import {
  readYamlFile,
  writeYamlFile,
  readTextFile,
  fileExists,
  getActiveProjectRoot,
} from '../../../_lib/project-reader';

export const dynamic = 'force-dynamic';
import { startRun, completeRun, failRun } from '../../../_lib/run-manager';
import {
  addTask,
  saveTasks,
  loadTasks,
  createRealFs,
} from '@agentforge/core';
import type { TaskEntry, LLMProviderRef } from '@agentforge/core';
import { NO_CLAUDE_AUTH_ERROR } from '../../../_lib/llm-provider';
import { transitionTaskStatus } from '../../../_lib/pipeline-helpers';
import { DashboardSseSink } from '../../../_lib/dashboard-sink';
import { createDashboardPipelineContext } from '../../../_lib/pipeline-context';
import { buildDashboardPipelineInput } from '../../../_lib/pipeline-input-builder';
import { resolveClaudeAuth, authResultToProviderConfig, createClaudeProvider } from '@agentforge/providers';
import { runDesignPipeline } from '@agentforge/agents-ux';
import {
  initLangfuseTracing,
  createTracedProvider,
  createLangfuseSink,
  CompositeSink,
} from '@agentforge/telemetry';
import type { PagesFile } from '../../../_lib/shared-types';

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

  const specPath = fileExists(`agentforge/designs/${pageId}.json`)
    ? `agentforge/designs/${pageId}.json`
    : null;
  const screenshotPath = `agentforge/designs/${pageId}.png`;

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
    specPath,
    screenshotPath: fileExists(screenshotPath) ? screenshotPath : null,
    mechanicalIssues,
    correctionIteration: page.correctionIteration ?? 0,
    score: page.designScore ?? null,
  });
}

/* ------------------------------------------------------------------ */
/*  POST /api/pages/[pageId]/design                                    */
/*  Runs the full design pipeline (Research → Planning → Design) via   */
/*  the shared runDesignPipeline orchestrator.                         */
/* ------------------------------------------------------------------ */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  let requestModel: string | undefined;
  try {
    const body = await request.json() as { model?: string };
    requestModel = body.model;
  } catch {
    // no body or invalid JSON — use defaults
  }

  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const idx = pages.findIndex((p) => p.id === pageId);

  if (idx === -1) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const auth = resolveClaudeAuth();
  if (!auth) {
    return NextResponse.json({ error: NO_CLAUDE_AUTH_ERROR }, { status: 503 });
  }

  const runResult = startRun('design-browser', { pageId });
  if (!runResult.ok) {
    return NextResponse.json(
      { error: runResult.error, activeRun: runResult.activeRun },
      { status: 409 },
    );
  }

  const { run } = runResult;
  const runId = run.runId;

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

  pages[idx].designStatus = 'generating';
  pages[idx].correctionIteration = 0;
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  initLangfuseTracing();

  const authConfig = authResultToProviderConfig(auth);
  const providerFactory = (model: string): LLMProviderRef => {
    const provider = createClaudeProvider(model, authConfig);
    return createTracedProvider(provider) as unknown as LLMProviderRef;
  };

  runPipelineAsync(runId, pageId, taskId, providerFactory, requestModel).catch(() => {
    failRun(runId, 'Unexpected pipeline error');
  });

  return NextResponse.json({ runId, pageId, taskId, status: 'running' });
}

async function runPipelineAsync(
  runId: string,
  pageId: string,
  taskId: string,
  providerFactory: (model: string) => LLMProviderRef,
  requestModel?: string,
): Promise<void> {
  const projectRoot = getActiveProjectRoot();

  transitionTaskStatus(taskId, 'in_progress');

  const dashSink = new DashboardSseSink(runId, 'design-browser', taskId);
  const langfuseSink = createLangfuseSink(runId, { projectName: projectRoot.split('/').pop() });
  const sink = langfuseSink ? new CompositeSink([dashSink, langfuseSink]) : dashSink;
  const manifestResult = loadProjectManifest(projectRoot, createRealFs());
  const projectManifest = manifestResult.ok ? manifestResult.value : undefined;
  const agentContext = createDashboardPipelineContext(taskId, projectRoot, providerFactory, projectManifest);
  const pipelineInput = buildDashboardPipelineInput(pageId, taskId, sink, agentContext, { providerString: requestModel });

  if (!pipelineInput) {
    failRun(runId, `Page ${pageId} not found in pages.yaml`);
    transitionTaskStatus(taskId, 'failed');
    return;
  }

  try {
    const result = await runDesignPipeline(pipelineInput);

    if (!result.ok) {
      const err = result.error as { message?: string; stage?: string };
      throw new Error(`Pipeline failed at ${err.stage ?? 'unknown'}: ${err.message ?? 'unknown error'}`);
    }

    const state = result.value;

    if (state.design?.spec) {
      writeDesignSpec(projectRoot, pageId, state.design.spec);
    }

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

    transitionTaskStatus(taskId, 'completed');
    completeRun(runId, {
      totalCostUsd: dashSink.getTotalCostUsd(),
      tokensUsed: dashSink.getTotalTokens(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sink.onStageFail('pipeline', message);
    failRun(runId, message);
    transitionTaskStatus(taskId, 'failed');

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
