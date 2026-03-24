import { NextResponse } from 'next/server';

/**
 * PUT /api/providers/[id]
 * Updates a provider configuration including key rotation info.
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
    provider: {
      id,
      ...body,
      updatedAt: new Date().toISOString(),
    },
  });
}
