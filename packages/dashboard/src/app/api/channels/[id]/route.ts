import { NextResponse } from 'next/server';

/**
 * PUT /api/channels/[id]
 * Updates channel configuration.
 * TODO: Persist to project manifest via @agentforge/core.
 */
export async function PUT(
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

  return NextResponse.json({
    channel: {
      id,
      ...body,
      updatedAt: new Date().toISOString(),
    },
  });
}
