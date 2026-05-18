import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';
import { listRuns } from '../_lib/run-manager';

interface RawTask {
  id: string;
  title: string;
  phase: string;
  agent: string;
  status: string;
  cost_usd: number;
  tokens_used: number;
}

interface TasksFile {
  tasks: RawTask[];
}

interface ProjectConfig {
  budget?: {
    per_task_max_usd?: number;
    per_phase_max_usd?: number;
    monthly_max_usd?: number;
    alert_threshold?: number;
  };
}

const PHASE_DISPLAY_NAMES: Record<string, string> = {
  design: 'Design',
  spec: 'Spec',
  code: 'Code Gen',
  cicd: 'CI/CD',
  observe: 'Observe',
};

const PHASE_ORDER = ['design', 'spec', 'code', 'cicd', 'observe'];

/**
 * GET /api/costs
 * Returns cost summary computed from agentforge.tasks.yaml + completed pipeline runs,
 * with budget limits from agentforge.yaml.
 */
export async function GET() {
  const tasksFile = readYamlFile<TasksFile>('agentforge.tasks.yaml');
  const projectConfig = readYamlFile<ProjectConfig>('agentforge.yaml');

  const tasks = tasksFile?.tasks ?? [];
  const budget = projectConfig?.budget;
  const monthlyBudget = budget?.monthly_max_usd ?? 200;

  const taskCost = tasks.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0);

  // Also aggregate costs from completed pipeline runs
  const runs = listRuns();
  const runCost = runs.reduce((sum, r) => sum + (r.cost?.totalCostUsd ?? 0), 0);
  const runTokens = runs.reduce((sum, r) => sum + (r.cost?.tokensUsed ?? 0), 0);

  const totalCost = taskCost + runCost;
  const totalTokens = tasks.reduce((sum, t) => sum + (t.tokens_used ?? 0), 0) + runTokens;

  // By phase
  const byPhase = PHASE_ORDER.map((phaseKey) => {
    const phaseTasks = tasks.filter((t) => t.phase === phaseKey);
    const cost = phaseTasks.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0);
    const tokenCount = phaseTasks.reduce((sum, t) => sum + (t.tokens_used ?? 0), 0);
    return {
      phase: PHASE_DISPLAY_NAMES[phaseKey] ?? phaseKey,
      cost: Math.round(cost * 100) / 100,
      tokenCount,
      taskCount: phaseTasks.length,
    };
  });

  // By agent
  const agentMap: Record<string, { cost: number; tokenCount: number; taskCount: number }> = {};
  for (const task of tasks) {
    const agent = task.agent ?? 'unknown';
    if (!agentMap[agent]) agentMap[agent] = { cost: 0, tokenCount: 0, taskCount: 0 };
    agentMap[agent].cost += task.cost_usd ?? 0;
    agentMap[agent].tokenCount += task.tokens_used ?? 0;
    agentMap[agent].taskCount += 1;
  }

  const byAgent = Object.entries(agentMap).map(([agent, data]) => ({
    agent,
    cost: Math.round(data.cost * 100) / 100,
    tokenCount: data.tokenCount,
    taskCount: data.taskCount,
    model: '',
  }));

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dayOfMonth = now.getDate();
  const dailyAverage = dayOfMonth > 0 ? Math.round((totalCost / dayOfMonth) * 100) / 100 : 0;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedEndOfMonth = Math.round(dailyAverage * daysInMonth * 100) / 100;
  const budgetUsedPercent =
    monthlyBudget > 0 ? Math.round((totalCost / monthlyBudget) * 100) : 0;

  const costs = {
    monthly: {
      month,
      totalCost: Math.round(totalCost * 100) / 100,
      budget: monthlyBudget,
      budgetUsedPercent,
      projectedEndOfMonth,
      dailyAverage,
      totalTokens: { input: Math.floor(totalTokens * 0.6), output: Math.floor(totalTokens * 0.4) },
    },
    budgetLimits: {
      perPhaseMaxUsd: budget?.per_phase_max_usd ?? null,
      perTaskMaxUsd: budget?.per_task_max_usd ?? null,
    },
    byPhase,
    byAgent,
    dailyTrend: [],
  };

  return NextResponse.json({ costs });
}
