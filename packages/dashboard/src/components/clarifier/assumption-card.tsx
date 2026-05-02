'use client';

import { useState } from 'react';

interface AssumptionEntry {
  readonly id: string;
  readonly statement: string;
  readonly evidence: string;
  readonly confidence: number;
  readonly blastRadius: string;
  readonly requiresConfirmation: boolean;
}

interface AssumptionCardProps {
  entries: readonly AssumptionEntry[];
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-400';
  if (confidence >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
}

function confidenceBg(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-500/10';
  if (confidence >= 0.5) return 'bg-yellow-500/10';
  return 'bg-red-500/10';
}

export function AssumptionCard({ entries }: AssumptionCardProps) {
  const [expanded, setExpanded] = useState(true);
  const needsConfirmation = entries.filter((e) => e.requiresConfirmation);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-bg-card transition-all duration-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 text-text-muted transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
          <span className="text-sm font-medium text-text-primary">
            {entries.length} assumption{entries.length !== 1 ? 's' : ''} made
          </span>
          {needsConfirmation.length > 0 && (
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-400">
              {needsConfirmation.length} need review
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-3 pt-2">
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-start gap-3 rounded-md px-3 py-2 ${confidenceBg(entry.confidence)}`}
              >
                <span className="mt-0.5 text-sm">
                  {entry.requiresConfirmation ? '⚠' : '✓'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">{entry.statement}</p>
                  {entry.evidence && (
                    <p className="mt-0.5 text-xs text-text-secondary">{entry.evidence}</p>
                  )}
                  <div className="mt-1 flex items-center gap-3">
                    <span className={`text-xs font-medium ${confidenceColor(entry.confidence)}`}>
                      {Math.round(entry.confidence * 100)}% confidence
                    </span>
                    {entry.blastRadius && (
                      <span className="text-xs text-text-muted">Blast radius: {entry.blastRadius}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
