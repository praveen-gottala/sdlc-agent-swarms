/**
 * Re-export legacy artifact migration helpers from @agentforge/core.
 *
 * These were moved to core in Task 1.0 of the unify-pipeline plan so that
 * both agents-ux and dashboard can import them without layer inversion.
 */
export {
  wrapResearchShallow,
  wrapPlanningShallow,
  migrateResearchArtifact,
  migratePlanningArtifact,
} from '@agentforge/core';
