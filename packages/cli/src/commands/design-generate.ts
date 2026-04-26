/**
 * @module @agentforge/cli/commands/design-generate
 *
 * The `agentforge design:generate` command.
 * Uses LLM to generate a complete app spec (pages, models, API) from
 * the project description and design tokens, then presents an HTML preview
 * for the user to review and approve before writing spec files.
 */

import * as readline from 'node:readline';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { DesignTokensSpec, BrandSpec, PromptTrace } from '@agentforge/core';
import { loadDesignTokens, loadBrandSpec, loadPRD, SPEC_SCHEMA_HEADERS, PREVIEW_DIR_REL } from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import type { ProviderConfig } from '@agentforge/providers';
// GeneratedAppSpec type is imported via @agentforge/agents-ux, re-exported below for backward compat
import { generateAppSpec as generateAppSpecShared } from '@agentforge/agents-ux';
import type { GeneratedAppSpec } from '@agentforge/agents-ux';
import { resolveCLIModel } from '../utils/resolve-cli-model.js';
import { requireClaudeAuth } from '../utils/require-claude-auth.js';
import { infoMsg, warnMsg, errorMsg, successMsg } from '../formatter.js';
import type { FileSystem } from '../fs-utils.js';
import { readYaml, writeYaml, realFs, loadDotEnv } from '../fs-utils.js';
import { openInBrowser } from '../utils/open-in-browser.js';
import { generateAppSpecPreviewHtml } from '../preview/app-spec-preview.js';
import { generateDesignOptions } from './generate-design-options.js';
import type { GenerateDesignOptionsConfig } from './generate-design-options.js';
import { writeDesignSystemFiles } from '../design/design-system-writer.js';

// Re-export types from shared module for backward compat
export type { GeneratedAppSpec, GeneratedPage, GeneratedModel, GeneratedEndpoint } from '@agentforge/agents-ux';
export { parseAppSpecResponse } from '@agentforge/agents-ux';

/** Result of the design:generate flow. */
export interface DesignGenerateResult {
  readonly spec: GeneratedAppSpec;
  readonly source: 'llm' | 'fallback';
}

/** Options for customizing behavior (e.g. in tests). */
export interface DesignGenerateConfig {
  readonly openBrowser?: (url: string) => Promise<boolean>;
  readonly designOptionsConfig?: GenerateDesignOptionsConfig;
}

// Prompt and parsing logic now in @agentforge/agents-ux/app-spec

// ============================================================================
// HTML Preview Generation
// ============================================================================


// Re-export — canonical location is ../preview/app-spec-preview.js
export { generateAppSpecPreviewHtml } from '../preview/app-spec-preview.js';


// ============================================================================
// CLI Summary (fallback when browser can't open)
// ============================================================================

/** Print a CLI summary when browser can't open. */
function printCliSummary(
  spec: GeneratedAppSpec,
  output: NodeJS.WritableStream,
): void {
  output.write(infoMsg('\n=== Generated App Spec ===\n'));

  output.write(infoMsg('\nPages:\n'));
  for (const page of spec.pages) {
    output.write(infoMsg(`  ${page.name} (${page.route})\n`));
    output.write(infoMsg(`    ${page.description}\n`));
    output.write(infoMsg(`    Components: ${page.components.join(', ')}\n`));
  }

  output.write(infoMsg('\nModels:\n'));
  for (const model of spec.models) {
    output.write(infoMsg(`  ${model.name} (${model.db_table})\n`));
    output.write(infoMsg(`    Fields: ${model.fields.map((f) => `${f.name}:${f.type}`).join(', ')}\n`));
  }

  output.write(infoMsg('\nAPI Endpoints:\n'));
  for (const ep of spec.endpoints) {
    output.write(infoMsg(`  ${ep.method} ${ep.path} — ${ep.description}\n`));
  }
}

// ============================================================================
// Prompt Helper
// ============================================================================

/** Prompt for a single line using a short-lived readline. */
function promptOnce(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  question: string,
): Promise<string> {
  const rl = readline.createInterface({ input, output, terminal: false });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ============================================================================
// Prompt Tracing
// ============================================================================

/** Save a text artifact (e.g. markdown prompt traces). */
const saveTextArtifact = (dir: string, filename: string, text: string): string => {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, text);
  return filePath;
};

