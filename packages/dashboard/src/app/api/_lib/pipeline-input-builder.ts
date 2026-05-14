/**
 * @module pipeline-input-builder
 *
 * Dashboard PipelineInput builder — thin delegation to the shared
 * buildPipelineInput() in @agentforge/agents-ux (M1 Phase 1, D4).
 */

import type { AgentContext } from '@agentforge/core';
import type { PipelineInput, PipelineTelemetrySink } from '@agentforge/agents-ux';
import { buildPipelineInput } from '@agentforge/agents-ux';
import { getActiveProjectRoot } from './project-reader';

interface BuildInputOptions {
  readonly resume?: boolean;
}

/**
 * Build a PipelineInput for the dashboard's design pipeline route.
 *
 * Delegates to the shared buildPipelineInput() in agents-ux.
 * Returns null if the page is not found in pages.yaml.
 */
export function buildDashboardPipelineInput(
  pageId: string,
  taskId: string,
  telemetry: PipelineTelemetrySink,
  agentContext: AgentContext,
  opts?: BuildInputOptions,
): PipelineInput | null {
  return buildPipelineInput({
    pageId,
    taskId,
    projectRoot: getActiveProjectRoot(),
    telemetry,
    agentContext,
    resume: opts?.resume,
  });
}
