/**
 * @module @agentforge/cli/commands/design-penpot-browser
 *
 * The `agentforge design:penpot:browser <description>` command.
 * Runs the full UX design pipeline (Research -> Planning -> Design)
 * with Playwright browser automation for screenshots and state inspection.
 *
 * Browser agent pipeline:
 * 1. Playwright → launch browser, login to Penpot, navigate to project
 * 2. execute_code → create design (single script, existing path)
 * 3. Playwright → screenshot (browser-native)
 * 4. Playwright → page.evaluate() to read actual shape state
 * 5. LLM evaluate → compare screenshot + actual state vs spec
 * 6. execute_code → apply targeted fixes
 */

import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolveCLIModel } from '../utils/resolve-cli-model.js';
import { successMsg, errorMsg, infoMsg } from '../formatter.js';
import { findProjectRoot, loadDotEnv } from '../fs-utils.js';
import { verifyImplementation } from './impl-verify.js';
import { ensureDesignToolConnection, createMockMCPClient } from './design-preflight.js';
import {
  Ok,
  Err,
  createEventBus,
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
  DesignConfig,
} from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import { requireClaudeAuth } from '../utils/require-claude-auth.js';
import {
  uxResearchWork,
  uxPlanningWork,
  penpotBrowserDesignWork,
  uxImplementationWork,
  writeImplementationFiles,
  buildDesignSystemContextFromSpec,
  buildComponentCatalogPrompt,
} from '@agentforge/agents-ux';
import type {
  UXResearchInput,
  UXResearchOutput,
  UXPlanningInput,
  UXPlanningOutput,
  PenpotBrowserDesignInput,
  UXImplementationInput,
} from '@agentforge/agents-ux';

// ============================================================================
// Types
// ============================================================================

interface DesignPenpotBrowserOptions {
  /** Skip to a specific stage (loads prior stages from artifacts). */
  readonly stage?: 'research' | 'planning' | 'design';
  /** Module ID for the design. Default: derived from description. */
  readonly module?: string;
  /** Target viewport width in pixels (default: 1440). */
  readonly width?: number;
  /** Run browser headless (no visible window). Default: false */
  readonly headless?: boolean;
  /** Exit immediately after design without waiting for approval. */
  readonly noWait?: boolean;
  /** Skip feedback loop and generate code directly after design. */
  readonly implement?: boolean;
  /** Use mock MCP client (no design tool connection required). */
  readonly mock?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/** Derive a kebab-case module ID from a description. */
function deriveModuleId(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '');
}

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
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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

// ============================================================================
// Command
// ============================================================================

/**
 * Execute the design:penpot:browser command.
 * Runs the full UX pipeline with Playwright browser automation.
 */
