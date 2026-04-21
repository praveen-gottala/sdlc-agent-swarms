/**
 * @module @agentforge/cli/commands/design-page-all
 *
 * The `agentforge design:page:all` command.
 * Reads pages from the project spec (agentforge/spec/pages.yaml)
 * and design tokens (agentforge/spec/design-tokens.yaml), then runs
 * the browser-based design pipeline for all pages in parallel.
 *
 * Stages run in parallel per page: Research → Planning → Design.
 * The V2 DesignSpec renderer is used (browser-only, no Penpot connection).
 */

import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolveCLIModel } from '../utils/resolve-cli-model.js';
import { createPipelineContext, ensureOutputDir, saveArtifact, loadArtifact } from '../utils/pipeline-context.js';
import { runParallel } from '../utils/parallel-pipeline.js';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { findProjectRoot, loadDotEnv } from '../fs-utils.js';
import {
  readYaml,
  createRealFs,
  loadDesignTokens,
  loadBrandSpec,
  loadComponentCatalog,
  loadProjectManifest,
  resolveViewports,
  Ok,
  PREVIEW_DIR_REL,
} from '@agentforge/core';
import type {
  LLMProviderRef,
  PageEntry,
  DesignConfig,
  DesignTokensSpec,
} from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import type { RendererTokens } from '@agentforge/designspec-renderer';
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';
import { requireClaudeAuth } from '../utils/require-claude-auth.js';
import {
  uxResearchWork,
  uxPlanningWork,
  penpotDesignWork,
  buildDesignSystemContextFromSpec,
  buildComponentCatalogPrompt,
  buildPrototypeManifest,
  extractNavigationFromSpecs,
  extractScreenSummary,
  analyzeNavigation,
  buildPageContext,
  resolveSharedComponents,
  designChromeComponents,
  buildSharedChromeFilePayload,
  deriveRegionsFromPageSpec,
  propagateNavigateToChromeTabs,
} from '@agentforge/agents-ux';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type {
  UXResearchInput,
  UXResearchOutput,
  UXPlanningInput,
  UXPlanningOutput,
  PenpotDesignInput,
} from '@agentforge/agents-ux';

// ============================================================================
// Types
// ============================================================================

export interface DesignPageAllOptions {
  /** Only design specific pages (comma-separated IDs). */
  readonly pages?: string;
  /** Target viewport width in pixels — overrides per-page viewports. */
  readonly width?: number;
  /** Skip research+planning, use cached artifacts. */
  readonly designOnly?: boolean;
  /** Maximum concurrent LLM calls per stage. Default: 3 */
  readonly concurrency?: number;
  /**
   * When set, use this directory as the AgentForge project root instead of
   * walking up from `process.cwd()` (used by dashboard `POST /api/design/generate-all`).
   */
  readonly projectRoot?: string;
}

/** @deprecated Use PageEntry from @agentforge/core */
type PageSpec = PageEntry;

/** Maps DesignTokensSpec to RendererTokens (drops metadata fields). */
function toRendererTokens(spec: DesignTokensSpec): RendererTokens {
  const { version, created_by, ...tokens } = spec;
  return tokens;
}

// ============================================================================
// Helpers
// ============================================================================

/** Build a rich description from page spec + design tokens for the LLM. */
function buildPageDescription(page: PageSpec, designTokens: string): string {
  const components = page.components.join(', ');
  return `${page.name} page (route: ${page.route}): ${page.description}. Components: ${components}. ${designTokens}`;
}

