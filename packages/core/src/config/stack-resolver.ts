/**
 * @module @agentforge/core/config/stack-resolver
 *
 * Resolves the stack template directory from the project manifest's
 * stack configuration. Falls back to empty prompts with a warning
 * when the requested stack directory is not found.
 *
 * DEVIATION: ADR-014
 * PRD v2.0 Section 16.2 specifies: each supported stack has a directory
 * of prompt templates; adding new stacks is additive.
 * Implementation: resolves stack directory dynamically from manifest
 * stack config, falls back to empty templates with warning for unknown stacks.
 * Rationale: see ADR-014
 */

import * as path from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { StackConfig } from '../types/project-manifest.js';
import type { FileSystem } from '../fs/file-system.js';

/** Result of resolving a stack directory. */
export interface StackResolution {
  /** The resolved stack name (e.g. "react-node-prisma"). */
  readonly stackName: string;
  /** Absolute path to the stack directory, or null if not found. */
  readonly stackDir: string | null;
  /** Whether this is a fallback (stack directory was not found). */
  readonly isFallback: boolean;
  /** Warning message if fallback was used. */
  readonly warning?: string;
}

/**
 * Derive the stack directory name from the project manifest's stack config.
 *
 * Maps: { frontend: "react", backend: "node", database: "postgresql" }
 * to: "react-node-prisma" (using the ORM name when database is postgresql).
 *
 * @param stackConfig - The stack section from agentforge.yaml
 * @returns The derived stack directory name
 */
export function deriveStackName(stackConfig: StackConfig): string {
  const frontend = stackConfig.frontend ?? 'react';
  const backend = stackConfig.backend ?? 'node';

  // Map database to ORM name for directory naming
  const ormMap: Record<string, string> = {
    postgresql: 'prisma',
    mysql: 'prisma',
    sqlite: 'prisma',
    mongodb: 'mongoose',
  };
  const database = stackConfig.database ?? 'postgresql';
  const orm = ormMap[database] ?? database;

  return `${frontend}-${backend}-${orm}`;
}

/**
 * Resolve the stack template directory from the project's stack configuration.
 *
 * Checks if a directory exists at `<stacksRoot>/<stackName>/`. If not,
 * returns a fallback result with a warning.
 *
 * @param stackConfig - The stack section from the project manifest
 * @param stacksRoot - Absolute path to the stacks directory
 * @param fs - FileSystem implementation for existence checks
 * @returns A StackResolution indicating the resolved directory or fallback
 */
export function resolveStackDir(
  stackConfig: StackConfig,
  stacksRoot: string,
  fs: FileSystem,
): StackResolution {
  const stackName = deriveStackName(stackConfig);
  const stackDir = path.join(stacksRoot, stackName);

  if (fs.exists(stackDir)) {
    return {
      stackName,
      stackDir,
      isFallback: false,
    };
  }

  return {
    stackName,
    stackDir: null,
    isFallback: true,
    warning: `Stack "${stackName}" has no template directory at ${stackDir}. Using generic prompts (empty). Code generation quality may be reduced.`,
  };
}

/**
 * Resolve the prompts directory for a stack. Returns the path to the prompts/
 * subdirectory if it exists, or null with a warning if the stack is not found.
 *
 * @param stackConfig - The stack section from the project manifest
 * @param stacksRoot - Absolute path to the stacks directory
 * @param fs - FileSystem implementation for existence checks
 * @returns Result with the prompts directory path, or Err with a descriptive warning
 */
export function resolvePromptsDir(
  stackConfig: StackConfig,
  stacksRoot: string,
  fs: FileSystem,
): Result<string> {
  const resolution = resolveStackDir(stackConfig, stacksRoot, fs);

  if (resolution.isFallback) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: resolution.warning ?? `Stack "${resolution.stackName}" not found`,
      recoverable: true,
    });
  }

  const promptsDir = path.join(resolution.stackDir!, 'prompts');
  if (!fs.exists(promptsDir)) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Stack "${resolution.stackName}" exists but has no prompts/ directory`,
      recoverable: true,
    });
  }

  return Ok(promptsDir);
}
