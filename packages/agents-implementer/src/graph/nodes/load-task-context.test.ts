/**
 * Tests for loadTaskContext node — verifies it delegates to
 * buildImplementerPrompt and returns prompt + metadata.
 */

import type { TaskNode, ContractBundle } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { createLoadTaskContext } from './load-task-context.js';
import type { ImplementerDeps } from '../../deps.js';
import type { ImplementerStateType } from '../state.js';

const SAMPLE_DESIGN_SPEC: DesignSpecV2 = {
  screen: 'dashboard',
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'container' },
    header: { parent: 'root', order: 0, type: 'text', content: 'Dashboard' },
  },
};

const SAMPLE_BUNDLE: Partial<ContractBundle> = {
  architectureSpec: {
    projectId: 'test',
    decisions: [],
    stackConfig: { frontend: 'React', backend: 'Node.js', database: 'PostgreSQL', styling: 'Tailwind' },
    assumptionLedgerUpdates: [],
    implementationPatterns: [{ id: 'p1', category: 'coding', title: 'ESM', rule: 'Use ESM imports' }],
  },
  dataModel: {
    projectId: 'test',
    entities: [{ id: 'e1', name: 'Expense', fields: [{ name: 'amount', type: 'number', required: true }] }],
  },
};

function makeTask(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: 'T1',
    title: 'Build dashboard',
    description: 'Create the dashboard page',
    filePaths: ['src/pages/dashboard.tsx'],
    dependencies: [],
    writeOrder: 0,
    type: 'frontend',
    mode: 'NEW',
    estimatedTokenBudget: 10000,
    contextRefs: [],
    patternRefs: [],
    acceptanceCriteriaIds: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<ImplementerStateType> = {}): ImplementerStateType {
  return {
    task: makeTask(),
    contractBundle: SAMPLE_BUNDLE,
    existingDesignSpecs: null,
    projectRoot: '/test/project',
    implementerPrompt: '',
    metadata: null,
    designResult: null,
    artifacts: [],
    completionReport: null,
    errors: [],
    ...overrides,
  };
}

const mockDeps: ImplementerDeps = {
  provider: {} as ImplementerDeps['provider'],
  projectRoot: '/test/project',
  projectId: 'test-project',
};

describe('loadTaskContext', () => {
  const node = createLoadTaskContext(mockDeps);

  it('builds prompt and metadata for NEW task', async () => {
    const state = makeState({ task: makeTask({ mode: 'NEW' }) });
    const result = await node(state);

    expect(result.implementerPrompt).toBeDefined();
    expect(result.implementerPrompt!.length).toBeGreaterThan(0);
    expect(result.metadata).toEqual({
      taskId: 'T1',
      taskType: 'NEW',
      sliceStrategy: 'none',
      designSpecIncluded: false,
    });
  });

  it('builds prompt and metadata for MODIFY task with design specs', async () => {
    const state = makeState({
      task: makeTask({ mode: 'MODIFY' }),
      existingDesignSpecs: { dashboard: SAMPLE_DESIGN_SPEC },
    });
    const result = await node(state);

    expect(result.implementerPrompt).toBeDefined();
    expect(result.metadata).toEqual({
      taskId: 'T1',
      taskType: 'MODIFY',
      sliceStrategy: 'structure-only',
      designSpecIncluded: true,
    });
  });

  it('includes architecture context in prompt', async () => {
    const state = makeState();
    const result = await node(state);

    expect(result.implementerPrompt).toContain('React');
    expect(result.implementerPrompt).toContain('Expense');
    expect(result.implementerPrompt).toContain('ESM');
  });

  it('returns error when no task provided', async () => {
    const state = makeState({ task: null });
    const result = await node(state);

    expect(result.errors).toContain('loadTaskContext: no task provided');
  });
});
