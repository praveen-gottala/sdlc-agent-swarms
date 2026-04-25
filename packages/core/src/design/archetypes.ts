/**
 * @module @agentforge/core/design/archetypes
 *
 * Design archetype definitions — hardcoded color/typography/elevation presets
 * used as fallback themes when LLM generation is unavailable or mocked.
 */

import type { DesignTokensSpec, BrandSpec } from '../types/design-system.js';
import { debugLog } from '../debug-log.js';
import { DEFAULT_LAYOUT_TOKENS, DEFAULT_OPACITY, DEFAULT_MOTION, DEFAULT_STATE } from './design-tokens-defaults.js';

/** Design archetype choice for project visual identity. */
export type DesignArchetype = 'warm' | 'professional' | 'bold';

/** Build DesignTokensSpec from archetype choice. */
export function buildDesignTokensSpec(archetype: DesignArchetype): DesignTokensSpec {
  const archetypes: Record<DesignArchetype, Pick<DesignTokensSpec, 'colors' | 'typography' | 'elevation'>> = {
    warm: {
      colors: {
        primitive: {
          'warm-cream': '#FFF8E7',
          'deep-teal': '#0F6E56',
          'coral-accent': '#E8593C',
          'warm-gray': '#444441',
          'soft-white': '#FAFAF8',
          'warm-gray-light': '#9C9C97',
        },
        semantic: {
          'background-primary': 'warm-cream',
          'surface-primary': 'warm-cream',
          'surface-elevated': 'soft-white',
          'text-primary': 'warm-gray',
          'text-secondary': 'warm-gray-light',
          'text-disabled': 'warm-gray-light',
          'text-on-cta': 'warm-cream',
          'cta-primary': 'deep-teal',
          'cta-hover': 'deep-teal',
          'border-default': 'warm-gray-light',
          'border-focus': 'deep-teal',
          'border-error': 'coral-accent',
          error: 'coral-accent',
          success: 'deep-teal',
          warning: 'coral-accent',
          info: 'deep-teal',
          overlay: 'rgba(0,0,0,0.5)',
          'surface-secondary': 'soft-white',
        },
      },
      elevation: {
        levels: [
          { level: 0, shadow: 'none', description: 'Flat, no elevation' },
          { level: 1, shadow: '0 2px 8px rgba(15,110,86,0.06)', description: 'Cards resting on surface' },
          { level: 2, shadow: '0 4px 16px rgba(15,110,86,0.10)', description: 'Dropdowns, popovers' },
          { level: 3, shadow: '0 8px 32px rgba(15,110,86,0.14)', description: 'Modals, dialogs' },
        ],
      },
      typography: {
        font_families: { display: 'Nunito', body: 'Open Sans' },
        scale: [
          { role: 'heading-1', size: 32, weight: 700, family: 'display', line_height: 1.2 },
          { role: 'heading-2', size: 24, weight: 700, family: 'display', line_height: 1.25 },
          { role: 'heading-3', size: 18, weight: 600, family: 'display', line_height: 1.3 },
          { role: 'body', size: 14, weight: 400, family: 'body', line_height: 1.5 },
          { role: 'label', size: 12, weight: 500, family: 'body', line_height: 1.4 },
          { role: 'small', size: 11, weight: 400, family: 'body', line_height: 1.4 },
        ],
      },
    },
    professional: {
      colors: {
        primitive: {
          white: '#FFFFFF',
          slate: '#334155',
          'blue-accent': '#2563EB',
          'light-gray': '#F1F5F9',
          'dark-gray': '#1E293B',
          'mid-gray': '#94A3B8',
        },
        semantic: {
          'background-primary': 'white',
          'surface-primary': 'white',
          'surface-elevated': 'light-gray',
          'text-primary': 'dark-gray',
          'text-secondary': 'slate',
          'text-disabled': 'mid-gray',
          'text-on-cta': 'white',
          'cta-primary': 'blue-accent',
          'cta-hover': 'blue-accent',
          'border-default': 'light-gray',
          'border-focus': 'blue-accent',
          'border-error': '#DC2626',
          error: '#DC2626',
          success: '#16A34A',
          warning: '#CA8A04',
          info: 'blue-accent',
          overlay: 'rgba(0,0,0,0.5)',
          'surface-secondary': 'light-gray',
        },
      },
      elevation: {
        levels: [
          { level: 0, shadow: 'none', description: 'Flat, no elevation' },
          { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.08)', description: 'Cards resting on surface' },
          { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Dropdowns, popovers' },
          { level: 3, shadow: '0 8px 24px rgba(0,0,0,0.16)', description: 'Modals, dialogs' },
        ],
      },
      typography: {
        font_families: { display: 'DM Sans', body: 'Inter' },
        scale: [
          { role: 'heading-1', size: 32, weight: 700, family: 'display', line_height: 1.2 },
          { role: 'heading-2', size: 24, weight: 700, family: 'display', line_height: 1.25 },
          { role: 'heading-3', size: 18, weight: 600, family: 'display', line_height: 1.3 },
          { role: 'body', size: 14, weight: 400, family: 'body', line_height: 1.5 },
          { role: 'label', size: 12, weight: 500, family: 'body', line_height: 1.4 },
          { role: 'small', size: 11, weight: 400, family: 'body', line_height: 1.4 },
        ],
      },
    },
    bold: {
      colors: {
        primitive: {
          'near-black': '#0A0A0A',
          'electric-violet': '#7C3AED',
          'lime-accent': '#84CC16',
          zinc: '#3F3F46',
          'off-white': '#FAFAFA',
          'dim-gray': '#71717A',
        },
        semantic: {
          'background-primary': 'near-black',
          'surface-primary': 'near-black',
          'surface-elevated': 'zinc',
          'text-primary': 'off-white',
          'text-secondary': 'dim-gray',
          'text-disabled': 'dim-gray',
          'text-on-cta': 'off-white',
          'cta-primary': 'electric-violet',
          'cta-hover': 'electric-violet',
          'border-default': 'zinc',
          'border-focus': 'electric-violet',
          'border-error': '#EF4444',
          error: '#EF4444',
          success: 'lime-accent',
          warning: '#F59E0B',
          info: 'electric-violet',
          overlay: 'rgba(0,0,0,0.7)',
          'surface-secondary': 'zinc',
        },
      },
      elevation: {
        levels: [
          { level: 0, shadow: 'none', description: 'Flat, no elevation' },
          { level: 1, shadow: '0 2px 6px rgba(0,0,0,0.24)', description: 'Cards resting on surface' },
          { level: 2, shadow: '0 4px 16px rgba(0,0,0,0.32)', description: 'Dropdowns, popovers' },
          { level: 3, shadow: '0 8px 32px rgba(0,0,0,0.40)', description: 'Modals, dialogs' },
        ],
      },
      typography: {
        font_families: { display: 'Space Grotesk', body: 'IBM Plex Sans' },
        scale: [
          { role: 'heading-1', size: 32, weight: 700, family: 'display', line_height: 1.2 },
          { role: 'heading-2', size: 24, weight: 700, family: 'display', line_height: 1.25 },
          { role: 'heading-3', size: 18, weight: 600, family: 'display', line_height: 1.3 },
          { role: 'body', size: 14, weight: 400, family: 'body', line_height: 1.5 },
          { role: 'label', size: 12, weight: 500, family: 'body', line_height: 1.4 },
          { role: 'small', size: 11, weight: 400, family: 'body', line_height: 1.4 },
        ],
      },
    },
  };

  const preset = archetypes[archetype];
  return {
    version: '1.0',
    created_by: 'agentforge-init',
    colors: preset.colors,
    typography: preset.typography,
    spacing: DEFAULT_LAYOUT_TOKENS.spacing,
    borders: DEFAULT_LAYOUT_TOKENS.borders,
    touch_targets: DEFAULT_LAYOUT_TOKENS.touch_targets,
    elevation: preset.elevation,
    layout: DEFAULT_LAYOUT_TOKENS.layout,
    z_index: DEFAULT_LAYOUT_TOKENS.z_index,
    opacity: DEFAULT_OPACITY,
    motion: DEFAULT_MOTION,
    state: DEFAULT_STATE,
  } satisfies DesignTokensSpec;
}

/** Map archetype to brand tone. */
const ARCHETYPE_TONES: Record<DesignArchetype, string> = {
  warm: 'playful-warm',
  professional: 'professional-clean',
  bold: 'bold-modern',
};

/** Build BrandSpec from archetype + audience. */
export function buildBrandSpec(archetype: DesignArchetype, audience: string): BrandSpec {
  if (!audience) {
    debugLog('buildBrandSpec: audience not provided → default: "general"');
  }
  return {
    version: '1.0',
    created_by: 'agentforge-init',
    identity: {
      tone: ARCHETYPE_TONES[archetype],
      audience: audience || 'general',
    },
    illustration_style: {
      direction: 'minimal',
      description: 'Clean illustrations with accent color highlights',
    },
    motion_principles: {
      page_transitions: 'fade',
      interaction_feel: 'snappy',
      easing: 'ease-out',
      duration_base_ms: 200,
    },
    accessibility: {
      wcag_level: 'AA',
    },
  };
}
