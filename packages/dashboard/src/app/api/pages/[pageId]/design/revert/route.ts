import { NextRequest, NextResponse } from 'next/server';
import { revertDesignSpec } from '@agentforge/core';
import { getActiveProjectRoot } from '../../../../_lib/project-reader';

/**
 * POST /api/pages/[pageId]/design/revert
 *
 * Restores a design spec from its backup (created before correction patches).
 * Used by the monotonic guard when a fix makes the vision score worse.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  const projectRoot = getActiveProjectRoot();

  if (!revertDesignSpec(projectRoot, pageId)) {
    return NextResponse.json({ error: 'No backup found for this page' }, { status: 404 });
  }

  return NextResponse.json({ reverted: true, pageId });
}
