/**
 * @module @agentforge/core/fs/yaml-utils
 *
 * YAML read/write utilities built on top of the FileSystem interface.
 * Uses the Result pattern for error handling.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from './file-system.js';

/**
 * Read and parse a YAML file into a typed value.
 *
 * @param filePath - Path to the YAML file
 * @param fs - FileSystem implementation to use for reading
 * @returns Parsed value on success, or an error Result
 */
export function readYaml<T>(filePath: string, fs: FileSystem): Result<T> {
  const result = fs.readFile(filePath);
  if (!result.ok) return result;
  try {
    const parsed = parseYaml(result.value) as T;
    return Ok(parsed);
  } catch (err) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to parse YAML ${filePath}: ${(err as Error).message}`,
      recoverable: false,
    });
  }
}

/**
 * Serialize data to YAML and write it atomically to a file.
 *
 * @param filePath - Path to write the YAML file
 * @param data - Data to serialize
 * @param fs - FileSystem implementation to use for writing
 * @returns Void on success, or an error Result
 */
export function writeYaml(filePath: string, data: unknown, fs: FileSystem): Result<void> {
  try {
    const content = stringifyYaml(data, { lineWidth: 120 });
    return fs.writeFileAtomic(filePath, content);
  } catch (err) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to stringify YAML for ${filePath}: ${(err as Error).message}`,
      recoverable: false,
    });
  }
}
