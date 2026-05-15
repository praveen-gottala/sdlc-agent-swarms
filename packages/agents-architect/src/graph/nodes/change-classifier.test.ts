/**
 * Tests for Node 0.5 — Change Classifier.
 */

import { createChangeClassifier } from './change-classifier.js';
import { mockDeps, makeState } from '../../test-utils.js';

describe('createChangeClassifier (Node 0.5)', () => {
  it('populates existingFiles from repo snapshot', async () => {
    const node = createChangeClassifier(mockDeps);
    const state = makeState({
      mode: 'brownfield',
      existingRepoSnapshot: {
        rootPath: '/project',
        filePaths: ['src/index.ts', 'src/app.ts', 'package.json'],
      },
    });

    const result = await node(state);

    expect(result.existingFiles).toBeDefined();
    expect(result.existingFiles!.size).toBe(3);
    expect(result.existingFiles!.has('src/index.ts')).toBe(true);
    expect(result.existingFiles!.has('src/app.ts')).toBe(true);
    expect(result.existingFiles!.has('package.json')).toBe(true);
  });

  it('returns null existingFiles when no repo snapshot', async () => {
    const node = createChangeClassifier(mockDeps);
    const result = await node(makeState({ mode: 'brownfield' }));

    expect(result.existingFiles).toBeNull();
  });
});
