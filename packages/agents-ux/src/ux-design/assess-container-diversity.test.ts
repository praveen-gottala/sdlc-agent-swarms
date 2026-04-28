/**
 * @module assess-container-diversity.test
 *
 * Unit tests for container treatment classification and diversity assessment.
 * Tests live in the package that owns the functions (agents-ux).
 */

import { classifyContainerTreatment, assessContainerDiversity } from './assess-container-diversity.js';
import type { NodeSpec, DesignSpecV2 } from '@agentforge/designspec-renderer';

// ============================================================================
// classifyContainerTreatment
// ============================================================================

describe('classifyContainerTreatment', () => {
  it('classifies node with shadow as elevated', () => {
    const node: NodeSpec = { parent: 'root', order: 0, type: 'section', shadow: 'sm', radius: 12, background: 'surface-primary' };
    expect(classifyContainerTreatment(node)).toBe('elevated');
  });

  it('classifies node with border + secondary background as inset', () => {
    const node: NodeSpec = {
      parent: 'root', order: 0, type: 'container',
      background: 'surface-secondary',
      overrides: { border: '1px solid var(--border-default)' },
    };
    expect(classifyContainerTreatment(node)).toBe('inset');
  });

  it('classifies node with border only as outlined', () => {
    const node: NodeSpec = {
      parent: 'root', order: 0, type: 'section',
      radius: 12,
      overrides: { border: '1px solid var(--border-default)' },
    };
    expect(classifyContainerTreatment(node)).toBe('outlined');
  });

  it('classifies node with borderBottom as separated', () => {
    const node: NodeSpec = {
      parent: 'root', order: 0, type: 'container',
      overrides: { borderBottom: '1px solid var(--border-default)' },
    };
    expect(classifyContainerTreatment(node)).toBe('separated');
  });

  it('classifies node with secondary background as flat', () => {
    const node: NodeSpec = { parent: 'root', order: 0, type: 'section', background: 'surface-secondary' };
    expect(classifyContainerTreatment(node)).toBe('flat');
  });

  it('classifies node with no styling as bare', () => {
    const node: NodeSpec = { parent: 'root', order: 0, type: 'container' };
    expect(classifyContainerTreatment(node)).toBe('bare');
  });

  it('shadow dominates even when border is present', () => {
    const node: NodeSpec = {
      parent: 'root', order: 0, type: 'section',
      shadow: 'md',
      overrides: { border: '1px solid var(--border-default)' },
    };
    expect(classifyContainerTreatment(node)).toBe('elevated');
  });
});

// ============================================================================
// assessContainerDiversity
// ============================================================================

function makeSpec(nodes: Record<string, NodeSpec>): DesignSpecV2 {
  return { screen: 'test', width: 1440, nodes };
}

describe('assessContainerDiversity', () => {
  it('flags 3+ sections all elevated as monotonous', () => {
    const spec = makeSpec({
      root: { parent: null, order: 0, type: 'page' },
      s1: { parent: 'root', order: 0, type: 'section', shadow: 'sm', radius: 12 },
      s2: { parent: 'root', order: 1, type: 'section', shadow: 'sm', radius: 12 },
      s3: { parent: 'root', order: 2, type: 'section', shadow: 'sm', radius: 12 },
    });
    const result = assessContainerDiversity(spec);
    expect(result.isMonotonous).toBe(true);
    expect(result.dominantTreatment).toBe('elevated');
    expect(result.treatments).toHaveLength(3);
  });

  it('reports mixed treatments as not monotonous', () => {
    const spec = makeSpec({
      root: { parent: null, order: 0, type: 'page' },
      s1: { parent: 'root', order: 0, type: 'section', shadow: 'sm' },
      s2: { parent: 'root', order: 1, type: 'section', overrides: { border: '1px solid #ccc' } },
      s3: { parent: 'root', order: 2, type: 'section', background: 'surface-secondary' },
    });
    const result = assessContainerDiversity(spec);
    expect(result.isMonotonous).toBe(false);
    expect(result.dominantTreatment).toBeNull();
  });

  it('returns not monotonous when fewer than 3 sections', () => {
    const spec = makeSpec({
      root: { parent: null, order: 0, type: 'page' },
      s1: { parent: 'root', order: 0, type: 'section', shadow: 'sm' },
      s2: { parent: 'root', order: 1, type: 'section', shadow: 'sm' },
    });
    const result = assessContainerDiversity(spec);
    expect(result.isMonotonous).toBe(false);
    expect(result.treatments).toHaveLength(2);
  });

  it('flags all bare sections as monotonous', () => {
    const spec = makeSpec({
      root: { parent: null, order: 0, type: 'page' },
      s1: { parent: 'root', order: 0, type: 'container' },
      s2: { parent: 'root', order: 1, type: 'container' },
      s3: { parent: 'root', order: 2, type: 'container' },
      s4: { parent: 'root', order: 3, type: 'container' },
    });
    const result = assessContainerDiversity(spec);
    expect(result.isMonotonous).toBe(true);
    expect(result.dominantTreatment).toBe('bare');
    expect(result.treatments).toHaveLength(4);
  });

  it('excludes header, divider, spacer, text from analysis', () => {
    const spec = makeSpec({
      root: { parent: null, order: 0, type: 'page' },
      hdr: { parent: 'root', order: 0, type: 'header' },
      div: { parent: 'root', order: 1, type: 'divider' },
      spc: { parent: 'root', order: 2, type: 'spacer' },
      txt: { parent: 'root', order: 3, type: 'text', content: 'Hello' },
      s1: { parent: 'root', order: 4, type: 'section', shadow: 'sm' },
      s2: { parent: 'root', order: 5, type: 'section', shadow: 'sm' },
    });
    const result = assessContainerDiversity(spec);
    expect(result.treatments).toHaveLength(2);
    expect(result.isMonotonous).toBe(false);
  });

  it('ignores nodes not parented to root', () => {
    const spec = makeSpec({
      root: { parent: null, order: 0, type: 'page' },
      s1: { parent: 'root', order: 0, type: 'section', shadow: 'sm' },
      s2: { parent: 'root', order: 1, type: 'section', shadow: 'sm' },
      nested: { parent: 's1', order: 0, type: 'section', shadow: 'sm' },
    });
    const result = assessContainerDiversity(spec);
    expect(result.treatments).toHaveLength(2);
    expect(result.isMonotonous).toBe(false);
  });
});
