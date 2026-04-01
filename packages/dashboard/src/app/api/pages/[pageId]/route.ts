import { NextRequest, NextResponse } from 'next/server';
import { readYamlFile, writeYamlFile } from '../../_lib/project-reader';

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
  const page = pages.find((p) => p.id === pageId);

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: page.id,
    name: page.name ?? '',
    description: page.description ?? '',
    route: page.route ?? '',
    status: page.status ?? 'draft',
    designStatus: page.designStatus ?? 'draft',
    components: page.components ?? [],
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
