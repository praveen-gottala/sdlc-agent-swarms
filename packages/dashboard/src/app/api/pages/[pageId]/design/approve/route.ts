import { NextRequest, NextResponse } from 'next/server';
import { readYamlFile, writeYamlFile } from '../../../../_lib/project-reader';

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
 * POST /api/pages/[pageId]/design/approve
 * Sets the page's designStatus to 'approved'.
 */
export async function POST(
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

  pages[idx].designStatus = 'approved';
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  return NextResponse.json({
    message: 'Design approved',
    pageId,
    designStatus: 'approved',
  });
}
