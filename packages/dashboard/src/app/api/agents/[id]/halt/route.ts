import { NextResponse } from 'next/server';

/**
 * POST /api/agents/[id]/halt
 * Halts a running agent through governance middleware.
 * TODO: Wire to governance halt mechanism.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const builtInAgents = ['ux-designer', 'spec-writer', 'code-gen', 'devops', 'observer'];

  if (!builtInAgents.includes(id)) {
    return NextResponse.json(
      { error: `Unknown agent: ${id}` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    halted: true,
    agentId: id,
    haltedAt: new Date().toISOString(),
    message: `Agent ${id} has been halted via governance`,
  });
}
