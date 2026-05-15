/**
 * Tests for Architect Zod schemas.
 * Each schema must parse a representative fixture and reject invalid input.
 */

import {
  ConstraintSetSchema,
  OptionsBundleSchema,
  ArchitectureSpecSchema,
  TaskPlanSchema,
  ADRSchema,
  DataModelSpecSchema,
  ComponentCompositionSchema,
  DesignSystemDiffSchema,
  CriticGateSchema,
  CriticReportSchema,
  ContractBundleSchema,
  MigrationSpecSchema,
} from './architect.schemas.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CONSTRAINT_SET_FIXTURE = {
  projectId: 'cashpulse',
  constraints: [
    { id: 'c-1', type: 'hard' as const, category: 'accessibility', description: 'WCAG 2.1 AA', source: 'prd' },
    { id: 'c-2', type: 'soft' as const, category: 'ux', description: 'Card-based dashboard', source: 'design-tokens' },
  ],
  gaps: [
    { id: 'g-1', axis: 'styling-library', description: 'Which component library?', resolvedValue: 'shadcn', resolvedBy: 'architect-node-3' },
    { id: 'g-2', axis: 'data-store', description: 'Which database?', defaultValue: 'postgresql' },
  ],
  mode: 'greenfield' as const,
};

const OPTIONS_BUNDLE_FIXTURE = {
  projectId: 'cashpulse',
  memos: [
    {
      gapId: 'g-1',
      axis: 'styling-library',
      alternatives: [
        { id: 'alt-1', name: 'shadcn', description: 'Copy-paste Radix + Tailwind', tradeoffs: ['full ownership', 'manual updates'], blastRadius: 'low' as const, references: ['https://ui.shadcn.com'] },
        { id: 'alt-2', name: 'mui', description: 'Material Design enterprise', tradeoffs: ['heavy bundle', 'rich components'], blastRadius: 'medium' as const, references: ['https://mui.com'] },
      ],
      recommendation: 'alt-1',
      rationale: 'Full code ownership fits CHIP philosophy',
    },
  ],
};

const ARCHITECTURE_SPEC_FIXTURE = {
  projectId: 'cashpulse',
  decisions: [
    { gapId: 'g-1', chosenAlternativeId: 'alt-1', rationale: 'Copy-paste ownership', adrId: 'adr-054' },
    { gapId: 'g-2', chosenAlternativeId: 'alt-pg', rationale: 'Relational data model' },
  ],
  stackConfig: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
  assumptionLedgerUpdates: [
    {
      id: 'a-arch-1',
      statement: 'Using shadcn/ui for component library',
      evidence: 'Architect Node 3 decision',
      confidence: 1.0,
      blastRadius: 'low' as const,
      requiresConfirmation: false,
    },
  ],
  migrations: [
    { id: 'mig-001', sql: 'CREATE TABLE expenses (id SERIAL PRIMARY KEY, amount DECIMAL)' },
  ],
};

const TASK_PLAN_FIXTURE = {
  projectId: 'cashpulse',
  tasks: [
    { id: 'T1', title: 'Scaffold', description: 'Create project structure', filePaths: ['package.json'], dependencies: [], writeOrder: 0, type: 'scaffold' as const, mode: 'NEW' as const, estimatedTokenBudget: 12_000, contextRefs: [], patternRefs: [], acceptanceCriteriaIds: [] },
    { id: 'T2', title: 'DB migration', description: 'Create tables', filePaths: ['migrations/001.sql'], dependencies: ['T1'], writeOrder: 1, type: 'backend' as const, mode: 'NEW' as const, estimatedTokenBudget: 12_000, contextRefs: [], patternRefs: [], acceptanceCriteriaIds: [] },
    { id: 'T3', title: 'Expense API', description: 'CRUD endpoints', filePaths: ['api/expenses/route.ts'], dependencies: ['T2'], writeOrder: 2, type: 'backend' as const, mode: 'NEW' as const, estimatedTokenBudget: 12_000, contextRefs: [], patternRefs: [], acceptanceCriteriaIds: [] },
  ],
  featureCoverage: {
    'f-expense-crud': ['T2', 'T3'],
    'f-scaffold': ['T1'],
  },
};

