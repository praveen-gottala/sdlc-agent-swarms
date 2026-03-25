/**
 * @module @agentforge/cli/commands/design-penpot-all
 *
 * The `agentforge design:penpot:all` command.
 * Reads pages from the project spec (agentforge/spec/pages.yaml)
 * and design tokens (agentforge/spec/design-tokens.yaml), then runs
 * the Penpot design pipeline for each page sequentially.
 *
 * Each page becomes a separate board in Penpot.
 */

import { resolve, join } from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolveCLIModel } from '../utils/resolve-cli-model.js';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { findProjectRoot, loadDotEnv } from '../fs-utils.js';
import {
  Ok,
  Err,
  createEventBus,
  createPenpotAdapter,
  readYaml,
  createRealFs,
  loadDesignTokens,
  loadBrandSpec,
  loadComponentCatalog,
  loadProjectManifest,
  resolveViewports,
  PREVIEW_DIR_REL,
  DEFAULT_SERVICE_URLS,
} from '@agentforge/core';
import type {
  MCPClient,
  LLMProviderRef,
  PageEntry,
  DesignConfig,
} from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import {
  runPenpotPreflight,
  loadPenpotSession,
  uxResearchWork,
  uxPlanningWork,
  penpotDesignWork,
  penpotBrowserDesignWork,
  buildDesignSystemContextFromSpec,
  buildComponentCatalogPrompt,
} from '@agentforge/agents-ux';
import type {
  UXResearchInput,
  UXResearchOutput,
  UXPlanningInput,
  UXPlanningOutput,
  PenpotDesignInput,
  PenpotBrowserDesignInput,
} from '@agentforge/agents-ux';

// ============================================================================
// Types
// ============================================================================

interface DesignPenpotAllOptions {
  /** Only design specific pages (comma-separated IDs). */
  readonly pages?: string;
  /** Target viewport width in pixels — overrides per-page viewports. */
  readonly width?: number;
  /** Skip research+planning, use cached artifacts. */
  readonly designOnly?: boolean;
  /** Use Playwright browser agent for screenshots and state reading. */
  readonly browser?: boolean;
}

/** @deprecated Use PageEntry from @agentforge/core */
type PageSpec = PageEntry;

// ============================================================================
// Helpers
// ============================================================================

const createMockMCPClient = (): MCPClient => ({
  callTool: async () => Ok({}),
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

const createContext = (taskId: string, mcpClient: MCPClient) => ({
  taskId,
  projectRoot: process.cwd(),
  eventBus: createEventBus(),
  fs: createRealFs(),
  mcpClient,
  runGovernance: async () => Ok({ status: 'proceed' as const }),
  resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'not used', recoverable: false }),
  recordAudit: () => {},
});

