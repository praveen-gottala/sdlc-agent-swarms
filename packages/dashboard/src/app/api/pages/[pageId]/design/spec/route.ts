import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { readTextFile, getActiveProjectRoot } from '../../../../_lib/project-reader';

/**
 * GET /api/pages/[pageId]/design/spec
 * Reads the design spec JSON from agentforge/designs/{pageId}.json.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  const content = readTextFile(`agentforge/designs/${pageId}.json`);

  if (content === null) {
    return NextResponse.json(
      { error: 'Design spec not found' },
      { status: 404 },
    );
  }

  try {
    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch {
    // Return raw text if it's not valid JSON
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * PUT /api/pages/[pageId]/design/spec
 * Writes a design spec JSON to agentforge/designs/{pageId}.json.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const projectRoot = getActiveProjectRoot();
  const designsDir = join(projectRoot, 'agentforge', 'designs');
  if (!existsSync(designsDir)) {
    mkdirSync(designsDir, { recursive: true });
  }

  const filePath = join(designsDir, `${pageId}.json`);
  writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf-8');

  return NextResponse.json({ ok: true, path: `agentforge/designs/${pageId}.json` });
}
