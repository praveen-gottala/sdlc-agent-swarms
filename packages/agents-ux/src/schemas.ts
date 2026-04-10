/**
 * @module @agentforge/agents-ux/schemas
 *
 * Zod schemas for all agent output types. Used by parse functions
 * to validate LLM output with proper defaults.
 */

import { z } from 'zod';

// UX Research output schema
export const UXResearchOutputSchema = z.object({
  briefId: z.string().default(''),
  moduleId: z.string().default(''),
  requirementIds: z.array(z.string()).default([]),
  designConstraints: z.array(z.string()).default([]),
  referencePatterns: z.array(z.string()).default([]),
  accessibilityRequirements: z.array(z.string()).default([]),
  dataModelDependencies: z.array(z.string()).default([]),
});

// UX Planning output schema (for text fallback path)
export const UXPlanningOutputSchema = z.object({
  specRef: z.string().default(''),
  moduleId: z.string().default(''),
  componentTree: z.array(z.object({
    name: z.string(),
    props: z.array(z.string()).default([]),
    children: z.array(z.string()).default([]),
  })).default([]),
  tokenBindings: z.union([
    z.record(z.string(), z.string()),
    z.array(z.object({ key: z.string(), value: z.string() })),
  ]).default({}),
  responsiveRules: z.array(z.object({
    breakpoint: z.string(),
    behavior: z.string(),
    width: z.number().optional(),
    layout: z.string().optional(),
    changes: z.array(z.string()).optional(),
  })).default([]),
  screens: z.array(z.object({
    name: z.string(),
    components: z.array(z.string()).optional(),
  })).optional(),
});

// UX Implementation output schema
export const UXImplementationOutputSchema = z.object({
  moduleId: z.string().default(''),
  stage: z.enum(['layout', 'theme', 'animation', 'implementation']).default('layout'),
  files: z.array(z.object({
    filePath: z.string(),
    content: z.string(),
  })).default([]),
  totalCostUsd: z.number().default(0),
});

// UX Testing output schema
export const UXTestingOutputSchema = z.object({
  testRunId: z.string().default(''),
  testFilePaths: z.array(z.string()).default([]),
  passCount: z.number().default(0),
  failCount: z.number().default(0),
  healedCount: z.number().default(0),
  fixInstructions: z.string().optional(),
});

// UX Review -- ReviewIssue schema
export const ReviewIssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']),
  category: z.enum(['accessibility', 'design_system', 'visual_fidelity']),
  description: z.string(),
  fix: z.string(),
  requirementId: z.string().optional(),
});

// UX Review output schema
export const UXReviewOutputSchema = z.object({
  reviewId: z.string().default(''),
  issues: z.array(ReviewIssueSchema).default([]),
});

// Design evaluation output schema
export const DesignEvaluationOutputSchema = z.object({
  score: z.number(),
  issues: z.array(z.object({
    issueId: z.string().optional(),
    severity: z.enum(['critical', 'major', 'minor']),
    component: z.string(),
    description: z.string(),
    fix: z.string(),
  })).default([]),
});
