/**
 * @module design-pipeline/pipeline-input-builder
 *
 * Shared PipelineInput builder for both CLI and dashboard pipeline runs.
 * Consolidates the dashboard's buildDashboardPipelineInput() and CLI's
 * inline PipelineInput construction into a single canonical implementation
 * in @agentforge/agents-ux (D4).
 */

import { join } from 'node:path';
import type { AgentContext, DesignTokensSpec, DesignConfig, PageContext, PageEntry } from '@agentforge/core';
import { readYaml, resolveViewports } from '@agentforge/core';
import type { PipelineInput, PipelineTelemetrySink, ChromePassConfig } from './types.js';
import type { DesignTool } from '@agentforge/core';
import { buildComponentCatalogPrompt } from '../ux-design/design-system-context.js';
import { buildPageContext, resolvePageEntry } from '../page-context-prompt.js';
import type { RendererTokens, CatalogMap, RawCatalogSpec } from '@agentforge/designspec-renderer';
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';

// ── Raw YAML shapes ──

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

// ── Helpers ──

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

// ── Public API ──

/** Options for building a PipelineInput. */
export interface BuildPipelineInputOptions {
  readonly pageId: string;
  readonly taskId: string;
  readonly projectRoot: string;
  readonly telemetry?: PipelineTelemetrySink;
  readonly agentContext: AgentContext;
  readonly designTool?: DesignTool;
  readonly providerString?: string;
  readonly resume?: boolean;
  readonly stage?: PipelineInput['stage'];
  readonly chromePass?: ChromePassConfig;
  /** CLI --width override. When set, takes precedence over per-page viewports
   *  and design config breakpoints (forwarded to resolveViewports). */
  readonly cliWidth?: number;
}

/**
 * Build a PipelineInput from project files on disk.
 *
 * Reads pages.yaml, design-tokens.yaml, component-catalog.yaml, design-config.yaml,
 * and docs/prd.md from projectRoot. Returns null if the page is not found in pages.yaml.
 */
export function buildPipelineInput(opts: BuildPipelineInputOptions): PipelineInput | null {
  const { projectRoot, pageId, taskId, agentContext } = opts;
  const fs = agentContext.fs;

  // Read pages.yaml
  const pagesResult = readYaml<RawPagesFile>(
    join(projectRoot, 'agentforge/spec/pages.yaml'),
    fs,
  );
  const rawPages = pagesResult.ok ? (pagesResult.value.pages ?? []) : [];
  const rawPage = rawPages.find((p) => p.id === pageId);
  if (!rawPage) return null;

  const pages = rawPages.map(toPageEntry);
  // Short by design — rich page context (route, components, navigation) is in
  // pageContext; structured tokens in designTokensSpec. The old CLI
  // buildPageDescription() is intentionally not reproduced (see m1-execution-plan.md §Phase 1).
  const description = rawPage.description || rawPage.name || pageId;

  // Read design tokens
  const tokensResult = readYaml<DesignTokensSpec>(
    join(projectRoot, 'agentforge/spec/design-tokens.yaml'),
    fs,
  );
  const designTokens = tokensResult.ok ? tokensResult.value : undefined;

  // Read component catalog
  const catalogResult = readYaml<RawCatalogSpec>(
    join(projectRoot, 'agentforge/spec/component-catalog.yaml'),
    fs,
  );
  const componentCatalog = catalogResult.ok ? catalogResult.value : undefined;

  // Read PRD
  const prdResult = fs.readFile(join(projectRoot, 'docs/prd.md'));
  const prdContent = prdResult.ok ? prdResult.value : undefined;

  // Read design config
  const configResult = readYaml<DesignConfig>(
    join(projectRoot, 'agentforge/spec/design-config.yaml'),
    fs,
  );
  const designConfig = configResult.ok ? configResult.value : undefined;

  // Build prdRequirements
  const prdRequirements: string[] = [description];
  if (prdContent) prdRequirements.push(prdContent);

  // Resolve viewport (cliWidth takes precedence when CLI --width is set)
  const viewportWidth = resolveViewports({
    cliWidth: opts.cliWidth,
    screenType: rawPage.screen_type as PageEntry['screen_type'],
    pageViewports: rawPage.viewports,
    designConfig,
  })[0];

  // Renderer tokens + catalog map
  let rendererTokens: Record<string, unknown> | undefined;
  let catalogMap: CatalogMap | undefined;

  if (designTokens) {
    const rt = toRendererTokens(designTokens);
    rendererTokens = rt as Record<string, unknown>;
    catalogMap = loadCatalogForRenderer(componentCatalog, rt);
  }

  const componentCatalogPrompt = buildComponentCatalogPrompt(componentCatalog);

  // Page context
  const pageEntry = resolvePageEntry(pageId, pages);
  const pageContext: PageContext | undefined = pageEntry
    ? buildPageContext(pageEntry, pages)
    : undefined;

  return {
    moduleId: pageId,
    taskId,
    projectRoot,
    designTool: opts.designTool ?? 'browser',
    providerString: opts.providerString ?? 'claude',
    resume: opts.resume ?? true,
    ...(opts.stage ? { stage: opts.stage } : {}),
    telemetry: opts.telemetry,
    agentContext,
    prdRequirements,
    pageContext,
    designTokensSpec: designTokens,
    designConfig,
    description,
    viewportWidth,
    rendererTokens,
    catalogMap,
    componentCatalogPrompt,
    ...(opts.chromePass ? { chromePass: opts.chromePass } : {}),
  };
}
