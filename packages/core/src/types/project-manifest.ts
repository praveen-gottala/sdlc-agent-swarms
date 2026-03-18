/**
 * @module @agentforge/core/types/project-manifest
 *
 * Types representing the agentforge.yaml project manifest structure.
 */

import type { HITLLevel, ChannelType } from './agent-contract.js';

/**
 * Stack configuration for the project.
 */
export interface StackConfig {
  readonly frontend: string;
  readonly backend: string;
  readonly database: string;
  readonly styling: string;
}

/**
 * Repository configuration.
 */
export interface RepoConfig {
  readonly provider: string;
  readonly org: string;
  readonly name: string;
}

/**
 * Agent provider overrides per role.
 */
export interface ProviderConfig {
  readonly default: string;
  readonly overrides?: Readonly<Record<string, string>>;
}

/**
 * Sandbox configuration for agent-generated code execution.
 */
export interface SandboxConfig {
  readonly type: string;
  readonly timeout_minutes: number;
  readonly max_retries: number;
}

/**
 * Orchestration settings.
 */
export interface OrchestrationConfig {
  readonly max_concurrent_agents: number;
  readonly ci_wait_strategy: string;
}

/**
 * HITL section in the project manifest.
 */
export interface HITLManifestConfig {
  readonly default: HITLLevel;
  readonly overrides?: Readonly<Record<string, HITLLevel>>;
}

/**
 * Channel entry in the project manifest.
 */
export interface ChannelEntry {
  readonly type: ChannelType;
  readonly capabilities: 'full' | 'approvals' | 'basic';
  readonly priority: number;
}

/**
 * Channel routing configuration.
 */
export interface RoutingManifestConfig {
  readonly approval_requests: 'all' | 'primary';
  readonly status_updates: 'all' | 'primary';
  readonly critical_alerts: 'all';
}

/**
 * Budget configuration in the manifest.
 */
export interface BudgetManifestConfig {
  readonly per_task_max_usd: number;
  readonly per_phase_max_usd: number;
  readonly monthly_max_usd: number;
  readonly alert_threshold: number;
}

/**
 * The full agentforge.yaml project manifest.
 */
export interface ProjectManifest {
  readonly version: string;
  readonly project: {
    readonly name: string;
    readonly id: string;
    readonly description?: string;
    readonly platforms: readonly string[];
  };
  readonly stack: StackConfig;
  readonly repo: RepoConfig;
  // ADR-012: orchestration is nested under agents per PRD v2.0 Section 5.1 YAML example
  readonly agents: {
    readonly providers: ProviderConfig;
    readonly sandbox: SandboxConfig;
    readonly orchestration: OrchestrationConfig;
  };
  readonly hitl: HITLManifestConfig;
  readonly channels: readonly ChannelEntry[];
  readonly routing: RoutingManifestConfig;
  readonly budget: BudgetManifestConfig;
}
