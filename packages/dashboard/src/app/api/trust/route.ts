import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface TrustEntry {
  level?: string;
  consecutive_approvals?: number;
  total_tasks?: number;
  last_outcome?: string;
  enabled?: boolean;
  score?: number;
}

interface TrustState {
  version: string;
  trust: Record<string, TrustEntry>;
}

interface RawAgent {
  role: string;
  phase: string;
}

interface AgentsFile {
  version: string;
  agents: RawAgent[];
}

/**
 * GET /api/trust
 * Returns trust state per agent from .agentforge/trust-state.yaml.
 * Falls back to default trust entries for each known agent when trust data is empty.
 */
export async function GET() {
  const trustState = readYamlFile<TrustState>('.agentforge/trust-state.yaml');
  const agentsFile = readYamlFile<AgentsFile>('agentforge/agents.yaml');

  const trustMap = trustState?.trust ?? {};
  const agents = agentsFile?.agents ?? [];

  const LEVEL_THRESHOLDS: Record<string, number> = {
    full_approval: 10,
    review_and_override: 20,
    notify_only: 30,
    fully_autonomous: null as unknown as number,
  };

  // Build trust entries from real trust-state.yaml data
  const trustEntries = agents.map((a) => {
    const entry = trustMap[a.role];
    const level = entry?.level ?? 'full_approval';
    const consecutiveApprovals = entry?.consecutive_approvals ?? 0;
    const totalTasks = entry?.total_tasks ?? 0;
    const approvalRate = totalTasks > 0 ? consecutiveApprovals / totalTasks : 0;

    return {
      agentId: a.role,
      trustScore: approvalRate,
      level,
      consecutiveApprovals,
      thresholdForNext: LEVEL_THRESHOLDS[level] ?? null,
      totalTasks,
      lastOutcome: entry?.last_outcome ?? 'unknown',
      enabled: entry?.enabled ?? true,
      trend: consecutiveApprovals > 5 ? 'improving' : 'stable',
      factors: {
        taskSuccessRate: approvalRate,
        approvalRate,
        errorRate: totalTasks > 0 ? 1 - approvalRate : 0,
      },
      history: [],
    };
  });

  return NextResponse.json({ agents: trustEntries });
}
