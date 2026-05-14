/**
 * @module @agentforge/cli/commands/design-page-all
 *
 * The `agentforge design:page:all` command.
 * Reads pages from the project spec (agentforge/spec/pages.yaml)
 * and design tokens (agentforge/spec/design-tokens.yaml), then runs
 * the unified design pipeline for all pages sequentially.
 *
 * Sequential per-page processing per vision Layer 7: "Across-screen
 * generation is sequential via topological order" with shared running context.
 */

import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolveCLIModel } from '../utils/resolve-cli-model.js';
import { createPipelineContext, ensureOutputDir, saveArtifact } from '../utils/pipeline-context.js';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { findProjectRoot, loadDotEnv } from '../fs-utils.js';
import {
  readYaml,
  createRealFs,
  loadDesignTokens,
  loadBrandSpec,
  loadComponentCatalog,
  loadProjectManifest,
  PREVIEW_DIR_REL,
  PIPELINE_ARTIFACTS,
} from '@agentforge/core';
import type {
  LLMProviderRef,
  PageEntry,
  DesignTokensSpec,
} from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import type { RendererTokens } from '@agentforge/designspec-renderer';
import { loadCatalogForRenderer } from '@agentforge/designspec-renderer';
import { requireClaudeAuth } from '../utils/require-claude-auth.js';
import {
  buildPrototypeManifest,
  extractNavigationFromSpecs,
  extractNavigationFromChromeSpec,
  extractScreenSummary,
  analyzeNavigation,
  resolveSharedComponents,
  deriveRegionsFromPageSpec,
  propagateNavigateToChromeTabs,
  runBrowserCorrectionPipeline,
  buildPipelineInput,
  runPagesWithChromePass,
} from '@agentforge/agents-ux';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type {
  BrowserCorrectionOptions,
  BrowserCorrectionResult,
  PenpotDesignOutput,
} from '@agentforge/agents-ux';
import type { LLMProvider } from '@agentforge/providers';
import { CliStdoutSink } from '../telemetry/cli-sink.js';
import {
  initLangfuseTracing,
  shutdownTracing,
  createTracedProvider,
  createLangfuseSink,
  CompositeSink,
  isLangfuseConfigured,
} from '@agentforge/telemetry';

// ============================================================================
// Types
// ============================================================================

export interface DesignPageAllOptions {
  /** Only design specific pages (comma-separated IDs). */
  readonly pages?: string;
  /** Design tool backend: 'browser' (default) or 'penpot'. */
  readonly tool?: 'browser' | 'penpot';
  /** Target viewport width in pixels — overrides per-page viewports. */
  readonly width?: number;
  /** Skip research+planning, use cached artifacts. */
  readonly designOnly?: boolean;
  /** @deprecated Sequential processing per vision Layer 7. Ignored. */
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

function normalizeDesignSpecShape(raw: unknown): DesignSpecV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (record.nodes && typeof record.nodes === 'object') return record as unknown as DesignSpecV2;
  if (record.spec && typeof record.spec === 'object') {
    const nested = record.spec as Record<string, unknown>;
    if (nested.nodes && typeof nested.nodes === 'object') return nested as unknown as DesignSpecV2;
  }
  return null;
}

