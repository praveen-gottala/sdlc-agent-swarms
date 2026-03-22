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
  PhaseCostBreakdown,
  AgentCostBreakdown,
  MonthlyCostReport,
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
  updateObservationConfidence,
  expireObservation,
} from './state/learnings-manager.js';

// Events
export type {
  BaseDomainEventFields,
  DomainEvent,
  DomainEventInput,
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
  PageRequested,
  UXResearchComplete,
  WireframeComplete,
  WireframeApproved,
  VisualDesignComplete,
  DesignReviewComplete,
  DesignPhaseComplete,
  SpecComplete,
  TasksCreated,
  CodeGenComplete,
  TestsComplete,
  PRCreated,
  ReviewComplete,
  CIFailed,
  CIResult,
  SecurityScanComplete,
  BuildFixComplete,
  DeployComplete,
  DeployFailed,
  AgentAborted,
  HITLApproved,
  HITLTimeout,
  TrustEscalated,
  DashboardModuleRequested,
  DesignBriefCompleted,
  ComponentSpecReady,
  ImplementationDraftReady,
  UXReviewCompleted,
  UXTestSuiteCompleted,
  UXModuleDeployed,
  FigmaDesignReady,
} from './events/index.js';

export type { EventBus, EventFilter, EventBusOptions } from './events/index.js';
export { createEventBus } from './events/index.js';

// File-based event bridge for Python engine interop
export {
  writeBridgeEvent,
  readBridgeEvents,
  startBridgeWatcher,
} from './events/index.js';

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
export { runAgent, parseErrorStrategy, formatLearningsForPrompt } from './agent-runtime/index.js';

// Filesystem
export type { FileSystem } from './fs/index.js';
export { createRealFs, readYaml, writeYaml } from './fs/index.js';

// Config
export { loadProjectManifest } from './config/index.js';
export type { StackResolution } from './config/index.js';
export { deriveStackName, resolveStackDir, resolvePromptsDir } from './config/index.js';

// State: task manager
export {
  loadTasks,
  saveTasks,
  getTask,
  updateTaskStatus,
  addTask,
} from './state/task-manager.js';

// State: task dependency graph
export type { AgentSlot, DependencyGraphConfig } from './state/task-dependency-graph.js';
export {
  detectCircularDependencies,
  addTaskWithDependencies,
  getReadyTasks,
  onTaskCompleted,
  onTaskFailed,
  getSchedulableTasks,
} from './state/task-dependency-graph.js';

// Spec types (PRD v2.0 Section 5.2)
export type {
  ComponentProp,
  ComponentEntry,
  ComponentSpec,
  QueryParam,
  EndpointResponse,
  EndpointEntry,
  ApiSpec,
  ModelField,
  ModelEntry,
  ModelsSpec,
} from './types/spec-types.js';

// State: spec reader
export type { SpecFiles } from './state/spec-reader.js';
export { readSpecs, readSpecFile } from './state/spec-reader.js';

// State: lock manager
export type { LockInfo, HumanEditCheckResult } from './state/lock-manager.js';
export {
  acquireLock,
  releaseLock,
  isLocked,
  cleanExpiredLocks,
  checkHumanEdit,
  computeContentHash,
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
  TalkToFigmaConfig,
  TalkToFigmaConnection,
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
  createTalkToFigmaTransport,
  TALK_TO_FIGMA_TOOLS,
} from './mcp/index.js';
