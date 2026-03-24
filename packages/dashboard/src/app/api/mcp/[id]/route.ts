import { NextResponse } from 'next/server';

/**
 * PUT /api/mcp/[id]
 * Updates an MCP server configuration.
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
    server: {
      id,
      ...body,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * DELETE /api/mcp/[id]
 * Disconnects and removes an MCP server configuration.
 * TODO: Wire to MCP transport disconnect and persist removal.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return NextResponse.json({
    disconnected: true,
    serverId: id,
    timestamp: new Date().toISOString(),
  });
}
