'use client';

/**
 * @module use-clarifier-stream
 *
 * React hook that manages the Clarifier SSE stream and builds a chat message log.
 * Replaces the inline SSE parsing from page.tsx.
 * Handles both /api/clarifier (SSE) and /api/clarifier/respond (SSE) flows.
 */

import { useState, useCallback, useRef } from 'react';
import type {
  ChatMessage,
  ChatMessagePayload,
  ClarifierState,
  ClarifierResponse,
  Gap,
  AssumptionEntry,
  StageEvent,
  PagePhase,
} from '../clarifier-chat-types';

interface UseClarifierStreamReturn {
  readonly messages: readonly ChatMessage[];
  readonly prdDraft: Record<string, unknown> | null;
  readonly featurePlan: Record<string, unknown> | null;
  readonly gaps: readonly Gap[];
  readonly assumptions: { readonly entries: readonly AssumptionEntry[] } | null;
  readonly clarifierState: ClarifierState | null;
  readonly stage: StageEvent | null;
  readonly phase: PagePhase;
  readonly isRunning: boolean;
  readonly error: string | null;
  readonly threadId: string | null;
  readonly activeNode: string | null;
  readonly completedNodes: ReadonlySet<string>;
  readonly interruptedAt: string | null;
  readonly startClarifier: (rawInput: string, attachment?: { name: string; displayText?: string }) => void;
  readonly submitAnswers: (answers: ReadonlyArray<{ questionId: string; answer: string; selectedOption?: string }>) => void;
  readonly submitEscalation: (decision: 'accept' | 'restart' | 'abandon') => void;
  readonly addUserAnswer: (questionId: string, questionText: string, answer: string, selectedOption?: string) => void;
  readonly reset: () => void;
}

const NEXT_NODE: Record<string, string> = {
  contextRetriever: 'prdAnalyzer',
  prdAnalyzer: 'gapDetector',
  gapDetector: 'questionPrioritizer',
  questionPrioritizer: 'storyWriter',
  storyWriter: 'critic',
  critic: 'prdUpdater',
  prdUpdater: 'emitComplete',
};

const STAGE_ACTIVITY_LABEL: Record<string, string> = {
  contextRetriever: 'Analyzing your requirements...',
  prdAnalyzer: 'Detecting gaps and ambiguities...',
  gapDetector: 'Prioritizing clarification questions...',
  questionPrioritizer: 'Preparing questions for you...',
  storyWriter: 'Reviewing and refining...',
  critic: 'Updating your PRD...',
  prdUpdater: 'Finalizing requirements...',
};

const STAGE_DESCRIPTION: Record<string, string> = {
  contextRetriever: 'Loaded project configuration and existing context',
  prdAnalyzer: 'Generated initial PRD with features, personas, screens, and success metrics',
  gapDetector: 'Analyzed requirements for missing details, ambiguities, and assumptions',
  questionPrioritizer: 'Ranked questions by expected value of information (EVPI)',
  storyWriter: 'Generated user stories and refined requirements',
  critic: 'Reviewed PRD quality and consistency',
};

let msgCounter = 0;
function createMessage(payload: ChatMessagePayload): ChatMessage {
  return { id: `msg-${++msgCounter}`, timestamp: Date.now(), payload };
}

/** Parse an SSE stream from a fetch Response. */
async function parseSSEStream(
  res: Response,
  onEvent: (eventType: string, data: unknown) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) currentEvent = line.slice(7).trim();
      else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data: unknown = JSON.parse(line.slice(6));
          onEvent(currentEvent, data);
        } catch {
          // Skip malformed JSON
        }
        currentEvent = '';
      }
    }
  }
}

