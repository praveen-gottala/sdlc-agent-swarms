/**
 * @module @agentforge/core/types/hitl
 *
 * HITLChannel and RichHITLChannel interfaces for messaging integrations.
 * Channels implement these to provide human-in-the-loop approval,
 * notifications, and live task boards.
 */

import type { ChannelType, HITLDecision } from './agent-contract.js';
import type { CostRecord, Result } from './index.js';

/**
 * Rich reference to a message sent on a channel.
 * Contains platform-specific IDs for updates and threading.
 */
export interface ChannelMessageRef {
  readonly channel: ChannelType;
  /** Platform-specific message ID */
  readonly messageId: string;
  /** For threaded conversations */
  readonly threadId?: string;
  readonly timestamp: Date;
}

/**
 * Context provided when requesting human approval.
 */
export interface ApprovalContext {
  readonly title: string;
  readonly description: string;
  readonly changes?: {
    readonly files: number;
    readonly additions: number;
    readonly deletions: number;
  };
  readonly cost?: CostRecord;
  readonly prUrl?: string;
  readonly specRef?: string;
}

/**
 * Status of a task for display in task boards and status updates.
 */
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'awaiting_approval'
  | 'approved'
  | 'changes_requested'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'aborting'
  | 'aborted';

/**
 * Minimal task representation for channel display.
 */
export interface TaskSummary {
  readonly id: string;
  readonly name: string;
  readonly status: TaskStatus;
  readonly costUsd?: number;
  readonly assignedAgent?: string;
}

/**
 * Summary of the current SDLC phase for task board display.
 */
export interface PhaseSummary {
  readonly phase: string;
  readonly projectName: string;
  readonly totalTasks: number;
  readonly costSoFar: number;
  readonly budgetLimit: number;
  readonly elapsedMinutes: number;
}

/**
 * Layer 1: Base channel interface. Every channel MUST implement this.
 * Provides notifications, approval requests, and status updates.
 */
export interface HITLChannel {
  /** Channel identifier */
  readonly type: ChannelType;
  /** Priority for routing (lower = higher priority) */
  readonly priority: number;
  /** Capability level of this channel */
  readonly capabilities: 'full' | 'approvals' | 'basic';

  /** Send a notification (no response expected) */
  sendNotification(
    message: string,
    severity: 'info' | 'warning' | 'critical',
  ): Promise<Result<ChannelMessageRef>>;

  /** Request human approval (blocks until response or timeout) */
  requestApproval(
    task: TaskSummary,
    context: ApprovalContext,
  ): Promise<Result<ChannelMessageRef>>;

  /** Register callback for approval decisions */
  onDecision(
    callback: (
      taskId: string,
      decision: HITLDecision,
      feedback?: string,
    ) => void,
  ): void;

  /** Update an existing message with new status */
  updateStatus(
    ref: ChannelMessageRef,
    status: TaskStatus,
  ): Promise<Result<void>>;

  /** Check if channel is currently available */
  isAvailable(): Promise<boolean>;
}

/**
 * Layer 2: Enhanced channel interface with rich features.
 * Channels with full UI capabilities (e.g. Slack) implement this.
 */
export interface RichHITLChannel extends HITLChannel {
  /** Post a live task board (updates in place) */
  sendTaskBoard(
    tasks: readonly TaskSummary[],
    phaseSummary: PhaseSummary,
  ): Promise<Result<ChannelMessageRef>>;

  /** Update an existing task board */
  updateTaskBoard(
    ref: ChannelMessageRef,
    tasks: readonly TaskSummary[],
    phaseSummary: PhaseSummary,
  ): Promise<Result<void>>;

  /** Send a code preview (syntax-highlighted) */
  sendCodePreview(
    code: string,
    language: string,
    description: string,
  ): Promise<Result<ChannelMessageRef>>;

  /** Start a threaded conversation for feedback */
  startThread(
    parentRef: ChannelMessageRef,
    message: string,
  ): Promise<Result<ChannelMessageRef>>;

  /** Listen for threaded replies (change request feedback) */
  onThreadReply(
    parentRef: ChannelMessageRef,
    callback: (text: string) => void,
  ): void;
}
