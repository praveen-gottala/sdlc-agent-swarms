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
  DesignConfig,
  ProjectManifest,
  TaskEntry,
  TasksFile,
} from './types/index.js';

export { Ok, Err } from './types/index.js';

// Debug logging
export { debugLog, logDefaults } from './debug-log.js';
export { SPEC_SCHEMA_HEADERS } from './types/index.js';

export { DesignToolSchema, DesignOutputSchema } from './types/index.js';
export type { DesignTool, DesignOutput } from './types/index.js';

export { ScaffoldProjectInputSchema } from './types/index.js';
export type { ScaffoldProjectInput, ScaffoldResult } from './types/index.js';

// Architect utilities (M2 — Critic validation)
export { validateContractBundle } from './architect/index.js';

// Architect Zod schemas (vision Layer 3)
export {
  ConstraintTypeSchema,
  ProjectModeSchema,
  TaskTypeSchema,
  ADRStatusSchema,
  ConstraintSchema,
  GapSchema,
  ConstraintSetSchema,
  AlternativeSchema,
  OptionMemoSchema,
  OptionsBundleSchema,
  MigrationSpecSchema,
  ArchitectStackConfigSchema,
  ArchitectureDecisionSchema,
  ArchitectureSpecSchema,
  TaskNodeSchema,
  TaskPlanSchema,
  ADRSchema,
  DataModelFieldSchema,
  DataModelEntitySchema,
  DataModelSpecSchema,
  ComponentTreeNodeSchema,
  ComponentCompositionSchema,
  DesignSystemDiffSchema,
  CriticGateSchema,
  CriticReportSchema,
  ContractBundleSchema,
} from './types/index.js';

export type {
  ConstraintType,
  ProjectMode,
  TaskType,
  ADRStatus,
  Constraint,
  Gap,
  ConstraintSet,
  Alternative,
  OptionMemo,
  OptionsBundle,
  MigrationSpec,
  ArchitectStackConfig,
  ArchitectureDecision,
  ArchitectureSpec,
  TaskNode,
  TaskPlan,
  ADR,
  DataModelField,
  DataModelEntity,
  DataModelSpec,
  ComponentTreeNode,
  ComponentComposition,
  DesignSystemDiff,
  CriticGate,
  CriticReport,
  ContractBundle,
} from './types/index.js';

// Cross-boundary artifact schemas (vision Layer 2)
export {
  EnrichedRequirementSchema,
  AssumptionLedgerSchema,
  PRDSchema,
  FeaturePlanSchema,
  FeatureNodeSchema,
  EARSCriterionSchema,
  ClarificationRoundSchema,
  AssumptionEntrySchema,
} from './types/index.js';
export type {
  EnrichedRequirement,
  AssumptionLedger,
  PRD,
  FeaturePlan,
  FeatureNode,
  EARSCriterion,
  ClarificationRound,
  AssumptionEntry,
} from './types/index.js';

// Scaffolding
export { scaffoldProject } from './scaffolding/index.js';

// Checkpointer
export { createCheckpointer, MemorySaver } from './checkpointer/index.js';
export type { CheckpointerConfig, BaseCheckpointSaver } from './checkpointer/index.js';

// Constants
export { DEFAULT_MAX_AGE_MS, PREVIEW_DIR_REL, DEFAULT_MODEL, EVALUATOR_MODEL, ENV_MODEL_OVERRIDE, ENV_VISION_LLM, isVisionLLMEnabled, DEFAULT_SERVICE_URLS } from './constants.js';
export { PIPELINE_ARTIFACTS } from './pipeline-artifacts.js';
export {
  readDesignSpec,
  readDesignSpecText,
  writeDesignSpec,
  designSpecExists,
  backupDesignSpec,
  revertDesignSpec,
} from './design-spec-store.js';

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
  UXModuleRequested,
  DesignBriefCompleted,
  ComponentSpecReady,
  ImplementationDraftReady,
  UXReviewCompleted,
  UXTestSuiteCompleted,
  UXModuleDeployed,
  PipelineRunProgress,
  RequirementsClarified,
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
export { resolveModelForRole } from './config/index.js';
export type { ResolveViewportsInput } from './config/index.js';
export { resolveViewports, STANDARD_BREAKPOINTS_DESKTOP_FIRST, STANDARD_BREAKPOINTS_MOBILE_FIRST } from './config/index.js';

// State: task manager
export {
  loadTasks,
  saveTasks,
  getTask,
  updateTaskStatus,
  addTask,
} from './state/task-manager.js';

// State: PRD reader
export { loadPRD, prdExists } from './state/prd-reader.js';

// PRD rendering (ADR-053)
export { renderPrdToMarkdown } from './prd/render-prd-markdown.js';

// State: design system reader
export {
  loadDesignTokens,
  loadBrandSpec,
  saveDesignTokens,
  saveBrandSpec,
  loadComponentLibrary,
  saveComponentLibrary,
  loadComponentCatalog,
  saveComponentCatalog,
  validateDesignTokens,
  validateBrandSpec,
  validateComponentCatalog,
} from './state/design-system-reader.js';

