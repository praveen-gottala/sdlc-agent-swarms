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
import { runClarifierPipelineStream } from '@agentforge/agents-clarifier';
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
  prdUpdater: 'Updating PRD with your answers...',
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
  const stages = Object.keys(STAGE_LABELS);

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown): void {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      let nodeIndex = 0;

      try {
        for await (const event of runClarifierPipelineStream(input)) {
          switch (event.type) {
            case 'node-complete': {
              const stageLabel = STAGE_LABELS[event.node];
              if (stageLabel) {
                send('stage', {
                  stage: event.node,
                  label: stageLabel,
                  index: nodeIndex,
                  total: stages.length,
                });
                nodeIndex++;
              }

              if (event.node === 'prdAnalyzer' && event.state.prdDraft) {
                send('prd-draft', { prdDraft: event.state.prdDraft });
              }
              if (event.node === 'gapDetector' && event.state.gaps) {
                send('gaps', { gaps: event.state.gaps });
              }
              break;
            }

            case 'interrupt': {
              send('stage', {
                stage: 'questionPrioritizer',
                label: 'Questions ready!',
                index: stages.indexOf('questionPrioritizer'),
                total: stages.length,
              });

              send('result', {
                threadId: event.threadId,
                interrupted: true,
                state: {
                  mode: event.state.mode,
                  round: event.state.round,
                  maxRounds: event.state.maxRounds,
                  questions: event.state.questions,
                  gaps: event.state.gaps,
                  requirement: event.state.requirement,
                  assumptions: event.state.assumptions,
                  prdDraft: event.state.prdDraft,
                  featurePlan: event.state.featurePlan,
                  error: event.state.error,
                },
              });
              break;
            }

            case 'complete': {
              send('stage', {
                stage: 'emitComplete',
                label: 'Requirements complete!',
                index: stages.length - 1,
                total: stages.length,
              });

              send('result', {
                threadId: event.threadId,
                interrupted: false,
                state: {
                  mode: event.state.mode,
                  round: event.state.round,
                  maxRounds: event.state.maxRounds,
                  questions: event.state.questions,
                  gaps: event.state.gaps,
                  requirement: event.state.requirement,
                  assumptions: event.state.assumptions,
                  prdDraft: event.state.prdDraft,
                  featurePlan: event.state.featurePlan,
                  error: event.state.error,
                },
              });
              break;
            }

            case 'error': {
              send('error', { error: event.error.message, code: event.error.code });
              break;
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        send('error', { error: message, code: 'STREAM_ERROR' });
      }

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
