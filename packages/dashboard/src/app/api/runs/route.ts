import { NextResponse } from 'next/server';
import { listRuns } from '../_lib/run-manager';
import type { RunStatus } from '../_lib/run-manager';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as RunStatus['type'] | null;
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    const runs = listRuns({ type: type ?? undefined, limit });
    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
