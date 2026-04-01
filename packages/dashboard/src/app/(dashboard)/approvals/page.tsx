'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ApprovalCard, type ApprovalCardProps } from '@/components/approvals/approval-card';
import { Badge } from '@/components/ui/badge';

interface RecentDecision {
  id: string;
  title: string;
  agent: string;
  decision: 'approved' | 'rejected' | 'changes_requested';
  decidedAt: string;
  decidedBy: string;
}

const decisionBadge: Record<RecentDecision['decision'], { label: string; variant: 'success' | 'danger' | 'warning' }> = {
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  changes_requested: { label: 'Changes Requested', variant: 'warning' },
};

/** Approval Center page - HITL approval queue with pending and recent decisions. */
export default function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalCardProps[]>([]);
  const [recentDecisions, setRecentDecisions] = useState<RecentDecision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/approvals')
      .then(res => res.json())
      .then(json => {
        const apiApprovals = json.approvals ?? json.data ?? [];
        // Map API approvals to ApprovalCardProps shape
        const mapped: ApprovalCardProps[] = apiApprovals.map((a: Record<string, unknown>) => ({
          id: a.gateId as string,
          title: a.title as string,
          agent: a.agent as string,
          hitlLevel: 'full_approval' as const,
          severity: (a.priority as string) === 'high' ? 'high' : (a.priority as string) === 'low' ? 'low' : 'medium',
          timeElapsed: getTimeElapsed(a.requestedAt as string),
          cost: 0,
          diffPreview: a.description as string,
          specContext: `Task: ${a.taskId as string}\nPhase: ${a.phase as string}\nArtifact: ${a.artifactUrl as string}`,
          reasoning: [],
        }));
        setPendingApprovals(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  /** Handle approve/reject/request_changes via POST /api/approvals/[gateId]/decide. */
  const handleDecide = useCallback(
    async (gateId: string, decision: 'approve' | 'reject' | 'request_changes', reason?: string) => {
      try {
        const res = await fetch(`/api/approvals/${gateId}/decide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, reason }),
        });
        const data = await res.json();
        if (res.ok) {
          // Remove from pending
          const decided = pendingApprovals.find((a) => a.id === gateId);
          setPendingApprovals((prev) => prev.filter((a) => a.id !== gateId));
          // Add to recent decisions
          const decisionMap: Record<string, RecentDecision['decision']> = {
            approve: 'approved',
            reject: 'rejected',
            request_changes: 'changes_requested',
          };
          if (decided) {
            setRecentDecisions((prev) => [
              {
                id: gateId,
                title: decided.title,
                agent: decided.agent,
                decision: decisionMap[decision] ?? 'approved',
                decidedAt: data.decidedAt ?? new Date().toISOString(),
                decidedBy: 'you',
              },
              ...prev,
            ]);
          }
        }
      } catch {
        // Silently fail - item stays in pending list
      }
    },
    [pendingApprovals],
  );

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  const pendingCount = pendingApprovals.length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      {/* Title */}
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Approval Center</h1>
        <Badge variant="warning">{pendingCount} pending</Badge>
      </div>

      {/* Pending approvals */}
      <section className="space-y-4">
        {pendingApprovals.map((approval) => (
          <ApprovalCard key={approval.id} {...approval} onDecide={handleDecide} />
        ))}
      </section>

      {/* Recent decisions */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Decisions</h2>
        <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-elevated text-text-muted">
                <th className="px-4 py-2.5 text-left font-medium">ID</th>
                <th className="px-4 py-2.5 text-left font-medium">Title</th>
                <th className="px-4 py-2.5 text-left font-medium">Agent</th>
                <th className="px-4 py-2.5 text-left font-medium">Decision</th>
                <th className="px-4 py-2.5 text-left font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {recentDecisions.map((d) => {
                const badge = decisionBadge[d.decision];
                return (
                  <tr key={d.id} className="border-b border-border last:border-b-0 hover:bg-bg-elevated/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-text-muted">{d.id}</td>
                    <td className="px-4 py-2.5 text-text-primary">{d.title}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="info">{d.agent}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{d.decidedAt}</td>
                  </tr>
                );
              })}
              {recentDecisions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-text-muted">No recent decisions</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

/** Helper to compute a human-readable time elapsed string. */
function getTimeElapsed(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
