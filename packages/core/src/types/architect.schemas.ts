/**
 * @module @agentforge/core/types/architect.schemas
 *
 * Zod schemas for Architect stage outputs (vision Layer 3, Nodes 1-6).
 * Every artifact that the Architect produces or consumes has a schema here
 * for runtime validation. Follows the same pattern as
 * cross-boundary-artifacts.schemas.ts.
 *
 * References:
 * - docs/research/architect-codebase-grounded-design.md:674-686 (ContractBundle)
 * - docs/plans/active/chips-next-steps/m2-execution-plan.md (Phase 2)
 * - docs/adrs/ADR-054-styling-library-architect-axis.md (styling library axis)
 */

import { z } from 'zod';
import {
  BlastRadiusSchema,
  AssumptionEntrySchema,
  AssumptionLedgerSchema,
  ChangeClassificationSchema,
  ScreenPlanSchema,
  APIChangeSetSchema,
} from './cross-boundary-artifacts.schemas.js';

// ---------------------------------------------------------------------------
// Shared Architect enums
// ---------------------------------------------------------------------------

export const ConstraintTypeSchema = z.enum(['hard', 'soft']);

export const ProjectModeSchema = z.enum(['greenfield', 'brownfield']);

export const TaskTypeSchema = z.enum([
  'scaffold',
  'backend',
  'frontend',
  'test',
  'integration',
]);

export const ADRStatusSchema = z.enum(['proposed', 'accepted', 'superseded']);

// ---------------------------------------------------------------------------
// 1. Constraint & ConstraintSet — Node 1 output
// ---------------------------------------------------------------------------

export const ConstraintSchema = z.object({
  id: z.string(),
  type: ConstraintTypeSchema,
  category: z.string(),
  description: z.string(),
  source: z.string(),
});

export const GapSchema = z.object({
  id: z.string(),
  axis: z.string(),
  description: z.string(),
  defaultValue: z.string().optional(),
  resolvedValue: z.string().optional(),
  resolvedBy: z.string().optional(),
});

export const ConstraintSetSchema = z.object({
  projectId: z.string(),
  constraints: z.array(ConstraintSchema),
  gaps: z.array(GapSchema),
  mode: ProjectModeSchema,
});

// ---------------------------------------------------------------------------
// 2. OptionMemo & OptionsBundle — Node 2 output
// ---------------------------------------------------------------------------

export const AlternativeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tradeoffs: z.array(z.string()),
  blastRadius: BlastRadiusSchema,
  references: z.array(z.string()),
});

export const OptionMemoSchema = z.object({
  gapId: z.string(),
  axis: z.string(),
  alternatives: z.array(AlternativeSchema),
  recommendation: z.string().optional(),
  rationale: z.string(),
});

export const OptionsBundleSchema = z.object({
  projectId: z.string(),
  memos: z.array(OptionMemoSchema),
});

// ---------------------------------------------------------------------------
// 3. ArchitectureDecision & ArchitectureSpec — Node 3 output
// ---------------------------------------------------------------------------

export const MigrationSpecSchema = z.object({
  id: z.string(),
  sql: z.string(),
});

export const ArchitectStackConfigSchema = z.object({
  frontend: z.string(),
  backend: z.string(),
  database: z.string(),
  styling: z.string(),
  componentLibrary: z.string().optional(),
});

export const ArchitectureDecisionSchema = z.object({
  gapId: z.string(),
  chosenAlternativeId: z.string(),
  rationale: z.string(),
  adrId: z.string().optional(),
});

export const ImplementationPatternSchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  rule: z.string(),
  rationale: z.string().optional(),
  example: z.string().optional(),
  forbids: z.array(z.string()).optional(),
  appliesTo: z.array(z.string()).optional(),
});

export const ContextRefKindSchema = z.enum([
  'dataModel.entity',
  'apiChangeSet',
  'componentComposition',
  'screenPlan',
  'pattern',
]);

export const ContextRefSchema = z.object({
  kind: ContextRefKindSchema,
  id: z.string(),
});

export const TaskModeSchema = z.enum(['NEW', 'MODIFY']);

export const TaskCompletionReportSchema = z.object({
  taskId: z.string(),
  filesWritten: z.array(z.string()),
  interfacesExposed: z.array(z.string()),
  patternsApplied: z.array(z.string()),
  deviationsFromContract: z.array(z.string()),
});

export const ArchitectureSpecSchema = z.object({
  projectId: z.string(),
  decisions: z.array(ArchitectureDecisionSchema),
  stackConfig: ArchitectStackConfigSchema,
  assumptionLedgerUpdates: z.array(AssumptionEntrySchema),
  migrations: z.array(MigrationSpecSchema).optional(),
  implementationPatterns: z.array(ImplementationPatternSchema).optional().default([]),
});

// ---------------------------------------------------------------------------
// 4. TaskNode & TaskPlan — Node 5 output
// ---------------------------------------------------------------------------

