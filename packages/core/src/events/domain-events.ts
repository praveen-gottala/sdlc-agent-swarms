/**
 * Domain events for the AgentForge event bus.
 *
 * All agent-to-agent and system communication flows through these
 * strongly-typed events. Each variant carries only the data it needs,
 * and the discriminated union lets consumers narrow on `type`.
 */

/** Fired when an agent begins executing a task. */
export interface AgentStarted {
  readonly type: 'AgentStarted';
  readonly agentId: string;
  readonly taskId: string;
  readonly timestamp: number;
}

/** Fired when an agent finishes a task successfully. */
export interface AgentCompleted {
  readonly type: 'AgentCompleted';
  readonly agentId: string;
  readonly taskId: string;
  readonly timestamp: number;
}

/** Fired when an agent fails while executing a task. */
export interface AgentFailed {
  readonly type: 'AgentFailed';
  readonly agentId: string;
  readonly taskId: string;
  readonly error: string;
  readonly timestamp: number;
}

/** Fired when a task transitions between statuses. */
export interface TaskStatusChanged {
  readonly type: 'TaskStatusChanged';
  readonly taskId: string;
  readonly from: string;
  readonly to: string;
  readonly timestamp: number;
}

/** Fired when spending approaches or exceeds a budget threshold. */
export interface BudgetAlert {
  readonly type: 'BudgetAlert';
  readonly level: string;
  readonly entityId: string;
  readonly currentSpendUsd: number;
  readonly limitUsd: number;
  readonly severity: 'warning' | 'hard_stop';
  readonly timestamp: number;
}

/** Fired when an agent reaches a gate that requires human approval. */
export interface HITLApprovalRequested {
  readonly type: 'HITLApprovalRequested';
  readonly gateId: string;
  readonly agentId: string;
  readonly taskId: string;
  readonly timestamp: number;
}

/** Fired when a human responds to an approval request. */
export interface HITLApprovalReceived {
  readonly type: 'HITLApprovalReceived';
  readonly gateId: string;
  readonly decision: string;
  readonly decidedBy?: string;
  readonly timestamp: number;
}

/** Fired when an agent acquires a lock on a spec file. */
export interface SpecLockAcquired {
  readonly type: 'SpecLockAcquired';
  readonly filePath: string;
  readonly agentId: string;
  readonly timestamp: number;
}

/** Fired when an agent releases a lock on a spec file. */
export interface SpecLockReleased {
  readonly type: 'SpecLockReleased';
  readonly filePath: string;
  readonly agentId: string;
  readonly timestamp: number;
}

/** Fired when a PR is merged into the default branch. */
export interface PRMerged {
  readonly type: 'PRMerged';
  readonly prNumber: number;
  readonly branch: string;
  readonly mergedBy: string;
  readonly timestamp: number;
}

/** Fired when spec drift is detected after a merge. */
export interface SpecDriftDetected {
  readonly type: 'SpecDriftDetected';
  readonly specFile: string;
  readonly deviations: readonly string[];
  readonly severity: 'minor' | 'significant';
  readonly timestamp: number;
}

/** Fired when the design phase completes and specs are ready for generation. */
export interface DesignPhaseComplete {
  readonly type: 'DesignPhaseComplete';
  readonly specRef: string;
  readonly designRef: string;
  readonly timestamp: number;
}

/** Fired when spec generation completes for a task. */
export interface SpecComplete {
  readonly type: 'SpecComplete';
  readonly specRef: string;
  readonly taskId: string;
  readonly timestamp: number;
}

/** Fired when task decomposition creates new tasks. */
export interface TasksCreated {
  readonly type: 'TasksCreated';
  readonly taskCount: number;
  readonly taskIds: readonly string[];
  readonly timestamp: number;
}

/** Fired when a code generation agent completes a task. */
export interface CodeGenComplete {
  readonly type: 'CodeGenComplete';
  readonly taskId: string;
  readonly agentId: string;
  readonly branch: string;
  readonly filesGenerated: readonly string[];
  readonly timestamp: number;
}

/** Fired when the test writer agent completes generating tests. */
export interface TestsComplete {
  readonly type: 'TestsComplete';
  readonly taskId: string;
  readonly agentId: string;
  readonly branch: string;
  readonly testFilesGenerated: readonly string[];
  readonly timestamp: number;
}

/** Fired when a PR is created and ready for review. */
export interface PRCreated {
  readonly type: 'PRCreated';
  readonly taskId: string;
  readonly prNumber: number;
  readonly branch: string;
  readonly timestamp: number;
}

/** Fired when the PR reviewer completes a code review. */
export interface ReviewComplete {
  readonly type: 'ReviewComplete';
  readonly taskId: string;
  readonly agentId: string;
  readonly prNumber: number;
  readonly decision: string;
  readonly timestamp: number;
}

/**
 * Discriminated union of every domain event in the system.
 *
 * Consumers can narrow on the `type` field to get full type safety
 * for the payload of each variant.
 */
export type DomainEvent =
  | AgentStarted
  | AgentCompleted
  | AgentFailed
  | TaskStatusChanged
  | BudgetAlert
  | HITLApprovalRequested
  | HITLApprovalReceived
  | SpecLockAcquired
  | SpecLockReleased
  | PRMerged
  | SpecDriftDetected
  | DesignPhaseComplete
  | SpecComplete
  | TasksCreated
  | CodeGenComplete
  | TestsComplete
  | PRCreated
  | ReviewComplete;

/** Union of all possible `type` values on a `DomainEvent`. */
export type DomainEventType = DomainEvent['type'];
