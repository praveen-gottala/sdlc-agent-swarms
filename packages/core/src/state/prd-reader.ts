/**
 * @module @agentforge/core/state/prd-reader
 *
 * Pure functions for reading the project PRD (Product Requirements Document)
 * from docs/prd.md.
 */

import * as path from 'node:path';
import { Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';

/** Path to the PRD file within a project. */
const PRD_PATH = 'docs/prd.md';

/** Error message when PRD is not found. */
const MISSING_PRD_MSG =
  'PRD not found at docs/prd.md. Run `agentforge describe` to create one, or place your PRD at docs/prd.md manually.';

/**
 * Load the PRD markdown from docs/prd.md.
 * Returns Err with an actionable message if the file is missing.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param fs - FileSystem implementation to use for reading
 * @returns The PRD markdown content, or Err if file missing
 */
export const loadPRD = (
  projectRoot: string,
  fs: FileSystem,
): Result<string> => {
  const filePath = path.join(projectRoot, PRD_PATH);
  if (!fs.exists(filePath)) {
    return Err({
      code: 'INVALID_STATE',
      message: MISSING_PRD_MSG,
      recoverable: true,
    });
  }
  return fs.readFile(filePath);
};

/**
 * Check whether a PRD file exists at docs/prd.md.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param fs - FileSystem implementation to use
 * @returns true if docs/prd.md exists
 */
export const prdExists = (
  projectRoot: string,
  fs: FileSystem,
): boolean => {
  const filePath = path.join(projectRoot, PRD_PATH);
  return fs.exists(filePath);
};
