/**
 * @module @agentforge/cli/commands/design-penpot-review
 *
 * The `agentforge design:penpot:review --url <url>` command.
 * Opens an existing Penpot workspace in a browser, takes a screenshot,
 * evaluates the design, and enters an interactive feedback loop.
 */

import { findProjectRoot, loadDotEnv, readYaml, realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import {
  Ok,
  createPenpotAdapter,
  loadDesignTokens,
  loadBrandSpec,
} from '@agentforge/core';
import type { MCPClient, DesignTokensSpec, BrandSpec } from '@agentforge/core';
import * as path from 'node:path';
import { createClaudeProvider, createOpenAIProvider } from '@agentforge/providers';
import type { LLMProvider } from '@agentforge/providers';
import {
  runPenpotPreflight,
  loadPenpotSession,
  runPenpotBrowserReview,
} from '@agentforge/agents-ux';

// ============================================================================
// Types
// ============================================================================

interface DesignPenpotReviewOptions {
  /** Penpot workspace URL (user must be logged in). */
  readonly url: string;
  /** Optional page ID to filter spec to a specific page. */
  readonly page?: string;
  /** Run browser headless (default: false). */
  readonly headless?: boolean;
}

/** Shape of a page entry in pages.yaml. */
interface PageSpec {
  readonly id: string;
  readonly name: string;
  readonly route?: string;
  readonly components?: readonly string[];
}

/** Shape of the pages.yaml file. */
interface PagesYaml {
  readonly pages: readonly PageSpec[];
}

// ============================================================================
// Design spec builder
// ============================================================================

/**
 * Build a rich design spec string from design tokens, brand spec, and pages.
 */
function buildDesignSpec(
  tokens: DesignTokensSpec | undefined,
  brand: BrandSpec | undefined,
  pages: readonly PageSpec[] | undefined,
  pageFilter?: string,
): string {
  const sections: string[] = [];

  if (tokens) {
    const colorLines = Object.entries(tokens.colors.primitive)
      .map(([name, hex]) => `- ${name}: ${hex}`)
      .join('\n');
    const typoLines = tokens.typography.scale
      .map((entry) => {
        const fontFamily = tokens.typography.font_families[entry.family] ?? entry.family;
        return `- ${entry.role}: ${fontFamily} ${entry.size}px / ${entry.weight}`;
      })
      .join('\n');
    const spacingLine = `Unit: ${tokens.spacing.unit}px, Scale: ${tokens.spacing.scale.join(', ')}`;

    sections.push(
      `## Design System\n\n### Colors\n${colorLines}\n\n### Typography\n${typoLines}\n\n### Spacing\n${spacingLine}`,
    );
  }

  if (brand) {
    const brandLines = [
      `- Tone: ${brand.identity.tone}`,
      `- Audience: ${brand.identity.audience}`,
      `- Illustration: ${brand.illustration_style.direction} (${brand.illustration_style.description})`,
      `- WCAG: ${brand.accessibility.wcag_level}`,
    ].join('\n');
    sections.push(`### Brand\n${brandLines}`);
  }

  if (pages && pages.length > 0) {
    const filteredPages = pageFilter
      ? pages.filter((p) => p.id === pageFilter)
      : pages;

    for (const page of filteredPages) {
      const components = page.components?.join(', ') ?? 'none specified';
      sections.push(
        `## Page: ${page.name}\nRoute: ${page.route ?? '/'}\nComponents: ${components}`,
      );
    }
  }

  return sections.length > 0
    ? sections.join('\n\n')
    : 'General design quality review';
}

// ============================================================================
// Command
// ============================================================================

/**
 * Execute the design:penpot:review command.
 * Opens an existing Penpot design for interactive review and improvement.
 */
export async function designPenpotReviewCommand(
  output: NodeJS.WritableStream = process.stdout,
  options: DesignPenpotReviewOptions,
): Promise<void> {
  output.write(infoMsg('='.repeat(60) + '\n'));
  output.write(infoMsg('  AgentForge Penpot Design Review\n'));
  output.write(infoMsg(`  URL: ${options.url}\n`));
  output.write(infoMsg('='.repeat(60) + '\n'));

  // Load .env so API keys are available
  const projectRoot = findProjectRoot();
  loadDotEnv(projectRoot);

  // Load project design system for evaluation context
  let designSpec: string;
  {
    const tokensResult = loadDesignTokens(projectRoot, realFs);
    const brandResult = loadBrandSpec(projectRoot, realFs);
    const pagesPath = path.join(projectRoot, 'agentforge/spec/pages.yaml');
    const pagesResult = readYaml<PagesYaml>(pagesPath);
    const tokens = tokensResult.ok ? tokensResult.value : undefined;
    const brand = brandResult.ok ? brandResult.value : undefined;
    const pages = pagesResult.ok ? pagesResult.value.pages : undefined;
    designSpec = buildDesignSpec(tokens, brand, pages, options.page);
    if (tokens || brand || pages) {
      output.write(infoMsg('  Design system: loaded from project spec\n'));
    } else {
      output.write(warnMsg('  Design system: not found, using generic evaluation\n'));
    }
  }

  // Resolve LLM provider: prefer Anthropic, fall back to OpenAI
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let provider: LLMProvider;
  let modelName: string;
  if (anthropicKey) {
    modelName = 'claude-sonnet-4';
    provider = createClaudeProvider(modelName, { apiKey: anthropicKey });
    output.write(infoMsg(`  LLM: Anthropic (${modelName})\n`));
  } else if (openaiKey) {
    modelName = 'gpt-4o';
    provider = createOpenAIProvider(modelName, { apiKey: openaiKey });
    output.write(infoMsg(`  LLM: OpenAI (${modelName})\n`));
  } else {
    output.write(errorMsg('No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env\n'));
    process.exitCode = 1;
    return;
  }

  // Connect to Penpot MCP
  let mcpClient: MCPClient;
  let disconnectFn: (() => void) | undefined;
  const adapter = createPenpotAdapter();
  const mcpUrl = process.env.AGENTFORGE_MCP_PENPOT_URL ?? 'http://localhost:4401/mcp';

  const sessionResult = loadPenpotSession();
  if (sessionResult.ok) {
    output.write(infoMsg(`  Penpot MCP: reusing session (tools: ${sessionResult.value.supportedTools?.length ?? 0})\n`));
    const handle = adapter.createMCPClient({ url: sessionResult.value.url });
    mcpClient = handle.client;
    disconnectFn = handle.disconnect;
  } else {
    output.write(infoMsg('  Penpot MCP: running preflight...\n'));
    const preflightResult = await runPenpotPreflight({ mcpUrl });
    if (preflightResult.ok) {
      output.write(successMsg(`  Penpot MCP: connected (tools: ${preflightResult.value.supportedTools?.length ?? 0})\n`));
      const handle = adapter.createMCPClient({ url: preflightResult.value.url });
      mcpClient = handle.client;
      disconnectFn = handle.disconnect;
    } else {
      output.write(warnMsg(`  Penpot MCP: ${preflightResult.error.message}\n`));
      output.write(warnMsg('  Continuing with mock MCP (review only, no modifications)\n'));
      mcpClient = {
        callTool: async () => Ok({}),
        listTools: async () => Ok([]),
        isAvailable: async () => true,
      };
    }
  }

  try {
    const result = await runPenpotBrowserReview({
      workspaceUrl: options.url,
      mcpClient,
      provider,
      input: process.stdin,
      output,
      headless: options.headless ?? false,
      designSpec,
      model: modelName,
    });

    output.write('\n');
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg('  REVIEW SESSION COMPLETE\n'));
    output.write(infoMsg('='.repeat(60) + '\n'));
    output.write(infoMsg(`  Approved: ${result.approved ? 'yes' : 'no'}\n`));
    output.write(infoMsg(`  Final Score: ${result.finalScore}/100\n`));
    output.write(infoMsg(`  Feedback Applied: ${result.feedbackCount}\n`));
    output.write(infoMsg('='.repeat(60) + '\n'));

    if (!result.approved) {
      process.exitCode = 1;
    }
  } finally {
    disconnectFn?.();
  }
}
