'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { QuestionCard } from '@/components/clarifier/question-card';
import { AssumptionCard } from '@/components/clarifier/assumption-card';
import { PrdPreview } from '@/components/clarifier/prd-preview';
import { StatusBar } from '@/components/clarifier/status-bar';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Question {
  readonly id: string;
  readonly gapId: string;
  readonly text: string;
  readonly type: 'open' | 'multiple-choice';
  readonly options?: readonly string[];
  readonly priority: number;
  readonly evpiScore: number;
}

interface AssumptionEntry {
  readonly id: string;
  readonly description: string;
  readonly confidence: number;
  readonly source: string;
  readonly requiresConfirmation: boolean;
}

interface ClarifierState {
  mode: string;
  round: number;
  maxRounds: number;
  questions: Question[];
  gaps: unknown[];
  requirement: { prd: Record<string, unknown>; confidence: number } | null;
  assumptions: { entries: AssumptionEntry[] } | null;
  prdDraft: Record<string, unknown> | null;
  featurePlan: Record<string, unknown> | null;
  error: string | null;
}

interface ClarifierResponse {
  threadId: string;
  interrupted: boolean;
  state: ClarifierState;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

type PagePhase = 'welcome' | 'running' | 'questions' | 'complete' | 'error';

const SUGGESTION_CHIPS = [
  'Personal expense tracker with categories and budgets',
  'E-commerce store with product catalog and cart',
  'Project management dashboard with kanban board',
  'Recipe sharing app with search and ratings',
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NewProjectPage() {
  const [phase, setPhase] = useState<PagePhase>('welcome');
  const [seed, setSeed] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [clarifierState, setClarifierState] = useState<ClarifierState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, phase]);

  /* ── API calls ─────────────────────────────────────────────────── */

