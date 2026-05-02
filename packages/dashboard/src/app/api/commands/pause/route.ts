import { NextResponse } from 'next/server';

/**
 * POST /api/commands/pause
 * Pauses a specific task or all running tasks.
 * Stub — real pause logic comes with the orchestration engine.
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
      paused: true,
      taskId,
      message: `Task ${taskId} has been paused`,
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    paused: true,
    taskId: null,
    message: 'All running tasks have been paused',
    tasksPaused: 3,
    timestamp: new Date().toISOString(),
  });
}
