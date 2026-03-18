/**
 * @module @agentforge/core/state/lock-manager
 *
 * File-level lock manager using YAML lock files.
 * Supports TTL-based expiration and per-agent ownership.
 */

import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';
import { readYaml, writeYaml } from '../fs/yaml-utils.js';

/**
 * Information about an acquired lock.
 */
// DEVIATION: ADR-006
// PRD v2.0 Section 8.3 specifies: "human edits detected mid-agent-write take priority unconditionally"
// Implementation: Uses content hashing to detect human edits; git commit operations handled at orchestration layer
// Rationale: see ADR-006
export interface LockInfo {
  readonly filePath: string;
  readonly agentId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
  readonly contentHash?: string;
}

/**
 * Result of checking for human edits during an agent write lock.
 */
export type HumanEditCheckResult =
  | { readonly humanEdited: true; readonly currentContent: string }
  | { readonly humanEdited: false };

/**
 * Compute SHA-256 hash of file content.
 */
export const computeContentHash = (content: string): string =>
  crypto.createHash('sha256').update(content, 'utf-8').digest('hex');

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
  // Compute content hash if file exists for human-edit detection
  let contentHash: string | undefined;
  const fileContent = fs.readFile(filePath);
  if (fileContent.ok) {
    contentHash = computeContentHash(fileContent.value);
  }

  const lockInfo: LockInfo = {
    filePath,
    agentId,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    contentHash,
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

/**
 * Check if a human has edited the file since the lock was acquired.
 * If the current file content hash differs from the hash stored in the lock,
 * a human edit is detected. Per PRD 8.3: "Human always wins" —
 * the agent must discard its changes and re-read the human's version.
 */
export const checkHumanEdit = (
  filePath: string,
  lockDir: string,
  fs: FileSystem,
): Result<HumanEditCheckResult> => {
  const lockPath = lockFilePath(filePath, lockDir);

  if (!fs.exists(lockPath)) {
    return Ok({ humanEdited: false });
  }

  const lockResult = readYaml<LockInfo>(lockPath, fs);
  if (!lockResult.ok) {
    return Ok({ humanEdited: false });
  }

  const lock = lockResult.value;
  if (!lock.contentHash) {
    return Ok({ humanEdited: false });
  }

  const fileContent = fs.readFile(filePath);
  if (!fileContent.ok) {
    return Ok({ humanEdited: false });
  }

  const currentHash = computeContentHash(fileContent.value);
  if (currentHash !== lock.contentHash) {
    return Ok({ humanEdited: true, currentContent: fileContent.value });
  }

  return Ok({ humanEdited: false });
};
