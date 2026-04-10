import { NextResponse } from 'next/server';
import {
  loadTasks,
  saveTasks,
  updateTaskStatus,
  createRealFs,
} from '@agentforge/core';
import { getActiveProjectRoot } from '../../../_lib/project-reader';

/**
 * PATCH /api/tasks/[id]/status
 * Updates the status of a task using core's task-manager (real persistence).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;

  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { status } = body;

  if (!status || typeof status !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: status' },
      { status: 400 },
    );
  }

  const projectRoot = getActiveProjectRoot();
  const fs = createRealFs();

  const loadResult = loadTasks(projectRoot, fs);
  if (!loadResult.ok) {
    return NextResponse.json(
      { error: `Failed to load tasks: ${loadResult.error.message}` },
      { status: 500 },
    );
  }

  const updateResult = updateTaskStatus(loadResult.value, id, status as Parameters<typeof updateTaskStatus>[2]);
  if (!updateResult.ok) {
    return NextResponse.json(
      { error: updateResult.error.message },
      { status: 422 },
    );
  }

  const saveResult = saveTasks(projectRoot, updateResult.value, fs);
  if (!saveResult.ok) {
    return NextResponse.json(
      { error: `Failed to save tasks: ${saveResult.error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    task: {
      id,
      status,
      updatedAt: new Date().toISOString(),
    },
  });
}
