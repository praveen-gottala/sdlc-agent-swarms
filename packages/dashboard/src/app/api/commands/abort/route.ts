import { NextResponse } from 'next/server';

/**
 * POST /api/commands/abort
 * Aborts a specific task or all running tasks.
 * TODO: Wire to orchestration engine abort command.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { taskId } = body;

  if (taskId && typeof taskId !== 'string') {
    return NextResponse.json(
      { error: 'taskId must be a string if provided' },
      { status: 400 },
    );
  }

  if (taskId) {
    return NextResponse.json({
      aborted: true,
      taskId,
      message: `Task ${taskId} has been aborted`,
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    aborted: true,
    taskId: null,
    message: 'All running tasks have been aborted',
    tasksAborted: 3,
    timestamp: new Date().toISOString(),
  });
}
