/**
 * Sample design tokens — test fixture.
 * Generic tokens for renderer tests; not tied to any specific app.
 * The renderer is project-agnostic; only this fixture provides concrete values.
 *
 * Source: split-easy/agentforge/spec/design-tokens.yaml
 * Keep in sync — these must match the real project tokens.
 */
import type { RendererTokens } from '../types/tokens.js';

export const SAMPLE_TOKENS: RendererTokens = {
  colors: {
    primitive: {
      'warm-cream': '#FFF8E7',
      'deep-teal': '#0F6E56',
      'coral-accent': '#E8593C',
      'warm-gray': '#444441',
      'soft-white': '#FAFAF8',
      'warm-gray-light': '#9C9C97',
      'white': '#FFFFFF',
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
      'error': 'coral-accent',
      'success': 'deep-teal',
      'warning': 'coral-accent',
      'info': 'deep-teal',
      'overlay': 'rgba(0,0,0,0.5)',
      'surface-secondary': 'soft-white',
      'surface-input': 'white',
    },
  },
  typography: {
    font_families: {
      display: 'Nunito',
      body: 'Open Sans',
    },
    scale: [
      { role: 'heading-1', size: 32, weight: 700, family: 'display', line_height: 1.2 },
      { role: 'heading-2', size: 24, weight: 700, family: 'display', line_height: 1.25 },
      { role: 'heading-3', size: 18, weight: 600, family: 'display', line_height: 1.3 },
      { role: 'body', size: 14, weight: 400, family: 'body', line_height: 1.5 },
      { role: 'label', size: 12, weight: 500, family: 'body', line_height: 1.4 },
      { role: 'small', size: 11, weight: 400, family: 'body', line_height: 1.4 },
    ],
  },
  elevation: {
    levels: [
      { level: 0, shadow: 'none', description: 'Flat, no elevation' },
      { level: 1, shadow: '0 2px 8px rgba(15,110,86,0.06)', description: 'Cards resting on surface' },
      { level: 2, shadow: '0 4px 16px rgba(15,110,86,0.10)', description: 'Dropdowns, popovers' },
      { level: 3, shadow: '0 8px 32px rgba(15,110,86,0.14)', description: 'Modals, dialogs' },
    ],
  },
  borders: {
    radius: {
      small: 8,
      medium: 12,
      large: 16,
      pill: 9999,
    },
  },
  spacing: {
    unit: 8,
    scale: [4, 8, 12, 16, 24, 32, 48, 64],
  },
};

/**
 * Resolved semantic -> hex map for test assertions.
 * This is what buildTokenMap() should produce from SAMPLE_TOKENS.
 */
export const SAMPLE_RESOLVED_COLORS: Record<string, string> = {
  // Primitives (name -> hex)
  'warm-cream': '#FFF8E7',
  'deep-teal': '#0F6E56',
  'coral-accent': '#E8593C',
  'warm-gray': '#444441',
  'soft-white': '#FAFAF8',
  'warm-gray-light': '#9C9C97',
  // Semantics (resolved through primitives)
  'background-primary': '#FFF8E7',
  'surface-primary': '#FFF8E7',
  'surface-elevated': '#FAFAF8',
  'text-primary': '#444441',
  'text-secondary': '#9C9C97',
  'text-disabled': '#9C9C97',
  'text-on-cta': '#FFF8E7',
  'cta-primary': '#0F6E56',
  'cta-hover': '#0F6E56',
  'border-default': '#9C9C97',
  'border-focus': '#0F6E56',
  'border-error': '#E8593C',
  'error': '#E8593C',
  'success': '#0F6E56',
  'warning': '#E8593C',
  'info': '#0F6E56',
  'surface-secondary': '#FAFAF8',
  'surface-input': '#FFFFFF',
  'overlay': 'rgba(0,0,0,0.5)',
  'white': '#FFFFFF',
};
