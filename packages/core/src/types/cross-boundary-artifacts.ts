/**
 * @module @agentforge/core/types/cross-boundary-artifacts
 *
 * TypeScript interfaces for artifacts that cross agent boundaries.
 * Inferred from Zod schemas in cross-boundary-artifacts.schemas.ts.
 */

import type { z } from 'zod';
import type {
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

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export type BlastRadius = z.infer<typeof BlastRadiusSchema>;
export type ClarifierMode = z.infer<typeof ClarifierModeSchema>;
export type ScopeAxis = z.infer<typeof ScopeAxisSchema>;
export type FindingCategory = z.infer<typeof FindingCategorySchema>;
export type ReviewOutcome = z.infer<typeof ReviewOutcomeSchema>;
export type FileOperation = z.infer<typeof FileOperationSchema>;

// ---------------------------------------------------------------------------
// Assumption Ledger
// ---------------------------------------------------------------------------

export type AssumptionEntry = z.infer<typeof AssumptionEntrySchema>;
export type AssumptionLedger = z.infer<typeof AssumptionLedgerSchema>;

// ---------------------------------------------------------------------------
// EARS Acceptance Criteria
// ---------------------------------------------------------------------------

export type EARSCriterion = z.infer<typeof EARSCriterionSchema>;

// ---------------------------------------------------------------------------
// PRD
// ---------------------------------------------------------------------------

export type Persona = z.infer<typeof PersonaSchema>;
export type DataEntity = z.infer<typeof DataEntitySchema>;
export type NFR = z.infer<typeof NFRSchema>;
export type SuccessMetric = z.infer<typeof SuccessMetricSchema>;
export type ScreenRef = z.infer<typeof ScreenRefSchema>;
export type PRD = z.infer<typeof PRDSchema>;

// ---------------------------------------------------------------------------
// Enriched Requirement
// ---------------------------------------------------------------------------

export type ClarificationRound = z.infer<typeof ClarificationRoundSchema>;
export type EnrichedRequirement = z.infer<typeof EnrichedRequirementSchema>;

// ---------------------------------------------------------------------------
// Change Classification
// ---------------------------------------------------------------------------

export type ScreenImpact = z.infer<typeof ScreenImpactSchema>;
export type AffectedScreen = z.infer<typeof AffectedScreenSchema>;
export type ChangeClassification = z.infer<typeof ChangeClassificationSchema>;

// ---------------------------------------------------------------------------
// Feature Plan
// ---------------------------------------------------------------------------

export type FeatureNode = z.infer<typeof FeatureNodeSchema>;
export type FeaturePlan = z.infer<typeof FeaturePlanSchema>;

// ---------------------------------------------------------------------------
// Screen Plan
// ---------------------------------------------------------------------------

export type DataBinding = z.infer<typeof DataBindingSchema>;
export type ScreenPlan = z.infer<typeof ScreenPlanSchema>;

// ---------------------------------------------------------------------------
// API Change Set
// ---------------------------------------------------------------------------

export type EndpointChange = z.infer<typeof EndpointChangeSchema>;
export type APIChangeSet = z.infer<typeof APIChangeSetSchema>;

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type DiffHunk = z.infer<typeof DiffHunkSchema>;
export type DiffFile = z.infer<typeof DiffFileSchema>;
export type Diff = z.infer<typeof DiffSchema>;

// ---------------------------------------------------------------------------
// Review Result
// ---------------------------------------------------------------------------

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
