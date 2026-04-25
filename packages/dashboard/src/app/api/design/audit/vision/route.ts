import { NextRequest, NextResponse } from 'next/server';
import { readTextFile, readYamlFile } from '../../../_lib/project-reader';
import { getClaudeProvider, NO_CLAUDE_AUTH_ERROR } from '../../../_lib/llm-provider';
import type { DesignSpecV2, RendererTokens, RawCatalogSpec } from '@agentforge/designspec-renderer';
import { EVALUATOR_MODEL, isVisionLLMEnabled } from '@agentforge/core';
import type { DesignTokensSpec } from '@agentforge/core';

export const dynamic = 'force-dynamic';

/**
 * POST /api/design/audit/vision
 *
 * Takes a headless screenshot of the rendered design spec, sends it
 * to the vision evaluator (claude-opus-4-7), and returns score + issues.
 */
export async function POST(request: NextRequest) {
  let body: { pageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { pageId } = body;
  if (!pageId) {
    return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });
  }

  if (!isVisionLLMEnabled()) {
    return NextResponse.json({ error: 'Vision LLM is disabled (AGENTFORGE_ENABLE_VISION_LLM=false)' }, { status: 503 });
  }

  const providerResult = getClaudeProvider(EVALUATOR_MODEL);
  if (!providerResult) {
    return NextResponse.json({ error: NO_CLAUDE_AUTH_ERROR }, { status: 503 });
  }

  const specText = readTextFile(`agentforge/designs/${pageId}.json`);
  if (!specText) {
    return NextResponse.json({ error: `Design spec not found for page: ${pageId}` }, { status: 404 });
  }

  let spec: DesignSpecV2;
  try {
    spec = JSON.parse(specText) as DesignSpecV2;
  } catch {
    return NextResponse.json({ error: 'Invalid design spec JSON' }, { status: 500 });
  }

  const rawTokens = readYamlFile<DesignTokensSpec>('agentforge/spec/design-tokens.yaml');
  const rawCatalog = readYamlFile<RawCatalogSpec>('agentforge/spec/component-catalog.yaml');

  const tokens: RendererTokens = rawTokens
    ? (() => { const { version: _, created_by: __, ...rest } = rawTokens as DesignTokensSpec & Record<string, unknown>; void _; void __; return rest as RendererTokens; })()
    : {} as RendererTokens;
  const { loadCatalogForRenderer } = await import('@agentforge/designspec-renderer');
  const catalog = loadCatalogForRenderer(rawCatalog ?? undefined, tokens);

  try {
    const { openBrowserSession } = await import('@agentforge/designspec-renderer');
    const { session, initial } = await openBrowserSession(
      spec,
      tokens,
      catalog,
      { width: spec.width ?? 1440 },
    );

    const screenshotBase64 = initial.screenshot.toString('base64');
    await session.close();

    const { evaluateDesign } = await import('@agentforge/agents-ux');
    const result = await evaluateDesign(
      screenshotBase64,
      JSON.stringify(spec),
      providerResult.provider,
      undefined,
      rawTokens ?? undefined,
      catalog,
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: `Vision evaluation failed: ${result.error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      score: result.value.score,
      overallQuality: result.value.overallQuality,
      issues: result.value.issues,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Vision audit failed: ${message}` }, { status: 500 });
  }
}
