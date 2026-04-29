import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { runStructuralQualityGate, MAX_STRUCTURAL_DEDUCTION } from './structural-quality-gate.js';

function makeSpec(nodes: Record<string, Record<string, unknown>>): DesignSpecV2 {
  return { screen: 'test', nodes } as unknown as DesignSpecV2;
}

describe('runStructuralQualityGate', () => {
  it('returns 100 for an empty spec (no sections to check)', () => {
    const result = runStructuralQualityGate(makeSpec({ root: { type: 'page', parent: null, order: 0 } }));

    expect(result.score).toBe(100);
    expect(result.deductions).toBe(0);
    expect(result.issues).toHaveLength(0);
  });

  it('returns 100 when treatments are diverse (no monotony)', () => {
    const result = runStructuralQualityGate(makeSpec({
      root: { type: 'page', parent: null, order: 0, layout: 'vertical' },
      s1: { type: 'container', parent: 'root', order: 1, shadow: 'sm' },
      s2: { type: 'container', parent: 'root', order: 2, overrides: { border: '1px solid #ccc' } },
      s3: { type: 'container', parent: 'root', order: 3, background: 'surface-secondary' },
    }));

    expect(result.score).toBe(100);
    expect(result.deductions).toBe(0);
    expect(result.containerDiversity.isMonotonous).toBe(false);
  });

  it('deducts 10 for monotonous container treatments', () => {
    const result = runStructuralQualityGate(makeSpec({
      root: { type: 'page', parent: null, order: 0, layout: 'vertical' },
      s1: { type: 'container', parent: 'root', order: 1, shadow: 'sm' },
      s2: { type: 'container', parent: 'root', order: 2, shadow: 'md' },
      s3: { type: 'container', parent: 'root', order: 3, shadow: 'lg' },
    }));

    expect(result.score).toBe(90);
    expect(result.deductions).toBe(10);
    expect(result.containerDiversity.isMonotonous).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].issueId).toBe('container-treatment-monotony');
  });

  it('deducts 10 for low catalog adoption', () => {
    const result = runStructuralQualityGate(makeSpec({
      root: { type: 'page', parent: null, order: 0, layout: 'vertical' },
      h: { type: 'container', parent: 'root', order: 1 },
      t1: { type: 'text', parent: 'h', order: 1, typography: 'heading-1' },
      t2: { type: 'text', parent: 'h', order: 2 },
      c1: { type: 'container', parent: 'root', order: 2 },
      c2: { type: 'container', parent: 'root', order: 3 },
      c3: { type: 'container', parent: 'root', order: 4 },
      c4: { type: 'container', parent: 'root', order: 5 },
    }));

    expect(result.catalogAdoption.isLow).toBe(true);
    expect(result.issues.some(i => i.issueId === 'low-catalog-adoption')).toBe(true);
    expect(result.score).toBeLessThanOrEqual(90);
  });

  it('deducts for both monotony and low adoption, capped at MAX_STRUCTURAL_DEDUCTION', () => {
    const result = runStructuralQualityGate(makeSpec({
      root: { type: 'page', parent: null, order: 0, layout: 'vertical' },
      s1: { type: 'container', parent: 'root', order: 1, shadow: 'sm' },
      t1: { type: 'text', parent: 's1', order: 1, typography: 'heading-1' },
      t1b: { type: 'text', parent: 's1', order: 2 },
      s2: { type: 'container', parent: 'root', order: 2, shadow: 'md' },
      s3: { type: 'container', parent: 'root', order: 3, shadow: 'lg' },
      s4: { type: 'container', parent: 'root', order: 4, shadow: 'xl' },
    }));

    expect(result.deductions).toBeLessThanOrEqual(MAX_STRUCTURAL_DEDUCTION);
    expect(result.score).toBeGreaterThanOrEqual(100 - MAX_STRUCTURAL_DEDUCTION);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('returns full sub-results for downstream inspection', () => {
    const result = runStructuralQualityGate(makeSpec({
      root: { type: 'page', parent: null, order: 0, layout: 'vertical' },
      s1: { type: 'container', parent: 'root', order: 1 },
    }));

    expect(result.containerDiversity).toBeDefined();
    expect(result.catalogAdoption).toBeDefined();
    expect(typeof result.containerDiversity.isMonotonous).toBe('boolean');
    expect(typeof result.catalogAdoption.catalogRatio).toBe('number');
  });

  it('does not flag monotony with fewer than 3 top-level sections', () => {
    const result = runStructuralQualityGate(makeSpec({
      root: { type: 'page', parent: null, order: 0, layout: 'vertical' },
      s1: { type: 'container', parent: 'root', order: 1, shadow: 'sm' },
      s2: { type: 'container', parent: 'root', order: 2, shadow: 'md' },
    }));

    expect(result.containerDiversity.isMonotonous).toBe(false);
    expect(result.issues.some(i => i.issueId === 'container-treatment-monotony')).toBe(false);
  });
});