const ADR_FIXTURE = {
  id: 'adr-054',
  title: 'Styling Library as Architect Axis',
  status: 'accepted' as const,
  decision: 'Styling library is Architect Node 2 axis',
  rationale: 'Component catalog shape depends on library choice',
  alternatives: ['Pre-pipeline config', 'Clarifier concern'],
};

const DATA_MODEL_SPEC_FIXTURE = {
  projectId: 'cashpulse',
  entities: [
    {
      id: 'e-expense',
      name: 'Expense',
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'amount', type: 'number', required: true, description: 'Amount in cents' },
        { name: 'category', type: 'string', required: false },
      ],
      tableName: 'expenses',
      relationships: ['e-category'],
    },
  ],
};

const COMPONENT_COMPOSITION_FIXTURE = {
  screenId: 'dashboard',
  componentTree: [
    { id: 'root', type: 'frame', children: ['header', 'content'] },
    { id: 'header', type: 'NavigationBar', catalogId: 'navigation-bar' },
    { id: 'content', type: 'frame', children: ['card-1'], props: { layout: 'vertical' } },
    { id: 'card-1', type: 'Card', catalogId: 'card' },
  ],
};

const DESIGN_SYSTEM_DIFF_FIXTURE = {
  addedTokens: ['color-dark-surface', 'color-dark-text'],
  modifiedTokens: ['color-primary-500'],
  removedTokens: [],
  themeStrategy: 'css-custom-properties',
};

const CRITIC_REPORT_FIXTURE = {
  gates: [
    { name: 'schema-validation', passed: true, findings: [] },
    { name: 'dag-acyclic', passed: true, findings: [] },
    { name: 'single-writer', passed: true, findings: [] },
    { name: 'prd-criterion-coverage', passed: true, findings: [] },
    { name: 'entity-reference-integrity', passed: true, findings: [] },
    { name: 'gap-resolution-completeness', passed: true, findings: [] },
    { name: 'openapi-lint', passed: true, findings: [] },
    { name: 'migration-sql-parses', passed: true, findings: [] },
    { name: 'adr-completeness', passed: true, findings: [] },
    { name: 'patternRef-resolution', passed: true, findings: [] },
    { name: 'contextRef-resolution', passed: true, findings: [] },
    { name: 'acceptanceCriteria-coverage', passed: true, findings: [] },
    { name: 'tokenBudget-feasibility', passed: true, findings: [] },
    { name: 'mode-consistency', passed: true, findings: [] },
  ],
  passed: true,
  summary: 'All 14 gates passed',
};

const ASSUMPTION_LEDGER_FIXTURE = {
  id: 'al-001',
  entries: [
    {
      id: 'a-001',
      statement: 'Users authenticate via email/password',
      evidence: 'No auth specified',
      confidence: 0.7,
      blastRadius: 'medium' as const,
      requiresConfirmation: true,
    },
  ],
  createdAt: '2026-05-14T09:00:00Z',
  lastUpdatedAt: '2026-05-14T10:00:00Z',
};

const SCREEN_PLAN_FIXTURE = {
  id: 'sp-dashboard',
  featureId: 'f-expense-crud',
  screenType: 'page' as const,
  route: '/dashboard',
  components: ['ExpenseList', 'BudgetSummary'],
  dataBindings: [{ entityId: 'e-expense', field: 'amount', source: 'expenses.amount' }],
  navigationTargets: [{ target: 'expense-entry', trigger: 'add-button-click' }],
};

const API_CHANGE_SET_FIXTURE = {
  id: 'acs-001',
  changeRequestId: 'cr-001',
  additions: [{ method: 'POST', path: '/api/expenses', description: 'Create expense', breaking: false }],
  modifications: [],
  removals: [],
};

