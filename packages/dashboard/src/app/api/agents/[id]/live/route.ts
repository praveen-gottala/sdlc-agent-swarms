import { NextResponse } from 'next/server';

/**
 * GET /api/agents/[id]/live
 * Returns recent log entries for an agent.
 * In a real implementation this would be a WebSocket upgrade for streaming.
 * TODO: Wire to agent event bus for real-time log streaming.
 */
export async function GET(
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

  const now = new Date();

  const logs = [
    {
      timestamp: new Date(now.getTime() - 30000).toISOString(),
      level: 'info',
      message: `[${id}] Task picked up from queue`,
      metadata: { taskId: 'task-005', phase: 'Code Gen' },
    },
    {
      timestamp: new Date(now.getTime() - 25000).toISOString(),
      level: 'info',
      message: `[${id}] Reading project spec`,
      metadata: { file: 'agentforge/spec/api.yaml' },
    },
    {
      timestamp: new Date(now.getTime() - 20000).toISOString(),
      level: 'debug',
      message: `[${id}] LLM call started`,
      metadata: { model: 'claude-sonnet-4-6-20250514', tokens: 4200 },
    },
    {
      timestamp: new Date(now.getTime() - 15000).toISOString(),
      level: 'info',
      message: `[${id}] LLM response received`,
      metadata: { model: 'claude-sonnet-4-6-20250514', durationMs: 3200, outputTokens: 1850 },
    },
    {
      timestamp: new Date(now.getTime() - 10000).toISOString(),
      level: 'info',
      message: `[${id}] Writing generated file`,
      metadata: { file: 'src/modules/auth/auth.service.ts' },
    },
    {
      timestamp: new Date(now.getTime() - 5000).toISOString(),
      level: 'warn',
      message: `[${id}] Governance check: approaching token budget limit`,
      metadata: { usedTokens: 18500, budgetTokens: 20000 },
    },
    {
      timestamp: now.toISOString(),
      level: 'info',
      message: `[${id}] Awaiting next task`,
      metadata: {},
    },
  ];

  return NextResponse.json({ agentId: id, logs, total: logs.length });
}
