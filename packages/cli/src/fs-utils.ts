/**
 * @module @agentforge/cli/fs-utils
 *
 * Filesystem utilities. Core types delegated to @agentforge/core,
 * CLI-specific utilities (findProjectRoot) remain local.
 */

import * as path from 'node:path';
import * as nodeFs from 'node:fs';
import {
  createRealFs,
  readYaml as coreReadYaml,
  writeYaml as coreWriteYaml,
} from '@agentforge/core';
import type { FileSystem, Result } from '@agentforge/core';

// Re-export core types for backward compatibility
export type { FileSystem } from '@agentforge/core';

/** Real filesystem instance. */
export const realFs: FileSystem = createRealFs();

/**
 * Read and parse a YAML file.
 */
export function readYaml<T>(filePath: string, fileSystem: FileSystem = realFs): Result<T> {
  return coreReadYaml<T>(filePath, fileSystem);
}

/**
 * Serialize data and write to a YAML file.
 */
export function writeYaml(filePath: string, data: unknown, fileSystem: FileSystem = realFs): Result<void> {
  return coreWriteYaml(filePath, data, fileSystem);
}

/**
 * Resolve the project root by walking up from cwd looking for agentforge.yaml.
 * Returns cwd if no manifest found (for init command).
 */
/**
 * Load a .env file into process.env. Keys already set in process.env are NOT overwritten.
 * Handles comments, blank lines, and quoted values.
 */
export function loadDotEnv(projectRoot: string): void {
  const envPath = path.join(projectRoot, '.env');
  let content: string;
  try {
    content = nodeFs.readFileSync(envPath, 'utf-8');
  } catch {
    return; // no .env file — nothing to load
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

    // Don't overwrite existing env vars
    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function findProjectRoot(cwd: string = process.cwd(), fileSystem: FileSystem = realFs): string {
  let dir = cwd;
  while (true) {
    if (fileSystem.exists(path.join(dir, 'agentforge.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}
