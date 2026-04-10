import { NextResponse } from 'next/server';
import { getRendererStatus } from '../../_lib/renderer-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getRendererStatus();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err), v: 2 }, { status: 500 });
  }
}
