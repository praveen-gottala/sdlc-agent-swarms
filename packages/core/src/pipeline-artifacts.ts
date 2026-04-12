/**
 * @module @agentforge/core/pipeline-artifacts
 *
 * Canonical artifact filenames for the design pipeline stages.
 * Used by CLI commands for caching and loading stage outputs.
 */

export const PIPELINE_ARTIFACTS = {
  researchBrief: 'research-brief.json',
  planningSpec: 'planning-spec.json',
  penpotDesign: 'penpot-design.json',
  designSpecV2: 'scripts/designspec-v2.json',
  designScript: 'scripts/design.js',
  fixScript: 'scripts/fixes.js',
  corrections: 'corrections',
} as const;
