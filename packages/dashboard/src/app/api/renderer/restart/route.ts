import { NextResponse } from 'next/server';
import { restartRenderer } from '../../_lib/renderer-manager';

export async function POST() {
  const result = await restartRenderer();
  if (result.status === 'failed') {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
