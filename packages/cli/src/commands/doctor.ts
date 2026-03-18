/**
 * @module @agentforge/cli/commands/doctor
 *
 * The `agentforge doctor` command. Validates that configured integrations
 * (LLM providers, channels) are reachable with the credentials in .env.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { createClaudeProvider, createOpenAIProvider } from '@agentforge/providers';
import type { ProviderConfig } from '@agentforge/providers';
import { successMsg, errorMsg, infoMsg, warnMsg } from '../formatter.js';
import { readYaml, type FileSystem, realFs } from '../fs-utils.js';
import type { ProjectManifest } from '../types.js';

/** Result of a single integration check. */
interface CheckResult {
  readonly name: string;
  readonly status: 'pass' | 'fail' | 'skip';
  readonly message: string;
}

/**
 * Parse a .env file into a key-value map.
 * Handles comments, blank lines, and quoted values.
 */
function parseEnvFile(filePath: string): Map<string, string> {
  const vars = new Map<string, string>();
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return vars;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && value) {
      vars.set(key, value);
    }
  }
  return vars;
}

/**
 * Get an env var value, checking .env file first, then process.env.
 */
function getEnv(key: string, envFile: Map<string, string>): string | undefined {
  return envFile.get(key) || process.env[key] || undefined;
}

/**
 * Check Anthropic Claude connectivity.
 */
async function checkAnthropic(envFile: Map<string, string>): Promise<CheckResult> {
  const apiKey = getEnv('ANTHROPIC_API_KEY', envFile);
  if (!apiKey) {
    return { name: 'Anthropic Claude', status: 'skip', message: 'ANTHROPIC_API_KEY not set' };
  }

  const config: ProviderConfig = { apiKey };
  const provider = createClaudeProvider('claude-haiku-4', config);

  try {
    const available = await provider.isAvailable();
    if (available) {
      return { name: 'Anthropic Claude', status: 'pass', message: 'API key valid, connection successful' };
    }
    return { name: 'Anthropic Claude', status: 'fail', message: 'API key rejected or provider unreachable' };
  } catch {
    return { name: 'Anthropic Claude', status: 'fail', message: 'Connection failed' };
  }
}

/**
 * Check OpenAI connectivity.
 */
async function checkOpenAI(envFile: Map<string, string>): Promise<CheckResult> {
  const apiKey = getEnv('OPENAI_API_KEY', envFile);
  if (!apiKey) {
    return { name: 'OpenAI', status: 'skip', message: 'OPENAI_API_KEY not set' };
  }

  const config: ProviderConfig = { apiKey };
  const provider = createOpenAIProvider('gpt-4o-mini', config);

  try {
    const available = await provider.isAvailable();
    if (available) {
      return { name: 'OpenAI', status: 'pass', message: 'API key valid, connection successful' };
    }
    return { name: 'OpenAI', status: 'fail', message: 'API key rejected or provider unreachable' };
  } catch {
    return { name: 'OpenAI', status: 'fail', message: 'Connection failed' };
  }
}

/**
 * Check Vertex AI configuration (no live call — checks env vars and ADC file).
 */
function checkVertexAI(envFile: Map<string, string>): CheckResult {
  const useVertex =
    getEnv('AGENTFORGE_USE_VERTEX', envFile) === 'true' ||
    getEnv('CLAUDE_CODE_USE_VERTEX', envFile) === '1' ||
    getEnv('ANTHROPIC_VERTEX_PROJECT_ID', envFile) !== undefined;

  if (!useVertex) {
    return { name: 'Google Vertex AI', status: 'skip', message: 'Vertex AI not configured' };
  }

  const projectId =
    getEnv('AGENTFORGE_VERTEX_PROJECT_ID', envFile) ||
    getEnv('ANTHROPIC_VERTEX_PROJECT_ID', envFile) ||
    getEnv('GOOGLE_CLOUD_PROJECT', envFile);

  if (!projectId) {
    return { name: 'Google Vertex AI', status: 'fail', message: 'Vertex enabled but no project ID set' };
  }

  // Check for ADC credentials file
  const credFile = getEnv('GOOGLE_APPLICATION_CREDENTIALS', envFile);
  const defaultAdcPath = path.join(
    process.env.HOME || '~',
    '.config', 'gcloud', 'application_default_credentials.json',
  );
  const hasCredFile = credFile ? fs.existsSync(credFile) : false;
  const hasDefaultAdc = fs.existsSync(defaultAdcPath);

  if (!hasCredFile && !hasDefaultAdc) {
    return {
      name: 'Google Vertex AI',
      status: 'fail',
      message: `Project: ${projectId}, but no ADC credentials found. Run: gcloud auth application-default login`,
    };
  }

  const region =
    getEnv('AGENTFORGE_VERTEX_REGION', envFile) ||
    getEnv('CLOUD_ML_REGION', envFile) ||
    'us-central1';

  return {
    name: 'Google Vertex AI',
    status: 'pass',
    message: `Project: ${projectId}, Region: ${region}, ADC credentials found`,
  };
}

/**
 * Check Slack integration.
 */
