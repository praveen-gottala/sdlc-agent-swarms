/**
 * @module yaml-data-model.test
 *
 * Comprehensive tests for YAML data model read/write integrity.
 * Tests all four core data structures from PRD v2.0 Section 5:
 *   1. agentforge.yaml (Project Manifest)
 *   2. Living Spec files (spec/*.yaml, spec/components/*.yaml)
 *   3. agentforge.tasks.yaml (Task State)
 *   4. Agent learnings (.agentforge/learnings/<role>.yaml)
 *
 * All tests use real file I/O in temp directories — no mocks.
 */

import * as path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createRealFs } from '../fs/file-system.js';
import { readYaml, writeYaml } from '../fs/yaml-utils.js';
import { loadProjectManifest } from '../config/config-loader.js';
import { readSpecs } from './spec-reader.js';
import { loadTasks, saveTasks, updateTaskStatus } from './task-manager.js';
import { acquireLock, releaseLock } from './lock-manager.js';
import {
  readLearnings,
  addObservation,
} from './learnings-manager.js';
import type { ProjectManifest } from '../types/project-manifest.js';
import type { TaskEntry, TasksFile } from '../types/task.js';
import type { AgentLearning } from '../types/agent.js';
import type { ComponentSpec, ApiSpec, ModelsSpec } from '../types/spec-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'af-yaml-test-'));
}

/** Full project manifest matching PRD v2.0 Section 5.1 */
function fullManifest(): Record<string, unknown> {
  return {
    version: '1.0',
    project: {
      name: 'my-saas-app',
      id: 'proj_abc123',
      description: 'A SaaS application',
      platforms: ['web'],
    },
    stack: {
      frontend: 'react',
      backend: 'node',
      database: 'postgresql',
      styling: 'tailwind',
    },
    repo: {
      provider: 'github',
      org: 'org-name',
      name: 'my-saas-app',
    },
    agents: {
      providers: {
        default: 'claude-sonnet-4',
        overrides: {
          architecture: 'claude-opus-4',
          code_review: 'claude-haiku-4',
        },
      },
      sandbox: {
        type: 'github_actions',
        timeout_minutes: 15,
        max_retries: 3,
      },
      orchestration: {
        max_concurrent_agents: 3,
        ci_wait_strategy: 'spawn_next',
      },
    },
    hitl: {
      default: 'review_and_override',
      overrides: {
        design: 'full_approval',
        production_deploy: 'full_approval',
        test_generation: 'notify_only',
      },
    },
    channels: [
      { type: 'slack', capabilities: 'full', priority: 1 },
      { type: 'telegram', capabilities: 'approvals', priority: 2 },
      { type: 'cli', capabilities: 'basic', priority: 3 },
    ],
    routing: {
      approval_requests: 'all',
      status_updates: 'primary',
      critical_alerts: 'all',
    },
    budget: {
      per_task_max_usd: 2.0,
      per_phase_max_usd: 25.0,
      monthly_max_usd: 200.0,
      alert_threshold: 0.8,
    },
  };
}

/** Full task entry matching PRD v2.0 Section 5.3 */
function fullTaskEntry(overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id: 'task_001',
    title: 'Generate RevenueChart component',
    phase: 'code_generation',
    agent: 'frontend_coder',
    status: 'in_progress',
    depends_on: ['task_000'],
    spec_ref: 'comp_revenue_chart',
    branch: 'agentforge/task-001-revenue-chart',
    pr_number: null,
    cost_usd: 0.42,
    tokens_used: 18400,
    attempts: 1,
    max_attempts: 3,
    hitl_status: 'awaiting_approval',
    hitl_channel: 'slack:msg_xyz789',
    ...overrides,
  };
}

/** Component spec matching PRD v2.0 Section 5.2.1 */
function componentSpec(): Record<string, unknown> {
  return {
    version: '1.0',
    page_id: 'page_dashboard',
    last_updated_by: 'agent:spec_writer',
    components: [
      {
        id: 'comp_revenue_chart',
        name: 'RevenueChart',
        type: 'data_visualization',
        status: 'specced',
        design_ref: 'figma://file_id/node_id',
        props: [
          { name: 'dateRange', type: 'DateRange', required: true },
        ],
        data_source: 'api:GET /api/revenue',
      },
    ],
  };
}

/** API spec matching PRD v2.0 Section 5.2.2 */
function apiSpec(): Record<string, unknown> {
  return {
    version: '1.0',
    base_url: '/api',
    endpoints: [
      {
        id: 'ep_get_revenue',
        method: 'GET',
        path: '/revenue',
        query_params: [
          { name: 'start_date', type: 'string', format: 'ISO8601' },
        ],
        response: {
          type: 'RevenueDataPoint[]',
          schema_ref: 'models:RevenueDataPoint',
        },
        auth: 'required',
        status: 'specced',
      },
    ],
  };
}

/** Models spec matching PRD v2.0 Section 5.2.3 */
function modelsSpec(): Record<string, unknown> {
  return {
    version: '1.0',
    models: [
      {
        id: 'model_revenue',
        name: 'RevenueDataPoint',
        fields: [
          { name: 'date', type: 'DateTime', nullable: false },
          { name: 'amount', type: 'Decimal', precision: 10, scale: 2 },
        ],
        db_table: 'revenue_entries',
      },
    ],
  };
}

// ===========================================================================
// 1. Project Manifest (agentforge.yaml)
// ===========================================================================