const ensureOutputDir = (moduleId: string): string => {
  const dir = resolve(process.cwd(), PREVIEW_DIR_REL, moduleId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
};

const saveArtifact = (dir: string, filename: string, data: unknown): string => {
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
};

const loadArtifact = <T>(dir: string, filename: string): T | null => {
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
};

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
 * Execute the design:penpot:all command.
 * Reads pages from spec, connects to Penpot, designs each page.
 */
export async function designPenpotAllCommand(
  output: NodeJS.WritableStream = process.stdout,
  options: DesignPenpotAllOptions = {},
): Promise<void> {
  // Find project root (looks for agentforge.yaml)
  let projectRoot: string;
  try {
    projectRoot = findProjectRoot();
  } catch {
    output.write(errorMsg('Not in an AgentForge project. Run from a directory with agentforge.yaml.\n'));
    process.exitCode = 1;
    return;
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

  // Load .env file so ANTHROPIC_API_KEY is available
  loadDotEnv(findProjectRoot());

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    output.write(errorMsg('ANTHROPIC_API_KEY must be set\n'));
    process.exitCode = 1;
    return;
  }

  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg('  AgentForge Penpot — Design All Screens\n'));
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  Project: ${projectRoot}\n`));
  output.write(infoMsg(`  Screens: ${pages.map(p => p.id).join(', ')}\n`));
  output.write(infoMsg(`  Total: ${pages.length} pages\n`));
  if (designTokens) {
    output.write(infoMsg(`  ${designTokens.slice(0, 80)}...\n`));
  }
  output.write(infoMsg('='.repeat(60) + '\n\n'));

  // Connect to Penpot (once for all screens)
  let mcpClient: MCPClient;
  let disconnectFn: (() => void) | undefined;
  const adapter = createPenpotAdapter();
  const mcpUrl = process.env.AGENTFORGE_MCP_PENPOT_URL ?? DEFAULT_SERVICE_URLS.penpotMcp;

  const sessionResult = loadPenpotSession();
  if (sessionResult.ok) {
    output.write(infoMsg(`  Penpot: reusing session\n`));
    const handle = adapter.createMCPClient({ url: sessionResult.value.url });
    mcpClient = handle.client;
    disconnectFn = handle.disconnect;
  } else {
    output.write(infoMsg('  Penpot: running preflight...\n'));
    const preflightResult = await runPenpotPreflight({ mcpUrl });
    if (preflightResult.ok) {
      output.write(successMsg(`  Penpot: connected (plugin verified)\n`));
      const handle = adapter.createMCPClient({ url: preflightResult.value.url });
      mcpClient = handle.client;
      disconnectFn = handle.disconnect;
    } else {
      output.write(errorMsg(`  Penpot: ${preflightResult.error.message}\n`));
      process.exitCode = 1;
      return;
    }
  }

  // Design each page
  const results: Array<{ id: string; name: string; status: 'ok' | 'failed'; durationMs: number }> = [];

  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const moduleId = `bookshelf-${page.id}`;
      const taskId = `task_design_penpot_${page.id}_${Date.now()}`;
      const outputDir = ensureOutputDir(moduleId);

      output.write(infoMsg(`\n  [${i + 1}/${pages.length}] ${page.name} (${page.id})\n`));
      output.write(infoMsg('  ' + '-'.repeat(56) + '\n'));

      const pageT0 = Date.now();
      const description = buildPageDescription(page, designTokens);

      try {
        // Research
        let researchOutput: UXResearchOutput;
        if (options.designOnly) {
          const cached = loadArtifact<UXResearchOutput>(outputDir, 'research-brief.json');
          if (!cached) {
            output.write(warnMsg(`    No cached research for ${page.id}, running fresh...\n`));
            options.designOnly; // fall through to fresh run
          } else {
            researchOutput = cached;
            output.write(infoMsg('    Research: cached\n'));
          }
        }
        // @ts-expect-error — researchOutput may not be assigned if designOnly + no cache
        if (!researchOutput) {
          output.write(infoMsg('    Research: running...\n'));
          const provider = createClaudeProvider(resolveCLIModel(), { apiKey });
          const context = createContext(taskId, createMockMCPClient());
          const input: UXResearchInput = { moduleId, taskId, prdRequirements: [description] };
          const result = await uxResearchWork(input, provider as unknown as LLMProviderRef, [], context);
          if (!result.ok) throw new Error(`Research failed: ${result.error.message}`);
          researchOutput = result.value;
          saveArtifact(outputDir, 'research-brief.json', researchOutput);
          output.write(successMsg('    Research: done\n'));
        }

        // Planning
        let planningOutput: UXPlanningOutput;
        if (options.designOnly) {
          const cached = loadArtifact<UXPlanningOutput>(outputDir, 'planning-spec.json');
          if (cached) {
            planningOutput = cached;
            output.write(infoMsg('    Planning: cached\n'));
          }
        }
        // @ts-expect-error — planningOutput may not be assigned
        if (!planningOutput) {
          output.write(infoMsg('    Planning: running...\n'));
          const provider = createClaudeProvider(resolveCLIModel(), { apiKey });
          const context = createContext(taskId, createMockMCPClient());
          const input: UXPlanningInput = {
            briefId: researchOutput.briefId, moduleId, taskId, designBrief: researchOutput,
            ...(designConfig ? { designConfig } : {}),
          };
          const result = await uxPlanningWork(input, provider as unknown as LLMProviderRef, [], context);
          if (!result.ok) throw new Error(`Planning failed: ${result.error.message}`);
          planningOutput = result.value;
          saveArtifact(outputDir, 'planning-spec.json', planningOutput);
          output.write(successMsg('    Planning: done\n'));
        }

        // Build project-specific design system prompt from tokens + brand
        let projectDesignSystemPrompt: string | undefined;
        if (structuredTokensResult.ok && brandSpecResult.ok) {
          const dsCtx = buildDesignSystemContextFromSpec(structuredTokensResult.value, brandSpecResult.value, planningOutput);
          projectDesignSystemPrompt = dsCtx.designSystemPrompt;
        }

        // Resolve viewports: CLI --width > page viewports > manifest design config > default [1440]
        const pageViewports = resolveViewports({
          cliWidth: options.width,
          pageViewports: page.viewports,
          designConfig,
        });

        // Design (Penpot) — use browser agent if --browser flag is set
        const useBrowser = options.browser ?? false;
        const provider = createClaudeProvider(resolveCLIModel(), { apiKey });

        for (const viewportWidth of pageViewports) {
          const vpModuleId = pageViewports.length > 1
            ? `${moduleId}-${viewportWidth}w`
            : moduleId;
          const vpOutputDir = pageViewports.length > 1 ? ensureOutputDir(vpModuleId) : outputDir;

          output.write(infoMsg(`    Design: creating in Penpot (${viewportWidth}px${useBrowser ? ', browser mode' : ''})...\n`));

          let designResult;
          if (useBrowser) {
            const browserInput: PenpotBrowserDesignInput = {
              specRef: planningOutput.specRef, moduleId: vpModuleId, taskId, planningOutput,
              description,
              viewportWidth,
              ...(projectDesignSystemPrompt ? { designSystemPrompt: projectDesignSystemPrompt } : {}),
              ...(componentCatalogPromptStr ? { componentCatalogPrompt: componentCatalogPromptStr } : {}),
            };
            designResult = await penpotBrowserDesignWork(browserInput, provider, mcpClient, {
              headless: false,
              penpotUrl: process.env.PENPOT_URL ?? DEFAULT_SERVICE_URLS.penpotUi,
              email: process.env.PENPOT_EMAIL ?? '',
              password: process.env.PENPOT_PASSWORD ?? '',
            });
          } else {
            const penpotInput: PenpotDesignInput = {
              specRef: planningOutput.specRef, moduleId: vpModuleId, taskId, planningOutput,
              description,
              viewportWidth,
              ...(projectDesignSystemPrompt ? { designSystemPrompt: projectDesignSystemPrompt } : {}),
              ...(componentCatalogPromptStr ? { componentCatalogPrompt: componentCatalogPromptStr } : {}),
            };
            designResult = await penpotDesignWork(penpotInput, provider, mcpClient);
          }
          if (!designResult.ok) throw new Error(`Design failed (${viewportWidth}px): ${designResult.error.message}`);

          saveArtifact(vpOutputDir, 'penpot-design.json', designResult.value);
        }

        const durationMs = Date.now() - pageT0;
        output.write(successMsg(`    Done (${(durationMs / 1000).toFixed(1)}s, ${pageViewports.length} viewport(s))\n`));
        results.push({ id: page.id, name: page.name, status: 'ok', durationMs });
      } catch (err) {
        const durationMs = Date.now() - pageT0;
        output.write(errorMsg(`    Failed: ${err instanceof Error ? err.message : String(err)}\n`));
        results.push({ id: page.id, name: page.name, status: 'failed', durationMs });
      }
    }
  } finally {
    disconnectFn?.();
  }

  // Summary
  const succeeded = results.filter(r => r.status === 'ok');
  const failed = results.filter(r => r.status === 'failed');
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  output.write('\n');
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg('  DESIGN COMPLETE\n'));
  output.write(infoMsg('='.repeat(60) + '\n'));
  for (const r of results) {
    const icon = r.status === 'ok' ? '✓' : '✗';
    output.write(infoMsg(`  ${icon} ${r.name} (${(r.durationMs / 1000).toFixed(1)}s)\n`));
  }
  output.write(infoMsg(`\n  ${succeeded.length}/${results.length} succeeded (${(totalMs / 1000).toFixed(0)}s total)\n`));
  if (failed.length > 0) {
    output.write(warnMsg(`  ${failed.length} failed: ${failed.map(f => f.id).join(', ')}\n`));
  }
  output.write(infoMsg('='.repeat(60) + '\n'));
}