function checkSlack(envFile: Map<string, string>): CheckResult {
  const botToken = getEnv('AGENTFORGE_SLACK_BOT_TOKEN', envFile);
  const appToken = getEnv('AGENTFORGE_SLACK_APP_TOKEN', envFile);

  if (!botToken && !appToken) {
    return { name: 'Slack', status: 'skip', message: 'No Slack tokens configured' };
  }

  const issues: string[] = [];
  if (!botToken) issues.push('AGENTFORGE_SLACK_BOT_TOKEN missing');
  if (!appToken) issues.push('AGENTFORGE_SLACK_APP_TOKEN missing');

  if (issues.length > 0) {
    return { name: 'Slack', status: 'fail', message: issues.join(', ') };
  }

  // Validate token format
  if (!botToken!.startsWith('xoxb-')) {
    return { name: 'Slack', status: 'fail', message: 'Bot token should start with xoxb-' };
  }
  if (!appToken!.startsWith('xapp-')) {
    return { name: 'Slack', status: 'fail', message: 'App token should start with xapp-' };
  }

  return { name: 'Slack', status: 'pass', message: 'Bot and app tokens configured' };
}

/**
 * Check Telegram integration.
 */
function checkTelegram(envFile: Map<string, string>): CheckResult {
  const token = getEnv('AGENTFORGE_TELEGRAM_BOT_TOKEN', envFile);

  if (!token) {
    return { name: 'Telegram', status: 'skip', message: 'AGENTFORGE_TELEGRAM_BOT_TOKEN not set' };
  }

  // Basic format validation: <bot_id>:<hash>
  if (!token.includes(':')) {
    return { name: 'Telegram', status: 'fail', message: 'Token format invalid (expected <id>:<hash>)' };
  }

  return { name: 'Telegram', status: 'pass', message: 'Bot token configured' };
}

/**
 * Check Figma integration.
 */
function checkFigma(envFile: Map<string, string>): CheckResult {
  const token = getEnv('FIGMA_ACCESS_TOKEN', envFile);

  if (!token) {
    return { name: 'Figma', status: 'skip', message: 'FIGMA_ACCESS_TOKEN not set' };
  }

  return { name: 'Figma', status: 'pass', message: 'Access token configured' };
}

/** Format a check result line for terminal output. */
function formatResult(result: CheckResult): string {
  const statusIcon =
    result.status === 'pass' ? '\x1b[32m PASS \x1b[0m' :
    result.status === 'fail' ? '\x1b[31m FAIL \x1b[0m' :
    '\x1b[90m SKIP \x1b[0m';

  return `  ${statusIcon}  ${result.name.padEnd(20)} ${result.message}`;
}

/**
 * Execute the doctor command.
 */
export async function doctorCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  output.write('\n');
  output.write(infoMsg('AgentForge Doctor — checking integrations...\n'));
  output.write('\n');

  // Check for agentforge.yaml
  const manifestPath = path.join(rootDir, 'agentforge.yaml');
  const manifestResult = readYaml<ProjectManifest>(manifestPath, fileSystem);
  if (!manifestResult.ok) {
    output.write(errorMsg('No agentforge.yaml found. Run "agentforge init" first.\n'));
    process.exitCode = 1;
    return;
  }

  // Load .env file
  const envPath = path.join(rootDir, '.env');
  const envFile = parseEnvFile(envPath);
  if (envFile.size === 0 && !fs.existsSync(envPath)) {
    output.write(warnMsg('No .env file found. Checking process environment only.\n'));
  }
  output.write('\n');

  // Run all checks
  output.write('\x1b[1mLLM Providers\x1b[0m\n');
  output.write(`  ${'─'.repeat(60)}\n`);

  const providerChecks = await Promise.all([
    checkAnthropic(envFile),
    checkOpenAI(envFile),
  ]);
  // Vertex is sync (no API call)
  providerChecks.push(checkVertexAI(envFile));

  for (const result of providerChecks) {
    output.write(formatResult(result) + '\n');
  }

  output.write('\n');
  output.write('\x1b[1mChannels & Integrations\x1b[0m\n');
  output.write(`  ${'─'.repeat(60)}\n`);

  const channelChecks = [
    checkSlack(envFile),
    checkTelegram(envFile),
    checkFigma(envFile),
  ];

  for (const result of channelChecks) {
    output.write(formatResult(result) + '\n');
  }

  // Summary
  const allResults = [...providerChecks, ...channelChecks];
  const passed = allResults.filter((r) => r.status === 'pass').length;
  const failed = allResults.filter((r) => r.status === 'fail').length;
  const skipped = allResults.filter((r) => r.status === 'skip').length;

  output.write('\n');
  if (failed > 0) {
    output.write(errorMsg(`${failed} check(s) failed. Fix the issues above and run "agentforge doctor" again.\n`));
    process.exitCode = 1;
  } else if (passed === 0) {
    output.write(warnMsg('No integrations configured. Add API keys to your .env file.\n'));
  } else {
    output.write(successMsg(`All ${passed} configured integration(s) passed.`));
    if (skipped > 0) {
      output.write(` (${skipped} skipped — not configured)`);
    }
    output.write('\n');
  }
  output.write('\n');
}
