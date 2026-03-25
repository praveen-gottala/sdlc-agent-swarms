/**
 * Event client for real-time dashboard updates.
 * Subscribes to V3 domain events as defined in PRD Section 27.
 *
 * The 13 V3-required events:
 * - UXModuleRequested
 * - DesignBriefCompleted
 * - ComponentSpecReady
 * - ImplementationDraftReady
 * - UXReviewCompleted
 * - UXTestSuiteCompleted
 * - UXModuleDeployed
 * - TaskStatusChanged
 * - BudgetAlert
 * - AgentStarted
 * - AgentCompleted
 * - AgentFailed
 * - HITLApprovalRequested
 */

import type { DomainEvent, DomainEventType } from '@agentforge/core';

/** Callback for event subscriptions */
export type EventCallback = (event: DomainEvent) => void;

/** Client for subscribing to real-time domain events */
export interface EventClient {
  /** Connect to the event source (SSE / WebSocket) */
  connect(): Promise<void>;

  /** Disconnect from the event source */
  disconnect(): void;

  /** Subscribe to a specific event type */
  subscribe(eventType: DomainEventType, callback: EventCallback): () => void;

  /** Unsubscribe all listeners for an event type */
  unsubscribe(eventType: DomainEventType): void;

  /** Replay events from a given timestamp */
  replay(since: Date): Promise<DomainEvent[]>;
}

/** Create an EventClient instance. TODO: implement SSE/WebSocket transport */
export function createEventClient(_baseUrl: string): EventClient {
  // TODO: implement real transport (SSE or WebSocket)
  return {
    connect: async () => {
      /* placeholder */
    },
    disconnect: () => {
      /* placeholder */
    },
    subscribe: (_eventType, _callback) => {
      return () => {
        /* unsubscribe placeholder */
      };
    },
    unsubscribe: () => {
      /* placeholder */
    },
    replay: async () => {
      return [];
    },
  };
}
