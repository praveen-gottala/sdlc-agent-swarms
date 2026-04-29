/**
 * @module design-pipeline/model-presets
 *
 * Preset model configurations for the design pipeline. Each preset maps
 * pipeline role keys to model IDs. The dashboard UI writes these as
 * `agents.providers.overrides` in `agentforge.yaml`; the pipeline reads
 * them via the standard ADR-033 resolution chain.
 */

/** A named model configuration preset for the design pipeline. */
export interface PipelinePreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Maps agent role keys to model IDs. */
  readonly overrides: Readonly<Record<string, string>>;
}

/** Pipeline role keys used in agentforge.yaml overrides. */
export const PIPELINE_ROLE_KEYS = [
  'ux_research',
  'ux_planning',
  'ux_design',
  'ux_evaluator',
  'ux_correction',
] as const;

export type PipelineRoleKey = typeof PIPELINE_ROLE_KEYS[number];

/** Available Claude models for pipeline configuration. */
export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-7', label: 'Opus 4.7', tier: 'quality' as const },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', tier: 'quality' as const },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tier: 'balanced' as const },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', tier: 'economy' as const },
] as const;

export const PIPELINE_PRESETS: readonly PipelinePreset[] = [
  {
    id: 'quality',
    name: 'Quality',
    description: 'Opus for planning + design. Best output quality.',
    overrides: {
      ux_research: 'claude-sonnet-4-6',
      ux_planning: 'claude-opus-4-7',
      ux_design: 'claude-opus-4-6',
      ux_evaluator: 'claude-opus-4-7',
      ux_correction: 'claude-sonnet-4-6',
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Sonnet across all phases. Good quality, moderate cost.',
    overrides: {
      ux_research: 'claude-sonnet-4-6',
      ux_planning: 'claude-sonnet-4-6',
      ux_design: 'claude-sonnet-4-6',
      ux_evaluator: 'claude-opus-4-7',
      ux_correction: 'claude-sonnet-4-6',
    },
  },
  {
    id: 'economy',
    name: 'Economy',
    description: 'Haiku where possible. Lowest cost.',
    overrides: {
      ux_research: 'claude-haiku-4-5',
      ux_planning: 'claude-sonnet-4-6',
      ux_design: 'claude-sonnet-4-6',
      ux_evaluator: 'claude-opus-4-7',
      ux_correction: 'claude-haiku-4-5',
    },
  },
];
