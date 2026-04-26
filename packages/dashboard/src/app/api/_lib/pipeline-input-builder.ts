/**
 * @module pipeline-input-builder
 *
 * Builds a PipelineInput from dashboard request context. Reads project files
 * (pages.yaml, design-tokens, brand, catalog, PRD) and constructs the input
 * that runDesignPipeline expects.
 */

import type { AgentContext, DesignTokensSpec, DesignConfig, PageContext, PageEntry } from '@agentforge/core';
import { resolveViewports } from '@agentforge/core';
import type { PipelineInput, PipelineTelemetrySink } from '@agentforge/agents-ux';
import { buildComponentCatalogPrompt, buildPageContext, resolvePageEntry } from '@agentforge/agents-ux';
import type { RendererTokens, CatalogMap, RawCatalogSpec } from '@agentforge/designspec-renderer';
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';
import { readYamlFile, readTextFile, getActiveProjectRoot } from './project-reader';

interface RawPageEntry {
  id: string;
  name: string;
  description: string;
  route: string;
  status: string;
  components?: string[];
  viewports?: number[];
  screen_type?: string;
  navigates_to?: Array<{ target: string; trigger: string; source_node?: string }>;
}

interface RawPagesFile {
  pages: RawPageEntry[];
}

interface BuildInputOptions {
  readonly resume?: boolean;
}

function toRendererTokens(spec: DesignTokensSpec): RendererTokens {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (key !== 'version' && key !== 'created_by') {
      result[key] = value;
    }
  }
  return result as RendererTokens;
}

function toPageEntry(raw: RawPageEntry): PageEntry {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    route: raw.route,
    status: raw.status,
    components: raw.components ?? [],
    viewports: raw.viewports,
    screen_type: raw.screen_type as PageEntry['screen_type'],
    navigates_to: raw.navigates_to?.map(n => ({
      target: n.target,
      trigger: n.trigger,
      source_node: n.source_node,
    })),
  };
}

/**
 * Build a PipelineInput for the dashboard's design pipeline route.
 *
 * Reads project files from disk and constructs the full input object.
 * Returns null if the page is not found in pages.yaml.
 */
export function buildDashboardPipelineInput(
  pageId: string,
  taskId: string,
  telemetry: PipelineTelemetrySink,
  agentContext: AgentContext,
  opts?: BuildInputOptions,
): PipelineInput | null {
  const projectRoot = getActiveProjectRoot();

  const pagesFile = readYamlFile<RawPagesFile>('agentforge/spec/pages.yaml');
  const rawPages = pagesFile?.pages ?? [];
  const rawPage = rawPages.find((p) => p.id === pageId);
  if (!rawPage) return null;

  const pages = rawPages.map(toPageEntry);
  const description = rawPage.description || rawPage.name || pageId;

  const designTokens = readYamlFile<DesignTokensSpec>('agentforge/spec/design-tokens.yaml');
  const componentCatalog = readYamlFile<RawCatalogSpec>('agentforge/spec/component-catalog.yaml');
  const prdContent = readTextFile('docs/prd.md');
  const designConfig = readYamlFile<DesignConfig>('agentforge/spec/design-config.yaml') ?? undefined;

  const prdRequirements: string[] = [description];
  if (prdContent) prdRequirements.push(prdContent);

  const viewportWidth = resolveViewports({
    screenType: rawPage.screen_type as PageEntry['screen_type'],
    pageViewports: rawPage.viewports,
    designConfig,
  })[0];

  let rendererTokens: Record<string, unknown> | undefined;
  let catalogMap: CatalogMap | undefined;

  if (designTokens) {
    const rt = toRendererTokens(designTokens);
    rendererTokens = rt as Record<string, unknown>;
    catalogMap = loadCatalogForRenderer(componentCatalog ?? undefined, rt);
  }

  const componentCatalogPrompt = buildComponentCatalogPrompt(componentCatalog ?? undefined);

  const pageEntry = resolvePageEntry(pageId, pages);
  const pageContext: PageContext | undefined = pageEntry
    ? buildPageContext(pageEntry, pages)
    : undefined;

  return {
    moduleId: pageId,
    taskId,
    projectRoot,
    designTool: 'browser',
    providerString: 'claude',
    resume: opts?.resume ?? true,
    telemetry,
    agentContext,
    prdRequirements,
    pageContext,
    designTokensSpec: designTokens ?? undefined,
    designConfig,
    description,
    viewportWidth,
    rendererTokens,
    catalogMap,
    componentCatalogPrompt,
  };
}
