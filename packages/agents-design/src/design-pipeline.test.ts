/**
 * Integration test: verifies the full design pipeline event chain
 * using a real EventBus instance.
 */

import { createEventBus } from '@agentforge/core';
import type { DomainEvent } from '@agentforge/core';

// ============================================================================
// Tests
// ============================================================================

describe('Design Pipeline Integration', () => {
  it('fires events in the correct order through the pipeline', () => {
    const eventBus = createEventBus();
    const received: string[] = [];

    // Subscribe to all design events
    eventBus.subscribe('PageRequested', () => received.push('PageRequested'));
    eventBus.subscribe('UXResearchComplete', () => received.push('UXResearchComplete'));
    eventBus.subscribe('WireframeComplete', () => received.push('WireframeComplete'));
    eventBus.subscribe('WireframeApproved', () => received.push('WireframeApproved'));
    eventBus.subscribe('VisualDesignComplete', () => received.push('VisualDesignComplete'));
    eventBus.subscribe('DesignReviewComplete', () => received.push('DesignReviewComplete'));
    eventBus.subscribe('DesignPhaseComplete', () => received.push('DesignPhaseComplete'));

    // Simulate the pipeline by publishing events in sequence
    eventBus.publish({
      type: 'PageRequested',
      pageId: 'page-1',
      taskId: 'task-1',
      description: 'User dashboard',
      source: 'test',
      timestamp: Date.now(),
    });

    eventBus.publish({
      type: 'UXResearchComplete',
      pageId: 'page-1',
      taskId: 'task-1',
      layoutSuggestions: ['Single column layout'],
      source: 'test',
      timestamp: Date.now(),
    });

    eventBus.publish({
      type: 'WireframeComplete',
      pageId: 'page-1',
      taskId: 'task-1',
      designRef: 'designs/page-1/wireframe',
      source: 'test',
      timestamp: Date.now(),
    });

    eventBus.publish({
      type: 'WireframeApproved',
      pageId: 'page-1',
      taskId: 'task-1',
      designRef: 'designs/page-1/wireframe',
      source: 'test',
      timestamp: Date.now(),
    });

    eventBus.publish({
      type: 'VisualDesignComplete',
      pageId: 'page-1',
      taskId: 'task-1',
      designRef: 'designs/page-1/visual',
      source: 'test',
      timestamp: Date.now(),
    });

    eventBus.publish({
      type: 'DesignReviewComplete',
      pageId: 'page-1',
      taskId: 'task-1',
      passed: true,
      issues: [],
      source: 'test',
      timestamp: Date.now(),
    });

    eventBus.publish({
      type: 'DesignPhaseComplete',
      specRef: 'agentforge/spec/pages.yaml#page-1',
      designRef: 'designs/page-1/visual',
      source: 'test',
      timestamp: Date.now(),
    });

    expect(received).toEqual([
      'PageRequested',
      'UXResearchComplete',
      'WireframeComplete',
      'WireframeApproved',
      'VisualDesignComplete',
      'DesignReviewComplete',
      'DesignPhaseComplete',
    ]);
  });

  it('supports multiple handlers for the same event', () => {
    const eventBus = createEventBus();
    let handlerCount = 0;

    eventBus.subscribe('PageRequested', () => handlerCount++);
    eventBus.subscribe('PageRequested', () => handlerCount++);

    eventBus.publish({
      type: 'PageRequested',
      pageId: 'page-1',
      taskId: 'task-1',
      description: 'Test',
      source: 'test',
      timestamp: Date.now(),
    });

    expect(handlerCount).toBe(2);
  });

  it('carries event data to subscribers', () => {
    const eventBus = createEventBus();
    let receivedEvent: DomainEvent | null = null;

    eventBus.subscribe('DesignReviewComplete', (event) => {
      receivedEvent = event;
    });

    eventBus.publish({
      type: 'DesignReviewComplete',
      pageId: 'page-1',
      taskId: 'task-1',
      passed: false,
      issues: ['Low contrast'],
      source: 'test',
      timestamp: 1234567890,
    });

    expect(receivedEvent).not.toBeNull();
    const event = receivedEvent as unknown as { passed: boolean; issues: string[] };
    expect(event.passed).toBe(false);
    expect(event.issues).toEqual(['Low contrast']);
  });

  it('clear() removes all listeners', () => {
    const eventBus = createEventBus();
    let called = false;

    eventBus.subscribe('PageRequested', () => { called = true; });
    eventBus.clear();

    eventBus.publish({
      type: 'PageRequested',
      pageId: 'page-1',
      taskId: 'task-1',
      description: 'Test',
      source: 'test',
      timestamp: Date.now(),
    });

    expect(called).toBe(false);
  });
});
