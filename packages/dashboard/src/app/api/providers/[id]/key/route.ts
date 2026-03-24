import { NextResponse } from 'next/server';

/**
 * PUT /api/providers/[id]/key
 * Rotates the API key for a provider.
 * TODO: Store encrypted key via @agentforge/core secrets manager.
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

  const { apiKey } = body;

  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: apiKey' },
      { status: 400 },
    );
  }

  if (apiKey.length < 10) {
    return NextResponse.json(
      { error: 'API key must be at least 10 characters' },
      { status: 400 },
    );
  }

  const masked = `${apiKey.slice(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.slice(-4)}`;

  return NextResponse.json({
    providerId: id,
    keyRotated: true,
    maskedKey: masked,
    rotatedAt: new Date().toISOString(),
  });
}
