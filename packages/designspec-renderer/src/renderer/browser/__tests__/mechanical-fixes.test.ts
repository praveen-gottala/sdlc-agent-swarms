/**
 * Unit tests for mechanical auto-fixes.
 * Pure functions — no browser, no LLM.
 */
import {
  checkMechanicalIssues,
  applyMechanicalFixes,
  OVERLAP_THRESHOLD_PX,
  OVERFLOW_THRESHOLD_PX,
  BADGE_WIDTH_RATIO,
  TEXT_CLIP_TOLERANCE_PX,
} from '../mechanical-fixes.js';
import type { DOMLayoutData, DOMNodeLayout } from '../dom-extraction.js';
import { defaultComputedStyles } from '../dom-extraction.js';
import type { DesignSpecV2 } from '../../../types/design-spec-v2.js';

// ─── Helpers ─────────────────────────────────────────────

function makeNode(overrides: Partial<DOMNodeLayout>): DOMNodeLayout {
  return {
    nodeId: 'test-node',
    dataCatalog: null,
    rect: { x: 0, y: 0, width: 100, height: 40 },
    scrollWidth: 100,
    clientWidth: 100,
    scrollHeight: 40,
    clientHeight: 40,
    textContent: 'Test',
    parentNodeId: null,
    childNodeIds: [],
    directTextContent: '',
    attributes: { 'aria-label': null, role: null, href: null },
    computed: { ...defaultComputedStyles(), overflow: 'visible', display: 'flex', position: 'static' },
    ...overrides,
  };
}

function makeDom(nodes: DOMNodeLayout[]): DOMLayoutData {
  const nodesMap: Record<string, DOMNodeLayout> = {};
  for (const n of nodes) nodesMap[n.nodeId] = n;
  return { nodes: nodesMap, viewportWidth: 1440, viewportHeight: 900 };
}

function makeSpec(nodes: Record<string, Record<string, unknown>>): DesignSpecV2 {
  return {
    screen: 'test',
    width: 1440,
    nodes: nodes as unknown as DesignSpecV2['nodes'],
  };
}

// ─── Tests ───────────────────────────────────────────────

