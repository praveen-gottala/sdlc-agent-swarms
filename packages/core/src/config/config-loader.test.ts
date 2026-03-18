import { loadProjectManifest } from './config-loader.js';
import type { FileSystem } from '../fs/file-system.js';
import { Ok, Err } from '../types/result.js';

/**
 * Create an in-memory FileSystem backed by a Map for unit testing.
 */
function createMockFs(files: Map<string, string> = new Map()): FileSystem {
  return {
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `File not found: ${filePath}`,
          recoverable: false,
        });
      }
      return Ok(content);
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return Ok(undefined);
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return Ok(undefined);
    },
    exists(filePath: string) {
      return files.has(filePath);
    },
    mkdir() {
      return Ok(undefined);
    },
    rename(oldPath: string, newPath: string) {
      const c = files.get(oldPath);
      if (c === undefined) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `File not found: ${oldPath}`,
          recoverable: false,
        });
      }
      files.set(newPath, c);
      files.delete(oldPath);
      return Ok(undefined);
    },
    remove(filePath: string) {
      files.delete(filePath);
      return Ok(undefined);
    },
    listDir() {
      return Ok([...files.keys()]);
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return Ok(undefined);
    },
  };
}

const VALID_MANIFEST = `
version: "1.0"
project:
  name: test-project
  id: test-001
  platforms:
    - web
stack:
  frontend: react
  backend: node
  database: postgres
  styling: tailwind
repo:
  provider: github
  org: test-org
  name: test-repo
agents:
  providers:
    default: openai
  sandbox:
    type: docker
    timeout_minutes: 10
    max_retries: 3
  orchestration:
    max_concurrent_agents: 4
    ci_wait_strategy: poll
hitl:
  default: standard
channels:
  - type: cli
    capabilities: basic
    priority: 1
routing:
  approval_requests: primary
  status_updates: primary
  critical_alerts: all
budget:
  per_task_max_usd: 5
  per_phase_max_usd: 20
  monthly_max_usd: 100
  alert_threshold: 0.8
`;

describe('loadProjectManifest', () => {
  it('successfully loads a valid manifest', () => {
    const files = new Map([['/project/agentforge.yaml', VALID_MANIFEST]]);
    const fs = createMockFs(files);

    const result = loadProjectManifest('/project', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe('1.0');
      expect(result.value.project.name).toBe('test-project');
      expect(result.value.project.id).toBe('test-001');
    }
  });

  it('returns error for missing file', () => {
    const fs = createMockFs();

    const result = loadProjectManifest('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('agentforge.yaml');
    }
  });

  it('returns error for missing version field', () => {
    const yaml = `
project:
  name: test-project
  id: test-001
`;
    const files = new Map([['/project/agentforge.yaml', yaml]]);
    const fs = createMockFs(files);

    const result = loadProjectManifest('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('version');
    }
  });

  it('returns error for missing project.name field', () => {
    const yaml = `
version: "1.0"
project:
  id: test-001
`;
    const files = new Map([['/project/agentforge.yaml', yaml]]);
    const fs = createMockFs(files);

    const result = loadProjectManifest('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('project.name');
    }
  });

  it('returns error for invalid YAML', () => {
    const files = new Map([['/project/agentforge.yaml', '{ invalid yaml: [: }']]);
    const fs = createMockFs(files);

    const result = loadProjectManifest('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
    }
  });
});
