/**
 * @module pipeline-context
 *
 * Dashboard AgentContext factory — thin delegation to the shared
 * createPipelineContext() in @agentforge/agents-ux (M1 Phase 1, D5).
 */

import type { AgentContext, LLMProviderRef, ProjectManifest } from '@agentforge/core';
import { createPipelineContext } from '@agentforge/agents-ux';

/**
 * Create a minimal AgentContext for dashboard pipeline runs.
 *
 * @param providerFactory Creates an LLMProviderRef for a given model string.
 *   Dashboard callers build this from `resolveClaudeAuth` + `createClaudeProvider`.
 * @param manifest Project manifest for per-stage model resolution (ADR-033).
 */
export function createDashboardPipelineContext(
  taskId: string,
  projectRoot: string,
  providerFactory: (model: string) => LLMProviderRef,
  manifest?: Pick<ProjectManifest, 'agents'>,
): AgentContext {
  return createPipelineContext({
    taskId,
    projectRoot,
    providerFactory,
    manifest,
  });
}
