'use client';

import { useState, useEffect } from 'react';
import type { ChatMessage as ChatMessageType, ToolResultMessage } from '@/lib/clarifier-chat-types';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }): React.JSX.Element {
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span className="text-[10px] text-text-muted/60 tabular-nums">{formatDuration(elapsed)}</span>;
}

interface ChatMessageProps {
  readonly message: ChatMessageType;
}

function ToolIcon({ node }: { node: string }): React.JSX.Element {
  const iconClass = 'h-4 w-4';
  switch (node) {
    case 'contextRetriever':
      return <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h12M2 4.5v8a1 1 0 001 1h10a1 1 0 001-1v-8M2 4.5l1.5-2h9L14 4.5M6 7.5h4" /></svg>;
    case 'prdAnalyzer':
      return <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 1.5h5l4 4v8.5a1 1 0 01-1 1h-8a1 1 0 01-1-1v-12a1 1 0 011-1z" /><path strokeLinecap="round" d="M6 7h4M6 9.5h4M6 12h2" /></svg>;
    case 'gapDetector':
      return <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="7" cy="7" r="4.5" /><path strokeLinecap="round" d="M10.5 10.5L14 14" /></svg>;
    case 'questionPrioritizer':
      return <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13V9M8 13V5M13 13V2" /></svg>;
    default:
      return <svg className={iconClass} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8" cy="8" r="5.5" /><path strokeLinecap="round" d="M8 5v4M8 11h.01" /></svg>;
  }
}

function ToolResultCard({ payload }: { payload: ToolResultMessage }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = payload.summary || (payload.details && Object.keys(payload.details).length > 0);

  return (
    <div className="mb-2.5 animate-[fadeSlideUp_0.2s_ease-out]">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((e) => !e)}
        className={`flex w-full items-center gap-2 rounded-md border border-border/30 px-3 py-2 text-left transition-colors ${
          hasDetails ? 'cursor-pointer hover:bg-bg-elevated/30' : 'cursor-default'
        }`}
      >
        <div className="flex-shrink-0 text-text-muted/60">
          <ToolIcon node={payload.node} />
        </div>
        <span className="text-[12px] font-medium text-text-secondary">{payload.label}</span>
        <span className={`ml-auto flex items-center gap-1.5 text-[10px] font-semibold ${
          payload.status === 'completed' ? 'text-green-500' : 'text-accent-blue'
        }`}>
          {payload.status === 'completed' ? 'Completed' : 'Running'}
          {payload.durationMs != null && (
            <span className="font-normal text-text-muted/50 tabular-nums">{formatDuration(payload.durationMs)}</span>
          )}
        </span>
        {hasDetails && (
          <svg
            className={`h-3 w-3 text-text-muted/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
          </svg>
        )}
      </button>
      {expanded && hasDetails && (
        <div className="ml-7 mt-1 rounded-md bg-bg-card/50 border border-border/20 px-3 py-2 animate-[fadeSlideDown_0.15s_ease-out]">
          {payload.details?.description ? (
            <p className="text-[11px] text-text-secondary">{String(payload.details.description)}</p>
          ) : null}
          {payload.summary && (
            <p className="text-[11px] text-green-500/80 mt-0.5">{payload.summary}</p>
          )}
          {payload.details && Object.entries(payload.details).filter(([key]) => key !== 'description').map(([key, val]) => (
            <p key={key} className="text-[11px] text-text-muted mt-0.5">
              <span className="text-text-secondary capitalize">{key}:</span> {String(val)}
            </p>
          ))}
        </div>
      )}
      {!expanded && payload.summary && (
        <p className="mt-0.5 ml-7 text-[11px] text-green-500/80">{payload.summary}</p>
      )}
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps): React.JSX.Element {
  const { payload } = message;

  switch (payload.kind) {
    case 'user-seed':
      return (
        <div className="flex justify-end mb-3 animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent-blue/8 border border-accent-blue/15 px-4 py-2.5">
            {payload.attachment ? (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-bg-elevated/40 border border-border/30 px-3 py-2">
                  <svg className="h-4 w-4 text-accent-blue/70 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-[13px] font-medium text-text-primary truncate">{payload.attachment.name}</span>
                </div>
                {payload.displayText && (
                  <p className="mt-2 text-[14px] leading-relaxed text-text-primary">{payload.displayText}</p>
                )}
              </>
            ) : (
              <p className="text-[14px] leading-relaxed text-text-primary">{payload.text}</p>
            )}
          </div>
        </div>
      );

    case 'user-answer':
      return (
        <div className="flex justify-end mb-3 animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent-blue/8 border border-accent-blue/15 px-4 py-2.5">
            <p className="text-[14px] leading-relaxed text-text-primary">{payload.answer}</p>
            <p className="mt-1 text-[11px] text-text-muted">Re: {payload.questionText}</p>
          </div>
        </div>
      );

    case 'tool-result':
      return <ToolResultCard payload={payload} />;

    case 'agent-thinking':
      return (
        <div className="mb-2.5 animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="relative h-3.5 w-3.5 flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-accent-blue/25 animate-ping" />
              <div className="relative h-3.5 w-3.5 rounded-full bg-accent-blue" />
            </div>
            <span className="text-[12px] text-text-muted">{payload.label}</span>
            {payload.startedAt && <ElapsedTimer startedAt={payload.startedAt} />}
          </div>
        </div>
      );

    case 'prd-update':
      return (
        <div className="mb-3 animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="rounded-lg border border-accent-blue/20 bg-accent-blue/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <svg className="h-4 w-4 text-accent-blue flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
              <span className="text-[13px] font-medium text-text-primary">Your PRD draft is ready</span>
            </div>
            <p className="text-[12px] text-text-secondary leading-relaxed ml-6">
              {payload.featureCount} features, {payload.personaCount} personas, {payload.screenCount} screens identified.
              Check the <span className="font-medium text-accent-blue">Document</span> panel to review it while we continue refining.
            </p>
          </div>
        </div>
      );

    case 'escalation':
      return (
        <div className="mb-3 animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="rounded-md border border-amber-500/15 bg-amber-500/5 p-3">
            <h3 className="text-[13px] font-semibold text-amber-400">Maximum Rounds Reached</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
              {payload.maxRounds} rounds completed. Some gaps remain.
            </p>
          </div>
        </div>
      );

    case 'error':
      return (
        <div className="mb-3 animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="rounded-md border border-red-500/15 bg-red-500/5 p-3">
            <h3 className="text-[13px] font-semibold text-red-400">Error</h3>
            <p className="mt-1 text-[13px] text-text-secondary">{payload.message}</p>
          </div>
        </div>
      );

    case 'prd-complete':
      return (
        <div className="mb-2 animate-[fadeSlideUp_0.2s_ease-out]">
          <div className="flex items-center gap-1.5 px-1 py-0.5">
            <svg className="h-3 w-3 text-green-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
            </svg>
            <span className="text-[11px] text-text-muted">
              PRD complete — {Math.round(payload.confidence * 100)}% confidence, {payload.featureCount} features, {payload.assumptionCount} assumptions
            </span>
          </div>
        </div>
      );

    case 'agent-question':
      return <></>;

    default:
      return <></>;
  }
}
