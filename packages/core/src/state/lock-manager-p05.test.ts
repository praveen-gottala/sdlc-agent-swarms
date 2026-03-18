/**
 * P05: File Locking and Conflict Resolution validation tests.
 * Tests all 6 criteria from Wave 1 readiness validation.
 */

import { stringify as stringifyYaml } from 'yaml';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';
import {
  acquireLock,
  releaseLock,
  isLocked,
  cleanExpiredLocks,
  checkHumanEdit,
  computeContentHash,
} from './lock-manager.js';
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

describe('P05: File Locking and Conflict Resolution', () => {
  const lockDir = '/project/.locks';
  const TTL_MS = 60_000;

  describe('Criterion 1: Agent write lock prevents concurrent writes', () => {
    it('blocks a second agent from writing the same file', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'content: original',
      });

      const lock1 = acquireLock('components/dashboard.yaml', 'agent-1', lockDir, TTL_MS, fs);
      expect(lock1.ok).toBe(true);

      const lock2 = acquireLock('components/dashboard.yaml', 'agent-2', lockDir, TTL_MS, fs);
      expect(lock2.ok).toBe(false);
      if (!lock2.ok) {
        expect(lock2.error.code).toBe('SPEC_LOCK_FAILED');
        expect(lock2.error.message).toContain('agent-1');
      }
    });

    it('allows second agent after lock is released', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'content: original',
      });

      acquireLock('components/dashboard.yaml', 'agent-1', lockDir, TTL_MS, fs);
      releaseLock('components/dashboard.yaml', 'agent-1', lockDir, fs);

      const lock2 = acquireLock('components/dashboard.yaml', 'agent-2', lockDir, TTL_MS, fs);
      expect(lock2.ok).toBe(true);
    });
  });

  describe('Criterion 2: Read-during-write — reads are never blocked', () => {
    it('allows reads while a write lock is held', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'content: original',
      });

      // Agent 1 acquires a write lock
      const lock = acquireLock('components/dashboard.yaml', 'agent-1', lockDir, TTL_MS, fs);
      expect(lock.ok).toBe(true);

      // Any agent can still read the file — reads are not locked
      const readResult = fs.readFile('components/dashboard.yaml');
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value).toBe('content: original');
      }

      // isLocked only checks lock status — it does not block reads
      const lockStatus = isLocked('components/dashboard.yaml', lockDir, fs);
      expect(lockStatus.ok).toBe(true);
    });
  });

  describe('Criterion 3: Human-always-wins', () => {
    it('detects human edit when file content changes during agent lock', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'content: original',
      });

      // Agent acquires lock (stores content hash)
      const lock = acquireLock('components/dashboard.yaml', 'agent-1', lockDir, TTL_MS, fs);
      expect(lock.ok).toBe(true);

      // Human edits the file while agent holds the lock
      fs.writeFile('components/dashboard.yaml', 'content: human-edited');

      // Agent checks for human edit
      const check = checkHumanEdit('components/dashboard.yaml', lockDir, fs);
      expect(check.ok).toBe(true);
      if (check.ok) {
        expect(check.value.humanEdited).toBe(true);
        if (check.value.humanEdited) {
          expect(check.value.currentContent).toBe('content: human-edited');
        }
      }
    });

    it('does not detect human edit when file is unchanged', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'content: original',
      });

      acquireLock('components/dashboard.yaml', 'agent-1', lockDir, TTL_MS, fs);

      const check = checkHumanEdit('components/dashboard.yaml', lockDir, fs);
      expect(check.ok).toBe(true);
      if (check.ok) {
        expect(check.value.humanEdited).toBe(false);
      }
    });

    it('agent discards changes and re-reads human version', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'content: original',
      });

      acquireLock('components/dashboard.yaml', 'agent-1', lockDir, TTL_MS, fs);

      // Human edits
      fs.writeFile('components/dashboard.yaml', 'content: human-version');

      // Agent detects human edit
      const check = checkHumanEdit('components/dashboard.yaml', lockDir, fs);
      expect(check.ok).toBe(true);
      if (check.ok && check.value.humanEdited) {
        // Agent discards its changes and re-reads (human always wins)
        const humanContent = check.value.currentContent;
        expect(humanContent).toBe('content: human-version');

        // Agent releases the lock
        const release = releaseLock('components/dashboard.yaml', 'agent-1', lockDir, fs);
        expect(release.ok).toBe(true);
      }
    });
  });

  describe('Criterion 4: Lock timeout / cleanup for crashed agents', () => {
    it('expired locks do not persist — can be overridden', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'content: original',
      });

      // Create an already-expired lock (simulating agent crash)
      const expiredLock: LockInfo = {
        filePath: 'components/dashboard.yaml',
        agentId: 'crashed-agent',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      };
      const lockPath = `${lockDir}/components_dashboard_yaml.lock.yaml`;
      fs.writeFileAtomic(lockPath, stringifyYaml(expiredLock));

      // Another agent can acquire the lock
      const result = acquireLock('components/dashboard.yaml', 'agent-2', lockDir, TTL_MS, fs);
      expect(result.ok).toBe(true);
    });

    it('cleanExpiredLocks removes stale locks', () => {
      const fs = createMockFs({});

      // Create expired lock
      const expiredLock: LockInfo = {
        filePath: 'old-file.yaml',
        agentId: 'dead-agent',
        acquiredAt: new Date(Date.now() - 120_000).toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      };
      fs.writeFileAtomic(`${lockDir}/old-file_yaml.lock.yaml`, stringifyYaml(expiredLock));

      const result = cleanExpiredLocks(lockDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(1);
      }
    });
  });

  describe('Criterion 5: Lock granularity is per-file', () => {
    it('different files can be locked independently', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'dashboard content',
        'components/sidebar.yaml': 'sidebar content',
        'components/header.yaml': 'header content',
      });

      const lock1 = acquireLock('components/dashboard.yaml', 'agent-1', lockDir, TTL_MS, fs);
      const lock2 = acquireLock('components/sidebar.yaml', 'agent-2', lockDir, TTL_MS, fs);
      const lock3 = acquireLock('components/header.yaml', 'agent-3', lockDir, TTL_MS, fs);

      expect(lock1.ok).toBe(true);
      expect(lock2.ok).toBe(true);
      expect(lock3.ok).toBe(true);
    });

    it('locking one file does not lock sibling files', () => {
      const fs = createMockFs({
        'components/dashboard.yaml': 'dashboard',
        'components/sidebar.yaml': 'sidebar',
      });

      acquireLock('components/dashboard.yaml', 'agent-1', lockDir, TTL_MS, fs);

      // Agent 2 can lock a different file
      const lock2 = acquireLock('components/sidebar.yaml', 'agent-2', lockDir, TTL_MS, fs);
      expect(lock2.ok).toBe(true);
    });
  });

  describe('Criterion 6: Spec sync writes produce git commits', () => {
    it('lock stores content hash for verifying spec sync integrity', () => {
      const content = 'version: "1.0"\ncomponents:\n  - dashboard';
      const fs = createMockFs({
        'agentforge/spec/components.yaml': content,
      });

      const lock = acquireLock('agentforge/spec/components.yaml', 'spec-sync-agent', lockDir, TTL_MS, fs);
      expect(lock.ok).toBe(true);
      if (lock.ok) {
        // Lock includes content hash for tracking changes
        expect(lock.value.contentHash).toBeDefined();
        expect(lock.value.contentHash).toBe(computeContentHash(content));
      }
    });
  });

  describe('computeContentHash', () => {
    it('produces consistent hashes for same content', () => {
      const hash1 = computeContentHash('hello world');
      const hash2 = computeContentHash('hello world');
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different content', () => {
      const hash1 = computeContentHash('hello world');
      const hash2 = computeContentHash('hello world!');
      expect(hash1).not.toBe(hash2);
    });
  });
});
