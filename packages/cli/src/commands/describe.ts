/**
 * @module @agentforge/cli/commands/describe
 *
 * The `agentforge describe` command. Captures rich app context via a PRD
 * document — either user-provided or LLM-generated from Q&A answers.
 * Writes the PRD to docs/prd.md as the single source of truth for
 * downstream commands (design:generate, design:figma, etc.).
 */

import * as readline from 'node:readline';
import * as path from 'node:path';
import * as os from 'node:os';
import * as nodeFs from 'node:fs';
import { prdExists, recordPromptTrace } from '@agentforge/core';
import type { PromptTrace } from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import type { LLMProvider } from '@agentforge/providers';
import { resolveCLIModel } from '../utils/resolve-cli-model.js';
import { requireClaudeAuth } from '../utils/require-claude-auth.js';
import { infoMsg, warnMsg, errorMsg, successMsg } from '../formatter.js';
import type { FileSystem } from '../fs-utils.js';
import { realFs, loadDotEnv } from '../fs-utils.js';
import { openInBrowser } from '../utils/open-in-browser.js';
import { generatePRDPreviewHtml } from '../preview/prd-preview.js';

/** Options for customizing behavior (e.g. in tests). */
export interface DescribeConfig {
  /** Override browser opener. Return true if browser opened. */
  readonly openBrowser?: (url: string) => Promise<boolean>;
}

/** Answers collected from the interactive Q&A flow. */
export interface DescribeAnswers {
  readonly appDescription: string;
  readonly targetUsers: string;
  readonly keyFeatures: string;
  readonly technicalConstraints: string;
}

/**
 * Prompt the user for a single line of input.
 */
