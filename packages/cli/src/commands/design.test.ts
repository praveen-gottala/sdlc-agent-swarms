import { designCommand } from './design.js';
import type { FileSystem } from '../fs-utils.js';
import { stringify } from 'yaml';

// ============================================================================
// Helpers
// ============================================================================

const createMockFs = (): FileSystem => {
  const files = new Map<string, string>();
  files.set('/tmp/project/agentforge.yaml', stringify({
    version: '1.0',
    project: { name: 'TestProject', description: 'Test', platforms: ['web'], id: 'proj_test_123' },
    stack: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
    repo: { provider: 'github', org: 'test', name: 'project' },
    agents: { providers: { default: 'claude-sonnet-4' }, orchestration: { max_concurrent_agents: 5 } },
    hitl: { default: 'review_and_override', overrides: {} },
    channels: [],
    budget: { per_task_max_usd: 2.0, per_phase_max_usd: 25.0, monthly_max_usd: 200.0, alert_threshold: 0.8 },
  }));
  files.set('/tmp/project/agentforge/spec/pages.yaml', stringify({ pages: [] }));
  files.set('/tmp/project/agentforge.tasks.yaml', stringify({ tasks: [] }));

  return {
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false } };
      }
      return { ok: true as const, value: content };
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    exists(filePath: string) {
      return files.has(filePath);
    },
    mkdir(_dirPath: string) {
      return { ok: true as const, value: undefined };
    },
    rename(_oldPath: string, _newPath: string) {
      return { ok: true as const, value: undefined };
    },
    remove(filePath: string) {
      files.delete(filePath);
      return { ok: true as const, value: undefined };
    },
    listDir(_dirPath: string) {
      return { ok: true as const, value: [] as readonly string[] };
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return { ok: true as const, value: undefined };
    },
  };
};

const createOutputStream = (): NodeJS.WritableStream & { output: string } => {
  let output = '';
  return {
    output,
    write(chunk: string | Uint8Array) {
      output += String(chunk);
      (this as { output: string }).output = output;
      return true;
    },
  } as NodeJS.WritableStream & { output: string };
};

// ============================================================================
// Tests
// ============================================================================

describe('designCommand', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('creates a design request and outputs confirmation', async () => {
    const fs = createMockFs();
    const out = createOutputStream();

    await designCommand('User dashboard page', '/tmp/project', fs, out);

    expect(out.output).toContain('TestProject');
    expect(out.output).toContain('Design request created');
    expect(out.output).toContain('Page ID:');
    expect(out.output).toContain('Task ID:');
  });

  it('shows error when no manifest found', async () => {
    const fs = createMockFs();
    // Remove the manifest
    fs.remove('/tmp/project/agentforge.yaml');
    const out = createOutputStream();

    await designCommand('Test page', '/tmp/project', fs, out);

    expect(out.output).toContain('No agentforge.yaml found');
  });
});
