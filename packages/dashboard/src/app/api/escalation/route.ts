import { NextResponse } from 'next/server';

const mockEscalationPolicy = {
  timeout: 60,
  action: 'pause_and_notify',
  secondaryTimeout: 120,
  secondaryAction: 'abort_task',
  notifyChannels: ['ch-slack-approvals'],
  escalationChain: ['lead-developer', 'project-manager'],
};

/**
 * GET /api/escalation
 * Returns the current HITL escalation policy.
 * TODO: Read from governance config via @agentforge/core.
 */
export async function GET() {
  return NextResponse.json({ policy: mockEscalationPolicy });
}

/**
 * PUT /api/escalation
 * Updates the escalation policy.
 * TODO: Persist to governance config via @agentforge/core.
 */
export async function PUT(request: Request) {
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
    policy: {
      ...mockEscalationPolicy,
      ...body,
      updatedAt: new Date().toISOString(),
    },
  });
}
