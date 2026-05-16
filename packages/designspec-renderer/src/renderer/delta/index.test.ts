/**
 * @module delta/index.test
 * Unit tests for renderDelta, computeFieldDiff, and highlight markup.
 */
import { renderDelta, computeFieldDiff } from './index.js';
import { SAMPLE_TOKENS } from '../../__fixtures__/design-tokens.js';
import { V2_BUILTIN_CATALOG } from '../../__fixtures__/catalog-entries.js';
import { renderToJSX } from '../react/index.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { DesignSpecDelta } from './delta-types.js';

/* ------------------------------------------------------------------ */
/*  Shared fixtures                                                    */
/* ------------------------------------------------------------------ */

const BASE_SPEC: DesignSpecV2 = {
  screen: 'test-screen',
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
    header: { parent: 'root', order: 0, type: 'header', label: 'App Header', background: 'surface-primary' },
    card1: { parent: 'root', order: 1, type: 'container', label: 'First Card', background: 'surface' },
    card2: { parent: 'root', order: 2, type: 'container', label: 'Second Card', background: 'surface' },
    title: { parent: 'card1', order: 0, type: 'text', content: 'Hello World', typography: 'heading-1', color: 'text-primary' },
    subtitle: { parent: 'card1', order: 1, type: 'text', content: 'Description here', typography: 'body', color: 'text-secondary' },
  },
};

const EMPTY_DELTA: DesignSpecDelta = {
  screenId: 'test-screen',
  baseWidth: 1440,
  added: {},
  modified: {},
  removed: [],
  reordered: [],
};

/* ------------------------------------------------------------------ */
/*  Empty delta                                                        */
/* ------------------------------------------------------------------ */
describe('renderDelta — empty delta', () => {
  it('produces JSX with no highlights and all counts 0', () => {
    const result = renderDelta(BASE_SPEC, EMPTY_DELTA, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metadata.addedCount).toBe(0);
    expect(result.value.metadata.modifiedCount).toBe(0);
    expect(result.value.metadata.removedCount).toBe(0);
    expect(result.value.metadata.reorderedCount).toBe(0);
    expect(result.value.changeRegions).toEqual([]);
  });

  it('produces valid JSX string', () => {
    const result = renderDelta(BASE_SPEC, EMPTY_DELTA, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.jsx.length).toBeGreaterThan(0);
    expect(result.value.jsx).toContain('export function');
  });
});

