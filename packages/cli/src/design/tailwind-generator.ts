/**
 * @module @agentforge/cli/design/tailwind-generator
 *
 * Generates tailwind.config.ts and global.css from DesignTokensSpec.
 * Uses shadcn conventions for CSS custom properties (HSL channels).
 */

import type { DesignTokensSpec } from '@agentforge/core';

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
  'surface-primary': 'card',
  'surface-elevated': 'popover',
  'text-primary': 'foreground',
  'cta-primary': 'primary',
  'cta-hover': 'accent',
  'border-default': 'border',
  'border-focus': 'ring',
  'error': 'destructive',
  'success': 'success',
  'warning': 'warning',
  'info': 'info',
  'overlay': 'overlay',
};

/**
 * shadcn variables that need a paired "-foreground" variable.
 * Maps the base variable name to which AgentForge semantic color to use for the foreground.
 */
const SHADCN_FOREGROUND_PAIRS: Record<string, string> = {
  'card': 'text-primary',
  'popover': 'text-primary',
  'primary': 'text-on-cta',
  'secondary': 'text-primary',
  'muted': 'text-secondary',
  'accent': 'text-primary',
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
