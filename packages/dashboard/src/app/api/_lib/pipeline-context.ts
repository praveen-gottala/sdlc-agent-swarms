/**
 * @module pipeline-context
 *
 * Dashboard AgentContext factory for runDesignPipeline.
 * Mirrors CLI's createPipelineContext but without MCP client or prompt traces
 * (the dashboard doesn't connect to design tool MCP servers directly).
 */

import type { AgentContext, LLMProviderRef, ProjectManifest } from '@agentforge/core';
import { Ok, createEventBus, createRealFs } from '@agentforge/core';

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
  return {
    taskId,
    projectRoot,
    eventBus: createEventBus(),
    fs: createRealFs(),
    manifest,
    runGovernance: async () => Ok({ status: 'proceed' as const }),
    resolveProvider: (model: string) => Ok(providerFactory(model)),
    recordAudit: () => {},
  };
}
