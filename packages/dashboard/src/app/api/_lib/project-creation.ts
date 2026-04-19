import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import { Writable } from 'stream';
import { z } from 'zod';
import { MONOREPO_ROOT, writePrefs } from './project-reader';
import {
  buildDesignTokensSpec,
  buildBrandSpec,
  getComponentLibraryById,
  generateTailwindConfig,
  generateGlobalCss,
  optionToTokens,
  optionToBrand,
  type DesignArchetype,
  type ComponentLibraryId,
  type DesignOption,
} from '@agentforge/cli';
import {
  createRealFs,
  generateProjectCatalog,
  saveComponentCatalog,
  saveComponentLibrary,
  type ComponentCatalogSpec,
} from '@agentforge/core';

// ─── Validation ─────────────────────────────────────────

const VALID_COMPONENT_LIBRARIES = ['mui', 'shadcn', 'chakra', 'antd', 'radix', 'mantine', 'custom', 'material'] as const;

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100, 'name must be 100 characters or fewer'),
  description: z.string().max(500).optional(),
  prdContent: z.string().optional(),
  designArchetype: z.enum(['warm', 'professional', 'bold']).optional(),
  designOption: z.object({
    label: z.string(),
    vibe: z.string(),
    colors: z.object({
      primitive: z.record(z.string()),
      semantic: z.record(z.string()),
    }),
    fonts: z.object({ display: z.string(), body: z.string() }),
    brand: z.object({
      tone: z.string(),
      illustrationDirection: z.string(),
      illustrationDescription: z.string(),
      motionFeel: z.string(),
    }),
    elevation: z.object({
      levels: z.array(z.object({
        level: z.number(),
        shadow: z.string(),
        description: z.string(),
      })),
    }).optional(),
  }).optional(),
  designSource: z.enum(['llm', 'fallback']).optional(),
  targetAudience: z.string().max(200).optional(),
  componentLibrary: z.enum(VALID_COMPONENT_LIBRARIES).optional(),
  colorScheme: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export interface CreateProjectResult {
  projectId: string;
  path: string;
}

// ─── Helpers ────────────────────────────────────────────

const NULL_STREAM = new Writable({ write(_: unknown, __: unknown, cb: () => void) { cb(); } });

export function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) {
    throw new ProjectCreationError('Project name must contain at least one alphanumeric character', 400);
  }
  return slug;
}

function resolveComponentLibraryId(input?: string): ComponentLibraryId {
  switch (input) {
    case 'material':
      return 'mui';
    case 'mui':
    case 'chakra':
    case 'antd':
    case 'radix':
    case 'mantine':
    case 'shadcn':
      return input;
    case 'custom':
    default:
      return 'shadcn';
  }
}

function loadDashboardBaseCatalog(): ComponentCatalogSpec {
  const catalogPath = join(
    MONOREPO_ROOT,
    'packages',
    'core',
    'src',
    'catalogs',
    'base-component-catalog.yaml',
  );
  return parse(readFileSync(catalogPath, 'utf-8')) as ComponentCatalogSpec;
}

// ─── Error Type ─────────────────────────────────────────

export class ProjectCreationError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'ProjectCreationError';
  }
}

// ─── Service ────────────────────────────────────────────

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  const {
    name,
    description,
    prdContent,
    designArchetype,
    designOption,
    targetAudience,
    componentLibrary,
  } = input;

  const slug = slugify(name);
  const appsDir = join(MONOREPO_ROOT, 'apps');
  if (!existsSync(appsDir)) {
    mkdirSync(appsDir, { recursive: true });
  }
  const projectDir = join(appsDir, slug);

  if (existsSync(projectDir)) {
    throw new ProjectCreationError(`Project directory "${slug}" already exists`, 409);
  }

  // Track whether we created the directory so we can clean up on failure
  let directoryCreated = false;

  try {
    // Create project directories
    mkdirSync(projectDir, { recursive: true });
    directoryCreated = true;
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

    // Write pages.yaml and project.yaml
    writeFileSync(
      join(projectDir, 'agentforge', 'spec', 'pages.yaml'),
      stringify({ version: '1.0', pages: [] }),
    );
    writeFileSync(
      join(projectDir, 'agentforge', 'spec', 'project.yaml'),
      stringify({
        version: '1.0',
        app: { name, description: description ?? '' },
        adrs: [],
      }),
    );

    // Generate design system
    const audience = targetAudience ?? 'general users';
    let designTokens;
    let brandSpec;

    if (designOption) {
      // Zod validates structure at runtime; cast bridges the Zod output type
      // to the CLI's intersection type (Record<string,string> & {required keys}).
      const option = designOption as unknown as DesignOption;
      designTokens = optionToTokens(option, NULL_STREAM);
      brandSpec = optionToBrand(option, audience, NULL_STREAM);
    } else {
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

    // Component library and catalog setup
    const realFs = createRealFs();
    const componentLibraryId = resolveComponentLibraryId(componentLibrary);
    const selectedLibrary = getComponentLibraryById(componentLibraryId);

    if (!selectedLibrary) {
      throw new ProjectCreationError(`Unsupported component library: ${componentLibraryId}`, 400);
    }

    const saveLibraryResult = saveComponentLibrary(
      projectDir,
      {
        library_id: selectedLibrary.id,
        library_name: selectedLibrary.libraryName,
        install_hint: selectedLibrary.installHint,
        docs_url: selectedLibrary.docsUrl,
        react_mappings: selectedLibrary.reactMappings,
      },
      realFs,
    );

    if (!saveLibraryResult.ok) {
      throw new Error(saveLibraryResult.error.message);
    }

    const baseCatalog = loadDashboardBaseCatalog();
    const projectCatalog = generateProjectCatalog(baseCatalog, selectedLibrary.id, designTokens);
    const saveCatalogResult = saveComponentCatalog(projectDir, projectCatalog, realFs);

    if (!saveCatalogResult.ok) {
      throw new Error(saveCatalogResult.error.message);
    }

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

    return { projectId: slug, path: projectDir };
  } catch (err) {
    // Clean up partially created project directory on failure
    if (directoryCreated && existsSync(projectDir)) {
      try {
        rmSync(projectDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup — don't mask the original error
      }
    }
    throw err;
  }
}