/* ------------------------------------------------------------------ */
/*  Added-only delta                                                   */
/* ------------------------------------------------------------------ */
describe('renderDelta — added-only', () => {
  const addedDelta: DesignSpecDelta = {
    ...EMPTY_DELTA,
    added: {
      newCard: { parent: 'root', order: 3, type: 'container', label: 'New Card' },
      newText: { parent: 'newCard', order: 0, type: 'text', content: 'Fresh', typography: 'body', color: 'text-primary' },
    },
  };

  it('renders added nodes with r10-added class', () => {
    const result = renderDelta(BASE_SPEC, addedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.jsx).toContain('r10-highlight r10-added');
    expect(result.value.jsx).toContain('data-delta-op="added"');
    expect(result.value.jsx).toContain('data-node-id="newCard"');
  });

  it('includes Added badge annotation', () => {
    const result = renderDelta(BASE_SPEC, addedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.jsx).toContain('r10-badge-added');
    expect(result.value.jsx).toContain('+ Added');
  });

  it('has correct metadata counts', () => {
    const result = renderDelta(BASE_SPEC, addedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metadata.addedCount).toBe(2);
    expect(result.value.metadata.modifiedCount).toBe(0);
    expect(result.value.metadata.removedCount).toBe(0);
  });

  it('has correct changeRegions for added nodes', () => {
    const result = renderDelta(BASE_SPEC, addedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const addedRegions = result.value.changeRegions.filter(r => r.op === 'added');
    expect(addedRegions).toHaveLength(2);
    expect(addedRegions.map(r => r.nodeId).sort()).toEqual(['newCard', 'newText']);
  });
});

/* ------------------------------------------------------------------ */
/*  Modified-only delta                                                */
/* ------------------------------------------------------------------ */
describe('renderDelta — modified-only', () => {
  const modifiedDelta: DesignSpecDelta = {
    ...EMPTY_DELTA,
    modified: {
      title: { content: 'Goodbye World', color: 'accent' },
    },
  };

  it('renders modified nodes with r10-modified class', () => {
    const result = renderDelta(BASE_SPEC, modifiedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.jsx).toContain('r10-highlight r10-modified');
    expect(result.value.jsx).toContain('data-delta-op="modified"');
    expect(result.value.jsx).toContain('data-node-id="title"');
  });

  it('includes Modified badge annotation', () => {
    const result = renderDelta(BASE_SPEC, modifiedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.jsx).toContain('r10-badge-modified');
    expect(result.value.jsx).toContain('~ Modified');
  });

  it('has correct fieldDiffs in changeRegions', () => {
    const result = renderDelta(BASE_SPEC, modifiedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const modifiedRegions = result.value.changeRegions.filter(r => r.op === 'modified');
    expect(modifiedRegions).toHaveLength(1);
    expect(modifiedRegions[0].nodeId).toBe('title');
    expect(modifiedRegions[0].fieldDiffs).toBeDefined();

    const contentDiff = modifiedRegions[0].fieldDiffs!.find(d => d.field === 'content');
    expect(contentDiff).toBeDefined();
    expect(contentDiff!.before).toBe('Hello World');
    expect(contentDiff!.after).toBe('Goodbye World');

    const colorDiff = modifiedRegions[0].fieldDiffs!.find(d => d.field === 'color');
    expect(colorDiff).toBeDefined();
    expect(colorDiff!.before).toBe('text-primary');
    expect(colorDiff!.after).toBe('accent');
  });
});

/* ------------------------------------------------------------------ */
/*  Removed-only delta                                                 */
/* ------------------------------------------------------------------ */
describe('renderDelta — removed-only', () => {
  const removedDelta: DesignSpecDelta = {
    ...EMPTY_DELTA,
    removed: ['card2'],
  };

  it('has correct metadata counts', () => {
    const result = renderDelta(BASE_SPEC, removedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metadata.removedCount).toBe(1);
    expect(result.value.metadata.addedCount).toBe(0);
  });

  it('has correct changeRegions for removed nodes', () => {
    const result = renderDelta(BASE_SPEC, removedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const removedRegions = result.value.changeRegions.filter(r => r.op === 'removed');
    expect(removedRegions).toHaveLength(1);
    expect(removedRegions[0].nodeId).toBe('card2');
    expect(removedRegions[0].description).toContain('Removed');
  });
});

/* ------------------------------------------------------------------ */
/*  Mixed delta                                                        */
/* ------------------------------------------------------------------ */
describe('renderDelta — mixed delta', () => {
  const mixedDelta: DesignSpecDelta = {
    ...EMPTY_DELTA,
    added: {
      newSection: { parent: 'root', order: 3, type: 'section', label: 'New Section' },
    },
    modified: {
      header: { background: 'accent' },
    },
    removed: ['card2'],
    reordered: [
      { nodeId: 'card1', newOrder: 2 },
    ],
  };

  it('produces correct counts for all operation types', () => {
    const result = renderDelta(BASE_SPEC, mixedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.metadata.addedCount).toBe(1);
    expect(result.value.metadata.modifiedCount).toBe(1);
    expect(result.value.metadata.removedCount).toBe(1);
    expect(result.value.metadata.reorderedCount).toBe(1);
  });

  it('contains all highlight classes', () => {
    const result = renderDelta(BASE_SPEC, mixedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.jsx).toContain('r10-added');
    expect(result.value.jsx).toContain('r10-modified');
  });

  it('has correct total changeRegions', () => {
    const result = renderDelta(BASE_SPEC, mixedDelta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.changeRegions.length).toBe(4); // 1 added + 1 modified + 1 removed + 1 reordered
  });
});

/* ------------------------------------------------------------------ */
/*  Invalid delta                                                      */
/* ------------------------------------------------------------------ */
describe('renderDelta — invalid delta', () => {
  it('returns error for delta referencing non-existent node in modified', () => {
    const delta: DesignSpecDelta = {
      ...EMPTY_DELTA,
      modified: {
        nonexistent: { content: 'nope' },
      },
    };
    const result = renderDelta(BASE_SPEC, delta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('nonexistent');
  });

  it('returns error for non-overlay mode', () => {
    const result = renderDelta(BASE_SPEC, EMPTY_DELTA, SAMPLE_TOKENS, V2_BUILTIN_CATALOG, {
      mode: 'side-by-side',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_IMPLEMENTED');
    expect(result.error.message).toContain('side-by-side');
  });

  it('returns error for slider mode', () => {
    const result = renderDelta(BASE_SPEC, EMPTY_DELTA, SAMPLE_TOKENS, V2_BUILTIN_CATALOG, {
      mode: 'slider',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_IMPLEMENTED');
  });
});

/* ------------------------------------------------------------------ */
/*  Annotations control                                                */
/* ------------------------------------------------------------------ */
describe('renderDelta — annotations option', () => {
  const delta: DesignSpecDelta = {
    ...EMPTY_DELTA,
    added: { newNode: { parent: 'root', order: 3, type: 'text', content: 'X', typography: 'body', color: 'text-primary' } },
  };

  it('includes badges when annotations=true (default)', () => {
    const result = renderDelta(BASE_SPEC, delta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.jsx).toContain('r10-badge');
  });

  it('excludes badges when annotations=false', () => {
    const result = renderDelta(BASE_SPEC, delta, SAMPLE_TOKENS, V2_BUILTIN_CATALOG, {
      annotations: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.jsx).not.toContain('r10-badge');
  });
});

/* ------------------------------------------------------------------ */
/*  Complexity heuristic                                               */
/* ------------------------------------------------------------------ */
describe('renderDelta — complexity heuristic', () => {
  it('returns "low" for small specs', () => {
    const result = renderDelta(BASE_SPEC, EMPTY_DELTA, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metadata.estimatedRenderComplexity).toBe('low');
  });
});

/* ------------------------------------------------------------------ */
/*  computeFieldDiff                                                   */
/* ------------------------------------------------------------------ */
describe('computeFieldDiff', () => {
  it('returns empty array for empty partial', () => {
    const diffs = computeFieldDiff(BASE_SPEC.nodes['title'], {});
    expect(diffs).toEqual([]);
  });

  it('returns empty array for same-valued fields', () => {
    const diffs = computeFieldDiff(BASE_SPEC.nodes['title'], {
      content: 'Hello World', // same value
    });
    expect(diffs).toEqual([]);
  });

  it('returns diff entry for changed field', () => {
    const diffs = computeFieldDiff(BASE_SPEC.nodes['title'], {
      content: 'New Content',
    });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      field: 'content',
      before: 'Hello World',
      after: 'New Content',
    });
  });

  it('handles multiple changed fields', () => {
    const diffs = computeFieldDiff(BASE_SPEC.nodes['title'], {
      content: 'Changed',
      color: 'accent',
      typography: 'heading-2',
    });
    expect(diffs).toHaveLength(3);
    const fields = diffs.map(d => d.field).sort();
    expect(fields).toEqual(['color', 'content', 'typography']);
  });

  it('handles new field not on existing node', () => {
    const diffs = computeFieldDiff(BASE_SPEC.nodes['title'], {
      background: 'surface',
    });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      field: 'background',
      before: undefined,
      after: 'surface',
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Regression: empty delta matches renderToJSX                        */
/* ------------------------------------------------------------------ */
describe('renderDelta — regression vs renderToJSX', () => {
  it('empty delta output matches renderToJSX modulo data-node-id attributes', () => {
    const deltaResult = renderDelta(BASE_SPEC, EMPTY_DELTA, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    const jsxResult = renderToJSX(BASE_SPEC, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(deltaResult.ok).toBe(true);
    if (!deltaResult.ok) return;

    // Strip data-node-id attributes for comparison
    const stripNodeIds = (s: string) => s.replace(/ data-node-id="[^"]*"/g, '');
    expect(stripNodeIds(deltaResult.value.jsx)).toBe(stripNodeIds(jsxResult.jsx));
  });
});
