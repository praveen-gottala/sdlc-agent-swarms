/**
 * Tests for cross-boundary artifact Zod schemas.
 * Each schema must parse a representative fixture and reject invalid input.
 */

import {
  AssumptionLedgerSchema,
  PRDSchema,
  EnrichedRequirementSchema,
  ChangeClassificationSchema,
  FeaturePlanSchema,
  ScreenPlanSchema,
  APIChangeSetSchema,
  DiffSchema,
  ReviewResultSchema,
} from './cross-boundary-artifacts.schemas.js';

const ASSUMPTION_LEDGER_FIXTURE = {
  id: 'al-001',
  entries: [
    {
      id: 'a-001',
      statement: 'Users will authenticate via email/password',
      evidence: 'No auth method specified in seed input',
      confidence: 0.7,
      blastRadius: 'medium' as const,
      requiresConfirmation: true,
    },
    {
      id: 'a-002',
      statement: 'PostgreSQL is the target database',
      evidence: 'Mentioned relational data in requirements',
      confidence: 0.9,
      blastRadius: 'high' as const,
      requiresConfirmation: false,
      resolvedBy: 'user',
      resolvedAt: '2026-04-28T10:00:00Z',
      resolution: 'Confirmed PostgreSQL',
    },
  ],
  createdAt: '2026-04-28T09:00:00Z',
  lastUpdatedAt: '2026-04-28T10:00:00Z',
};

const PRD_FIXTURE = {
  id: 'prd-001',
  title: 'Task Management App',
  description: 'A collaborative task management application',
  features: [
    { id: 'f-001', name: 'Task CRUD', description: 'Create, read, update, delete tasks', priority: 'must-have' as const },
    { id: 'f-002', name: 'Task assignment', description: 'Assign tasks to team members', priority: 'should-have' as const },
  ],
  personas: [
    { id: 'p-001', name: 'Project Manager', role: 'manager', goals: ['Track progress', 'Assign work'] },
  ],
  dataEntities: [
    { id: 'de-001', name: 'Task', fields: [{ name: 'title', type: 'string', required: true }], relationships: ['User'] },
  ],
  screens: [
    { id: 's-001', name: 'Dashboard', description: 'Main dashboard view', screenType: 'page' as const },
    { id: 's-002', name: 'Task Detail', description: 'Task detail modal', screenType: 'modal' as const },
  ],
  nfrs: [
    { id: 'nfr-001', category: 'Performance', description: 'Page load under 2s', target: '<2s', measurement: 'Lighthouse' },
  ],
  successMetrics: [
    { id: 'sm-001', name: 'Adoption', description: 'Daily active users', target: '100 DAU in 30 days', measurement: 'Analytics' },
  ],
  outOfScope: ['Mobile native app', 'Real-time collaboration'],
  version: '1.0.0',
  status: 'draft' as const,
};

const ENRICHED_REQUIREMENT_FIXTURE = {
  id: 'er-001',
  rawInput: 'Build a task management app for small teams',
  mode: 'bootstrap' as const,
  prd: PRD_FIXTURE,
  assumptionLedger: ASSUMPTION_LEDGER_FIXTURE,
  clarificationRounds: [
    { round: 1, questionsAsked: 5, questionsAnswered: 5, timestamp: '2026-04-28T09:30:00Z' },
  ],
  confidence: 0.85,
  createdAt: '2026-04-28T09:00:00Z',
};

const CHANGE_CLASSIFICATION_FIXTURE = {
  id: 'cc-001',
  changeRequestId: 'cr-001',
  scopeAxes: ['ui' as const, 'api' as const],
  blastRadius: 'medium' as const,
  affectedModules: ['packages/dashboard', 'packages/api'],
  confidence: 0.9,
};