/** Load design tokens as a condensed string for prompts. */
function loadDesignTokensSummary(projectRoot: string): string {
  const tokensPath = join(projectRoot, 'agentforge', 'spec', 'design-tokens.yaml');
  if (!existsSync(tokensPath)) return '';

  const fs = createRealFs();
  const result = readYaml(tokensPath, fs);
  if (!result.ok) return '';

  const tokens = result.value as Record<string, unknown>;
  const colors = tokens.colors as { primitive?: Record<string, string>; semantic?: Record<string, string> } | undefined;
  const typography = tokens.typography as { font_families?: Record<string, string> } | undefined;
  const borders = tokens.borders as { radius?: Record<string, number> } | undefined;

  const parts: string[] = ['Design tokens:'];
  if (colors?.primitive) {
    const colorEntries = Object.entries(colors.primitive).map(([k, v]) => `${k}=${v}`).join(', ');
    parts.push(`Colors: ${colorEntries}.`);
  }
  if (typography?.font_families) {
    const fontEntries = Object.entries(typography.font_families).map(([k, v]) => `${k}=${v}`).join(', ');
    parts.push(`Fonts: ${fontEntries}.`);
  }
  if (borders?.radius) {
    const radiusEntries = Object.entries(borders.radius).map(([k, v]) => `${k}=${v}px`).join(', ');
    parts.push(`Border radius: ${radiusEntries}.`);
  }
  return parts.join(' ');
}

// ============================================================================
// Command
// ============================================================================

/**
 * Execute the design:page:all command.
 * Reads pages from spec, connects to Penpot, designs each page.
 */