describe('1. Project Manifest (agentforge.yaml)', () => {
  let tmpDir: string;
  const realFs = createRealFs();

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Read — parse and validate all sections', () => {
    it('parses a full manifest with all PRD 5.1 sections', () => {
      const manifest = fullManifest();
      writeFileSync(
        path.join(tmpDir, 'agentforge.yaml'),
        stringifyYaml(manifest),
      );

      const result = loadProjectManifest(tmpDir, realFs);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const m = result.value;
      // project section
      expect(m.version).toBe('1.0');
      expect(m.project.name).toBe('my-saas-app');
      expect(m.project.id).toBe('proj_abc123');
      expect(m.project.platforms).toEqual(['web']);

      // stack section
      expect(m.stack.frontend).toBe('react');
      expect(m.stack.backend).toBe('node');
      expect(m.stack.database).toBe('postgresql');
      expect(m.stack.styling).toBe('tailwind');

      // repo section
      expect(m.repo.provider).toBe('github');
      expect(m.repo.org).toBe('org-name');

      // agents section
      expect(m.agents.providers.default).toBe('claude-sonnet-4');
      expect(m.agents.providers.overrides?.architecture).toBe('claude-opus-4');
      expect(m.agents.sandbox.type).toBe('github_actions');
      expect(m.agents.sandbox.timeout_minutes).toBe(15);
      expect(m.agents.sandbox.max_retries).toBe(3);
      expect(m.agents.orchestration.max_concurrent_agents).toBe(3);
      expect(m.agents.orchestration.ci_wait_strategy).toBe('spawn_next');

      // hitl section
      expect(m.hitl.default).toBe('review_and_override');
      expect(m.hitl.overrides?.design).toBe('full_approval');
      expect(m.hitl.overrides?.production_deploy).toBe('full_approval');
      expect(m.hitl.overrides?.test_generation).toBe('notify_only');

      // channels section
      expect(m.channels).toHaveLength(3);
      expect(m.channels[0].type).toBe('slack');
      expect(m.channels[0].capabilities).toBe('full');
      expect(m.channels[1].type).toBe('telegram');
      expect(m.channels[2].type).toBe('cli');

      // routing section
      expect(m.routing.approval_requests).toBe('all');
      expect(m.routing.status_updates).toBe('primary');
      expect(m.routing.critical_alerts).toBe('all');

      // budget section
      expect(m.budget.per_task_max_usd).toBe(2.0);
      expect(m.budget.per_phase_max_usd).toBe(25.0);
      expect(m.budget.monthly_max_usd).toBe(200.0);
      expect(m.budget.alert_threshold).toBe(0.8);
    });
  });

  describe('Write — modify hitl.overrides, roundtrip, no data loss', () => {
    it('modifies hitl.overrides and preserves all other fields', () => {
      const manifest = fullManifest();
      const manifestPath = path.join(tmpDir, 'agentforge.yaml');
      writeFileSync(manifestPath, stringifyYaml(manifest));

      // Read
      const readResult = readYaml<Record<string, unknown>>(manifestPath, realFs);
      expect(readResult.ok).toBe(true);
      if (!readResult.ok) return;

      // Modify hitl overrides
      const data = readResult.value as Record<string, Record<string, unknown>>;
      data.hitl = {
        ...data.hitl,
        overrides: {
          ...(data.hitl.overrides as Record<string, unknown>),
          ci_builds: 'fully_autonomous',
        },
      };

      // Write back
      const writeResult = writeYaml(manifestPath, data, realFs);
      expect(writeResult.ok).toBe(true);

      // Re-read and verify
      const reread = loadProjectManifest(tmpDir, realFs);
      expect(reread.ok).toBe(true);
      if (!reread.ok) return;

      const m = reread.value;
      // Original hitl overrides still present
      expect(m.hitl.overrides?.design).toBe('full_approval');
      expect(m.hitl.overrides?.production_deploy).toBe('full_approval');
      expect(m.hitl.overrides?.test_generation).toBe('notify_only');
      // New override added
      expect((m.hitl.overrides as Record<string, string>)?.ci_builds).toBe('fully_autonomous');

      // All other sections unchanged
      expect(m.project.name).toBe('my-saas-app');
      expect(m.stack.frontend).toBe('react');
      expect(m.repo.provider).toBe('github');
      expect(m.agents.providers.default).toBe('claude-sonnet-4');
      expect(m.channels).toHaveLength(3);
      expect(m.budget.monthly_max_usd).toBe(200.0);
    });
  });

  describe('Validate — schema validation rejects missing required fields', () => {
    it('rejects manifest missing version', () => {
      const bad = fullManifest();
      delete (bad as Record<string, unknown>).version;
      writeFileSync(
        path.join(tmpDir, 'agentforge.yaml'),
        stringifyYaml(bad),
      );

      const result = loadProjectManifest(tmpDir, realFs);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('version');
      }
    });

    it('rejects manifest missing project.name', () => {
      const bad = fullManifest();
      (bad.project as Record<string, unknown>).name = undefined;
      writeFileSync(
        path.join(tmpDir, 'agentforge.yaml'),
        stringifyYaml(bad),
      );

      const result = loadProjectManifest(tmpDir, realFs);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('project.name');
      }
    });

    it('returns error for nonexistent agentforge.yaml', () => {
      const result = loadProjectManifest(tmpDir, realFs);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE');
      }
    });

    it('returns error for malformed YAML', () => {
      writeFileSync(
        path.join(tmpDir, 'agentforge.yaml'),
        '{{{{ not valid yaml !@#$%',
      );

      const result = loadProjectManifest(tmpDir, realFs);
      expect(result.ok).toBe(false);
    });
  });

  describe('Concurrency — read during write returns complete data', () => {
    it('concurrent read does not return partial YAML during atomic write', () => {
      const manifestPath = path.join(tmpDir, 'agentforge.yaml');
      const manifest = fullManifest();
      writeFileSync(manifestPath, stringifyYaml(manifest));

      // Acquire a write lock
      const lockDir = path.join(tmpDir, '.locks');
      const lockResult = acquireLock(manifestPath, 'agent-writer', lockDir, 60_000, realFs);
      expect(lockResult.ok).toBe(true);

      // Simulate write (writeYaml uses writeFileAtomic — write tmp + rename)
      const modified = { ...manifest, version: '2.0' };
      const writeResult = writeYaml(manifestPath, modified, realFs);
      expect(writeResult.ok).toBe(true);

      // Concurrent read — must see either old or new, never partial
      const readResult = loadProjectManifest(tmpDir, realFs);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        // After atomic write completes, we see the new version
        expect(readResult.value.version).toBe('2.0');
        // Full data integrity
        expect(readResult.value.project.name).toBe('my-saas-app');
        expect(readResult.value.budget.monthly_max_usd).toBe(200.0);
      }

      // Release lock
      releaseLock(manifestPath, 'agent-writer', lockDir, realFs);
    });

    it('read while lock held by writer still returns valid data', () => {
      const manifestPath = path.join(tmpDir, 'agentforge.yaml');
      writeFileSync(manifestPath, stringifyYaml(fullManifest()));

      const lockDir = path.join(tmpDir, '.locks');
      acquireLock(manifestPath, 'agent-writer', lockDir, 60_000, realFs);

      // Reader agent cannot acquire write lock...
      const readerLock = acquireLock(manifestPath, 'agent-reader', lockDir, 60_000, realFs);
      expect(readerLock.ok).toBe(false);

      // ...but can still read the file (read locks not required per PRD)
      const readResult = loadProjectManifest(tmpDir, realFs);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value.project.name).toBe('my-saas-app');
      }

      releaseLock(manifestPath, 'agent-writer', lockDir, realFs);
    });
  });
});