  const startClarifier = useCallback(async (input: string) => {
    setPhase('running');
    addMessage('user', input);

    try {
      const res = await fetch('/api/clarifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput: input, mode: 'bootstrap' }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data: ClarifierResponse = await res.json();
      setThreadId(data.threadId);
      setClarifierState(data.state);

      if (data.interrupted && data.state.questions.length > 0) {
        addMessage('assistant', `I have ${data.state.questions.length} question${data.state.questions.length !== 1 ? 's' : ''} to help clarify your requirements.`);
        setPhase('questions');
      } else if (!data.interrupted && data.state.requirement) {
        addMessage('assistant', 'Requirements clarification complete! Here\'s your PRD for review.');
        setPhase('complete');
      } else {
        addMessage('assistant', 'Processing complete.');
        setPhase('complete');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  }, []);

  const submitAnswers = useCallback(async () => {
    if (!threadId) return;

    setPhase('running');
    const answeredQuestions = Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
    }));

    addMessage('user', `Answered ${answeredQuestions.length} question${answeredQuestions.length !== 1 ? 's' : ''}`);

    try {
      const res = await fetch('/api/clarifier/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, answers: answeredQuestions }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data: ClarifierResponse = await res.json();
      setClarifierState(data.state);
      setAnswers({});

      if (data.interrupted && data.state.questions.length > 0) {
        addMessage('assistant', `Round ${data.state.round}: ${data.state.questions.length} more question${data.state.questions.length !== 1 ? 's' : ''}.`);
        setPhase('questions');
      } else if (!data.interrupted && data.state.requirement) {
        addMessage('assistant', 'All questions resolved. Here\'s your finalized PRD.');
        setPhase('complete');
      } else {
        setPhase('complete');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  }, [threadId, answers]);

  /* ── Helpers ───────────────────────────────────────────────────── */

  function addMessage(role: 'user' | 'assistant', content: string) {
    setMessages((prev) => [...prev, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      timestamp: Date.now(),
    }]);
  }

  const handleSeedSubmit = () => {
    if (!seed.trim()) return;
    startClarifier(seed.trim());
    setSeed('');
  };

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const allAnswered = clarifierState?.questions.every((q) => answers[q.id]?.trim()) ?? false;

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8">

          {/* Welcome state */}
          {phase === 'welcome' && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-blue/10">
                <svg className="h-8 w-8 text-accent-blue" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-text-primary">New Project</h1>
              <p className="mt-2 text-sm text-text-secondary max-w-md">
                Describe what you want to build. The Clarifier will ask smart questions
                to produce a comprehensive PRD with minimal ambiguity.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => { setSeed(chip); startClarifier(chip); }}
                    className="rounded-full border border-border bg-bg-card px-4 py-2 text-xs text-text-secondary transition-colors hover:border-accent-blue/50 hover:text-text-primary"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message thread */}
          {messages.length > 0 && (
            <div className="space-y-4 mb-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-accent-blue/15 text-text-primary rounded-br-sm'
                        : 'bg-bg-card border border-border text-text-primary rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {phase === 'running' && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-xl bg-bg-card border border-border px-4 py-3">
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-text-muted animate-bounce" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Questions */}
          {phase === 'questions' && clarifierState && (
            <div className="space-y-4 mb-6">
              <div className="space-y-3">
                {clarifierState.questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    index={i}
                    value={answers[q.id] ?? ''}
                    onAnswer={handleAnswer}
                    disabled={false}
                  />
                ))}
              </div>

              {clarifierState.assumptions && clarifierState.assumptions.entries.length > 0 && (
                <AssumptionCard entries={clarifierState.assumptions.entries} />
              )}

              <StatusBar
                round={clarifierState.round}
                maxRounds={clarifierState.maxRounds}
                questionCount={clarifierState.questions.length}
                assumptionCount={clarifierState.assumptions?.entries.length ?? 0}
                isRunning={false}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={submitAnswers}
                  disabled={!allAnswered}
                  className="rounded-md bg-accent-blue px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-blue/90 active:bg-accent-blue/80 disabled:opacity-50 disabled:pointer-events-none focus-ring"
                >
                  Submit Answers
                </button>
              </div>
            </div>
          )}

          {/* Running status */}
          {phase === 'running' && clarifierState && (
            <StatusBar
              round={clarifierState.round}
              maxRounds={clarifierState.maxRounds}
              questionCount={clarifierState.questions.length}
              assumptionCount={clarifierState.assumptions?.entries.length ?? 0}
              isRunning={true}
            />
          )}

          {/* Complete — PRD preview */}
          {phase === 'complete' && clarifierState?.requirement && (
            <div className="space-y-4">
              <PrdPreview
                requirement={clarifierState.requirement as { prd: { title: string; description: string; features: { id: string; name: string; description: string }[] }; confidence: number }}
                featurePlan={clarifierState.featurePlan as { features: { id: string; name: string; description: string; acceptanceCriteria?: { formatted: string }[]; dependencies?: string[] }[] } | null}
                onApprove={() => { /* Navigate to design pipeline */ }}
                onRequestChanges={() => { setPhase('welcome'); setMessages([]); setClarifierState(null); }}
              />

              {clarifierState.assumptions && clarifierState.assumptions.entries.length > 0 && (
                <AssumptionCard entries={clarifierState.assumptions.entries} />
              )}
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <h3 className="text-sm font-medium text-red-400">Clarifier Error</h3>
              <p className="mt-1 text-sm text-text-secondary">{errorMessage}</p>
              <button
                type="button"
                onClick={() => { setPhase('welcome'); setErrorMessage(null); }}
                className="mt-3 text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input area — visible in welcome and questions phases */}
      {(phase === 'welcome' || phase === 'questions') && !clarifierState?.questions.length && (
        <div className="border-t border-border bg-bg-base px-6 py-4">
          <div className="mx-auto max-w-2xl">
            <div className="flex gap-3">
              <textarea
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSeedSubmit();
                  }
                }}
                placeholder="Describe what you want to build..."
                rows={2}
                className="flex-1 resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus-ring transition-colors"
              />
              <button
                type="button"
                onClick={handleSeedSubmit}
                disabled={!seed.trim()}
                className="self-end rounded-lg bg-accent-blue px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-blue/90 active:bg-accent-blue/80 disabled:opacity-50 disabled:pointer-events-none focus-ring"
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