const CONTRACT_BUNDLE_FIXTURE = {
  projectId: 'cashpulse',
  constraintSet: CONSTRAINT_SET_FIXTURE,
  optionsBundle: OPTIONS_BUNDLE_FIXTURE,
  architectureSpec: ARCHITECTURE_SPEC_FIXTURE,
  adrs: [ADR_FIXTURE],
  apiChangeSets: [API_CHANGE_SET_FIXTURE],
  screenPlans: [SCREEN_PLAN_FIXTURE],
  taskPlan: TASK_PLAN_FIXTURE,
  assumptionLedger: ASSUMPTION_LEDGER_FIXTURE,
  criticReport: CRITIC_REPORT_FIXTURE,
  version: '1.0.0',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Architect Schemas', () => {
  describe('ConstraintSetSchema', () => {
    it('should parse a valid constraint set', () => {
      const result = ConstraintSetSchema.safeParse(CONSTRAINT_SET_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should reject missing projectId', () => {
      const { projectId: _, ...noProjectId } = CONSTRAINT_SET_FIXTURE;
      const result = ConstraintSetSchema.safeParse(noProjectId);
      expect(result.success).toBe(false);
    });

    it('should reject invalid constraint type', () => {
      const bad = {
        ...CONSTRAINT_SET_FIXTURE,
        constraints: [{ id: 'c-1', type: 'unknown', category: 'a', description: 'b', source: 'c' }],
      };
      const result = ConstraintSetSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('should reject invalid mode', () => {
      const bad = { ...CONSTRAINT_SET_FIXTURE, mode: 'hybrid' };
      const result = ConstraintSetSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('OptionsBundleSchema', () => {
    it('should parse a valid options bundle', () => {
      const result = OptionsBundleSchema.safeParse(OPTIONS_BUNDLE_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should reject missing memos array', () => {
      const { memos: _, ...noMemos } = OPTIONS_BUNDLE_FIXTURE;
      const result = OptionsBundleSchema.safeParse(noMemos);
      expect(result.success).toBe(false);
    });

    it('should reject invalid blast radius on alternative', () => {
      const bad = {
        ...OPTIONS_BUNDLE_FIXTURE,
        memos: [{
          ...OPTIONS_BUNDLE_FIXTURE.memos[0],
          alternatives: [{ id: 'a', name: 'b', description: 'c', tradeoffs: [], blastRadius: 'extreme', references: [] }],
        }],
      };
      const result = OptionsBundleSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('ArchitectureSpecSchema', () => {
    it('should parse a valid architecture spec', () => {
      const result = ArchitectureSpecSchema.safeParse(ARCHITECTURE_SPEC_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should parse without optional migrations', () => {
      const { migrations: _, ...noMigrations } = ARCHITECTURE_SPEC_FIXTURE;
      const result = ArchitectureSpecSchema.safeParse(noMigrations);
      expect(result.success).toBe(true);
    });

    it('should reject confidence out of range', () => {
      const bad = {
        ...ARCHITECTURE_SPEC_FIXTURE,
        assumptionLedgerUpdates: [{
          id: 'a-1', statement: 's', evidence: 'e', confidence: 1.5,
          blastRadius: 'low', requiresConfirmation: false,
        }],
      };
      const result = ArchitectureSpecSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('MigrationSpecSchema', () => {
    it('should parse a valid migration', () => {
      const result = MigrationSpecSchema.safeParse({ id: 'mig-001', sql: 'CREATE TABLE t (id INT)' });
      expect(result.success).toBe(true);
    });

    it('should reject missing sql', () => {
      const result = MigrationSpecSchema.safeParse({ id: 'mig-001' });
      expect(result.success).toBe(false);
    });
  });

  describe('TaskPlanSchema', () => {
    it('should parse a valid task plan', () => {
      const result = TaskPlanSchema.safeParse(TASK_PLAN_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should reject invalid task type', () => {
      const bad = {
        ...TASK_PLAN_FIXTURE,
        tasks: [{ ...TASK_PLAN_FIXTURE.tasks[0], type: 'deploy' }],
      };
      const result = TaskPlanSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('should reject negative writeOrder', () => {
      const bad = {
        ...TASK_PLAN_FIXTURE,
        tasks: [{ ...TASK_PLAN_FIXTURE.tasks[0], writeOrder: -1 }],
      };
      const result = TaskPlanSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('ADRSchema', () => {
    it('should parse a valid ADR', () => {
      const result = ADRSchema.safeParse(ADR_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should parse without optional alternatives', () => {
      const { alternatives: _, ...noAlts } = ADR_FIXTURE;
      const result = ADRSchema.safeParse(noAlts);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const bad = { ...ADR_FIXTURE, status: 'rejected' };
      const result = ADRSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('DataModelSpecSchema', () => {
    it('should parse a valid data model spec', () => {
      const result = DataModelSpecSchema.safeParse(DATA_MODEL_SPEC_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should reject entity without fields', () => {
      const bad = {
        projectId: 'x',
        entities: [{ id: 'e-1', name: 'X' }],
      };
      const result = DataModelSpecSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });
  });

  describe('ComponentCompositionSchema', () => {
    it('should parse a valid component composition', () => {
      const result = ComponentCompositionSchema.safeParse(COMPONENT_COMPOSITION_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should reject missing screenId', () => {
      const { screenId: _, ...noScreenId } = COMPONENT_COMPOSITION_FIXTURE;
      const result = ComponentCompositionSchema.safeParse(noScreenId);
      expect(result.success).toBe(false);
    });
  });

  describe('DesignSystemDiffSchema', () => {
    it('should parse a valid design system diff', () => {
      const result = DesignSystemDiffSchema.safeParse(DESIGN_SYSTEM_DIFF_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should parse without optional themeStrategy', () => {
      const { themeStrategy: _, ...noStrategy } = DESIGN_SYSTEM_DIFF_FIXTURE;
      const result = DesignSystemDiffSchema.safeParse(noStrategy);
      expect(result.success).toBe(true);
    });
  });

  describe('CriticGateSchema', () => {
    it('should parse a valid gate', () => {
      const result = CriticGateSchema.safeParse({ name: 'dag-acyclic', passed: true, findings: [] });
      expect(result.success).toBe(true);
    });

    it('should parse a failed gate with findings', () => {
      const result = CriticGateSchema.safeParse({
        name: 'single-writer',
        passed: false,
        findings: ['T1 and T2 both write package.json'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.passed).toBe(false);
        expect(result.data.findings).toHaveLength(1);
      }
    });
  });

  describe('CriticReportSchema', () => {
    it('should parse a valid critic report', () => {
      const result = CriticReportSchema.safeParse(CRITIC_REPORT_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should reject missing summary', () => {
      const { summary: _, ...noSummary } = CRITIC_REPORT_FIXTURE;
      const result = CriticReportSchema.safeParse(noSummary);
      expect(result.success).toBe(false);
    });
  });

  describe('ContractBundleSchema', () => {
    it('should parse a full valid contract bundle', () => {
      const result = ContractBundleSchema.safeParse(CONTRACT_BUNDLE_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('should parse with optional scope-conditional fields', () => {
      const withOptionals = {
        ...CONTRACT_BUNDLE_FIXTURE,
        dataModel: DATA_MODEL_SPEC_FIXTURE,
        componentComposition: COMPONENT_COMPOSITION_FIXTURE,
        designSystemDiff: DESIGN_SYSTEM_DIFF_FIXTURE,
      };
      const result = ContractBundleSchema.safeParse(withOptionals);
      expect(result.success).toBe(true);
    });

    it('should parse without optional criticReport', () => {
      const { criticReport: _, ...noCritic } = CONTRACT_BUNDLE_FIXTURE;
      const result = ContractBundleSchema.safeParse(noCritic);
      expect(result.success).toBe(true);
    });

    it('should reject missing required assumptionLedger', () => {
      const { assumptionLedger: _, ...noLedger } = CONTRACT_BUNDLE_FIXTURE;
      const result = ContractBundleSchema.safeParse(noLedger);
      expect(result.success).toBe(false);
    });

    it('should reject missing required adrs', () => {
      const { adrs: _, ...noAdrs } = CONTRACT_BUNDLE_FIXTURE;
      const result = ContractBundleSchema.safeParse(noAdrs);
      expect(result.success).toBe(false);
    });

    it('should reject missing required version', () => {
      const { version: _, ...noVersion } = CONTRACT_BUNDLE_FIXTURE;
      const result = ContractBundleSchema.safeParse(noVersion);
      expect(result.success).toBe(false);
    });

    it('should reject missing required constraintSet', () => {
      const { constraintSet: _, ...noConstraintSet } = CONTRACT_BUNDLE_FIXTURE;
      const result = ContractBundleSchema.safeParse(noConstraintSet);
      expect(result.success).toBe(false);
    });

    it('should reject missing required taskPlan', () => {
      const { taskPlan: _, ...noTaskPlan } = CONTRACT_BUNDLE_FIXTURE;
      const result = ContractBundleSchema.safeParse(noTaskPlan);
      expect(result.success).toBe(false);
    });
  });
});
