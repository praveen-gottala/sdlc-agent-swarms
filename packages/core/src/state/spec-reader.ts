/**
 * @module @agentforge/core/state/spec-reader
 *
 * Reads spec YAML files from a project's spec directory.
 * Missing individual files are treated as undefined, not errors.
 */

import * as path from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';
import { readYaml } from '../fs/yaml-utils.js';

/**
 * Represents the collection of spec files in a project.
 * Missing files are undefined (not errors).
 */
export interface SpecFiles {
  readonly project?: unknown;
  readonly pages?: unknown;
  readonly api?: unknown;
  readonly models?: unknown;
  readonly components: Readonly<Record<string, unknown>>;
}

/**
 * Read all spec files from the spec directory.
 * Missing individual files are treated as undefined, not errors.
 * Only returns an error if the spec directory itself doesn't exist.
 */
export const readSpecs = (specDir: string, fs: FileSystem): Result<SpecFiles> => {
  if (!fs.exists(specDir)) {
    return Err({ code: 'INVALID_STATE' as const, message: `Spec directory not found: ${specDir}`, recoverable: false });
  }

  const readOptional = (name: string): unknown | undefined => {
    const filePath = path.join(specDir, `${name}.yaml`);
    if (!fs.exists(filePath)) return undefined;
    const result = readYaml<unknown>(filePath, fs);
    return result.ok ? result.value : undefined;
  };

  // Read component files from components/ subdirectory
  const components: Record<string, unknown> = {};
  const componentsDir = path.join(specDir, 'components');
  if (fs.exists(componentsDir)) {
    const listResult = fs.listDir(componentsDir);
    if (listResult.ok) {
      for (const file of listResult.value) {
        if (file.endsWith('.yaml')) {
          const name = file.replace('.yaml', '');
          const compResult = readYaml<unknown>(path.join(componentsDir, file), fs);
          if (compResult.ok) {
            components[name] = compResult.value;
          }
        }
      }
    }
  }

  return Ok({
    project: readOptional('project'),
    pages: readOptional('pages'),
    api: readOptional('api'),
    models: readOptional('models'),
    components,
  });
};

/**
 * Read a single spec file by name.
 */
export const readSpecFile = (specDir: string, name: string, fs: FileSystem): Result<unknown> => {
  const filePath = path.join(specDir, `${name}.yaml`);
  return readYaml<unknown>(filePath, fs);
};
