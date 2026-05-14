import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { Writable } from 'stream';
import { z } from 'zod';
import { MONOREPO_ROOT, writePrefs } from './project-reader';
import {
  getComponentLibraryById,
  optionToTokens,
  optionToBrand,
  type ComponentLibraryId,
  type DesignOption,
} from '@agentforge/cli';
import {
  buildDesignTokensSpec,
  buildBrandSpec,
  createRealFs,
  saveComponentLibrary,
  scaffoldProject,
  writeYaml,
  renderPrdToMarkdown,
  EnrichedRequirementSchema,
  type DesignArchetype,
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
  clarifierOutput: z.object({
    enrichedRequirement: EnrichedRequirementSchema,
    threadId: z.string(),
  }).optional(),
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
    prdContent: explicitPrdContent,
    designArchetype,
    designOption,
    targetAudience,
    componentLibrary,
    clarifierOutput,
  } = input;

  const prdContent = clarifierOutput
    ? renderPrdToMarkdown(clarifierOutput.enrichedRequirement.prd)
    : explicitPrdContent;

  const slug = slugify(name);
  const appsDir = join(MONOREPO_ROOT, 'apps');
  if (!existsSync(appsDir)) {
    mkdirSync(appsDir, { recursive: true });
  }
  const projectDir = join(appsDir, slug);

  if (existsSync(projectDir)) {
    throw new ProjectCreationError(`Project directory "${slug}" already exists`, 409);
  }

  let directoryCreated = false;

  try {
    mkdirSync(projectDir, { recursive: true });
    directoryCreated = true;

    // Resolve design system
    const audience = targetAudience ?? 'general users';
    let designTokens;
    let brandSpec;

    if (designOption) {
      const option = designOption as unknown as DesignOption;
      designTokens = optionToTokens(option, NULL_STREAM);
      brandSpec = optionToBrand(option, audience, NULL_STREAM);
    } else {
      const archetype: DesignArchetype = designArchetype ?? 'professional';
      designTokens = buildDesignTokensSpec(archetype);
      brandSpec = buildBrandSpec(archetype, audience);
    }

    // Resolve component library (dashboard-specific: needs CLI's preset data)
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

    // Shared scaffold: dirs, agentforge.yaml, spec files, tokens, brand, tailwind, catalog, PRD
    const projectConfig: Record<string, unknown> = {
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

    if (clarifierOutput) {
      projectConfig.clarifier = {
        threadId: clarifierOutput.threadId,
        lastRunAt: new Date().toISOString(),
      };
    }

    const scaffoldResult = scaffoldProject(
      {
        name,
        description: description ?? undefined,
        projectConfig,
        designTokens,
        brandSpec,
        componentLibraryId: selectedLibrary.id,
        baseCatalog: loadDashboardBaseCatalog(),
        prdContent,
      },
      projectDir,
      realFs,
    );

    if (!scaffoldResult.ok) {
      throw new ProjectCreationError(scaffoldResult.error.message, 500);
    }

    if (clarifierOutput) {
      const specDir = join(projectDir, 'agentforge', 'spec');
      const erResult = writeYaml(
        join(specDir, 'enriched-requirement.yaml'),
        clarifierOutput.enrichedRequirement,
        realFs,
      );
      if (!erResult.ok) {
        throw new ProjectCreationError(erResult.error.message, 500);
      }

      const alResult = writeYaml(
        join(specDir, 'assumption-ledger.yaml'),
        clarifierOutput.enrichedRequirement.assumptionLedger,
        realFs,
      );
      if (!alResult.ok) {
        throw new ProjectCreationError(alResult.error.message, 500);
      }

      const screens = clarifierOutput.enrichedRequirement.prd.screens;
      if (screens.length > 0) {
        const toKebab = (s: string): string =>
          s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 40).replace(/-$/, '');

        const pagesFromScreens = {
          version: '1.0',
          pages: screens.map((s: { id: string; name: string; description: string; screenType?: string }) => ({
            id: toKebab(s.name),
            name: s.name,
            description: s.description,
            route: `/${toKebab(s.name)}`,
            status: 'approved',
            screen_type: s.screenType ?? 'page',
            components: [],
            viewports: [1440],
          })),
        };
        const pagesResult = writeYaml(
          join(specDir, 'pages.yaml'),
          pagesFromScreens,
          realFs,
        );
        if (!pagesResult.ok) {
          throw new ProjectCreationError(pagesResult.error.message, 500);
        }
      }
    }

    // Dashboard-specific: set as active project
    writePrefs({ activeProject: projectDir });

    return { projectId: slug, path: projectDir };
  } catch (err) {
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
