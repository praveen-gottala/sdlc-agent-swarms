import { stringify as stringifyYaml } from 'yaml';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';
import type { EventBus } from '../events/event-bus.js';
import type { DomainEvent } from '../events/domain-events.js';
import type { TasksFile } from '../types/task.js';
import {
  diffSpecVsCode,
  categorizeDeviation,
  applyMinorSync,
  flagSignificantDeviation,
  extractPropsFromCode,
  extractEndpointsFromCode,
  extractFieldsFromPrisma,
} from './spec-sync.js';
import type { MinorDeviation, SignificantDeviation } from './spec-sync.js';

/**
 * Create an in-memory FileSystem backed by a Map for testing.
 */
function createMockFs(files: Record<string, string> = {}): FileSystem {
  const store = new Map<string, string>(Object.entries(files));

  return {
    readFile(filePath: string): Result<string> {
      const content = store.get(filePath);
      if (content === undefined) {
        return Err({ code: 'INVALID_STATE' as const, message: `File not found: ${filePath}`, recoverable: false });
      }
      return Ok(content);
    },
    writeFile(filePath: string, content: string): Result<void> {
      store.set(filePath, content);
      return Ok(undefined);
    },
    writeFileAtomic(filePath: string, content: string): Result<void> {
      store.set(filePath, content);
      return Ok(undefined);
    },
    exists(filePath: string): boolean {
      if (store.has(filePath)) return true;
      const dirPrefix = filePath.endsWith('/') ? filePath : filePath + '/';
      for (const key of store.keys()) {
        if (key.startsWith(dirPrefix)) return true;
      }
      return false;
    },
    mkdir(_dirPath: string): Result<void> {
      return Ok(undefined);
    },
    rename(oldPath: string, newPath: string): Result<void> {
      const content = store.get(oldPath);
      if (content === undefined) {
        return Err({ code: 'INVALID_STATE' as const, message: `File not found: ${oldPath}`, recoverable: false });
      }
      store.set(newPath, content);
      store.delete(oldPath);
      return Ok(undefined);
    },
    remove(filePath: string): Result<void> {
      store.delete(filePath);
      return Ok(undefined);
    },
    listDir(dirPath: string): Result<readonly string[]> {
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      const entries = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const firstSegment = rest.split('/')[0];
          entries.add(firstSegment);
        }
      }
      return Ok([...entries]);
    },
    appendFile(filePath: string, content: string): Result<void> {
      const existing = store.get(filePath) ?? '';
      store.set(filePath, existing + content);
      return Ok(undefined);
    },
  };
}

/**
 * Create a mock EventBus that records published events.
 */
function createMockEventBus(): EventBus & { readonly events: DomainEvent[] } {
  const events: DomainEvent[] = [];
  return {
    events,
    publish(event: DomainEvent): void {
      events.push(event);
    },
    subscribe(): void { /* no-op */ },
    unsubscribe(): void { /* no-op */ },
    clear(): void {
      events.length = 0;
    },
  };
}