const FEATURE_PLAN_FIXTURE = {
  id: 'fp-001',
  features: [
    {
      id: 'fn-001',
      name: 'User authentication',
      description: 'Email/password authentication flow',
      acceptanceCriteria: [
        {
          id: 'ac-001',
          condition: 'a user submits valid credentials',
          behavior: 'the system shall create a session and redirect to the dashboard',
          formatted: 'WHEN a user submits valid credentials THE SYSTEM SHALL create a session and redirect to the dashboard',
        },
      ],
      priority: 'must-have' as const,
      dependencies: [],
      status: 'planned' as const,
    },
    {
      id: 'fn-002',
      name: 'Task creation',
      description: 'Create new tasks with title and description',
      acceptanceCriteria: [
        {
          id: 'ac-002',
          condition: 'a user fills the task form and clicks submit',
          behavior: 'the system shall persist the task and show it in the task list',
          formatted: 'WHEN a user fills the task form and clicks submit THE SYSTEM SHALL persist the task and show it in the task list',
        },
      ],
      priority: 'must-have' as const,
      dependencies: ['fn-001'],
      status: 'planned' as const,
    },
  ],
};

const SCREEN_PLAN_FIXTURE = {
  id: 'sp-001',
  featureId: 'fn-002',
  screenType: 'page' as const,
  route: '/tasks',
  components: ['TaskList', 'TaskForm', 'FilterBar'],
  dataBindings: [
    { entityId: 'e-task', field: 'tasks', source: 'GET /api/tasks', transform: 'sortByDate' },
  ],
  navigationTargets: [
    { target: 'task-detail', trigger: 'click on task row' },
  ],
};

const API_CHANGESET_FIXTURE = {
  id: 'acs-001',
  changeRequestId: 'cr-001',
  additions: [
    { method: 'POST', path: '/api/tasks/{id}/assign', description: 'Assign task to user', breaking: false },
  ],
  modifications: [
    { method: 'GET', path: '/api/tasks', description: 'Add assignee filter param', breaking: false },
  ],
  removals: [],
};

const DIFF_FIXTURE = {
  id: 'd-001',
  taskId: 'task-001',
  worktreeBranch: 'feat/task-assignment',
  files: [
    {
      path: 'src/api/tasks.ts',
      operation: 'modify' as const,
      hunks: [
        { startLine: 42, endLine: 55, content: '+ async function assignTask(taskId, userId) { ... }' },
      ],
    },
    {
      path: 'src/api/tasks.test.ts',
      operation: 'add' as const,
      hunks: [
        { startLine: 1, endLine: 20, content: 'describe("assignTask", () => { ... })' },
      ],
    },
  ],
  testsPassed: true,
  typecheckPassed: true,
  lintPassed: true,
};

const REVIEW_RESULT_FIXTURE = {
  id: 'rr-001',
  diffId: 'd-001',
  findings: [
    {
      id: 'rf-001',
      category: 'suggestion' as const,
      description: 'Consider adding input validation for userId',
      file: 'src/api/tasks.ts',
      line: 45,
      evidence: 'userId parameter is passed directly to DB query without validation',
    },
  ],
  assumptionViolations: [],
  outcome: 'approved' as const,
  revisionCount: 0,
};

