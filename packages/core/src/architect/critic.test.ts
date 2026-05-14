import { validateContractBundle } from './critic.js';
import type { ContractBundle } from '../types/architect.schemas.js';
import type { EnrichedRequirement } from '../types/cross-boundary-artifacts.js';

function makeEnrichedReq(overrides?: Partial<EnrichedRequirement>): EnrichedRequirement {
  return {
    id: 'er-1',
    rawInput: 'Build a personal finance tracker',
    mode: 'bootstrap',
    prd: {
      id: 'prd-1',
      title: 'FinanceTracker',
      description: 'A personal finance tracker app',
      features: [
        { id: 'feat-1', name: 'Dashboard', description: 'Main dashboard', priority: 'must-have' },
        { id: 'feat-2', name: 'Transactions', description: 'Transaction list', priority: 'must-have' },
        { id: 'feat-3', name: 'Reports', description: 'Financial reports', priority: 'should-have' },
      ],
      personas: [{ id: 'p-1', name: 'User', role: 'End user', goals: ['Track expenses'] }],
      dataEntities: [
        { id: 'entity-1', name: 'Transaction', fields: [{ name: 'amount', type: 'number' }] },
        { id: 'entity-2', name: 'Account', fields: [{ name: 'balance', type: 'number' }] },
      ],
      screens: [{ id: 'screen-1', name: 'Dashboard', description: 'Main view' }],
      nfrs: [],
      successMetrics: [],
      outOfScope: [],
      version: '1.0.0',
      status: 'draft',
    },
    assumptionLedger: {
      id: 'al-1',
      entries: [],
      createdAt: '2026-01-01T00:00:00Z',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    },
    clarificationRounds: [],
    confidence: 0.9,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeValidBundle(overrides?: Partial<ContractBundle>): ContractBundle {
  return {
    projectId: 'proj-1',
    constraintSet: {
      projectId: 'proj-1',
      constraints: [
        { id: 'c-1', type: 'hard', category: 'tech', description: 'Must use React', source: 'requirement' },
      ],
      gaps: [
        { id: 'gap-1', axis: 'styling', description: 'Which CSS framework?', resolvedValue: 'tailwind' },
      ],
      mode: 'greenfield',
    },
    optionsBundle: {
      projectId: 'proj-1',
      memos: [
        {
          gapId: 'gap-1',
          axis: 'styling',
          alternatives: [
            { id: 'alt-1', name: 'Tailwind', description: 'Utility-first CSS', tradeoffs: ['verbose'], blastRadius: 'low', references: [] },
            { id: 'alt-2', name: 'CSS Modules', description: 'Scoped CSS', tradeoffs: ['less reusable'], blastRadius: 'low', references: [] },
          ],
          recommendation: 'alt-1',
          rationale: 'Better DX',
        },
      ],
    },
    architectureSpec: {
      projectId: 'proj-1',
      decisions: [
        { gapId: 'gap-1', chosenAlternativeId: 'alt-1', rationale: 'Better DX' },
      ],
      stackConfig: { frontend: 'React', backend: 'Node.js', database: 'PostgreSQL', styling: 'Tailwind' },
      assumptionLedgerUpdates: [],
    },
    adrs: [{ id: 'adr-1', title: 'Use Tailwind', status: 'accepted', decision: 'Use Tailwind CSS', rationale: 'Best DX' }],
    apiChangeSets: [
      {
        id: 'acs-1',
        changeRequestId: 'cr-1',
        additions: [
          { method: 'GET', path: '/api/transactions', description: 'List transactions', breaking: false },
          { method: 'POST', path: '/api/transactions', description: 'Create transaction', breaking: false },
        ],
        modifications: [],
        removals: [],
      },
    ],
    screenPlans: [
      {
        id: 'sp-1',
        featureId: 'feat-1',
        screenType: 'page',
        route: '/dashboard',
        components: ['DashboardView'],
        dataBindings: [{ entityId: 'entity-1', field: 'amount', source: 'api' }],
        navigationTargets: [],
      },
    ],
    taskPlan: {
      projectId: 'proj-1',
      tasks: [
        { id: 't-1', title: 'Setup project', description: 'Scaffold', filePaths: ['package.json'], dependencies: [], writeOrder: 0, type: 'scaffold' },
        { id: 't-2', title: 'Dashboard page', description: 'Build dashboard', filePaths: ['src/pages/dashboard.tsx'], dependencies: ['t-1'], writeOrder: 1, type: 'frontend' },
        { id: 't-3', title: 'Transaction API', description: 'Build API', filePaths: ['src/api/transactions.ts'], dependencies: ['t-1'], writeOrder: 2, type: 'backend' },
      ],
      featureCoverage: {
        'feat-1': ['t-2'],
        'feat-2': ['t-3'],
      },
    },
    assumptionLedger: {
      id: 'al-1',
      entries: [],
      createdAt: '2026-01-01T00:00:00Z',
      lastUpdatedAt: '2026-01-01T00:00:00Z',
    },
    version: '1.0.0',
    ...overrides,
  };
}

describe('validateContractBundle', () => {
  const enrichedReq = makeEnrichedReq();

  it('passes all 9 gates with a valid bundle', () => {
    const bundle = makeValidBundle();
    const report = validateContractBundle(bundle, enrichedReq);

    expect(report.passed).toBe(true);
    expect(report.gates).toHaveLength(9);
    for (const gate of report.gates) {
      expect(gate.passed).toBe(true);
      expect(gate.findings).toHaveLength(0);
    }
  });

  describe('gate 1: schema-validation', () => {
    it('fails when a required field is missing', () => {
      const bundle = makeValidBundle();
      // Corrupt the bundle by removing projectId from constraintSet
      (bundle.constraintSet as Record<string, unknown>).projectId = undefined;
      delete (bundle.constraintSet as Record<string, unknown>).projectId;

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'schema-validation')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings.length).toBeGreaterThan(0);
    });
  });

  describe('gate 2: dag-acyclic', () => {
    it('fails with cyclic task dependencies', () => {
      const bundle = makeValidBundle({
        taskPlan: {
          projectId: 'proj-1',
          tasks: [
            { id: 't-1', title: 'A', description: 'A', filePaths: ['a.ts'], dependencies: ['t-3'], writeOrder: 0, type: 'scaffold' },
            { id: 't-2', title: 'B', description: 'B', filePaths: ['b.ts'], dependencies: ['t-1'], writeOrder: 1, type: 'backend' },
            { id: 't-3', title: 'C', description: 'C', filePaths: ['c.ts'], dependencies: ['t-2'], writeOrder: 2, type: 'frontend' },
          ],
          featureCoverage: { 'feat-1': ['t-1'], 'feat-2': ['t-2'] },
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'dag-acyclic')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings.some((f) => f.includes('Cycle'))).toBe(true);
    });
  });

  describe('gate 3: single-writer', () => {
    it('fails when two tasks share a filePath', () => {
      const bundle = makeValidBundle({
        taskPlan: {
          projectId: 'proj-1',
          tasks: [
            { id: 't-1', title: 'A', description: 'A', filePaths: ['shared.ts'], dependencies: [], writeOrder: 0, type: 'scaffold' },
            { id: 't-2', title: 'B', description: 'B', filePaths: ['shared.ts'], dependencies: [], writeOrder: 1, type: 'backend' },
          ],
          featureCoverage: { 'feat-1': ['t-1'], 'feat-2': ['t-2'] },
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'single-writer')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings[0]).toContain('shared.ts');
      expect(gate.findings[0]).toContain('t-1');
      expect(gate.findings[0]).toContain('t-2');
    });
  });

  describe('gate 4: prd-criterion-coverage', () => {
    it('fails when a must-have feature has no tasks', () => {
      const bundle = makeValidBundle({
        taskPlan: {
          projectId: 'proj-1',
          tasks: [
            { id: 't-1', title: 'A', description: 'A', filePaths: ['a.ts'], dependencies: [], writeOrder: 0, type: 'scaffold' },
          ],
          featureCoverage: { 'feat-1': ['t-1'] },
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'prd-criterion-coverage')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings.some((f) => f.includes('feat-2'))).toBe(true);
    });

    it('treats features without explicit priority as must-have', () => {
      const reqWithOptionalPriority = makeEnrichedReq({
        prd: {
          ...makeEnrichedReq().prd,
          features: [
            { id: 'feat-1', name: 'Dashboard', description: 'Main dashboard' },
            { id: 'feat-2', name: 'Transactions', description: 'Transaction list' },
          ],
        },
      });

      const bundle = makeValidBundle({
        taskPlan: {
          projectId: 'proj-1',
          tasks: [
            { id: 't-1', title: 'A', description: 'A', filePaths: ['a.ts'], dependencies: [], writeOrder: 0, type: 'scaffold' },
          ],
          featureCoverage: { 'feat-1': ['t-1'] },
        },
      });

      const report = validateContractBundle(bundle, reqWithOptionalPriority);
      const gate = report.gates.find((g) => g.name === 'prd-criterion-coverage')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings.some((f) => f.includes('feat-2'))).toBe(true);
    });

    it('does not require coverage for should-have features', () => {
      const reqOnlyShould = makeEnrichedReq({
        prd: {
          ...makeEnrichedReq().prd,
          features: [
            { id: 'feat-1', name: 'Dashboard', description: 'Main', priority: 'must-have' },
            { id: 'feat-3', name: 'Reports', description: 'Reports', priority: 'should-have' },
          ],
        },
      });

      const bundle = makeValidBundle({
        taskPlan: {
          projectId: 'proj-1',
          tasks: [
            { id: 't-1', title: 'A', description: 'A', filePaths: ['a.ts'], dependencies: [], writeOrder: 0, type: 'scaffold' },
          ],
          featureCoverage: { 'feat-1': ['t-1'] },
        },
      });

      const report = validateContractBundle(bundle, reqOnlyShould);
      const gate = report.gates.find((g) => g.name === 'prd-criterion-coverage')!;
      expect(gate.passed).toBe(true);
    });
  });

  describe('gate 5: entity-reference-integrity', () => {
    it('fails when dataBindings reference unknown entityId', () => {
      const bundle = makeValidBundle({
        screenPlans: [
          {
            id: 'sp-1',
            featureId: 'feat-1',
            screenType: 'page',
            route: '/dashboard',
            components: ['DashboardView'],
            dataBindings: [{ entityId: 'nonexistent-entity', field: 'amount', source: 'api' }],
            navigationTargets: [],
          },
        ],
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'entity-reference-integrity')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings[0]).toContain('nonexistent-entity');
    });
  });

  describe('gate 6: gap-resolution-completeness', () => {
    it('fails when a gap has no resolvedValue and no recommendation', () => {
      const bundle = makeValidBundle({
        constraintSet: {
          projectId: 'proj-1',
          constraints: [],
          gaps: [
            { id: 'gap-unresolved', axis: 'auth', description: 'Which auth provider?' },
          ],
          mode: 'greenfield',
        },
        optionsBundle: {
          projectId: 'proj-1',
          memos: [],
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'gap-resolution-completeness')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings[0]).toContain('gap-unresolved');
    });

    it('passes when gap has recommendation but no resolvedValue', () => {
      const bundle = makeValidBundle({
        constraintSet: {
          projectId: 'proj-1',
          constraints: [],
          gaps: [
            { id: 'gap-1', axis: 'auth', description: 'Which auth provider?' },
          ],
          mode: 'greenfield',
        },
        optionsBundle: {
          projectId: 'proj-1',
          memos: [
            {
              gapId: 'gap-1',
              axis: 'auth',
              alternatives: [
                { id: 'alt-a', name: 'Auth0', description: 'Auth0', tradeoffs: [], blastRadius: 'low', references: [] },
              ],
              recommendation: 'alt-a',
              rationale: 'Easy setup',
            },
          ],
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'gap-resolution-completeness')!;
      expect(gate.passed).toBe(true);
    });
  });

  describe('gate 7: openapi-lint', () => {
    it('fails with invalid HTTP method', () => {
      const bundle = makeValidBundle({
        apiChangeSets: [
          {
            id: 'acs-1',
            changeRequestId: 'cr-1',
            additions: [{ method: 'FETCH', path: '/api/items', description: 'Invalid', breaking: false }],
            modifications: [],
            removals: [],
          },
        ],
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'openapi-lint')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings[0]).toContain('FETCH');
    });

    it('fails with duplicate (method, path) tuple', () => {
      const bundle = makeValidBundle({
        apiChangeSets: [
          {
            id: 'acs-1',
            changeRequestId: 'cr-1',
            additions: [{ method: 'POST', path: '/api/expenses', description: 'Create', breaking: false }],
            modifications: [{ method: 'POST', path: '/api/expenses', description: 'Update', breaking: false }],
            removals: [],
          },
        ],
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'openapi-lint')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings.some((f) => f.includes('Duplicate'))).toBe(true);
    });

    it('fails with invalid path', () => {
      const bundle = makeValidBundle({
        apiChangeSets: [
          {
            id: 'acs-1',
            changeRequestId: 'cr-1',
            additions: [{ method: 'GET', path: 'api/no-leading-slash', description: 'Bad path', breaking: false }],
            modifications: [],
            removals: [],
          },
        ],
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'openapi-lint')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings[0]).toContain('Invalid path');
    });
  });

  describe('gate 8: migration-sql-parses', () => {
    it('passes when no migrations exist', () => {
      const bundle = makeValidBundle();
      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'migration-sql-parses')!;
      expect(gate.passed).toBe(true);
    });

    it('fails with empty SQL', () => {
      const bundle = makeValidBundle({
        architectureSpec: {
          ...makeValidBundle().architectureSpec,
          migrations: [{ id: 'mig-1', sql: '' }],
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'migration-sql-parses')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings[0]).toContain('empty SQL');
    });

    it('fails when SQL has no recognizable verb', () => {
      const bundle = makeValidBundle({
        architectureSpec: {
          ...makeValidBundle().architectureSpec,
          migrations: [{ id: 'mig-1', sql: 'TRUNCATE TABLE users;' }],
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'migration-sql-parses')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings[0]).toContain('no recognizable SQL verb');
    });

    it('passes with valid SQL containing a recognized verb', () => {
      const bundle = makeValidBundle({
        architectureSpec: {
          ...makeValidBundle().architectureSpec,
          migrations: [{ id: 'mig-1', sql: 'CREATE TABLE transactions (id SERIAL PRIMARY KEY);' }],
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'migration-sql-parses')!;
      expect(gate.passed).toBe(true);
    });
  });

  describe('gate 9: adr-completeness', () => {
    it('fails when high blast-radius decision has no adrId', () => {
      const bundle = makeValidBundle({
        optionsBundle: {
          projectId: 'proj-1',
          memos: [
            {
              gapId: 'gap-1',
              axis: 'database',
              alternatives: [
                { id: 'alt-high', name: 'NoSQL', description: 'NoSQL DB', tradeoffs: ['migration'], blastRadius: 'high', references: [] },
              ],
              recommendation: 'alt-high',
              rationale: 'Scale',
            },
          ],
        },
        architectureSpec: {
          ...makeValidBundle().architectureSpec,
          decisions: [
            { gapId: 'gap-1', chosenAlternativeId: 'alt-high', rationale: 'Scale' },
          ],
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'adr-completeness')!;
      expect(gate.passed).toBe(false);
      expect(gate.findings[0]).toContain('alt-high');
      expect(gate.findings[0]).toContain('high');
    });

    it('fails when critical blast-radius decision has empty adrId', () => {
      const bundle = makeValidBundle({
        optionsBundle: {
          projectId: 'proj-1',
          memos: [
            {
              gapId: 'gap-1',
              axis: 'infra',
              alternatives: [
                { id: 'alt-crit', name: 'K8s', description: 'Kubernetes', tradeoffs: ['complexity'], blastRadius: 'critical', references: [] },
              ],
              recommendation: 'alt-crit',
              rationale: 'Scale',
            },
          ],
        },
        architectureSpec: {
          ...makeValidBundle().architectureSpec,
          decisions: [
            { gapId: 'gap-1', chosenAlternativeId: 'alt-crit', rationale: 'Scale', adrId: '  ' },
          ],
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'adr-completeness')!;
      expect(gate.passed).toBe(false);
    });

    it('passes when high blast-radius decision has adrId', () => {
      const bundle = makeValidBundle({
        optionsBundle: {
          projectId: 'proj-1',
          memos: [
            {
              gapId: 'gap-1',
              axis: 'database',
              alternatives: [
                { id: 'alt-high', name: 'NoSQL', description: 'NoSQL DB', tradeoffs: ['migration'], blastRadius: 'high', references: [] },
              ],
              recommendation: 'alt-high',
              rationale: 'Scale',
            },
          ],
        },
        architectureSpec: {
          ...makeValidBundle().architectureSpec,
          decisions: [
            { gapId: 'gap-1', chosenAlternativeId: 'alt-high', rationale: 'Scale', adrId: 'ADR-055' },
          ],
        },
      });

      const report = validateContractBundle(bundle, enrichedReq);
      const gate = report.gates.find((g) => g.name === 'adr-completeness')!;
      expect(gate.passed).toBe(true);
    });
  });

  it('reports multiple failed gates in summary', () => {
    const bundle = makeValidBundle({
      taskPlan: {
        projectId: 'proj-1',
        tasks: [
          { id: 't-1', title: 'A', description: 'A', filePaths: ['shared.ts'], dependencies: ['t-2'], writeOrder: 0, type: 'scaffold' },
          { id: 't-2', title: 'B', description: 'B', filePaths: ['shared.ts'], dependencies: ['t-1'], writeOrder: 1, type: 'backend' },
        ],
        featureCoverage: { 'feat-1': ['t-1'] },
      },
    });

    const report = validateContractBundle(bundle, enrichedReq);
    expect(report.passed).toBe(false);
    expect(report.summary).toContain('dag-acyclic');
    expect(report.summary).toContain('single-writer');
    expect(report.summary).toContain('prd-criterion-coverage');
  });
});
