import { stringify as stringifyYaml } from 'yaml';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';
import { acquireLock, releaseLock, isLocked, cleanExpiredLocks } from './lock-manager.js';
import type { LockInfo } from './lock-manager.js';

/**
 * Create an in-memory FileSystem backed by a Map for testing.
 */
function createMockFs(files: Record<string, string> = {}): FileSystem {
  const store = new Map<string, string>(Object.entries(files));

  return {
    readFile(filePath: string): Result<string> {
      const content = store.get(filePath);
      if (content === undefined) {
        return Err({ code: 'INVALID_STATE' as const, message: `File not found: ${filePath}`, recoverable: false });
      }
      return Ok(content);
    },
    writeFile(filePath: string, content: string): Result<void> {
      store.set(filePath, content);
      return Ok(undefined);
    },
    writeFileAtomic(filePath: string, content: string): Result<void> {
      store.set(filePath, content);
      return Ok(undefined);
    },
    exists(filePath: string): boolean {
      if (store.has(filePath)) return true;
      const dirPrefix = filePath.endsWith('/') ? filePath : filePath + '/';
      for (const key of store.keys()) {
        if (key.startsWith(dirPrefix)) return true;
      }
      return false;
    },
    mkdir(_dirPath: string): Result<void> {
      return Ok(undefined);
    },
    rename(oldPath: string, newPath: string): Result<void> {
      const content = store.get(oldPath);
      if (content === undefined) {
        return Err({ code: 'INVALID_STATE' as const, message: `File not found: ${oldPath}`, recoverable: false });
      }
      store.set(newPath, content);
      store.delete(oldPath);
      return Ok(undefined);
    },
    remove(filePath: string): Result<void> {
      store.delete(filePath);
      return Ok(undefined);
    },
    listDir(dirPath: string): Result<readonly string[]> {
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      const entries = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const firstSegment = rest.split('/')[0];
          entries.add(firstSegment);
        }
      }
      return Ok([...entries]);
    },
    appendFile(filePath: string, content: string): Result<void> {
      const existing = store.get(filePath) ?? '';
      store.set(filePath, existing + content);
      return Ok(undefined);
    },
  };
}

