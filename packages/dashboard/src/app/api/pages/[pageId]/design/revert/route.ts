import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
  const designsDir = join(projectRoot, 'agentforge', 'designs');
  const backupPath = join(designsDir, `${pageId}.backup.json`);
  const specPath = join(designsDir, `${pageId}.json`);

  if (!existsSync(backupPath)) {
    return NextResponse.json({ error: 'No backup found for this page' }, { status: 404 });
  }

  const backup = readFileSync(backupPath, 'utf-8');
  writeFileSync(specPath, backup, 'utf-8');

  return NextResponse.json({ reverted: true, pageId });
}
