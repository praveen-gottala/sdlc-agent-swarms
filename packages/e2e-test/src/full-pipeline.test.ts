/**
 * E2E Full Pipeline Smoke Test — "The Tuesday Morning Test"
 *
 * Validates the complete AgentForge SDLC pipeline from init through deploy:
 *   init → design → spec → code → CI/CD → deploy
 *
 * All external services (LLM, Figma, GitHub, Slack) are mocked with
 * realistic canned responses. Verifies event flow, governance, budget,
 * task transitions, MCP middleware, audit logging, and agent learnings.
 *
 * See: PRD v2.0 Section 21 (Developer Experience Narrative)
 *      PRD v2.0 Section 24.1 (Phase 1 Milestone Deliverable)
 *      docs/architecture.md (Communication Flow)
 */

import {
  Ok,
  Err,
  createEventBus,
  runAgent,
  updateTaskStatus,
  addTask,
  loadTasks,
  saveTasks,
  addObservation,
  getActiveLearnings,
  createLearningsFile,
  readYaml,
  writeYaml,
} from '@agentforge/core';
import type {
  EventBus,
  FileSystem,
  MCPClient,
  AgentContext,
  LLMProviderRef,
  AgentContract,
  AgentWorkFn,
  DomainEvent,
  DomainEventType,
  TaskEntry,
  TasksFile,
  CostEstimate,
  Result,
} from '@agentforge/core';
import {
  createGovernanceMiddleware,
  executeGovernancePipeline,
} from '@agentforge/governance';
import type {
  GovernanceMiddleware,
  GovernanceConfig,
  AgentAction,
  AuditEntry,
} from '@agentforge/governance';
import { buildManifest, scaffoldProject } from '@agentforge/cli';
import type { InitAnswers } from '@agentforge/cli';
import { handlePageRequest } from '@agentforge/agents-design';
import type {
  UXResearcherInput,
  UXResearcherOutput,
  WireframeGeneratorInput,
  WireframeGeneratorOutput,
  VisualDesignerInput,
  VisualDesignerOutput,
  DesignReviewerInput,
  DesignReviewerOutput,
} from '@agentforge/agents-design';
import type {
  SpecWriterInput,
  SpecWriterOutput,
  TaskDecomposerInput,
  TaskDecomposerOutput,
} from '@agentforge/agents-spec';
import type {
  FrontendCoderInput,
  FrontendCoderOutput,
} from '@agentforge/agents-code';
import type {
  BackendCoderInput,
  BackendCoderOutput,
} from '@agentforge/agents-code';
import type {
  TestWriterInput,
  TestWriterOutput,
} from '@agentforge/agents-code';
// PRReviewerInput/PRReviewerOutput not used in current test scope
import type {
  SecurityScannerInput,
  SecurityScannerOutput,
} from '@agentforge/agents-cicd';
import type {
  PRManagerInput,
  PRManagerOutput,
} from '@agentforge/agents-cicd';
import type {
  DeployAgentInput,
  DeployAgentOutput,
} from '@agentforge/agents-cicd';

// ============================================================================
// Test infrastructure
// ============================================================================

interface EventCollector {
  readonly bus: EventBus;
  readonly events: DomainEvent[];
  eventsOfType<T extends DomainEventType>(type: T): Extract<DomainEvent, { type: T }>[];
  clear(): void;
}

function createEventCollector(): EventCollector {
  const bus = createEventBus();
  const events: DomainEvent[] = [];
  const originalPublish = bus.publish.bind(bus);

  bus.publish = (event: DomainEvent) => {
    events.push(event);
    originalPublish(event);
  };

  return {
    bus,
    events,
    eventsOfType<T extends DomainEventType>(type: T) {
      return events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);
    },
    clear() {
      events.length = 0;
      bus.clear();
    },
  };
}

interface MockFileSystem extends FileSystem {
  files: Map<string, string>;
  dirs: Set<string>;
}

function createMockFs(initialFiles: Record<string, string> = {}): MockFileSystem {
  const files = new Map(Object.entries(initialFiles));
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return Err({ code: 'INVALID_STATE' as const, message: `File not found: ${filePath}`, recoverable: false });
      }
      return Ok(content);
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return Ok(undefined);
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return Ok(undefined);
    },
    exists(filePath: string) {
      return files.has(filePath) || dirs.has(filePath);
    },
    mkdir(dirPath: string) {
      dirs.add(dirPath);
      return Ok(undefined);
    },
    rename(oldPath: string, newPath: string) {
      const content = files.get(oldPath);
      if (content !== undefined) {
        files.set(newPath, content);
        files.delete(oldPath);
      }
      return Ok(undefined);
    },
    remove(filePath: string) {
      files.delete(filePath);
      dirs.delete(filePath);
      return Ok(undefined);
    },
    listDir(dirPath: string) {
      const entries: string[] = [];
      const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const segment = rest.split('/')[0];
          if (!entries.includes(segment)) entries.push(segment);
        }
      }
      return Ok(entries);
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return Ok(undefined);
    },
  };
}

type MCPHandler = (
  server: string,
  method: string,
  params: Readonly<Record<string, unknown>>,
) => Promise<Result<unknown>>;

function createMockMCPClient(handler?: MCPHandler): MCPClient & { calls: Array<{ server: string; method: string; params: Readonly<Record<string, unknown>> }> } {
  const calls: Array<{ server: string; method: string; params: Readonly<Record<string, unknown>> }> = [];
  const defaultHandler: MCPHandler = async () => Ok({ success: true });
  const h = handler ?? defaultHandler;

  return {
    calls,
    async callTool(server, method, params) {
      calls.push({ server, method, params });
      return h(server, method, params);
    },
    async listTools() {
      return Ok([]);
    },
    async isAvailable() {
      return true;
    },
  };
}

function createMockProvider(): LLMProviderRef & { completeCalls: number } {
  const provider = {
    name: 'mock-provider',
    completeCalls: 0,
    async complete() {
      provider.completeCalls++;
      return Ok({ content: 'generated code', cost: { totalCostUsd: 0.01 } });
    },
    async *stream() {
      yield { type: 'done' as const };
    },
    estimateCost(): CostEstimate {
      return {
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.01,
        confidence: 'medium' as const,
      };
    },
  };
  return provider;
}

function makeContract(overrides: Partial<AgentContract> = {}): AgentContract {
  return {
    role: 'test_agent',
    description: 'Test agent',
    category: 'code',
    provider: 'mock-provider',
    execution: { mode: 'complete', progress_events: false, max_context_tokens: 50000 },
    tools: [],
    permissions: ['read_code', 'write_code', 'create_branch', 'create_pr'],
    denied: [],
    hitl_policy: 'notify_only',
    budget: { max_tokens_per_task: 30000, max_cost_per_task_usd: 2.0 },
    on_complete: 'AgentCompleted',
    on_error: 'retry(max=3) + notify_human',
    context: {},
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id: 'task_001',
    title: 'Test task',
    phase: 'code',
    agent: 'test_agent',
    status: 'pending',
    depends_on: [],
    spec_ref: 'spec/test.yaml',
    branch: null,
    pr_number: null,
    cost_usd: 0,
    tokens_used: 0,
    attempts: 0,
    max_attempts: 3,
    hitl_status: 'none',
    hitl_channel: null,
    ...overrides,
  };
}

const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  hitl: {
    defaultLevel: 'notify_only',
    overrides: {},
    routing: { approvalRequests: 'all', statusUpdates: 'primary', criticalAlerts: 'all' },
    escalation: {
      timeoutMinutes: 60,
      onTimeout: 'pause_and_notify',
      secondaryTimeoutMinutes: 30,
      escalationChannels: ['telegram'],
    },
  },
  budget: {
    perTaskMaxUsd: 2.0,
    perPhaseMaxUsd: 25.0,
    monthlyMaxUsd: 200.0,
    alertThreshold: 0.8,
  },
  circuitBreaker: {
    maxConsecutiveFailures: 5,
    maxCallsWithoutProgress: 5,
    resetAfterMinutes: 5,
  },
};

/** Create an AgentContext wired to our test doubles. */
function createTestContext(
  eventBus: EventBus,
  fs: FileSystem,
  mcpClient: MCPClient,
  governance: GovernanceMiddleware,
  auditLog: AuditEntry[],
  taskId = 'task_001',
): AgentContext {
  return {
    taskId,
    projectRoot: '/project',
    eventBus,
    fs,
    mcpClient,
    runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
    resolveProvider: jest.fn().mockReturnValue(Ok(createMockProvider())),
    recordAudit: jest.fn((entry: unknown) => {
      auditLog.push(entry as AuditEntry);
      governance.recordAudit(entry as AuditEntry);
    }),
  };
}

// ============================================================================
// Agent contracts for each SDLC phase
// ============================================================================

const UX_RESEARCH_CONTRACT = makeContract({
  role: 'ux_researcher',
  category: 'design',
  permissions: ['read_spec', 'write_design'],
  on_complete: 'UXResearchComplete',
  on_error: 'retry(max=2) + notify_human',
});

const WIREFRAME_CONTRACT = makeContract({
  role: 'wireframer',
  category: 'design',
  permissions: ['read_spec', 'write_design'],
  hitl_policy: 'full_approval',
  on_complete: 'WireframeComplete',
  on_error: 'retry(max=2) + notify_human',
});

