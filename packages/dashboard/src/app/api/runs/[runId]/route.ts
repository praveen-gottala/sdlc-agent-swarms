import { NextResponse } from 'next/server';
import { getRunStatus } from '../../_lib/run-manager';

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } },
): Promise<NextResponse> {
  try {
    const run = getRunStatus(params.runId);
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
