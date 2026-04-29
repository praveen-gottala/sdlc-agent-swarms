/**
 * @module @agentforge/agents-clarifier/schemas
 *
 * Internal Zod schemas for Clarifier pipeline types.
 * Cross-boundary schemas (EnrichedRequirementSchema, AssumptionLedgerSchema)
 * are imported from @agentforge/core — NOT duplicated here.
 */

import { z } from 'zod';

export const GapSchema = z.object({
  id: z.string(),
  description: z.string(),
  category: z.enum(['missing', 'ambiguous', 'conflicting', 'incomplete']),
  confidence: z.number().min(0).max(1),
  deterministic: z.boolean(),
  divergentInterpretations: z.array(z.string()).optional(),
});

export const QuestionSchema = z.object({
  id: z.string(),
  gapId: z.string(),
  text: z.string(),
  type: z.enum(['open', 'multiple-choice']),
  options: z.array(z.string()).optional(),
  priority: z.number(),
  evpiScore: z.number(),
});

export const ClarifierContextSchema = z.object({
  catalog: z.string().optional(),
  patternLibrary: z.string().optional(),
  platformConstraints: z.string().optional(),
  codeChunks: z.array(z.string()).optional(),
  docChunks: z.array(z.string()).optional(),
  designChunks: z.array(z.string()).optional(),
  repoMap: z.string().optional(),
});

export const HumanResponseSchema = z.object({
  questionId: z.string(),
  answer: z.string(),
  selectedOption: z.string().optional(),
});
