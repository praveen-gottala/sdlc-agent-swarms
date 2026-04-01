import { NextRequest, NextResponse } from 'next/server';
import { readYamlFile, writeYamlFile } from '../_lib/project-reader';

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
 * GET /api/pages
 * Returns pages array from agentforge/spec/pages.yaml in the active project.
 */
export async function GET() {
  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = (pagesFile?.pages ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? '',
    description: p.description ?? '',
    route: p.route ?? '',
    status: p.status ?? 'draft',
    designStatus: p.designStatus ?? 'draft',
    components: p.components ?? [],
  }));

  return NextResponse.json({ pages });
}

/**
 * POST /api/pages
 * Creates a new page entry in pages.yaml.
 * Body: { description: string }
 */
export async function POST(request: NextRequest) {
  let body: { description?: string };
  try {
    body = (await request.json()) as { description?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const description = body.description?.trim();
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }

  // Generate an ID from the description
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const pageId = `page-${slug}-${Date.now().toString(36)}`;

  // Derive a name from the first line / first sentence of description
  const name =
    description.split(/[.\n]/)[0].trim().slice(0, 80) || description.slice(0, 80);

  // Read existing pages
  const pagesFile = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  const pages = pagesFile?.pages ?? [];

  const newPage: PageEntry = {
    id: pageId,
    name,
    description,
    route: `/${slug}`,
    status: 'draft',
    designStatus: 'draft',
  };

  pages.push(newPage);
  writeYamlFile('agentforge/spec/pages.yaml', { pages });

  return NextResponse.json({ pageId, description }, { status: 201 });
}
