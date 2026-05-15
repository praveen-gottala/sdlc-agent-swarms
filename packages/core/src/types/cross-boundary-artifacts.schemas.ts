/**
 * @module @agentforge/core/types/cross-boundary-artifacts.schemas
 *
 * Zod schemas for artifacts that cross agent boundaries (vision Layer 2).
 * Every artifact that flows between spine stages (Clarifier, Architect,
 * Implementer, Reviewer) has a schema here for runtime validation.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const BlastRadiusSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const ClarifierModeSchema = z.enum(['bootstrap', 'evolution']);

export const ScopeAxisSchema = z.enum([
  'ui',
  'component',
  'design-system',
  'api',
  'data-model',
]);

export const FindingCategorySchema = z.enum([
  'blocking',
  'suggestion',
  'false-positive',
]);

export const ReviewOutcomeSchema = z.enum([
  'approved',
  'rejected',
  'escalated',
]);

export const FileOperationSchema = z.enum(['add', 'modify', 'delete']);

// ---------------------------------------------------------------------------
// 1. Assumption Ledger — first-class artifact (vision Layer 5)
// ---------------------------------------------------------------------------

export const AssumptionEntrySchema = z.object({
  id: z.string(),
  statement: z.string(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
  blastRadius: BlastRadiusSchema,
  requiresConfirmation: z.boolean(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().optional(),
  resolution: z.string().optional(),
});

export const AssumptionLedgerSchema = z.object({
  id: z.string(),
  entries: z.array(AssumptionEntrySchema),
  createdAt: z.string(),
  lastUpdatedAt: z.string(),
});

// ---------------------------------------------------------------------------
// 2. EARS Acceptance Criteria
// ---------------------------------------------------------------------------

export const EARSCriterionSchema = z.object({
  id: z.string(),
  condition: z.string(),
  behavior: z.string(),
  formatted: z.string(),
});

// ---------------------------------------------------------------------------
// 3. PRD — structured output from Clarifier
// ---------------------------------------------------------------------------

export const PersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  goals: z.array(z.string()),
});

export const DataEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional(),
    description: z.string().optional(),
  })),
  relationships: z.array(z.string()).optional(),
});

export const NFRSchema = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string(),
  target: z.string().optional(),
  measurement: z.string().optional(),
});

export const SuccessMetricSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  target: z.string(),
  measurement: z.string(),
});

export const ScreenRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  screenType: z.enum(['page', 'modal', 'drawer', 'sheet']).optional(),
});

export const PRDSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  features: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    priority: z.enum(['must-have', 'should-have', 'could-have', 'wont-have']).optional(),
    acceptanceCriteria: z.array(EARSCriterionSchema).optional(),
  })),
  personas: z.array(PersonaSchema),
  dataEntities: z.array(DataEntitySchema),
  screens: z.array(ScreenRefSchema),
  nfrs: z.array(NFRSchema).default([]),
  successMetrics: z.array(SuccessMetricSchema).default([]),
  outOfScope: z.array(z.string()).default([]),
  version: z.string(),
  status: z.enum(['draft', 'reviewed', 'approved']),
});

// ---------------------------------------------------------------------------
// 4. Enriched Requirement — primary Clarifier output
// ---------------------------------------------------------------------------

export const ClarificationRoundSchema = z.object({
  round: z.number().int().min(1).max(3),
  questionsAsked: z.number().int(),
  questionsAnswered: z.number().int(),
  timestamp: z.string(),
});

export const EnrichedRequirementSchema = z.object({
  id: z.string(),
  rawInput: z.string(),
  mode: ClarifierModeSchema,
  prd: PRDSchema,
  assumptionLedger: AssumptionLedgerSchema,
  clarificationRounds: z.array(ClarificationRoundSchema),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
});

// ---------------------------------------------------------------------------
// 5. Change Classification — classifier node output (evolution mode)
// ---------------------------------------------------------------------------

export const ChangeClassificationSchema = z.object({
  id: z.string(),
  changeRequestId: z.string(),
  scopeAxes: z.array(ScopeAxisSchema).min(1),
  blastRadius: BlastRadiusSchema,
  affectedModules: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

// ---------------------------------------------------------------------------
// 6. Feature Plan — typed feature DAG from story writer
// ---------------------------------------------------------------------------

export const FeatureNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(EARSCriterionSchema),
  priority: z.enum(['must-have', 'should-have', 'could-have', 'wont-have']),
  dependencies: z.array(z.string()),
  status: z.enum(['planned', 'in-progress', 'implemented', 'verified']),
});

export const FeaturePlanSchema = z.object({
  id: z.string(),
  features: z.array(FeatureNodeSchema),
});

// ---------------------------------------------------------------------------
// 7. Screen Plan — screen-level design specification from Architect
// ---------------------------------------------------------------------------

export const DataBindingSchema = z.object({
  entityId: z.string(),
  field: z.string(),
  source: z.string(),
  transform: z.string().optional(),
});

export const ScreenPlanSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  screenType: z.enum(['page', 'modal', 'drawer', 'sheet']),
  route: z.string(),
  components: z.array(z.string()),
  dataBindings: z.array(DataBindingSchema),
  navigationTargets: z.array(z.object({
    target: z.string(),
    trigger: z.string(),
  })),
});

// ---------------------------------------------------------------------------
// 8. API Change Set — API changes proposed by Architect (evolution)
// ---------------------------------------------------------------------------

export const EndpointChangeSchema = z.object({
  method: z.string(),
  path: z.string(),
  description: z.string(),
  breaking: z.boolean(),
});

export const APIChangeSetSchema = z.object({
  id: z.string(),
  changeRequestId: z.string(),
  additions: z.array(EndpointChangeSchema),
  modifications: z.array(EndpointChangeSchema),
  removals: z.array(EndpointChangeSchema),
});

// ---------------------------------------------------------------------------
// 9. Diff — code diff output from Implementer
// ---------------------------------------------------------------------------

export const DiffHunkSchema = z.object({
  startLine: z.number().int(),
  endLine: z.number().int(),
  content: z.string(),
});

export const DiffFileSchema = z.object({
  path: z.string(),
  operation: FileOperationSchema,
  hunks: z.array(DiffHunkSchema),
});

export const DiffSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  worktreeBranch: z.string(),
  files: z.array(DiffFileSchema),
  testsPassed: z.boolean(),
  typecheckPassed: z.boolean(),
  lintPassed: z.boolean(),
});

// ---------------------------------------------------------------------------
// 10. Review Result — output from Reviewer
// ---------------------------------------------------------------------------

export const ReviewFindingSchema = z.object({
  id: z.string(),
  category: FindingCategorySchema,
  description: z.string(),
  file: z.string(),
  line: z.number().int().optional(),
  evidence: z.string(),
});

export const ReviewResultSchema = z.object({
  id: z.string(),
  diffId: z.string(),
  findings: z.array(ReviewFindingSchema),
  assumptionViolations: z.array(z.string()),
  outcome: ReviewOutcomeSchema,
  revisionCount: z.number().int().min(0),
});
