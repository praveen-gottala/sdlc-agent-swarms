/**
 * Tests for Node 2 — Options Explorer.
 */

import { createOptionsExplorer } from './options-explorer.js';
import { mockDeps, makeState } from '../../test-utils.js';

describe('createOptionsExplorer (Node 2)', () => {
  it('produces an OptionsBundle with empty memos when no gaps to explore', async () => {
    const node = createOptionsExplorer(mockDeps);
    const state = makeState({
      constraintSet: {
        projectId: 'test-project',
        constraints: [],
        gaps: [],
        mode: 'greenfield',
      },
    });

    const result = await node(state);

    expect(result.optionsBundle).toBeDefined();
    expect(result.optionsBundle!.projectId).toBe('test-project');
    expect(result.optionsBundle!.memos).toEqual([]);
  });

  it('skips resolved gaps', async () => {
    const node = createOptionsExplorer(mockDeps);
    const state = makeState({
      constraintSet: {
        projectId: 'test-project',
        constraints: [],
        gaps: [
          { id: 'gap-1', axis: 'api', description: 'Auth strategy', resolvedValue: 'none', resolvedBy: 'scope-exclusion' },
        ],
        mode: 'greenfield',
      },
    });

    const result = await node(state);

    expect(result.optionsBundle).toBeDefined();
    expect(result.optionsBundle!.memos).toEqual([]);
  });

  it('returns empty when stub provider produces empty content (no structured output)', async () => {
    const node = createOptionsExplorer(mockDeps);
    const state = makeState({
      constraintSet: {
        projectId: 'test-project',
        constraints: [],
        gaps: [
          { id: 'gap-1', axis: 'data-model', description: 'Data store choice' },
        ],
        mode: 'greenfield',
      },
    });

    const result = await node(state);

    expect(result.optionsBundle).toBeUndefined();
  });

  it('returns empty when no constraintSet', async () => {
    const node = createOptionsExplorer(mockDeps);
    const result = await node(makeState());

    expect(result.optionsBundle).toBeUndefined();
  });
});
