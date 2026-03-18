/**
 * @module @agentforge/core/config/config-loader
 *
 * Load and validate the agentforge.yaml project manifest.
 */

import * as path from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { ProjectManifest } from '../types/project-manifest.js';
import type { FileSystem } from '../fs/file-system.js';
import { readYaml } from '../fs/yaml-utils.js';

/**
 * Load and validate the project manifest from agentforge.yaml.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param fs - FileSystem implementation to use for reading
 * @returns The parsed and validated ProjectManifest, or an error Result
 */
export const loadProjectManifest = (
  projectRoot: string,
  fs: FileSystem,
): Result<ProjectManifest> => {
  const filePath = path.join(projectRoot, 'agentforge.yaml');
  const result = readYaml<ProjectManifest>(filePath, fs);
  if (!result.ok) return result;

  const manifest = result.value;
  if (!manifest.version) {
    return Err({
      code: 'INVALID_STATE',
      message: 'agentforge.yaml missing required field: version',
      recoverable: false,
    });
  }
  if (!manifest.project?.name) {
    return Err({
      code: 'INVALID_STATE',
      message: 'agentforge.yaml missing required field: project.name',
      recoverable: false,
    });
  }

  return Ok(manifest);
};
