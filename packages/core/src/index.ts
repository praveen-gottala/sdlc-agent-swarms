export type {
  ErrorCode,
  AgentForgeError,
  Result,
  HITLLevel,
  HITLDecision,
  MessageRef,
  ChannelType,
  AgentExecution,
  AgentBudget,
  AgentContract,
  CostRecord,
  CostEstimate,
  ChannelMessageRef,
  ApprovalContext,
  TaskStatus,
  TaskSummary,
  PhaseSummary,
  HITLChannel,
  RichHITLChannel,
  ObservationConfidence,
  AgentLearning,
  StackConfig,
  RepoConfig,
  ProviderConfig,
  SandboxConfig,
  OrchestrationConfig,
  HITLManifestConfig,
  ChannelEntry,
  RoutingManifestConfig,
  BudgetManifestConfig,
  ProjectManifest,
  TaskEntry,
  TasksFile,
} from './types/index.js';

export { Ok, Err } from './types/index.js';

export {
  readLearnings,
  addObservation,
  getActiveLearnings,
  deactivateObservation,
  createLearningsFile,
} from './state/learnings-manager.js';

// Events
export type {
  DomainEvent,
  DomainEventType,
  AgentStarted,
  AgentCompleted,
  AgentFailed,
  TaskStatusChanged,
  BudgetAlert,
  HITLApprovalRequested,
  HITLApprovalReceived,
  SpecLockAcquired,
  SpecLockReleased,
  PRMerged,
  SpecDriftDetected,
  DesignPhaseComplete,
  SpecComplete,
  TasksCreated,
  CodeGenComplete,
} from './events/index.js';

export type { EventBus } from './events/index.js';
export { createEventBus } from './events/index.js';

// Agent runtime
export type {
  GovernanceOutcome,
  RunGovernanceFn,
  ResolveProviderFn,
  LLMProviderRef,
  RecordAuditFn,
  AgentContext,
  AgentWorkFn,
  AgentRunResult,
  ErrorStrategy,
} from './agent-runtime/index.js';
export { runAgent, parseErrorStrategy } from './agent-runtime/index.js';

// Filesystem
export type { FileSystem } from './fs/index.js';
export { createRealFs, readYaml, writeYaml } from './fs/index.js';

// Config
export { loadProjectManifest } from './config/index.js';

// State: task manager
export {
  loadTasks,
  saveTasks,
  getTask,
  updateTaskStatus,
  addTask,
} from './state/task-manager.js';

// State: spec reader
export type { SpecFiles } from './state/spec-reader.js';
export { readSpecs, readSpecFile } from './state/spec-reader.js';

// State: lock manager
export type { LockInfo } from './state/lock-manager.js';
export {
  acquireLock,
  releaseLock,
  isLocked,
  cleanExpiredLocks,
} from './state/lock-manager.js';

// Spec sync
export type {
  Deviation,
  MinorDeviation,
  SignificantDeviation,
  CategorizedDeviation,
} from './spec-sync/spec-sync.js';
export {
  diffSpecVsCode,
  categorizeDeviation,
  applyMinorSync,
  flagSignificantDeviation,
  extractPropsFromCode,
  extractEndpointsFromCode,
  extractFieldsFromPrisma,
} from './spec-sync/spec-sync.js';

// MCP
export type {
  SecretProvider,
  MCPRequest,
  MCPResponse,
  MCPTransport,
  MCPMiddlewareFn,
  RateLimitConfig,
  CacheConfig,
  MCPTrace,
  PermissionChecker,
  TraceRecorder,
  MCPMiddlewareOptions,
  ToolDefinition,
  MCPClient,
  MCPClientConfig,
} from './mcp/index.js';
export {
  createEnvSecretProvider,
  createGovernanceMiddleware,
  createAuthMiddleware,
  createRateLimitMiddleware,
  createCacheMiddleware,
  createRetryMiddleware,
  createObservabilityMiddleware,
  composeMCPMiddleware,
  createMCPClient,
} from './mcp/index.js';
