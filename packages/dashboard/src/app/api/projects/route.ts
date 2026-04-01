import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import { discoverProjects, MONOREPO_ROOT, writePrefs } from '../_lib/project-reader';
import {
  buildDesignTokensSpec,
  buildBrandSpec,
  generateTailwindConfig,
  generateGlobalCss,
  optionToTokens,
  optionToBrand,
  type DesignArchetype,
  type DesignOption,
} from '@agentforge/cli';

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  description: string;
}

/** GET /api/projects — list all discovered AgentForge projects */
export async function GET() {
  try {
    const projects = discoverProjects();
    const result: ProjectInfo[] = [];

    for (const proj of projects) {
      const yamlPath = join(proj.path, 'agentforge.yaml');
      try {
        const content = readFileSync(yamlPath, 'utf-8');
        const config = parse(content) as { project?: { name?: string; description?: string } };
        result.push({
          id: proj.dirName,
          name: config?.project?.name ?? proj.dirName,
          path: proj.path,
          description: config?.project?.description ?? '',
        });
      } catch {
        result.push({
          id: proj.dirName,
          name: proj.dirName,
          path: proj.path,
          description: '',
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST /api/projects — create a new project with full design system setup */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      prdContent,
      designArchetype,
      designOption,
      designSource,
      targetAudience,
      componentLibrary,
      colorScheme,
    } = body as {
      name: string;
      description?: string;
      prdContent?: string;
      designArchetype?: DesignArchetype;
      designOption?: DesignOption;
      designSource?: 'llm' | 'fallback';
      targetAudience?: string;
      componentLibrary?: string;
      colorScheme?: string;
    };

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Slugify the name for directory
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const projectDir = join(MONOREPO_ROOT, slug);

    if (existsSync(projectDir)) {
      return NextResponse.json({ error: `Project directory "${slug}" already exists` }, { status: 409 });
    }

    // Create project directories
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(projectDir, 'agentforge', 'spec'), { recursive: true });
    mkdirSync(join(projectDir, 'agentforge', 'designs'), { recursive: true });
    mkdirSync(join(projectDir, 'docs'), { recursive: true });

    // Write agentforge.yaml
    const projectConfig = {
      version: '1.0',
      project: {
        name,
        description: description ?? '',
        platforms: ['web'],
      },
      stack: {
        frontend: 'react',
        backend: 'node',
        database: 'postgresql',
        styling: 'tailwind',
      },
      budget: {
        per_task_max_usd: 2.0,
        per_phase_max_usd: 25.0,
        monthly_max_usd: 200.0,
      },
    };
    writeFileSync(join(projectDir, 'agentforge.yaml'), stringify(projectConfig));

    // Write pages.yaml
    const pagesConfig = { version: '1.0', pages: [] };
    writeFileSync(join(projectDir, 'agentforge', 'spec', 'pages.yaml'), stringify(pagesConfig));

    // Generate design system from DesignOption or archetype
    const audience = targetAudience ?? 'general users';
    // Create a minimal writable stream for optionToTokens/optionToBrand (they log debug info)
    const nullStream = new (require('stream').Writable)({ write(_: unknown, __: unknown, cb: () => void) { cb(); } });

    let designTokens;
    let brandSpec;

    if (designOption) {
      // Use full DesignOption from the design preview flow
      designTokens = optionToTokens(designOption, nullStream);
      brandSpec = optionToBrand(designOption, audience, nullStream);
    } else {
      // Use archetype-based generation
      const archetype: DesignArchetype = designArchetype ?? 'professional';
      designTokens = buildDesignTokensSpec(archetype);
      brandSpec = buildBrandSpec(archetype, audience);
    }

    writeFileSync(
      join(projectDir, 'agentforge', 'spec', 'design-tokens.yaml'),
      stringify(designTokens),
    );

    writeFileSync(
      join(projectDir, 'agentforge', 'spec', 'brand.yaml'),
      stringify(brandSpec),
    );

    // Generate Tailwind config and CSS
    const tailwindConfig = generateTailwindConfig(designTokens);
    writeFileSync(join(projectDir, 'tailwind.config.ts'), tailwindConfig);

    const globalCss = generateGlobalCss(designTokens);
    mkdirSync(join(projectDir, 'src', 'styles'), { recursive: true });
    writeFileSync(join(projectDir, 'src', 'styles', 'globals.css'), globalCss);

    // Write PRD if provided
    if (prdContent?.trim()) {
      writeFileSync(join(projectDir, 'docs', 'prd.md'), prdContent);
    }

    // Set as active project
    writePrefs({ activeProject: projectDir });

    return NextResponse.json({ projectId: slug, path: projectDir }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
