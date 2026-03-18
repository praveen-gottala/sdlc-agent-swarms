/**
 * @module @agentforge/channels/router
 *
 * ChannelRouter sends messages to channels based on routing config.
 * Supports "all" (broadcast) and "primary" (highest-priority only) routing.
 * For approval requests sent to all channels, the first response wins.
 */

import { Ok, Err } from '@agentforge/core';
import type {
  Result,
  AgentForgeError,
  HITLChannel,
  HITLDecision,
  ChannelMessageRef,
  TaskStatus,
  TaskSummary,
  ApprovalContext,
} from '@agentforge/core';

/**
 * Routing configuration for different message types.
 */
export interface RoutingConfig {
  /** Where to send approval requests: all channels or primary only. */
  readonly approvalRequests: 'all' | 'primary';
  /** Where to send status updates: all channels or primary only. */
  readonly statusUpdates: 'all' | 'primary';
  /** Critical alerts always go to all channels. */
  readonly criticalAlerts: 'all';
}

/**
 * Default routing config matching agentforge.yaml defaults.
 */
export const DEFAULT_ROUTING: RoutingConfig = {
  approvalRequests: 'all',
  statusUpdates: 'primary',
  criticalAlerts: 'all',
};

/**
 * Result of routing a message to multiple channels.
 */
export interface RouteResult {
  readonly refs: readonly ChannelMessageRef[];
  readonly failures: readonly { readonly channel: string; readonly error: AgentForgeError }[];
}

/**
 * Creates a ChannelRouter that dispatches messages to registered channels.
 *
 * @param channels - Channels sorted by priority (lower number = higher priority)
 * @param config - Routing configuration
 */
export function createChannelRouter(
  channels: readonly HITLChannel[],
  config: RoutingConfig = DEFAULT_ROUTING,
) {
  const sorted = [...channels].sort((a, b) => a.priority - b.priority);
  const decidedTasks = new Set<string>();

  /**
   * Get channels based on routing mode.
   */
  function getTargetChannels(mode: 'all' | 'primary'): readonly HITLChannel[] {
    if (mode === 'primary') {
      const primary = sorted[0];
      return primary ? [primary] : [];
    }
    return sorted;
  }

  /**
   * Filter to only available channels.
   */
  async function filterAvailable(
    targets: readonly HITLChannel[],
  ): Promise<HITLChannel[]> {
    const results = await Promise.all(
      targets.map(async (ch) => ({ ch, available: await ch.isAvailable() })),
    );
    return results.filter((r) => r.available).map((r) => r.ch);
  }

  /**
   * Send a notification to channels based on severity routing.
   */
  async function sendNotification(
    message: string,
    severity: 'info' | 'warning' | 'critical',
  ): Promise<Result<RouteResult>> {
    const mode = severity === 'critical' ? config.criticalAlerts : config.statusUpdates;
    const targets = getTargetChannels(mode);
    const available = await filterAvailable(targets);

    if (available.length === 0) {
      return Err({
        code: 'CHANNEL_UNAVAILABLE' as const,
        message: 'No channels available for notification',
        recoverable: true,
      });
    }

    const refs: ChannelMessageRef[] = [];
    const failures: { channel: string; error: AgentForgeError }[] = [];

    const results = await Promise.allSettled(
      available.map((ch) => ch.sendNotification(message, severity)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const ch = available[i];
      if (result.status === 'fulfilled') {
        if (result.value.ok) {
          refs.push(result.value.value);
        } else {
          failures.push({ channel: ch.type, error: result.value.error });
        }
      } else {
        failures.push({
          channel: ch.type,
          error: {
            code: 'CHANNEL_UNAVAILABLE',
            message: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            recoverable: true,
          },
        });
      }
    }

    return Ok({ refs, failures });
  }

  /**
   * Request approval from channels. First response wins.
   * When a decision arrives on one channel, all others are updated
   * to show the decision was made elsewhere.
   */
  async function requestApproval(
    task: TaskSummary,
    context: ApprovalContext,
  ): Promise<Result<RouteResult>> {
    const targets = getTargetChannels(config.approvalRequests);
    const available = await filterAvailable(targets);

    if (available.length === 0) {
      return Err({
        code: 'CHANNEL_UNAVAILABLE' as const,
        message: 'No channels available for approval request',
        recoverable: true,
      });
    }

    const refs: ChannelMessageRef[] = [];
    const failures: { channel: string; error: AgentForgeError }[] = [];

    const results = await Promise.allSettled(
      available.map((ch) => ch.requestApproval(task, context)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const ch = available[i];
      if (result.status === 'fulfilled') {
        if (result.value.ok) {
          refs.push(result.value.value);
        } else {
          failures.push({ channel: ch.type, error: result.value.error });
        }
      } else {
        failures.push({
          channel: ch.type,
          error: {
            code: 'CHANNEL_UNAVAILABLE',
            message: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            recoverable: true,
          },
        });
      }
    }

    return Ok({ refs, failures });
  }

  /**
   * Register a decision handler across all channels.
   * Ensures first-response-wins: once a decision is received on any channel,
   * subsequent decisions for the same task are ignored, and other channels
   * are updated to show the decision was made.
   */
  function onDecision(
    callback: (taskId: string, decision: HITLDecision, feedback?: string) => void,
  ): void {
    for (const ch of sorted) {
      ch.onDecision((taskId, decision, feedback) => {
        if (decidedTasks.has(taskId)) {
          return; // Already decided on another channel
        }
        decidedTasks.add(taskId);
        callback(taskId, decision, feedback);
      });
    }
  }

  /**
   * Broadcast a status update to channels based on routing config.
   */
  async function broadcastStatusUpdate(
    ref: ChannelMessageRef,
    status: TaskStatus,
  ): Promise<Result<void>> {
    const targets = getTargetChannels(config.statusUpdates);
    const available = await filterAvailable(targets);

    // Find the channel that owns this ref
    const owningChannel = available.find((ch) => ch.type === ref.channel);
    if (!owningChannel) {
      return Err({
        code: 'CHANNEL_UNAVAILABLE' as const,
        message: `Channel ${ref.channel} not available for status update`,
        recoverable: true,
      });
    }

    return owningChannel.updateStatus(ref, status);
  }

  /**
   * Clear the decided tasks set (useful for testing or resetting state).
   */
  function reset(): void {
    decidedTasks.clear();
  }

  return {
    sendNotification,
    requestApproval,
    onDecision,
    broadcastStatusUpdate,
    reset,
    /** Expose sorted channels for introspection */
    get channels(): readonly HITLChannel[] {
      return sorted;
    },
  };
}

/** Type of the router returned by createChannelRouter */
export type ChannelRouter = ReturnType<typeof createChannelRouter>;
