import { NextResponse } from 'next/server';
import { readYamlFile, readTextFile } from '../_lib/project-reader';

export const dynamic = 'force-dynamic';

interface RawTask {
  id: string;
  title: string;
  agent: string;
  status: string;
}

interface TasksFile {
  tasks: RawTask[];
}

interface EventEntry {
  taskId?: string;
  [key: string]: unknown;
}

/**
 * GET /api/traces
 * Returns task IDs from tasks.yaml plus any additional taskIds found in events.jsonl.
 */
export async function GET() {
  const tasksFile = readYamlFile<TasksFile>('agentforge.tasks.yaml');
  const tasks = tasksFile?.tasks ?? [];

  const taskIds = new Set(tasks.map((t) => t.id));

  // Also scan events.jsonl for taskIds not already in tasks.yaml
  const raw = readTextFile('.agentforge/events.jsonl');
  if (raw) {
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as EventEntry;
        if (event.taskId && typeof event.taskId === 'string') {
          taskIds.add(event.taskId);
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  const allTaskIds = Array.from(taskIds);

  return NextResponse.json({ taskIds: allTaskIds, total: allTaskIds.length });
}