// ============================================================================
// Helpers
// ============================================================================

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
  const projectManifest = manifestResult.ok ? manifestResult.value : undefined;


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
  const designTokensBanner = loadDesignTokensSummary(projectRoot);

  // Load structured design tokens for prompt injection
  const realFs = createRealFs();
  const structuredTokensResult = loadDesignTokens(projectRoot, realFs);
  // Brand spec loaded for future use by pipeline nodes (design system prompt)
  loadBrandSpec(projectRoot, realFs);
  const catalogResult = loadComponentCatalog(projectRoot, realFs);
  const componentCatalog = catalogResult.ok ? catalogResult.value : undefined;


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
  if (designTokensBanner) {
    output.write(infoMsg(`  ${designTokensBanner.slice(0, 80)}...\n`));
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

  if (options.concurrency !== undefined) {
    output.write(warnMsg('  --concurrency is deprecated (sequential processing per vision Layer 7). Ignored.\n'));
  }
  output.write('\n');

  // ── Telemetry: Langfuse + OTel (graceful no-op when unconfigured) ──

  initLangfuseTracing();

  // ── Provider factory for design pipeline ──

  const designTool = options.tool ?? 'browser';
  const providerFactory = (model: string): LLMProviderRef => {
    const provider = createClaudeProvider(model, providerConfig);
    const traced = createTracedProvider(provider);
    return traced as unknown as LLMProviderRef;
  };

  const createSink = (runId: string): import('@agentforge/agents-ux').PipelineTelemetrySink => {
    const cliSink = new CliStdoutSink(output);
    const langfuseSink = createLangfuseSink(runId, { projectName: projectRoot.split('/').pop() });
    return langfuseSink ? new CompositeSink([cliSink, langfuseSink]) : cliSink;
  };

  // ── Chrome Pass preload (--design-only) ──

  let preloadedChromeSpec: DesignSpecV2 | undefined;
  if (options.designOnly) {
    const chromePath = join(projectRoot, 'agentforge', 'designs', 'shared-chrome.json');
    if (existsSync(chromePath)) {
      try {
        const raw = JSON.parse(readFileSync(chromePath, 'utf-8')) as Record<string, unknown>;
        delete raw.regions;
        preloadedChromeSpec = raw as unknown as DesignSpecV2;
        output.write(infoMsg(`  Chrome — loaded ${chromePath}\n`));
      } catch {
        output.write(warnMsg('  Could not read shared-chrome.json; continuing without frozen chrome\n'));
      }
    }
  }

  // ── Chrome Pass + sequential per-page pipeline (vision Layer 7) ──

  // Resolve shared components for prototype manifest post-processing
  const sharedMeta = resolveSharedComponents(pages);

  interface PageResult { id: string; name: string; status: 'ok' | 'failed'; durationMs: number; stage: string }
  const results: PageResult[] = [];

  const runResult = await runPagesWithChromePass({
    pages,
    projectRoot,
    skipChromeGeneration: !!options.designOnly,
    preloadedChromeSpec,
    buildInput: (pageId, chromePass) => {
      const taskId = `task_page_${pageId}_${Date.now()}`;
      return buildPipelineInput({
        pageId,
        taskId,
        projectRoot,
        telemetry: createSink(taskId),
        agentContext: createPipelineContext(taskId, undefined, projectRoot, providerFactory, projectManifest),
        designTool,
        providerString: resolveCLIModel(),
        resume: !!options.designOnly,
        ...(options.designOnly ? { stage: 'design' as const } : {}),
        ...(options.width !== undefined ? { cliWidth: options.width } : {}),
        ...(chromePass ? { chromePass } : {}),
      });
    },
    onChromePassStart: (refPageId, components) => {
      output.write(infoMsg(`\n  Chrome Pass — ${components.join(', ')} (ref: ${refPageId})\n`));
    },
    onChromePassComplete: (spec) => {
      output.write(successMsg(`    shared-chrome.json written (${Object.keys(spec.nodes).length} nodes)\n`));
    },
    onChromePassFail: (errMsg) => {
      output.write(warnMsg(`  Chrome Pass failed (${errMsg}) — per-page chrome will be unconstrained\n`));
    },
    onPageStart: (pageId, index, total) => {
      const page = pages.find(p => p.id === pageId);
      const name = page?.name ?? pageId;
      output.write(infoMsg(`\n  [${index + 1}/${total}] ${name}...\n`));
    },
    onPageComplete: async (pageId, state, durationMs) => {
      const page = pages.find(p => p.id === pageId);
      const name = page?.name ?? pageId;
      const idx = pages.findIndex(p => p.id === pageId);

      const pageSpec = state.design?.spec as DesignSpecV2 | undefined;
      const meta = state.design?.designToolMetadata;
      const outputDir = ensureOutputDir(pageId, projectRoot);

      // Post-pipeline browser correction (batch is non-interactive).
      let pageCorrectionResult: BrowserCorrectionResult | undefined;
      if (designTool === 'browser' && pageSpec) {
        const viewportWidth = state.viewportWidth ?? 1440;
        const correctionOpts: BrowserCorrectionOptions = {
          width: viewportWidth,
          visionCorrection: true,
          interactive: false,
          outputDir: join(outputDir, PIPELINE_ARTIFACTS.corrections),
          ...(state.planning ? { planningOutput: state.planning } : {}),
        };
        try {
          const provider = providerFactory(resolveCLIModel());
          pageCorrectionResult = await runBrowserCorrectionPipeline(
            pageSpec, rendererTokens, catalogMapV2,
            provider as unknown as LLMProvider, correctionOpts,
          );
        } catch (correctionErr) {
          output.write(warnMsg(`    Browser correction failed for ${pageId}: ${correctionErr instanceof Error ? correctionErr.message : String(correctionErr)}\n`));
          output.write(warnMsg(`    Continuing without correction for this page.\n`));
        }
      }

      const designOutput: PenpotDesignOutput = {
        moduleId: pageId,
        breakpoints: [],
        ...(pageSpec ? { designSpec: pageSpec } : {}),
        ...(meta?.script ? { script: meta.script } : {}),
        ...(meta?.nodeIds ? { penpotNodeIds: meta.nodeIds } : {}),
        ...(meta?.projectId ? { penpotProjectId: meta.projectId } : {}),
        ...(pageCorrectionResult ? { browserCorrectionResult: pageCorrectionResult } : {}),
      };
      saveArtifact(outputDir, PIPELINE_ARTIFACTS.penpotDesign, designOutput);
      output.write(successMsg(`  [${idx + 1}/${pages.length}] ${name} — done (${(durationMs / 1000).toFixed(1)}s)\n`));
      results.push({ id: pageId, name, status: 'ok', durationMs, stage: 'complete' });
    },
    onPageFail: (pageId, error, durationMs) => {
      const page = pages.find(p => p.id === pageId);
      const name = page?.name ?? pageId;
      const idx = pages.findIndex(p => p.id === pageId);
      output.write(errorMsg(`  [${idx + 1}/${pages.length}] ${name} — failed at ${error.stage ?? 'unknown'}\n`));
      results.push({ id: pageId, name, status: 'failed', durationMs, stage: error.stage ?? 'unknown' });
    },
  });

  let sharedChromeSpec = runResult.sharedChromeSpec;

  // ── Summary ──

  const succeeded = results.filter(r => r.status === 'ok');
  const failed = results.filter(r => r.status === 'failed');
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

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
  output.write(infoMsg(`  Total: ~${(totalMs / 1000).toFixed(0)}s (sequential)\n`));
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
      const specPath = join(projectRoot, PREVIEW_DIR_REL, r.id, 'scripts', 'designspec-v2.json');
      if (!existsSync(specPath)) continue;
      try {
        const specContent = readFileSync(specPath, 'utf-8');
        const parsed = JSON.parse(specContent);
        const normalized = normalizeDesignSpecShape(parsed);
        if (!normalized) {
          output.write(warnMsg(`    Invalid DesignSpec shape for ${r.id}, skipping\n`));
          continue;
        }
        designedSpecs[r.id] = normalized;
      } catch {
        output.write(warnMsg(`    Could not read spec for ${r.id}, skipping\n`));
      }
    }

    // Re-derive chrome regions and propagate navigation to chrome tabs
    if (sharedChromeSpec && sharedMeta) {
      const refPageSpec = designedSpecs[sharedMeta.referencePageId];
      const chromePath = join(projectRoot, 'agentforge', 'designs', 'shared-chrome.json');
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

    const protoProjectName = projectManifest?.project?.name ?? 'Project';

    // Build manifest first to get screen list
    const manifest = buildPrototypeManifest(projectRoot, protoProjectName, pages, []);

    // Extract navigation from NodeSpec.navigateTo (deterministic, no LLM)
    let navigation = extractNavigationFromSpecs(manifest.screens, designedSpecs);

    if (sharedChromeSpec) {
      const chromeBindings = extractNavigationFromChromeSpec(sharedChromeSpec, manifest.screens);
      if (chromeBindings.length > 0) {
        navigation = [...navigation, ...chromeBindings];
        output.write(infoMsg(`    Chrome navigation: ${chromeBindings.length} bindings\n`));
      }
    }

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

    const designsDirForManifest = join(projectRoot, 'agentforge', 'designs');
    if (!existsSync(designsDirForManifest)) mkdirSync(designsDirForManifest, { recursive: true });
    const manifestPath = join(designsDirForManifest, 'prototype.json');
    writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2));

    output.write(successMsg(`  Prototype manifest saved (${finalManifest.screens.length} screens, ${navigation.length} nav bindings)\n`));
    output.write(infoMsg(`  View in dashboard: Design Studio → Prototype\n`));
  }

  // ── Flush Langfuse spans ──

  if (isLangfuseConfigured()) {
    await shutdownTracing();
    const baseUrl = process.env.LANGFUSE_BASE_URL ?? 'http://localhost:3000';
    output.write(infoMsg(`\n  Langfuse traces: ${baseUrl}\n`));
  }
}
