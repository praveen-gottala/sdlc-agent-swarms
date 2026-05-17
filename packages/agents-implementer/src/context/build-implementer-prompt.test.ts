/**
 * Wiring tests for build-implementer-prompt — ADR-057 routing verification.
 *
 * These tests verify that the Implementer context assembly correctly routes
 * design context based on task mode:
 *   - NEW → no DesignSpec in prompt, designSpecIncluded === false
 *   - MODIFY → structure-only slice present in prompt, sliceStrategy === 'structure-only'
 *
 * Per CLAUDE.md §Test Quality Gates rule 7: wiring tests inspect prompt
 * substrings for upstream data evidence, not just metadata flags.
 */

import type { ContractBundle, TaskNode } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { applyDesignSlice } from '@agentforge/agents-architect';
import { buildImplementerPrompt } from './build-implementer-prompt.js';

const SAMPLE_DESIGN_SPEC: DesignSpecV2 = {
  screen: 'dashboard',
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'container', catalog: 'PageFrame' },
    header: { parent: 'root', order: 0, type: 'container', catalog: 'TopNavigation', label: 'App Header' },
    card: { parent: 'root', order: 1, type: 'section', catalog: 'Card', content: 'Budget overview' },
  },
};

const SAMPLE_BUNDLE: Partial<ContractBundle> = {
  architectureSpec: {
    projectId: 'cashpulse',
    decisions: [],
    stackConfig: {
      frontend: 'react',
      backend: 'node',
      database: 'postgres',
      styling: 'tailwind',
    },
    assumptionLedgerUpdates: [],
    implementationPatterns: [
      {
        id: 'drizzle-only',
        category: 'data-access',
        title: 'Drizzle ORM',
        rule: 'Use Drizzle for all DB access',
      },
    ],
  },
  dataModel: {
    projectId: 'cashpulse',
    entities: [
      {
        id: 'entity-expense',
        name: 'Expense',
        fields: [
          { name: 'id', type: 'uuid', required: true },
          { name: 'amount', type: 'number', required: true },
        ],
      },
    ],
  },
  screenPlans: [
    {
      id: 'screen-dashboard',
      featureId: 'f-1',
      screenType: 'page',
      route: '/dashboard',
      components: ['BudgetSummaryCard'],
      dataBindings: [],
      navigationTargets: [],
    },
  ],
};

function makeTask(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: 'task-001',
    title: 'Build Dashboard Page',
    description: 'Create the dashboard page with budget summary.',
    filePaths: ['src/pages/dashboard.tsx', 'src/components/BudgetCard.tsx'],
    dependencies: [],
    writeOrder: 0,
    type: 'frontend',
    mode: 'NEW',
    estimatedTokenBudget: 5000,
    contextRefs: [],
    patternRefs: [],
    acceptanceCriteriaIds: [],
    ...overrides,
  };
}

