/**
 * @module design-pipeline/pipeline-context
 *
 * Shared AgentContext factory for both CLI and dashboard pipeline runs.
 * Consolidates the two duplicate factories (D4, D5) into a single
 * canonical implementation in @agentforge/agents-ux.
 */

import type { AgentContext, LLMProviderRef, MCPClient, ProjectManifest } from '@agentforge/core';
import { Ok, Err, createEventBus, createRealFs, debugLog } from '@agentforge/core';

/** Options for creating a pipeline AgentContext. */
export interface PipelineContextOptions {
  readonly taskId: string;
  readonly projectRoot: string;
  readonly providerFactory?: (model: string) => LLMProviderRef;
  readonly mcpClient?: MCPClient;
  readonly manifest?: Pick<ProjectManifest, 'agents'>;
}

/**
 * Create a minimal AgentContext for pipeline stages.
 *
 * Governance is bypassed — callers handle approval via their own UX
 * (CLI interactive prompts, dashboard approval flow).
 */
export function createPipelineContext(opts: PipelineContextOptions): AgentContext {
  debugLog(`createPipelineContext: projectRoot=${opts.projectRoot}, mcpClient=${!!opts.mcpClient}`);

  return {
    taskId: opts.taskId,
    projectRoot: opts.projectRoot,
    eventBus: createEventBus(),
    fs: createRealFs(),
    mcpClient: opts.mcpClient,
    manifest: opts.manifest,
    runGovernance: async () => Ok({ status: 'proceed' as const }),
    resolveProvider: opts.providerFactory
      ? (model: string) => Ok(opts.providerFactory!(model))
      : () => Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'resolveProvider not wired — pass providerFactory to createPipelineContext',
          recoverable: false,
        }),
    recordAudit: () => {},
  };
}
