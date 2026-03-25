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
import { prdExists } from '@agentforge/core';
import { createClaudeProvider } from '@agentforge/providers';
import type { LLMProvider } from '@agentforge/providers';
import { resolveCLIModel } from '../utils/resolve-cli-model.js';
import { infoMsg, warnMsg, errorMsg, successMsg } from '../formatter.js';
import type { FileSystem } from '../fs-utils.js';
import { realFs, loadDotEnv } from '../fs-utils.js';
import { openInBrowser } from './generate-design-options.js';

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
): Promise<string | null> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    output.write(errorMsg('ANTHROPIC_API_KEY is required for PRD generation. Set it in your environment.\n'));
    return null;
  }

  let provider: LLMProvider;
  try {
    provider = createClaudeProvider(resolveCLIModel(), { apiKey });
  } catch {
    output.write(warnMsg('Failed to create LLM provider.\n'));
    return null;
  }

  try {
    const result = await provider.complete(
      {
        system: buildPRDSystemPrompt(),
        messages: [{ role: 'user', content: buildPRDUserPrompt(answers) }],
      },
      { model: 'claude-sonnet-4-6', maxTokens: 8192, temperature: 0.7 },
    );

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

/** Render markdown as a simple styled HTML page for preview. */
export function generatePRDPreviewHtml(prdContent: string, appName: string): string {
  // Simple markdown-to-HTML: headers, bold, italic, lists, paragraphs
  const htmlBody = prdContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '')
    ;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PRD Preview — ${appName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      color: #333;
      line-height: 1.6;
    }
    .header {
      background: #1e293b;
      color: #f1f5f9;
      padding: 40px 24px;
      text-align: center;
    }
    .header h1 { font-size: 28px; font-weight: 700; }
    .header p { font-size: 14px; opacity: 0.8; margin-top: 8px; }
    .content {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      background: #fff;
      min-height: 60vh;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .content h1 { font-size: 28px; margin: 32px 0 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
    .content h2 { font-size: 22px; margin: 28px 0 12px; color: #334155; }
    .content h3 { font-size: 18px; margin: 24px 0 8px; color: #475569; }
    .content p { margin: 12px 0; }
    .content ul { margin: 12px 0 12px 24px; }
    .content li { margin: 4px 0; }
    .content strong { color: #1e293b; }
    .footer {
      text-align: center;
      padding: 32px 24px;
      color: #888;
      font-size: 14px;
    }
    .footer kbd {
      background: #e0e0e0;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${appName} — PRD Preview</h1>
    <p>Review the generated PRD below, then return to your terminal.</p>
  </div>
  <div class="content">
    ${htmlBody}
  </div>
  <div class="footer">
    Return to your terminal — type <kbd>y</kbd> to save or <kbd>n</kbd> to discard.
  </div>
</body>
</html>`;
}

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
