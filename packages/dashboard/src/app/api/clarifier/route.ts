/**
 * POST /api/clarifier — Start the Clarifier pipeline with SSE streaming.
 *
 * Streams stage progress events as the pipeline runs, then sends the
 * final result (questions on interrupt, PRD on completion).
 */

import type { NextRequest } from 'next/server';
import {
  resolveClaudeAuth,
  authResultToProviderConfig,
  createClaudeProvider,
} from '@agentforge/providers';
import { createTracedProvider, initLangfuseTracing } from '@agentforge/telemetry';
import { runClarifierPipeline } from '@agentforge/agents-clarifier';
import type { ClarifierInput } from '@agentforge/agents-clarifier';
import { createCheckpointer, MemorySaver } from '@agentforge/core';
import { getActiveProjectRoot, MONOREPO_ROOT } from '../_lib/project-reader';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGE_LABELS: Record<string, string> = {
  contextRetriever: 'Loading project context...',
  prdAnalyzer: 'Analyzing requirements with Claude Opus...',
  gapDetector: 'Detecting gaps and ambiguities...',
  questionPrioritizer: 'Prioritizing clarification questions...',
  storyWriter: 'Writing user stories...',
  critic: 'Reviewing story quality...',
  escalationGate: 'Awaiting your decision...',
  emitComplete: 'Finalizing requirements...',
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { rawInput, mode = 'bootstrap', projectId } = body as {
    rawInput?: string;
    mode?: 'bootstrap' | 'evolution';
    projectId?: string;
  };

  if (!rawInput?.trim()) {
    return new Response(
      JSON.stringify({ error: 'rawInput is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const auth = resolveClaudeAuth();
  if (!auth) {
    return new Response(
      JSON.stringify({ error: 'No Claude API authentication configured.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const projectRoot = getActiveProjectRoot();
  const resolvedProjectId = projectId ?? `project-${Date.now()}`;

  initLangfuseTracing();

  const authConfig = authResultToProviderConfig(auth);
  const provider = createTracedProvider(
    createClaudeProvider('claude-opus-4-6', authConfig),
  );

  let checkpointer;
  try {
    checkpointer = await createCheckpointer();
  } catch {
    checkpointer = new MemorySaver();
  }

  const baseCatalogPath = join(MONOREPO_ROOT, 'packages', 'core', 'src', 'catalogs', 'base-component-catalog.yaml');
  let baseCatalog: string | undefined;
  try {
    baseCatalog = readFileSync(baseCatalogPath, 'utf-8');
  } catch {
    // Falls back to loadBaseCatalog() inside the node
  }

  const input: ClarifierInput = {
    rawInput: rawInput.trim(),
    mode,
    provider,
    projectRoot,
    projectId: resolvedProjectId,
    maxRounds: 3,
    checkpointer,
    baseCatalog,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const stages = Object.keys(STAGE_LABELS);
      send('stage', { stage: stages[0], label: STAGE_LABELS[stages[0]], index: 0, total: stages.length });

      const result = await runClarifierPipeline(input);

      if (!result.ok) {
        send('error', { error: result.error.message, code: result.error.code });
        controller.close();
        return;
      }

      const { state, threadId, interrupted } = result.value;

      // Send the completed stage
      send('stage', {
        stage: interrupted ? 'questionPrioritizer' : 'emitComplete',
        label: interrupted ? 'Questions ready!' : 'Requirements complete!',
        index: interrupted ? 3 : stages.length - 1,
        total: stages.length,
      });

      send('result', {
        threadId,
        interrupted,
        state: {
          mode: state.mode,
          round: state.round,
          maxRounds: state.maxRounds,
          questions: state.questions,
          gaps: state.gaps,
          requirement: state.requirement,
          assumptions: state.assumptions,
          prdDraft: state.prdDraft,
          featurePlan: state.featurePlan,
          error: state.error,
        },
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
