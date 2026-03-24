import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface RawTask {
  id: string;
  title: string;
  phase: string;
  agent: string;
  status: string;
  depends_on: string[];
  spec_ref: string;
  branch: string | null;
  pr_number: number | null;
  cost_usd: number;
  tokens_used: number;
  attempts: number;
  max_attempts: number;
  hitl_status: string;
  hitl_channel: string | null;
}

interface TasksFile {
  tasks: RawTask[];
}

const PHASE_DISPLAY_NAMES: Record<string, string> = {
  design: 'Design',
  spec: 'Spec',
  code: 'Code Gen',
  cicd: 'CI/CD',
  observe: 'Observe',
};

/**
 * GET /api/tasks
 * Returns tasks array from agentforge.tasks.yaml.
 * Supports filtering by status, agent, or phase query params.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const agent = searchParams.get('agent');
  const phase = searchParams.get('phase');

  const tasksFile = readYamlFile<TasksFile>('agentforge.tasks.yaml');
  const rawTasks = tasksFile?.tasks ?? [];

  // Map to the shape the frontend expects
  let tasks = rawTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status ?? 'pending',
    agent: t.agent ?? '',
    phase: PHASE_DISPLAY_NAMES[t.phase] ?? t.phase ?? '',
    priority: 'medium' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    costUsd: t.cost_usd ?? 0,
    tokensUsed: t.tokens_used ?? 0,
    attempts: t.attempts ?? 0,
    maxAttempts: t.max_attempts ?? 3,
    specRef: t.spec_ref ?? '',
    branch: t.branch ?? null,
    prNumber: t.pr_number ?? null,
    hitlStatus: t.hitl_status ?? '',
    dependsOn: t.depends_on ?? [],
  }));

  if (status) {
    tasks = tasks.filter((t) => t.status === status);
  }
  if (agent) {
    tasks = tasks.filter((t) => t.agent === agent);
  }
  if (phase) {
    tasks = tasks.filter((t) => t.phase === phase);
  }

  return NextResponse.json({ tasks, total: tasks.length });
}