describe('lock-manager', () => {
  const lockDir = '/project/.locks';
  const TTL_MS = 60_000; // 1 minute

  describe('acquireLock', () => {
    it('creates lock file and returns LockInfo', () => {
      const fs = createMockFs({});

      const result = acquireLock('specs/project.yaml', 'agent-1', lockDir, TTL_MS, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filePath).toBe('specs/project.yaml');
        expect(result.value.agentId).toBe('agent-1');
        expect(result.value.acquiredAt).toBeDefined();
        expect(result.value.expiresAt).toBeDefined();
        // Verify expiration is in the future
        expect(new Date(result.value.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('fails when file is locked by another agent', () => {
      const fs = createMockFs({});

      // Agent 1 acquires the lock
      const first = acquireLock('specs/project.yaml', 'agent-1', lockDir, TTL_MS, fs);
      expect(first.ok).toBe(true);

      // Agent 2 tries to acquire the same lock
      const second = acquireLock('specs/project.yaml', 'agent-2', lockDir, TTL_MS, fs);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error.code).toBe('SPEC_LOCK_FAILED');
        expect(second.error.message).toContain('agent-1');
        expect(second.error.recoverable).toBe(true);
      }
    });

    it('succeeds when existing lock is expired', () => {
      const fs = createMockFs({});

      // Create an already-expired lock
      const expiredLock: LockInfo = {
        filePath: 'specs/project.yaml',
        agentId: 'agent-1',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      };
      // Write the expired lock directly using the sanitized path
      const lockPath = `${lockDir}/specs_project_yaml.lock.yaml`;
      fs.writeFileAtomic(lockPath, stringifyYaml(expiredLock));

      // Agent 2 should be able to acquire the lock
      const result = acquireLock('specs/project.yaml', 'agent-2', lockDir, TTL_MS, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentId).toBe('agent-2');
      }
    });

    it('succeeds when re-acquiring own lock', () => {
      const fs = createMockFs({});

      const first = acquireLock('specs/project.yaml', 'agent-1', lockDir, TTL_MS, fs);
      expect(first.ok).toBe(true);

      // Same agent re-acquires (refreshes) the lock
      const second = acquireLock('specs/project.yaml', 'agent-1', lockDir, TTL_MS, fs);
      expect(second.ok).toBe(true);
      if (second.ok) {
        expect(second.value.agentId).toBe('agent-1');
      }
    });
  });

  describe('releaseLock', () => {
    it('removes lock file', () => {
      const fs = createMockFs({});

      acquireLock('specs/project.yaml', 'agent-1', lockDir, TTL_MS, fs);
      const result = releaseLock('specs/project.yaml', 'agent-1', lockDir, fs);
      expect(result.ok).toBe(true);

      // Verify lock is gone
      const check = isLocked('specs/project.yaml', lockDir, fs);
      expect(check.ok).toBe(true);
      if (check.ok) {
        expect(check.value).toBeNull();
      }
    });

    it('fails when lock is owned by another agent', () => {
      const fs = createMockFs({});

      acquireLock('specs/project.yaml', 'agent-1', lockDir, TTL_MS, fs);
      const result = releaseLock('specs/project.yaml', 'agent-2', lockDir, fs);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SPEC_LOCK_FAILED');
        expect(result.error.message).toContain('agent-1');
      }
    });

    it('succeeds when no lock exists', () => {
      const fs = createMockFs({});

      const result = releaseLock('specs/nonexistent.yaml', 'agent-1', lockDir, fs);
      expect(result.ok).toBe(true);
    });
  });

  describe('isLocked', () => {
    it('returns LockInfo for active lock', () => {
      const fs = createMockFs({});

      acquireLock('specs/project.yaml', 'agent-1', lockDir, TTL_MS, fs);
      const result = isLocked('specs/project.yaml', lockDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value?.agentId).toBe('agent-1');
        expect(result.value?.filePath).toBe('specs/project.yaml');
      }
    });

    it('returns null for expired lock', () => {
      const fs = createMockFs({});

      // Create an already-expired lock
      const expiredLock: LockInfo = {
        filePath: 'specs/project.yaml',
        agentId: 'agent-1',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      };
      const lockPath = `${lockDir}/specs_project_yaml.lock.yaml`;
      fs.writeFileAtomic(lockPath, stringifyYaml(expiredLock));

      const result = isLocked('specs/project.yaml', lockDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('returns null for no lock', () => {
      const fs = createMockFs({});

      const result = isLocked('specs/project.yaml', lockDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('cleanExpiredLocks', () => {
    it('removes expired locks and returns count', () => {
      const fs = createMockFs({});

      // Create one active lock
      acquireLock('specs/project.yaml', 'agent-1', lockDir, TTL_MS, fs);

      // Create two expired locks directly
      const expired1: LockInfo = {
        filePath: 'specs/pages.yaml',
        agentId: 'agent-2',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      };
      const expired2: LockInfo = {
        filePath: 'specs/api.yaml',
        agentId: 'agent-3',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      };
      fs.writeFileAtomic(`${lockDir}/specs_pages_yaml.lock.yaml`, stringifyYaml(expired1));
      fs.writeFileAtomic(`${lockDir}/specs_api_yaml.lock.yaml`, stringifyYaml(expired2));

      const result = cleanExpiredLocks(lockDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(2);
      }

      // Verify the active lock is still there
      const check = isLocked('specs/project.yaml', lockDir, fs);
      expect(check.ok).toBe(true);
      if (check.ok) {
        expect(check.value).not.toBeNull();
      }
    });

    it('returns 0 when lock directory does not exist', () => {
      const fs = createMockFs({});

      const result = cleanExpiredLocks('/nonexistent', fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });
});
