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
import type { ComponentSpec, ApiSpec, ModelsSpec } from '../types/spec-types.js';
import type { DesignTokensSpec, BrandSpec, ComponentLibrarySpec } from '../types/design-system.js';
import { readYaml } from '../fs/yaml-utils.js';

/**
 * Represents the collection of spec files in a project.
 * Missing files are undefined (not errors).
 */
export interface SpecFiles {
  readonly project?: unknown;
  readonly pages?: unknown;
  readonly api?: ApiSpec;
  readonly models?: ModelsSpec;
  readonly components: Readonly<Record<string, ComponentSpec>>;
  /** Design tokens (colors, typography, spacing). Loaded from design-tokens.yaml if present. */
  readonly designTokens?: DesignTokensSpec;
  /** Brand direction (tone, audience, accessibility). Loaded from brand.yaml if present. */
  readonly brand?: BrandSpec;
  /** Component library mappings (import paths, variant props). Loaded from component-library.yaml if present. */
  readonly componentLibrary?: ComponentLibrarySpec;
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

  const readOptional = <T>(name: string): T | undefined => {
    const filePath = path.join(specDir, `${name}.yaml`);
    if (!fs.exists(filePath)) return undefined;
    const result = readYaml<T>(filePath, fs);
    return result.ok ? result.value : undefined;
  };

  // Read component files from components/ subdirectory
  const components: Record<string, ComponentSpec> = {};
  const componentsDir = path.join(specDir, 'components');
  if (fs.exists(componentsDir)) {
    const listResult = fs.listDir(componentsDir);
    if (listResult.ok) {
      for (const file of listResult.value) {
        if (file.endsWith('.yaml')) {
          const name = file.replace('.yaml', '');
          const compResult = readYaml<ComponentSpec>(path.join(componentsDir, file), fs);
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
    api: readOptional<ApiSpec>('api'),
    models: readOptional<ModelsSpec>('models'),
    components,
    designTokens: readOptional<DesignTokensSpec>('design-tokens'),
    brand: readOptional<BrandSpec>('brand'),
    componentLibrary: readOptional<ComponentLibrarySpec>('component-library'),
  });
};

/**
 * Read a single spec file by name.
 */
export const readSpecFile = (specDir: string, name: string, fs: FileSystem): Result<unknown> => {
  const filePath = path.join(specDir, `${name}.yaml`);
  return readYaml<unknown>(filePath, fs);
};