describe('checkMechanicalIssues', () => {
  it('returns empty array when no issues', () => {
    const dom = makeDom([
      makeNode({ nodeId: 'root', childNodeIds: ['child'] }),
      makeNode({ nodeId: 'child', parentNodeId: 'root' }),
    ]);
    const spec = makeSpec({
      root: { parent: null, order: 0, type: 'page' },
      child: { parent: 'root', order: 0, type: 'text' },
    });
    const issues = checkMechanicalIssues(dom, spec);
    expect(issues).toEqual([]);
  });

  describe('badge-oversize (Tier 1)', () => {
    it('detects oversized badge', () => {
      const textContent = 'OK';
      const estimatedWidth = textContent.length * 8; // 16px
      const oversizedWidth = estimatedWidth * (BADGE_WIDTH_RATIO + 1); // well over threshold
      const dom = makeDom([
        makeNode({
          nodeId: 'badge-1',
          dataCatalog: 'badge-success',
          rect: { x: 0, y: 0, width: oversizedWidth, height: 24 },
          textContent,
        }),
      ]);
      const spec = makeSpec({ 'badge-1': { parent: null, order: 0, catalog: 'badge-success', width: oversizedWidth } });
      const issues = checkMechanicalIssues(dom, spec);
      const badge = issues.find(i => i.rule === 'badge-oversize');
      expect(badge).toBeDefined();
      expect(badge!.autoFixable).toBe(true);
      expect(badge!.suggestedFix).toEqual({ width: undefined });
    });

    it('detects oversized chip', () => {
      const dom = makeDom([
        makeNode({
          nodeId: 'chip-1',
          dataCatalog: 'chip',
          rect: { x: 0, y: 0, width: 200, height: 24 },
          textContent: 'Hi',
        }),
      ]);
      const spec = makeSpec({ 'chip-1': { parent: null, order: 0, catalog: 'chip', width: 200 } });
      const issues = checkMechanicalIssues(dom, spec);
      expect(issues.some(i => i.rule === 'badge-oversize')).toBe(true);
    });

    it('ignores properly sized badge', () => {
      const dom = makeDom([
        makeNode({
          nodeId: 'badge-1',
          dataCatalog: 'badge-info',
          rect: { x: 0, y: 0, width: 30, height: 24 },
          textContent: 'Info',
        }),
      ]);
      const spec = makeSpec({ 'badge-1': { parent: null, order: 0, catalog: 'badge-info' } });
      const issues = checkMechanicalIssues(dom, spec);
      expect(issues.some(i => i.rule === 'badge-oversize')).toBe(false);
    });
  });

  describe('text-clip (Tier 1)', () => {
    it('detects text clipping', () => {
      const dom = makeDom([
        makeNode({
          nodeId: 'text-1',
          scrollWidth: 200,
          clientWidth: 100,
          textContent: 'Long text that overflows',
        }),
      ]);
      const spec = makeSpec({ 'text-1': { parent: null, order: 0, type: 'text', width: 100 } });
      const issues = checkMechanicalIssues(dom, spec);
      const clip = issues.find(i => i.rule === 'text-clip');
      expect(clip).toBeDefined();
      expect(clip!.autoFixable).toBe(true);
      expect(clip!.suggestedFix).toEqual({ width: 'fill' });
    });

    it('ignores sub-pixel differences within tolerance', () => {
      const dom = makeDom([
        makeNode({
          nodeId: 'text-1',
          scrollWidth: 100 + TEXT_CLIP_TOLERANCE_PX,
          clientWidth: 100,
        }),
      ]);
      const spec = makeSpec({ 'text-1': { parent: null, order: 0, type: 'text' } });
      const issues = checkMechanicalIssues(dom, spec);
      expect(issues.some(i => i.rule === 'text-clip')).toBe(false);
    });
  });

  describe('zero-size (Tier 1)', () => {
    it('detects zero-width element with content', () => {
      const dom = makeDom([
        makeNode({
          nodeId: 'collapsed',
          rect: { x: 0, y: 0, width: 0.5, height: 40 },
          textContent: 'Visible text',
        }),
      ]);
      const spec = makeSpec({ collapsed: { parent: null, order: 0, type: 'text', width: 0 } });
      const issues = checkMechanicalIssues(dom, spec);
      const zero = issues.find(i => i.rule === 'zero-size');
      expect(zero).toBeDefined();
      expect(zero!.autoFixable).toBe(true);
    });

    it('ignores zero-size element with no content', () => {
      const dom = makeDom([
        makeNode({
          nodeId: 'empty',
          rect: { x: 0, y: 0, width: 0, height: 0 },
          textContent: '',
          childNodeIds: [],
        }),
      ]);
      const spec = makeSpec({ empty: { parent: null, order: 0, type: 'spacer' } });
      const issues = checkMechanicalIssues(dom, spec);
      expect(issues.some(i => i.rule === 'zero-size')).toBe(false);
    });
  });

  describe('overlap (Tier 2)', () => {
    it('detects sibling overlap', () => {
      const dom = makeDom([
        makeNode({ nodeId: 'parent', childNodeIds: ['a', 'b'] }),
        makeNode({
          nodeId: 'a',
          parentNodeId: 'parent',
          rect: { x: 0, y: 0, width: 100, height: 40 },
        }),
        makeNode({
          nodeId: 'b',
          parentNodeId: 'parent',
          rect: { x: 50, y: 0, width: 100, height: 40 },
        }),
      ]);
      const spec = makeSpec({
        parent: { parent: null, order: 0, type: 'container' },
        a: { parent: 'parent', order: 0, type: 'text' },
        b: { parent: 'parent', order: 1, type: 'text' },
      });
      const issues = checkMechanicalIssues(dom, spec);
      const overlap = issues.find(i => i.rule === 'overlap');
      expect(overlap).toBeDefined();
      expect(overlap!.autoFixable).toBe(false);
      expect(overlap!.suggestedFix).toBeNull();
    });

    it('ignores sub-pixel overlap within threshold', () => {
      const dom = makeDom([
        makeNode({ nodeId: 'parent', childNodeIds: ['a', 'b'] }),
        makeNode({
          nodeId: 'a',
          parentNodeId: 'parent',
          rect: { x: 0, y: 0, width: 100, height: 40 },
        }),
        makeNode({
          nodeId: 'b',
          parentNodeId: 'parent',
          rect: { x: 100 - OVERLAP_THRESHOLD_PX, y: 0, width: 100, height: 40 },
        }),
      ]);
      const spec = makeSpec({
        parent: { parent: null, order: 0, type: 'container' },
        a: { parent: 'parent', order: 0, type: 'text' },
        b: { parent: 'parent', order: 1, type: 'text' },
      });
      const issues = checkMechanicalIssues(dom, spec);
      expect(issues.some(i => i.rule === 'overlap')).toBe(false);
    });
  });

  describe('child-overflow (Tier 2)', () => {
    it('detects child overflowing parent', () => {
      const dom = makeDom([
        makeNode({
          nodeId: 'parent',
          rect: { x: 0, y: 0, width: 200, height: 100 },
          childNodeIds: ['child'],
        }),
        makeNode({
          nodeId: 'child',
          parentNodeId: 'parent',
          rect: { x: 0, y: 0, width: 250, height: 100 },
        }),
      ]);
      const spec = makeSpec({
        parent: { parent: null, order: 0, type: 'container' },
        child: { parent: 'parent', order: 0, type: 'text' },
      });
      const issues = checkMechanicalIssues(dom, spec);
      const overflow = issues.find(i => i.rule === 'child-overflow');
      expect(overflow).toBeDefined();
      expect(overflow!.autoFixable).toBe(false);
    });

    it('ignores overflow within threshold', () => {
      const dom = makeDom([
        makeNode({
          nodeId: 'parent',
          rect: { x: 0, y: 0, width: 200, height: 100 },
          childNodeIds: ['child'],
        }),
        makeNode({
          nodeId: 'child',
          parentNodeId: 'parent',
          rect: { x: 0, y: 0, width: 200 + OVERFLOW_THRESHOLD_PX, height: 100 },
        }),
      ]);
      const spec = makeSpec({
        parent: { parent: null, order: 0, type: 'container' },
        child: { parent: 'parent', order: 0, type: 'text' },
      });
      const issues = checkMechanicalIssues(dom, spec);
      expect(issues.some(i => i.rule === 'child-overflow')).toBe(false);
    });
  });

  it('detects all five rules at once', () => {
    const dom = makeDom([
      makeNode({
        nodeId: 'parent',
        rect: { x: 0, y: 0, width: 200, height: 100 },
        childNodeIds: ['badge', 'clipped', 'collapsed', 'sib-a', 'sib-b', 'overflow-child'],
      }),
      makeNode({
        nodeId: 'badge',
        parentNodeId: 'parent',
        dataCatalog: 'badge-warn',
        rect: { x: 0, y: 0, width: 200, height: 24 },
        textContent: 'OK',
      }),
      makeNode({
        nodeId: 'clipped',
        parentNodeId: 'parent',
        rect: { x: 0, y: 30, width: 80, height: 20 },
        scrollWidth: 160,
        clientWidth: 80,
        textContent: 'Long text',
      }),
      makeNode({
        nodeId: 'collapsed',
        parentNodeId: 'parent',
        rect: { x: 0, y: 55, width: 0.5, height: 20 },
        textContent: 'Hidden',
      }),
      makeNode({
        nodeId: 'sib-a',
        parentNodeId: 'parent',
        rect: { x: 0, y: 80, width: 100, height: 30 },
      }),
      makeNode({
        nodeId: 'sib-b',
        parentNodeId: 'parent',
        rect: { x: 50, y: 80, width: 100, height: 30 },
      }),
      makeNode({
        nodeId: 'overflow-child',
        parentNodeId: 'parent',
        rect: { x: 0, y: 0, width: 250, height: 100 },
      }),
    ]);
    const spec = makeSpec({
      parent: { parent: null, order: 0, type: 'container' },
      badge: { parent: 'parent', order: 0, catalog: 'badge-warn', width: 200 },
      clipped: { parent: 'parent', order: 1, type: 'text', width: 80 },
      collapsed: { parent: 'parent', order: 2, type: 'text', width: 0 },
      'sib-a': { parent: 'parent', order: 3, type: 'text' },
      'sib-b': { parent: 'parent', order: 4, type: 'text' },
      'overflow-child': { parent: 'parent', order: 5, type: 'section' },
    });

    const issues = checkMechanicalIssues(dom, spec);
    const rules = new Set(issues.map(i => i.rule));
    expect(rules.has('badge-oversize')).toBe(true);
    expect(rules.has('text-clip')).toBe(true);
    expect(rules.has('zero-size')).toBe(true);
    expect(rules.has('overlap')).toBe(true);
    expect(rules.has('child-overflow')).toBe(true);
  });
});