function promptOnce(
  rl: readline.Interface,
  question: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/** Build the system prompt for PRD generation from Q&A answers. */
function buildPRDSystemPrompt(): string {
  return `You are a product manager. Generate a clear, well-structured PRD (Product Requirements Document) in markdown from the user's answers. Include sections: Overview, Problem Statement, Target Users, Features (with priorities), User Flows, and Technical Constraints. Keep it concise but complete.`;
}

/** Build the user prompt from Q&A answers. */
function buildPRDUserPrompt(answers: DescribeAnswers): string {
  return `App description: ${answers.appDescription}
Target users: ${answers.targetUsers}
Key features: ${answers.keyFeatures}
Technical constraints: ${answers.technicalConstraints || 'None specified'}`;
}

/** Generate a PRD markdown document from Q&A answers using LLM. */
export async function generatePRD(
  answers: DescribeAnswers,
  output: NodeJS.WritableStream,
  promptTraces?: PromptTrace[],
): Promise<string | null> {
  const providerConfig = requireClaudeAuth(output);
  if (!providerConfig) return null;

  const model = resolveCLIModel();
  let provider: LLMProvider;
  try {
    provider = createClaudeProvider(model, providerConfig);
  } catch {
    output.write(warnMsg('Failed to create LLM provider.\n'));
    return null;
  }

  try {
    const prompt = {
      system: buildPRDSystemPrompt(),
      messages: [{ role: 'user' as const, content: buildPRDUserPrompt(answers) }],
    };
    const opts = { model, maxTokens: 8192, temperature: 0.7 };

    recordPromptTrace(
      { promptTraces },
      'prd-generation',
      prompt,
      opts,
    );

    const result = await provider.complete(prompt, opts);

    if (!result.ok) {
      output.write(warnMsg(`LLM request failed: ${JSON.stringify(result.error)}\n`));
      return null;
    }

    return result.value.content;
  } catch (e) {
    output.write(warnMsg(`PRD generation error: ${e instanceof Error ? e.message : String(e)}\n`));
    return null;
  }
}


// Re-export — canonical location is ../preview/prd-preview.js
export { generatePRDPreviewHtml } from '../preview/prd-preview.js';


/**
 * Execute the describe command.
 * Guides the user to provide or generate a PRD at docs/prd.md.
 */
export async function describeCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
  config?: DescribeConfig,
): Promise<void> {
  // Load .env file so ANTHROPIC_API_KEY is available
  loadDotEnv(rootDir);

  // Check project is initialized
  if (!fileSystem.exists(path.join(rootDir, 'agentforge.yaml'))) {
    output.write(errorMsg('No agentforge.yaml found. Run `agentforge init` first.\n'));
    process.exitCode = 1;
    return;
  }

  const rl = readline.createInterface({ input, output });

  try {
    // Check for existing PRD
    if (prdExists(rootDir, fileSystem)) {
      const prdResult = fileSystem.readFile(path.join(rootDir, 'docs', 'prd.md'));
      const wordCount = prdResult.ok ? prdResult.value.split(/\s+/).length : 0;
      const replace = await promptOnce(rl, `\nA PRD already exists (${wordCount} words). Replace it? (y/n): `);
      if (replace.toLowerCase() !== 'y') {
        output.write(infoMsg('Keeping existing PRD.\n'));
        return;
      }
    }

    const hasPRD = await promptOnce(rl, '\nDo you have a PRD or requirements document? (y/n): ');

    if (hasPRD.toLowerCase() === 'y') {
      // Manual PRD placement flow
      await promptOnce(rl, '\nPlace your PRD file at docs/prd.md and press Enter. ');

      const prdPath = path.join(rootDir, 'docs', 'prd.md');
      if (!fileSystem.exists(prdPath)) {
        output.write(errorMsg('File not found at docs/prd.md. Please place your PRD there and re-run.\n'));
        process.exitCode = 1;
        return;
      }

      const prdResult = fileSystem.readFile(prdPath);
      if (!prdResult.ok) {
        output.write(errorMsg(`Could not read docs/prd.md: ${prdResult.error.message}\n`));
        process.exitCode = 1;
        return;
      }

      const wordCount = prdResult.value.split(/\s+/).length;
      output.write(successMsg(`✓ PRD loaded (${wordCount} words).\n`));
      output.write(infoMsg('Next: Run `agentforge design:generate`\n'));
    } else {
      // Interactive Q&A flow
      output.write(infoMsg("\nLet's build one. Answer a few questions:\n\n"));

      const appDescription = await promptOnce(rl, '1. What does your app do?\n   > ');
      const targetUsers = await promptOnce(rl, '\n2. Who are the primary users?\n   > ');
      const keyFeatures = await promptOnce(rl, '\n3. What are the key features? (comma-separated)\n   > ');
      const technicalConstraints = await promptOnce(rl, '\n4. Any technical constraints or preferences? (optional, press Enter to skip)\n   > ');

      output.write(infoMsg('\nGenerating PRD from your answers...\n'));

      const answers: DescribeAnswers = {
        appDescription,
        targetUsers,
        keyFeatures,
        technicalConstraints,
      };

      const prdContent = await generatePRD(answers, output);
      if (!prdContent) {
        output.write(errorMsg('Failed to generate PRD. Please try again.\n'));
        process.exitCode = 1;
        return;
      }

      // Read app name from manifest
      let appName = 'App';
      const manifestResult = fileSystem.readFile(path.join(rootDir, 'agentforge.yaml'));
      if (manifestResult.ok) {
        const nameMatch = manifestResult.value.match(/^\s*name:\s*(.+)/m);
        if (nameMatch) appName = nameMatch[1].trim().replace(/^['"]|['"]$/g, '');
      }

      // Show HTML preview
      const browserFn = config?.openBrowser ?? openInBrowser;
      const html = generatePRDPreviewHtml(prdContent, appName);
      const tmpFile = path.join(os.tmpdir(), `agentforge-prd-preview-${Date.now()}.html`);
      nodeFs.writeFileSync(tmpFile, html, 'utf-8');

      const browserOpened = await browserFn(`file://${tmpFile}`);
      if (browserOpened) {
        output.write(infoMsg('PRD preview opened in browser.\n'));
      } else {
        output.write(infoMsg('\n--- PRD Preview ---\n'));
        output.write(prdContent);
        output.write(infoMsg('\n--- End Preview ---\n'));
      }

      const save = await promptOnce(rl, '\nSave to docs/prd.md? (y/n): ');

      // Clean up temp file
      try { nodeFs.unlinkSync(tmpFile); } catch { /* ignore */ }

      if (save.toLowerCase() !== 'y') {
        output.write(infoMsg('Discarded.\n'));
        return;
      }

      // Ensure docs/ directory exists and write PRD
      const docsDir = path.join(rootDir, 'docs');
      fileSystem.mkdir(docsDir);
      fileSystem.writeFile(path.join(docsDir, 'prd.md'), prdContent);

      output.write(successMsg('✓ PRD saved to docs/prd.md\n'));
      output.write(infoMsg('Next: Run `agentforge design:generate`\n'));
    }
  } finally {
    rl.close();
  }
}
