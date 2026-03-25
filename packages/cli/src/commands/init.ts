/**
 * @module @agentforge/cli/commands/init
 *
 * The `agentforge init` command. Scaffolds a new AgentForge project
 * with an opinionated quick-start wizard (5 questions, under 3 minutes).
 */

import * as path from 'node:path';
import * as readline from 'node:readline';
import type { ProjectManifest } from '../types.js';
import { writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, infoMsg, errorMsg } from '../formatter.js';
import { renderAllTemplates } from '../template-renderer.js';
import { setupEngine, checkPrerequisites } from '../engine-setup.js';
import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';
import { saveDesignTokens, saveBrandSpec, loadBaseCatalog, generateProjectCatalog, saveComponentCatalog } from '@agentforge/core';
import { pickComponentLibrary } from './design-system.js';
import { generateDesignOptions, SHARED_LAYOUT } from './generate-design-options.js';
import { promptOnce } from './generate-design-options.js';

/** Design archetype choice for project visual identity. */
export type DesignArchetype = 'warm' | 'professional' | 'bold';

/**
 * Answers collected from the init wizard.
 */
export interface InitAnswers {
  readonly name: string;
  readonly description: string;
  readonly repo: string;
  readonly slackChannel: string;
  readonly telegramEnabled: boolean;
  readonly designArchetype?: DesignArchetype;
  readonly targetAudience: string;
}

/**
 * Configuration for init command behavior (e.g. in tests).
 */
export interface InitConfig {
  /** Override browser opener. Return true if browser opened. */
  readonly openBrowser?: (url: string) => Promise<boolean>;
}