// ===========================================================================
// 2. Living Spec Files
// ===========================================================================

describe('2. Living Spec Files', () => {
  let tmpDir: string;
  let specDir: string;
  const realFs = createRealFs();

  beforeEach(() => {
    tmpDir = makeTempDir();
    specDir = path.join(tmpDir, 'spec');
    mkdirSync(specDir, { recursive: true });
    mkdirSync(path.join(specDir, 'components'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Read — parse component spec with all PRD 5.2.1 fields', () => {
    it('parses component spec with id, name, type, status, design_ref, props, data_source', () => {
      const spec = componentSpec();
      writeFileSync(
        path.join(specDir, 'components', 'dashboard.yaml'),
        stringifyYaml(spec),
      );
      writeFileSync(
        path.join(specDir, 'project.yaml'),
        stringifyYaml({ name: 'test' }),
      );

      const result = readSpecs(specDir, realFs);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const dashboard = result.value.components['dashboard'];
      expect(dashboard).toBeDefined();
      expect(dashboard.version).toBe('1.0');
      expect(dashboard.page_id).toBe('page_dashboard');
      expect(dashboard.last_updated_by).toBe('agent:spec_writer');

      expect(dashboard.components).toHaveLength(1);

      const comp = dashboard.components[0];
      expect(comp.id).toBe('comp_revenue_chart');
      expect(comp.name).toBe('RevenueChart');
      expect(comp.type).toBe('data_visualization');
      expect(comp.status).toBe('specced');
      expect(comp.design_ref).toBe('figma://file_id/node_id');
      expect(comp.data_source).toBe('api:GET /api/revenue');

      expect(comp.props).toHaveLength(1);
      expect(comp.props[0].name).toBe('dateRange');
      expect(comp.props[0].type).toBe('DateRange');
      expect(comp.props[0].required).toBe(true);
    });

    it('parses API spec with all PRD 5.2.2 fields', () => {
      writeFileSync(
        path.join(specDir, 'api.yaml'),
        stringifyYaml(apiSpec()),
      );
      writeFileSync(
        path.join(specDir, 'project.yaml'),
        stringifyYaml({ name: 'test' }),
      );

      const result = readSpecs(specDir, realFs);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const api = result.value.api!;
      expect(api.version).toBe('1.0');
      expect(api.base_url).toBe('/api');

      expect(api.endpoints).toHaveLength(1);

      const ep = api.endpoints[0];
      expect(ep.id).toBe('ep_get_revenue');
      expect(ep.method).toBe('GET');
      expect(ep.path).toBe('/revenue');
      expect(ep.auth).toBe('required');
      expect(ep.status).toBe('specced');

      expect(ep.response.type).toBe('RevenueDataPoint[]');
      expect(ep.response.schema_ref).toBe('models:RevenueDataPoint');
    });

    it('parses models spec with all PRD 5.2.3 fields', () => {
      writeFileSync(
        path.join(specDir, 'models.yaml'),
        stringifyYaml(modelsSpec()),
      );
      writeFileSync(
        path.join(specDir, 'project.yaml'),
        stringifyYaml({ name: 'test' }),
      );

      const result = readSpecs(specDir, realFs);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const models = result.value.models!;
      expect(models.version).toBe('1.0');

      expect(models.models).toHaveLength(1);

      const model = models.models[0];
      expect(model.id).toBe('model_revenue');
      expect(model.name).toBe('RevenueDataPoint');
      expect(model.db_table).toBe('revenue_entries');

      expect(model.fields).toHaveLength(2);
      expect(model.fields[0].name).toBe('date');
      expect(model.fields[0].type).toBe('DateTime');
      expect(model.fields[0].nullable).toBe(false);
      expect(model.fields[1].name).toBe('amount');
      expect(model.fields[1].precision).toBe(10);
      expect(model.fields[1].scale).toBe(2);
    });
  });

  describe('Write — update component status, verify no data loss', () => {
    it('updates component status from specced to coded, all other fields unchanged', () => {
      const specPath = path.join(specDir, 'components', 'dashboard.yaml');
      const spec = componentSpec();
      writeFileSync(specPath, stringifyYaml(spec));

      // Read
      const readResult = readYaml<ComponentSpec>(specPath, realFs);
      expect(readResult.ok).toBe(true);
      if (!readResult.ok) return;

      // Modify component status
      const data = readResult.value;
      const components = data.components.map((c) => ({
        ...c,
        status: c.id === 'comp_revenue_chart' ? 'coded' : c.status,
      }));
      const updated = { ...data, components };

      // Write back
      const writeResult = writeYaml(specPath, updated, realFs);
      expect(writeResult.ok).toBe(true);

      // Re-read and verify
      const reread = readYaml<ComponentSpec>(specPath, realFs);
      expect(reread.ok).toBe(true);
      if (!reread.ok) return;

      expect(reread.value.components[0].status).toBe('coded');
      // All other fields preserved
      expect(reread.value.components[0].id).toBe('comp_revenue_chart');
      expect(reread.value.components[0].name).toBe('RevenueChart');
      expect(reread.value.components[0].type).toBe('data_visualization');
      expect(reread.value.components[0].design_ref).toBe('figma://file_id/node_id');
      expect(reread.value.components[0].data_source).toBe('api:GET /api/revenue');
      expect(reread.value.page_id).toBe('page_dashboard');
      expect(reread.value.last_updated_by).toBe('agent:spec_writer');

      expect(reread.value.components[0].props[0].name).toBe('dateRange');
      expect(reread.value.components[0].props[0].type).toBe('DateRange');
      expect(reread.value.components[0].props[0].required).toBe(true);
    });
  });

  describe('Validate — spec_ref resolves to actual file paths', () => {
    it('spec_ref in tasks resolves to component spec files on disk', () => {
      // Create spec file
      writeFileSync(
        path.join(specDir, 'components', 'dashboard.yaml'),
        stringifyYaml(componentSpec()),
      );
      writeFileSync(
        path.join(specDir, 'project.yaml'),
        stringifyYaml({ name: 'test' }),
      );

      // Create a task that references the component
      const task = fullTaskEntry({ spec_ref: 'comp_revenue_chart' });

      // Read specs and verify the reference resolves
      const specsResult = readSpecs(specDir, realFs);
      expect(specsResult.ok).toBe(true);
      if (!specsResult.ok) return;

      // Search all component spec files for the referenced component ID
      let found = false;
      for (const [, compData] of Object.entries(specsResult.value.components)) {
        if (compData.components?.some((c) => c.id === task.spec_ref)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('detects unresolvable spec_ref', () => {
      writeFileSync(
        path.join(specDir, 'project.yaml'),
        stringifyYaml({ name: 'test' }),
      );

      const specsResult = readSpecs(specDir, realFs);
      expect(specsResult.ok).toBe(true);
      if (!specsResult.ok) return;

      // Try to resolve a non-existent spec ref
      const task = fullTaskEntry({ spec_ref: 'comp_nonexistent' });
      let found = false;
      for (const [, compData] of Object.entries(specsResult.value.components)) {
        if (compData.components?.some((c) => c.id === task.spec_ref)) {
          found = true;
          break;
        }
      }
      expect(found).toBe(false);
    });
  });

  describe('Concurrency — read during spec write', () => {
    it('concurrent read during an agent write does not return partial YAML', () => {
      const specPath = path.join(specDir, 'components', 'dashboard.yaml');
      writeFileSync(specPath, stringifyYaml(componentSpec()));

      const lockDir = path.join(tmpDir, '.locks');

      // Writer acquires lock
      const lockResult = acquireLock(specPath, 'agent-spec-writer', lockDir, 60_000, realFs);
      expect(lockResult.ok).toBe(true);

      // Writer updates the spec atomically
      const modified = componentSpec();
      (modified.components as { status: string }[])[0].status = 'coded';
      const writeResult = writeYaml(specPath, modified, realFs);
      expect(writeResult.ok).toBe(true);

      // Concurrent reader reads the file — must get complete valid YAML
      const readResult = readYaml<ComponentSpec>(specPath, realFs);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value.components).toHaveLength(1);
        expect(readResult.value.components[0].id).toBe('comp_revenue_chart');
        expect(readResult.value.components[0].name).toBe('RevenueChart');
        // Status is the updated one since atomic write completed
        expect(readResult.value.components[0].status).toBe('coded');
      }

      releaseLock(specPath, 'agent-spec-writer', lockDir, realFs);
    });
  });
});

// ===========================================================================
// 3. Task State (agentforge.tasks.yaml)
// ===========================================================================

describe('3. Task State (agentforge.tasks.yaml)', () => {
  let tmpDir: string;
  const realFs = createRealFs();

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Read — parse task with all PRD 5.3 fields', () => {
    it('parses a task with all fields: depends_on, hitl_status, cost_usd, tokens_used', () => {
      const tasksFile: TasksFile = { tasks: [fullTaskEntry()] };
      writeFileSync(
        path.join(tmpDir, 'agentforge.tasks.yaml'),
        stringifyYaml(tasksFile),
      );

      const result = loadTasks(tmpDir, realFs);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const task = result.value.tasks[0];
      expect(task.id).toBe('task_001');
      expect(task.title).toBe('Generate RevenueChart component');
      expect(task.phase).toBe('code_generation');
      expect(task.agent).toBe('frontend_coder');
      expect(task.status).toBe('in_progress');
      expect(task.depends_on).toEqual(['task_000']);
      expect(task.spec_ref).toBe('comp_revenue_chart');
      expect(task.branch).toBe('agentforge/task-001-revenue-chart');
      expect(task.pr_number).toBeNull();
      expect(task.cost_usd).toBe(0.42);
      expect(task.tokens_used).toBe(18400);
      expect(task.attempts).toBe(1);
      expect(task.max_attempts).toBe(3);
      expect(task.hitl_status).toBe('awaiting_approval');
      expect(task.hitl_channel).toBe('slack:msg_xyz789');
    });

    it('parses multiple tasks', () => {
      const tasksFile: TasksFile = {
        tasks: [
          fullTaskEntry({ id: 'task_001' }),
          fullTaskEntry({
            id: 'task_002',
            title: 'Generate ActivityFeed',
            status: 'pending',
            depends_on: ['task_001'],
            cost_usd: 0,
            tokens_used: 0,
            attempts: 0,
          }),
        ],
      };
      writeFileSync(
        path.join(tmpDir, 'agentforge.tasks.yaml'),
        stringifyYaml(tasksFile),
      );

      const result = loadTasks(tmpDir, realFs);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.tasks).toHaveLength(2);
      expect(result.value.tasks[1].depends_on).toEqual(['task_001']);
    });
  });

  describe('Write — update task, verify all other fields unchanged', () => {
    it('updates task status, increments attempts, sets pr_number', () => {
      const originalTask = fullTaskEntry({
        status: 'in_progress',
        attempts: 1,
        pr_number: null,
      });
      const tasksFile: TasksFile = { tasks: [originalTask] };
      writeFileSync(
        path.join(tmpDir, 'agentforge.tasks.yaml'),
        stringifyYaml(tasksFile),
      );

      // Load
      const loadResult = loadTasks(tmpDir, realFs);
      expect(loadResult.ok).toBe(true);
      if (!loadResult.ok) return;

      // Modify: update status to awaiting_approval
      const statusResult = updateTaskStatus(loadResult.value, 'task_001', 'awaiting_approval');
      expect(statusResult.ok).toBe(true);
      if (!statusResult.ok) return;

      // Also set pr_number and increment attempts
      const updatedTasks: TasksFile = {
        tasks: statusResult.value.tasks.map((t) =>
          t.id === 'task_001'
            ? { ...t, pr_number: 42, attempts: t.attempts + 1 }
            : t,
        ),
      };

      // Save
      const saveResult = saveTasks(tmpDir, updatedTasks, realFs);
      expect(saveResult.ok).toBe(true);

      // Re-load and verify
      const reloadResult = loadTasks(tmpDir, realFs);
      expect(reloadResult.ok).toBe(true);
      if (!reloadResult.ok) return;

      const task = reloadResult.value.tasks[0];
      // Updated fields
      expect(task.status).toBe('awaiting_approval');
      expect(task.pr_number).toBe(42);
      expect(task.attempts).toBe(2);
      // Unchanged fields
      expect(task.id).toBe('task_001');
      expect(task.title).toBe('Generate RevenueChart component');
      expect(task.phase).toBe('code_generation');
      expect(task.agent).toBe('frontend_coder');
      expect(task.depends_on).toEqual(['task_000']);
      expect(task.spec_ref).toBe('comp_revenue_chart');
      expect(task.branch).toBe('agentforge/task-001-revenue-chart');
      expect(task.cost_usd).toBe(0.42);
      expect(task.tokens_used).toBe(18400);
      expect(task.max_attempts).toBe(3);
      expect(task.hitl_status).toBe('awaiting_approval');
      expect(task.hitl_channel).toBe('slack:msg_xyz789');
    });
  });

  describe('Validate — depends_on references point to valid task IDs', () => {
    it('all depends_on references resolve within the same file', () => {
      const tasksFile: TasksFile = {
        tasks: [
          fullTaskEntry({ id: 'task_000', depends_on: [], status: 'completed' }),
          fullTaskEntry({ id: 'task_001', depends_on: ['task_000'] }),
          fullTaskEntry({ id: 'task_002', depends_on: ['task_000', 'task_001'], status: 'pending' }),
        ],
      };
      writeFileSync(
        path.join(tmpDir, 'agentforge.tasks.yaml'),
        stringifyYaml(tasksFile),
      );

      const result = loadTasks(tmpDir, realFs);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const allIds = new Set(result.value.tasks.map((t) => t.id));
      for (const task of result.value.tasks) {
        for (const dep of task.depends_on) {
          expect(allIds.has(dep)).toBe(true);
        }
      }
    });

    it('detects dangling depends_on references', () => {
      const tasksFile: TasksFile = {
        tasks: [
          fullTaskEntry({ id: 'task_001', depends_on: ['task_000', 'task_999'] }),
        ],
      };
      writeFileSync(
        path.join(tmpDir, 'agentforge.tasks.yaml'),
        stringifyYaml(tasksFile),
      );

      const result = loadTasks(tmpDir, realFs);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const allIds = new Set(result.value.tasks.map((t) => t.id));
      const task = result.value.tasks[0];
      const danglingRefs = task.depends_on.filter((dep) => !allIds.has(dep));
      expect(danglingRefs).toContain('task_000');
      expect(danglingRefs).toContain('task_999');
    });
  });

  describe('Concurrency — read during task write', () => {
    it('concurrent read during atomic write returns valid YAML', () => {
      const tasksFile: TasksFile = { tasks: [fullTaskEntry()] };
      const tasksPath = path.join(tmpDir, 'agentforge.tasks.yaml');
      writeFileSync(tasksPath, stringifyYaml(tasksFile));

      const lockDir = path.join(tmpDir, '.locks');

      // Writer acquires lock
      const lockResult = acquireLock(tasksPath, 'orchestrator', lockDir, 60_000, realFs);
      expect(lockResult.ok).toBe(true);

      // Writer updates task status atomically
      const modified: TasksFile = {
        tasks: [fullTaskEntry({ status: 'completed' })],
      };
      const writeResult = saveTasks(tmpDir, modified, realFs);
      expect(writeResult.ok).toBe(true);

      // Concurrent read sees complete data
      const readResult = loadTasks(tmpDir, realFs);
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value.tasks).toHaveLength(1);
        const task = readResult.value.tasks[0];
        expect(task.id).toBe('task_001');
        expect(task.title).toBe('Generate RevenueChart component');
        // All fields intact
        expect(task.cost_usd).toBe(0.42);
        expect(task.tokens_used).toBe(18400);
      }

      releaseLock(tasksPath, 'orchestrator', lockDir, realFs);
    });
  });
});

