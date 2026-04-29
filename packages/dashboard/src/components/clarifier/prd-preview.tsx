'use client';

import { useState } from 'react';

interface Feature {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority?: string;
}

interface PRD {
  readonly title: string;
  readonly description: string;
  readonly features: readonly Feature[];
  readonly version?: string;
}

interface EnrichedRequirement {
  readonly prd: PRD;
  readonly confidence: number;
}

interface FeatureNode {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly acceptanceCriteria?: readonly { readonly formatted: string }[];
  readonly dependencies?: readonly string[];
}

interface FeaturePlan {
  readonly features: readonly FeatureNode[];
}

interface PrdPreviewProps {
  requirement: EnrichedRequirement;
  featurePlan?: FeaturePlan | null;
  onApprove: () => void;
  onRequestChanges: () => void;
}

function confidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.8) return { text: 'High', color: 'text-green-400' };
  if (c >= 0.6) return { text: 'Medium', color: 'text-yellow-400' };
  return { text: 'Low', color: 'text-red-400' };
}

export function PrdPreview({ requirement, featurePlan, onApprove, onRequestChanges }: PrdPreviewProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { prd, confidence } = requirement;
  const cl = confidenceLabel(confidence);

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <div className="border-b border-border bg-bg-elevated/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{prd.title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{prd.description}</p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${cl.color}`}>
              {Math.round(confidence * 100)}%
            </div>
            <div className={`text-xs font-medium ${cl.color}`}>{cl.text} confidence</div>
          </div>
        </div>

        <div className="mt-4 flex gap-4">
          <div className="rounded-md bg-accent-blue/10 px-3 py-1.5">
            <span className="text-xs text-text-muted">Features</span>
            <span className="ml-1.5 text-sm font-semibold text-accent-blue">{prd.features.length}</span>
          </div>
          {featurePlan && (
            <div className="rounded-md bg-accent-blue/10 px-3 py-1.5">
              <span className="text-xs text-text-muted">Stories</span>
              <span className="ml-1.5 text-sm font-semibold text-accent-blue">
                {featurePlan.features.reduce((acc, f) => acc + (f.acceptanceCriteria?.length ?? 0), 0)}
              </span>
            </div>
          )}
        </div>
      </div>

      {showDetails && featurePlan && (
        <div className="border-b border-border px-6 py-4">
          <h4 className="mb-3 text-sm font-medium text-text-primary">Feature Plan</h4>
          <div className="space-y-3">
            {featurePlan.features.map((feat) => (
              <div key={feat.id} className="rounded-md bg-bg-elevated p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{feat.name}</span>
                  {feat.dependencies && feat.dependencies.length > 0 && (
                    <span className="text-[10px] text-text-muted">
                      depends on: {feat.dependencies.join(', ')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-secondary">{feat.description}</p>
                {feat.acceptanceCriteria && feat.acceptanceCriteria.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {feat.acceptanceCriteria.map((ac, i) => (
                      <p key={i} className="text-xs text-text-muted font-mono">
                        {ac.formatted}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-accent-blue hover:text-accent-blue/80 transition-colors"
        >
          {showDetails ? 'Hide details' : 'View full PRD'}
        </button>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onRequestChanges}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-text-muted hover:text-text-primary"
          >
            Request Changes
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-blue/90 active:bg-accent-blue/80 focus-ring"
          >
            Approve &amp; Continue
          </button>
        </div>
      </div>
    </div>
  );
}
