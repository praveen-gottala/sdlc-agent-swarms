'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AgentCard } from '@/components/agents/agent-card';
import { AgentLearnings } from '@/components/agents/agent-learnings';
import { CreateAgentModal } from '@/components/agents/create-agent-modal';
import { Button } from '@/components/ui/button';

import type { AgentStatus, HitlLevel } from '@/components/agents/agent-card';

interface Agent {
  id: string;
  name: string;
  role: string;
  provider: string;
  status: AgentStatus;
  tasksCompleted: number;
  avgCost: number;
  qualityScore: number;
  hitlLevel: HitlLevel;
  isCustom: boolean;
}

/** Map API status to component-expected AgentStatus. */
function mapAgentStatus(apiStatus: string): AgentStatus {
  const mapping: Record<string, AgentStatus> = {
    'idle': 'idle',
    'active': 'active',
    'executing': 'executing',
    'error': 'blocked',
    'disabled': 'blocked',
  };
  return mapping[apiStatus] ?? 'idle';
}

/** Map trust level number to HitlLevel. */
function mapHitlLevel(trustLevel: number): HitlLevel {
  if (trustLevel >= 0.95) return 'autonomous';
  if (trustLevel >= 0.85) return 'notify_only';
  if (trustLevel >= 0.70) return 'review_and_override';
  return 'full_approval';
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(json => {
        const apiAgents = json.agents ?? json.data ?? [];
        const mapped: Agent[] = apiAgents.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          name: a.name as string,
          role: a.role as string,
          provider: (a.model as string) ?? (a.provider as string) ?? 'unknown',
          status: mapAgentStatus(a.status as string),
          tasksCompleted: 0,
          avgCost: 0,
          qualityScore: Math.round(((a.trustLevel as number) ?? 0.5) * 100),
          hitlLevel: mapHitlLevel((a.trustLevel as number) ?? 0.5),
          isCustom: (a.isCustom as boolean) ?? false,
        }));
        setAgents(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  return (
    <main className="min-h-screen bg-[#0f1117] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Agents</h1>
            <p className="mt-1 text-sm text-[#94a3b8]">
              Manage and monitor your SDLC agents
            </p>
          </div>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            + New Agent
          </Button>
        </div>

        {/* Agent grid */}
        <section className="mb-12">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} {...agent} />
            ))}
          </div>
        </section>

        {/* Agent Learnings */}
        <section>
          <AgentLearnings />
        </section>
      </div>

      {/* Create Agent Modal */}
      <CreateAgentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={() => {
          // Refetch agents list after creation
          fetchAgents();
        }}
      />
    </main>
  );
}
