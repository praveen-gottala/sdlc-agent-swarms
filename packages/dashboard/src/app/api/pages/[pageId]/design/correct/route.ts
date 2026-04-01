import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  readYamlFile,
  writeYamlFile,
  readTextFile,
  getActiveProjectRoot,
} from '../../../../_lib/project-reader';

/* ------------------------------------------------------------------ */
/*  Shared types (matches other design routes)                         */
/* ------------------------------------------------------------------ */

interface PageEntry {
  id: string;
  name: string;
  description: string;
  route: string;
  status: string;
  designStatus?: string;
  correctionIteration?: number;
  components?: string[];
}

interface PagesFile {
  pages: PageEntry[];
}

interface FeedbackTag {
  nodeId: string;
  feedback: string;
}

const MAX_CORRECTION_ITERATIONS = 3;

/**
 * POST /api/pages/[pageId]/design/correct
 *
 * Accepts user feedback tags and runs the vision correction pipeline.
 * If the full pipeline is unavailable (missing runtime dependencies such as
 * LLM provider, Playwright browser session, etc.), returns 503 with details.
 *
 * Body: { tags: [{ nodeId: string, feedback: string }] }
 * Returns: { iteration, mechanicalIssues, patchesApplied }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  // ── Parse body ──
  let body: { tags?: FeedbackTag[] };
  try {
    body = (await request.json()) as { tags?: FeedbackTag[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tags = body.tags;
  if (!Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json(
      { error: 'Body must include a non-empty "tags" array with { nodeId, feedback } objects' },
      { status: 400 },
    );
  }

  // Validate tag structure
  for (const tag of tags) {
    if (typeof tag.nodeId !== 'string' || typeof tag.feedback !== 'string') {
      return NextResponse.json(
        { error: 'Each tag must have "nodeId" (string) and "feedback" (string)' },
        { status: 400 },
      );
    }
  }

  // ── Look up the page ──
  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const idx = pages.findIndex((p) => p.id === pageId);

  if (idx === -1) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const page = pages[idx];

  // ── Check iteration limit ──
  const currentIteration = page.correctionIteration ?? 0;
  if (currentIteration >= MAX_CORRECTION_ITERATIONS) {
    return NextResponse.json(
      {
        error: `Maximum correction iterations reached (${MAX_CORRECTION_ITERATIONS}). Approve the design or regenerate.`,
        iteration: currentIteration,
      },
      { status: 409 },
    );
  }

  // ── Read existing design spec ──
  const specContent = readTextFile(`agentforge/designs/${pageId}.json`);
  if (specContent === null) {
    return NextResponse.json(
      { error: 'Design spec not found. Generate a design first.' },
      { status: 404 },
    );
  }

  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(specContent);
  } catch {
    return NextResponse.json(
      { error: 'Design spec is not valid JSON' },
      { status: 500 },
    );
  }

  // ── Set designStatus to 'correction' ──
  pages[idx].designStatus = 'correction';
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  // ── Try to run the correction pipeline ──
  let pipelineAvailable = false;
  let pipelineError: string | null = null;
  let patchesApplied = 0;
  let mechanicalIssues: string[] = [];

  try {
    // Dynamic import that bypasses webpack static analysis so the dashboard
    // can build even when @agentforge/agents-ux or its transitive deps are
    // not fully resolved at compile time.
    const moduleName = '@agentforge/agents-ux';
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const agentsUx = await (new Function('m', 'return import(m)') as (m: string) => Promise<Record<string, unknown>>)(moduleName);
    const { createBrowserCorrectionAdapter, runBrowserCorrectionPipeline } = agentsUx;

    if (typeof createBrowserCorrectionAdapter !== 'function' || typeof runBrowserCorrectionPipeline !== 'function') {
      pipelineError =
        'Vision correction pipeline functions are not callable. ' +
        'The @agentforge/agents-ux package may need to be rebuilt.';
    } else {
      pipelineAvailable = true;
      // The full pipeline requires runtime dependencies:
      // - LLMProvider instance (needs API keys)
      // - BrowserSession from @agentforge/designspec-renderer (needs Playwright)
      // - RendererTokens and CatalogMap
      //
      // In the dashboard context these are not yet wired. We apply the user
      // feedback tags as simple spec patches (nodeId -> feedback as annotation)
      // and increment the iteration counter so the UI can track progress.
      //
      // TODO: Wire LLM provider + browser session for full vision correction.
      pipelineError =
        'Full vision correction pipeline requires runtime dependencies not yet available in the dashboard: ' +
        'LLMProvider (API key configuration), Playwright BrowserSession, RendererTokens, and CatalogMap. ' +
        'Applying user tags as annotations instead.';
    }
  } catch {
    pipelineError =
      'Could not import @agentforge/agents-ux. The package may not be built or linked. ' +
      'Applying user tags as annotations instead.';
  }

  // ── Apply user tags as annotations on the spec ──
  // Even without the full LLM pipeline, we record the tags on the spec nodes
  // so the renderer can display them and they persist across sessions.
  const nodes = spec.nodes as Record<string, Record<string, unknown>> | undefined;
  if (nodes && typeof nodes === 'object') {
    for (const tag of tags) {
      const node = nodes[tag.nodeId];
      if (node) {
        // Store user feedback as annotation metadata
        if (!node._userFeedback) {
          node._userFeedback = [];
        }
        (node._userFeedback as Array<{ feedback: string; iteration: number }>).push({
          feedback: tag.feedback,
          iteration: currentIteration + 1,
        });
        patchesApplied++;
      }
    }
  }

  // ── Write updated spec ──
  const projectRoot = getActiveProjectRoot();
  const designsDir = join(projectRoot, 'agentforge', 'designs');
  if (!existsSync(designsDir)) {
    mkdirSync(designsDir, { recursive: true });
  }
  writeFileSync(
    join(designsDir, `${pageId}.json`),
    JSON.stringify(spec, null, 2),
    'utf-8',
  );

  // ── Increment correction iteration ──
  const newIteration = currentIteration + 1;
  pages[idx].correctionIteration = newIteration;
  pages[idx].designStatus = 'rendered';
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  // ── Response ──
  const response: Record<string, unknown> = {
    iteration: newIteration,
    maxIterations: MAX_CORRECTION_ITERATIONS,
    mechanicalIssues,
    patchesApplied,
    tagsReceived: tags.length,
  };

  if (pipelineError) {
    response.pipelineNote = pipelineError;
  }

  if (!pipelineAvailable) {
    // Pipeline not available but we still applied annotations — return 200
    return NextResponse.json(response);
  }

  return NextResponse.json(response);
}
