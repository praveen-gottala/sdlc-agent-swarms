import { NextResponse } from 'next/server';
import { startRenderer } from '../../_lib/renderer-manager';

export async function POST() {
  const result = await startRenderer();
  if (result.status === 'failed') {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
