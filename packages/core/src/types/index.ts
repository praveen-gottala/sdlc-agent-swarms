export type {
  ErrorCode,
  AgentForgeError,
  Result,
} from './result.js';
export { Ok, Err } from './result.js';

export type {
  HITLLevel,
  HITLDecision,
  MessageRef,
  ChannelType,
  AgentExecution,
  AgentBudget,
  AgentContract,
} from './agent-contract.js';

export type {
  CostRecord,
  CostEstimate,
  PhaseCostBreakdown,
  AgentCostBreakdown,
  MonthlyCostReport,
} from './cost.js';

export type {
  ChannelMessageRef,
  ApprovalContext,
  TaskStatus,
  TaskSummary,
  PhaseSummary,
  HITLChannel,
  RichHITLChannel,
} from './hitl.js';

export type {
  ObservationConfidence,
  AgentLearning,
} from './agent.js';

export type {
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
} from './project-manifest.js';

export type {
  TaskEntry,
  TasksFile,
} from './task.js';

export type {
  ScreenType,
  NavigationTarget,
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
  PageEntry,
  PagesSpec,
} from './spec-types.js';

export { SPEC_SCHEMA_HEADERS } from './spec-headers.js';

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
} from './design-system.js';

export { DesignToolSchema, DesignOutputSchema } from './design-phase-state.js';
export type { DesignTool, DesignOutput } from './design-phase-state.js';

export { ScaffoldProjectInputSchema } from './scaffold.js';
export type { ScaffoldProjectInput, ScaffoldResult } from './scaffold.js';

export {
  BlastRadiusSchema,
  ClarifierModeSchema,
  ScopeAxisSchema,
  FindingCategorySchema,
  ReviewOutcomeSchema,
  FileOperationSchema,
  AssumptionEntrySchema,
  AssumptionLedgerSchema,
  EARSCriterionSchema,
  PersonaSchema,
  DataEntitySchema,
  NFRSchema,
  SuccessMetricSchema,
  ScreenRefSchema,
  PRDSchema,
  ClarificationRoundSchema,
  EnrichedRequirementSchema,
  ScreenImpactSchema,
  AffectedScreenSchema,
  ChangeClassificationSchema,
  FeatureNodeSchema,
  FeaturePlanSchema,
  DataBindingSchema,
  ScreenPlanSchema,
  EndpointChangeSchema,
  APIChangeSetSchema,
  DiffHunkSchema,
  DiffFileSchema,
  DiffSchema,
  ReviewFindingSchema,
  ReviewResultSchema,
} from './cross-boundary-artifacts.schemas.js';

export type {
  BlastRadius,
  ClarifierMode,
  ScopeAxis,
  FindingCategory,
  ReviewOutcome,
  FileOperation,
  AssumptionEntry,
  AssumptionLedger,
  EARSCriterion,
  Persona,
  DataEntity,
  NFR,
  SuccessMetric,
  ScreenRef,
  PRD,
  ClarificationRound,
  EnrichedRequirement,
  ScreenImpact,
  AffectedScreen,
  ChangeClassification,
  FeatureNode,
  FeaturePlan,
  DataBinding,
  ScreenPlan,
  EndpointChange,
  APIChangeSet,
  DiffHunk,
  DiffFile,
  Diff,
  ReviewFinding,
  ReviewResult,
} from './cross-boundary-artifacts.js';

export {
  ReorderEntrySchema,
  DesignSpecDeltaSchema,
} from './design-delta.schemas.js';
export type {
  ReorderEntry,
  DesignSpecDelta,
} from './design-delta.schemas.js';

export { RetrievedContextSchema } from './retrieved-context.js';
export type { RetrievedContext } from './retrieved-context.js';

export {
  DesignSliceStrategySchema,
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
  ImplementationPatternSchema,
  ContextRefKindSchema,
  ContextRefSchema,
  TaskModeSchema,
  TaskCompletionReportSchema,
  ImplementerContextMetadataSchema,
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
  resolveDesignSliceStrategy,
} from './architect.schemas.js';

export type {
  DesignSliceStrategy,
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
  ImplementationPattern,
  ContextRefKind,
  ContextRef,
  TaskMode,
  TaskCompletionReport,
  ImplementerContextMetadata,
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
} from './architect.schemas.js';
