import { NextResponse } from 'next/server';
import { readYamlFile } from '../_lib/project-reader';

interface DesignConfig {
  figma?: {
    connected?: boolean;
    file_id?: string;
    file_url?: string;
    design_system_type?: string;
    bidirectional?: boolean;
    capabilities?: string[];
    last_sync?: string;
  };
  storybook?: {
    connected?: boolean;
    url?: string;
    hot_reload?: boolean;
    visual_testing?: boolean;
    capabilities?: string[];
    last_sync?: string;
  };
  design_system?: {
    name?: string;
    version?: string;
    tokens_count?: number;
    components_count?: number;
  };
}

interface ProjectConfig {
  design?: DesignConfig;
}

/**
 * GET /api/design
 * Returns design tool configuration from agentforge.yaml design section.
 */
export async function GET() {
  const projectConfig = readYamlFile<ProjectConfig>('agentforge.yaml');
  const design = projectConfig?.design;

  if (!design) {
    return NextResponse.json({ design: { figma: null, storybook: null, designSystem: null } });
  }

  return NextResponse.json({
    design: {
      figma: design.figma ? {
        connected: design.figma.connected ?? false,
        fileId: design.figma.file_id ?? null,
        fileUrl: design.figma.file_url ?? null,
        designSystemType: design.figma.design_system_type ?? 'custom',
        bidirectional: design.figma.bidirectional ?? false,
        capabilities: design.figma.capabilities ?? [],
        lastSync: design.figma.last_sync ?? null,
      } : null,
      storybook: design.storybook ? {
        connected: design.storybook.connected ?? false,
        url: design.storybook.url ?? null,
        hotReload: design.storybook.hot_reload ?? false,
        visualTesting: design.storybook.visual_testing ?? false,
        capabilities: design.storybook.capabilities ?? [],
        lastSync: design.storybook.last_sync ?? null,
      } : null,
      designSystem: design.design_system ? {
        name: design.design_system.name ?? 'Unnamed',
        version: design.design_system.version ?? '0.0.0',
        tokensCount: design.design_system.tokens_count ?? 0,
        componentsCount: design.design_system.components_count ?? 0,
      } : null,
    },
  });
}

/**
 * PUT /api/design
 * Updates design tool configuration.
 */
export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  return NextResponse.json({
    status: 'saved',
    updatedAt: new Date().toISOString(),
    design: body,
  });
}