/** Build DesignTokensSpec from archetype choice. */
export function buildDesignTokensSpec(archetype: DesignArchetype): DesignTokensSpec {
  const archetypes: Record<DesignArchetype, Pick<DesignTokensSpec, 'colors' | 'typography' | 'components' | 'elevation'>> = {
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
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium', padding_x: 24, padding_y: 12, min_height: 44 },
          secondary: { bg: 'transparent', text: 'cta-primary', border_color: 'warm-gray', border_width: 1, radius: 'medium' },
          ghost: { bg: 'transparent', text: 'cta-primary', radius: 'medium' },
        },
        card: {
          default: { bg: 'background-primary', border_color: 'soft-white', border_width: 1, border_style: 'solid', radius: 'large', padding: 24 },
          highlighted: { bg: 'soft-white', border_color: 'cta-primary', border_width: 2, border_style: 'solid', radius: 'large', padding: 24 },
        },
        input: {
          default: { bg: 'background-primary', text: 'text-primary', border_color: 'warm-gray', radius: 'medium', padding_x: 16, padding_y: 12, min_height: 44 },
          focus: { border_color: 'cta-primary', border_width: 2 },
          error: { border_color: 'error', border_width: 2 },
        },
        tab_bar: {
          active: { bg: 'cta-primary', text: 'background-primary', radius: 'pill' },
          inactive: { bg: 'transparent', text: 'text-primary' },
        },
        badge: {
          success: { bg: 'deep-teal', text: 'background-primary', radius: 'pill' },
          warning: { bg: 'warm-cream', text: 'text-primary', radius: 'pill' },
          error: { bg: 'error', text: 'background-primary', radius: 'pill' },
          info: { bg: 'cta-primary', text: 'background-primary', radius: 'pill' },
        },
        avatar: { default: { size: 40, border_radius: 'pill', border_color: 'warm-gray', border_width: 2 } },
        progress_bar: {
          track: { bg: 'soft-white', radius: 'pill', height: 8 },
          fill: { bg: 'cta-primary', radius: 'pill' },
        },
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
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium', padding_x: 24, padding_y: 12, min_height: 44 },
          secondary: { bg: 'transparent', text: 'cta-primary', border_color: 'slate', border_width: 1, radius: 'medium' },
          ghost: { bg: 'transparent', text: 'cta-primary', radius: 'medium' },
        },
        card: {
          default: { bg: 'background-primary', border_color: 'light-gray', border_width: 1, border_style: 'solid', radius: 'large', padding: 24 },
          highlighted: { bg: 'light-gray', border_color: 'cta-primary', border_width: 2, border_style: 'solid', radius: 'large', padding: 24 },
        },
        input: {
          default: { bg: 'background-primary', text: 'text-primary', border_color: 'light-gray', radius: 'medium', padding_x: 16, padding_y: 12, min_height: 44 },
          focus: { border_color: 'cta-primary', border_width: 2 },
          error: { border_color: 'error', border_width: 2 },
        },
        tab_bar: {
          active: { bg: 'cta-primary', text: 'background-primary', radius: 'pill' },
          inactive: { bg: 'transparent', text: 'text-primary' },
        },
        badge: {
          success: { bg: 'light-gray', text: 'text-primary', radius: 'pill' },
          warning: { bg: 'light-gray', text: 'dark-gray', radius: 'pill' },
          error: { bg: 'error', text: 'background-primary', radius: 'pill' },
          info: { bg: 'cta-primary', text: 'background-primary', radius: 'pill' },
        },
        avatar: { default: { size: 40, border_radius: 'pill', border_color: 'light-gray', border_width: 2 } },
        progress_bar: {
          track: { bg: 'light-gray', radius: 'pill', height: 8 },
          fill: { bg: 'cta-primary', radius: 'pill' },
        },
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
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium', padding_x: 24, padding_y: 12, min_height: 44 },
          secondary: { bg: 'transparent', text: 'cta-primary', border_color: 'zinc', border_width: 1, radius: 'medium' },
          ghost: { bg: 'transparent', text: 'cta-primary', radius: 'medium' },
        },
        card: {
          default: { bg: 'background-primary', border_color: 'zinc', border_width: 1, border_style: 'solid', radius: 'large', padding: 24 },
          highlighted: { bg: 'zinc', border_color: 'cta-primary', border_width: 2, border_style: 'solid', radius: 'large', padding: 24 },
        },
        input: {
          default: { bg: 'background-primary', text: 'text-primary', border_color: 'zinc', radius: 'medium', padding_x: 16, padding_y: 12, min_height: 44 },
          focus: { border_color: 'cta-primary', border_width: 2 },
          error: { border_color: 'error', border_width: 2 },
        },
        tab_bar: {
          active: { bg: 'cta-primary', text: 'text-primary', radius: 'pill' },
          inactive: { bg: 'transparent', text: 'text-primary' },
        },
        badge: {
          success: { bg: 'lime-accent', text: 'near-black', radius: 'pill' },
          warning: { bg: 'zinc', text: 'text-primary', radius: 'pill' },
          error: { bg: 'error', text: 'text-primary', radius: 'pill' },
          info: { bg: 'cta-primary', text: 'text-primary', radius: 'pill' },
        },
        avatar: { default: { size: 40, border_radius: 'pill', border_color: 'zinc', border_width: 2 } },
        progress_bar: {
          track: { bg: 'zinc', radius: 'pill', height: 8 },
          fill: { bg: 'cta-primary', radius: 'pill' },
        },
      },
    },
  };

  const preset = archetypes[archetype];
  return {
    version: '1.0',
    created_by: 'agentforge-init',
    colors: preset.colors,
    typography: preset.typography,
    spacing: SHARED_LAYOUT.spacing,
    borders: SHARED_LAYOUT.borders,
    touch_targets: SHARED_LAYOUT.touch_targets,
    elevation: preset.elevation,
    layout: SHARED_LAYOUT.layout,
    z_index: SHARED_LAYOUT.z_index,
    ...(preset.components ? { components: preset.components } : {}),
  };
}

/** Map archetype to brand tone. */
const ARCHETYPE_TONES: Record<DesignArchetype, string> = {
  warm: 'playful-warm',
  professional: 'professional-clean',
  bold: 'bold-modern',
};

