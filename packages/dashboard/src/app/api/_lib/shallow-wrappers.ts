/**
 * Shallow schema-compliant wrappers for dashboard pipeline artifacts.
 *
 * The dashboard's pipeline stages produce raw markdown strings. These wrappers
 * create schema-compliant UXResearchOutput / UXPlanningOutput shells with empty
 * semantic fields and the raw markdown in a _rawMarkdown side-channel.
 *
 * _migrated: true marks these as shallow wrappers — not real typed output from
 * the canonical work functions. Phase 3 of the unify-pipeline plan replaces
 * these with actual typed output from runDesignPipeline.
 */

interface ShallowResearchOutput {
  readonly briefId: string;
  readonly moduleId: string;
  readonly requirementIds: readonly string[];
  readonly designConstraints: readonly string[];
  readonly referencePatterns: readonly string[];
  readonly accessibilityRequirements: readonly string[];
  readonly dataModelDependencies: readonly string[];
  readonly _rawMarkdown: string;
  readonly _migrated: true;
}

interface ShallowPlanningOutput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly componentTree: readonly never[];
  readonly tokenBindings: Record<string, never>;
  readonly responsiveRules: readonly never[];
  readonly _rawMarkdown: string;
  readonly _migrated: true;
}

/** Wrap raw research markdown in a schema-compliant shell. */
export function wrapResearchShallow(pageId: string, rawMarkdown: string): ShallowResearchOutput {
  return {
    briefId: pageId,
    moduleId: pageId,
    requirementIds: [],
    designConstraints: [],
    referencePatterns: [],
    accessibilityRequirements: [],
    dataModelDependencies: [],
    _rawMarkdown: rawMarkdown,
    _migrated: true,
  };
}

/** Wrap raw planning markdown in a schema-compliant shell. */
export function wrapPlanningShallow(pageId: string, rawMarkdown: string): ShallowPlanningOutput {
  return {
    specRef: pageId,
    moduleId: pageId,
    componentTree: [],
    tokenBindings: {},
    responsiveRules: [],
    _rawMarkdown: rawMarkdown,
    _migrated: true,
  };
}

/** Detect old { brief: string } shape and wrap it in a schema-compliant shell. */
export function migrateResearchArtifact(pageId: string, artifact: unknown): unknown {
  if (
    artifact !== null &&
    typeof artifact === 'object' &&
    'brief' in artifact &&
    typeof (artifact as Record<string, unknown>).brief === 'string'
  ) {
    return wrapResearchShallow(pageId, (artifact as Record<string, unknown>).brief as string);
  }
  return artifact;
}

/** Detect old { spec: string } shape and wrap it in a schema-compliant shell. */
export function migratePlanningArtifact(pageId: string, artifact: unknown): unknown {
  if (
    artifact !== null &&
    typeof artifact === 'object' &&
    'spec' in artifact &&
    typeof (artifact as Record<string, unknown>).spec === 'string'
  ) {
    return wrapPlanningShallow(pageId, (artifact as Record<string, unknown>).spec as string);
  }
  return artifact;
}