// Catalogs: base catalog + project catalog generation
export { loadBaseCatalog, generateProjectCatalog } from './catalogs/index.js';

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

// Design system types
export type {
  PrimitiveColors,
  SemanticColors,
  ColorSpec,
  TypographyScaleEntry,
  TypographySpec,
  SpacingSpec,
  BorderSpec,
  TouchTargetSpec,
  ElevationLevel,
  ElevationSpec,
  LayoutSpec,
  ZIndexSpec,
  OpacitySpec,
  MotionSpec,
  BorderWidthSpec,
  TextExtrasSpec,
  StateTokensSpec,
  DesignTokensSpec,
  BrandIdentity,
  IllustrationStyle,
  MotionPrinciples,
  AccessibilitySpec,
  BrandSpec,
  ReactComponentMapping,
  ComponentLibrarySpec,
  ComponentAnatomySlot,
  ComponentStateTokens,
  ComponentSpacing,
  ComponentTokenBindings,
  ComponentAccessibility,
  CatalogLibraryMapping,
  ComponentCatalogEntry,
  ComponentCatalogSpec,
} from './types/design-system.js';

// Design system Zod schemas
export {
  PrimitiveColorsSchema,
  SemanticColorsSchema,
  ColorSpecSchema,
  TypographyScaleEntrySchema,
  TypographySpecSchema,
  SpacingSpecSchema,
  BorderSpecSchema,
  TouchTargetSpecSchema,
  ElevationLevelSchema,
  ElevationSpecSchema,
  LayoutSpecSchema,
  ZIndexSpecSchema,
  OpacitySpecSchema,
  MotionSpecSchema,
  BorderWidthSpecSchema,
  TextExtrasSpecSchema,
  StateTokensSpecSchema,
  DesignTokensSpecSchema,
  BrandIdentitySchema,
  IllustrationStyleSchema,
  MotionPrinciplesSchema,
  AccessibilitySpecSchema,
  BrandSpecSchema,
  ComponentAnatomySlotSchema,
  ComponentStateTokensSchema,
  ComponentTokenBindingsSchema,
  ComponentSpacingSchema,
  ComponentAccessibilitySchema,
  CatalogLibraryMappingSchema,
  ComponentCatalogEntrySchema,
  ComponentCatalogSpecSchema,
  ReactComponentMappingSchema,
  ComponentLibrarySpecSchema,
} from './types/design-system.schemas.js';

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
  NavigationTarget,
  PageEntry,
  PagesSpec,
  PageContext,
  ScreenType,
} from './types/spec-types.js';

// Spec types Zod schemas
export {
  ComponentPropSchema,
  ComponentEntrySchema,
  ComponentSpecSchema,
  QueryParamSchema,
  EndpointResponseSchema,
  EndpointEntrySchema,
  ApiSpecSchema,
  ModelFieldSchema,
  ModelEntrySchema,
  ModelsSpecSchema,
  NavigationTargetSchema,
  ScreenTypeSchema,
  PageEntrySchema,
  PagesSpecSchema,
  PageContextSchema,
} from './types/spec-types.schemas.js';

// Safe parse utility
export { safeParse, extractJson } from './utils/safe-parse.js';

// Test utilities (helpers for unit tests across packages — see CLAUDE.md §Test Quality Gates)
export { withEnv } from './test-utils/index.js';

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
  DesignToolKind,
  DesignToolConnectionConfig,
  DesignToolSession,
  DesignToolAdapter,
  DesignToolScreenshotResult,
  PenpotTransportConfig,
  PenpotConnection,
  PlaywrightTransportConfig,
  PlaywrightTransportHandle,
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
  createPenpotConnection,
  createPenpotTransport,
  createPenpotAdapter,
  createPlaywrightTransport,
  createPlaywrightTransportFromPage,
  PLAYWRIGHT_TOOLS,
} from './mcp/index.js';

// Legacy artifact migrations (unify-pipeline)
export {
  wrapResearchShallow,
  wrapPlanningShallow,
  migrateResearchArtifact,
  migratePlanningArtifact,
} from './migrations/index.js';

// Design utilities (archetypes, tailwind/CSS generation, token defaults)
export { buildDesignTokensSpec, buildBrandSpec } from './design/index.js';
export type { DesignArchetype } from './design/index.js';
export { generateTailwindConfig, generateGlobalCss, hexToHSLChannels } from './design/index.js';
export {
  DEFAULT_LAYOUT_TOKENS,
  SHARED_LAYOUT,
  DEFAULT_OPACITY,
  DEFAULT_MOTION,
  DEFAULT_STATE,
  DEFAULT_ELEVATION,
  DEFAULT_TYPOGRAPHY_SCALE,
  DEFAULT_PREVIEW,
} from './design/index.js';
export type { PreviewData } from './design/index.js';

// Prompt utilities (frontmatter parsing)
export type { PromptFrontmatter, ParsedPrompt, VersionCheckResult } from './prompts/index.js';
export { parsePromptFrontmatter, checkVersionBump } from './prompts/index.js';