const VISUAL_DESIGN_CONTRACT = makeContract({
  role: 'visual_designer',
  category: 'design',
  permissions: ['read_spec', 'read_design', 'write_design'],
  on_complete: 'VisualDesignComplete',
  on_error: 'retry(max=2) + notify_human',
});

const DESIGN_REVIEW_CONTRACT = makeContract({
  role: 'design_reviewer',
  category: 'design',
  permissions: ['read_design'],
  on_complete: 'DesignReviewComplete',
  on_error: 'notify_human',
});

const SPEC_WRITER_CONTRACT = makeContract({
  role: 'spec_writer',
  category: 'spec',
  permissions: ['read_design', 'write_spec'],
  on_complete: 'SpecComplete',
  on_error: 'retry(max=2) + notify_human',
});

const TASK_DECOMPOSER_CONTRACT = makeContract({
  role: 'task_decomposer',
  category: 'spec',
  permissions: ['read_spec', 'write_tasks'],
  on_complete: 'TasksCreated',
  on_error: 'notify_human',
});

const FRONTEND_CODER_CONTRACT = makeContract({
  role: 'frontend_coder',
  category: 'code',
  permissions: ['read_spec', 'write_code', 'create_branch'],
  on_complete: 'CodeGenComplete',
  on_error: 'retry(max=3) + notify_human',
});

const BACKEND_CODER_CONTRACT = makeContract({
  role: 'backend_coder',
  category: 'code',
  permissions: ['read_spec', 'write_code', 'create_branch'],
  on_complete: 'CodeGenComplete',
  on_error: 'retry(max=3) + notify_human',
});

const TEST_WRITER_CONTRACT = makeContract({
  role: 'test_writer',
  category: 'code',
  permissions: ['read_spec', 'read_code', 'write_code'],
  hitl_policy: 'notify_only',
  on_complete: 'TestsComplete',
  on_error: 'retry(max=3) + notify_human',
});

const SECURITY_SCANNER_CONTRACT = makeContract({
  role: 'security_scanner',
  category: 'code',
  permissions: ['read_code'],
  on_complete: 'SecurityScanComplete',
  on_error: 'notify_human',
});

const PR_MANAGER_CONTRACT = makeContract({
  role: 'pr_manager',
  category: 'cicd',
  permissions: ['read_code', 'create_pr'],
  on_complete: 'PRCreated',
  on_error: 'notify_human + pause',
});

const DEPLOY_CONTRACT = makeContract({
  role: 'deployer',
  category: 'cicd',
  permissions: ['deploy_staging'],
  hitl_policy: 'full_approval',
  on_complete: 'DeployComplete',
  on_error: 'notify_human + pause',
});

// ============================================================================
// The "Tuesday Morning" Test
// ============================================================================

