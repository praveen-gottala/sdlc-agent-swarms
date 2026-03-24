/**
 * @module @agentforge/cli/commands/doctor.test
 *
 * Tests for the `agentforge doctor` command.
 */

import * as fs from 'node:fs';
import { doctorCommand } from './doctor.js';
import type { FileSystem } from '../fs-utils.js';

// Mock fs.readFileSync and fs.existsSync for .env parsing
jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return {
    ...actual,
    readFileSync: jest.fn(),
    existsSync: jest.fn(),
  };
});

// Mock engine-setup to avoid real Python/filesystem checks
jest.mock('../engine-setup.js', () => ({
  checkPrerequisites: jest.fn().mockReturnValue({
    ready: true,
    checks: [
      { name: 'Python', status: 'pass', message: 'Python 3.12.1' },
      { name: 'pip', status: 'pass', message: 'pip 24.0' },
      { name: 'Engine source', status: 'pass', message: '/engine' },
      { name: 'Virtual environment', status: 'pass', message: 'Dependencies installed' },
    ],
    engineDir: '/engine',
    venvDir: '/engine/.venv',
  }),
}));

// Mock the providers to avoid real API calls
jest.mock('@agentforge/providers', () => ({
  createClaudeProvider: jest.fn(),
  createOpenAIProvider: jest.fn(),
  detectVertexConfig: jest.fn(),
  ProviderRegistry: jest.fn(),
}));

import { createClaudeProvider, createOpenAIProvider } from '@agentforge/providers';

const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockCreateClaude = createClaudeProvider as jest.MockedFunction<typeof createClaudeProvider>;
const mockCreateOpenAI = createOpenAIProvider as jest.MockedFunction<typeof createOpenAIProvider>;

/** Capture output to a buffer. */
function createOutput(): { stream: NodeJS.WritableStream; text: () => string } {
  let buf = '';
  const stream = {
    write(chunk: string) {
      buf += chunk;
      return true;
    },
  } as NodeJS.WritableStream;
  return { stream, text: () => buf };
}

const MANIFEST_YAML = 'version: "1.0"\nproject:\n  name: test\n  id: proj_test\n  platforms: [web]\nstack:\n  frontend: react\n  backend: node\n  database: postgresql\n  styling: tailwind\nrepo:\n  provider: github\n  org: test\n  name: test\nagents:\n  providers:\n    default: claude-sonnet-4\n    overrides: {}\n  sandbox:\n    type: github_actions\n    timeout_minutes: 15\n    max_retries: 3\n  orchestration:\n    max_concurrent_agents: 3\n    ci_wait_strategy: spawn_next\nhitl:\n  default: review_and_override\n  overrides: {}\nchannels: []\nrouting:\n  approval_requests: all\n  status_updates: primary\n  critical_alerts: all\nbudget:\n  per_task_max_usd: 2.0\n  per_phase_max_usd: 25.0\n  monthly_max_usd: 200.0\n  alert_threshold: 0.8\n';

/** Minimal file system mock that has agentforge.yaml. */
function createMockFs(hasManifest = true): FileSystem {
  return {
    exists: (p: string) => hasManifest && p.endsWith('agentforge.yaml'),
    readFile: (p: string) => {
      if (p.endsWith('agentforge.yaml') && hasManifest) {
        return { ok: true as const, value: MANIFEST_YAML };
      }
      return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: `File not found: ${p}`, recoverable: false } };
    },
    writeFile: jest.fn().mockReturnValue({ ok: true, value: undefined }),
    writeFileAtomic: jest.fn().mockReturnValue({ ok: true, value: undefined }),
    mkdir: jest.fn().mockReturnValue({ ok: true, value: undefined }),
    rename: jest.fn().mockReturnValue({ ok: true, value: undefined }),
    remove: jest.fn().mockReturnValue({ ok: true, value: undefined }),
    listDir: jest.fn().mockReturnValue({ ok: true, value: [] }),
    appendFile: jest.fn().mockReturnValue({ ok: true, value: undefined }),
  };
}

