/**
 * POST /api/implementer — Start the Implementer pipeline with SSE streaming.
 *
 * Streams stage progress events as the pipeline runs, then sends the
 * final result (completion report or error).
 *
 * Pattern: mirrors /api/clarifier/route.ts.
 */

import type { NextRequest } from 'next/server';
import {
  resolveClaudeAuth,
  authResultToProviderConfig,
  createClaudeProvider,
} from '@agentforge/providers';
import { createTracedProvider, initLangfuseTracing } from '@agentforge/telemetry';
import { runImplementerPipelineStream } from '@agentforge/agents-implementer';
import type { ImplementerInput } from '@agentforge/agents-implementer';
import type { TaskNode, ContractBundle } from '@agentforge/core';
import { getActiveProjectRoot } from '../_lib/project-reader';
import { getSharedCheckpointer } from '../_lib/checkpointer';

const STAGE_LABELS: Record<string, string> = {
  loadTaskContext: 'Loading task context...',
  runDesignSpecialist: 'Generating design...',
  generateCode: 'Writing code...',
  reportCompletion: 'Finalizing...',
};

const NODE_ORDER = [
  'loadTaskContext',
  'runDesignSpecialist',
  'generateCode',
  'reportCompletion',
] as const;

const TOTAL_STEPS = NODE_ORDER.length;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { task, contractBundle, existingDesignSpecs, projectId } = body as {
    task?: TaskNode;
    contractBundle?: Partial<ContractBundle>;
    existingDesignSpecs?: Record<string, unknown>;
    projectId?: string;
  };

  if (!task) {
    return new Response(
      JSON.stringify({ error: 'task is required' }),
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

  const input: ImplementerInput = {
    task,
    contractBundle: contractBundle ?? {},
    existingDesignSpecs: existingDesignSpecs as ImplementerInput['existingDesignSpecs'],
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
        for await (const event of runImplementerPipelineStream(input)) {
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
                event.node === 'generateCode' &&
                event.state.artifacts
              ) {
                send('artifacts', { artifacts: event.state.artifacts });
              }
              break;
            }

            case 'complete': {
              send('stage', {
                stage: 'reportCompletion',
                label: 'Implementation complete!',
                index: NODE_ORDER.indexOf('reportCompletion'),
                total: TOTAL_STEPS,
              });

              send('result', {
                completionReport: event.state.completionReport,
                artifacts: event.state.artifacts,
                errors: event.state.errors,
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
