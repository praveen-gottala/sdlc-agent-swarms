/**
 * @module delta-utils.test
 * Tests for deltaApply and deltaCompute — pure delta utilities.
 */
import { deltaApply, deltaCompute } from './delta-utils.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { DesignSpecDelta } from './delta-types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const EMPTY_DELTA: DesignSpecDelta = {
  screenId: 'test',
  baseWidth: 1440,
  added: {},
  modified: {},
  removed: [],
  reordered: [],
};

const SIMPLE_SPEC: DesignSpecV2 = {
  screen: 'test',
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
    card1: { parent: 'root', order: 0, type: 'container', label: 'Card 1', background: 'surface' },
    card2: { parent: 'root', order: 1, type: 'container', label: 'Card 2', background: 'surface' },
    title: { parent: 'card1', order: 0, type: 'text', content: 'Hello', typography: 'heading-1', color: 'text-primary' },
  },
};

/* ------------------------------------------------------------------ */
/*  deltaApply                                                         */
/* ------------------------------------------------------------------ */
describe('deltaApply', () => {
  it('returns identical spec for empty delta', () => {
    const result = deltaApply(SIMPLE_SPEC, EMPTY_DELTA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toEqual(SIMPLE_SPEC.nodes);
    expect(result.value.screen).toBe(SIMPLE_SPEC.screen);
    expect(result.value.width).toBe(SIMPLE_SPEC.width);
  });

  it('adds new nodes correctly', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      added: {
        card3: { parent: 'root', order: 2, type: 'container', label: 'Card 3' },
      },
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes['card3']).toBeDefined();
    expect(result.value.nodes['card3'].label).toBe('Card 3');
    expect(result.value.nodes['card3'].order).toBe(2);
  });

  it('returns error when adding to non-existent parent', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      added: {
        orphan: { parent: 'nonexistent', order: 0, type: 'text', content: 'Orphan', typography: 'body', color: 'text-primary' },
      },
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_PARENT');
    expect(result.error.message).toContain('orphan');
  });

  it('modifies existing node fields via shallow merge', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      modified: {
        title: { content: 'Goodbye', color: 'text-secondary' },
      },
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes['title'].content).toBe('Goodbye');
    expect(result.value.nodes['title'].color).toBe('text-secondary');
    // Unmodified fields preserved
    expect(result.value.nodes['title'].typography).toBe('heading-1');
    expect(result.value.nodes['title'].parent).toBe('card1');
  });

  it('returns error when modifying non-existent node', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      modified: {
        ghost: { content: 'nope' },
      },
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NODE_NOT_FOUND');
    expect(result.error.message).toContain('ghost');
  });

  it('removes nodes and cascades to descendants', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      removed: ['card1'],
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // card1 removed
    expect(result.value.nodes['card1']).toBeUndefined();
    // title (child of card1) cascade-removed
    expect(result.value.nodes['title']).toBeUndefined();
    // card2 still present
    expect(result.value.nodes['card2']).toBeDefined();
    expect(result.value.nodes['root']).toBeDefined();
  });

  it('returns error when removing non-existent node', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      removed: ['nonexistent'],
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NODE_NOT_FOUND');
  });

  it('reorders nodes correctly', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      reordered: [
        { nodeId: 'card1', newOrder: 1 },
        { nodeId: 'card2', newOrder: 0 },
      ],
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes['card1'].order).toBe(1);
    expect(result.value.nodes['card2'].order).toBe(0);
  });

  it('reorders with parent change', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      reordered: [
        { nodeId: 'title', newParent: 'card2', newOrder: 0 },
      ],
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes['title'].parent).toBe('card2');
    expect(result.value.nodes['title'].order).toBe(0);
  });

  it('handles combined add + modify + remove + reorder', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      added: {
        card3: { parent: 'root', order: 2, type: 'container', label: 'New Card' },
      },
      modified: {
        card1: { background: 'accent' },
      },
      removed: ['card2'],
      reordered: [
        { nodeId: 'card1', newOrder: 1 },
      ],
    };
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes['card3']).toBeDefined();
    expect(result.value.nodes['card1'].background).toBe('accent');
    expect(result.value.nodes['card1'].order).toBe(1);
    expect(result.value.nodes['card2']).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  deltaCompute                                                       */