export async function designPenpotBrowserCommand(
  description: string,
  output: NodeJS.WritableStream = process.stdout,
  options: DesignPenpotBrowserOptions = {},
): Promise<void> {
  const moduleId = options.module ?? deriveModuleId(description);
  const taskId = `task_design_penpot_browser_${Date.now()}`;
  const skipToStage = options.stage;
  const outputDir = ensureOutputDir(moduleId);

  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  AgentForge Penpot Browser Design Pipeline\n`));
  output.write(infoMsg(`  Module: ${moduleId}\n`));
  output.write(infoMsg(`  Description: ${description}\n`));
  output.write(infoMsg(`  Browser: ${options.headless ? 'headless' : 'headed'}\n`));
  output.write(infoMsg('='.repeat(60) + '\n'));

  // Load .env file so ANTHROPIC_API_KEY is available
  loadDotEnv(findProjectRoot());

  // Validate Claude auth (API key or Vertex AI)
  const providerConfig = requireClaudeAuth(output);
  if (!providerConfig) {
    process.exitCode = 1;
    return;
  }

  // -- Penpot connection (early check — before any LLM work) --
  const connectionResult = await ensureDesignToolConnection('penpot', output, { mock: options.mock });
  if (!connectionResult) {
    return;
  }
  const { mcpClient, disconnectFn } = connectionResult;

  try {

  // Load project manifest for design config (before planning stage to inject viewport constraints)
  let projectRoot: string;
  try {
    projectRoot = findProjectRoot();
  } catch {
    projectRoot = process.cwd();
  }
  const realFs = createRealFs();
  const manifestResult = loadProjectManifest(projectRoot, realFs);
  const designConfig: DesignConfig | undefined = manifestResult.ok ? manifestResult.value.design : undefined;

  // -- Stage 1: Research --
  let researchOutput: UXResearchOutput;

  if (skipToStage === 'planning' || skipToStage === 'design') {
    const cached = loadArtifact<UXResearchOutput>(outputDir, 'research-brief.json');
    if (!cached) {
      output.write(errorMsg(`No cached research output found at ${outputDir}/research-brief.json\n`));
      process.exitCode = 1;
      return;
    }
    researchOutput = cached;
    output.write(infoMsg('  [1/3] Research -- loaded from cache\n'));
  } else {
    output.write(infoMsg('\n  [1/3] Research -- analyzing requirements...\n'));
    const provider = createClaudeProvider(resolveCLIModel(), providerConfig);
    const context = createContext(taskId, createMockMCPClient());

    const input: UXResearchInput = {
      moduleId,
      taskId,
      prdRequirements: [description],
    };

    const t0 = Date.now();
    const result = await uxResearchWork(input, provider as unknown as LLMProviderRef, [], context);
    const ms = Date.now() - t0;

    if (!result.ok) {
      output.write(errorMsg(`Research failed: ${result.error.message}\n`));
      process.exitCode = 1;
      return;
    }

    researchOutput = result.value;
    saveArtifact(outputDir, 'research-brief.json', researchOutput);
    output.write(successMsg(`  Research complete (${(ms / 1000).toFixed(1)}s)\n`));
  }

  // -- Stage 2: Planning --
  let planningOutput: UXPlanningOutput;

  if (skipToStage === 'design') {
    const cached = loadArtifact<UXPlanningOutput>(outputDir, 'planning-spec.json');
    if (!cached) {
      output.write(errorMsg(`No cached planning output found at ${outputDir}/planning-spec.json\n`));
      process.exitCode = 1;
      return;
    }
    planningOutput = cached;
    output.write(infoMsg('  [2/3] Planning -- loaded from cache\n'));
  } else {
    output.write(infoMsg('\n  [2/3] Planning -- building component spec...\n'));
    const provider = createClaudeProvider(resolveCLIModel(), providerConfig);
    const context = createContext(taskId, createMockMCPClient());

    const input: UXPlanningInput = {
      briefId: researchOutput.briefId,
      moduleId,
      taskId,
      designBrief: researchOutput,
      ...(designConfig ? { designConfig } : {}),
    };

    const t0 = Date.now();
    const result = await uxPlanningWork(input, provider as unknown as LLMProviderRef, [], context);
    const ms = Date.now() - t0;

    if (!result.ok) {
      output.write(errorMsg(`Planning failed: ${result.error.message}\n`));
      process.exitCode = 1;
      return;
    }

    planningOutput = result.value;
    saveArtifact(outputDir, 'planning-spec.json', planningOutput);
    output.write(successMsg(`  Planning complete (${(ms / 1000).toFixed(1)}s)\n`));
  }

  // -- Load design system (tokens + brand) --
  let projectDesignSystemPrompt: string | undefined;
  let componentCatalogPromptStr: string | undefined;

  const tokensResult = loadDesignTokens(projectRoot, realFs);
  const brandResult = loadBrandSpec(projectRoot, realFs);
  if (tokensResult.ok && brandResult.ok) {
    const dsCtx = buildDesignSystemContextFromSpec(tokensResult.value, brandResult.value, planningOutput);
    projectDesignSystemPrompt = dsCtx.designSystemPrompt;
    output.write(infoMsg('  Design tokens + brand loaded\n'));
  }

  const catalogResult = loadComponentCatalog(projectRoot, realFs);
  if (catalogResult.ok) {
    componentCatalogPromptStr = buildComponentCatalogPrompt(catalogResult.value);
    output.write(infoMsg('  Component catalog loaded\n'));
  }

  // -- Stage 3: Design (Penpot + Browser) --
  output.write(infoMsg('\n  [3/3] Design -- creating Penpot components (browser mode)...\n'));

  const provider = createClaudeProvider(resolveCLIModel(), providerConfig);
  const penpotUrl = process.env.PENPOT_URL ?? DEFAULT_SERVICE_URLS.penpotUi;
  const penpotEmail = process.env.PENPOT_EMAIL ?? '';
  const penpotPassword = process.env.PENPOT_PASSWORD ?? '';

  const browserInput: PenpotBrowserDesignInput = {
    specRef: planningOutput.specRef,
    moduleId,
    taskId,
    planningOutput,
    description,
    ...(projectDesignSystemPrompt ? { designSystemPrompt: projectDesignSystemPrompt } : {}),
    ...(componentCatalogPromptStr ? { componentCatalogPrompt: componentCatalogPromptStr } : {}),
    viewportWidth: resolveViewports({ cliWidth: options.width, designConfig })[0],
  };

  const t0 = Date.now();
  const result = await penpotBrowserDesignWork(browserInput, provider, mcpClient, {
    headless: options.headless ?? false,
    penpotUrl,
    email: penpotEmail,
    password: penpotPassword,
  });
  const ms = Date.now() - t0;

  if (!result.ok) {
    output.write(errorMsg(`Design failed: ${result.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  const designOutput = result.value;
  const artifactPath = saveArtifact(outputDir, 'penpot-browser-design.json', designOutput);

  output.write(successMsg(`  Design complete (${(ms / 1000).toFixed(1)}s)\n`));
  output.write('\n');
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg('  PIPELINE COMPLETE (Browser Mode)\n'));
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg(`  Module: ${moduleId}\n`));
  output.write(infoMsg(`  Components: ${Object.keys(designOutput.penpotNodeIds ?? {}).length}\n`));
  output.write(infoMsg(`  Artifact: ${artifactPath}\n`));
  output.write(infoMsg('='.repeat(60) + '\n'));

  // ── --implement flag: generate code from design ──
  if (options.implement) {
    output.write(infoMsg('\n  [implement] Generating code from design...\n'));
    const implProvider = createClaudeProvider(resolveCLIModel(), providerConfig);
    const implContext = createContext(`${taskId}_impl`, mcpClient);

    const implInput: UXImplementationInput = {
      specRef: planningOutput.specRef,
      moduleId,
      taskId: `${taskId}_impl`,
      componentSpec: planningOutput,
      stage: 'layout',
      designNodeIds: (designOutput.penpotNodeIds ?? {}) as Record<string, string>,
      designFileId: designOutput.penpotProjectId ?? '',
    };

    const implResult = await uxImplementationWork(
      implInput,
      implProvider as unknown as LLMProviderRef,
      [],
      implContext,
    );

    if (implResult.ok) {
      const targetDir = process.cwd();
      const writtenPaths = writeImplementationFiles(implResult.value.files, targetDir);
      output.write(successMsg(`  Generated ${implResult.value.files.length} file(s):\n`));
      for (const p of writtenPaths) {
        output.write(infoMsg(`    ${p}\n`));
      }

      // ── Post-implementation verification ──
      output.write(infoMsg('\n  [verify] Starting post-implementation verification...\n'));
      await verifyImplementation({
        projectRoot: process.cwd(),
        moduleId,
        output,
        provider: provider as unknown as {
          complete: (
            prompt: { system: string; messages: { role: 'user'; content: string }[] },
            opts: { model: string; maxTokens: number; temperature: number },
          ) => Promise<import('@agentforge/core').Result<{ content: string }>>;
        },
      });
    } else {
      output.write(errorMsg(`  Implementation failed: ${implResult.error.message}\n`));
    }
  }

  } finally {
    disconnectFn?.();
  }
}
