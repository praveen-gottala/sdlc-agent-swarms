/**
 * @module @agentforge/core/state/lock-manager
 *
 * File-level lock manager using YAML lock files.
 * Supports TTL-based expiration and per-agent ownership.
 */

import * as path from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';
import { readYaml, writeYaml } from '../fs/yaml-utils.js';

/**
 * Information about an acquired lock.
 */
export interface LockInfo {
  readonly filePath: string;
  readonly agentId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

/**
 * Sanitize a file path to create a valid lock file name.
 * Replaces path separators and special chars with underscores.
 */
const sanitizePath = (filePath: string): string =>
  filePath.replace(/[/\\:*?"<>|. ]/g, '_');

/**
 * Get the lock file path for a given target file.
 */
const lockFilePath = (targetPath: string, lockDir: string): string =>
  path.join(lockDir, `${sanitizePath(targetPath)}.lock.yaml`);

/**
 * Acquire a lock on a file. Returns error if already locked by another agent.
 */
export const acquireLock = (
  filePath: string,
  agentId: string,
  lockDir: string,
  ttlMs: number,
  fs: FileSystem,
): Result<LockInfo> => {
  // Ensure lock directory exists
  if (!fs.exists(lockDir)) {
    const mkdirResult = fs.mkdir(lockDir);
    if (!mkdirResult.ok) return mkdirResult as Result<never>;
  }

  const lockPath = lockFilePath(filePath, lockDir);

  // Check existing lock
  if (fs.exists(lockPath)) {
    const existing = readYaml<LockInfo>(lockPath, fs);
    if (existing.ok) {
      const expiresAt = new Date(existing.value.expiresAt);
      if (expiresAt > new Date() && existing.value.agentId !== agentId) {
        return Err({
          code: 'SPEC_LOCK_FAILED' as const,
          message: `File ${filePath} is locked by ${existing.value.agentId} until ${existing.value.expiresAt}`,
          context: { lockedBy: existing.value.agentId, expiresAt: existing.value.expiresAt },
          recoverable: true,
          agentId,
        });
      }
    }
  }

  const now = new Date();
  const lockInfo: LockInfo = {
    filePath,
    agentId,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  const writeResult = writeYaml(lockPath, lockInfo, fs);
  if (!writeResult.ok) return writeResult as Result<never>;

  return Ok(lockInfo);
};

/**
 * Release a lock on a file. Only the agent that acquired it can release it.
 */
export const releaseLock = (
  filePath: string,
  agentId: string,
  lockDir: string,
  fs: FileSystem,
): Result<void> => {
  const lockPath = lockFilePath(filePath, lockDir);

  if (!fs.exists(lockPath)) {
    return Ok(undefined); // No lock to release
  }

  const existing = readYaml<LockInfo>(lockPath, fs);
  if (existing.ok && existing.value.agentId !== agentId) {
    return Err({
      code: 'SPEC_LOCK_FAILED' as const,
      message: `Cannot release lock on ${filePath}: locked by ${existing.value.agentId}, not ${agentId}`,
      recoverable: false,
      agentId,
    });
  }

  return fs.remove(lockPath);
};

/**
 * Check if a file is currently locked (non-expired).
 */
export const isLocked = (
  filePath: string,
  lockDir: string,
  fs: FileSystem,
): Result<LockInfo | null> => {
  const lockPath = lockFilePath(filePath, lockDir);

  if (!fs.exists(lockPath)) return Ok(null);

  const existing = readYaml<LockInfo>(lockPath, fs);
  if (!existing.ok) return Ok(null); // Corrupted lock file = no lock

  if (new Date(existing.value.expiresAt) <= new Date()) {
    return Ok(null); // Expired
  }

  return Ok(existing.value);
};

/**
 * Clean up expired lock files. Returns count of cleaned locks.
 */
export const cleanExpiredLocks = (
  lockDir: string,
  fs: FileSystem,
): Result<number> => {
  if (!fs.exists(lockDir)) return Ok(0);

  const listResult = fs.listDir(lockDir);
  if (!listResult.ok) return listResult as Result<never>;

  let cleaned = 0;
  for (const file of listResult.value) {
    if (!file.endsWith('.lock.yaml')) continue;
    const lockPath = path.join(lockDir, file);
    const lockResult = readYaml<LockInfo>(lockPath, fs);
    if (lockResult.ok && new Date(lockResult.value.expiresAt) <= new Date()) {
      const removeResult = fs.remove(lockPath);
      if (removeResult.ok) cleaned++;
    }
  }

  return Ok(cleaned);
};
