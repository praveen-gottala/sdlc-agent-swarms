/**
 * Tests for ArchitectStateAnnotation — verifies 23-channel structure.
 */

import { ArchitectStateAnnotation } from './state.js';

describe('ArchitectStateAnnotation', () => {
  it('has exactly 23 channels', () => {
    const spec = ArchitectStateAnnotation.spec;
    const channelNames = Object.keys(spec);
    expect(channelNames).toHaveLength(23);
  });

  it('contains all expected channels', () => {
    const spec = ArchitectStateAnnotation.spec;
    const channelNames = Object.keys(spec);

    const expected = [
      'enrichedRequirement', 'assumptionLedger', 'mode', 'existingFiles',
      'existingRepoSnapshot', 'retrievalContext',
      'changeClassification', 'constraintSet', 'optionsBundle', 'architectureSpec',
      'dataModelSpec', 'apiChangeSets', 'componentCompositions', 'screenPlans', 'designSystemDiff',
      'taskPlan', 'criticReport', 'criticPassed', 'criticRetries',
      'lastFailedGate', 'gate2Decision', 'gate2Edits', 'threadId',
    ];

    for (const name of expected) {
      expect(channelNames).toContain(name);
    }
  });

  it('channels include all expected names in the right order', () => {
    const spec = ArchitectStateAnnotation.spec;
    const channelNames = Object.keys(spec);

    // Verify ordering: inputs → node outputs → critic → routing
    expect(channelNames.indexOf('enrichedRequirement')).toBeLessThan(channelNames.indexOf('changeClassification'));
    expect(channelNames.indexOf('constraintSet')).toBeLessThan(channelNames.indexOf('taskPlan'));
    expect(channelNames.indexOf('criticPassed')).toBeLessThan(channelNames.indexOf('gate2Decision'));
  });
});
