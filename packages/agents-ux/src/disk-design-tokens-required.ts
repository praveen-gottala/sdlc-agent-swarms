/**
 * @module disk-design-tokens-required
 *
 * Hard requirement: agentforge/spec/design-tokens.yaml must load for disk-first UX agents.
 * No Figma MCP (or other tool) fallback for tokens — see disk-only token policy in UX agents.
 */

import { join } from 'node:path';
import type { Result } from '@agentforge/core';
import { Err } from '@agentforge/core';

/** Relative path from project root to required design tokens spec. */
export const DISK_DESIGN_TOKENS_REL_PATH = join('agentforge', 'spec', 'design-tokens.yaml');

/**
 * Human-readable explanation for logs and Err messages when disk tokens are missing.
 */
export const diskDesignTokensRequiredMessage = (projectRoot: string): string => {
  const absHint = join(projectRoot, DISK_DESIGN_TOKENS_REL_PATH);
  return (
    `FATAL: Required design tokens file is missing or invalid.\n` +
    `  Expected: ${absHint}\n` +
    `  Fix: add agentforge/spec/design-tokens.yaml (e.g. run \`agentforge init\` or copy from a template). ` +
    `This pipeline cannot continue without disk-backed design tokens.`
  );
};

/**
 * Structured failure when loadDesignTokens did not succeed.
 */
export const diskDesignTokensRequiredErr = (projectRoot: string): Result<never> =>
  Err({
    code: 'DEPENDENCY_NOT_FOUND' as const,
    message: diskDesignTokensRequiredMessage(projectRoot),
    recoverable: false,
  });
