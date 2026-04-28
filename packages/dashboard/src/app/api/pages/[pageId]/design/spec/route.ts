import { NextRequest, NextResponse } from 'next/server';
import { readDesignSpec, readDesignSpecText, writeDesignSpec } from '@agentforge/core';
import { readYamlFile, getActiveProjectRoot } from '../../../../_lib/project-reader';
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';
import type { RawCatalogSpec } from '@agentforge/designspec-renderer';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pages/[pageId]/design/spec
 * Reads the design spec JSON from the canonical path via DesignSpecStore.
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
  const projectRoot = getActiveProjectRoot();
  const parsed = readDesignSpec(projectRoot, pageId);

  if (parsed === null) {
    const raw = readDesignSpecText(projectRoot, pageId);
    if (raw !== null) {
      return new NextResponse(raw, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return NextResponse.json(
      { error: 'Design spec not found' },
      { status: 404 },
    );
  }

  const bundle = request.nextUrl.searchParams.get('bundle') === 'true';
  if (!bundle) {
    return NextResponse.json(parsed);
  }

  const rawTokens = readYamlFile<Record<string, unknown>>('agentforge/spec/design-tokens.yaml');
  const rawCatalog = readYamlFile<RawCatalogSpec>('agentforge/spec/component-catalog.yaml');

  const tokens = rawTokens
    ? (() => { const { version: _, created_by: __, ...rest } = rawTokens as Record<string, unknown>; void _; void __; return rest; })()
    : {};
  const catalog = loadCatalogForRenderer(rawCatalog ?? undefined, tokens as Record<string, unknown> as import('@agentforge/designspec-renderer').RendererTokens);

  return NextResponse.json({ spec: parsed, tokens, catalog });
}

/**
 * PUT /api/pages/[pageId]/design/spec
 * Writes a design spec JSON via DesignSpecStore.
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
  writeDesignSpec(projectRoot, pageId, body);

  return NextResponse.json({ ok: true, path: `agentforge/designs/${pageId}.json` });
}
