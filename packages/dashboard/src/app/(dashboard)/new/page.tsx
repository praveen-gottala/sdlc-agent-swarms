'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAutoResize } from '@/lib/hooks/use-auto-resize';
import { Tabs } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useClarifierStream } from '@/lib/hooks/use-clarifier-stream';
import { SplitPanelLayout } from '@/components/clarifier/split-panel-layout';
import { ChatPanel } from '@/components/clarifier/chat-panel';
import { PrdPanel } from '@/components/clarifier/prd-panel';
import { NodeProgressGraph } from '@/components/clarifier/node-progress-graph';
import type { AssumptionEntry, Question, StructuredOption } from '@/lib/clarifier-chat-types';

/* ------------------------------------------------------------------ */
/*  Question Answering Sub-component                                   */
/* ------------------------------------------------------------------ */

interface QuestionFlowProps {
  readonly questions: readonly Question[];
  readonly round: number;
  readonly maxRounds: number;
  readonly onAllAnswered: (answers: ReadonlyArray<{ questionId: string; answer: string; selectedOption?: string }>) => void;
  readonly onAddUserAnswer: (questionId: string, questionText: string, answer: string, selectedOption?: string) => void;
}

const CheckIcon = ({ className }: { className?: string }): React.JSX.Element => (
  <svg className={className ?? 'h-3.5 w-3.5'} viewBox="0 0 16 16" fill="currentColor">
    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
  </svg>
);

