import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface RawTask {
  id: string;
  title: string;
  phase: string;
  agent: string;
  status: string;
  spec_ref: string;
  hitl_status: string;
  hitl_channel: string | null;
  cost_usd: number;
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
 * GET /api/approvals
 * Returns pending HITL approval gates by filtering tasks with status === 'awaiting_approval'.
 */
export async function GET() {
  const tasksFile = readYamlFile<TasksFile>('agentforge.tasks.yaml');
  const tasks = tasksFile?.tasks ?? [];

  const approvals = tasks
    .filter((t) => t.status === 'awaiting_approval')
    .map((t, idx) => ({
      gateId: `gate-${String(idx + 1).padStart(3, '0')}`,
      taskId: t.id,
      agent: t.agent ?? '',
      phase: PHASE_DISPLAY_NAMES[t.phase] ?? t.phase ?? '',
      title: t.title ?? '',
      description: `Task "${t.title}" requires approval before proceeding.`,
      artifactUrl: t.spec_ref ?? '',
      requestedAt: new Date().toISOString(),
      priority: 'medium' as const,
      status: 'pending' as const,
    }));

  return NextResponse.json({ approvals, total: approvals.length });
}
