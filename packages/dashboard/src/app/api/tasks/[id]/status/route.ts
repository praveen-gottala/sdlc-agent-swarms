import { NextResponse } from 'next/server';

const validStatuses = ['pending', 'in_progress', 'review', 'done', 'blocked'];

/**
 * PATCH /api/tasks/[id]/status
 * Updates the status of a task.
 * TODO: Persist via @agentforge/core state manager.
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

  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
      { status: 400 },
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
