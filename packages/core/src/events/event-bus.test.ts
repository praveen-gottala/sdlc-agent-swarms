import { createEventBus } from './event-bus.js';
import type { DomainEvent, AgentStarted, AgentFailed } from './domain-events.js';
import type { EventBus } from './event-bus.js';

const now = Date.now();

const agentStartedEvent: AgentStarted = {
  type: 'AgentStarted',
  agentId: 'agent-1',
  taskId: 'task-1',
  timestamp: now,
};

const agentFailedEvent: AgentFailed = {
  type: 'AgentFailed',
  agentId: 'agent-1',
  taskId: 'task-1',
  error: 'something went wrong',
  timestamp: now,
};

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = createEventBus();
  });

  afterEach(() => {
    bus.clear();
  });

  it('delivers a published event to a subscriber', () => {
    const received: DomainEvent[] = [];
    bus.subscribe('AgentStarted', (e) => received.push(e));

    bus.publish(agentStartedEvent);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(agentStartedEvent);
  });

  it('only delivers events matching the subscribed type', () => {
    const started: DomainEvent[] = [];
    const failed: DomainEvent[] = [];

    bus.subscribe('AgentStarted', (e) => started.push(e));
    bus.subscribe('AgentFailed', (e) => failed.push(e));

    bus.publish(agentStartedEvent);
    bus.publish(agentFailedEvent);

    expect(started).toHaveLength(1);
    expect(started[0]).toEqual(agentStartedEvent);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toEqual(agentFailedEvent);
  });

  it('stops delivering events after unsubscribe', () => {
    const received: DomainEvent[] = [];
    const handler = (e: AgentStarted) => received.push(e);

    bus.subscribe('AgentStarted', handler);
    bus.publish(agentStartedEvent);
    expect(received).toHaveLength(1);

    bus.unsubscribe('AgentStarted', handler);
    bus.publish(agentStartedEvent);
    expect(received).toHaveLength(1);
  });

  it('clear removes all listeners', () => {
    const received: DomainEvent[] = [];
    bus.subscribe('AgentStarted', (e) => received.push(e));
    bus.subscribe('AgentFailed', (e) => received.push(e));

    bus.clear();

    bus.publish(agentStartedEvent);
    bus.publish(agentFailedEvent);

    expect(received).toHaveLength(0);
  });

  it('delivers the same event to multiple subscribers', () => {
    const receivedA: DomainEvent[] = [];
    const receivedB: DomainEvent[] = [];

    bus.subscribe('AgentStarted', (e) => receivedA.push(e));
    bus.subscribe('AgentStarted', (e) => receivedB.push(e));

    bus.publish(agentStartedEvent);

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);
    expect(receivedA[0]).toBe(receivedB[0]);
  });

  it('provides correctly narrowed types to handlers', () => {
    bus.subscribe('AgentFailed', (event) => {
      // TypeScript narrows `event` to AgentFailed here.
      // If this compiles, the type is correct.
      const _error: string = event.error;
      const _agentId: string = event.agentId;
      expect(_error).toBe('something went wrong');
      expect(_agentId).toBe('agent-1');
    });

    bus.publish(agentFailedEvent);
  });
});