describe('spec-sync', () => {
  describe('extractPropsFromCode', () => {
    it('extracts props from a TypeScript interface', () => {
      const code = `
interface RevenueChartProps {
  dateRange: DateRange;
  showLegend?: boolean;
  height: number;
}
`;
      const props = extractPropsFromCode(code, 'RevenueChart');
      expect(props).toHaveLength(3);
      expect(props[0]).toEqual({ name: 'dateRange', type: 'DateRange', required: true });
      expect(props[1]).toEqual({ name: 'showLegend', type: 'boolean', required: false });
      expect(props[2]).toEqual({ name: 'height', type: 'number', required: true });
    });

    it('returns empty array when interface not found', () => {
      const code = `const x = 42;`;
      const props = extractPropsFromCode(code, 'RevenueChart');
      expect(props).toHaveLength(0);
    });
  });

  describe('extractEndpointsFromCode', () => {
    it('extracts route handler signatures', () => {
      const code = `
router.get('/revenue', handler);
router.post('/revenue', createHandler);
app.delete('/revenue/:id', deleteHandler);
`;
      const endpoints = extractEndpointsFromCode(code);
      expect(endpoints).toHaveLength(3);
      expect(endpoints[0]).toEqual({ method: 'GET', path: '/revenue' });
      expect(endpoints[1]).toEqual({ method: 'POST', path: '/revenue' });
      expect(endpoints[2]).toEqual({ method: 'DELETE', path: '/revenue/:id' });
    });
  });

  describe('extractFieldsFromPrisma', () => {
    it('extracts fields from a Prisma model', () => {
      const schema = `
model RevenueDataPoint {
  id        String   @id @default(cuid())
  date      DateTime
  amount    Decimal  @db.Decimal(10, 2)
}
`;
      const fields = extractFieldsFromPrisma(schema, 'RevenueDataPoint');
      expect(fields).not.toBeNull();
      expect(fields).toHaveLength(3);
      expect(fields![0]).toEqual({ name: 'id', type: 'String' });
      expect(fields![1]).toEqual({ name: 'date', type: 'DateTime' });
      expect(fields![2]).toEqual({ name: 'amount', type: 'Decimal' });
    });

    it('returns null when model not found', () => {
      const schema = `model Other { id String }`;
      const fields = extractFieldsFromPrisma(schema, 'RevenueDataPoint');
      expect(fields).toBeNull();
    });
  });

  describe('diffSpecVsCode', () => {
    it('returns no deviations when spec matches code', () => {
      const specData = {
        version: '1.0',
        page_id: 'page_dashboard',
        components: [
          {
            id: 'comp_revenue_chart',
            name: 'RevenueChart',
            props: [
              { name: 'dateRange', type: 'DateRange', required: true },
              { name: 'height', type: 'number', required: true },
            ],
          },
        ],
      };

      const codeContent = `
interface RevenueChartProps {
  dateRange: DateRange;
  height: number;
}
`;

      const fs = createMockFs({
        '/project/spec/components/dashboard.yaml': stringifyYaml(specData),
        '/project/src/RevenueChart.tsx': codeContent,
      });

      const result = diffSpecVsCode(
        '/project/spec/components/dashboard.yaml',
        ['/project/src/RevenueChart.tsx'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('detects extra prop in code that is not in spec', () => {
      const specData = {
        version: '1.0',
        components: [
          {
            id: 'comp_revenue_chart',
            name: 'RevenueChart',
            props: [
              { name: 'dateRange', type: 'DateRange', required: true },
            ],
          },
        ],
      };

      const codeContent = `
interface RevenueChartProps {
  dateRange: DateRange;
  showLegend?: boolean;
}
`;

      const fs = createMockFs({
        '/project/spec/components/dashboard.yaml': stringifyYaml(specData),
        '/project/src/RevenueChart.tsx': codeContent,
      });

      const result = diffSpecVsCode(
        '/project/spec/components/dashboard.yaml',
        ['/project/src/RevenueChart.tsx'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].kind).toBe('extra_prop');
        expect(result.value[0].codeValue).toBe('showLegend');
      }
    });

    it('detects endpoint method mismatch', () => {
      const specData = {
        version: '1.0',
        base_url: '/api',
        endpoints: [
          { id: 'ep_get_revenue', method: 'GET', path: '/revenue' },
        ],
      };

      const codeContent = `
router.post('/revenue', handler);
`;

      const fs = createMockFs({
        '/project/spec/api.yaml': stringifyYaml(specData),
        '/project/src/routes.ts': codeContent,
      });

      const result = diffSpecVsCode(
        '/project/spec/api.yaml',
        ['/project/src/routes.ts'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].kind).toBe('method_mismatch');
        expect(result.value[0].specValue).toBe('GET');
        expect(result.value[0].codeValue).toBe('POST');
      }
    });

    it('returns no data model deviations when Prisma schema does not exist', () => {
      const specData = {
        version: '1.0',
        models: [
          {
            id: 'model_revenue',
            name: 'RevenueDataPoint',
            fields: [
              { name: 'date', type: 'DateTime' },
              { name: 'amount', type: 'Decimal' },
            ],
          },
        ],
      };

      const codeContent = `
// No Prisma model here, just regular TypeScript
const x = 42;
`;

      const fs = createMockFs({
        '/project/spec/models.yaml': stringifyYaml(specData),
        '/project/src/other.ts': codeContent,
      });

      const result = diffSpecVsCode(
        '/project/spec/models.yaml',
        ['/project/src/other.ts'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it('detects model field deviations when Prisma schema exists', () => {
      const specData = {
        version: '1.0',
        models: [
          {
            id: 'model_revenue',
            name: 'RevenueDataPoint',
            fields: [
              { name: 'date', type: 'DateTime' },
              { name: 'amount', type: 'Decimal' },
            ],
          },
        ],
      };

      const prismaSchema = `
model RevenueDataPoint {
  id        String   @id
  date      DateTime
  amount    Decimal
  currency  String
}
`;

      const fs = createMockFs({
        '/project/spec/models.yaml': stringifyYaml(specData),
        '/project/prisma/schema.prisma': prismaSchema,
      });

      const result = diffSpecVsCode(
        '/project/spec/models.yaml',
        ['/project/prisma/schema.prisma'],
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // "id" and "currency" are in code but not in spec
        const newFields = result.value.filter((d) => d.kind === 'new_field');
        expect(newFields).toHaveLength(2);
        expect(newFields.map((d) => d.codeValue)).toContain('id');
        expect(newFields.map((d) => d.codeValue)).toContain('currency');
      }
    });
  });

  describe('categorizeDeviation', () => {
    it('categorizes extra_prop as minor', () => {
      const result = categorizeDeviation({
        kind: 'extra_prop',
        location: 'RevenueChart.props.showLegend',
        specValue: undefined,
        codeValue: 'showLegend',
        description: 'Prop "showLegend" exists in code but not in spec',
      });
      expect(result.severity).toBe('minor');
    });

    it('categorizes type_mismatch as minor', () => {
      const result = categorizeDeviation({
        kind: 'type_mismatch',
        location: 'RevenueChart.props.height',
        specValue: 'number',
        codeValue: 'string',
        description: 'Type mismatch',
      });
      expect(result.severity).toBe('minor');
    });

    it('categorizes new_endpoint as significant', () => {
      const result = categorizeDeviation({
        kind: 'new_endpoint',
        location: 'api:POST /users',
        specValue: undefined,
        codeValue: 'POST /users',
        description: 'New endpoint in code',
      });
      expect(result.severity).toBe('significant');
    });

    it('categorizes method_mismatch as significant', () => {
      const result = categorizeDeviation({
        kind: 'method_mismatch',
        location: 'api:/revenue',
        specValue: 'GET',
        codeValue: 'POST',
        description: 'Method mismatch',
      });
      expect(result.severity).toBe('significant');
    });

    it('categorizes removed_field as significant', () => {
      const result = categorizeDeviation({
        kind: 'removed_field',
        location: 'RevenueDataPoint.amount',
        specValue: 'amount',
        codeValue: undefined,
        description: 'Field removed',
      });
      expect(result.severity).toBe('significant');
    });
  });

  describe('applyMinorSync', () => {
    it('acquires lock, updates spec, and releases lock', () => {
      const specData = {
        version: '1.0',
        page_id: 'page_dashboard',
        components: [
          {
            id: 'comp_revenue_chart',
            name: 'RevenueChart',
            props: [
              { name: 'dateRange', type: 'DateRange', required: true },
            ],
          },
        ],
      };

      const fs = createMockFs({
        '/project/spec/components/dashboard.yaml': stringifyYaml(specData),
      });

      const deviation: MinorDeviation = {
        severity: 'minor',
        kind: 'extra_prop',
        location: 'RevenueChart.props.showLegend',
        specValue: undefined,
        codeValue: 'showLegend',
        description: 'Prop "showLegend" exists in code but not in spec',
      };

      const result = applyMinorSync(
        '/project/spec/components/dashboard.yaml',
        [deviation],
        '/project',
        '/project/.agentforge/locks',
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('[agentforge:spec_sync] auto-sync:');
        expect(result.value).toContain('showLegend');
      }

      // Verify lock was released (no active lock)
      const lockDir = '/project/.agentforge/locks';
      const lockFiles = fs.listDir(lockDir);
      if (lockFiles.ok) {
        expect(lockFiles.value).toHaveLength(0);
      }

      // Verify the spec was updated
      const updatedSpec = fs.readFile('/project/spec/components/dashboard.yaml');
      expect(updatedSpec.ok).toBe(true);
      if (updatedSpec.ok) {
        expect(updatedSpec.value).toContain('showLegend');
        expect(updatedSpec.value).toContain('agent:spec_sync');
      }
    });

    it('returns no-op message when there are no deviations', () => {
      const fs = createMockFs({});

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

  describe('flagSignificantDeviation', () => {
    it('emits SpecDriftDetected event and creates task', () => {
      const tasksData: TasksFile = { tasks: [] };
      const fs = createMockFs({
        '/project/agentforge.tasks.yaml': stringifyYaml(tasksData),
      });
      const eventBus = createMockEventBus();

      const deviation: SignificantDeviation = {
        severity: 'significant',
        kind: 'method_mismatch',
        location: 'api:/revenue',
        specValue: 'GET',
        codeValue: 'POST',
        description: 'Endpoint /revenue method mismatch: spec="GET", code="POST"',
      };

      const result = flagSignificantDeviation(
        deviation,
        '/project/spec/api.yaml',
        '/project',
        eventBus,
        fs,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('task_specsync_');
      }

      // Verify event was emitted
      expect(eventBus.events).toHaveLength(1);
      expect(eventBus.events[0].type).toBe('SpecDriftDetected');
      const driftEvent = eventBus.events[0] as DomainEvent & { type: 'SpecDriftDetected' };
      expect(driftEvent.specFile).toBe('/project/spec/api.yaml');
      expect(driftEvent.severity).toBe('significant');

      // Verify task was created in tasks file
      const updatedTasks = fs.readFile('/project/agentforge.tasks.yaml');
      expect(updatedTasks.ok).toBe(true);
      if (updatedTasks.ok) {
        expect(updatedTasks.value).toContain('spec_sync');
        expect(updatedTasks.value).toContain('method mismatch');
        expect(updatedTasks.value).toContain('awaiting_approval');
      }
    });
  });
});
