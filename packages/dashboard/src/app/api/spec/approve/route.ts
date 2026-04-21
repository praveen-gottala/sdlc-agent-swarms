import { NextRequest, NextResponse } from 'next/server';
import { readYamlFile, writeYamlFile } from '../../_lib/project-reader';

interface ProjectManifestFile {
  project?: {
    name?: string;
    description?: string;
  };
}

interface ProjectSpecFile {
  version: string;
  app: {
    name: string;
    description: string;
  };
  adrs: unknown[];
}

function buildProjectSpecFile(): ProjectSpecFile {
  const manifest = readYamlFile<ProjectManifestFile>('agentforge.yaml');
  const existingProjectSpec = readYamlFile<Partial<ProjectSpecFile>>('agentforge/spec/project.yaml');

  return {
    version: '1.0',
    app: {
      name: manifest?.project?.name ?? 'Untitled Project',
      description: manifest?.project?.description ?? '',
    },
    adrs: Array.isArray(existingProjectSpec?.adrs) ? existingProjectSpec.adrs : [],
  };
}

/**
 * POST /api/spec/approve
 * Accepts the generated spec and writes project.yaml, pages.yaml, models.yaml, api.yaml.
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
    writeYamlFile('agentforge/spec/project.yaml', buildProjectSpecFile());
    written.push('project.yaml');

    if (pages) {
      // Add required fields for pages.yaml format
      const validScreenTypes = new Set(['page', 'modal', 'drawer', 'sheet']);
      const pagesWithDefaults = (pages as Array<Record<string, unknown>>).map((p) => {
        const screenType = typeof p.screen_type === 'string' && validScreenTypes.has(p.screen_type)
          ? p.screen_type
          : 'page';
        const entry: Record<string, unknown> = {
          id: p.id ?? p.name?.toString().toLowerCase().replace(/\s+/g, '-'),
          name: p.name,
          route: p.route ?? `/${p.name?.toString().toLowerCase().replace(/\s+/g, '-')}`,
          description: p.description ?? '',
          status: 'draft',
          designStatus: 'draft',
          components: p.components ?? [],
          dataSources: p.dataSources ?? [],
          screen_type: screenType,
        };
        if (Array.isArray(p.navigates_to) && p.navigates_to.length > 0) {
          entry.navigates_to = p.navigates_to;
        }
        return entry;
      });
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
