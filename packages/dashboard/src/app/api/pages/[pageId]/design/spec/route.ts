import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { readTextFile, readYamlFile, getActiveProjectRoot } from '../../../../_lib/project-reader';
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';

export const dynamic = 'force-dynamic';

function normalizeDesignSpecShape(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const record = raw as Record<string, unknown>;
  if (record.nodes && typeof record.nodes === 'object') return record;
  if (record.spec && typeof record.spec === 'object') {
    const nested = record.spec as Record<string, unknown>;
    if (nested.nodes && typeof nested.nodes === 'object') return nested;
  }
  return raw;
}

/**
 * GET /api/pages/[pageId]/design/spec
 * Reads the design spec JSON from {project}/agentforge/designs/{pageId}.json.
 *
 * When ?bundle=true is set, also reads tokens and catalog from the same
 * project directory and returns { spec, tokens, catalog } so the browser
 * renderer has everything it needs in a single fetch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  const content =
    readTextFile(`agentforge/designs/${pageId}.json`) ??
    readTextFile(`.agentforge/previews/${pageId}/scripts/designspec-v2.json`) ??
    readTextFile(`.agentforge/previews/bookshelf-${pageId}/scripts/designspec-v2.json`);

  if (content === null) {
    return NextResponse.json(
      { error: 'Design spec not found' },
      { status: 404 },
    );
  }

  let parsed: any;
  try {
    parsed = normalizeDesignSpecShape(JSON.parse(content));
  } catch {
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bundle = request.nextUrl.searchParams.get('bundle') === 'true';
  if (!bundle) {
    return NextResponse.json(parsed);
  }

  // Read tokens and catalog from the same project directory
  const rawTokens = readYamlFile<Record<string, unknown>>('agentforge/spec/design-tokens.yaml');
  const rawCatalog = readYamlFile<any>('agentforge/spec/component-catalog.yaml');

  const tokens = rawTokens
    ? (() => { const { version: _, created_by: __, ...rest } = rawTokens as Record<string, unknown>; void _; void __; return rest; })()
    : {};
  const catalog = loadCatalogForRenderer(rawCatalog ?? undefined, tokens as any);

  return NextResponse.json({ spec: parsed, tokens, catalog });
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
