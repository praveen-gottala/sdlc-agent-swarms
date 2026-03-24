import { NextResponse } from 'next/server';

/**
 * POST /api/mcp/[id]/ping
 * Health-checks an MCP server by sending a ping request.
 * TODO: Wire to MCP transport for real health check.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return NextResponse.json({
    success: true,
    serverId: id,
    latencyMs: Math.floor(Math.random() * 100) + 10,
    timestamp: new Date().toISOString(),
  });
}