/* ------------------------------------------------------------------ */
describe('deltaCompute', () => {
  it('produces empty delta when specs are identical', () => {
    const delta = deltaCompute(SIMPLE_SPEC, SIMPLE_SPEC);
    expect(Object.keys(delta.added)).toHaveLength(0);
    expect(Object.keys(delta.modified)).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
    expect(delta.reordered).toHaveLength(0);
  });

  it('detects added nodes', () => {
    const applied: DesignSpecV2 = {
      ...SIMPLE_SPEC,
      nodes: {
        ...SIMPLE_SPEC.nodes,
        card3: { parent: 'root', order: 2, type: 'container', label: 'New' },
      },
    };
    const delta = deltaCompute(SIMPLE_SPEC, applied);
    expect(delta.added['card3']).toBeDefined();
    expect(delta.added['card3'].label).toBe('New');
  });

  it('detects removed nodes', () => {
    const { card2: _, ...rest } = SIMPLE_SPEC.nodes;
    const applied: DesignSpecV2 = {
      ...SIMPLE_SPEC,
      nodes: rest,
    };
    const delta = deltaCompute(SIMPLE_SPEC, applied);
    expect(delta.removed).toContain('card2');
  });

  it('detects modified nodes', () => {
    const applied: DesignSpecV2 = {
      ...SIMPLE_SPEC,
      nodes: {
        ...SIMPLE_SPEC.nodes,
        title: { ...SIMPLE_SPEC.nodes['title'], content: 'Changed' },
      },
    };
    const delta = deltaCompute(SIMPLE_SPEC, applied);
    expect(delta.modified['title']).toBeDefined();
    expect(delta.modified['title'].content).toBe('Changed');
    // Unchanged fields not in the diff
    expect(delta.modified['title'].typography).toBeUndefined();
  });

  it('detects order-only changes as reordered', () => {
    const applied: DesignSpecV2 = {
      ...SIMPLE_SPEC,
      nodes: {
        ...SIMPLE_SPEC.nodes,
        card1: { ...SIMPLE_SPEC.nodes['card1'], order: 1 },
        card2: { ...SIMPLE_SPEC.nodes['card2'], order: 0 },
      },
    };
    const delta = deltaCompute(SIMPLE_SPEC, applied);
    expect(delta.reordered).toHaveLength(2);
    const card1Reorder = delta.reordered.find(r => r.nodeId === 'card1');
    expect(card1Reorder?.newOrder).toBe(1);
    expect(Object.keys(delta.modified)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Round-trip property (critical)                                     */
/* ------------------------------------------------------------------ */
describe('round-trip: deltaApply(existing, deltaCompute(existing, applied)) === applied', () => {
  it('round-trips a simple add+modify+remove', () => {
    const { card2: _, ...rest } = SIMPLE_SPEC.nodes;
    const applied: DesignSpecV2 = {
      ...SIMPLE_SPEC,
      nodes: {
        ...rest,
        title: { ...SIMPLE_SPEC.nodes['title'], content: 'Updated', color: 'accent' },
        newNode: { parent: 'root', order: 5, type: 'text', content: 'Fresh', typography: 'body', color: 'text-primary' },
      },
    };

    const delta = deltaCompute(SIMPLE_SPEC, applied);
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toEqual(applied.nodes);
  });

  it('round-trips a reorder', () => {
    const applied: DesignSpecV2 = {
      ...SIMPLE_SPEC,
      nodes: {
        ...SIMPLE_SPEC.nodes,
        card1: { ...SIMPLE_SPEC.nodes['card1'], order: 1 },
        card2: { ...SIMPLE_SPEC.nodes['card2'], order: 0 },
      },
    };

    const delta = deltaCompute(SIMPLE_SPEC, applied);
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toEqual(applied.nodes);
  });

  it('round-trips an identity (no changes)', () => {
    const delta = deltaCompute(SIMPLE_SPEC, SIMPLE_SPEC);
    const result = deltaApply(SIMPLE_SPEC, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes).toEqual(SIMPLE_SPEC.nodes);
  });

  it('round-trips the real 159-node dashboard fixture with synthetic delta', () => {
    const monorepoRoot = path.resolve(__dirname, '../../../../..');
    const fixturePath = path.join(
      monorepoRoot,
      'fixtures/personal-expense-tracker/agentforge/designs/dashboard.json',
    );
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const dashboard = JSON.parse(raw) as DesignSpecV2;

    // Build an "applied" version: add a recurring section, modify a title, remove a node
    const nodeKeys = Object.keys(dashboard.nodes);
    const lastLeaf = nodeKeys[nodeKeys.length - 1];

    const applied: DesignSpecV2 = {
      ...dashboard,
      nodes: {
        ...dashboard.nodes,
        // Add new nodes
        'recurring-section': {
          parent: 'root',
          order: 99,
          type: 'section',
          label: 'Upcoming Recurring',
        },
        'recurring-item': {
          parent: 'recurring-section',
          order: 0,
          catalog: 'list-item',
          label: 'Netflix',
          overrides: { subtitle: 'Monthly · $15.99' },
        },
        // Modify an existing node
        'top-bar': {
          ...dashboard.nodes['top-bar'],
          background: 'accent-primary',
        },
      },
    };
    // Remove the last leaf node
    delete (applied.nodes as Record<string, unknown>)[lastLeaf];

    const delta = deltaCompute(dashboard, applied);
    const result = deltaApply(dashboard, delta);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.nodes).length).toBe(Object.keys(applied.nodes).length);
    expect(result.value.nodes).toEqual(applied.nodes);
  });
});