/** Format a prompt trace as a markdown document. */
function formatPromptTrace(trace: PromptTrace): string {
  return [
    `# Prompt: ${trace.stage}`,
    ``,
    `**Timestamp**: ${trace.timestamp}  `,
    `**Model**: ${trace.model}  `,
    `**Max Tokens**: ${trace.maxTokens}`,
    ``,
    `---`,
    ``,
    `## System Prompt`,
    ``,
    trace.system,
    ``,
    `---`,
    ``,
    `## User Message`,
    ``,
    trace.userMessage,
  ].join('\n');
}

// ============================================================================
// LLM Generation
// ============================================================================

/** Attempt LLM generation of the app spec via shared generateAppSpec. */
async function tryLLMGeneration(
  providerConfig: ProviderConfig,
  context: {
    readonly appName: string;
    readonly description: string;
    readonly tokens: DesignTokensSpec;
    readonly brand: BrandSpec;
    readonly prdContent?: string;
  },
  output: NodeJS.WritableStream,
  promptTraces?: PromptTrace[],
): Promise<GeneratedAppSpec | null> {
  let provider;
  try {
    provider = createClaudeProvider(resolveCLIModel(), providerConfig);
  } catch {
    output.write(warnMsg('Failed to create LLM provider.\n'));
    return null;
  }

  const result = await generateAppSpecShared({
    appName: context.appName,
    description: context.description,
    prdContent: context.prdContent,
    designTokens: context.tokens,
    brandSpec: context.brand,
    provider,
    model: resolveCLIModel(),
    maxTokens: 16384,
    temperature: 0.7,
    maxRetries: 1,
    promptTraces,
  });

  if (!result.ok) {
    output.write(warnMsg(`Spec generation failed: ${result.error.message}\n`));
    return null;
  }

  return result.value;
}

// ============================================================================
// Spec File Writing
// ============================================================================

/** Write the generated spec to YAML files. */
function writeSpecFiles(
  rootDir: string,
  spec: GeneratedAppSpec,
  fileSystem: FileSystem,
): void {
  const specDir = path.join(rootDir, 'agentforge', 'spec');
  fileSystem.mkdir(specDir);

  // Write pages.yaml — desktop (1440) enabled by default, others commented out
  const pagesData = {
    version: '1.0',
    pages: spec.pages.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      route: p.route,
      status: 'approved',
      screen_type: p.screen_type ?? 'page',
      components: [...p.components],
      data_sources: [...p.data_sources],
      viewports: [1440],
      ...(p.navigates_to && p.navigates_to.length > 0
        ? { navigates_to: p.navigates_to.map(n => ({ target: n.target, trigger: n.trigger })) }
        : {}),
    })),
  };
  const pagesPath = path.join(specDir, 'pages.yaml');
  writeYaml(pagesPath, pagesData, fileSystem, SPEC_SCHEMA_HEADERS['pages']);

  // Post-process to add commented-out viewport options after each viewports line
  const pagesResult = fileSystem.readFile(pagesPath);
  if (pagesResult.ok) {
    const patched = pagesResult.value.replace(
      /^(\s+)viewports:\n\s+- 1440$/gm,
      '$1viewports:\n$1  - 1440\n$1  # - 768  # uncomment for tablet\n$1  # - 390  # uncomment for mobile',
    );
    fileSystem.writeFile(pagesPath, patched);
  }

  // Write models.yaml
  const modelsData = {
    version: '1.0',
    models: spec.models.map((m) => ({
      id: m.id,
      name: m.name,
      fields: m.fields.map((f) => ({ ...f })),
      db_table: m.db_table,
    })),
  };
  writeYaml(path.join(specDir, 'models.yaml'), modelsData, fileSystem, SPEC_SCHEMA_HEADERS['models']);

  // Write api.yaml
  const apiData = {
    version: '1.0',
    base_url: '/api',
    endpoints: spec.endpoints.map((e) => ({
      id: e.id,
      method: e.method,
      path: e.path,
      description: e.description,
      query_params: e.query_params.map((q) => ({ ...q })),
      response: { ...e.response },
      auth: e.auth,
      status: 'planned',
    })),
  };
  writeYaml(path.join(specDir, 'api.yaml'), apiData, fileSystem, SPEC_SCHEMA_HEADERS['api']);
}

