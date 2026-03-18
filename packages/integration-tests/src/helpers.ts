/**
 * Shared test helpers for integration tests.
 * Provides mock factories for EventBus, FileSystem, MCPClient,
 * AgentContext, providers, channels, and governance middleware.
 */

import type {
  EventBus,
  FileSystem,
  MCPClient,
  AgentContext,
  LLMProviderRef,
  AgentContract,
  HITLDecision,
  TaskEntry,
  TasksFile,
  DomainEvent,
  DomainEventType,
  HITLChannel,
  CostEstimate,
  Result,
} from '@agentforge/core';
import { Ok, Err, createEventBus } from '@agentforge/core';
import type {
  GovernanceConfig,
  GovernanceMiddleware,
  HITLConfig,
} from '@agentforge/governance';

// ============================================================================
// Event collector
// ============================================================================

export interface EventCollector {
  readonly bus: EventBus;
  readonly events: DomainEvent[];
  eventsOfType<T extends DomainEventType>(type: T): Extract<DomainEvent, { type: T }>[];
  waitForEvent<T extends DomainEventType>(
    type: T,
    timeoutMs?: number,
  ): Promise<Extract<DomainEvent, { type: T }>>;
  clear(): void;
}

export const createEventCollector = (): EventCollector => {
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
    waitForEvent<T extends DomainEventType>(type: T, timeoutMs = 5000) {
      const existing = events.find((e): e is Extract<DomainEvent, { type: T }> => e.type === type);
      if (existing) return Promise.resolve(existing);
      return new Promise<Extract<DomainEvent, { type: T }>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
        bus.subscribe(type, (event) => {
          clearTimeout(timer);
          resolve(event as Extract<DomainEvent, { type: T }>);
        });
      });
    },
    clear() {
      events.length = 0;
      bus.clear();
    },
  };
};

// ============================================================================
// In-memory FileSystem
// ============================================================================

export interface MockFileSystem extends FileSystem {
  files: Map<string, string>;
  dirs: Set<string>;
}

export const createMockFs = (initialFiles: Record<string, string> = {}): MockFileSystem => {
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
};

// ============================================================================
// Mock MCP Client
// ============================================================================

export type MCPHandler = (
  server: string,
  method: string,
  params: Readonly<Record<string, unknown>>,
) => Promise<Result<unknown>>;

export const createMockMCPClient = (handler?: MCPHandler): MCPClient & { calls: Array<{ server: string; method: string; params: Readonly<Record<string, unknown>> }> } => {
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
};

// ============================================================================
// Mock LLM Provider
// ============================================================================

export const createMockProvider = (
  responses: Array<Result<unknown>> | Result<unknown> = Ok({ content: 'ok', cost: { totalCostUsd: 0.01 } }),
): LLMProviderRef & { completeCalls: number; streamCalls: number } => {
  let callIndex = 0;
  const responseArray = Array.isArray(responses) ? responses : [responses];
  const provider = {
    name: 'mock-provider',
    completeCalls: 0,
    streamCalls: 0,
    async complete() {
      provider.completeCalls++;
      const response = responseArray[Math.min(callIndex, responseArray.length - 1)];
      callIndex++;
      return response;
    },
    async *stream() {
      provider.streamCalls++;
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
};

// ============================================================================
// Mock Governance
// ============================================================================

export const createMockGovernance = (
  overrides: Partial<GovernanceMiddleware> = {},
): GovernanceMiddleware => ({
  checkPermission: jest.fn().mockReturnValue(Ok(undefined)),
  checkBudget: jest.fn().mockReturnValue(Ok(undefined)),
  enforceHITL: jest.fn().mockResolvedValue({ status: 'proceed' }),
  recordAudit: jest.fn(),
  ...overrides,
});

export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  hitl: {
    defaultLevel: 'full_approval',
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

export const DEFAULT_HITL_CONFIG: HITLConfig = DEFAULT_GOVERNANCE_CONFIG.hitl;

// ============================================================================
// Mock HITL Channel
// ============================================================================

export const createMockChannel = (
  type: 'slack' | 'telegram' | 'cli' = 'slack',
  available = true,
): HITLChannel & { decisions: Map<string, { decision: string; feedback?: string }>; decisionCallbacks: Array<(taskId: string, decision: HITLDecision, feedback?: string) => void> } => {
  const decisions = new Map<string, { decision: string; feedback?: string }>();
  const decisionCallbacks: Array<(taskId: string, decision: HITLDecision, feedback?: string) => void> = [];

  return {
    type,
    priority: type === 'slack' ? 1 : type === 'telegram' ? 2 : 3,
    capabilities: type === 'slack' ? 'full' : 'approvals',
    decisions,
    decisionCallbacks,
    async sendNotification(message, severity) {
      return Ok({ channel: type, messageId: `msg_${Date.now()}`, timestamp: new Date() });
    },
    async requestApproval(task, context) {
      return Ok({ channel: type, messageId: `approval_${task.id}`, timestamp: new Date() });
    },
    onDecision(callback) {
      decisionCallbacks.push(callback);
    },
    async updateStatus(ref, status) {
      return Ok(undefined);
    },
    async isAvailable() {
      return available;
    },
  };
};

// ============================================================================
// Agent Context Factory
// ============================================================================

export const createTestContext = (overrides: Partial<AgentContext> & { eventBus?: EventBus; fs?: FileSystem; mcpClient?: MCPClient } = {}): AgentContext => {
  const bus = overrides.eventBus ?? createEventBus();
  const fs = overrides.fs ?? createMockFs();
  const mcpClient = overrides.mcpClient ?? createMockMCPClient();

  return {
    taskId: 'task_001',
    projectRoot: '/project',
    eventBus: bus,
    fs,
    mcpClient,
    runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
    resolveProvider: jest.fn().mockReturnValue(Ok(createMockProvider())),
    recordAudit: jest.fn(),
    ...overrides,
  };
};

// ============================================================================
// Contract Factories
// ============================================================================

export const makeContract = (overrides: Partial<AgentContract> = {}): AgentContract => ({
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
});

export const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
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
});

export const makeTasksFile = (tasks: TaskEntry[]): TasksFile => ({ tasks });

// ============================================================================
// YAML string helpers
// ============================================================================

export const tasksToYaml = (tasks: TaskEntry[]): string => {
  const lines = ['tasks:'];
  for (const t of tasks) {
    lines.push(`  - id: "${t.id}"`);
    lines.push(`    title: "${t.title}"`);
    lines.push(`    phase: "${t.phase}"`);
    lines.push(`    agent: "${t.agent}"`);
    lines.push(`    status: "${t.status}"`);
    lines.push(`    depends_on: [${t.depends_on.map((d) => `"${d}"`).join(', ')}]`);
    lines.push(`    spec_ref: "${t.spec_ref}"`);
    lines.push(`    branch: ${t.branch ? `"${t.branch}"` : 'null'}`);
    lines.push(`    pr_number: ${t.pr_number ?? 'null'}`);
    lines.push(`    cost_usd: ${t.cost_usd}`);
    lines.push(`    tokens_used: ${t.tokens_used}`);
    lines.push(`    attempts: ${t.attempts}`);
    lines.push(`    max_attempts: ${t.max_attempts}`);
    lines.push(`    hitl_status: "${t.hitl_status}"`);
    lines.push(`    hitl_channel: ${t.hitl_channel ? `"${t.hitl_channel}"` : 'null'}`);
  }
  return lines.join('\n');
};

/** Delay helper for simulating async waits. */
export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
