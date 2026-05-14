/**
 * @module @agentforge/cli/utils/pipeline-context
 *
 * Shared utilities for design pipeline CLI commands. Agent context factory
 * delegates to the shared createPipelineContext() in @agentforge/agents-ux
 * (M1 Phase 1, D5). I/O helpers remain CLI-specific.
 */

import { resolve, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { MCPClient, AgentContext, LLMProviderRef, ProjectManifest } from '@agentforge/core';
import { PREVIEW_DIR_REL } from '@agentforge/core';
import { createPipelineContext as createSharedPipelineContext } from '@agentforge/agents-ux';

// ============================================================================
// Agent context factory
// ============================================================================

/**
 * Create a minimal AgentContext for pipeline stages.
 *
 * Thin CLI wrapper around the shared factory in agents-ux.
 * Preserves the positional parameter signature for existing CLI callers.
 */
export function createPipelineContext(
  taskId: string,
  mcpClient?: MCPClient,
  baseDir?: string,
  providerFactory?: (model: string) => LLMProviderRef,
  manifest?: Pick<ProjectManifest, 'agents'>,
): AgentContext {
  return createSharedPipelineContext({
    taskId,
    projectRoot: baseDir ?? process.cwd(),
    providerFactory,
    mcpClient,
    manifest,
  });
}

// ============================================================================
// Output directory helpers
// ============================================================================

/** Ensure the output directory for a module's pipeline artifacts exists. */
export function ensureOutputDir(moduleId: string, baseDir?: string): string {
  const dir = resolve(baseDir ?? process.cwd(), PREVIEW_DIR_REL, moduleId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ============================================================================
// Artifact I/O
// ============================================================================

/** Save a JSON artifact and return the file path. */
export function saveArtifact(dir: string, filename: string, data: unknown): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

/** Load a JSON artifact, or return null if it doesn't exist. */
export function loadArtifact<T>(dir: string, filename: string): T | null {
  const filePath = join(dir, filename);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

/** Save a text artifact (e.g. markdown prompt traces). */
export function saveTextArtifact(dir: string, filename: string, text: string): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, text);
  return filePath;
}

/** Derive a kebab-case module ID from a description string. */
export function deriveModuleId(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '');
}
