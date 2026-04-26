import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  readYamlFile,
  writeYamlFile,
  getActiveProjectRoot,
} from '../../../../_lib/project-reader';
import { startRun, completeRun, failRun } from '../../../../_lib/run-manager';
import { DashboardSseSink } from '../../../../_lib/dashboard-sink';
import {
  addTask,
  saveTasks,
  loadTasks,
  createRealFs,
} from '@agentforge/core';
import type { TaskEntry } from '@agentforge/core';
import { getClaudeProvider, NO_CLAUDE_AUTH_ERROR } from '../../../../_lib/llm-provider';
import { transitionTaskStatus } from '../../../../_lib/pipeline-helpers';
import type { PagesFile } from '../../../../_lib/shared-types';
import { BrowserFeedbackAdapter } from '@agentforge/agents-ux';
import type { LLMProvider } from '@agentforge/providers';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';

/**
 * POST /api/pages/[pageId]/design/chat
 *
 * Accepts a free-text design change request and applies it as a single LLM
 * patch via BrowserFeedbackAdapter. One LLM call — no research/planning stages.
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

  runChatAsync(runId, pageId, message, claude.provider, taskId).catch(() => {
    failRun(runId, 'Unexpected chat pipeline error');
  });

  return NextResponse.json({ runId, pageId, taskId, status: 'running' });
}

async function runChatAsync(
  runId: string,
  pageId: string,
  chatMessage: string,
  provider: LLMProvider,
  taskId: string,
): Promise<void> {
  const projectRoot = getActiveProjectRoot();
  const sink = new DashboardSseSink(runId, 'design-chat-iterate', taskId);

  const freshPagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = freshPagesFile?.pages ?? [];
  const page = pages.find((p) => p.id === pageId);
  if (!page) {
    failRun(runId, `Page ${pageId} no longer exists in pages.yaml`);
    transitionTaskStatus(taskId, 'failed');
    return;
  }

  let existingSpec: Record<string, unknown>;
  try {
    const raw = readFileSync(
      join(projectRoot, 'agentforge', 'designs', `${pageId}.json`),
      'utf-8',
    );
    existingSpec = JSON.parse(raw);
  } catch {
    failRun(runId, `Could not read existing design spec for ${pageId}`);
    transitionTaskStatus(taskId, 'failed');
    return;
  }

  transitionTaskStatus(taskId, 'in_progress');

  try {
    sink.onStageStart('design', { agentRole: 'chat_iterate', moduleId: pageId, taskId });
    sink.onLog('design', 'info',
      `Chat message: "${chatMessage.slice(0, 100)}${chatMessage.length > 100 ? '...' : ''}"`);

    const adapter = new BrowserFeedbackAdapter(provider as unknown as import('@agentforge/core').LLMProviderRef);
    const reviewResult = await adapter.reviewDesign(existingSpec as unknown as DesignSpecV2, chatMessage);

    if (!reviewResult.ok) {
      const errMsg = 'message' in reviewResult.error ? reviewResult.error.message : String(reviewResult.error);
      sink.onStageFail('design', errMsg);
      throw new Error(errMsg);
    }

    const updatedSpec = adapter.applyPatch(
      existingSpec as unknown as DesignSpecV2,
      reviewResult.value,
    );

    sink.onStageComplete('design', {});

    const designsDir = join(projectRoot, 'agentforge', 'designs');
    if (!existsSync(designsDir)) {
      mkdirSync(designsDir, { recursive: true });
    }

    const iteration = (page.chatIteration ?? 0) + 1;
    const artifactsDir = join(designsDir, pageId, `chat-${iteration}`);
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }
    writeFileSync(join(artifactsDir, 'chat-message.txt'), chatMessage);

    writeFileSync(join(designsDir, `${pageId}.json`), JSON.stringify(updatedSpec, null, 2));

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
    completeRun(runId, {
      totalCostUsd: sink.getTotalCostUsd(),
      tokensUsed: sink.getTotalTokens(),
    });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    sink.onLog('design', 'error', `Chat iteration failed: ${errMessage}`);
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
