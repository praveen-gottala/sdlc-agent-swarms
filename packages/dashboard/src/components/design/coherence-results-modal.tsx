'use client';

import React from 'react';
import { Modal } from '../ui/modal';
import { Badge } from '../ui/badge';
import type { CoherenceResult } from '../../lib/design/coherence-check';

export interface CoherenceResultsModalProps {
  open: boolean;
  onClose: () => void;
  results: CoherenceResult[];
  warnings: string[];
  onSelectPage: (pageId: string) => void;
}

export function CoherenceResultsModal({
  open,
  onClose,
  results,
  warnings,
  onSelectPage,
}: CoherenceResultsModalProps) {
  const allPassed =
    results.length > 0 &&
    results.every(
      (r) =>
        r.navigationCoverage.missingPages.length === 0 &&
        r.dataFieldCoverage.every((d) => d.missingFields.length === 0),
    );

  return (
    <Modal open={open} onClose={onClose} title="Coherence Check Results" width="max-w-2xl">
      <div className="max-h-[60vh] overflow-y-auto space-y-5">
        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-accent-yellow">
                {w}
              </p>
            ))}
          </div>
        )}

        {/* All passed */}
        {allPassed && (
          <div className="flex items-center gap-2 rounded-md border border-accent-green/30 bg-accent-green/10 px-4 py-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent-green"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-sm text-accent-green font-medium">
              All checks passed — no gaps found.
            </span>
          </div>
        )}

        {/* No results */}
        {results.length === 0 && (
          <p className="text-sm text-text-muted">
            No designs to check. Approve or render at least 2 pages first.
          </p>
        )}

        {/* Per-page results */}
        {results.map((result) => (
          <PageResult key={result.pageId} result={result} onSelectPage={onSelectPage} />
        ))}
      </div>
    </Modal>
  );
}

function PageResult({
  result,
  onSelectPage,
}: {
  result: CoherenceResult;
  onSelectPage: (pageId: string) => void;
}) {
  const { navigationCoverage: nav, dataFieldCoverage: data } = result;
  const navOk = nav.missingPages.length === 0;
  const allDataOk = data.every((d) => d.missingFields.length === 0);

  return (
    <div className="rounded-lg border border-border bg-bg-card/40 p-4 space-y-3">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{result.pageName}</h3>
        {navOk && allDataOk && <Badge variant="success">Pass</Badge>}
      </div>

      {/* Navigation coverage */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">Navigation</span>
          {navOk ? (
            <Badge variant="success">
              {nav.foundPages.length}/{nav.expectedPages.length}
            </Badge>
          ) : (
            <Badge variant="warning">
              {nav.foundPages.length}/{nav.expectedPages.length}
            </Badge>
          )}
        </div>
        {nav.missingPages.length > 0 && (
          <div className="pl-2 space-y-0.5">
            <p className="text-xs text-text-muted">Missing page references:</p>
            {nav.missingPages.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelectPage(p.id)}
                className="block text-xs text-accent-blue hover:underline"
              >
                {p.name} ({p.route})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Data field coverage */}
      {data.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-text-secondary">Data Fields</span>
          {data.map((model) => {
            const ok = model.missingFields.length === 0;
            return (
              <div key={model.modelName} className="pl-2 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">{model.modelName}</span>
                  {ok ? (
                    <Badge variant="success">
                      {model.foundFields.length}/{model.expectedFields.length}
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      {model.foundFields.length}/{model.expectedFields.length}
                    </Badge>
                  )}
                </div>
                {model.missingFields.length > 0 && (
                  <p className="text-xs text-text-muted">
                    Missing: {model.missingFields.join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
