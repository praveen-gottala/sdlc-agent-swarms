import { NextRequest, NextResponse } from 'next/server';
import { readYamlFile, writeYamlFile, fileExists } from '../../_lib/project-reader';
import { getActiveRun } from '../../_lib/run-manager';

export const dynamic = 'force-dynamic';

interface PageEntry {
  id: string;
  name: string;
  description: string;
  route: string;
  status: string;
  designStatus?: string;
  components?: string[];
}

interface PagesFile {
  pages: PageEntry[];
}

/**
 * If a page claims "generating" but no pipeline run is active, recover:
 * - If a design spec exists on disk, it means the pipeline finished but
 *   the status update was lost (server restart, crash). Set to "rendered".
 * - Otherwise revert to "draft" — the pipeline was interrupted before output.
 * Writes the fix back to pages.yaml so it only runs once.
 */
function recoverStuckGenerating(pages: PageEntry[], idx: number): void {
  const page = pages[idx];
  const specPath = `agentforge/designs/${page.id}.json`;

  if (fileExists(specPath)) {
    pages[idx].designStatus = 'rendered';
  } else {
    pages[idx].designStatus = 'draft';
  }

  writeYamlFile('agentforge/spec/pages.yaml', { pages });
}

/**
 * GET /api/pages/[pageId]
 * Returns a single page by ID from pages.yaml.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const idx = pages.findIndex((p) => p.id === pageId);

  if (idx === -1) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  const page = pages[idx];

  // Auto-recover orphaned "generating" status, or surface the active runId
  let activeRunId: string | null = null;
  if (page.designStatus === 'generating') {
    const activeRun = getActiveRun();
    const runBelongsToThisPage =
      activeRun && (activeRun.params as Record<string, unknown>)?.pageId === pageId;
    if (runBelongsToThisPage) {
      activeRunId = activeRun!.runId;
    } else {
      recoverStuckGenerating(pages, idx);
    }
  }

  return NextResponse.json({
    id: page.id,
    name: page.name ?? '',
    description: page.description ?? '',
    route: page.route ?? '',
    status: page.status ?? 'draft',
    designStatus: page.designStatus ?? 'draft',
    components: page.components ?? [],
    ...(activeRunId ? { activeRunId } : {}),
  });
}

/**
 * PATCH /api/pages/[pageId]
 * Accepts partial updates (description, components, designStatus) and writes back to pages.yaml.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  let body: Partial<Pick<PageEntry, 'description' | 'components' | 'designStatus'>>;
  try {
    body = (await request.json()) as Partial<Pick<PageEntry, 'description' | 'components' | 'designStatus'>>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];
  const idx = pages.findIndex((p) => p.id === pageId);

  if (idx === -1) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Apply allowed updates
  if (body.description !== undefined) pages[idx].description = body.description;
  if (body.components !== undefined) pages[idx].components = body.components;
  if (body.designStatus !== undefined) pages[idx].designStatus = body.designStatus;

  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  return NextResponse.json(pages[idx]);
}
