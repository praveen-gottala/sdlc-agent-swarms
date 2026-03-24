import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface Task {
  id: string;
  title: string;
  phase: string;
  agent: string;
  status: string;
  cost_usd: number;
  tokens_used: number;
}

interface TasksFile {
  tasks: Task[];
}

interface ActiveThread {
  threadId: string;
  phase: string;
  startedAt: string;
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
 * GET /api/pipeline
 * Returns the SDLC pipeline phases with status, task progress, and cost data.
 * Reads from bookshelf project YAML state files.
 */
export async function GET() {
  const tasksFile = readYamlFile<TasksFile>('agentforge.tasks.yaml');
  const activeThread = readYamlFile<ActiveThread>('.agentforge/active-thread.yaml');

  const tasks = tasksFile?.tasks ?? [];
  const currentPhase = activeThread?.phase ?? '';

  // Group tasks by phase
  const tasksByPhase: Record<string, Task[]> = {};
  for (const task of tasks) {
    const phase = task.phase ?? 'unknown';
    if (!tasksByPhase[phase]) tasksByPhase[phase] = [];
    tasksByPhase[phase].push(task);
  }

  // Determine phase status based on task states and current active phase
  function getPhaseStatus(phaseKey: string, phaseTasks: Task[]): string {
    if (phaseTasks.length === 0) {
      // No tasks yet — check if we've passed this phase
      const currentIdx = PHASE_ORDER.indexOf(currentPhase);
      const phaseIdx = PHASE_ORDER.indexOf(phaseKey);
      if (currentIdx > phaseIdx) return 'complete';
      if (currentIdx === phaseIdx) return 'active';
      return 'pending';
    }

    const allDone = phaseTasks.every((t) => t.status === 'done' || t.status === 'complete' || t.status === 'completed');
    if (allDone) return 'complete';

    const hasActive = phaseTasks.some(
      (t) =>
        t.status === 'in_progress' ||
        t.status === 'awaiting_approval' ||
        t.status === 'review',
    );
    if (hasActive || phaseKey === currentPhase) return 'active';

    const currentIdx = PHASE_ORDER.indexOf(currentPhase);
    const phaseIdx = PHASE_ORDER.indexOf(phaseKey);
    if (currentIdx > phaseIdx) return 'complete';
    return 'pending';
  }

  const phases = PHASE_ORDER.map((phaseKey) => {
    const phaseTasks = tasksByPhase[phaseKey] ?? [];
    const tasksDone = phaseTasks.filter(
      (t) => t.status === 'done' || t.status === 'complete' || t.status === 'completed',
    ).length;
    const cost = phaseTasks.reduce((sum, t) => sum + (t.cost_usd ?? 0), 0);

    return {
      name: PHASE_DISPLAY_NAMES[phaseKey] ?? phaseKey,
      status: getPhaseStatus(phaseKey, phaseTasks),
      tasksDone,
      tasksTotal: phaseTasks.length,
      cost: Math.round(cost * 100) / 100,
    };
  });

  return NextResponse.json({ phases });
}