export function useClarifierStream(): UseClarifierStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prdDraft, setPrdDraft] = useState<Record<string, unknown> | null>(null);
  const [featurePlan, setFeaturePlan] = useState<Record<string, unknown> | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [assumptions, setAssumptions] = useState<{ readonly entries: readonly AssumptionEntry[] } | null>(null);
  const [clarifierState, setClarifierState] = useState<ClarifierState | null>(null);
  const [stage, setStage] = useState<StageEvent | null>(null);
  const [phase, setPhase] = useState<PagePhase>('welcome');
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [completedNodes, setCompletedNodes] = useState<Set<string>>(new Set());
  const [interruptedAt, setInterruptedAt] = useState<string | null>(null);
  const seedRef = useRef<string>('');
  const nodeStartTimesRef = useRef<Map<string, number>>(new Map());

  const appendMessage = useCallback((payload: ChatMessagePayload) => {
    setMessages((prev) => [...prev, createMessage(payload)]);
  }, []);

  const handleClarifierResult = useCallback((data: ClarifierResponse) => {
    setThreadId(data.threadId);
    setClarifierState(data.state);
    setMessages((prev) => prev.filter((m) => m.payload.kind !== 'agent-thinking'));

    if (data.state.prdDraft) setPrdDraft(data.state.prdDraft);
    if (data.state.featurePlan) setFeaturePlan(data.state.featurePlan);
    if (data.state.assumptions) setAssumptions(data.state.assumptions);

    if (data.interrupted && data.state.questions.length > 0) {
      const isEscalation = data.state.round >= data.state.maxRounds;
      setPhase(isEscalation ? 'escalation' : 'questions');
      setActiveNode(null);
      setInterruptedAt(isEscalation ? 'escalationGate' : 'storyWriter');

      if (isEscalation) {
        appendMessage({ kind: 'escalation', round: data.state.round, maxRounds: data.state.maxRounds });
      } else {
        appendMessage({
          kind: 'agent-question',
          questions: data.state.questions,
          round: data.state.round,
          maxRounds: data.state.maxRounds,
        });
      }
    } else if (!data.interrupted && data.state.requirement) {
      setPhase('complete');
      setActiveNode(null);
      setInterruptedAt(null);
      setCompletedNodes((prev) => { const next = new Set(prev); next.add('emitComplete'); return next; });
      appendMessage({
        kind: 'prd-complete',
        confidence: data.state.requirement.confidence,
        featureCount: data.state.requirement.prd.features?.length ?? 0,
        assumptionCount: data.state.assumptions?.entries?.length ?? 0,
      });
    } else if (data.state.error) {
      setError(data.state.error);
      setPhase('error');
      setActiveNode(null);
      appendMessage({ kind: 'error', message: data.state.error });
    } else {
      setPhase('complete');
    }
  }, [appendMessage]);

  const handleSSEEvent = useCallback((eventType: string, data: unknown) => {
    const d = data as Record<string, unknown>;

    switch (eventType) {
      case 'stage': {
        const stageData = d as unknown as StageEvent;
        const now = Date.now();
        const clientStartTime = nodeStartTimesRef.current.get(stageData.stage);
        const durationMs = stageData.durationMs ?? (clientStartTime ? now - clientStartTime : undefined);
        setStage(stageData);
        setCompletedNodes((prev) => { const next = new Set(prev); next.add(stageData.stage); return next; });
        const nextNode = NEXT_NODE[stageData.stage] ?? null;
        setActiveNode(nextNode);
        if (nextNode) {
          nodeStartTimesRef.current.set(nextNode, now);
        }
        appendMessage({
          kind: 'tool-result',
          node: stageData.stage,
          label: stageData.label,
          summary: `Step ${stageData.index + 1} of ${stageData.total}`,
          status: 'completed',
          durationMs,
          details: STAGE_DESCRIPTION[stageData.stage]
            ? { description: STAGE_DESCRIPTION[stageData.stage] }
            : undefined,
        });
        if (stageData.stage === 'emitComplete') {
          setMessages(prev => prev.filter(m => m.payload.kind !== 'agent-thinking'));
        }
        const nextActivity = STAGE_ACTIVITY_LABEL[stageData.stage];
        if (nextActivity) {
          setMessages(prev => prev.map(m =>
            m.payload.kind === 'agent-thinking'
              ? { ...m, payload: { ...m.payload, label: nextActivity, startedAt: now } }
              : m
          ));
        }
        break;
      }
      case 'prd-draft': {
        const draft = d.prdDraft as Record<string, unknown>;
        setPrdDraft(draft);
        const features = (draft.features as unknown[])?.length ?? 0;
        const personas = (draft.personas as unknown[])?.length ?? 0;
        const screens = (draft.screens as unknown[])?.length ?? 0;
        const nfrs = (draft.nfrs as unknown[])?.length ?? 0;
        appendMessage({ kind: 'prd-update', featureCount: features, personaCount: personas, screenCount: screens, nfrCount: nfrs });
        break;
      }
      case 'gaps': {
        const gapData = d.gaps as Gap[];
        setGaps(gapData);
        appendMessage({
          kind: 'tool-result',
          node: 'gapDetector',
          label: 'Gap analysis complete',
          summary: `Found ${gapData.length} gap${gapData.length === 1 ? '' : 's'}`,
          status: 'completed',
        });
        break;
      }
      case 'error': {
        setMessages((prev) => prev.filter((m) => m.payload.kind !== 'agent-thinking'));
        setError((d.error as string) ?? 'Pipeline error');
        setPhase('error');
        appendMessage({ kind: 'error', message: (d.error as string) ?? 'Pipeline error' });
        break;
      }
      case 'result': {
        handleClarifierResult(d as unknown as ClarifierResponse);
        break;
      }
    }
  }, [appendMessage, handleClarifierResult]);

  const startClarifier = useCallback((rawInput: string, attachment?: { name: string; displayText?: string }) => {
    seedRef.current = rawInput;
    setPhase('running');
    setError(null);
    setStage(null);
    setPrdDraft(null);
    setFeaturePlan(null);
    setGaps([]);
    setAssumptions(null);
    setActiveNode('contextRetriever');
    setCompletedNodes(new Set());
    setInterruptedAt(null);
    nodeStartTimesRef.current = new Map([['contextRetriever', Date.now()]]);
    appendMessage({
      kind: 'user-seed',
      text: rawInput,
      attachment: attachment ? { name: attachment.name } : undefined,
      displayText: attachment?.displayText,
    });
    appendMessage({ kind: 'agent-thinking', stage: 'start', label: 'Starting analysis...', index: 0, total: 8, startedAt: Date.now() });

    (async () => {
      try {
        const res = await fetch('/api/clarifier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawInput, mode: 'bootstrap' }),
        });

        if (!res.ok) {
          const text = await res.text();
          let errMsg = `HTTP ${res.status}`;
          try { errMsg = JSON.parse(text).error ?? errMsg; } catch { /* use default */ }
          throw new Error(errMsg);
        }

        await parseSSEStream(res, handleSSEEvent);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setPhase('error');
        appendMessage({ kind: 'error', message });
      }
    })();
  }, [appendMessage, handleSSEEvent]);

  const submitAnswers = useCallback((answers: ReadonlyArray<{ questionId: string; answer: string; selectedOption?: string }>) => {
    if (!threadId) return;
    setPhase('running');
    setInterruptedAt(null);
    setActiveNode('storyWriter');
    nodeStartTimesRef.current.set('storyWriter', Date.now());
    appendMessage({ kind: 'agent-thinking', stage: 'processing', label: 'Processing your answers...', index: 0, total: 8, startedAt: Date.now() });

    (async () => {
      try {
        const res = await fetch('/api/clarifier/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId, answers, rawInput: seedRef.current }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('text/event-stream')) {
          await parseSSEStream(res, handleSSEEvent);
        } else {
          const data: ClarifierResponse = await res.json();
          handleClarifierResult(data);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setPhase('error');
        appendMessage({ kind: 'error', message });
      }
    })();
  }, [threadId, appendMessage, handleSSEEvent, handleClarifierResult]);

  const submitEscalation = useCallback((decision: 'accept' | 'restart' | 'abandon') => {
    if (!threadId) return;

    if (decision === 'abandon') {
      setPhase('welcome');
      setClarifierState(null);
      setMessages([]);
      setPrdDraft(null);
      setFeaturePlan(null);
      setGaps([]);
      setAssumptions(null);
      setThreadId(null);
      return;
    }

    setPhase('running');

    (async () => {
      try {
        const res = await fetch('/api/clarifier/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId, escalationDecision: decision }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('text/event-stream')) {
          await parseSSEStream(res, handleSSEEvent);
        } else {
          const data: ClarifierResponse = await res.json();
          handleClarifierResult(data);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setPhase('error');
        appendMessage({ kind: 'error', message });
      }
    })();
  }, [threadId, appendMessage, handleSSEEvent, handleClarifierResult]);

  const addUserAnswer = useCallback((questionId: string, questionText: string, answer: string, selectedOption?: string) => {
    appendMessage({ kind: 'user-answer', questionId, questionText, answer, selectedOption });
  }, [appendMessage]);

  const reset = useCallback(() => {
    setMessages([]);
    setPrdDraft(null);
    setFeaturePlan(null);
    setGaps([]);
    setAssumptions(null);
    setClarifierState(null);
    setStage(null);
    setPhase('welcome');
    setError(null);
    setThreadId(null);
    setActiveNode(null);
    setCompletedNodes(new Set());
    setInterruptedAt(null);
  }, []);

  return {
    messages,
    prdDraft,
    featurePlan,
    gaps,
    assumptions,
    clarifierState,
    stage,
    phase,
    isRunning: phase === 'running',
    error,
    threadId,
    activeNode,
    completedNodes: completedNodes as ReadonlySet<string>,
    interruptedAt,
    startClarifier,
    submitAnswers,
    submitEscalation,
    addUserAnswer,
    reset,
  };
}
