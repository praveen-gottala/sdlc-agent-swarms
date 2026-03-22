/**
 * Dashboard-specific types.
 * Re-exports core types used across dashboard components.
 */

// Re-export core types relevant to the dashboard
export type {
  TaskStatus,
  TaskSummary,
  PhaseSummary,
  CostRecord,
  CostEstimate,
  PhaseCostBreakdown,
  AgentCostBreakdown,
  DomainEvent,
  DomainEventType,
  HITLDecision,
  ApprovalContext,
} from '@agentforge/core';

/** Navigation module descriptor */
export interface DashboardModule {
  readonly name: string;
  readonly path: string;
  readonly description: string;
}

/** Connection status for real-time event stream */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Dashboard-wide filter state */
export interface DashboardFilters {
  readonly projectId?: string;
  readonly agentId?: string;
  readonly phaseFilter?: string;
  readonly timeRange?: { start: Date; end: Date };
}
