import { NextRequest, NextResponse } from 'next/server';
import { readDesignSpecText } from '@agentforge/core';
import { readYamlFile, getActiveProjectRoot } from '../../../_lib/project-reader';
import { getVisionProvider, NO_CLAUDE_AUTH_ERROR } from '../../../_lib/llm-provider';
import type { DesignSpecV2, RendererTokens, RawCatalogSpec } from '@agentforge/designspec-renderer';
import { EVALUATOR_MODEL, isVisionLLMEnabled, loadProjectManifest, createRealFs, resolveModelForRole } from '@agentforge/core';
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

  const projectRoot = getActiveProjectRoot();
  const manifestResult = loadProjectManifest(projectRoot, createRealFs());
  const manifest = manifestResult.ok ? manifestResult.value : undefined;
  const evaluatorModel = resolveModelForRole('ux_evaluator', EVALUATOR_MODEL, manifest);
  const providerResult = getVisionProvider(evaluatorModel);
  if (!providerResult) {
    return NextResponse.json({ error: NO_CLAUDE_AUTH_ERROR }, { status: 503 });
  }

  const specText = readDesignSpecText(getActiveProjectRoot(), pageId);
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
    if (screenshotBase64.length > 500_000) {
      console.warn(`[vision-audit] Large screenshot: ${(screenshotBase64.length / 1024).toFixed(0)}KB base64. Consider reducing viewport or page height.`);
    }
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
      const msg = result.error.message;
      if (msg.includes('RATE_LIMITED')) {
        return NextResponse.json(
          { error: 'Vision audit rate-limited by your AI provider. This usually means the request exceeds your tokens-per-minute quota. Options: (1) set AGENTFORGE_VISION_API_KEY with a direct Anthropic API key (higher limits), or (2) request a quota increase in GCP Console for claude-opus-4-7.' },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }
      if (msg.includes('AUTH_FAILED')) {
        return NextResponse.json(
          { error: 'AI provider authentication failed. Check your ANTHROPIC_API_KEY or GCP credentials.' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: `Vision evaluation failed: ${msg}` },
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
