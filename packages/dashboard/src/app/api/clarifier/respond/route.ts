/**
 * POST /api/clarifier/respond — Resume the Clarifier after HITL interrupt.
 *
 * Accepts human answers and the threadId from a previous interrupt.
 * Streams SSE events per node using runClarifierPipelineStream.
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
import { getActiveProjectRoot, MONOREPO_ROOT } from '../../_lib/project-reader';
import { getSharedCheckpointer } from '../../_lib/checkpointer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGE_LABELS: Record<string, string> = {
  contextRetriever: 'Loading project context...',
  prdAnalyzer: 'Analyzing requirements with Claude Opus...',
  gapDetector: 'Detecting gaps and ambiguities...',
  questionPrioritizer: 'Prioritizing clarification questions...',
  storyWriter: 'Writing user stories...',
  critic: 'Reviewing story quality...',
  prdUpdater: 'Updating PRD with your answers...',
  escalationGate: 'Awaiting your decision...',
};

const PIPELINE_STEP_ORDER = [
  'contextRetriever',
  'prdAnalyzer',
  'gapDetector',
  'questionPrioritizer',
  'storyWriter',
  'critic',
  'prdUpdater',
  'emitComplete',
] as const;

const TOTAL_STEPS = PIPELINE_STEP_ORDER.length;

interface RespondBody {
  threadId?: string;
  answers?: ReadonlyArray<{
    questionId: string;
    answer: string;
    selectedOption?: string;
  }>;
  rawInput?: string;
  projectId?: string;
  mode?: 'bootstrap' | 'evolution';
  escalationDecision?: 'accept' | 'restart' | 'abandon';
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RespondBody;
  const { threadId, answers, rawInput, projectId, mode, escalationDecision } = body;

  if (!threadId) {
    return new Response(
      JSON.stringify({ error: 'threadId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!answers?.length && !escalationDecision) {
    return new Response(
      JSON.stringify({ error: 'Either answers or escalationDecision is required' }),
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

  const checkpointer = await getSharedCheckpointer();

  const baseCatalogPath = join(MONOREPO_ROOT, 'packages', 'core', 'src', 'catalogs', 'base-component-catalog.yaml');
  let baseCatalog: string | undefined;
  try {
    baseCatalog = readFileSync(baseCatalogPath, 'utf-8');
  } catch {
    // Falls back to loadBaseCatalog() inside the node
  }

  const humanResponses = answers?.map((a) => ({
    questionId: a.questionId,
    answer: a.answer,
    selectedOption: a.selectedOption,
  }));

  const input: ClarifierInput = {
    rawInput: rawInput ?? '',
    mode: mode ?? 'bootstrap',
    provider,
    projectRoot,
    projectId: resolvedProjectId,
    threadId,
    checkpointer,
    baseCatalog,
    humanResponses,
    escalationDecision,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown): void {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        for await (const event of runClarifierPipelineStream(input)) {
          switch (event.type) {
            case 'node-complete': {
              const stageLabel = STAGE_LABELS[event.node];
              if (stageLabel) {
                send('stage', {
                  stage: event.node,
                  label: stageLabel,
                  index: PIPELINE_STEP_ORDER.indexOf(event.node as typeof PIPELINE_STEP_ORDER[number]),
                  total: TOTAL_STEPS,
                  durationMs: event.durationMs,
                });
              }

              if ((event.node === 'prdAnalyzer' || event.node === 'prdUpdater') && event.state.prdDraft) {
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
                index: PIPELINE_STEP_ORDER.indexOf('questionPrioritizer'),
                total: TOTAL_STEPS,
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
                index: PIPELINE_STEP_ORDER.indexOf('emitComplete'),
                total: TOTAL_STEPS,
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
