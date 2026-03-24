import { NextResponse } from 'next/server';

/**
 * PUT /api/agents/[id]
 * Updates an existing agent configuration.
 * TODO: Persist to YAML via @agentforge/core.
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
    agent: {
      id,
      ...body,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * DELETE /api/agents/[id]
 * Deletes a custom agent configuration. Rejects deletion of built-in agents.
 * TODO: Persist to YAML via @agentforge/core.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const builtInAgents = ['ux-designer', 'spec-writer', 'code-gen', 'devops', 'observer'];
  if (builtInAgents.includes(id)) {
    return NextResponse.json(
      { error: `Cannot delete built-in agent: ${id}` },
      { status: 403 },
    );
  }

  return NextResponse.json({ deleted: true, id });
}
