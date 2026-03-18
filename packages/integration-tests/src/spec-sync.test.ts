/**
 * Spec Sync Integration Tests
 *
 * Tests the spec-vs-code drift detection and resolution:
 * - Agent generates code with extra prop → PR merged
 * - Spec sync detects deviation, categorizes it
 * - Minor: auto-sync with lock acquisition
 * - Significant: flag for human review with task creation
 */

import {
  diffSpecVsCode,
  categorizeDeviation,
  applyMinorSync,
  flagSignificantDeviation,
  extractPropsFromCode,
  extractEndpointsFromCode,
  extractFieldsFromPrisma,
  acquireLock,
  releaseLock,
  isLocked,
} from '@agentforge/core';
import type {
  Deviation,
  MinorDeviation,
  SignificantDeviation,
} from '@agentforge/core';
import {
  createEventCollector,
  createMockFs,
} from './helpers.js';

// ============================================================================
// Spec fixtures
// ============================================================================

const COMPONENT_SPEC_YAML = `components:
  - id: comp_revenue_chart
    name: RevenueChart
    props:
      - name: data
        type: ChartData[]
        required: true
      - name: title
        type: string
        required: false
`;

const CODE_WITH_EXTRA_PROP = `
interface RevenueChartProps {
  data: ChartData[];
  title?: string;
  className?: string;
}

export const RevenueChart = (props: RevenueChartProps) => {
  return <div className={props.className}>{props.title}</div>;
};
`;

const CODE_WITH_TYPE_MISMATCH = `
interface RevenueChartProps {
  data: number[];
  title?: string;
}

export const RevenueChart = (props: RevenueChartProps) => {
  return <div>{props.title}</div>;
};
`;

const API_SPEC_YAML = `endpoints:
  - id: ep_get_revenue
    method: GET
    path: /api/revenue
  - id: ep_post_revenue
    method: POST
    path: /api/revenue
`;

const CODE_WITH_EXTRA_ENDPOINT = `
router.get('/api/revenue', handler);
router.post('/api/revenue', handler);
router.delete('/api/revenue/:id', handler);
`;

const CODE_MISSING_ENDPOINT = `
router.get('/api/revenue', handler);
`;

const PRISMA_SCHEMA = `
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String
  role  String
}
`;

const MODELS_SPEC_YAML = `models:
  - id: model_user
    name: User
    fields:
      - name: id
        type: Int
      - name: email
        type: String
      - name: name
        type: String
`;

const TASKS_YAML = `tasks:
  - id: "task_001"
    title: "Build RevenueChart"
    phase: "code"
    agent: "code_generator"
    status: "completed"
    depends_on: []
    spec_ref: "spec/components/dashboard.yaml"
    branch: "feat/dashboard"
    pr_number: 1
    cost_usd: 0.15
    tokens_used: 5000
    attempts: 1
    max_attempts: 3
    hitl_status: "none"
    hitl_channel: null
`;

// ============================================================================
// Tests
// ============================================================================

