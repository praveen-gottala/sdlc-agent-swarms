'use client';

import React, { useState, useEffect } from 'react';
import { TrustCard } from '@/components/trust/trust-card';
import type { HitlLevel } from '@/components/trust/trust-card';

interface TrustAgent {
  agentName: string;
  hitlLevel: HitlLevel;
  consecutiveApprovals: number;
  thresholdForNext: number | null;
  lastOutcome: 'approved' | 'rejected';
  enabled: boolean;
}

/** Map a trust score to an HITL level. */
function scoreToHitlLevel(score: number): HitlLevel {
  if (score >= 0.95) return 'autonomous';
  if (score >= 0.85) return 'notify_only';
  if (score >= 0.70) return 'review_and_override';
  return 'full_approval';
}

/** Map a trust score to a threshold for the next level. */
function thresholdForNext(score: number): number | null {
  if (score >= 0.95) return null; // already autonomous
  if (score >= 0.85) return 30;
  if (score >= 0.70) return 20;
  return 10;
}

/**
 * Progressive Trust dashboard page showing trust levels for all agents.
 */
export default function TrustPage() {
  const [trustData, setTrustData] = useState<TrustAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/trust')
      .then(res => res.json())
      .then(json => {
        const apiAgents = json.agents ?? json.data ?? [];
        const mapped: TrustAgent[] = apiAgents.map((a: Record<string, unknown>) => {
          const score = (a.trustScore as number) ?? 0.5;
          const trend = (a.trend as string) ?? 'stable';
          return {
            agentName: (a.agentId as string) ?? 'Unknown',
            hitlLevel: scoreToHitlLevel(score),
            consecutiveApprovals: Math.round(score * 30),
            thresholdForNext: thresholdForNext(score),
            lastOutcome: 'approved' as const,
            enabled: trend !== 'declining',
          };
        });
        setTrustData(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Progressive Trust</h1>
        <p className="mt-2 text-sm text-text-muted">
          Agents earn autonomy through consecutive successful approvals. Each level reduces
          human oversight as the agent demonstrates reliability. You can manually escalate,
          degrade, or reset trust at any time.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trustData.map((agent) => (
          <TrustCard key={agent.agentName} {...agent} />
        ))}
      </div>
    </div>
  );
}
