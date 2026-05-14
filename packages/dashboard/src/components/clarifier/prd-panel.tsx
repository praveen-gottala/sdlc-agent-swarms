'use client';

import { useState } from 'react';
import { SegmentedControl } from '@mantine/core';
import type { Gap, AssumptionEntry } from '@/lib/clarifier-chat-types';
import { PrdPanelHeader } from './prd-panel-header';
import { LivePrdDocument } from './live-prd-document';
import { ClarifierGraph } from './clarifier-graph';

type PanelView = 'document' | 'graph';

interface PrdPanelProps {
  readonly prdDraft: Record<string, unknown> | null;
  readonly featurePlan: Record<string, unknown> | null;
  readonly gaps: readonly Gap[];
  readonly assumptions: { readonly entries: readonly AssumptionEntry[] } | null;
  readonly confidence?: number;
  readonly isComplete: boolean;
  readonly isRunning?: boolean;
  readonly activeNode: string | null;
  readonly completedNodes: ReadonlySet<string>;
  readonly interruptedAt?: string | null;
  readonly onApprove?: () => void;
  readonly onRequestChanges?: () => void;
}

export function PrdPanel({
  prdDraft,
  gaps,
  assumptions,
  confidence,
  isComplete,
  isRunning = false,
  activeNode,
  completedNodes,
  interruptedAt = null,
  onApprove,
  onRequestChanges,
}: PrdPanelProps): React.JSX.Element {
  const [userView, setUserView] = useState<PanelView | null>(null);
  const view: PanelView = userView ?? (prdDraft && !isRunning ? 'document' : 'graph');

  if (!prdDraft && !isRunning) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <div className="text-center">
          <div className="mb-4 mx-auto h-12 w-12 rounded-2xl bg-bg-elevated flex items-center justify-center">
            <svg className="h-6 w-6 text-text-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <p className="text-[14px] text-text-muted">Your PRD will build here as we analyze your idea</p>
        </div>
      </div>
    );
  }

  const title = prdDraft ? (prdDraft.title as string) || 'PRD Document' : 'Pipeline';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header + view toggle */}
      <div className="flex-shrink-0">
        <PrdPanelHeader
          title={title}
          confidence={confidence}
          isComplete={isComplete}
        />
        <div className="border-b border-border px-5 pb-3 pt-1">
          <SegmentedControl
            value={view}
            onChange={(v) => setUserView(v as PanelView)}
            data={[
              { label: 'Document', value: 'document' },
              { label: 'Graph', value: 'graph' },
            ]}
            size="xs"
            fullWidth
          />
        </div>
      </div>

      {/* Content area */}
      {view === 'document' ? (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {prdDraft ? (
            <>
              <LivePrdDocument
                prdDraft={prdDraft}
                gaps={gaps}
                assumptions={assumptions}
                confidence={confidence}
              />
              {isComplete && (
                <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
                  {onRequestChanges && (
                    <button
                      type="button"
                      onClick={onRequestChanges}
                      className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary"
                    >
                      Request Changes
                    </button>
                  )}
                  {onApprove && (
                    <button
                      type="button"
                      onClick={onApprove}
                      className="rounded-lg bg-accent-blue px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-blue/90 active:bg-accent-blue/80"
                    >
                      Approve &amp; Continue
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-[13px] text-text-muted">PRD data will appear here once generated...</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ClarifierGraph
            activeNode={activeNode}
            completedNodes={completedNodes}
            interruptedAt={interruptedAt}
          />
        </div>
      )}
    </div>
  );
}
