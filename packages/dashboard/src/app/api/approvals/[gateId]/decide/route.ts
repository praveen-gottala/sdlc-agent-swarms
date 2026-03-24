import { NextResponse } from 'next/server';

interface DecisionBody {
  decision: 'approve' | 'reject' | 'request_changes';
  reason?: string;
}

/**
 * POST /api/approvals/[gateId]/decide
 * Records an approval decision for a HITL gate.
 * Accepts body: { decision: 'approve' | 'reject' | 'request_changes', reason?: string }
 * TODO: Persist decision to YAML state via @agentforge/core.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ gateId: string }> },
) {
  const { gateId } = await params;
  let body: DecisionBody;

  try {
    body = await request.json() as DecisionBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const validDecisions = ['approve', 'reject', 'request_changes'];
  if (!body.decision || !validDecisions.includes(body.decision)) {
    return NextResponse.json(
      { error: `Invalid decision. Must be one of: ${validDecisions.join(', ')}` },
      { status: 400 },
    );
  }

  return NextResponse.json({
    gateId,
    decision: body.decision,
    reason: body.reason ?? null,
    decidedAt: new Date().toISOString(),
    status: 'decided',
  });
}