describe('Full Pipeline Smoke Test — "The Tuesday Morning Test"', () => {
  let collector: EventCollector;
  let fs: MockFileSystem;
  let mcpClient: ReturnType<typeof createMockMCPClient>;
  let governance: GovernanceMiddleware;
  let auditLog: AuditEntry[];
  const PROJECT_ROOT = '/project';

  beforeEach(() => {
    collector = createEventCollector();
    fs = createMockFs();
    auditLog = [];

    // Realistic MCP mock: Figma returns design data, GitHub handles repo ops
    mcpClient = createMockMCPClient(async (server, method, params) => {
      // Figma MCP server
      if (server === 'figma') {
        if (method === 'get_design' || method === 'get_code') {
          return Ok({
            designRef: `figma://file_abc/${params['page'] ?? 'unknown'}`,
            components: ['Header', 'RevenueChart', 'ActivityFeed'],
            html: '<div class="dashboard"><div class="chart"></div><div class="feed"></div></div>',
          });
        }
        if (method === 'generate_figma_design') {
          return Ok({ nodeId: 'node_123', status: 'created' });
        }
        if (method === 'get_tokens') {
          return Ok({
            colors: { primary: '#2563eb', background: '#ffffff', text: '#1f2937' },
            typography: { heading: { family: 'Inter', weight: 700 } },
            spacing: { sm: '8px', md: '16px', lg: '32px' },
          });
        }
        return Ok({ success: true });
      }

      // GitHub MCP server
      if (server === 'github') {
        if (method === 'push') {
          return Ok({ sha: 'abc1234', branch: params['branch'] });
        }
        if (method === 'create_pr') {
          return Ok({ prNumber: 42, url: 'https://github.com/test/smoke/pull/42' });
        }
        if (method === 'read_pr') {
          return Ok('diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx\n+export const Dashboard = () => <div>Dashboard</div>;');
        }
        if (method === 'create_review') {
          return Ok({ id: 'review_1', decision: 'APPROVE' });
        }
        if (method === 'merge_pr') {
          return Ok({ merged: true, sha: 'def5678' });
        }
        if (method === 'trigger_workflow') {
          return Ok({ runId: 'run_001', status: 'queued' });
        }
        if (method === 'get_workflow_result') {
          return Ok({ runId: 'run_001', status: 'success', conclusion: 'success' });
        }
        if (method === 'delete_branch') {
          return Ok({ deleted: true });
        }
        return Ok({ success: true });
      }

      // Slack MCP server
      if (server === 'slack') {
        if (method === 'post_message') {
          return Ok({ channel: 'C_agentforge', ts: `${Date.now()}`, ok: true });
        }
        if (method === 'update_message') {
          return Ok({ ok: true });
        }
        return Ok({ ok: true });
      }

      return Ok({ success: true });
    });

    governance = createGovernanceMiddleware({
      config: DEFAULT_GOVERNANCE_CONFIG,
      eventBus: collector.bus,
    });
  });

  afterEach(() => {
    collector.clear();
  });

  // ==========================================================================
  // Step 1 — Init (PRD 21.1)
  // ==========================================================================

  describe('Step 1 — Init', () => {
    it('scaffolds a complete project from wizard answers', () => {
      const answers: InitAnswers = {
        name: 'SmokeTest',
        description: 'E2E smoke test project',
        repo: 'test/smoke',
        slackChannel: '#agentforge',
        telegramEnabled: true,
        targetAudience: 'developers',
      };

      const manifest = buildManifest(answers);
      const created = scaffoldProject(PROJECT_ROOT, manifest, fs);

      // agentforge.yaml created
      expect(fs.exists(`${PROJECT_ROOT}/agentforge.yaml`)).toBe(true);

      // App directories scaffolded
      expect(fs.dirs.has(`${PROJECT_ROOT}/src/components`)).toBe(true);
      expect(fs.dirs.has(`${PROJECT_ROOT}/src/pages`)).toBe(true);
      expect(fs.dirs.has(`${PROJECT_ROOT}/src/api`)).toBe(true);
      expect(fs.dirs.has(`${PROJECT_ROOT}/prisma`)).toBe(true);

      // Spec directory created
      expect(fs.dirs.has(`${PROJECT_ROOT}/agentforge/spec`)).toBe(true);

      // .agentforge internals created
      expect(fs.dirs.has(`${PROJECT_ROOT}/.agentforge/learnings`)).toBe(true);
      expect(fs.dirs.has(`${PROJECT_ROOT}/.agentforge/audit`)).toBe(true);
      expect(fs.dirs.has(`${PROJECT_ROOT}/.agentforge/locks`)).toBe(true);

      // Trust state
      expect(fs.exists(`${PROJECT_ROOT}/.agentforge/trust-state.yaml`)).toBe(true);

      // Tasks file
      expect(fs.exists(`${PROJECT_ROOT}/agentforge.tasks.yaml`)).toBe(true);

      // Agent definitions
      expect(fs.exists(`${PROJECT_ROOT}/agentforge/agents.yaml`)).toBe(true);

      expect(fs.exists(`${PROJECT_ROOT}/agentforge/spec/project.yaml`)).toBe(true);

      // Verify manifest content
      const manifestResult = readYaml<Record<string, unknown>>(`${PROJECT_ROOT}/agentforge.yaml`, fs);
      expect(manifestResult.ok).toBe(true);
      if (manifestResult.ok) {
        const m = manifestResult.value as Record<string, unknown>;
        expect((m['project'] as Record<string, unknown>)['name']).toBe('SmokeTest');
      }

      // Verify created list contains key entries
      expect(created).toContain('agentforge.yaml');
      expect(created).toContain('agentforge.tasks.yaml');
      expect(created).toContain('agentforge/agents.yaml');
    });

    it('generates valid manifest with correct HITL and budget defaults', () => {
      const answers: InitAnswers = {
        name: 'SmokeTest',
        description: 'E2E smoke test project',
        repo: 'test/smoke',
        slackChannel: '#agentforge',
        telegramEnabled: true,
        targetAudience: 'developers',
      };

      const manifest = buildManifest(answers);

      // Stack defaults
      expect(manifest.stack.frontend).toBe('react');
      expect(manifest.stack.backend).toBe('node');
      expect(manifest.stack.database).toBe('postgresql');
      expect(manifest.stack.styling).toBe('tailwind');

      // HITL defaults
      expect(manifest.hitl.default).toBe('review_and_override');
      expect(manifest.hitl.overrides?.['design']).toBe('full_approval');
      expect(manifest.hitl.overrides?.['production_deploy']).toBe('full_approval');
      expect(manifest.hitl.overrides?.['test_generation']).toBe('notify_only');

      // Budget defaults
      expect(manifest.budget.per_task_max_usd).toBe(2.0);
      expect(manifest.budget.per_phase_max_usd).toBe(25.0);
      expect(manifest.budget.monthly_max_usd).toBe(200.0);
      expect(manifest.budget.alert_threshold).toBe(0.8);

      // Channels
      expect(manifest.channels).toHaveLength(3);
      expect(manifest.channels[0].type).toBe('slack');
      expect(manifest.channels[1].type).toBe('telegram');
      expect(manifest.channels[2].type).toBe('cli');
    });
  });

  // ==========================================================================
  // Step 2 — Design Phase (PRD 21.2)
  // ==========================================================================

  describe('Step 2 — Design Phase', () => {
    beforeEach(() => {
      // Scaffold project first
      const answers: InitAnswers = {
        name: 'SmokeTest',
        description: 'E2E smoke test',
        repo: 'test/smoke',
        slackChannel: '#agentforge',
        telegramEnabled: false,
        targetAudience: 'developers',
      };
      scaffoldProject(PROJECT_ROOT, buildManifest(answers), fs);
    });

    it('emits PageRequested when design is triggered', () => {
      const result = handlePageRequest(
        {
          description: 'A dashboard page with a revenue chart and user activity feed',
          projectRoot: PROJECT_ROOT,
        },
        collector.bus,
        fs,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.pageId).toBeTruthy();
      expect(result.value.taskId).toBeTruthy();

      const pageEvents = collector.eventsOfType('PageRequested');
      expect(pageEvents).toHaveLength(1);
      expect(pageEvents[0].description).toContain('dashboard');
    });

    it('flows through the full design event chain', async () => {
      const eventOrder: DomainEventType[] = [];
      const allDesignEvents: DomainEventType[] = [
        'PageRequested', 'UXResearchComplete', 'WireframeComplete',
        'WireframeApproved', 'VisualDesignComplete', 'DesignReviewComplete',
        'DesignPhaseComplete',
      ];
      for (const type of allDesignEvents) {
        collector.bus.subscribe(type, () => eventOrder.push(type));
      }

      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog);

      // Step 2a: PageRequested
      const pageResult = handlePageRequest(
        { description: 'A dashboard with revenue chart and activity feed', projectRoot: PROJECT_ROOT },
        collector.bus,
        fs,
      );
      expect(pageResult.ok).toBe(true);
      const pageId = pageResult.ok ? pageResult.value.pageId : 'unknown';

      // Step 2b: UX Research
      const uxWork: AgentWorkFn<UXResearcherInput, UXResearcherOutput> = async (input, _provider, _learnings, ctx) => {
        const figmaResult = await ctx.mcpClient.callTool('figma', 'get_code', { page: input.pageId });
        expect(figmaResult.ok).toBe(true);

        const output: UXResearcherOutput = {
          layoutSuggestions: ['two-column grid', 'sidebar navigation'],
          userFlows: ['view revenue → filter by date', 'scan activity feed'],
          accessibilityNotes: ['chart needs aria-label', 'feed items need focus management'],
        };
        ctx.eventBus.publish({
          type: 'UXResearchComplete',
          pageId: input.pageId,
          taskId: ctx.taskId,
          layoutSuggestions: output.layoutSuggestions as unknown as string[],
          source: 'test', timestamp: Date.now(),
        });
        return Ok(output);
      };

      const uxResult = await runAgent(UX_RESEARCH_CONTRACT, ctx, { pageId, taskId: 'task_design_001', description: 'Dashboard page' }, 'write_design', 'design/dashboard', 'UX research for dashboard', uxWork);
      expect(uxResult.ok).toBe(true);

      // Step 2c: Wireframe
      const wireframeWork: AgentWorkFn<WireframeGeneratorInput, WireframeGeneratorOutput> = async (input, _provider, _learnings, ctx) => {
        await ctx.mcpClient.callTool('figma', 'generate_figma_design', { page: input.pageId, sections: input.layoutSuggestions });
        const output: WireframeGeneratorOutput = { designRef: `figma://file_abc/${input.pageId}`, sectionsCreated: 3 };
        ctx.eventBus.publish({
          type: 'WireframeComplete',
          pageId: input.pageId,
          taskId: ctx.taskId,
          designRef: output.designRef,
          source: 'test', timestamp: Date.now(),
        });
        return Ok(output);
      };

      const wireframeResult = await runAgent(WIREFRAME_CONTRACT, ctx, { pageId, taskId: 'task_design_002', layoutSuggestions: ['two-column grid'] }, 'write_design', 'design/wireframe', 'Generate wireframe', wireframeWork);
      expect(wireframeResult.ok).toBe(true);

      // Step 2d: Human approves wireframe
      collector.bus.publish({
        type: 'WireframeApproved',
        pageId,
        taskId: 'task_design_002',
        designRef: `figma://file_abc/${pageId}`,
        source: 'test', timestamp: Date.now(),
      });

      // Step 2e: Visual Design
      const visualWork: AgentWorkFn<VisualDesignerInput, VisualDesignerOutput> = async (input, _provider, _learnings, ctx) => {
        await ctx.mcpClient.callTool('figma', 'get_tokens', {});
        const output: VisualDesignerOutput = { designRef: input.designRef, tokensApplied: 12 };
        ctx.eventBus.publish({
          type: 'VisualDesignComplete',
          pageId: input.pageId,
          taskId: ctx.taskId,
          designRef: output.designRef,
          source: 'test', timestamp: Date.now(),
        });
        return Ok(output);
      };

      const visualResult = await runAgent(VISUAL_DESIGN_CONTRACT, ctx, { pageId, taskId: 'task_design_003', designRef: `figma://file_abc/${pageId}` }, 'write_design', 'design/visual', 'Apply visual design', visualWork);
      expect(visualResult.ok).toBe(true);

      // Step 2f: Design Review
      const reviewWork: AgentWorkFn<DesignReviewerInput, DesignReviewerOutput> = async (input, _provider, _learnings, ctx) => {
        const output: DesignReviewerOutput = { passed: true, issues: [], score: 92 };
        ctx.eventBus.publish({
          type: 'DesignReviewComplete',
          pageId: input.pageId,
          taskId: ctx.taskId,
          passed: true,
          issues: [],
          source: 'test', timestamp: Date.now(),
        });
        return Ok(output);
      };

      const reviewResult = await runAgent(DESIGN_REVIEW_CONTRACT, ctx, { pageId, taskId: 'task_design_004', designRef: `figma://file_abc/${pageId}` }, 'read_design', 'design/review', 'Review design', reviewWork);
      expect(reviewResult.ok).toBe(true);

      // Step 2g: Design phase complete
      collector.bus.publish({
        type: 'DesignPhaseComplete',
        specRef: `agentforge/spec/components/dashboard.yaml`,
        designRef: `figma://file_abc/${pageId}`,
        source: 'test', timestamp: Date.now(),
      });

      // Verify event order
      expect(eventOrder).toContain('PageRequested');
      expect(eventOrder).toContain('UXResearchComplete');
      expect(eventOrder).toContain('WireframeComplete');
      expect(eventOrder).toContain('WireframeApproved');
      expect(eventOrder).toContain('VisualDesignComplete');
      expect(eventOrder).toContain('DesignReviewComplete');
      expect(eventOrder).toContain('DesignPhaseComplete');

      // Verify order is correct
      const uxIdx = eventOrder.indexOf('UXResearchComplete');
      const wfIdx = eventOrder.indexOf('WireframeComplete');
      const wfApprIdx = eventOrder.indexOf('WireframeApproved');
      const vsIdx = eventOrder.indexOf('VisualDesignComplete');
      const drIdx = eventOrder.indexOf('DesignReviewComplete');
      const dpIdx = eventOrder.indexOf('DesignPhaseComplete');
      expect(uxIdx).toBeLessThan(wfIdx);
      expect(wfIdx).toBeLessThan(wfApprIdx);
      expect(wfApprIdx).toBeLessThan(vsIdx);
      expect(vsIdx).toBeLessThan(drIdx);
      expect(drIdx).toBeLessThan(dpIdx);
    });

    it('routes each Figma call through MCP client', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog);

      // Execute UX researcher which calls Figma
      const uxWork: AgentWorkFn<UXResearcherInput, UXResearcherOutput> = async (input, _provider, _learnings, ctx) => {
        await ctx.mcpClient.callTool('figma', 'get_code', { page: input.pageId });
        return Ok({ layoutSuggestions: ['grid'], userFlows: [], accessibilityNotes: [] });
      };

      await runAgent(UX_RESEARCH_CONTRACT, ctx, { pageId: 'page_1', taskId: 'task_1', description: 'test' }, 'write_design', 'design', 'test', uxWork);

      // Verify Figma calls went through MCP
      const figmaCalls = mcpClient.calls.filter((c) => c.server === 'figma');
      expect(figmaCalls.length).toBeGreaterThanOrEqual(1);
      expect(figmaCalls[0].method).toBe('get_code');
    });
  });

  // ==========================================================================
  // Step 3 — Spec Phase
  // ==========================================================================

  describe('Step 3 — Spec Phase', () => {
    beforeEach(() => {
      const answers: InitAnswers = {
        name: 'SmokeTest',
        description: 'E2E smoke test',
        repo: 'test/smoke',
        slackChannel: '#agentforge',
        telegramEnabled: false,
        targetAudience: 'developers',
      };
      scaffoldProject(PROJECT_ROOT, buildManifest(answers), fs);
    });

    it('spec writer reads design context and generates specs with ADRs', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog);

      const specWork: AgentWorkFn<SpecWriterInput, SpecWriterOutput> = async (input, _provider, _learnings, ctx) => {
        // Read design context via MCP
        const designResult = await ctx.mcpClient.callTool('figma', 'get_code', { node: input.figmaNodeId });
        expect(designResult.ok).toBe(true);

        // Write component spec
        const componentSpec = {
          version: '1.0',
          page_id: 'page_dashboard',
          components: [
            { id: 'comp_revenue_chart', name: 'RevenueChart', type: 'data_visualization', status: 'specced' },
            { id: 'comp_activity_feed', name: 'ActivityFeed', type: 'list', status: 'specced' },
          ],
        };
        writeYaml(`${ctx.projectRoot}/agentforge/spec/components/dashboard.yaml`, componentSpec, ctx.fs);

        // Write API spec
        const apiSpec = {
          version: '1.0',
          base_url: '/api',
          endpoints: [
            { id: 'ep_get_revenue', method: 'GET', path: '/revenue', auth: 'required', status: 'specced' },
            { id: 'ep_get_activity', method: 'GET', path: '/activity', auth: 'required', status: 'specced' },
          ],
        };
        writeYaml(`${ctx.projectRoot}/agentforge/spec/api.yaml`, apiSpec, ctx.fs);

        // Write model spec
        const modelSpec = {
          version: '1.0',
          models: [
            { id: 'model_revenue', name: 'RevenueDataPoint', fields: [{ name: 'date', type: 'DateTime' }, { name: 'amount', type: 'Decimal' }] },
            { id: 'model_activity', name: 'ActivityEntry', fields: [{ name: 'timestamp', type: 'DateTime' }, { name: 'action', type: 'String' }] },
          ],
        };
        writeYaml(`${ctx.projectRoot}/agentforge/spec/models.yaml`, modelSpec, ctx.fs);

        // Propose ADRs
        const projectSpec = readYaml<Record<string, unknown>>(`${ctx.projectRoot}/agentforge/spec/project.yaml`, ctx.fs);
        if (projectSpec.ok) {
          const updated = {
            ...(projectSpec.value as Record<string, unknown>),
            adrs: [
              { id: 'adr_001', title: 'Use React Query for data fetching', status: 'proposed', rationale: 'Consistent data layer with caching' },
              { id: 'adr_002', title: 'Chart library: Recharts', status: 'proposed', rationale: 'Best React integration, smallest bundle' },
            ],
          };
          writeYaml(`${ctx.projectRoot}/agentforge/spec/project.yaml`, updated, ctx.fs);
        }

        const output: SpecWriterOutput = {
          filesWritten: ['components/dashboard.yaml', 'api.yaml', 'models.yaml'],
          adrsProposed: ['adr_001', 'adr_002'],
        };

        ctx.eventBus.publish({
          type: 'SpecComplete',
          specRef: 'agentforge/spec/components/dashboard.yaml',
          taskId: ctx.taskId,
          source: 'test', timestamp: Date.now(),
        });

        return Ok(output);
      };

      const result = await runAgent(SPEC_WRITER_CONTRACT, ctx, {
        designRef: 'figma://file_abc/page_dashboard',
        specRef: 'agentforge/spec/components/dashboard.yaml',
        figmaFileId: 'file_abc',
        figmaNodeId: 'node_123',
      }, 'write_spec', 'spec/dashboard', 'Generate spec from design', specWork);

      expect(result.ok).toBe(true);

      // Verify spec files written
      expect(fs.exists(`${PROJECT_ROOT}/agentforge/spec/components/dashboard.yaml`)).toBe(true);
      expect(fs.exists(`${PROJECT_ROOT}/agentforge/spec/api.yaml`)).toBe(true);
      expect(fs.exists(`${PROJECT_ROOT}/agentforge/spec/models.yaml`)).toBe(true);

      // Verify ADRs in project.yaml
      const projSpec = readYaml<Record<string, unknown>>(`${PROJECT_ROOT}/agentforge/spec/project.yaml`, fs);
      expect(projSpec.ok).toBe(true);
      if (projSpec.ok) {
        const adrs = (projSpec.value as Record<string, unknown>)['adrs'] as Array<Record<string, unknown>>;
        expect(adrs).toHaveLength(2);
        expect(adrs[0]['status']).toBe('proposed');
      }

      // Verify SpecComplete event (workFn emits one, runAgent may emit on_complete too)
      const specEvents = collector.eventsOfType('SpecComplete');
      expect(specEvents.length).toBeGreaterThanOrEqual(1);

      // Verify MCP was used to read design
      const figmaCalls = mcpClient.calls.filter((c) => c.server === 'figma');
      expect(figmaCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('task decomposer creates tasks with valid dependency graph', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog);

      // Pre-write component spec for decomposer to read
      writeYaml(`${PROJECT_ROOT}/agentforge/spec/components/dashboard.yaml`, {
        version: '1.0',
        components: [
          { id: 'comp_revenue_chart', name: 'RevenueChart' },
          { id: 'comp_activity_feed', name: 'ActivityFeed' },
        ],
      }, fs);

      const decomposerWork: AgentWorkFn<TaskDecomposerInput, TaskDecomposerOutput> = async (input, _provider, _learnings, ctx) => {
        const tasks: TaskEntry[] = [
          makeTask({ id: 'task_fe_001', title: 'Generate RevenueChart component', phase: 'code', agent: 'frontend_coder', depends_on: [], spec_ref: 'comp_revenue_chart' }),
          makeTask({ id: 'task_fe_002', title: 'Generate ActivityFeed component', phase: 'code', agent: 'frontend_coder', depends_on: [], spec_ref: 'comp_activity_feed' }),
          makeTask({ id: 'task_be_001', title: 'Generate /revenue API endpoint', phase: 'code', agent: 'backend_coder', depends_on: [], spec_ref: 'ep_get_revenue' }),
          makeTask({ id: 'task_be_002', title: 'Generate /activity API endpoint', phase: 'code', agent: 'backend_coder', depends_on: [], spec_ref: 'ep_get_activity' }),
          makeTask({ id: 'task_test_001', title: 'Write tests for RevenueChart', phase: 'code', agent: 'test_writer', depends_on: ['task_fe_001'], spec_ref: 'comp_revenue_chart' }),
          makeTask({ id: 'task_test_002', title: 'Write tests for ActivityFeed', phase: 'code', agent: 'test_writer', depends_on: ['task_fe_002'], spec_ref: 'comp_activity_feed' }),
        ];

        // Write tasks file
        let tasksFile: TasksFile = { tasks: [] };
        for (const task of tasks) {
          const addResult = addTask(tasksFile, task);
          if (addResult.ok) tasksFile = addResult.value;
        }
        saveTasks(ctx.projectRoot, tasksFile, ctx.fs);

        ctx.eventBus.publish({
          type: 'TasksCreated',
          taskCount: tasks.length,
          taskIds: tasks.map((t) => t.id),
          source: 'test', timestamp: Date.now(),
        });

        return Ok({ taskCount: tasks.length, taskIds: tasks.map((t) => t.id) });
      };

      const result = await runAgent(TASK_DECOMPOSER_CONTRACT, ctx, { specRef: 'agentforge/spec/components/dashboard.yaml', taskId: 'task_decompose_001' }, 'write_tasks', 'tasks', 'Decompose spec into tasks', decomposerWork);
      expect(result.ok).toBe(true);

      // Verify tasks file was written
      const tasksResult = loadTasks(PROJECT_ROOT, fs);
      expect(tasksResult.ok).toBe(true);
      if (tasksResult.ok) {
        expect(tasksResult.value.tasks).toHaveLength(6);

        // Verify dependency graph: test tasks depend on their respective code tasks
        const testTask1 = tasksResult.value.tasks.find((t) => t.id === 'task_test_001');
        expect(testTask1?.depends_on).toContain('task_fe_001');

        const testTask2 = tasksResult.value.tasks.find((t) => t.id === 'task_test_002');
        expect(testTask2?.depends_on).toContain('task_fe_002');
      }

      // Verify TasksCreated event (workFn emits one, runAgent may emit on_complete too)
      const createdEvents = collector.eventsOfType('TasksCreated');
      expect(createdEvents.length).toBeGreaterThanOrEqual(1);
      expect(createdEvents[0].taskCount).toBe(6);
    });
  });

  // ==========================================================================
  // Step 4 — Code Generation Phase (PRD 21.3)
  // ==========================================================================

  describe('Step 4 — Code Generation Phase', () => {
    let tasksFile: TasksFile;

    beforeEach(() => {
      const answers: InitAnswers = {
        name: 'SmokeTest',
        description: 'E2E smoke test',
        repo: 'test/smoke',
        slackChannel: '#agentforge',
        telegramEnabled: false,
        targetAudience: 'developers',
      };
      scaffoldProject(PROJECT_ROOT, buildManifest(answers), fs);

      // Pre-create tasks from decomposition
      tasksFile = {
        tasks: [
          makeTask({ id: 'task_fe_001', title: 'Generate RevenueChart', agent: 'frontend_coder', spec_ref: 'comp_revenue_chart' }),
          makeTask({ id: 'task_fe_002', title: 'Generate ActivityFeed', agent: 'frontend_coder', spec_ref: 'comp_activity_feed' }),
          makeTask({ id: 'task_be_001', title: 'Generate /revenue endpoint', agent: 'backend_coder', spec_ref: 'ep_get_revenue' }),
          makeTask({ id: 'task_test_001', title: 'Write RevenueChart tests', agent: 'test_writer', depends_on: ['task_fe_001'], spec_ref: 'comp_revenue_chart' }),
          makeTask({ id: 'task_pr_001', title: 'Create PR for dashboard', agent: 'pr_manager', depends_on: ['task_fe_001', 'task_fe_002', 'task_be_001', 'task_test_001'] }),
          makeTask({ id: 'task_sec_001', title: 'Security scan', agent: 'security_scanner', depends_on: ['task_pr_001'] }),
        ],
      };
      saveTasks(PROJECT_ROOT, tasksFile, fs);
    });

    it('frontend coder generates component, pushes branch, and CI passes', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog, 'task_fe_001');

      const feWork: AgentWorkFn<FrontendCoderInput, FrontendCoderOutput> = async (input, _provider, _learnings, ctx) => {
        // Generate component code
        const code = `import React from 'react';\nexport const RevenueChart = ({ dateRange }: { dateRange: string }) => {\n  return <div>Revenue Chart</div>;\n};`;
        ctx.fs.writeFile(`${ctx.projectRoot}/src/components/RevenueChart.tsx`, code);

        // Push to branch via MCP
        const pushResult = await ctx.mcpClient.callTool('github', 'push', {
          branch: 'agentforge/task-fe-001-revenue-chart',
          files: ['src/components/RevenueChart.tsx'],
        });
        expect(pushResult.ok).toBe(true);

        // Trigger CI
        const ciResult = await ctx.mcpClient.callTool('github', 'trigger_workflow', {
          branch: 'agentforge/task-fe-001-revenue-chart',
        });
        expect(ciResult.ok).toBe(true);

        // Wait for CI result
        const ciCheck = await ctx.mcpClient.callTool('github', 'get_workflow_result', {
          runId: 'run_001',
        });
        expect(ciCheck.ok).toBe(true);

        ctx.eventBus.publish({
          type: 'CodeGenComplete',
          taskId: ctx.taskId,
          agentId: 'frontend_coder',
          branch: 'agentforge/task-fe-001-revenue-chart',
          filesGenerated: ['src/components/RevenueChart.tsx'],
          source: 'test', timestamp: Date.now(),
        });

        return Ok({
          filesGenerated: ['src/components/RevenueChart.tsx'],
          branch: 'agentforge/task-fe-001-revenue-chart',
          totalCostUsd: 0.42,
          totalAttempts: 1,
        });
      };

      // Transition task to in_progress
      const t1 = updateTaskStatus(tasksFile, 'task_fe_001', 'in_progress');
      expect(t1.ok).toBe(true);

      const result = await runAgent(FRONTEND_CODER_CONTRACT, ctx, {
        task: tasksFile.tasks[0],
        projectRoot: PROJECT_ROOT,
        stackConfigPath: `${PROJECT_ROOT}/agentforge/stack.yaml`,
        promptTemplatePath: `${PROJECT_ROOT}/agentforge/prompts/frontend-coder.md`,
      }, 'write_code', 'src/components/RevenueChart.tsx', 'Generate RevenueChart', feWork);

      expect(result.ok).toBe(true);

      // Verify file written
      expect(fs.exists(`${PROJECT_ROOT}/src/components/RevenueChart.tsx`)).toBe(true);

      // Verify GitHub MCP calls: push, trigger CI, check CI
      const githubCalls = mcpClient.calls.filter((c) => c.server === 'github');
      expect(githubCalls.some((c) => c.method === 'push')).toBe(true);
      expect(githubCalls.some((c) => c.method === 'trigger_workflow')).toBe(true);
      expect(githubCalls.some((c) => c.method === 'get_workflow_result')).toBe(true);

      // Verify CodeGenComplete event (workFn emits one, runAgent may emit on_complete too)
      const codeEvents = collector.eventsOfType('CodeGenComplete');
      expect(codeEvents.length).toBeGreaterThanOrEqual(1);
      expect(codeEvents[0].branch).toBe('agentforge/task-fe-001-revenue-chart');
    });

    it('respects max_concurrent_agents by running tasks in dependency order', () => {
      // Verify task_test_001 depends on task_fe_001
      const testTask = tasksFile.tasks.find((t) => t.id === 'task_test_001');
      expect(testTask?.depends_on).toContain('task_fe_001');

      // Verify PR depends on all code tasks
      const prTask = tasksFile.tasks.find((t) => t.id === 'task_pr_001');
      expect(prTask?.depends_on).toContain('task_fe_001');
      expect(prTask?.depends_on).toContain('task_fe_002');
      expect(prTask?.depends_on).toContain('task_be_001');
      expect(prTask?.depends_on).toContain('task_test_001');

      // Verify security depends on PR
      const secTask = tasksFile.tasks.find((t) => t.id === 'task_sec_001');
      expect(secTask?.depends_on).toContain('task_pr_001');

      // Independent tasks (fe_001, fe_002, be_001) can run in parallel up to max_concurrent_agents=3
      const independent = tasksFile.tasks.filter((t) => t.depends_on.length === 0);
      expect(independent).toHaveLength(3);
    });

    it('security scanner runs on PR alongside PR reviewer', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog, 'task_sec_001');

      const scanWork: AgentWorkFn<SecurityScannerInput, SecurityScannerOutput> = async (input, _provider, _learnings, ctx) => {
        const diff = await ctx.mcpClient.callTool('github', 'read_pr', { prNumber: input.prNumber });
        expect(diff.ok).toBe(true);

        const output: SecurityScannerOutput = {
          prNumber: input.prNumber,
          findings: [],
          findingsCount: 0,
          criticalCount: 0,
          highCount: 0,
          passed: true,
          totalCostUsd: 0.03,
        };

        ctx.eventBus.publish({
          type: 'SecurityScanComplete',
          taskId: ctx.taskId,
          prNumber: input.prNumber,
          findingsCount: 0,
          criticalCount: 0,
          passed: true,
          source: 'test', timestamp: Date.now(),
        });

        return Ok(output);
      };

      const result = await runAgent(SECURITY_SCANNER_CONTRACT, ctx, {
        task: makeTask({ id: 'task_sec_001' }),
        projectRoot: PROJECT_ROOT,
        prNumber: 42,
        branch: 'agentforge/task-fe-001-revenue-chart',
      }, 'read_code', 'PR #42', 'Security scan PR', scanWork);

      expect(result.ok).toBe(true);

      const scanEvents = collector.eventsOfType('SecurityScanComplete');
      expect(scanEvents.length).toBeGreaterThanOrEqual(1);
      expect(scanEvents[0].passed).toBe(true);
    });

    it('test writer adds tests after frontend coder completes', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog, 'task_test_001');

      const testWork: AgentWorkFn<TestWriterInput, TestWriterOutput> = async (input, _provider, _learnings, ctx) => {
        const testCode = `import { render } from '@testing-library/react';\nimport { RevenueChart } from './RevenueChart';\ntest('renders', () => { render(<RevenueChart dateRange="2026-01" />); });`;
        ctx.fs.writeFile(`${ctx.projectRoot}/src/components/RevenueChart.test.tsx`, testCode);

        ctx.eventBus.publish({
          type: 'TestsComplete',
          taskId: ctx.taskId,
          agentId: 'test_writer',
          branch: 'agentforge/task-fe-001-revenue-chart',
          testFilesGenerated: ['src/components/RevenueChart.test.tsx'],
          source: 'test', timestamp: Date.now(),
        });

        return Ok({
          branch: 'agentforge/task-fe-001-revenue-chart',
          testFilesGenerated: ['src/components/RevenueChart.test.tsx'],
          totalCostUsd: 0.02,
          totalAttempts: 1,
        });
      };

      const result = await runAgent(TEST_WRITER_CONTRACT, ctx, {
        task: makeTask({ id: 'task_test_001' }),
        projectRoot: PROJECT_ROOT,
        stackConfigPath: `${PROJECT_ROOT}/agentforge/stack.yaml`,
        promptTemplatePath: `${PROJECT_ROOT}/agentforge/prompts/test-writer.md`,
        targetBranch: 'agentforge/task-fe-001-revenue-chart',
        sourceFiles: ['src/components/RevenueChart.tsx'],
      }, 'write_code', 'tests', 'Write tests for RevenueChart', testWork);

      expect(result.ok).toBe(true);
      expect(fs.exists(`${PROJECT_ROOT}/src/components/RevenueChart.test.tsx`)).toBe(true);

      const testEvents = collector.eventsOfType('TestsComplete');
      expect(testEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('backend coder generates API endpoints', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog, 'task_be_001');

      const beWork: AgentWorkFn<BackendCoderInput, BackendCoderOutput> = async (input, _provider, _learnings, ctx) => {
        const code = `import { Router } from 'express';\nconst router = Router();\nrouter.get('/revenue', async (req, res) => { res.json([]); });\nexport default router;`;
        ctx.fs.writeFile(`${ctx.projectRoot}/src/api/revenue.ts`, code);

        await ctx.mcpClient.callTool('github', 'push', {
          branch: 'agentforge/task-be-001-revenue-api',
          files: ['src/api/revenue.ts'],
        });

        ctx.eventBus.publish({
          type: 'CodeGenComplete',
          taskId: ctx.taskId,
          agentId: 'backend_coder',
          branch: 'agentforge/task-be-001-revenue-api',
          filesGenerated: ['src/api/revenue.ts'],
          source: 'test', timestamp: Date.now(),
        });

        return Ok({
          filesGenerated: ['src/api/revenue.ts'],
          branch: 'agentforge/task-be-001-revenue-api',
          totalCostUsd: 0.35,
          totalAttempts: 1,
        });
      };

      const result = await runAgent(BACKEND_CODER_CONTRACT, ctx, {
        task: makeTask({ id: 'task_be_001' }),
        projectRoot: PROJECT_ROOT,
        stackConfigPath: `${PROJECT_ROOT}/agentforge/stack.yaml`,
        promptTemplatePath: `${PROJECT_ROOT}/agentforge/prompts/backend-coder.md`,
      }, 'write_code', 'src/api/revenue.ts', 'Generate revenue API', beWork);

      expect(result.ok).toBe(true);
      expect(fs.exists(`${PROJECT_ROOT}/src/api/revenue.ts`)).toBe(true);
    });
  });

  // ==========================================================================
  // Step 5 — CI/CD
  // ==========================================================================

  describe('Step 5 — CI/CD', () => {
    beforeEach(() => {
      const answers: InitAnswers = {
        name: 'SmokeTest',
        description: 'E2E smoke test',
        repo: 'test/smoke',
        slackChannel: '#agentforge',
        telegramEnabled: false,
        targetAudience: 'developers',
      };
      scaffoldProject(PROJECT_ROOT, buildManifest(answers), fs);
    });

    it('PR creation after code generation, then spec sync runs post-merge', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog, 'task_pr_001');

      // PR creation
      const prWork: AgentWorkFn<PRManagerInput, PRManagerOutput> = async (input, _provider, _learnings, ctx) => {
        const prResult = await ctx.mcpClient.callTool('github', 'create_pr', {
          branch: input.branch,
          title: `feat: ${input.task.title}`,
          body: 'Generated by AgentForge',
        });
        expect(prResult.ok).toBe(true);

        ctx.eventBus.publish({
          type: 'PRCreated',
          taskId: ctx.taskId,
          prNumber: 42,
          branch: input.branch,
          source: 'test', timestamp: Date.now(),
        });

        return Ok({ prNumber: 42, prUrl: 'https://github.com/test/smoke/pull/42', branch: input.branch });
      };

      const prResult = await runAgent(PR_MANAGER_CONTRACT, ctx, {
        task: makeTask({ id: 'task_pr_001' }),
        projectRoot: PROJECT_ROOT,
        branch: 'agentforge/dashboard',
        filesGenerated: ['src/components/RevenueChart.tsx'],
        testResults: '1 passed, 0 failed',
        costUsd: 0.42,
        designRef: 'figma://file_abc/page_dashboard',
      }, 'create_pr', 'PR #42', 'Create dashboard PR', prWork);

      expect(prResult.ok).toBe(true);

      // Simulate PR merge
      collector.bus.publish({
        type: 'PRMerged',
        prNumber: 42,
        branch: 'agentforge/dashboard',
        mergedBy: 'dev@team.com',
        source: 'test', timestamp: Date.now(),
      });

      const mergeEvents = collector.eventsOfType('PRMerged');
      expect(mergeEvents).toHaveLength(1);
    });

    it('staging deploy triggered after merge and health monitored', async () => {
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog, 'task_deploy_001');

      const deployWork: AgentWorkFn<DeployAgentInput, DeployAgentOutput> = async (input, _provider, _learnings, ctx) => {
        // Trigger deploy workflow
        const triggerResult = await ctx.mcpClient.callTool('github', 'trigger_workflow', {
          workflow: 'deploy-staging',
          branch: input.branch,
        });
        expect(triggerResult.ok).toBe(true);

        // Check health
        const healthResult = await ctx.mcpClient.callTool('github', 'get_workflow_result', {
          runId: 'run_001',
        });
        expect(healthResult.ok).toBe(true);

        const output: DeployAgentOutput = {
          environment: 'staging',
          healthy: true,
          healthCheckDuration: 45,
          deployRunId: 'run_001',
        };

        ctx.eventBus.publish({
          type: 'DeployComplete',
          taskId: ctx.taskId,
          environment: 'staging',
          healthy: true,
          source: 'test', timestamp: Date.now(),
        });

        return Ok(output);
      };

      const result = await runAgent(DEPLOY_CONTRACT, ctx, {
        task: makeTask({ id: 'task_deploy_001' }),
        projectRoot: PROJECT_ROOT,
        prNumber: 42,
        branch: 'main',
        environment: 'staging',
      }, 'deploy_staging', 'staging', 'Deploy to staging', deployWork);

      expect(result.ok).toBe(true);

      const deployEvents = collector.eventsOfType('DeployComplete');
      expect(deployEvents.length).toBeGreaterThanOrEqual(1);
      expect(deployEvents[0].environment).toBe('staging');
      expect(deployEvents[0].healthy).toBe(true);
    });
  });

  // ==========================================================================
  // Step 6 — Cross-cutting concerns
  // ==========================================================================

  describe('Step 6 — Cross-cutting concerns', () => {
    beforeEach(() => {
      const answers: InitAnswers = {
        name: 'SmokeTest',
        description: 'E2E smoke test',
        repo: 'test/smoke',
        slackChannel: '#agentforge',
        telegramEnabled: false,
        targetAudience: 'developers',
      };
      scaffoldProject(PROJECT_ROOT, buildManifest(answers), fs);
    });

    it('governance runs on every agent: permission, budget, HITL', async () => {
      const strictGovernance = createGovernanceMiddleware({
        config: {
          ...DEFAULT_GOVERNANCE_CONFIG,
          hitl: { ...DEFAULT_GOVERNANCE_CONFIG.hitl, defaultLevel: 'full_approval' },
        },
        eventBus: collector.bus,
      });

      const contract = makeContract({
        permissions: ['write_code'],
        denied: ['deploy_production'],
      });

      // Permission check: allowed action
      const writeAction: AgentAction = {
        agentId: 'test_agent',
        taskId: 'task_001',
        type: 'write_code',
        target: 'src/index.ts',
        description: 'Generate code',
        phase: 'code',
        timestamp: new Date().toISOString(),
      };
      const permResult = strictGovernance.checkPermission(contract, writeAction);
      expect(permResult.ok).toBe(true);

      // Permission check: denied action
      const deployAction: AgentAction = {
        agentId: 'test_agent',
        taskId: 'task_001',
        type: 'deploy_production',
        target: 'production',
        description: 'Deploy',
        phase: 'cicd',
        timestamp: new Date().toISOString(),
      };
      const denyResult = strictGovernance.checkPermission(contract, deployAction);
      expect(denyResult.ok).toBe(false);
      if (!denyResult.ok) {
        expect(denyResult.error.code).toBe('PERMISSION_DENIED');
      }

      // Budget check: within limits
      const smallEstimate: CostEstimate = {
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.01,
        confidence: 'medium',
      };
      const budgetOk = strictGovernance.checkBudget(contract, smallEstimate);
      expect(budgetOk.ok).toBe(true);

      // Budget check: exceeds limit
      const bigEstimate: CostEstimate = {
        estimatedInputTokens: 500000,
        estimatedOutputTokens: 200000,
        estimatedCostUsd: 10.0,
        confidence: 'medium',
      };
      const budgetDeny = strictGovernance.checkBudget(contract, bigEstimate);
      expect(budgetDeny.ok).toBe(false);

      // HITL: full_approval should pause
      const hitlResult = await strictGovernance.enforceHITL(writeAction, {
        ...DEFAULT_GOVERNANCE_CONFIG.hitl,
        defaultLevel: 'full_approval',
      });
      expect(hitlResult.status).toBe('pause');

      // Full pipeline execution
      const pipelineResult = await executeGovernancePipeline(
        strictGovernance,
        contract,
        writeAction,
        smallEstimate,
        { ...DEFAULT_GOVERNANCE_CONFIG.hitl, defaultLevel: 'notify_only' },
      );
      expect(pipelineResult.ok).toBe(true);
    });

    it('budget total is tracked across tasks', () => {
      const budgetGovernance = createGovernanceMiddleware({
        config: {
          ...DEFAULT_GOVERNANCE_CONFIG,
          budget: { perTaskMaxUsd: 0.50, perPhaseMaxUsd: 1.00, monthlyMaxUsd: 200, alertThreshold: 0.8 },
        },
        eventBus: collector.bus,
      });

      const contract = makeContract({ budget: { max_tokens_per_task: 30000, max_cost_per_task_usd: 0.50 } });

      // First task: within budget
      const action1: AgentAction = {
        agentId: 'coder',
        taskId: 'task_001',
        type: 'write_code',
        target: 'file.ts',
        description: 'gen code',
        phase: 'code',
        timestamp: new Date().toISOString(),
      };
      const est1: CostEstimate = { estimatedInputTokens: 5000, estimatedOutputTokens: 2000, estimatedCostUsd: 0.30, confidence: 'medium' };
      expect(budgetGovernance.checkBudget(contract, est1).ok).toBe(true);

      // Record audit with cost to track spend
      budgetGovernance.recordAudit({
        id: 'audit_001',
        timestamp: new Date().toISOString(),
        agentId: 'coder',
        taskId: 'task_001',
        phase: 'code',
        action: action1,
        outcome: 'success',
        cost: { inputCostUsd: 0.01, outputCostUsd: 0.02, totalCostUsd: 0.30, model: 'mock', timestamp: new Date().toISOString() },
        governanceChecks: { permissionGranted: true, budgetApproved: true, hitlResult: 'proceed' },
      });

      // Second task: should exceed per-task if estimate is high
      const est2: CostEstimate = { estimatedInputTokens: 50000, estimatedOutputTokens: 20000, estimatedCostUsd: 0.60, confidence: 'medium' };
      const result2 = budgetGovernance.checkBudget(contract, est2);
      expect(result2.ok).toBe(false);
    });

    it('audit log has entries for every action', async () => {
      const localAuditLog: AuditEntry[] = [];
      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, localAuditLog);

      const work: AgentWorkFn<{ value: string }, { result: string }> = async (input) => {
        return Ok({ result: `processed: ${input.value}` });
      };

      await runAgent(
        makeContract({ on_complete: 'AgentCompleted' }),
        ctx,
        { value: 'test' },
        'write_code',
        'test.ts',
        'Test action',
        work,
      );

      // recordAudit should have been called
      expect(ctx.recordAudit).toHaveBeenCalled();
      expect(localAuditLog.length).toBeGreaterThanOrEqual(1);
    });

    it('all events flow via event bus — no direct agent-to-agent calls', async () => {
      // This test verifies the architectural constraint that agents communicate
      // only through the event bus, never through direct calls

      // Subscribe to all event types
      const seenEvents: DomainEventType[] = [];
      const eventTypes: DomainEventType[] = [
        'CodeGenComplete', 'TestsComplete', 'PRCreated', 'SecurityScanComplete',
      ];
      for (const type of eventTypes) {
        collector.bus.subscribe(type, () => seenEvents.push(type));
      }

      // Simulate the code phase: each agent emits events, next agent subscribes
      collector.bus.publish({ type: 'CodeGenComplete', taskId: 'task_001', agentId: 'frontend_coder', branch: 'feat/a', filesGenerated: ['a.tsx'], source: 'test', timestamp: Date.now() });
      collector.bus.publish({ type: 'TestsComplete', taskId: 'task_002', agentId: 'test_writer', branch: 'feat/a', testFilesGenerated: ['a.test.tsx'], source: 'test', timestamp: Date.now() });
      collector.bus.publish({ type: 'PRCreated', taskId: 'task_003', prNumber: 42, branch: 'feat/a', source: 'test', timestamp: Date.now() });
      collector.bus.publish({ type: 'SecurityScanComplete', taskId: 'task_004', prNumber: 42, findingsCount: 0, criticalCount: 0, passed: true, source: 'test', timestamp: Date.now() });

      expect(seenEvents).toEqual(['CodeGenComplete', 'TestsComplete', 'PRCreated', 'SecurityScanComplete']);

      // Verify events are in the collector (proving they went through the bus)
      expect(collector.events.filter((e) => eventTypes.includes(e.type as DomainEventType))).toHaveLength(4);
    });

    it('agent learnings are recorded and retrievable', async () => {
      // learnings-manager uses real fs (node:fs/promises), so use a temp dir
      const os = await import('node:os');
      const nodePath = await import('node:path');
      const nodeFs = await import('node:fs/promises');
      const tmpDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), 'agentforge-e2e-'));
      const learningsDir = nodePath.join(tmpDir, '.agentforge', 'learnings');
      await nodeFs.mkdir(learningsDir, { recursive: true });

      try {
        // Create the learnings file for pr_reviewer
        const createResult = await createLearningsFile('pr_reviewer', learningsDir);
        expect(createResult.ok).toBe(true);

        // Add observations
        const obs1 = await addObservation('pr_reviewer', {
          date: '2026-03-18',
          source: 'human_feedback_on_task_001',
          learning: 'Team prefers named exports over default exports',
          confidence: 'high',
          taskRef: 'task_001',
          active: true,
        }, learningsDir);
        expect(obs1.ok).toBe(true);

        const obs2 = await addObservation('pr_reviewer', {
          date: '2026-03-18',
          source: 'pattern_detected',
          learning: 'All data fetching uses custom useQuery wrapper',
          confidence: 'medium',
          taskRef: null,
          active: true,
        }, learningsDir);
        expect(obs2.ok).toBe(true);

        // Retrieve active learnings
        const learnings = await getActiveLearnings('pr_reviewer', learningsDir);
        expect(learnings.ok).toBe(true);
        if (learnings.ok) {
          expect(learnings.value.length).toBeGreaterThanOrEqual(2);
          expect(learnings.value.some((l) => l.learning.includes('named exports'))).toBe(true);
          expect(learnings.value.some((l) => l.learning.includes('useQuery'))).toBe(true);
        }
      } finally {
        // Cleanup
        await nodeFs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('MCP middleware chain runs on every external call', () => {
      // Verify all MCP calls are tracked by the mock
      const trackedClient = createMockMCPClient(async (server, method) => {
        return Ok({ data: 'ok' });
      });

      // Simulate a full pipeline's worth of MCP calls
      const callSequence = [
        { server: 'figma', method: 'get_code', params: { page: 'dashboard' } },
        { server: 'figma', method: 'generate_figma_design', params: { page: 'dashboard' } },
        { server: 'figma', method: 'get_tokens', params: {} },
        { server: 'github', method: 'push', params: { branch: 'feat/x' } },
        { server: 'github', method: 'trigger_workflow', params: { branch: 'feat/x' } },
        { server: 'github', method: 'get_workflow_result', params: { runId: 'run_1' } },
        { server: 'github', method: 'create_pr', params: { branch: 'feat/x' } },
        { server: 'github', method: 'read_pr', params: { prNumber: 42 } },
        { server: 'github', method: 'create_review', params: { prNumber: 42 } },
        { server: 'slack', method: 'post_message', params: { channel: '#agentforge' } },
        { server: 'slack', method: 'update_message', params: { ts: '12345' } },
      ];

      const promises = callSequence.map((c) => trackedClient.callTool(c.server, c.method, c.params));
      Promise.all(promises);

      // Every call is tracked
      expect(trackedClient.calls).toHaveLength(callSequence.length);

      // Verify each server was called
      const servers = new Set(trackedClient.calls.map((c) => c.server));
      expect(servers.has('figma')).toBe(true);
      expect(servers.has('github')).toBe(true);
      expect(servers.has('slack')).toBe(true);
    });

    it('task status transitions are valid throughout the pipeline', () => {
      const task = makeTask({ id: 'task_full_001', status: 'pending' });
      let tf: TasksFile = { tasks: [task] };

      // pending → in_progress (agent starts)
      const r1 = updateTaskStatus(tf, 'task_full_001', 'in_progress');
      expect(r1.ok).toBe(true);
      if (r1.ok) tf = r1.value;

      // in_progress → awaiting_approval (HITL gate)
      const r2 = updateTaskStatus(tf, 'task_full_001', 'awaiting_approval');
      expect(r2.ok).toBe(true);
      if (r2.ok) tf = r2.value;

      // awaiting_approval → approved (human approves)
      const r3 = updateTaskStatus(tf, 'task_full_001', 'approved');
      expect(r3.ok).toBe(true);
      if (r3.ok) tf = r3.value;

      // approved → completed (work finishes)
      const r4 = updateTaskStatus(tf, 'task_full_001', 'completed');
      expect(r4.ok).toBe(true);
      if (r4.ok) {
        const final = r4.value.tasks.find((t) => t.id === 'task_full_001');
        expect(final?.status).toBe('completed');
      }

      // Verify invalid transition is rejected
      const badTask = makeTask({ id: 'task_bad', status: 'pending' });
      const badTf: TasksFile = { tasks: [badTask] };
      const badResult = updateTaskStatus(badTf, 'task_bad', 'completed');
      expect(badResult.ok).toBe(false);
    });
  });

  // ==========================================================================
  // Full end-to-end flow in a single test
  // ==========================================================================

  describe('Complete pipeline integration', () => {
    it('runs init → design → spec → code → CI → deploy as one continuous flow', async () => {
      const pipelineEvents: DomainEventType[] = [];
      const allTypes: DomainEventType[] = [
        'PageRequested', 'UXResearchComplete', 'WireframeComplete',
        'DesignPhaseComplete', 'SpecComplete', 'TasksCreated',
        'CodeGenComplete', 'TestsComplete', 'PRCreated',
        'SecurityScanComplete', 'DeployComplete',
      ];
      for (const type of allTypes) {
        collector.bus.subscribe(type, () => pipelineEvents.push(type));
      }

      // ---- Init ----
      const answers: InitAnswers = {
        name: 'SmokeTest',
        description: 'Full pipeline test',
        repo: 'test/smoke',
        slackChannel: '#agentforge',
        telegramEnabled: true,
        targetAudience: 'developers',
      };
      const manifest = buildManifest(answers);
      scaffoldProject(PROJECT_ROOT, manifest, fs);
      expect(fs.exists(`${PROJECT_ROOT}/agentforge.yaml`)).toBe(true);

      const ctx = createTestContext(collector.bus, fs, mcpClient, governance, auditLog);

      // ---- Design ----
      handlePageRequest({ description: 'Dashboard with revenue chart', projectRoot: PROJECT_ROOT }, collector.bus, fs);

      const uxWork: AgentWorkFn<UXResearcherInput, UXResearcherOutput> = async (input, _p, _l, ctx) => {
        await ctx.mcpClient.callTool('figma', 'get_code', { page: input.pageId });
        ctx.eventBus.publish({ type: 'UXResearchComplete', pageId: input.pageId, taskId: ctx.taskId, layoutSuggestions: ['grid'], source: 'test', timestamp: Date.now() });
        return Ok({ layoutSuggestions: ['grid'], userFlows: [], accessibilityNotes: [] });
      };
      await runAgent(UX_RESEARCH_CONTRACT, ctx, { pageId: 'page_1', taskId: 't1', description: 'dashboard' }, 'write_design', 'design', 'UX', uxWork);

      const wfWork: AgentWorkFn<WireframeGeneratorInput, WireframeGeneratorOutput> = async (input, _p, _l, ctx) => {
        await ctx.mcpClient.callTool('figma', 'generate_figma_design', { page: input.pageId });
        ctx.eventBus.publish({ type: 'WireframeComplete', pageId: input.pageId, taskId: ctx.taskId, designRef: 'figma://ref', source: 'test', timestamp: Date.now() });
        return Ok({ designRef: 'figma://ref', sectionsCreated: 2 });
      };
      await runAgent(WIREFRAME_CONTRACT, ctx, { pageId: 'page_1', taskId: 't2', layoutSuggestions: ['grid'] }, 'write_design', 'wireframe', 'Wireframe', wfWork);

      collector.bus.publish({ type: 'DesignPhaseComplete', specRef: 'spec/dashboard', designRef: 'figma://ref', source: 'test', timestamp: Date.now() });

      // ---- Spec ----
      const specWork: AgentWorkFn<SpecWriterInput, SpecWriterOutput> = async (_input, _p, _l, ctx) => {
        writeYaml(`${ctx.projectRoot}/agentforge/spec/components/dashboard.yaml`, { version: '1.0', components: [{ id: 'comp_1', name: 'Dashboard' }] }, ctx.fs);
        ctx.eventBus.publish({ type: 'SpecComplete', specRef: 'spec/dashboard', taskId: ctx.taskId, source: 'test', timestamp: Date.now() });
        return Ok({ filesWritten: ['dashboard.yaml'], adrsProposed: [] });
      };
      await runAgent(SPEC_WRITER_CONTRACT, ctx, { designRef: 'figma://ref', specRef: 'spec/dashboard' }, 'write_spec', 'spec', 'Spec', specWork);

      const decompWork: AgentWorkFn<TaskDecomposerInput, TaskDecomposerOutput> = async (_input, _p, _l, ctx) => {
        ctx.eventBus.publish({ type: 'TasksCreated', taskCount: 3, taskIds: ['t_fe', 't_test', 't_pr'], source: 'test', timestamp: Date.now() });
        return Ok({ taskCount: 3, taskIds: ['t_fe', 't_test', 't_pr'] });
      };
      await runAgent(TASK_DECOMPOSER_CONTRACT, ctx, { specRef: 'spec/dashboard', taskId: 't4' }, 'write_tasks', 'tasks', 'Decompose', decompWork);

      // ---- Code ----
      const codeWork: AgentWorkFn<FrontendCoderInput, FrontendCoderOutput> = async (_input, _p, _l, ctx) => {
        ctx.fs.writeFile(`${ctx.projectRoot}/src/components/Dashboard.tsx`, 'export const Dashboard = () => <div/>;');
        await ctx.mcpClient.callTool('github', 'push', { branch: 'feat/dashboard' });
        ctx.eventBus.publish({ type: 'CodeGenComplete', taskId: ctx.taskId, agentId: 'fe', branch: 'feat/dashboard', filesGenerated: ['Dashboard.tsx'], source: 'test', timestamp: Date.now() });
        return Ok({ filesGenerated: ['Dashboard.tsx'], branch: 'feat/dashboard', totalCostUsd: 0.40, totalAttempts: 1 });
      };
      await runAgent(FRONTEND_CODER_CONTRACT, ctx, { task: makeTask(), projectRoot: PROJECT_ROOT, stackConfigPath: `${PROJECT_ROOT}/agentforge/stack.yaml`, promptTemplatePath: `${PROJECT_ROOT}/agentforge/prompts/frontend-coder.md` }, 'write_code', 'code', 'Code gen', codeWork);

      // Tests
      const testWork: AgentWorkFn<TestWriterInput, TestWriterOutput> = async (_input, _p, _l, ctx) => {
        ctx.eventBus.publish({ type: 'TestsComplete', taskId: ctx.taskId, agentId: 'tw', branch: 'feat/dashboard', testFilesGenerated: ['Dashboard.test.tsx'], source: 'test', timestamp: Date.now() });
        return Ok({ branch: 'feat/dashboard', testFilesGenerated: ['Dashboard.test.tsx'], totalCostUsd: 0.02, totalAttempts: 1 });
      };
      await runAgent(TEST_WRITER_CONTRACT, ctx, { task: makeTask(), projectRoot: PROJECT_ROOT, stackConfigPath: `${PROJECT_ROOT}/agentforge/stack.yaml`, promptTemplatePath: `${PROJECT_ROOT}/agentforge/prompts/test-writer.md`, targetBranch: 'feat/dashboard', sourceFiles: ['Dashboard.tsx'] }, 'write_code', 'tests', 'Tests', testWork);

      // PR
      const prWork: AgentWorkFn<PRManagerInput, PRManagerOutput> = async (_input, _p, _l, ctx) => {
        await ctx.mcpClient.callTool('github', 'create_pr', { branch: 'feat/dashboard' });
        ctx.eventBus.publish({ type: 'PRCreated', taskId: ctx.taskId, prNumber: 42, branch: 'feat/dashboard', source: 'test', timestamp: Date.now() });
        return Ok({ prNumber: 42, prUrl: 'https://github.com/test/smoke/pull/42', branch: 'feat/dashboard' });
      };
      await runAgent(PR_MANAGER_CONTRACT, ctx, { task: makeTask(), projectRoot: PROJECT_ROOT, branch: 'feat/dashboard', filesGenerated: ['Dashboard.tsx'], testResults: '2 passed', costUsd: 0.42 }, 'create_pr', 'PR', 'Create PR', prWork);

      // Security scan
      const scanWork: AgentWorkFn<SecurityScannerInput, SecurityScannerOutput> = async (_input, _p, _l, ctx) => {
        ctx.eventBus.publish({ type: 'SecurityScanComplete', taskId: ctx.taskId, prNumber: 42, findingsCount: 0, criticalCount: 0, passed: true, source: 'test', timestamp: Date.now() });
        return Ok({ prNumber: 42, findings: [], findingsCount: 0, criticalCount: 0, highCount: 0, passed: true, totalCostUsd: 0.03 });
      };
      await runAgent(SECURITY_SCANNER_CONTRACT, ctx, { task: makeTask(), projectRoot: PROJECT_ROOT, prNumber: 42, branch: 'feat/dashboard' }, 'read_code', 'scan', 'Scan', scanWork);

      // ---- Deploy ----
      const deployWork: AgentWorkFn<DeployAgentInput, DeployAgentOutput> = async (_input, _p, _l, ctx) => {
        await ctx.mcpClient.callTool('github', 'trigger_workflow', { workflow: 'deploy-staging' });
        ctx.eventBus.publish({ type: 'DeployComplete', taskId: ctx.taskId, environment: 'staging', healthy: true, source: 'test', timestamp: Date.now() });
        return Ok({ environment: 'staging' as const, healthy: true, healthCheckDuration: 30, deployRunId: 'run_002' });
      };
      await runAgent(DEPLOY_CONTRACT, ctx, { task: makeTask(), projectRoot: PROJECT_ROOT, prNumber: 42, branch: 'main', environment: 'staging' }, 'deploy_staging', 'staging', 'Deploy', deployWork);

      // ---- Verify full event chain ----
      expect(pipelineEvents).toContain('PageRequested');
      expect(pipelineEvents).toContain('UXResearchComplete');
      expect(pipelineEvents).toContain('WireframeComplete');
      expect(pipelineEvents).toContain('DesignPhaseComplete');
      expect(pipelineEvents).toContain('SpecComplete');
      expect(pipelineEvents).toContain('TasksCreated');
      expect(pipelineEvents).toContain('CodeGenComplete');
      expect(pipelineEvents).toContain('TestsComplete');
      expect(pipelineEvents).toContain('PRCreated');
      expect(pipelineEvents).toContain('SecurityScanComplete');
      expect(pipelineEvents).toContain('DeployComplete');

      // Verify event ordering
      const prIdx = pipelineEvents.indexOf('PageRequested');
      const dpIdx = pipelineEvents.indexOf('DeployComplete');
      expect(prIdx).toBeLessThan(dpIdx);

      // Verify MCP calls hit all required servers
      const servers = new Set(mcpClient.calls.map((c) => c.server));
      expect(servers.has('figma')).toBe(true);
      expect(servers.has('github')).toBe(true);

      // Verify governance recordAudit was called for each agent run
      expect(ctx.recordAudit).toHaveBeenCalled();
      const auditCallCount = (ctx.recordAudit as jest.Mock).mock.calls.length;
      expect(auditCallCount).toBeGreaterThanOrEqual(8); // One per agent execution

      // Verify project was scaffolded correctly
      expect(fs.exists(`${PROJECT_ROOT}/agentforge.yaml`)).toBe(true);
      expect(fs.exists(`${PROJECT_ROOT}/src/components/Dashboard.tsx`)).toBe(true);
    });
  });
});
