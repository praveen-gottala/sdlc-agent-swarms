import { NextRequest, NextResponse } from 'next/server';
import { writeYamlFile } from '../../_lib/project-reader';

/**
 * POST /api/spec/approve
 * Accepts the generated spec and writes pages.yaml, models.yaml, api.yaml.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pages, models, endpoints } = body as {
      pages?: unknown[];
      models?: unknown[];
      endpoints?: unknown[];
    };

    if (!pages && !models && !endpoints) {
      return NextResponse.json({ error: 'At least one of pages, models, or endpoints is required' }, { status: 400 });
    }

    const written: string[] = [];

    if (pages) {
      // Add required fields for pages.yaml format
      const pagesWithDefaults = (pages as Array<Record<string, unknown>>).map((p) => ({
        id: p.id ?? p.name?.toString().toLowerCase().replace(/\s+/g, '-'),
        name: p.name,
        route: p.route ?? `/${p.name?.toString().toLowerCase().replace(/\s+/g, '-')}`,
        description: p.description ?? '',
        status: 'draft',
        designStatus: 'draft',
        components: p.components ?? [],
        dataSources: p.dataSources ?? [],
      }));
      writeYamlFile('agentforge/spec/pages.yaml', { version: '1.0', pages: pagesWithDefaults });
      written.push('pages.yaml');
    }

    if (models) {
      writeYamlFile('agentforge/spec/models.yaml', { version: '1.0', models });
      written.push('models.yaml');
    }

    if (endpoints) {
      writeYamlFile('agentforge/spec/api.yaml', { version: '1.0', endpoints });
      written.push('api.yaml');
    }

    return NextResponse.json({ success: true, written });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