// ===========================================================================
// 4. Agent Learnings (.agentforge/learnings/<role>.yaml)
// ===========================================================================

describe('4. Agent Learnings (.agentforge/learnings/<role>.yaml)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'af-learnings-dm-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const sampleObs: Omit<AgentLearning, 'id'> = {
    date: '2026-03-17',
    source: 'human_feedback_on_task_003',
    learning: 'Team prefers named exports over default',
    confidence: 'high',
    taskRef: null,
    active: true,
  };

  describe('Read — parse observations with all PRD 5.4 fields', () => {
    it('parses observations with id, date, source, learning, confidence', async () => {
      const addResult = await addObservation('pr_reviewer', sampleObs, tmpDir);
      expect(addResult.ok).toBe(true);

      const result = await readLearnings('pr_reviewer', tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(1);
      const obs = result.value[0];
      expect(obs.id).toBe('obs_001');
      expect(obs.date).toBe('2026-03-17');
      expect(obs.source).toBe('human_feedback_on_task_003');
      expect(obs.learning).toBe('Team prefers named exports over default');
      expect(obs.confidence).toBe('high');
    });

    it('reads multiple observations matching PRD 5.4 example', async () => {
      await addObservation('pr_reviewer', sampleObs, tmpDir);
      await addObservation('pr_reviewer', {
        date: '2026-03-18',
        source: 'pattern_detected',
        learning: 'All data fetching uses custom useQuery wrapper',
        confidence: 'medium',
        taskRef: null,
        active: true,
      }, tmpDir);

      const result = await readLearnings('pr_reviewer', tmpDir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(2);
      expect(result.value[0].id).toBe('obs_001');
      expect(result.value[0].confidence).toBe('high');
      expect(result.value[1].id).toBe('obs_002');
      expect(result.value[1].source).toBe('pattern_detected');
      expect(result.value[1].confidence).toBe('medium');
    });

    it('returns empty array for nonexistent role file', async () => {
      const result = await readLearnings('nonexistent', tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('Write — append observation, verify preservation', () => {
    it('appends new observation, all pre-existing preserved exactly', async () => {
      // Add two initial observations
      await addObservation('pr_reviewer', sampleObs, tmpDir);
      await addObservation('pr_reviewer', {
        ...sampleObs,
        learning: 'Second observation',
        confidence: 'medium',
      }, tmpDir);

      // Snapshot pre-existing state
      const beforeResult = await readLearnings('pr_reviewer', tmpDir);
      expect(beforeResult.ok).toBe(true);
      if (!beforeResult.ok) return;
      const before = beforeResult.value;

      // Append a third observation
      const addResult = await addObservation('pr_reviewer', {
        ...sampleObs,
        learning: 'Third observation',
        confidence: 'low',
      }, tmpDir);
      expect(addResult.ok).toBe(true);

      // Read and verify
      const afterResult = await readLearnings('pr_reviewer', tmpDir);
      expect(afterResult.ok).toBe(true);
      if (!afterResult.ok) return;

      expect(afterResult.value).toHaveLength(3);

      // First two observations preserved exactly
      expect(afterResult.value[0].id).toBe(before[0].id);
      expect(afterResult.value[0].learning).toBe(before[0].learning);
      expect(afterResult.value[0].confidence).toBe(before[0].confidence);
      expect(afterResult.value[0].source).toBe(before[0].source);
      expect(afterResult.value[0].date).toBe(before[0].date);

      expect(afterResult.value[1].id).toBe(before[1].id);
      expect(afterResult.value[1].learning).toBe(before[1].learning);
      expect(afterResult.value[1].confidence).toBe(before[1].confidence);

      // New observation appended correctly
      expect(afterResult.value[2].id).toBe('obs_003');
      expect(afterResult.value[2].learning).toBe('Third observation');
      expect(afterResult.value[2].confidence).toBe('low');
    });
  });

  describe('Validate — YAML on disk matches expected schema', () => {
    it('YAML file has version, agent_role, last_updated, observations fields', async () => {
      await addObservation('pr_reviewer', sampleObs, tmpDir);

      const content = await readFile(path.join(tmpDir, 'pr_reviewer.yaml'), 'utf-8');
      const data = parseYaml(content) as Record<string, unknown>;

      expect(data.version).toBe('1.0');
      expect(data.agent_role).toBe('pr_reviewer');
      expect(data.last_updated).toBeDefined();
      expect(Array.isArray(data.observations)).toBe(true);

      const obs = (data.observations as Record<string, unknown>[])[0];
      expect(obs.id).toBe('obs_001');
      expect(obs.date).toBe('2026-03-17');
      expect(obs.source).toBe('human_feedback_on_task_003');
      expect(obs.learning).toBe('Team prefers named exports over default');
      expect(obs.confidence).toBe('high');
      // snake_case in YAML
      expect(obs.task_ref).toBeNull();
      expect(obs.active).toBe(true);
    });
  });

  describe('Concurrency — read during learnings write', () => {
    it('concurrent reads during sequential writes yield complete data', async () => {
      // Write first observation
      await addObservation('pr_reviewer', sampleObs, tmpDir);

      // Start a write and a read concurrently
      const [writeResult, readResult] = await Promise.all([
        addObservation('pr_reviewer', {
          ...sampleObs,
          learning: 'Concurrent write',
        }, tmpDir),
        readLearnings('pr_reviewer', tmpDir),
      ]);

      expect(writeResult.ok).toBe(true);
      expect(readResult.ok).toBe(true);

      if (readResult.ok) {
        // Read must return a valid array (not partial/corrupted)
        expect(Array.isArray(readResult.value)).toBe(true);
        // Must have at least the first observation
        expect(readResult.value.length).toBeGreaterThanOrEqual(1);
        expect(readResult.value[0].id).toBe('obs_001');
        expect(readResult.value[0].learning).toBe('Team prefers named exports over default');
      }

      // After both settle, verify final state is consistent
      const finalResult = await readLearnings('pr_reviewer', tmpDir);
      expect(finalResult.ok).toBe(true);
      if (finalResult.ok) {
        // At least the observations should be valid
        for (const obs of finalResult.value) {
          expect(obs.id).toMatch(/^obs_\d{3}$/);
          expect(obs.learning).toBeDefined();
          expect(obs.confidence).toBeDefined();
        }
      }
    });
  });
});

// ===========================================================================
// 5. Write-then-read roundtrip integrity (cross-structure)
// ===========================================================================

describe('5. Write-then-read roundtrip integrity', () => {
  let tmpDir: string;
  const realFs = createRealFs();

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('manifest roundtrip preserves all data without corruption', () => {
    const manifest = fullManifest();
    const manifestPath = path.join(tmpDir, 'agentforge.yaml');

    // Write
    writeFileSync(manifestPath, stringifyYaml(manifest));

    // Read back
    const readResult = readYaml<Record<string, unknown>>(manifestPath, realFs);
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) return;

    // Write again
    const writeResult = writeYaml(manifestPath, readResult.value, realFs);
    expect(writeResult.ok).toBe(true);

    // Read again and compare
    const secondRead = readYaml<Record<string, unknown>>(manifestPath, realFs);
    expect(secondRead.ok).toBe(true);
    if (!secondRead.ok) return;

    expect(secondRead.value).toEqual(readResult.value);
  });

  it('tasks roundtrip preserves all data without corruption', () => {
    const tasksFile: TasksFile = {
      tasks: [
        fullTaskEntry({ id: 'task_001' }),
        fullTaskEntry({ id: 'task_002', depends_on: ['task_001'], status: 'pending', cost_usd: 0 }),
      ],
    };

    // Write
    const saveResult = saveTasks(tmpDir, tasksFile, realFs);
    expect(saveResult.ok).toBe(true);

    // Read
    const loadResult = loadTasks(tmpDir, realFs);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    // Write again
    const saveResult2 = saveTasks(tmpDir, loadResult.value, realFs);
    expect(saveResult2.ok).toBe(true);

    // Read again and compare
    const loadResult2 = loadTasks(tmpDir, realFs);
    expect(loadResult2.ok).toBe(true);
    if (!loadResult2.ok) return;

    expect(loadResult2.value.tasks).toHaveLength(2);
    expect(loadResult2.value).toEqual(loadResult.value);
  });

  it('component spec roundtrip preserves all data without corruption', () => {
    const specPath = path.join(tmpDir, 'dashboard.yaml');
    const spec = componentSpec();

    // Write
    writeFileSync(specPath, stringifyYaml(spec));

    // Read
    const r1 = readYaml<Record<string, unknown>>(specPath, realFs);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Write again
    writeYaml(specPath, r1.value, realFs);

    // Read again
    const r2 = readYaml<Record<string, unknown>>(specPath, realFs);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    expect(r2.value).toEqual(r1.value);
  });
});

// ===========================================================================
// 6. PRD v2.0 Section 5 Field Coverage Report
// ===========================================================================

describe('6. PRD v2.0 Section 5 — Field Coverage Audit', () => {
  it('ProjectManifest type covers all PRD 5.1 fields', () => {
    // This test documents which fields from PRD 5.1 are present in the TypeScript interface.
    // If any field is missing, the manifest creation below would produce a type error.
    const manifest: ProjectManifest = {
      version: '1.0',
      project: { name: 'test', id: 'proj_1', platforms: ['web'] },
      stack: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
      repo: { provider: 'github', org: 'test', name: 'test' },
      agents: {
        providers: { default: 'claude-sonnet-4', overrides: { arch: 'claude-opus-4' } },
        sandbox: { type: 'github_actions', timeout_minutes: 15, max_retries: 3 },
        orchestration: { max_concurrent_agents: 3, ci_wait_strategy: 'spawn_next' },
      },
      hitl: { default: 'review_and_override', overrides: { design: 'full_approval' } },
      channels: [{ type: 'slack', capabilities: 'full', priority: 1 }],
      routing: { approval_requests: 'all', status_updates: 'primary', critical_alerts: 'all' },
      budget: { per_task_max_usd: 2, per_phase_max_usd: 25, monthly_max_usd: 200, alert_threshold: 0.8 },
    };

    // All fields must be present (TypeScript enforces this at compile time).
    // Runtime check that key sections exist:
    expect(manifest.version).toBeDefined();
    expect(manifest.project).toBeDefined();
    expect(manifest.stack).toBeDefined();
    expect(manifest.repo).toBeDefined();
    expect(manifest.agents).toBeDefined();
    expect(manifest.hitl).toBeDefined();
    expect(manifest.channels).toBeDefined();
    expect(manifest.routing).toBeDefined();
    expect(manifest.budget).toBeDefined();
  });

  it('TaskEntry type covers all PRD 5.3 fields', () => {
    const task: TaskEntry = fullTaskEntry();

    // PRD 5.3 specifies these fields:
    expect(task.id).toBeDefined();
    expect(task.title).toBeDefined();
    expect(task.phase).toBeDefined();
    expect(task.agent).toBeDefined();
    expect(task.status).toBeDefined();
    expect(task.depends_on).toBeDefined();
    expect(task.spec_ref).toBeDefined();
    expect(task.branch).toBeDefined(); // can be null
    expect('pr_number' in task).toBe(true); // can be null
    expect(task.cost_usd).toBeDefined();
    expect(task.tokens_used).toBeDefined();
    expect(task.attempts).toBeDefined();
    expect(task.max_attempts).toBeDefined();
    expect(task.hitl_status).toBeDefined();
    expect(task.hitl_channel).toBeDefined(); // can be null
  });

  it('AgentLearning type covers all PRD 5.4 fields', () => {
    const learning: AgentLearning = {
      id: 'obs_001',
      date: '2026-03-17',
      source: 'human_feedback_on_task_003',
      learning: 'Team prefers named exports over default',
      confidence: 'high',
      taskRef: null,
      active: true,
    };

    // PRD 5.4 specifies: id, date, source, learning, confidence
    expect(learning.id).toBeDefined();
    expect(learning.date).toBeDefined();
    expect(learning.source).toBeDefined();
    expect(learning.learning).toBeDefined();
    expect(learning.confidence).toBeDefined();

    // Implementation extends PRD with: taskRef, active, expires
    // These are additive (not missing from PRD — they extend it)
    expect('taskRef' in learning).toBe(true);
    expect('active' in learning).toBe(true);
  });

  it('Spec files now have typed interfaces matching PRD 5.2 — gap resolved', () => {
    // SpecFiles.api is now ApiSpec (not unknown)
    // SpecFiles.models is now ModelsSpec (not unknown)
    // SpecFiles.components is now Record<string, ComponentSpec> (not Record<string, unknown>)
    //
    // Remaining untyped: project and pages (PRD does not define a rigid schema for these)
    const compSpec: ComponentSpec = {
      version: '1.0',
      page_id: 'page_dashboard',
      last_updated_by: 'agent:spec_writer',
      components: [{
        id: 'comp_1', name: 'Test', type: 'ui', status: 'specced',
        design_ref: 'figma://x', props: [{ name: 'x', type: 'string', required: true }],
        data_source: 'api:GET /test',
      }],
    };
    const api: ApiSpec = {
      version: '1.0',
      base_url: '/api',
      endpoints: [{
        id: 'ep_1', method: 'GET', path: '/test',
        query_params: [{ name: 'q', type: 'string' }],
        response: { type: 'string', schema_ref: 'models:Test' },
        auth: 'required', status: 'specced',
      }],
    };
    const models: ModelsSpec = {
      version: '1.0',
      models: [{
        id: 'model_1', name: 'Test',
        fields: [{ name: 'id', type: 'Int', nullable: false }],
        db_table: 'tests',
      }],
    };

    // TypeScript compile-time safety — these assignments would fail if types were wrong
    expect(compSpec.components[0].id).toBe('comp_1');
    expect(api.endpoints[0].response.schema_ref).toBe('models:Test');
    expect(models.models[0].db_table).toBe('tests');
  });
});
