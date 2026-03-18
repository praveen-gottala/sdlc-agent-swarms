/**
 * In-memory event bus backed by eventemitter3.
 *
 * Provides a thin, type-safe wrapper that enforces communication
 * through {@link DomainEvent} values. Agents and subsystems publish
 * and subscribe via this bus rather than calling each other directly.
 */

import { EventEmitter } from 'eventemitter3';
import type { DomainEvent, DomainEventType } from './domain-events.js';

/**
 * Publish/subscribe interface for domain events.
 *
 * The generic constraints on `subscribe` and `unsubscribe` ensure that
 * handlers receive the correctly narrowed event type at compile time.
 */
export interface EventBus {
  /** Emit a domain event to all registered handlers for its type. */
  publish(event: DomainEvent): void;

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
}

/**
 * Create a new in-memory {@link EventBus}.
 *
 * Each call produces an independent bus instance with its own listener
 * registry, making it safe to use separate buses in tests.
 */
export const createEventBus = (): EventBus => {
  const emitter = new EventEmitter();

  return {
    publish(event) {
      emitter.emit(event.type, event);
    },
    subscribe(eventType, handler) {
      emitter.on(eventType, handler);
    },
    unsubscribe(eventType, handler) {
      emitter.off(eventType, handler);
    },
    clear() {
      emitter.removeAllListeners();
    },
  };
};