describe('Cross-boundary artifact schemas', () => {
  describe('AssumptionLedgerSchema', () => {
    it('parses a valid fixture', () => {
      const result = AssumptionLedgerSchema.safeParse(ASSUMPTION_LEDGER_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      const result = AssumptionLedgerSchema.safeParse({ id: 'al-001' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid blast radius', () => {
      const invalid = {
        ...ASSUMPTION_LEDGER_FIXTURE,
        entries: [{ ...ASSUMPTION_LEDGER_FIXTURE.entries[0], blastRadius: 'extreme' }],
      };
      const result = AssumptionLedgerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects confidence outside 0-1 range', () => {
      const invalid = {
        ...ASSUMPTION_LEDGER_FIXTURE,
        entries: [{ ...ASSUMPTION_LEDGER_FIXTURE.entries[0], confidence: 1.5 }],
      };
      const result = AssumptionLedgerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('PRDSchema', () => {
    it('parses a valid fixture', () => {
      const result = PRDSchema.safeParse(PRD_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = PRDSchema.safeParse({ ...PRD_FIXTURE, status: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid priority', () => {
      const invalid = {
        ...PRD_FIXTURE,
        features: [{ ...PRD_FIXTURE.features[0], priority: 'urgent' }],
      };
      const result = PRDSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('EnrichedRequirementSchema', () => {
    it('parses a valid fixture', () => {
      const result = EnrichedRequirementSchema.safeParse(ENRICHED_REQUIREMENT_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('rejects invalid mode', () => {
      const result = EnrichedRequirementSchema.safeParse({ ...ENRICHED_REQUIREMENT_FIXTURE, mode: 'unknown' });
      expect(result.success).toBe(false);
    });

    it('rejects round > 3', () => {
      const invalid = {
        ...ENRICHED_REQUIREMENT_FIXTURE,
        clarificationRounds: [{ round: 4, questionsAsked: 5, questionsAnswered: 5, timestamp: '2026-04-28T09:30:00Z' }],
      };
      const result = EnrichedRequirementSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('ChangeClassificationSchema', () => {
    it('parses a valid fixture', () => {
      const result = ChangeClassificationSchema.safeParse(CHANGE_CLASSIFICATION_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('rejects empty scope axes', () => {
      const result = ChangeClassificationSchema.safeParse({ ...CHANGE_CLASSIFICATION_FIXTURE, scopeAxes: [] });
      expect(result.success).toBe(false);
    });

    it('rejects invalid scope axis', () => {
      const result = ChangeClassificationSchema.safeParse({ ...CHANGE_CLASSIFICATION_FIXTURE, scopeAxes: ['frontend'] });
      expect(result.success).toBe(false);
    });
  });

  describe('FeaturePlanSchema', () => {
    it('parses a valid fixture', () => {
      const result = FeaturePlanSchema.safeParse(FEATURE_PLAN_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('parses EARS criteria correctly', () => {
      const result = FeaturePlanSchema.safeParse(FEATURE_PLAN_FIXTURE);
      expect(result.success).toBe(true);
      if (result.success) {
        const ac = result.data.features[0].acceptanceCriteria[0];
        expect(ac.formatted).toContain('WHEN');
        expect(ac.formatted).toContain('THE SYSTEM SHALL');
      }
    });
  });

  describe('ScreenPlanSchema', () => {
    it('parses a valid fixture', () => {
      const result = ScreenPlanSchema.safeParse(SCREEN_PLAN_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('rejects invalid screen type', () => {
      const result = ScreenPlanSchema.safeParse({ ...SCREEN_PLAN_FIXTURE, screenType: 'popup' });
      expect(result.success).toBe(false);
    });

    it('rejects dataBindings missing required entityId', () => {
      const badBinding = { ...SCREEN_PLAN_FIXTURE, dataBindings: [{ field: 'tasks', source: 'GET /api/tasks' }] };
      const result = ScreenPlanSchema.safeParse(badBinding);
      expect(result.success).toBe(false);
    });
  });

  describe('APIChangeSetSchema', () => {
    it('parses a valid fixture', () => {
      const result = APIChangeSetSchema.safeParse(API_CHANGESET_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('accepts empty arrays for additions/modifications/removals', () => {
      const minimal = { id: 'acs-002', changeRequestId: 'cr-002', additions: [], modifications: [], removals: [] };
      const result = APIChangeSetSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });
  });

  describe('DiffSchema', () => {
    it('parses a valid fixture', () => {
      const result = DiffSchema.safeParse(DIFF_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('rejects invalid file operation', () => {
      const invalid = {
        ...DIFF_FIXTURE,
        files: [{ ...DIFF_FIXTURE.files[0], operation: 'rename' }],
      };
      const result = DiffSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('ReviewResultSchema', () => {
    it('parses a valid fixture', () => {
      const result = ReviewResultSchema.safeParse(REVIEW_RESULT_FIXTURE);
      expect(result.success).toBe(true);
    });

    it('rejects invalid outcome', () => {
      const result = ReviewResultSchema.safeParse({ ...REVIEW_RESULT_FIXTURE, outcome: 'pending' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid finding category', () => {
      const invalid = {
        ...REVIEW_RESULT_FIXTURE,
        findings: [{ ...REVIEW_RESULT_FIXTURE.findings[0], category: 'warning' }],
      };
      const result = ReviewResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects negative revision count', () => {
      const result = ReviewResultSchema.safeParse({ ...REVIEW_RESULT_FIXTURE, revisionCount: -1 });
      expect(result.success).toBe(false);
    });
  });
});
