/**
 * POST /api/reviewer — Start the Reviewer pipeline with SSE streaming.
 *
 * Streams deterministic gate results, LLM review findings, and
 * the final ReviewResult with disposition.
 *
 * Pattern: mirrors /api/implementer/route.ts.
 */

import type { NextRequest } from 'next/server';
import {
  resolveClaudeAuth,
  authResultToProviderConfig,
  createClaudeProvider,
} from '@agentforge/providers';
import { createTracedProvider, initLangfuseTracing } from '@agentforge/telemetry';
import { runReviewerPipelineStream } from '@agentforge/agents-reviewer';
import type { ReviewerInput } from '@agentforge/agents-reviewer';
import type {
  Diff,
  AssumptionLedger,
  ContractBundle,
  TaskCompletionReport,
} from '@agentforge/core';
import { getActiveProjectRoot } from '../_lib/project-reader';
import { getSharedCheckpointer } from '../_lib/checkpointer';

const STAGE_LABELS: Record<string, string> = {
  deterministicGates: 'Running deterministic gates...',
  llmReview: 'LLM reviewing diff...',
  emitReviewResult: 'Finalizing review...',
};

const NODE_ORDER = [
  'deterministicGates',
  'llmReview',
  'emitReviewResult',
] as const;

const TOTAL_STEPS = NODE_ORDER.length;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    diff,
    assumptionLedger,
    contractBundle,
    taskCompletionReport,
    projectId,
  } = body as {
    diff?: Diff;
    assumptionLedger?: AssumptionLedger;
    contractBundle?: Partial<ContractBundle>;
    taskCompletionReport?: TaskCompletionReport;
    projectId?: string;
  };

  if (!diff) {
    return new Response(
      JSON.stringify({ error: 'diff is required' }),
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
    createClaudeProvider('claude-sonnet-4-6', authConfig),
  );

  const checkpointer = await getSharedCheckpointer();

  const input: ReviewerInput = {
    diff,
    assumptionLedger,
    contractBundle,
    taskCompletionReport,
    provider,
    projectRoot,
    projectId: resolvedProjectId,
    checkpointer,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown): void {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      try {
        for await (const event of runReviewerPipelineStream(input)) {
          switch (event.type) {
            case 'node-complete': {
              const stageLabel = STAGE_LABELS[event.node];
              if (stageLabel) {
                send('stage', {
                  stage: event.node,
                  label: stageLabel,
                  index: NODE_ORDER.indexOf(
                    event.node as (typeof NODE_ORDER)[number],
                  ),
                  total: TOTAL_STEPS,
                  durationMs: event.durationMs,
                });
              }

              if (
                event.node === 'deterministicGates' &&
                event.state.gateResults
              ) {
                send('gates', { gateResults: event.state.gateResults });
              }
              break;
            }

            case 'complete': {
              send('stage', {
                stage: 'emitReviewResult',
                label: 'Review complete!',
                index: NODE_ORDER.indexOf('emitReviewResult'),
                total: TOTAL_STEPS,
              });

              send('result', {
                reviewResult: event.reviewResult,
              });
              break;
            }

            case 'error': {
              send('error', {
                error: event.error.message,
                code: event.error.code,
              });
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
      Connection: 'keep-alive',
    },
  });
}