/** Build BrandSpec from archetype + audience. */
export function buildBrandSpec(archetype: DesignArchetype, audience: string): BrandSpec {
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

/** Generate tailwind.config.ts content from design tokens (shadcn conventions). */
export function generateTailwindConfig(tokens: DesignTokensSpec): string {
  const shadowEntries = tokens.elevation.levels
    .filter((l) => l.shadow !== 'none')
    .map((l) => `        '${l.level}': '${l.shadow}',`)
    .join('\n');

  const zIndexEntries = Object.entries(tokens.z_index)
    .map(([name, val]) => `        '${name}': '${val}',`)
    .join('\n');

  const screenEntries = Object.entries(tokens.layout.breakpoints)
    .map(([name, val]) => `        '${name}': '${val}px',`)
    .join('\n');

  return `import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
${shadowEntries}
      },
      zIndex: {
${zIndexEntries}
      },
      screens: {
${screenEntries}
      },
      maxWidth: {
        'content': '${tokens.layout.content_max_width}px',
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

/** Convert hex color to HSL channels string: "#0F6E56" -> "160 76% 24%" */
export function hexToHSLChannels(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Resolve a semantic color value to hex. If already hex, return as-is. Otherwise look up in primitives. */
function resolveToHex(value: string, primitives: Record<string, string>): string {
  if (value.startsWith('#')) return value;
  if (value.startsWith('rgba')) return value;
  return primitives[value] ?? '#888888';
}

/**
 * Maps AgentForge semantic color names to shadcn CSS variable names.
 * Translation layer — lives in the generator only.
 */
const SHADCN_VARIABLE_MAP: Record<string, string> = {
  'background-primary': 'background',
  'surface-primary':    'card',
  'surface-elevated':   'popover',
  'text-primary':       'foreground',
  'cta-primary':        'primary',
  'cta-hover':          'accent',
  'border-default':     'border',
  'border-focus':       'ring',
  'error':              'destructive',
  'success':            'success',
  'warning':            'warning',
  'info':               'info',
  'overlay':            'overlay',
};

/**
 * shadcn variables that need a paired "-foreground" variable.
 * Maps the base variable name to which AgentForge semantic color to use for the foreground.
 */
const SHADCN_FOREGROUND_PAIRS: Record<string, string> = {
  'card':        'text-primary',
  'popover':     'text-primary',
  'primary':     'text-on-cta',
  'secondary':   'text-primary',
  'muted':       'text-secondary',
  'accent':      'text-primary',
  'destructive': 'text-on-cta',
};

/** Generate global.css with shadcn CSS custom properties. */
export function generateGlobalCss(tokens: DesignTokensSpec): string {
  const families = Object.values(tokens.typography.font_families)
    .map((f) => f.replace(/\s+/g, '+'))
    .join('&family=');
  const importUrl = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;

  const primitives = tokens.colors.primitive;
  const lines: string[] = [];

  // Standard shadcn variables from AgentForge semantic tokens
  for (const [afName, shadcnName] of Object.entries(SHADCN_VARIABLE_MAP)) {
    const value = tokens.colors.semantic[afName];
    if (!value) continue;

    if (afName === 'overlay' || value.startsWith('rgba')) {
      lines.push(`    --${shadcnName}: ${value};`);
    } else {
      const hex = resolveToHex(value, primitives);
      lines.push(`    --${shadcnName}: ${hexToHSLChannels(hex)};`);
    }
  }

  // Foreground pairs (shadcn expects --card-foreground, --primary-foreground, etc.)
  for (const [baseName, afForegroundKey] of Object.entries(SHADCN_FOREGROUND_PAIRS)) {
    const fgValue = tokens.colors.semantic[afForegroundKey];
    if (!fgValue) continue;
    const hex = resolveToHex(fgValue, primitives);
    lines.push(`    --${baseName}-foreground: ${hexToHSLChannels(hex)};`);
  }

  // Additional shadcn variables
  const inputHex = resolveToHex(tokens.colors.semantic['border-default'] || '', primitives);
  lines.push(`    --input: ${hexToHSLChannels(inputHex)};`);

  // Secondary and muted both map to surface-secondary (or surface-primary fallback)
  const secondaryValue = tokens.colors.semantic['surface-secondary'] ?? tokens.colors.semantic['surface-primary'];
  if (secondaryValue) {
    const hex = resolveToHex(secondaryValue, primitives);
    lines.push(`    --secondary: ${hexToHSLChannels(hex)};`);
    lines.push(`    --muted: ${hexToHSLChannels(hex)};`);
  }

  // Border radius from design tokens
  const radiusRem = (tokens.borders.radius.medium / 16).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  lines.push(`    --radius: ${radiusRem}rem;`);

  // Elevation shadows as CSS variables
  for (const level of tokens.elevation.levels) {
    if (level.shadow !== 'none') {
      lines.push(`    --shadow-${level.level}: ${level.shadow};`);
    }
  }

  return `@import url('${importUrl}');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
${lines.join('\n')}
  }
}
`;
}

/**
 * Prompt the user for a single line of input.
 */
function prompt(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Run the interactive init wizard and return collected answers.
 */
// DEVIATION: ADR-019
// PRD v2.0 Section 9.1.1 specifies: interactive CLI wizard with 5 questions
// Implementation: wizard requires TTY; no --non-interactive flag for CI environments
// Rationale: see ADR-019 — non-interactive mode deferred to Phase 2
export async function runWizard(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<InitAnswers> {
  const rl = readline.createInterface({ input, output });

  try {
    output.write('\nWelcome to AgentForge!\n\n');

    const name = await prompt(rl, 'Project name');
    const repo = await prompt(rl, 'GitHub org/repo');
    const slackChannel = await prompt(rl, 'Primary Slack channel', '#agentforge');
    const telegramAnswer = await prompt(rl, 'Enable Telegram? (y/n)', 'y');
    const telegramEnabled = telegramAnswer.toLowerCase() !== 'n';

    return { name, description: '', repo, slackChannel, telegramEnabled, targetAudience: '' };
  } finally {
    rl.close();
  }
}

/**
 * Generate a simple project ID from the name.
 */
function generateProjectId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  const suffix = Math.random().toString(36).substring(2, 8);
  return `proj_${slug}_${suffix}`;
}

/**
 * Build the project manifest from wizard answers.
 */
export function buildManifest(answers: InitAnswers): ProjectManifest {
  const [org, repoName] = answers.repo.includes('/')
    ? answers.repo.split('/')
    : ['', answers.repo];

  const channels = [
    { type: 'slack' as const, capabilities: 'full' as const, priority: 1 },
    ...(answers.telegramEnabled
      ? [{ type: 'telegram' as const, capabilities: 'approvals' as const, priority: 2 }]
      : []),
    { type: 'cli' as const, capabilities: 'basic' as const, priority: 3 },
  ];

  return {
    version: '1.0',
    project: {
      name: answers.name,
      id: generateProjectId(answers.name),
      description: answers.description || undefined,
      platforms: ['web'],
    },
    stack: {
      frontend: 'react',
      backend: 'node',
      database: 'postgresql',
      styling: 'tailwind',
    },
    repo: {
      provider: 'github',
      org,
      name: repoName,
    },
    agents: {
      providers: {
        default: 'claude-sonnet-4',
        overrides: {
          architecture: 'claude-opus-4',
          code_review: 'claude-haiku-4',
        },
      },
      sandbox: {
        type: 'github_actions',
        timeout_minutes: 15,
        max_retries: 3,
      },
      orchestration: {
        max_concurrent_agents: 3,
        ci_wait_strategy: 'spawn_next',
      },
    },
    hitl: {
      default: 'review_and_override',
      overrides: {
        design: 'full_approval',
        production_deploy: 'full_approval',
        test_generation: 'notify_only',
      },
    },
    channels,
    routing: {
      approval_requests: 'all',
      status_updates: 'primary',
      critical_alerts: 'all',
    },
    budget: {
      per_task_max_usd: 2.0,
      per_phase_max_usd: 25.0,
      monthly_max_usd: 200.0,
      alert_threshold: 0.8,
    },
  };
}

/**
 * Default agent definitions for Phase 1.
 *
 * Each agent contract includes all 7 sections required by PRD v2.0 Section 10.1:
 * role, provider, execution, tools, permissions, hitl_policy, budget.
 *
 * DEVIATION: ADR-010
 * PRD v2.0 Section 10.1 specifies: 7-section agent contracts
 * Implementation: previously used 5-field simplified format; now includes all 7 sections
 * Rationale: see ADR-010
 */
function buildAgentsYaml(manifest: ProjectManifest): Record<string, unknown> {
  const defaultBudget = {
    max_tokens_per_task: 50000,
    max_cost_per_task_usd: manifest.budget.per_task_max_usd,
  };

  const defaultExecution = {
    mode: 'stream',
    progress_events: true,
  };

  return {
    version: '1.0',
    agents: [
      {
        role: 'ux_researcher',
        phase: 'design',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['figma_mcp.get_code', 'spec.read_project', 'spec.read_pages'],
        permissions: ['read_spec', 'read_design_system', 'read_design'],
        denied: ['write_code', 'deploy', 'merge_pr'],
        hitl_policy: 'notify_only',
        budget: { ...defaultBudget },
        on_complete: 'UXResearchComplete',
        on_error: 'notify_human',
      },
      {
        role: 'wireframer',
        phase: 'design',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['figma_mcp.get_code', 'figma_mcp.generate_figma_design'],
        permissions: ['read_spec', 'write_design', 'read_design_system'],
        denied: ['write_code', 'deploy', 'merge_pr'],
        hitl_policy: 'full_approval',
        budget: { ...defaultBudget },
        on_complete: 'WireframeComplete',
        on_error: 'notify_human',
      },
      {
        role: 'spec_writer',
        phase: 'spec',
        provider: manifest.agents.providers.overrides?.['architecture'] ?? manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['spec.read_project', 'spec.write_spec', 'spec.read_pages'],
        permissions: ['read_spec', 'write_spec', 'read_design'],
        denied: ['write_code', 'deploy', 'merge_pr', 'write_design'],
        hitl_policy: 'review_and_override',
        budget: { ...defaultBudget },
        on_complete: 'SpecComplete',
        on_error: 'notify_human',
      },
      {
        role: 'task_decomposer',
        phase: 'spec',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['spec.read_spec', 'tasks.create_task', 'tasks.read_tasks'],
        permissions: ['read_spec', 'write_tasks'],
        denied: ['write_code', 'deploy', 'merge_pr', 'write_design'],
        hitl_policy: 'notify_only',
        budget: { ...defaultBudget },
        on_complete: 'TasksCreated',
        on_error: 'notify_human',
      },
      {
        role: 'code_generator',
        phase: 'code',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['code.write_file', 'code.read_file', 'spec.read_spec', 'git.create_branch', 'git.commit'],
        permissions: ['read_spec', 'write_code', 'create_branch', 'create_pr'],
        denied: ['deploy', 'merge_pr', 'write_design', 'write_spec'],
        hitl_policy: 'review_and_override',
        budget: { ...defaultBudget },
        on_complete: 'CodeGenComplete',
        on_error: 'notify_human',
      },
      {
        role: 'test_writer',
        phase: 'code',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['code.write_file', 'code.read_file', 'spec.read_spec', 'test.run_tests'],
        permissions: ['read_spec', 'read_code', 'write_tests'],
        denied: ['deploy', 'merge_pr', 'write_design', 'write_spec'],
        hitl_policy: 'notify_only',
        budget: { ...defaultBudget },
        on_complete: 'TestsComplete',
        on_error: 'notify_human',
      },
      {
        role: 'code_reviewer',
        phase: 'code',
        provider: manifest.agents.providers.overrides?.['code_review'] ?? manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['code.read_file', 'git.read_diff', 'spec.read_spec'],
        permissions: ['read_code', 'read_spec', 'write_review'],
        denied: ['write_code', 'deploy', 'merge_pr', 'write_design'],
        hitl_policy: 'review_and_override',
        budget: { ...defaultBudget },
        on_complete: 'ReviewComplete',
        on_error: 'notify_human',
      },
    ],
  };
}

/**
 * Scaffold the project directory structure.
 * Creates the minimal project layout without design system files.
 * Design system is generated later via `agentforge design:generate` after
 * the user provides a PRD via `agentforge describe`.
 */
export function scaffoldProject(
  rootDir: string,
  manifest: ProjectManifest,
  fileSystem: FileSystem = realFs,
  templateContents?: Map<string, string>,
): string[] {
  const created: string[] = [];

  // Create spec directory (on-demand spec files like pages.yaml, api.yaml,
  // models.yaml are NOT created here — they are written by the first agent
  // that needs them, with schema comment headers for context)
  const specDir = path.join(rootDir, 'agentforge', 'spec');
  fileSystem.mkdir(specDir);

  // Create learnings directory
  const learningsDir = path.join(rootDir, '.agentforge', 'learnings');
  fileSystem.mkdir(learningsDir);
  created.push('.agentforge/learnings/');

  // Create audit directory
  const auditDir = path.join(rootDir, '.agentforge', 'audit');
  fileSystem.mkdir(auditDir);
  created.push('.agentforge/audit/');

  // Create locks directory
  const locksDir = path.join(rootDir, '.agentforge', 'locks');
  fileSystem.mkdir(locksDir);
  created.push('.agentforge/locks/');

  // Write initial trust state
  const trustStatePath = path.join(rootDir, '.agentforge', 'trust-state.yaml');
  writeYaml(trustStatePath, { version: '1.0', trust: {} }, fileSystem);
  created.push('.agentforge/trust-state.yaml');

  // Create app directories
  const appDirs = [
    'src/components',
    'src/pages',
    'src/api',
    'src/lib',
    'prisma',
  ];
  for (const dir of appDirs) {
    fileSystem.mkdir(path.join(rootDir, dir));
    created.push(`${dir}/`);
  }

  // Write project manifest
  const manifestPath = path.join(rootDir, 'agentforge.yaml');
  writeYaml(manifestPath, manifest, fileSystem);
  created.push('agentforge.yaml');

  // Write empty tasks file
  const tasksPath = path.join(rootDir, 'agentforge.tasks.yaml');
  writeYaml(tasksPath, { tasks: [] }, fileSystem);
  created.push('agentforge.tasks.yaml');

  // DEVIATION: ADR-011
  // PRD v2.0 Section 10.1 specifies: agent contracts "in the project manifest"
  // Implementation: agent contracts stored in separate agentforge/agents.yaml
  // Rationale: see ADR-011 — consistent with PRD's per-file pattern, keeps manifest focused
  const agentsPath = path.join(rootDir, 'agentforge', 'agents.yaml');
  writeYaml(agentsPath, buildAgentsYaml(manifest), fileSystem);
  created.push('agentforge/agents.yaml');

  // Write seed spec files
  const projectSpec = {
    version: '1.0',
    app: {
      name: manifest.project.name,
      description: manifest.project.description || '',
    },
    adrs: [],
  };
  writeYaml(path.join(specDir, 'project.yaml'), projectSpec, fileSystem);
  created.push('agentforge/spec/project.yaml');

  // Create docs directory for PRD
  const docsDir = path.join(rootDir, 'docs');
  fileSystem.mkdir(docsDir);
  created.push('docs/');

  // Render and write scaffold templates
  const vars = { PROJECT_NAME: manifest.project.name };
  const templates = templateContents ?? renderAllTemplates(vars);
  for (const [outputPath, content] of templates) {
    const fullPath = path.join(rootDir, outputPath);
    const dir = path.dirname(fullPath);
    fileSystem.mkdir(dir);
    fileSystem.writeFile(fullPath, content);
    created.push(outputPath);
  }

  return created;
}


/**
 * Execute the full init command.
 */
export async function initCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  input?: NodeJS.ReadableStream,
  output?: NodeJS.WritableStream,
  _config?: InitConfig,
): Promise<void> {
  const out = output ?? process.stdout;

  // Create target directory if it doesn't exist
  if (!fileSystem.exists(rootDir)) {
    fileSystem.mkdir(rootDir);
  }

  // Guard: prevent initializing inside the AgentForge monorepo itself
  const monorepoMarkers = ['nx.json', 'packages'];
  const isMonorepo = monorepoMarkers.every((marker) =>
    fileSystem.exists(path.join(rootDir, marker)),
  );
  if (isMonorepo) {
    out.write(errorMsg('This looks like the AgentForge monorepo, not a user project.\n'));
    out.write(infoMsg('  Create a project in a separate directory:\n'));
    out.write(infoMsg('    agentforge init ./my-app\n'));
    out.write(infoMsg('    agentforge init /path/to/my-app\n'));
    process.exitCode = 1;
    return;
  }

  // Check if already initialized
  if (fileSystem.exists(path.join(rootDir, 'agentforge.yaml'))) {
    out.write(errorMsg(`${rootDir} already has an agentforge.yaml. Aborting.\n`));
    process.exitCode = 1;
    return;
  }

  const answers = await runWizard(input, output);
  const manifest = buildManifest(answers);

  scaffoldProject(rootDir, manifest, fileSystem);

  // DEVIATION: ADR-005
  // PRD v2.0 Section 9.1.1 specifies: "Connecting Slack... done" / "Connecting Telegram... done"
  // Implementation: init records channel preferences only, does not connect
  // Rationale: see ADR-005 — tokens require env vars, connection deferred to `start` command
  out.write('\n');
  out.write(successMsg('✓ Project scaffolded\n'));
  out.write(successMsg('✓ Agent definitions created\n'));
  if (answers.slackChannel) {
    out.write(infoMsg(`  Slack channel configured: ${answers.slackChannel}\n`));
  }
  if (answers.telegramEnabled) {
    out.write(infoMsg('  Telegram channel configured\n'));
  }

  // Design system setup — two independent steps:
  //   1. Component library (code architecture)
  //   2. Visual theme (LLM-generated colors/fonts/brand)
  const inp = input ?? process.stdin;
  out.write(infoMsg('\n--- Design System ---\n'));
  out.write(infoMsg('Set up your design system now?\n'));
  out.write(infoMsg('  1. Yes — pick component library + generate theme\n'));
  out.write(infoMsg('  2. Skip for now\n'));

  let designPathChoice: number | undefined;
  while (designPathChoice === undefined) {
    const answer = await promptOnce(inp, out, '\nChoose 1 or 2: ');
    const num = parseInt(answer, 10);
    if (num === 1 || num === 2) {
      designPathChoice = num;
    } else {
      out.write(infoMsg('Please enter 1 or 2.\n'));
    }
  }

  if (designPathChoice === 1) {
    // Step 1: Component library
    const selectedLibrary = await pickComponentLibrary(rootDir, inp, out, fileSystem);

    // Step 2: Visual theme (LLM or fallback archetypes)
    out.write(infoMsg('\nNow let\'s pick your visual theme...\n'));
    const designResult = await generateDesignOptions(
      { appName: answers.name, description: answers.description, targetAudience: answers.targetAudience || 'general' },
      inp,
      out,
      _config,
    );
    saveDesignTokens(rootDir, designResult.tokens, fileSystem);
    saveBrandSpec(rootDir, designResult.brand, fileSystem);
    const tailwindContent = generateTailwindConfig(designResult.tokens);
    fileSystem.writeFile(path.join(rootDir, 'tailwind.config.ts'), tailwindContent);
    const stylesDir = path.join(rootDir, 'src', 'styles');
    fileSystem.mkdir(stylesDir);
    const cssContent = generateGlobalCss(designResult.tokens);
    fileSystem.writeFile(path.join(stylesDir, 'global.css'), cssContent);

    // Step 3: Generate project-specific component catalog
    const baseCatalog = loadBaseCatalog();
    const projectCatalog = generateProjectCatalog(baseCatalog, selectedLibrary.id, designResult.tokens);
    saveComponentCatalog(rootDir, projectCatalog, fileSystem);
    out.write(successMsg('✓ Component catalog generated\n'));

    out.write(successMsg('✓ Design system configured\n'));
  } else {
    out.write(infoMsg('Skipped. Run `agentforge design-system update` later to configure.\n'));
  }

  // Show cd hint when project was created in a subdirectory
  const cwd = process.cwd();
  const isSubdir = path.resolve(rootDir) !== path.resolve(cwd);
  const relPath = isSubdir ? path.relative(cwd, rootDir) : '';

  out.write('\n');
  out.write(successMsg('Next steps:\n'));
  if (relPath) {
    out.write(infoMsg(`  cd ${relPath}\n`));
  }
  out.write(infoMsg('  1. Describe your app:    agentforge describe\n'));
  out.write(infoMsg('  2. Set up env vars:      see .env.example\n'));
  out.write(infoMsg('  3. Verify integrations:  agentforge doctor\n'));
  out.write('\n');

  // Offer optional engine setup
  const engineStatus = checkPrerequisites(rootDir);
  if (!engineStatus.ready) {
    const rl = readline.createInterface({ input: input ?? process.stdin, output: out });
    const setupAnswer = await prompt(rl, '\nSet up the Python orchestration engine now? (y/n)', 'y');
    rl.close();

    if (setupAnswer.toLowerCase() !== 'n') {
      out.write(infoMsg('\nSetting up engine...\n'));
      const result = await setupEngine(rootDir, (msg) => {
        out.write(infoMsg(`${msg}\n`));
      });
      if (result.ok) {
        out.write(successMsg('✓ Engine ready.\n\n'));
      } else {
        out.write(errorMsg(`Engine setup failed: ${result.error.message}\n`));
        out.write(infoMsg('You can retry later with: agentforge setup\n\n'));
      }
    }
  }
}