// ============================================================================
// Main Command
// ============================================================================

/**
 * Generate a complete app spec from project context using LLM.
 *
 * Two-phase flow:
 * - Phase 1: If design-tokens.yaml is missing, generates design system
 *   (requires docs/prd.md).
 * - Phase 2: Generates app spec (pages, models, API) using PRD + design context.
 *
 * Opens HTML previews for the user to review before writing files.
 */
export async function designGenerateCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
  config?: DesignGenerateConfig,
): Promise<DesignGenerateResult | null> {
  // Load .env file so ANTHROPIC_API_KEY is available
  loadDotEnv(rootDir);

  const promptTraces: PromptTrace[] = [];
  const previewDir = path.join(rootDir, PREVIEW_DIR_REL, 'design-generate');

  // Read project context via proper YAML parsing
  let appName = '';
  let description = '';
  const manifestPath = path.join(rootDir, 'agentforge.yaml');
  const manifestResult = readYaml<{ project?: { name?: string; description?: string } }>(manifestPath, fileSystem);
  if (manifestResult.ok) {
    appName = manifestResult.value.project?.name ?? '';
    description = manifestResult.value.project?.description ?? '';
  }

  if (!appName) {
    output.write(errorMsg('Could not read project name from agentforge.yaml. Run `agentforge init` first.\n'));
    return null;
  }

  // Load PRD if available
  const prdResult = loadPRD(rootDir, fileSystem);
  const prdContent = prdResult.ok ? prdResult.value : undefined;

  // Phase 1: Design System — generate if missing, or offer to regenerate if existing
  let tokensResult = loadDesignTokens(rootDir, fileSystem);
  let brandResult = loadBrandSpec(rootDir, fileSystem);
  const designSystemExists = tokensResult.ok && brandResult.ok;

  let regenerateDesign = !designSystemExists;
  if (designSystemExists) {
    const answer = await promptOnce(input, output, '\nDesign system already exists. Regenerate it? (y/n): ');
    regenerateDesign = answer === 'y' || answer === 'yes';
  }

  if (regenerateDesign) {
    if (!prdContent) {
      output.write(errorMsg('PRD not found at docs/prd.md. Run `agentforge describe` first to create a PRD.\n'));
      return null;
    }

    output.write(infoMsg(designSystemExists
      ? '\nRegenerating design options...\n'
      : '\nDesign system not found. Generating design options...\n'));

    const designResult = await generateDesignOptions(
      {
        appName,
        description: description || prdContent.substring(0, 500),
        targetAudience: '',
        prdContent,
      },
      input,
      output,
      config?.designOptionsConfig,
      promptTraces,
    );

    // Save design system files
    writeDesignSystemFiles(rootDir, designResult.tokens, designResult.brand, fileSystem);

    output.write(successMsg('\n✓ Design system created:\n'));
    output.write(successMsg('  agentforge/spec/design-tokens.yaml\n'));
    output.write(successMsg('  agentforge/spec/brand.yaml\n'));
    output.write(successMsg('  tailwind.config.ts\n'));
    output.write(successMsg('  src/styles/globals.css\n'));

    // Reload tokens and brand
    tokensResult = loadDesignTokens(rootDir, fileSystem);
    brandResult = loadBrandSpec(rootDir, fileSystem);
  }

  if (!tokensResult.ok || !brandResult.ok) {
    output.write(errorMsg('Failed to load design system.\n'));
    return null;
  }

  const tokens = tokensResult.value;
  const brand = brandResult.value;

  // Phase 2: App Spec Generation
  const providerConfig = requireClaudeAuth(output);
  if (!providerConfig) return null;

  output.write(infoMsg('\nGenerating app specification with AI...\n'));

  let spec = await tryLLMGeneration(
    providerConfig,
    { appName, description, tokens, brand, prdContent },
    output,
    promptTraces,
  );
  if (!spec) {
    output.write(errorMsg('Failed to generate app spec. Please try again.\n'));
    return null;
  }

  // Preview loop — show HTML, get user approval
  const browserFn = config?.openBrowser ?? openInBrowser;
  let approved = false;

  while (!approved) {
    const html = generateAppSpecPreviewHtml(appName, spec, tokens, brand);
    const tmpFile = path.join(os.tmpdir(), `agentforge-spec-preview-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, html, 'utf-8');

    const browserOpened = await browserFn(`file://${tmpFile}`);
    if (browserOpened) {
      output.write(infoMsg('\nApp spec preview opened in your browser.\n'));
    } else {
      output.write(warnMsg('\nCould not open browser. Here is the spec:\n'));
      printCliSummary(spec, output);
    }

    const answer = await promptOnce(input, output, '\nApprove this spec? (y)es / (r)egenerate / (n)o: ');

    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

    if (answer === 'y' || answer === 'yes') {
      approved = true;
    } else if (answer === 'r' || answer === 'regenerate') {
      output.write(infoMsg('Regenerating...\n'));
      const newSpec = await tryLLMGeneration(
        providerConfig,
        { appName, description, tokens, brand, prdContent },
        output,
        promptTraces,
      );
      if (newSpec) {
        spec = newSpec;
      } else {
        output.write(warnMsg('Regeneration failed. Keeping current spec.\n'));
      }
    } else {
      output.write(infoMsg('Cancelled.\n'));
      return null;
    }
  }

  // Save prompt traces
  if (promptTraces.length > 0) {
    fs.mkdirSync(previewDir, { recursive: true });
    for (const trace of promptTraces) {
      saveTextArtifact(previewDir, `${trace.stage}-prompt.md`, formatPromptTrace(trace));
    }
  }

  // Migrate design files if page IDs changed
  const designsDir = path.join(rootDir, 'agentforge', 'designs');
  const pagesPath = path.join(rootDir, 'agentforge', 'spec', 'pages.yaml');
  const existingPagesResult = readYaml<{ pages?: Array<{ id: string; route: string }> }>(pagesPath, fileSystem);
  if (existingPagesResult.ok && existingPagesResult.value.pages) {
    const oldRouteToId = new Map<string, string>();
    for (const p of existingPagesResult.value.pages) {
      if (p.route) oldRouteToId.set(p.route, p.id);
    }

    let renamedCount = 0;
    for (const newPage of spec.pages) {
      const oldId = oldRouteToId.get(newPage.route);
      if (!oldId || oldId === newPage.id) continue;
      const oldPath = path.join(designsDir, `${oldId}.json`);
      const newPath = path.join(designsDir, `${newPage.id}.json`);
      if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        fs.renameSync(oldPath, newPath);
        renamedCount++;
      }
    }
    if (renamedCount > 0) {
      output.write(successMsg(`\nMigrated ${renamedCount} design file(s) to match new page IDs.\n`));
    }
  }

  // Write spec files
  writeSpecFiles(rootDir, spec, fileSystem);
  output.write(successMsg(`\nApp spec written:\n`));
  output.write(successMsg(`  agentforge/spec/pages.yaml    (${spec.pages.length} pages)\n`));
  output.write(successMsg(`  agentforge/spec/models.yaml   (${spec.models.length} models)\n`));
  output.write(successMsg(`  agentforge/spec/api.yaml      (${spec.endpoints.length} endpoints)\n`));

  // Next steps
  output.write('\n');
  output.write(successMsg('Next steps:\n'));
  output.write(infoMsg('  1. Design screens in Penpot:\n'));
  for (const page of spec.pages) {
    output.write(infoMsg(`         agentforge design:penpot ${page.id}\n`));
  }
  output.write(infoMsg('  2. Re-run to update:         agentforge design:generate\n'));
  output.write(infoMsg('  3. Start full design phase:   agentforge start design\n'));
  output.write('\n');

  return { spec, source: 'llm' };
}
