/**
 * @module @agentforge/agents-ux/design-pipeline/types
 *
 * Types for the unified design pipeline orchestrator (Phase 1 Layer B).
 *
 * Sink interface diverges from feature-plan §1.5 (OTel span shape) per
 * execution-plan §"Corrections applied" #2 — flat callbacks, NOT OTel-shaped.
 * OTel mapping deferred to roadmap Phase 7 / Langfuse.
 */

import type { AgentContext, LLMProviderRef, EnrichedRequirement } from '@agentforge/core';
import type { DesignTool, DesignOutput } from '@agentforge/core';
import type { DesignTokensSpec, DesignConfig, PageContext } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { CatalogMap } from '@agentforge/designspec-renderer';
import type { UXResearchOutput } from '../ux-research/ux-research.js';
import type { UXPlanningOutput } from '../ux-planning/ux-planning.js';
import type { DesignEvaluation } from '../ux-design/design-evaluator.js';

// ============================================================================
// Telemetry
// ============================================================================

/**
 * Minimal callback interface for pipeline telemetry.
 *
 * NOT OTel-span-shaped (diverges from feature-plan §1.5 per execution-plan
 * §"Corrections applied" #2). Implementations live in their transport packages:
 * CliStdoutSink (packages/cli/), DashboardSseSink (packages/dashboard/).
 */
export interface PipelineTelemetrySink {
  onStageStart(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }): void;
  onStageComplete(stage: string, result: { costUsd?: number; tokensUsed?: number }): void;
  onStageFail(stage: string, error: string): void;
  onLlmCall(stage: string, attrs: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
  }): void;
  onLog(stage: string, level: 'info' | 'warn' | 'error', message: string): void;
  /** Wrap stage execution with tracing context. Implementations that support OTel
   *  use this to establish parent-child span hierarchy. Default: just call fn(). */
  wrapStage?<T>(stage: string, attrs: { agentRole: string; moduleId: string; taskId: string }, fn: () => Promise<T>): Promise<T>;
}

// ============================================================================
// Pipeline Input
// ============================================================================

/** Chrome Pass configuration for shared-chrome generation or consumption. */
export interface ChromePassConfig {
  readonly mode: 'generate' | 'consume';
  /** When mode='consume': frozen chrome spec to inject into the design. */
  readonly spec?: DesignSpecV2;
  /** When mode='consume': page ID for active tab state. */
  readonly activePageId?: string;
}

/**
 * Input to runDesignPipeline — the only entry point callers need.
 *
 * No separate `provider` field. The orchestrator resolves the provider via
 * `agentContext.resolveProvider(providerString)` — one canonical way to wire
 * LLMs (see design decision C3).
 */
export interface PipelineInput {
  readonly moduleId: string;
  readonly taskId: string;
  readonly projectRoot: string;
  readonly designTool: DesignTool;
  /** Provider string to resolve via agentContext.resolveProvider(). */
  readonly providerString: string;
  /** Start from a specific stage, skipping earlier stages (loads from cache). */
  readonly stage?: 'research' | 'planning' | 'design' | 'evaluator' | 'feedback' | 'implementation';
  /** When true, skip stages whose cached artifacts exist on disk. */
  readonly resume?: boolean;
  readonly telemetry?: PipelineTelemetrySink;
  readonly chromePass?: ChromePassConfig;
  /** AgentContext carries fs, resolveProvider, eventBus, etc. */
  readonly agentContext: AgentContext;

  // ── Pass-through fields for node functions ──
  readonly prdRequirements?: readonly string[];
  readonly pageContext?: PageContext;
  readonly designTokensSpec?: DesignTokensSpec;
  readonly designConfig?: DesignConfig;
  readonly description?: string;
  readonly viewportWidth?: number;
  /** Renderer-compatible design tokens (version/created_by stripped). */
  readonly rendererTokens?: Record<string, unknown>;
  /** Component catalog map for catalog-aware design generation. */
  readonly catalogMap?: CatalogMap;
  readonly componentCatalogPrompt?: string;
  readonly designSystemPrompt?: string;
  /** Structured Clarifier output. When present and prdRequirements absent, initState() derives prdRequirements via renderPrdToMarkdown. */
  readonly enrichedRequirement?: EnrichedRequirement;
  /** Existing design spec for brownfield MODIFY path. When present, design stage emits a delta instead of full spec. */
  readonly existingDesignSpec?: DesignSpecV2;
}

// ============================================================================
// Pipeline State
// ============================================================================

/**
 * The accumulator threaded through pipeline nodes.
 *
 * Lives in agents-ux (not core) because it references UXResearchOutput and
 * UXPlanningOutput which cannot be in core without circular deps.
 * See ADR-044. Core retains DesignToolSchema and DesignOutputSchema.
 */
export interface DesignPhaseState {
  readonly moduleId: string;
  readonly taskId: string;
  readonly projectRoot: string;
  readonly designTool: DesignTool;
  readonly chromePass?: ChromePassConfig;

  // Stage outputs (populated as pipeline progresses)
  readonly research?: UXResearchOutput;
  readonly planning?: UXPlanningOutput;
  readonly design?: DesignOutput;
  readonly evaluation?: DesignEvaluation;

  // Pass-through inputs for nodes
  readonly prdRequirements?: readonly string[];
  readonly pageContext?: PageContext;
  readonly designTokensSpec?: DesignTokensSpec;
  readonly designConfig?: DesignConfig;
  readonly description?: string;
  readonly viewportWidth?: number;
  readonly rendererTokens?: Record<string, unknown>;
  readonly catalogMap?: CatalogMap;
  readonly componentCatalogPrompt?: string;
  readonly designSystemPrompt?: string;
  readonly enrichedRequirement?: EnrichedRequirement;
  readonly existingDesignSpec?: DesignSpecV2;
}

// ============================================================================
// Node Context
// ============================================================================

/** Narrower context passed to each node function. */
export interface NodeContext {
  /** Provider resolved once by the orchestrator. */
  readonly provider: LLMProviderRef;
  readonly agentContext: AgentContext;
  readonly telemetry?: PipelineTelemetrySink;
}

// ============================================================================
// Errors
// ============================================================================

/** Result-compatible error from a pipeline stage. */
export interface PipelineStageError {
  readonly code: 'PIPELINE_STAGE_FAILED';
  readonly stage: string;
  readonly message: string;
  readonly recoverable: boolean;
}

/** Create a PipelineStageError for a given stage. */
export function pipelineStageError(stage: string, message: string): PipelineStageError {
  return { code: 'PIPELINE_STAGE_FAILED', stage, message, recoverable: false };
}
