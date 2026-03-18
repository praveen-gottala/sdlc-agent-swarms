/**
 * In-memory event bus backed by eventemitter3.
 *
 * Provides a thin, type-safe wrapper that enforces communication
 * through {@link DomainEvent} values. Agents and subsystems publish
 * and subscribe via this bus rather than calling each other directly.
 *
 * ADR-003: Both `publish()` and `emit()` are supported. `emit()` is
 * an alias for `publish()` for architecture.md compliance.
 */

import { EventEmitter } from 'eventemitter3';
import { randomUUID } from 'node:crypto';
import type { DomainEvent, DomainEventInput, DomainEventType } from './domain-events.js';

/** Filter criteria for querying event history. */
export interface EventFilter {
  /** Return only events of this type. */
  type?: DomainEventType;
  /** Return only events emitted after this Unix-epoch millisecond timestamp. */
  after?: number;
}

/** Options for configuring the event bus. */
export interface EventBusOptions {
  /** Maximum number of events retained in the history buffer. Defaults to 1000. */
  historyLimit?: number;
}

/**
 * Publish/subscribe interface for domain events.
 *
 * The generic constraints on `subscribe` and `unsubscribe` ensure that
 * handlers receive the correctly narrowed event type at compile time.
 */
export interface EventBus {
  /** Emit a domain event to all registered handlers for its type. Auto-generates event_id if absent. */
  publish(event: DomainEventInput): void;

  /** Alias for {@link publish}. Matches the architecture.md spec naming. */
  emit(event: DomainEventInput): void;

  /** Register a handler for a specific event type. */
  subscribe<T extends DomainEventType>(
    eventType: T,
    handler: (event: Extract<DomainEvent, { type: T }>) => void,
  ): void;

  /** Remove a previously registered handler. */
  unsubscribe<T extends DomainEventType>(
    eventType: T,
    handler: (event: Extract<DomainEvent, { type: T }>) => void,
  ): void;

  /** Remove all listeners for every event type. */
  clear(): void;

  /**
   * Return buffered events, optionally filtered.
   *
   * The bus retains up to `historyLimit` events (default 1000) in a
   * bounded FIFO buffer. Oldest events are evicted when the limit is reached.
   */
  history(filter?: EventFilter): DomainEvent[];
}

const DEFAULT_HISTORY_LIMIT = 1000;

/**
 * Create a new in-memory {@link EventBus}.
 *
 * Each call produces an independent bus instance with its own listener
 * registry and history buffer, making it safe to use separate buses in tests.
 *
 * @param options - Optional configuration (e.g. history buffer size).
 */
export const createEventBus = (options?: EventBusOptions): EventBus => {
  const emitter = new EventEmitter();
  const historyLimit = options?.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const buffer: DomainEvent[] = [];

  const doPublish = (event: DomainEventInput): void => {
    const enriched: DomainEvent = {
      ...event,
      event_id: event.event_id ?? randomUUID(),
    } as DomainEvent;

    // Append to bounded history buffer
    buffer.push(enriched);
    if (buffer.length > historyLimit) {
      buffer.shift();
    }

    emitter.emit(enriched.type, enriched);
  };

  return {
    publish: doPublish,
    emit: doPublish,
    subscribe(eventType, handler) {
      emitter.on(eventType, handler);
    },
    unsubscribe(eventType, handler) {
      emitter.off(eventType, handler);
    },
    clear() {
      emitter.removeAllListeners();
      buffer.length = 0;
    },
    history(filter?: EventFilter): DomainEvent[] {
      let result = buffer;

      if (filter?.type) {
        result = result.filter((e) => e.type === filter.type);
      }
      if (filter?.after !== undefined) {
        const after = filter.after;
        result = result.filter((e) => e.timestamp > after);
      }

      return [...result];
    },
  };
};
