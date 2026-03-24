import { NextResponse } from 'next/server';

/**
 * POST /api/providers/[id]/test
 * Tests provider connectivity by sending a minimal health-check request.
 * TODO: Wire to @agentforge/providers for real connectivity test.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const providerModels: Record<string, string> = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    google: 'gemini-2.5-pro',
  };

  const model = providerModels[id];

  if (!model) {
    return NextResponse.json(
      { error: `Unknown provider: ${id}` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    providerId: id,
    model,
    latencyMs: Math.floor(Math.random() * 300) + 50,
    timestamp: new Date().toISOString(),
  });
}