export async function designPageAllCommand(
  output: NodeJS.WritableStream = process.stdout,
  options: DesignPageAllOptions = {},
): Promise<void> {
  // Find project root (looks for agentforge.yaml)
  let projectRoot: string;
  if (options.projectRoot) {
    const yamlPath = join(options.projectRoot, 'agentforge.yaml');
    if (!existsSync(yamlPath)) {
      output.write(
        errorMsg(`Invalid project root: no agentforge.yaml at ${options.projectRoot}\n`),
      );
      process.exitCode = 1;
      return;
    }
    projectRoot = options.projectRoot;
  } else {
    try {
      projectRoot = findProjectRoot();
    } catch {
      output.write(errorMsg('Not in an AgentForge project. Run from a directory with agentforge.yaml.\n'));
      process.exitCode = 1;
      return;
    }
  }

  // Load project manifest for design config
  const manifestFs = createRealFs();
  const manifestResult = loadProjectManifest(projectRoot, manifestFs);
  const designConfig: DesignConfig | undefined = manifestResult.ok ? manifestResult.value.design : undefined;

  // Load pages.yaml
  const pagesPath = join(projectRoot, 'agentforge', 'spec', 'pages.yaml');
  if (!existsSync(pagesPath)) {
    output.write(errorMsg(`No pages spec found at ${pagesPath}\n`));
    output.write(infoMsg('  Run "agentforge design:generate" first to generate app specs.\n'));
    process.exitCode = 1;
    return;
  }

  const fs = createRealFs();
  const pagesResult = readYaml(pagesPath, fs);
  if (!pagesResult.ok) {
    output.write(errorMsg(`Failed to read pages.yaml: ${pagesResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  const pagesData = pagesResult.value as { pages: PageSpec[] };
  let pages = pagesData.pages ?? [];

  // Filter to specific pages if requested
  if (options.pages) {
    const requestedIds = new Set(options.pages.split(',').map(s => s.trim()));
    pages = pages.filter(p => requestedIds.has(p.id));
    if (pages.length === 0) {
      output.write(errorMsg(`No matching pages found. Available: ${pagesData.pages.map(p => p.id).join(', ')}\n`));
      process.exitCode = 1;
      return;
    }
  }

  // Load design tokens (summary for page descriptions)
  const designTokens = loadDesignTokensSummary(projectRoot);

  // Load structured design tokens for prompt injection
  const realFs = createRealFs();
  const structuredTokensResult = loadDesignTokens(projectRoot, realFs);
  const brandSpecResult = loadBrandSpec(projectRoot, realFs);
  const catalogResult = loadComponentCatalog(projectRoot, realFs);
  const componentCatalog = catalogResult.ok ? catalogResult.value : undefined;
  const componentCatalogPromptStr = buildComponentCatalogPrompt(componentCatalog);

  // Load .env file so ANTHROPIC_API_KEY is available (project-local first)
  loadDotEnv(projectRoot);

  // Validate Claude auth (API key or Vertex AI)
  const providerConfig = requireClaudeAuth(output);
  if (!providerConfig) {
    process.exitCode = 1;
    return;
  }

  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg('  AgentForge — Design All Screens\n'));
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  Project: ${projectRoot}\n`));
  output.write(infoMsg(`  Screens: ${pages.map(p => p.id).join(', ')}\n`));
  output.write(infoMsg(`  Total: ${pages.length} pages\n`));
  if (designTokens) {
    output.write(infoMsg(`  ${designTokens.slice(0, 80)}...\n`));
  }
  output.write(infoMsg('='.repeat(60) + '\n\n'));

  // ── V2 renderer setup (browser-only, no Penpot connection) ──

  const structuredTokens = structuredTokensResult.ok ? structuredTokensResult.value : undefined;
  if (!structuredTokens) {
    output.write(errorMsg('Design tokens required. Run `agentforge init` first.\n'));
    process.exitCode = 1;
    return;
  }
  const rendererTokens = toRendererTokens(structuredTokens);
  const catalogMapV2 = loadCatalogForRenderer(
    componentCatalog as import('@agentforge/designspec-renderer').RawCatalogSpec | undefined,
    rendererTokens,
  );
  output.write(infoMsg(`  Renderer: V2 browser-only (${Object.keys(catalogMapV2).length} catalog entries)\n`));

  const concurrency = options.concurrency ?? 3;
  output.write(infoMsg(`  Concurrency: ${concurrency}\n\n`));

  // ── Stage 1: Research all pages in parallel ──

  output.write(infoMsg('  Stage 1/4: Research\n'));

  const researchResults = await runParallel<PageSpec, UXResearchOutput>(
    pages,
    async (page, i) => {
      const moduleId = `bookshelf-${page.id}`;
      const outputDir = ensureOutputDir(moduleId);

      if (options.designOnly) {
        const cached = loadArtifact<UXResearchOutput>(outputDir, 'research-brief.json');
        if (cached) return Ok(cached);
      }

      const taskId = `task_research_${page.id}_${Date.now()}`;
      const provider = createClaudeProvider(resolveCLIModel(), providerConfig);
      const context = createPipelineContext(taskId);
      const description = buildPageDescription(page, designTokens);
      const input: UXResearchInput = { moduleId, taskId, prdRequirements: [description] };
      const result = await uxResearchWork(input, provider as unknown as LLMProviderRef, [], context);
      if (result.ok) saveArtifact(outputDir, 'research-brief.json', result.value);
      return result;
    },
    {
      concurrency,
      onStart: (i) => output.write(infoMsg(`    [${i + 1}/${pages.length}] ${pages[i].name} — researching...\n`)),
      onComplete: (i, _total, ok, ms) => output.write(
        ok ? successMsg(`    [${i + 1}/${pages.length}] ${pages[i].name} — research done (${(ms / 1000).toFixed(1)}s)\n`)
           : errorMsg(`    [${i + 1}/${pages.length}] ${pages[i].name} — research failed\n`),
      ),
    },
  );

  // Check all research succeeded
  const researchMap = new Map<string, UXResearchOutput>();
  for (let i = 0; i < pages.length; i++) {
    const r = researchResults[i];
    if (r.result.ok) {
      researchMap.set(pages[i].id, r.result.value);
    } else {
      output.write(errorMsg(`  Research failed for ${pages[i].id}: ${r.result.error.message}\n`));
    }
  }

  const researchedPages = pages.filter(p => researchMap.has(p.id));
  if (researchedPages.length === 0) {
    output.write(errorMsg('  All research stages failed. Aborting.\n'));
    process.exitCode = 1;
    return;
  }

  // ── Stage 2: Planning all pages in parallel ──

  output.write(infoMsg('\n  Stage 2/4: Planning\n'));

  const planningResults = await runParallel<PageSpec, UXPlanningOutput>(
    researchedPages,
    async (page) => {
      const moduleId = `bookshelf-${page.id}`;
      const outputDir = ensureOutputDir(moduleId);

      if (options.designOnly) {
        const cached = loadArtifact<UXPlanningOutput>(outputDir, 'planning-spec.json');
        if (cached) return Ok(cached);
      }

      const researchOutput = researchMap.get(page.id)!;
      const taskId = `task_planning_${page.id}_${Date.now()}`;
      const provider = createClaudeProvider(resolveCLIModel(), providerConfig);
      const context = createPipelineContext(taskId);
      const input: UXPlanningInput = {
        briefId: researchOutput.briefId, moduleId, taskId, designBrief: researchOutput,
        ...(designConfig ? { designConfig } : {}),
      };
      const result = await uxPlanningWork(input, provider as unknown as LLMProviderRef, [], context);
      if (result.ok) saveArtifact(outputDir, 'planning-spec.json', result.value);
      return result;
    },
    {
      concurrency,
      onStart: (i) => output.write(infoMsg(`    [${i + 1}/${researchedPages.length}] ${researchedPages[i].name} — planning...\n`)),
      onComplete: (i, _total, ok, ms) => output.write(
        ok ? successMsg(`    [${i + 1}/${researchedPages.length}] ${researchedPages[i].name} — planning done (${(ms / 1000).toFixed(1)}s)\n`)
           : errorMsg(`    [${i + 1}/${researchedPages.length}] ${researchedPages[i].name} — planning failed\n`),
      ),
    },
  );

  // Collect planning outputs
  const planningMap = new Map<string, UXPlanningOutput>();
  for (let i = 0; i < researchedPages.length; i++) {
    const r = planningResults[i];
    if (r.result.ok) {
      planningMap.set(researchedPages[i].id, r.result.value);
    } else {
      output.write(errorMsg(`  Planning failed for ${researchedPages[i].id}: ${r.result.error.message}\n`));
    }
  }

  const plannedPages = researchedPages.filter(p => planningMap.has(p.id));
  if (plannedPages.length === 0) {
    output.write(errorMsg('  All planning stages failed. Aborting.\n'));
    process.exitCode = 1;
    return;
  }

  // ── Build shared design system prompt (once, shared across all designs) ──

  let sharedDesignSystemPrompt: string | undefined;
  if (structuredTokensResult.ok && brandSpecResult.ok) {
    const firstPlanning = planningMap.values().next().value;
    if (firstPlanning) {
      const dsCtx = buildDesignSystemContextFromSpec(structuredTokensResult.value, brandSpecResult.value, firstPlanning);
      sharedDesignSystemPrompt = dsCtx.designSystemPrompt;
    }
  }

  // ── Stage 2.5: Chrome Pass (shared shell once) ──

  let sharedChromeSpec: DesignSpecV2 | undefined;
  let sharedMeta = resolveSharedComponents(pages);
  if (options.designOnly) {
    const chromePath = join(projectRoot, PREVIEW_DIR_REL, 'shared-chrome.json');
    if (existsSync(chromePath)) {
      try {
        const raw = JSON.parse(readFileSync(chromePath, 'utf-8')) as Record<string, unknown>;
        delete raw.regions;
        sharedChromeSpec = raw as unknown as DesignSpecV2;
        output.write(infoMsg(`\n  Stage 2.5/4: Chrome — loaded ${chromePath}\n`));
      } catch {
        output.write(warnMsg('  Could not read shared-chrome.json; continuing without frozen chrome\n'));
      }
    }
  } else {
    if (sharedMeta) {
      const refPage = pages.find(p => p.id === sharedMeta.referencePageId);
      const refPlanning = refPage ? planningMap.get(refPage.id) : undefined;
      if (refPage && refPlanning) {
        output.write(
          infoMsg(
            `\n  Stage 2.5/4: Chrome Pass — ${sharedMeta.components.join(', ')} (ref: ${refPage.id})\n`,
          ),
        );
        const refViewport = resolveViewports({
          cliWidth: options.width,
          screenType: refPage.screen_type,
          pageViewports: refPage.viewports,
          designConfig,
        })[0];
        const provider = createClaudeProvider(resolveCLIModel(), providerConfig);
        const chromeResult = await designChromeComponents(
          {
            refPage,
            refPlanning,
            sharedChrome: sharedMeta,
            rendererTokens,
            catalogMap: catalogMapV2,
            ...(sharedDesignSystemPrompt ? { designSystemPrompt: sharedDesignSystemPrompt } : {}),
            ...(componentCatalogPromptStr ? { componentCatalogPrompt: componentCatalogPromptStr } : {}),
            viewportWidth: refViewport,
          },
          provider as unknown as LLMProviderRef,
        );
        if (chromeResult.ok) {
          sharedChromeSpec = chromeResult.value;
          const payload = buildSharedChromeFilePayload(sharedChromeSpec, sharedMeta);
          const manifestDir = join(projectRoot, PREVIEW_DIR_REL);
          if (!existsSync(manifestDir)) mkdirSync(manifestDir, { recursive: true });
          const chromePath = join(manifestDir, 'shared-chrome.json');
          writeFileSync(chromePath, JSON.stringify(payload, null, 2));
          output.write(
            successMsg(
              `    shared-chrome.json written (${Object.keys(sharedChromeSpec.nodes).length} nodes)\n`,
            ),
          );
        } else {
          output.write(
            warnMsg(
              `  Chrome Pass failed (${chromeResult.error.message}) — per-page chrome will be unconstrained\n`,
            ),
          );
        }
      }
    }
  }

  // ── Stage 3: Design all pages in parallel (browser-only V2) ──

  output.write(infoMsg('\n  Stage 3/4: Design (browser V2)\n'));

  interface DesignPageResult { readonly id: string; readonly name: string }

  const designResults = await runParallel<PageSpec, DesignPageResult>(
    plannedPages,
    async (page) => {
      const moduleId = `bookshelf-${page.id}`;
      const taskId = `task_design_${page.id}_${Date.now()}`;
      const planningOutput = planningMap.get(page.id)!;
      const description = buildPageDescription(page, designTokens);

      const viewportWidth = resolveViewports({
        cliWidth: options.width,
        screenType: page.screen_type,
        pageViewports: page.viewports,
        designConfig,
      })[0];

      const provider = createClaudeProvider(resolveCLIModel(), providerConfig);

      const pageContext = buildPageContext(page, pages);

      const penpotInput: PenpotDesignInput = {
        specRef: planningOutput.specRef, moduleId, taskId, planningOutput,
        description,
        viewportWidth,
        useDesignSpecV2: true,
        rendererTokens,
        catalogMap: catalogMapV2,
        pageContext,
        ...(sharedDesignSystemPrompt ? { designSystemPrompt: sharedDesignSystemPrompt } : {}),
        ...(componentCatalogPromptStr ? { componentCatalogPrompt: componentCatalogPromptStr } : {}),
        ...(sharedChromeSpec
          ? { frozenChromeSpec: sharedChromeSpec, frozenChromePageId: page.id }
          : {}),
      };

      const designResult = await penpotDesignWork(penpotInput, provider);

      if (designResult.ok) {
        const outputDir = ensureOutputDir(moduleId);
        saveArtifact(outputDir, 'penpot-design.json', designResult.value);
      }

      return designResult.ok
        ? Ok({ id: page.id, name: page.name })
        : designResult;
    },
    {
      concurrency: Math.min(concurrency, 2),
      onStart: (i) => output.write(infoMsg(`    [${i + 1}/${plannedPages.length}] ${plannedPages[i].name} — designing (${resolveViewports({ cliWidth: options.width, screenType: plannedPages[i].screen_type, pageViewports: plannedPages[i].viewports, designConfig })[0]}px)...\n`)),
      onComplete: (i, _total, ok, ms) => output.write(
        ok ? successMsg(`    [${i + 1}/${plannedPages.length}] ${plannedPages[i].name} — design done (${(ms / 1000).toFixed(1)}s)\n`)
           : errorMsg(`    [${i + 1}/${plannedPages.length}] ${plannedPages[i].name} — design failed\n`),
      ),
    },
  );

  // ── Summary ──

  interface PageResult { id: string; name: string; status: 'ok' | 'failed'; durationMs: number; stage: string }
  const results: PageResult[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const research = researchResults[i];
    if (!research.result.ok) {
      results.push({ id: page.id, name: page.name, status: 'failed', durationMs: research.durationMs, stage: 'research' });
      continue;
    }

    const planIdx = researchedPages.indexOf(page);
    if (planIdx < 0 || !planningResults[planIdx].result.ok) {
      results.push({ id: page.id, name: page.name, status: 'failed', durationMs: (planIdx >= 0 ? planningResults[planIdx].durationMs : 0), stage: 'planning' });
      continue;
    }

    const designIdx = plannedPages.indexOf(page);
    if (designIdx < 0 || !designResults[designIdx].result.ok) {
      results.push({ id: page.id, name: page.name, status: 'failed', durationMs: (designIdx >= 0 ? designResults[designIdx].durationMs : 0), stage: 'design' });
      continue;
    }

    const totalMs = research.durationMs + planningResults[planIdx].durationMs + designResults[designIdx].durationMs;
    results.push({ id: page.id, name: page.name, status: 'ok', durationMs: totalMs, stage: 'complete' });
  }

  const succeeded = results.filter(r => r.status === 'ok');
  const failed = results.filter(r => r.status === 'failed');
  const wallClockMs = Math.max(
    ...researchResults.map(r => r.durationMs),
    ...planningResults.map(r => r.durationMs),
    ...designResults.map(r => r.durationMs),
  );

  output.write('\n');
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg('  DESIGN COMPLETE\n'));
  output.write(infoMsg('='.repeat(60) + '\n'));
  for (const r of results) {
    const icon = r.status === 'ok' ? '✓' : '✗';
    const detail = r.status === 'ok' ? `${(r.durationMs / 1000).toFixed(1)}s` : `failed at ${r.stage}`;
    output.write(infoMsg(`  ${icon} ${r.name} (${detail})\n`));
  }
  output.write(infoMsg(`\n  ${succeeded.length}/${results.length} succeeded\n`));
  output.write(infoMsg(`  Wall-clock: ~${(wallClockMs / 1000).toFixed(0)}s (parallel)\n`));
  if (failed.length > 0) {
    output.write(warnMsg(`  ${failed.length} failed: ${failed.map(f => `${f.id} (${f.stage})`).join(', ')}\n`));
  }
  output.write(infoMsg('='.repeat(60) + '\n'));

  // ── Stage 4: Build prototype manifest (spec-driven navigation) ──

  if (succeeded.length >= 2) {
    output.write(infoMsg('\n  Building prototype manifest...\n'));

    // Load designed specs for navigation extraction
    const designedSpecs: Record<string, import('@agentforge/designspec-renderer').DesignSpecV2> = {};
    for (const r of succeeded) {
      const specPath = join(projectRoot, PREVIEW_DIR_REL, `bookshelf-${r.id}`, 'scripts', 'designspec-v2.json');
      if (!existsSync(specPath)) continue;
      try {
        designedSpecs[r.id] = JSON.parse(readFileSync(specPath, 'utf-8'));
      } catch {
        output.write(warnMsg(`    Could not read spec for ${r.id}, skipping\n`));
      }
    }

    // Re-derive chrome regions and propagate navigation to chrome tabs
    if (sharedChromeSpec && sharedMeta) {
      const refPageSpec = designedSpecs[sharedMeta.referencePageId];
      const chromePath = join(projectRoot, PREVIEW_DIR_REL, 'shared-chrome.json');
      let chromeUpdated = false;
      let updatedChromeSpec = sharedChromeSpec;

      if (refPageSpec) {
        const derived = deriveRegionsFromPageSpec(refPageSpec, sharedChromeSpec, sharedMeta.components);
        if (derived && existsSync(chromePath)) {
          const existing = JSON.parse(readFileSync(chromePath, 'utf-8')) as Record<string, unknown>;
          writeFileSync(chromePath, JSON.stringify({ ...existing, regions: derived }, null, 2));
          output.write(successMsg(`    Chrome regions derived from spec order\n`));
          chromeUpdated = true;
        }
      }

      const enriched = propagateNavigateToChromeTabs(updatedChromeSpec, pages);
      if (enriched !== updatedChromeSpec) {
        updatedChromeSpec = enriched;
        if (existsSync(chromePath)) {
          const existing = JSON.parse(readFileSync(chromePath, 'utf-8')) as Record<string, unknown>;
          const enrichedNodes = enriched.nodes as Record<string, unknown>;
          writeFileSync(chromePath, JSON.stringify({ ...existing, nodes: enrichedNodes }, null, 2));
          output.write(successMsg(`    Chrome tab navigateTo propagated from page specs\n`));
        }
        chromeUpdated = true;
      }

      if (chromeUpdated) {
        sharedChromeSpec = updatedChromeSpec;
      }
    }

    const projectManifest = manifestResult.ok ? manifestResult.value : undefined;
    const protoProjectName = projectManifest?.project?.name ?? 'Project';

    // Build manifest first to get screen list
    const manifest = buildPrototypeManifest(projectRoot, protoProjectName, pages, []);

    // Extract navigation from NodeSpec.navigateTo (deterministic, no LLM)
    let navigation = extractNavigationFromSpecs(manifest.screens, designedSpecs);
    output.write(infoMsg(`    Spec-driven navigation: ${navigation.length} bindings\n`));

    // Fallback: LLM analysis if no spec-driven bindings found
    if (navigation.length === 0 && manifest.screens.length >= 2) {
      output.write(infoMsg(`    No spec-driven bindings, falling back to LLM analysis...\n`));
      const summaries = [];
      for (const [screenId, spec] of Object.entries(designedSpecs)) {
        const page = pages.find(p => p.id === screenId);
        summaries.push(extractScreenSummary(screenId, page?.route ?? `/${screenId}`, spec));
      }
      if (summaries.length >= 2) {
        const navProvider = createClaudeProvider(resolveCLIModel(), providerConfig);
        const navResult = await analyzeNavigation(
          summaries,
          navProvider as unknown as Parameters<typeof analyzeNavigation>[1],
          resolveCLIModel(),
        );
        if (navResult.ok) {
          navigation = [...navResult.value];
          output.write(successMsg(`    LLM navigation: ${navigation.length} bindings\n`));
        }
      }
    }

    // Rebuild manifest with navigation
    const finalManifest = buildPrototypeManifest(projectRoot, protoProjectName, pages, navigation);

    const manifestDir = join(projectRoot, PREVIEW_DIR_REL);
    if (!existsSync(manifestDir)) mkdirSync(manifestDir, { recursive: true });
    const manifestPath = join(manifestDir, 'prototype.json');
    writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2));

    output.write(successMsg(`  Prototype manifest saved (${finalManifest.screens.length} screens, ${navigation.length} nav bindings)\n`));
    output.write(infoMsg(`  View in dashboard: Design Studio → Prototype\n`));
  }
}