function QuestionFlow({ questions, round, maxRounds, onAllAnswered, onAddUserAnswer }: QuestionFlowProps): React.JSX.Element {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const otherRef = useRef<HTMLTextAreaElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  useAutoResize(otherRef, chatInput, 120);

  const currentQuestion = questions[currentQIdx];
  const allAnswered = questions.every((q) => answers[q.id]?.trim());

  const handleOptionSelect = (questionId: string, answer: string, _option?: StructuredOption): void => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    setChatInput('');
    requestAnimationFrame(() => {
      tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleChatAnswer = (): void => {
    if (!chatInput.trim() || !currentQuestion) return;
    const answer = chatInput.trim();
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: answer }));
    setChatInput('');
  };

  const handleSubmitAll = (): void => {
    const answeredQuestions = Object.entries(answers).map(([questionId, answer]) => {
      const q = questions.find((qq) => qq.id === questionId);
      const matchedOption = q?.options?.find((o) => o.label === answer);
      return { questionId, answer, selectedOption: matchedOption?.label };
    });
    // Single summary bubble instead of per-answer bubbles
    const summaryParts = answeredQuestions.map((a) => a.selectedOption ?? a.answer);
    onAddUserAnswer(
      'summary',
      `Answered ${answeredQuestions.length} questions`,
      summaryParts.join(', '),
    );
    onAllAnswered(answeredQuestions);
  };

  const activeTabId = currentQuestion?.id ?? questions[0]?.id;

  return (
    <div className="mb-6 px-6">
      <div className="mx-auto max-w-[640px]">
          <div ref={tabsRef} className="animate-[fadeSlideUp_0.3s_ease-out] rounded-xl border border-border/60 bg-bg-card overflow-hidden">
            {/* Tabs header + round badge */}
            <div className="flex items-center justify-between px-4 pt-2">
              <span className="text-[11px] text-text-muted">Round {round}/{maxRounds}</span>
            </div>
            <Tabs
              value={activeTabId}
              onChange={(id) => {
                const idx = questions.findIndex((q) => q.id === id);
                if (idx >= 0) setCurrentQIdx(idx);
              }}
            >
              <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                {questions.map((q, i) => {
                  const isAnswered = !!answers[q.id];
                  const tabLabel = q.topic ?? `Q${i + 1}`;
                  return (
                    <Tabs.Tab
                      key={q.id}
                      value={q.id}
                      leftSection={isAnswered ? <CheckIcon className="h-3 w-3 text-green-500" /> : undefined}
                      style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      <span className="text-[12px]">{tabLabel}</span>
                    </Tabs.Tab>
                  );
                })}
              </Tabs.List>

              {questions.map((q) => (
                <Tabs.Panel key={q.id} value={q.id}>
                  <div className="p-5">
                    <p className="text-[15px] leading-[1.7] text-text-primary mb-5">{q.text}</p>

                    <div className="space-y-2.5">
                      {(q.options ?? []).map((opt) => {
                        const isSelected = answers[q.id] === opt.label;
                        return (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => handleOptionSelect(q.id, opt.label, opt)}
                            className={`flex w-full flex-col gap-2 rounded-lg border px-4 py-3.5 text-left transition-all ${
                              isSelected
                                ? 'border-accent-blue/40 bg-accent-blue/8 ring-1 ring-accent-blue/20'
                                : 'border-border/40 hover:border-border hover:bg-bg-elevated'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                isSelected ? 'border-accent-blue bg-accent-blue' : 'border-text-muted/30'
                              }`}>
                                {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                              </span>
                              <span className={`text-[14px] font-medium leading-relaxed ${
                                isSelected ? 'text-text-primary' : 'text-text-secondary'
                              }`}>
                                {opt.label}
                              </span>
                              {opt.recommended && (
                                <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
                                  Recommended
                                </span>
                              )}
                              {opt.source === 'codebase' && opt.citation && (
                                <span className="rounded bg-accent-blue/10 px-1.5 py-0.5 text-[10px] font-mono text-accent-blue/70">
                                  {opt.citation}
                                </span>
                              )}
                            </div>
                            {opt.description && <p className="ml-7 text-[13px] leading-relaxed text-text-secondary">{opt.description}</p>}
                            {opt.tradeoffs && opt.tradeoffs.length > 0 && (
                              <div className="ml-7 mt-0.5 flex flex-wrap gap-1.5">
                                {opt.tradeoffs.map((t) => {
                                  const isPro = t.startsWith('+');
                                  const isCon = t.startsWith('-');
                                  const text = (isPro || isCon) ? t.slice(1).trim() : t;
                                  return (
                                    <span key={t} className={`rounded-md border px-2 py-0.5 text-[11px] ${
                                      isPro ? 'border-green-500/20 bg-green-500/8 text-green-400' :
                                      isCon ? 'border-amber-500/20 bg-amber-500/8 text-amber-400' :
                                      'border-border/60 bg-bg-card text-text-secondary'
                                    }`}>
                                      {isPro ? '+ ' : isCon ? '- ' : ''}{text}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </button>
                        );
                      })}

                      {/* Free text "Other" */}
                      <div className="border border-border/40 rounded-lg px-4 py-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-text-muted/30" />
                          <div className="flex-1">
                            <span className="text-[14px] text-text-secondary">Other</span>
                            <textarea
                              ref={otherRef}
                              value={chatInput}
                              onChange={(e) => setChatInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatAnswer(); } }}
                              placeholder="Type your own answer..."
                              rows={1}
                              className="mt-1.5 w-full resize-none bg-transparent text-[14px] text-text-primary placeholder:text-text-muted/40 focus:outline-none leading-relaxed"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {chatInput.trim() && (
                      <div className="mt-4 flex justify-end">
                        <button type="button" onClick={handleChatAnswer}
                          className="rounded-lg bg-accent-blue px-4 py-1.5 text-[13px] font-medium text-white transition-all hover:bg-accent-blue/90 active:scale-[0.98]">
                          Submit
                        </button>
                      </div>
                    )}
                  </div>
                </Tabs.Panel>
              ))}
            </Tabs>
          </div>

        {/* Submit all — shown when at least one question is answered */}
        {Object.keys(answers).length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[13px] text-text-muted">
              {allAnswered
                ? `All ${questions.length} questions answered`
                : `${Object.keys(answers).length} of ${questions.length} answered`}
            </span>
            <button type="button" onClick={handleSubmitAll} disabled={!allAnswered}
              className={`rounded-lg px-5 py-2.5 text-[14px] font-medium transition-all ${
                allAnswered
                  ? 'bg-accent-blue text-white hover:bg-accent-blue/90 active:scale-[0.98]'
                  : 'bg-accent-blue/30 text-white/40 cursor-not-allowed'
              }`}>
              Submit Answers
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Escalation Sub-component                                           */
/* ------------------------------------------------------------------ */

interface EscalationControlsProps {
  readonly clarifierState: { round: number; maxRounds: number; assumptions: { readonly entries: readonly AssumptionEntry[] } | null };
  readonly onDecision: (decision: 'accept' | 'restart' | 'abandon') => void;
}

function EscalationControls({ clarifierState, onDecision }: EscalationControlsProps): React.JSX.Element {
  return (
    <div className="px-6">
      <div className="mx-auto max-w-[640px] space-y-4 mb-6">
        <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 p-4">
          <h3 className="text-[14px] font-semibold text-amber-400">Maximum Rounds Reached</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-text-secondary">
            {clarifierState.maxRounds} rounds completed. Some gaps remain.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => onDecision('accept')}
              className="rounded-lg bg-accent-blue px-4 py-2 text-[13px] font-medium text-white transition-all hover:bg-accent-blue/90 active:scale-[0.98]">
              Accept Best-Effort PRD
            </button>
            <button type="button" onClick={() => onDecision('restart')}
              className="rounded-lg border border-border bg-bg-card px-4 py-2 text-[13px] font-medium text-text-primary transition-all hover:bg-bg-elevated active:scale-[0.98]">
              Restart
            </button>
            <button type="button" onClick={() => onDecision('abandon')}
              className="rounded-lg border border-red-500/15 px-4 py-2 text-[13px] font-medium text-red-400 transition-all hover:bg-red-500/5 active:scale-[0.98]">
              Abandon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function NewProjectPage(): React.JSX.Element {
  const clarifier = useClarifierStream();
  const router = useRouter();
  const approvingRef = useRef(false);

  const prdPanelVisible = useMemo(() =>
    !!clarifier.prdDraft || clarifier.isRunning || clarifier.phase === 'questions' || clarifier.phase === 'escalation' || clarifier.phase === 'complete',
  [clarifier.prdDraft, clarifier.isRunning, clarifier.phase]);

  const currentQuestions = useMemo(() => {
    const lastQuestionMsg = [...clarifier.messages].reverse().find((m) => m.payload.kind === 'agent-question');
    if (!lastQuestionMsg || lastQuestionMsg.payload.kind !== 'agent-question') return null;
    return lastQuestionMsg.payload;
  }, [clarifier.messages]);

  const handleRequestChanges = useCallback(() => {
    clarifier.reset();
  }, [clarifier]);

  const [approving, setApproving] = useState(false);

  const handleApprove = useCallback(async () => {
    const requirement = clarifier.clarifierState?.requirement;
    const tid = clarifier.threadId;
    if (!requirement || !tid || approvingRef.current) return;

    approvingRef.current = true;
    setApproving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: requirement.prd.title,
          description: requirement.prd.description,
          clarifierOutput: {
            enrichedRequirement: requirement,
            threadId: tid,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      await res.json();
      notifications.show({
        title: 'Project created',
        message: `"${requirement.prd.title}" is ready — redirecting to dashboard`,
        color: 'green',
        autoClose: 3000,
      });
      router.push('/');
    } catch (err) {
      notifications.show({
        title: 'Project creation failed',
        message: err instanceof Error ? err.message : 'Unknown error',
        color: 'red',
        autoClose: 5000,
      });
    } finally {
      approvingRef.current = false;
      setApproving(false);
    }
  }, [clarifier.clarifierState?.requirement, clarifier.threadId, router]);

  return (
    <div className="-m-[--mantine-spacing-md] min-h-[calc(100vh-52px)]">
    <SplitPanelLayout prdPanelVisible={prdPanelVisible}>
      {/* Left: Chat panel — questions/escalation render above the input */}
      <ChatPanel
        messages={clarifier.messages}
        phase={clarifier.phase}
        isRunning={clarifier.isRunning}
        onSubmitSeed={clarifier.startClarifier}
      >
        {clarifier.phase === 'running' && (
          <NodeProgressGraph
            activeNode={clarifier.activeNode}
            completedNodes={clarifier.completedNodes}
          />
        )}

        {clarifier.phase === 'questions' && currentQuestions && (
          <QuestionFlow
            questions={currentQuestions.questions}
            round={currentQuestions.round}
            maxRounds={currentQuestions.maxRounds}
            onAllAnswered={clarifier.submitAnswers}
            onAddUserAnswer={clarifier.addUserAnswer}
          />
        )}

        {clarifier.phase === 'escalation' && clarifier.clarifierState && (
          <EscalationControls
            clarifierState={clarifier.clarifierState}
            onDecision={clarifier.submitEscalation}
          />
        )}

        {clarifier.phase === 'error' && (
          <div className="px-6 py-4">
            <div className="mx-auto max-w-[640px]">
              <button type="button" onClick={clarifier.reset}
                className="text-[13px] text-accent-blue hover:text-accent-blue/80 transition-colors">
                Try again
              </button>
            </div>
          </div>
        )}
      </ChatPanel>

      {/* Right: PRD panel */}
      <PrdPanel
        prdDraft={clarifier.prdDraft}
        featurePlan={clarifier.featurePlan}
        gaps={clarifier.gaps}
        assumptions={clarifier.assumptions}
        confidence={clarifier.clarifierState?.requirement?.confidence}
        isComplete={clarifier.phase === 'complete'}
        isRunning={clarifier.isRunning}
        activeNode={clarifier.activeNode}
        completedNodes={clarifier.completedNodes}
        interruptedAt={clarifier.interruptedAt}
        onApprove={handleApprove}
        onRequestChanges={handleRequestChanges}
        approving={approving}
      />
    </SplitPanelLayout>
    </div>
  );
}
