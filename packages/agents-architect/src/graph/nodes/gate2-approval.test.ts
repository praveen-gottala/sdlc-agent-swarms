/**
 * Tests for Gate 2 Approval and Escalation Gate — no-op pass-throughs.
 */

import { gate2Approval } from './gate2-approval.js';
import { escalationGate } from './escalation-gate.js';
import { makeState } from '../../test-utils.js';

describe('gate2Approval', () => {
  it('returns empty state update (no-op)', async () => {
    const result = await gate2Approval(makeState({ gate2Decision: 'approved' }));
    expect(result).toEqual({});
  });

  it('is a no-op regardless of decision state', async () => {
    const result = await gate2Approval(makeState({ gate2Decision: null }));
    expect(result).toEqual({});
  });
});

describe('escalationGate', () => {
  it('returns empty state update (no-op)', async () => {
    const result = await escalationGate(makeState({ criticRetries: 3 }));
    expect(result).toEqual({});
  });
});
