import { NextRequest, NextResponse } from 'next/server';
import { readYamlFile, writeYamlFile } from '../_lib/project-reader';

interface NavigationTarget {
  target: string;
  trigger: string;
  source_node?: string;
  mode?: 'navigate' | 'overlay';
}

interface PageSpec {
  id: string;
  name: string;
  screen_type?: 'page' | 'modal' | 'drawer' | 'sheet';
  navigates_to?: NavigationTarget[];
  [key: string]: unknown;
}

interface PagesFile {
  version: string;
  pages: PageSpec[];
}

/**
 * GET /api/navigation
 * Returns navigation targets for all pages from pages.yaml.
 */
export async function GET() {
  const spec = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  if (!spec) {
    return NextResponse.json({ error: 'pages.yaml not found' }, { status: 404 });
  }

  const navigation = spec.pages.map(p => ({
    pageId: p.id,
    pageName: p.name,
    screen_type: p.screen_type ?? 'page',
    navigates_to: p.navigates_to ?? [],
  }));

  return NextResponse.json({ navigation });
}

/**
 * PUT /api/navigation
 * Updates navigates_to for a specific page in pages.yaml.
 * Body: { pageId: string, navigates_to: { target: string, trigger: string }[] }
 */
export async function PUT(request: NextRequest) {
  let body: { pageId?: string; navigates_to?: NavigationTarget[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { pageId, navigates_to } = body;
  if (!pageId || !Array.isArray(navigates_to)) {
    return NextResponse.json({ error: 'pageId and navigates_to array required' }, { status: 400 });
  }

  const spec = readYamlFile<PagesFile>('agentforge/spec/pages.yaml');
  if (!spec) {
    return NextResponse.json({ error: 'pages.yaml not found' }, { status: 404 });
  }

  const validIds = new Set(spec.pages.map(p => p.id));
  if (!validIds.has(pageId)) {
    return NextResponse.json({ error: `Page '${pageId}' not found` }, { status: 404 });
  }

  const invalidTargets = navigates_to.filter(n => !validIds.has(n.target));
  if (invalidTargets.length > 0) {
    return NextResponse.json(
      { error: `Invalid target page IDs: ${invalidTargets.map(n => n.target).join(', ')}` },
      { status: 400 },
    );
  }

  const updatedPages = spec.pages.map(p =>
    p.id === pageId
      ? { ...p, navigates_to: navigates_to.length > 0 ? navigates_to : undefined }
      : p,
  );

  writeYamlFile('agentforge/spec/pages.yaml', { ...spec, pages: updatedPages });

  return NextResponse.json({ ok: true, pageId, count: navigates_to.length });
}
