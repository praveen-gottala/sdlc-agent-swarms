/**
 * @module @agentforge/core/fs/file-system
 *
 * FileSystem interface and real implementation for filesystem operations.
 * All fallible operations use the Result pattern instead of throwing.
 */

import * as fs from 'node:fs';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';

/**
 * Abstraction over filesystem operations.
 * Enables dependency injection and testing with in-memory implementations.
 */
export interface FileSystem {
  /** Read a file's contents as a UTF-8 string. */
  readFile(filePath: string): Result<string>;
  /** Write content to a file, creating or overwriting it. */
  writeFile(filePath: string, content: string): Result<void>;
  /** Write content atomically by writing to a temp file then renaming. */
  writeFileAtomic(filePath: string, content: string): Result<void>;
  /** Check whether a file or directory exists at the given path. */
  exists(filePath: string): boolean;
  /** Create a directory (and parents) at the given path. */
  mkdir(dirPath: string): Result<void>;
  /** Rename (move) a file or directory. */
  rename(oldPath: string, newPath: string): Result<void>;
  /** Remove a file or directory. */
  remove(filePath: string): Result<void>;
  /** List the entries in a directory. */
  listDir(dirPath: string): Result<readonly string[]>;
  /** Append content to a file. */
  appendFile(filePath: string, content: string): Result<void>;
}

/**
 * Create a FileSystem backed by Node.js `fs` module.
 */
export function createRealFs(): FileSystem {
  return {
    readFile(filePath: string): Result<string> {
      try {
        return Ok(fs.readFileSync(filePath, 'utf-8'));
      } catch (err) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to read ${filePath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
    },

    writeFile(filePath: string, content: string): Result<void> {
      try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return Ok(undefined);
      } catch (err) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to write ${filePath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
    },

    writeFileAtomic(filePath: string, content: string): Result<void> {
      const tmpPath = `${filePath}.tmp.${Math.random().toString(36).slice(2, 8)}`;
      try {
        fs.writeFileSync(tmpPath, content, 'utf-8');
      } catch (err) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to write temp file ${tmpPath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
      try {
        fs.renameSync(tmpPath, filePath);
        return Ok(undefined);
      } catch (err) {
        // Clean up temp file on rename failure
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // ignore cleanup errors
        }
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to rename ${tmpPath} to ${filePath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
    },

    exists(filePath: string): boolean {
      return fs.existsSync(filePath);
    },

    mkdir(dirPath: string): Result<void> {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        return Ok(undefined);
      } catch (err) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to create directory ${dirPath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
    },

    rename(oldPath: string, newPath: string): Result<void> {
      try {
        fs.renameSync(oldPath, newPath);
        return Ok(undefined);
      } catch (err) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to rename ${oldPath} to ${newPath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
    },

    remove(filePath: string): Result<void> {
      try {
        fs.rmSync(filePath, { recursive: true, force: true });
        return Ok(undefined);
      } catch (err) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to remove ${filePath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
    },

    listDir(dirPath: string): Result<readonly string[]> {
      try {
        return Ok(fs.readdirSync(dirPath));
      } catch (err) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to list directory ${dirPath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
    },

    appendFile(filePath: string, content: string): Result<void> {
      try {
        fs.appendFileSync(filePath, content, 'utf-8');
        return Ok(undefined);
      } catch (err) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Failed to append to ${filePath}: ${(err as Error).message}`,
          recoverable: false,
        });
      }
    },
  };
}
