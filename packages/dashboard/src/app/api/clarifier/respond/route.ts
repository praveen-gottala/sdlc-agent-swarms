/**
 * POST /api/clarifier/respond — Resume the Clarifier after HITL interrupt.
 *
 * Accepts human answers and the threadId from a previous interrupt.
 * The checkpointer resumes the graph from where it was interrupted.
 */

import { NextResponse } from 'next/server';
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
import { getActiveProjectRoot } from '../../_lib/project-reader';

interface RespondBody {
  threadId?: string;
  answers?: ReadonlyArray<{
    questionId: string;
    answer: string;
    selectedOption?: string;
  }>;
  projectId?: string;
  escalationDecision?: 'accept' | 'restart' | 'abandon';
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RespondBody;
  const { threadId, answers, projectId, escalationDecision } = body;

  if (!threadId) {
    return NextResponse.json(
      { error: 'threadId is required' },
      { status: 400 },
    );
  }

  if (!answers?.length && !escalationDecision) {
    return NextResponse.json(
      { error: 'Either answers or escalationDecision is required' },
      { status: 400 },
    );
  }

  const auth = resolveClaudeAuth();
  if (!auth) {
    return NextResponse.json(
      { error: 'No Claude API authentication configured.' },
      { status: 503 },
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

  const input: ClarifierInput = {
    rawInput: '',
    mode: 'bootstrap',
    provider,
    projectRoot,
    projectId: resolvedProjectId,
    threadId,
    checkpointer,
  };

  const result = await runClarifierPipeline(input);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: 500 },
    );
  }

  const { state, interrupted } = result.value;

  return NextResponse.json({
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
}