describe('applyMechanicalFixes', () => {
  it('applies Tier 1 fixes only', () => {
    const spec = makeSpec({
      'badge-1': { parent: null, order: 0, catalog: 'badge', width: 300 },
      'text-1': { parent: null, order: 1, type: 'text', width: 100 },
    });

    const issues = [
      {
        nodeId: 'badge-1',
        rule: 'badge-oversize' as const,
        autoFixable: true,
        description: 'Badge too wide',
        suggestedFix: { width: undefined },
      },
      {
        nodeId: 'text-1',
        rule: 'text-clip' as const,
        autoFixable: true,
        description: 'Text clipped',
        suggestedFix: { width: 'fill' },
      },
      {
        nodeId: 'sib-a',
        rule: 'overlap' as const,
        autoFixable: false,
        description: 'Siblings overlap',
        suggestedFix: null,
      },
    ];

    const patched = applyMechanicalFixes(spec, issues);

    // Badge: width removed
    expect(patched.nodes['badge-1'].width).toBeUndefined();

    // Text: width set to 'fill'
    expect(patched.nodes['text-1'].width).toBe('fill');

    // Original spec not mutated
    expect(spec.nodes['badge-1'].width).toBe(300);
    expect(spec.nodes['text-1'].width).toBe(100);
  });

  it('returns same spec if no tier 1 issues', () => {
    const spec = makeSpec({ a: { parent: null, order: 0, type: 'text' } });
    const issues = [{
      nodeId: 'a',
      rule: 'overlap' as const,
      autoFixable: false,
      description: 'Overlap',
      suggestedFix: null,
    }];
    const result = applyMechanicalFixes(spec, issues);
    expect(result).toBe(spec); // Same reference — no cloning needed
  });
});
