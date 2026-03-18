export type {
  DomainEvent,
  DomainEventType,
  AgentStarted,
  AgentCompleted,
  AgentFailed,
  TaskStatusChanged,
  BudgetAlert,
  HITLApprovalRequested,
  HITLApprovalReceived,
  SpecLockAcquired,
  SpecLockReleased,
  PRMerged,
  SpecDriftDetected,
  DesignPhaseComplete,
  SpecComplete,
  TasksCreated,
  CodeGenComplete,
  TestsComplete,
  PRCreated,
  ReviewComplete,
} from './domain-events.js';

export type { EventBus } from './event-bus.js';
export { createEventBus } from './event-bus.js';