describe('buildImplementerPrompt — ADR-057 wiring', () => {
  describe('NEW task (no design context)', () => {
    it('excludes design spec from prompt', () => {
      const task = makeTask({ mode: 'NEW' });
      const { prompt, metadata } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        existingDesignSpecs: { dashboard: SAMPLE_DESIGN_SPEC },
        projectRoot: '/tmp/test',
      });

      expect(prompt).not.toContain('Existing Design Context');
      expect(prompt).not.toContain('"nodes"');
      expect(prompt).not.toContain('TopNavigation');
      expect(metadata.designSpecIncluded).toBe(false);
      expect(metadata.sliceStrategy).toBe('none');
      expect(metadata.taskType).toBe('NEW');
    });

    it('includes architecture context in prompt', () => {
      const task = makeTask({ mode: 'NEW' });
      const { prompt } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        projectRoot: '/tmp/test',
      });

      expect(prompt).toContain('Architecture Context');
      expect(prompt).toContain('Drizzle ORM');
      expect(prompt).toContain('react');
      expect(prompt).toContain('Expense');
    });

    it('includes NEW-specific instructions', () => {
      const task = makeTask({ mode: 'NEW' });
      const { prompt } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        projectRoot: '/tmp/test',
      });

      expect(prompt).toContain('Create files from scratch');
      expect(prompt).not.toContain('Preserve existing behavior');
    });
  });

  describe('MODIFY task (structure-only design context)', () => {
    it('includes structure-only slice in prompt with structure keys, without content keys', () => {
      const sliced = applyDesignSlice(SAMPLE_DESIGN_SPEC, 'structure-only')!;
      const task = makeTask({
        mode: 'MODIFY',
        contextRefs: [{ kind: 'existingDesign', id: 'dashboard' }],
      });
      const { prompt, metadata } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        existingDesignSpecs: { dashboard: sliced },
        projectRoot: '/tmp/test',
      });

      expect(prompt).toContain('Existing Design Context');
      expect(prompt).toContain('dashboard');
      expect(metadata.designSpecIncluded).toBe(true);
      expect(metadata.sliceStrategy).toBe('structure-only');
      expect(metadata.taskType).toBe('MODIFY');

      // Structure keys retained by extractStructure
      expect(prompt).toContain('"parent"');
      expect(prompt).toContain('"order"');
      expect(prompt).toContain('"catalog"');

      // Content keys stripped by extractStructure
      expect(prompt).not.toContain('"label"');
      expect(prompt).not.toContain('"content"');
      expect(prompt).not.toContain('App Header');
      expect(prompt).not.toContain('Budget overview');
    });

    it('includes MODIFY-specific instructions', () => {
      const sliced = applyDesignSlice(SAMPLE_DESIGN_SPEC, 'structure-only')!;
      const task = makeTask({ mode: 'MODIFY' });
      const { prompt } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        existingDesignSpecs: { dashboard: sliced },
        projectRoot: '/tmp/test',
      });

      expect(prompt).toContain('Preserve existing behavior');
      expect(prompt).toContain('current structure');
      expect(prompt).not.toContain('Create files from scratch');
    });

    it('omits design when no specs provided for MODIFY', () => {
      const task = makeTask({ mode: 'MODIFY' });
      const { prompt, metadata } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        projectRoot: '/tmp/test',
      });

      expect(prompt).not.toContain('Existing Design Context');
      expect(metadata.designSpecIncluded).toBe(false);
      expect(metadata.sliceStrategy).toBe('structure-only');
    });
  });

  describe('prompt content verification', () => {
    it('includes task ID and file paths', () => {
      const task = makeTask();
      const { prompt } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        projectRoot: '/tmp/test',
      });

      expect(prompt).toContain('task-001');
      expect(prompt).toContain('src/pages/dashboard.tsx');
      expect(prompt).toContain('src/components/BudgetCard.tsx');
    });

    it('includes acceptance criteria when present', () => {
      const task = makeTask({
        acceptanceCriteriaIds: ['ac-1', 'ac-2'],
      });
      const { prompt } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        projectRoot: '/tmp/test',
      });

      expect(prompt).toContain('Acceptance criteria');
      expect(prompt).toContain('ac-1');
      expect(prompt).toContain('ac-2');
    });

    it('includes data model entities from sliced bundle', () => {
      const task = makeTask();
      const { prompt } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        projectRoot: '/tmp/test',
      });

      expect(prompt).toContain('Expense');
      expect(prompt).toContain('id, amount');
    });

    it('includes screen plan routes', () => {
      const task = makeTask();
      const { prompt } = buildImplementerPrompt({
        task,
        contractBundle: SAMPLE_BUNDLE,
        projectRoot: '/tmp/test',
      });

      expect(prompt).toContain('/dashboard');
      expect(prompt).toContain('screen-dashboard');
    });
  });
});

// qualityProxy ({ compiles, schemaValid }) is a Phase 5 concern — it requires
// running tsc on emitted code inside the generateCode graph node. Phase 1 covers
// only the pure-function metadata (taskType, sliceStrategy, designSpecIncluded).
// Phase 5 will add qualityProxy to ImplementerContextMetadata and test it via
// a mock telemetry sink using the LangfuseSink pattern.
describe('buildImplementerPrompt — instrumentation metadata', () => {
  it('captures taskType and sliceStrategy for NEW', () => {
    const task = makeTask({ mode: 'NEW' });
    const { metadata } = buildImplementerPrompt({
      task,
      contractBundle: SAMPLE_BUNDLE,
      projectRoot: '/tmp/test',
    });

    expect(metadata).toEqual({
      taskId: 'task-001',
      taskType: 'NEW',
      sliceStrategy: 'none',
      designSpecIncluded: false,
    });
  });

  it('captures taskType and sliceStrategy for MODIFY', () => {
    const task = makeTask({ id: 'task-002', mode: 'MODIFY' });
    const { metadata } = buildImplementerPrompt({
      task,
      contractBundle: SAMPLE_BUNDLE,
      existingDesignSpecs: { dashboard: SAMPLE_DESIGN_SPEC },
      projectRoot: '/tmp/test',
    });

    expect(metadata).toEqual({
      taskId: 'task-002',
      taskType: 'MODIFY',
      sliceStrategy: 'structure-only',
      designSpecIncluded: true,
    });
  });
});