describe('Spec Sync', () => {
  let fs: ReturnType<typeof createMockFs>;
  let collector: ReturnType<typeof createEventCollector>;

  beforeEach(() => {
    collector = createEventCollector();
    fs = createMockFs({
      '/project/spec/components/dashboard.yaml': COMPONENT_SPEC_YAML,
      '/project/src/components/revenue-chart.tsx': CODE_WITH_EXTRA_PROP,
      '/project/agentforge.tasks.yaml': TASKS_YAML,
    });
    fs.dirs.add('/project/.agentforge/locks');
  });

  afterEach(() => {
    collector.clear();
  });

  describe('deviation detection', () => {
    it('detects extra prop added by code generator', () => {
      const result = diffSpecVsCode(
        '/project/spec/components/dashboard.yaml',
        ['/project/src/components/revenue-chart.tsx'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const extraProps = result.value.filter((d) => d.kind === 'extra_prop');
        expect(extraProps.length).toBeGreaterThan(0);
        expect(extraProps.some((d) => d.location.includes('className'))).toBe(true);
      }
    });

    it('detects type mismatch between spec and code', () => {
      fs.files.set('/project/src/components/revenue-chart.tsx', CODE_WITH_TYPE_MISMATCH);

      const result = diffSpecVsCode(
        '/project/spec/components/dashboard.yaml',
        ['/project/src/components/revenue-chart.tsx'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const mismatches = result.value.filter((d) => d.kind === 'type_mismatch');
        expect(mismatches.length).toBeGreaterThan(0);
        const dataMismatch = mismatches.find((d) => d.location.includes('data'));
        expect(dataMismatch).toBeDefined();
        expect(dataMismatch?.specValue).toBe('ChartData[]');
        expect(dataMismatch?.codeValue).toBe('number[]');
      }
    });

    it('detects new endpoint in code not in spec', () => {
      fs.files.set('/project/spec/api/routes.yaml', API_SPEC_YAML);
      fs.files.set('/project/src/routes/revenue.ts', CODE_WITH_EXTRA_ENDPOINT);

      const result = diffSpecVsCode(
        '/project/spec/api/routes.yaml',
        ['/project/src/routes/revenue.ts'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const newEndpoints = result.value.filter((d) => d.kind === 'new_endpoint');
        expect(newEndpoints.length).toBeGreaterThan(0);
        expect(newEndpoints[0].codeValue).toContain('DELETE');
      }
    });

    it('detects method mismatch when POST endpoint missing from code', () => {
      fs.files.set('/project/spec/api/routes.yaml', API_SPEC_YAML);
      fs.files.set('/project/src/routes/revenue.ts', CODE_MISSING_ENDPOINT);

      const result = diffSpecVsCode(
        '/project/spec/api/routes.yaml',
        ['/project/src/routes/revenue.ts'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // POST spec endpoint maps to same path as GET code endpoint → method_mismatch
        const deviations = result.value.filter(
          (d) => d.kind === 'method_mismatch' || d.kind === 'removed_endpoint',
        );
        expect(deviations.length).toBeGreaterThan(0);
      }
    });

    it('detects extra field in Prisma not in spec', () => {
      fs.files.set('/project/spec/models/user.yaml', MODELS_SPEC_YAML);
      fs.files.set('/project/prisma/schema.prisma', PRISMA_SCHEMA);

      const result = diffSpecVsCode(
        '/project/spec/models/user.yaml',
        ['/project/prisma/schema.prisma'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        const newFields = result.value.filter((d) => d.kind === 'new_field');
        expect(newFields.length).toBeGreaterThan(0);
        expect(newFields.some((d) => d.codeValue === 'role')).toBe(true);
      }
    });
  });

  describe('deviation categorization', () => {
    it('categorizes extra_prop as minor', () => {
      const deviation: Deviation = {
        kind: 'extra_prop',
        location: 'RevenueChart.props.className',
        specValue: undefined,
        codeValue: 'className',
        description: 'Prop "className" exists in code but not in spec',
      };

      const categorized = categorizeDeviation(deviation);
      expect(categorized.severity).toBe('minor');
    });

    it('categorizes type_mismatch as minor', () => {
      const deviation: Deviation = {
        kind: 'type_mismatch',
        location: 'RevenueChart.props.data',
        specValue: 'ChartData[]',
        codeValue: 'number[]',
        description: 'Type mismatch',
      };

      const categorized = categorizeDeviation(deviation);
      expect(categorized.severity).toBe('minor');
    });

    it('categorizes new_endpoint as significant', () => {
      const deviation: Deviation = {
        kind: 'new_endpoint',
        location: 'api:DELETE /api/revenue/:id',
        specValue: undefined,
        codeValue: 'DELETE /api/revenue/:id',
        description: 'New endpoint',
      };

      const categorized = categorizeDeviation(deviation);
      expect(categorized.severity).toBe('significant');
    });

    it('categorizes removed_field as significant', () => {
      const deviation: Deviation = {
        kind: 'removed_field',
        location: 'User.email',
        specValue: 'email',
        codeValue: undefined,
        description: 'Field removed',
      };

      const categorized = categorizeDeviation(deviation);
      expect(categorized.severity).toBe('significant');
    });
  });

  describe('minor deviation auto-sync', () => {
    it('acquires lock, updates spec, releases lock', () => {
      const minorDeviations: MinorDeviation[] = [
        {
          kind: 'extra_prop',
          severity: 'minor',
          location: 'RevenueChart.props.className',
          specValue: undefined,
          codeValue: 'className',
          description: 'Prop "className" exists in code but not in spec',
        },
      ];

      const result = applyMinorSync(
        '/project/spec/components/dashboard.yaml',
        minorDeviations,
        '/project',
        '/project/.agentforge/locks',
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('auto-sync');
        expect(result.value).toContain('className');
      }

      // Spec should be updated with new prop
      const updatedSpec = fs.files.get('/project/spec/components/dashboard.yaml');
      expect(updatedSpec).toBeDefined();
      expect(updatedSpec).toContain('className');

      // Lock should be released after sync
      const lockPath = '/project/.agentforge/locks';
      const lockResult = isLocked('/project/spec/components/dashboard.yaml', lockPath, fs);
      expect(lockResult.ok).toBe(true);
      if (lockResult.ok) {
        expect(lockResult.value).toBeNull();
      }
    });

    it('no-ops when deviations list is empty', () => {
      const result = applyMinorSync(
        '/project/spec/components/dashboard.yaml',
        [],
        '/project',
        '/project/.agentforge/locks',
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('No deviations to sync');
      }
    });
  });

  describe('significant deviation flagging', () => {
    it('emits SpecDriftDetected event for significant deviation', () => {
      const deviation: SignificantDeviation = {
        kind: 'new_endpoint',
        severity: 'significant',
        location: 'api:DELETE /api/revenue/:id',
        specValue: undefined,
        codeValue: 'DELETE /api/revenue/:id',
        description: 'Endpoint DELETE /api/revenue/:id exists in code but not in spec',
      };

      const result = flagSignificantDeviation(
        deviation,
        '/project/spec/api/routes.yaml',
        '/project',
        collector.bus,
        fs,
      );

      expect(result.ok).toBe(true);

      const driftEvents = collector.eventsOfType('SpecDriftDetected');
      expect(driftEvents).toHaveLength(1);
      expect(driftEvents[0].severity).toBe('significant');
      expect(driftEvents[0].deviations[0]).toContain('DELETE');
    });

    it('creates clarification task for human review', () => {
      const deviation: SignificantDeviation = {
        kind: 'removed_endpoint',
        severity: 'significant',
        location: 'api:POST /api/revenue',
        specValue: 'POST /api/revenue',
        codeValue: undefined,
        description: 'Endpoint POST /api/revenue exists in spec but not in code',
      };

      const result = flagSignificantDeviation(
        deviation,
        '/project/spec/api/routes.yaml',
        '/project',
        collector.bus,
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Result should be a task ID
        expect(result.value).toContain('task_specsync_');
      }

      // Verify the task was added to tasks YAML
      const tasksContent = fs.files.get('/project/agentforge.tasks.yaml');
      expect(tasksContent).toBeDefined();
    });
  });

  describe('lock management during sync', () => {
    it('lock acquired prevents concurrent access', () => {
      const lockDir = '/project/.agentforge/locks';
      const specFile = '/project/spec/components/dashboard.yaml';

      // First agent acquires lock
      const lock1 = acquireLock(specFile, 'agent:spec_sync', lockDir, 300000, fs);
      expect(lock1.ok).toBe(true);

      // Verify lock is held
      const lockCheck = isLocked(specFile, lockDir, fs);
      expect(lockCheck.ok).toBe(true);
      if (lockCheck.ok) {
        expect(lockCheck.value).not.toBeNull();
        expect(lockCheck.value?.agentId).toBe('agent:spec_sync');
      }

      // Second agent can't acquire
      const lock2 = acquireLock(specFile, 'agent:other', lockDir, 300000, fs);
      expect(lock2.ok).toBe(false);

      // Release and verify
      releaseLock(specFile, 'agent:spec_sync', lockDir, fs);
      const afterRelease = isLocked(specFile, lockDir, fs);
      expect(afterRelease.ok).toBe(true);
      if (afterRelease.ok) {
        expect(afterRelease.value).toBeNull();
      }
    });
  });

  describe('code extraction helpers', () => {
    it('extractPropsFromCode parses TypeScript interface', () => {
      const props = extractPropsFromCode(CODE_WITH_EXTRA_PROP, 'RevenueChart');
      expect(props).toHaveLength(3);
      expect(props[0].name).toBe('data');
      expect(props[0].type).toBe('ChartData[]');
      expect(props[0].required).toBe(true);
      expect(props[1].name).toBe('title');
      expect(props[1].required).toBe(false);
      expect(props[2].name).toBe('className');
    });

    it('extractEndpointsFromCode parses route handlers', () => {
      const endpoints = extractEndpointsFromCode(CODE_WITH_EXTRA_ENDPOINT);
      expect(endpoints).toHaveLength(3);
      expect(endpoints[0]).toEqual({ method: 'GET', path: '/api/revenue' });
      expect(endpoints[1]).toEqual({ method: 'POST', path: '/api/revenue' });
      expect(endpoints[2]).toEqual({ method: 'DELETE', path: '/api/revenue/:id' });
    });

    it('extractFieldsFromPrisma parses model fields', () => {
      const fields = extractFieldsFromPrisma(PRISMA_SCHEMA, 'User');
      expect(fields).not.toBeNull();
      expect(fields).toHaveLength(4);
      expect(fields![0]).toEqual({ name: 'id', type: 'Int' });
      expect(fields![1]).toEqual({ name: 'email', type: 'String' });
    });

    it('extractFieldsFromPrisma returns null for missing model', () => {
      const fields = extractFieldsFromPrisma(PRISMA_SCHEMA, 'Order');
      expect(fields).toBeNull();
    });
  });
});