describe('doctorCommand', () => {
  const rootDir = '/tmp/test-project';

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no .env file, no ADC
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockExistsSync.mockReturnValue(false);
    process.exitCode = undefined;

    // Clear relevant env vars
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AGENTFORGE_USE_VERTEX;
    delete process.env.CLAUDE_CODE_USE_VERTEX;
    delete process.env.ANTHROPIC_VERTEX_PROJECT_ID;
    delete process.env.AGENTFORGE_SLACK_BOT_TOKEN;
    delete process.env.AGENTFORGE_SLACK_APP_TOKEN;
    delete process.env.AGENTFORGE_TELEGRAM_BOT_TOKEN;
    delete process.env.FIGMA_ACCESS_TOKEN;
  });

  it('should fail if no agentforge.yaml exists', async () => {
    const { stream, text } = createOutput();
    const mockFs = createMockFs(false);

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('agentforge init');
    expect(process.exitCode).toBe(1);
  });

  it('should skip all integrations when no env vars are set', async () => {
    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('SKIP');
    // With infrastructure checks passing, the summary shows those as passing
    expect(text()).toContain('passed');
    expect(text()).toContain('skipped');
  });

  it('should pass Anthropic check when API key is valid', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
    mockCreateClaude.mockReturnValue({
      name: 'claude',
      models: ['claude-haiku-4'],
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockResolvedValue({ ok: true, value: { content: 'OK' } }),
      stream: jest.fn(),
      estimateCost: jest.fn(),
    });

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('PASS');
    expect(text()).toContain('Anthropic Claude');
    expect(text()).toContain('connection successful');
  });

  it('should fail Anthropic check when API key is invalid', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-bad';
    mockCreateClaude.mockReturnValue({
      name: 'claude',
      models: ['claude-haiku-4'],
      isAvailable: jest.fn().mockResolvedValue(false),
      complete: jest.fn().mockResolvedValue({ ok: false, error: { code: 'AUTH_FAILED', message: 'Invalid API key' } }),
      stream: jest.fn(),
      estimateCost: jest.fn(),
    });

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('FAIL');
    expect(text()).toContain('Anthropic Claude');
  });

  it('should pass OpenAI check when API key is valid', async () => {
    process.env.OPENAI_API_KEY = 'sk-test123';
    mockCreateOpenAI.mockReturnValue({
      name: 'openai',
      models: ['gpt-4o-mini'],
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: jest.fn(),
      stream: jest.fn(),
      estimateCost: jest.fn(),
    });

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('PASS');
    expect(text()).toContain('OpenAI');
  });

  it('should read API keys from .env file', async () => {
    mockReadFileSync.mockReturnValue(
      'ANTHROPIC_API_KEY=sk-ant-from-env\nOPENAI_API_KEY=sk-from-env\n',
    );
    mockExistsSync.mockReturnValue(true);

    mockCreateClaude.mockReturnValue({
      name: 'claude',
      models: ['claude-haiku-4'],
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockResolvedValue({ ok: true, value: { content: 'OK' } }),
      stream: jest.fn(),
      estimateCost: jest.fn(),
    });
    mockCreateOpenAI.mockReturnValue({
      name: 'openai',
      models: ['gpt-4o-mini'],
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: jest.fn(),
      stream: jest.fn(),
      estimateCost: jest.fn(),
    });

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    const output = text();
    expect(output).toContain('PASS');
    expect(output).toContain('Anthropic Claude');
    expect(output).toContain('OpenAI');
  });

  it('should validate Slack token format', async () => {
    process.env.AGENTFORGE_SLACK_BOT_TOKEN = 'xoxb-valid';
    process.env.AGENTFORGE_SLACK_APP_TOKEN = 'xapp-valid';

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('PASS');
    expect(text()).toContain('Slack');
  });

  it('should fail Slack check with invalid bot token format', async () => {
    process.env.AGENTFORGE_SLACK_BOT_TOKEN = 'invalid-token';
    process.env.AGENTFORGE_SLACK_APP_TOKEN = 'xapp-valid';

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('FAIL');
    expect(text()).toContain('xoxb-');
    expect(process.exitCode).toBe(1);
  });

  it('should fail Slack check when only one token is set', async () => {
    process.env.AGENTFORGE_SLACK_BOT_TOKEN = 'xoxb-valid';
    // app token missing

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('FAIL');
    expect(text()).toContain('AGENTFORGE_SLACK_APP_TOKEN missing');
  });

  it('should validate Telegram token format', async () => {
    process.env.AGENTFORGE_TELEGRAM_BOT_TOKEN = '123456:ABC-DEF';

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('PASS');
    expect(text()).toContain('Telegram');
  });

  it('should fail Telegram check with invalid token', async () => {
    process.env.AGENTFORGE_TELEGRAM_BOT_TOKEN = 'no-colon-here';

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    expect(text()).toContain('FAIL');
    expect(text()).toContain('Telegram');
    expect(process.exitCode).toBe(1);
  });

  it('should show summary with mixed results', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-valid';
    process.env.AGENTFORGE_TELEGRAM_BOT_TOKEN = 'bad-format';

    mockCreateClaude.mockReturnValue({
      name: 'claude',
      models: ['claude-haiku-4'],
      isAvailable: jest.fn().mockResolvedValue(true),
      complete: jest.fn().mockResolvedValue({ ok: true, value: { content: 'OK' } }),
      stream: jest.fn(),
      estimateCost: jest.fn(),
    });

    const { stream, text } = createOutput();
    const mockFs = createMockFs();

    await doctorCommand(rootDir, mockFs, stream);

    const output = text();
    expect(output).toContain('PASS');
    expect(output).toContain('FAIL');
    expect(output).toContain('check(s) failed');
    expect(process.exitCode).toBe(1);
  });
});