export const TaskNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  filePaths: z.array(z.string()),
  dependencies: z.array(z.string()),
  writeOrder: z.number().int().min(0),
  type: TaskTypeSchema,
  mode: TaskModeSchema,
  estimatedTokenBudget: z.number().int().min(0).max(120_000),
  contextRefs: z.array(ContextRefSchema).default([]),
  patternRefs: z.array(z.string()).default([]),
  acceptanceCriteriaIds: z.array(z.string()).default([]),
});

export const TaskPlanSchema = z.object({
  projectId: z.string(),
  tasks: z.array(TaskNodeSchema),
  featureCoverage: z.record(z.string(), z.array(z.string())),
});

// ---------------------------------------------------------------------------
// 5. ADR — Architect-generated ADRs (minimal for M2)
// ---------------------------------------------------------------------------

export const ADRSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: ADRStatusSchema,
  decision: z.string(),
  rationale: z.string(),
  alternatives: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// 6. Scope-conditional placeholder types (minimal — M3 populates fully)
// ---------------------------------------------------------------------------

export const DataModelFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
});

export const DataModelEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(DataModelFieldSchema),
  tableName: z.string().optional(),
  relationships: z.array(z.string()).optional(),
});

export const DataModelSpecSchema = z.object({
  projectId: z.string(),
  entities: z.array(DataModelEntitySchema),
});

export const ComponentTreeNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  catalogId: z.string().optional(),
  children: z.array(z.string()).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

export const ComponentCompositionSchema = z.object({
  screenId: z.string(),
  componentTree: z.array(ComponentTreeNodeSchema),
});

export const DesignSystemDiffSchema = z.object({
  addedTokens: z.array(z.string()),
  modifiedTokens: z.array(z.string()),
  removedTokens: z.array(z.string()),
  themeStrategy: z.string().optional(),
});

// ---------------------------------------------------------------------------
// 7. CriticGate & CriticReport — Node 6 output
// ---------------------------------------------------------------------------

export const CriticGateSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  findings: z.array(z.string()),
});

export const CriticReportSchema = z.object({
  gates: z.array(CriticGateSchema),
  passed: z.boolean(),
  summary: z.string(),
});

// ---------------------------------------------------------------------------
// 8. ContractBundle — full Architect output
// ---------------------------------------------------------------------------

export const ContractBundleSchema = z.object({
  projectId: z.string(),
  constraintSet: ConstraintSetSchema,
  optionsBundle: OptionsBundleSchema,
  architectureSpec: ArchitectureSpecSchema,
  adrs: z.array(ADRSchema),
  dataModel: DataModelSpecSchema.optional(),
  apiChangeSets: z.array(APIChangeSetSchema),
  componentComposition: ComponentCompositionSchema.optional(),
  screenPlans: z.array(ScreenPlanSchema),
  designSystemDiff: DesignSystemDiffSchema.optional(),
  taskPlan: TaskPlanSchema,
  assumptionLedger: AssumptionLedgerSchema,
  criticReport: CriticReportSchema.optional(),
  changeClassification: ChangeClassificationSchema.optional(),
  version: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;
export type ProjectMode = z.infer<typeof ProjectModeSchema>;
export type TaskType = z.infer<typeof TaskTypeSchema>;
export type ADRStatus = z.infer<typeof ADRStatusSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type Gap = z.infer<typeof GapSchema>;
export type ConstraintSet = z.infer<typeof ConstraintSetSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;
export type OptionMemo = z.infer<typeof OptionMemoSchema>;
export type OptionsBundle = z.infer<typeof OptionsBundleSchema>;
export type MigrationSpec = z.infer<typeof MigrationSpecSchema>;
export type ArchitectStackConfig = z.infer<typeof ArchitectStackConfigSchema>;
export type ArchitectureDecision = z.infer<typeof ArchitectureDecisionSchema>;
export type ImplementationPattern = z.infer<typeof ImplementationPatternSchema>;
export type ContextRefKind = z.infer<typeof ContextRefKindSchema>;
export type ContextRef = z.infer<typeof ContextRefSchema>;
export type TaskMode = z.infer<typeof TaskModeSchema>;
export type TaskCompletionReport = z.infer<typeof TaskCompletionReportSchema>;
export type ArchitectureSpec = z.infer<typeof ArchitectureSpecSchema>;
export type TaskNode = z.infer<typeof TaskNodeSchema>;
export type TaskPlan = z.infer<typeof TaskPlanSchema>;
export type ADR = z.infer<typeof ADRSchema>;
export type DataModelField = z.infer<typeof DataModelFieldSchema>;
export type DataModelEntity = z.infer<typeof DataModelEntitySchema>;
export type DataModelSpec = z.infer<typeof DataModelSpecSchema>;
export type ComponentTreeNode = z.infer<typeof ComponentTreeNodeSchema>;
export type ComponentComposition = z.infer<typeof ComponentCompositionSchema>;
export type DesignSystemDiff = z.infer<typeof DesignSystemDiffSchema>;
export type CriticGate = z.infer<typeof CriticGateSchema>;
export type CriticReport = z.infer<typeof CriticReportSchema>;
export type ContractBundle = z.infer<typeof ContractBundleSchema>;
