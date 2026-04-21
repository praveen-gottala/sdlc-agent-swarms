# Implementation Plan: Expand LLM Design Generation Template

## Purpose

This document is the single implementation reference for expanding AgentForge's design system generation. It covers what to change, why, and the exact conventions to follow. The goal: after `agentforge init`, every generated file is complete enough for an agent to compose a full screen with zero follow-up setup.

---

## Architecture: Two-Layer Token System

AgentForge uses a two-layer token system. Understanding this separation is critical — every decision in this plan follows from it.

### Layer 1: Spec files (library-agnostic, agent-facing)

These files describe **design intent**. They use AgentForge's semantic naming convention. They are read by design agents, implementation agents, QA agents, and humans. They never contain library-specific names like `--primary` or `hsl(var(...))`.

| File | Purpose | Names like |
|------|---------|------------|
| `design-tokens.yaml` | Colors, typography, spacing, elevation, layout, z-index | `cta-primary`, `text-on-cta`, `surface-elevated` |
| `brand.yaml` | Tone, motion principles, accessibility level | `playful-warm`, `ease-out` |
| `component-catalog.yaml` | Component anatomy, states, token bindings, library mappings | `token_bindings.background: colors.semantic.cta-primary` |
| `component-library.yaml` | Which library, import paths, variant props | `library_id: shadcn` |

**Why agnostic?** These names describe intent. `cta-primary` means "the main call-to-action color" — any agent can reason about this. shadcn's `primary` means "the primary thing" — useless for design decisions. The design agent (which produces Penpot designs) has no concept of shadcn. The spec layer must work for all consumers.

### Layer 2: Runtime files (library-specific, generated)

These files are consumed by the app at build/runtime. They speak the chosen library's native language. They are generated deterministically from Layer 1 + the `library_id`.

| File | Purpose | For shadcn |
|------|---------|------------|
| `global.css` | CSS custom properties | `--primary: 160 76% 24%;` (HSL channels, shadcn names) |
| `tailwind.config.ts` | Tailwind theme extensions | `primary: 'hsl(var(--primary))'` |

**The generator is the bridge.** It reads `library_id` from `component-library.yaml`, reads token values from `design-tokens.yaml`, and produces library-native output. Translation happens once, in one place.

```
design-tokens.yaml         →  "cta-primary": "deep-teal"     (intent)
        │
   generator (reads library_id = shadcn)
        │
        ├──▶ global.css           --primary: 160 76% 24%;     (shadcn convention)
        └──▶ tailwind.config.ts   primary: 'hsl(var(--primary))' (shadcn convention)
                                         │
                                         ▼
                                  <Button className="bg-primary" />
```

### One project, one library

`component-library.yaml` has a single `library_id`. Applications do not mix libraries. The user picks one at init and everything downstream uses that convention. Currently only shadcn is supported. MUI and Chakra support will be added later as additional generator cases — the spec layer stays the same, only the runtime generation changes.

---

## Context

The `generateDesignOptions()` function in `packages/cli/src/commands/generate-design-options.ts` asks the LLM for colors and fonts, but the template is too thin to compose a full screen. The fix is expanding the *template* the LLM fills — one call, richer schema. The three hardcoded fallback archetypes (warm/professional/bold) need the same expansion so there's no quality gap between "has API key" and "doesn't." No backward compatibility concerns — product hasn't launched.

---

## Step 0: Deduplicate `SHARED_LAYOUT`

**Problem:** `SHARED_LAYOUT` is duplicated identically in `init.ts:46` and `generate-design-options.ts:22`. Expanding one will leave the other stale.

**Fix:** Delete `SHARED_LAYOUT` from `init.ts` and import it from `generate-design-options.ts` (which already exports it). Do this *before* any expansion.

**Files:**
- `packages/cli/src/commands/init.ts` — delete lines 45-50, add import from `./generate-design-options.js`
- `packages/cli/src/commands/generate-design-options.ts` — already exports it, no change needed

---

## Step 1: Add new type interfaces to core

**File:** `packages/core/src/types/design-system.ts`

Add after `TouchTargetSpec` (line 56):

```typescript
/** A single elevation level with shadow value and usage description. */
export interface ElevationLevel {
  readonly level: number;
  readonly shadow: string;        // CSS box-shadow value
  readonly description: string;   // e.g., "Cards resting on surface"
}

/** Elevation system defining shadow depth levels. */
export interface ElevationSpec {
  readonly levels: readonly ElevationLevel[];
}

/** Layout grid and breakpoint configuration. */
export interface LayoutSpec {
  readonly grid: {
    readonly columns: number;
    readonly gutter: number;
    readonly margin: number;
  };
  readonly content_max_width: number;
  readonly breakpoints: {
    readonly mobile: number;
    readonly tablet: number;
    readonly desktop: number;
    readonly wide: number;
  };
}

/** Z-index scale for layered UI elements. */
export interface ZIndexSpec {
  readonly dropdown: number;
  readonly sticky: number;
  readonly modal: number;
  readonly toast: number;
  readonly tooltip: number;
}
```

Update `DesignTokensSpec` — add as **required** fields (no backward compat needed, product not launched):

```typescript
export interface DesignTokensSpec {
  readonly version: string;
  readonly created_by: string;
  readonly colors: ColorSpec;
  readonly typography: TypographySpec;
  readonly spacing: SpacingSpec;
  readonly borders: BorderSpec;
  readonly touch_targets: TouchTargetSpec;
  readonly elevation: ElevationSpec;      // NEW — required
  readonly layout: LayoutSpec;            // NEW — required
  readonly z_index: ZIndexSpec;           // NEW — required
  readonly components?: ComponentTokens;
}
```

---

## Step 2: Export new types from core barrel

**File:** `packages/core/src/index.ts` (line 178-202, design system type export block)

Add `ElevationLevel`, `ElevationSpec`, `LayoutSpec`, `ZIndexSpec` to the existing design system type exports.

---

## Step 3: Expand `SHARED_LAYOUT` and add `DEFAULT_ELEVATION`

**File:** `packages/cli/src/commands/generate-design-options.ts`

Expand `SHARED_LAYOUT` (line 22) to include `layout` and `z_index`. These are functional infrastructure — they don't vary by aesthetic direction, so they are never LLM-generated:

```typescript
export const SHARED_LAYOUT = {
  spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32, 48, 64] as readonly number[] },
  borders: { radius: { small: 8, medium: 12, large: 16, pill: 9999 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  layout: {
    grid: { columns: 12, gutter: 24, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
} as const;
```

Add `DEFAULT_ELEVATION` constant (used when LLM omits elevation):

```typescript
const DEFAULT_ELEVATION: ElevationSpec = {
  levels: [
    { level: 0, shadow: 'none', description: 'Flat, no elevation' },
    { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.08)', description: 'Cards resting on surface' },
    { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Dropdowns, popovers' },
    { level: 3, shadow: '0 8px 24px rgba(0,0,0,0.16)', description: 'Modals, dialogs' },
  ],
};
```

---

## Step 4: Expand `DesignOption` interface and `buildFallbackOptions()`

**Combined as a single step** to avoid partial implementation (the field and its wiring must ship together).

**File:** `packages/cli/src/commands/generate-design-options.ts`

The `DesignOption` interface (line 39) uses `Record<string, string> & { required fields }` for semantic colors. The `Record<string, string>` already accepts any string key, so adding 13 optional typed keys would be cosmetic — it wouldn't provide real enforcement. **Leave the semantic color type as-is** (4 hard-required keys in the intersection). Real enforcement for the 13 new keys happens in `backfillSemanticColors()` (step 6).

Add `elevation?` field to `DesignOption`:

```typescript
readonly elevation?: {
  readonly levels: readonly {
    readonly level: number;
    readonly shadow: string;
    readonly description: string;
  }[];
};
```

Update `buildFallbackOptions()` (line 291) to extract elevation from archetype tokens:

```typescript
return {
  label,
  vibe,
  colors: { primitive: tokens.colors.primitive, semantic },
  fonts: tokens.typography.font_families as { display: string; body: string },
  brand: { /* ... existing ... */ },
  elevation: tokens.elevation,  // NEW — pass archetype-specific elevation through
};
```

---

## Step 5: Expand the LLM prompt

**File:** `packages/cli/src/commands/generate-design-options.ts`, `buildSystemPrompt()` (line 72)

Changes to the JSON schema in the prompt:

1. **Primitive colors**: Change "Exactly 5" to "5-8" in rules
2. **Semantic colors**: Expand to 17 required keys:
   ```
   "background-primary", "surface-primary", "surface-elevated",
   "text-primary", "text-secondary", "text-disabled", "text-on-cta",
   "cta-primary", "cta-hover",
   "border-default", "border-focus", "border-error",
   "error", "success", "warning", "info",
   "overlay"
   ```
3. **Add elevation section** to the JSON schema:
   ```json
   "elevation": {
     "levels": [
       { "level": 0, "shadow": "none", "description": "Flat, no elevation" },
       { "level": 1, "shadow": "0 1px 3px rgba(0,0,0,0.08)", "description": "Cards on surface" },
       { "level": 2, "shadow": "CSS box-shadow", "description": "usage" },
       { "level": 3, "shadow": "CSS box-shadow", "description": "usage" }
     ]
   }
   ```
4. **Updated rules**:
   - "5-8 primitive colors per option, using kebab-case names"
   - "All 17 semantic keys are required"
   - "overlay must be an rgba value for modal backdrops"
   - "Elevation shadows should feel cohesive with the design direction"
5. **Keep** components, typography, spacing sections as-is

Also update `parseLLMResponse()` (line 190): The existing `< 5` check handles the lower bound correctly for "5-8". Add an upper-bound **warning** (not rejection) when `> 8` primitives are returned — excessive primitives usually mean the LLM misunderstood the prompt:

```typescript
const primCount = Object.keys(opt.colors.primitive).length;
if (primCount < 5) return false;
if (primCount > 8) warnMsg(`Option "${opt.label}" has ${primCount} primitive colors (expected 5-8).\n`);
```

---

## Step 6: Add `backfillSemanticColors()` and `backfillElevation()`

**File:** `packages/cli/src/commands/generate-design-options.ts`

Add after `backfillComponents()` (line 243).

**Derivation map** — order is intentional (resolution order). Keys that other keys depend on must come first (e.g., `text-secondary` before `border-default`):

```typescript
// Order matters: entries are resolved top-to-bottom.
// text-secondary must be filled before border-default (which derives from it).
const SEMANTIC_COLOR_DEFAULTS: Record<string, (opt: DesignOption) => string> = {
  'surface-primary': (opt) => opt.colors.semantic['background-primary'],
  'surface-elevated': (opt) => opt.colors.semantic['background-primary'],
  'text-secondary': (opt) => opt.colors.semantic['text-primary'],
  'text-disabled': (opt) => opt.colors.semantic['text-primary'],
  'text-on-cta': (opt) => opt.colors.semantic['background-primary'],
  'cta-hover': (opt) => opt.colors.semantic['cta-primary'],
  'border-default': (opt) => opt.colors.semantic['text-secondary'] ?? opt.colors.semantic['text-primary'],
  'border-focus': (opt) => opt.colors.semantic['cta-primary'],
  'border-error': (opt) => opt.colors.semantic['error'],
  // Emergency fallbacks only — these hex values are not archetype-aware.
  // The expanded prompt (step 5) makes all 17 keys required, so these should
  // rarely fire. They exist as a safety net for truly broken LLM output.
  success: () => '#16A34A',
  warning: () => '#CA8A04',
  info: (opt) => opt.colors.semantic['cta-primary'],
  overlay: () => 'rgba(0,0,0,0.5)',
};
```

**`backfillSemanticColors()` function body** — uses spread-merge, not mutation. Each derivation lambda receives the option with the *partially-filled* semantic map so chain dependencies resolve correctly:

```typescript
export function backfillSemanticColors(options: DesignOption[]): DesignOption[] {
  return options.map((opt) => {
    const filled = { ...opt.colors.semantic };
    // Iterate in resolution order; pass partially-filled map to each derivation
    for (const [key, derive] of Object.entries(SEMANTIC_COLOR_DEFAULTS)) {
      if (!filled[key]) {
        filled[key] = derive({ ...opt, colors: { ...opt.colors, semantic: filled } } as DesignOption);
      }
    }
    return {
      ...opt,
      colors: { ...opt.colors, semantic: filled as DesignOption['colors']['semantic'] },
    };
  });
}
```

**`backfillElevation()`** — injects `DEFAULT_ELEVATION` when missing:

```typescript
export function backfillElevation(options: DesignOption[]): DesignOption[] {
  return options.map((opt) => {
    if (opt.elevation && opt.elevation.levels.length >= 4) return opt;
    warnMsg('LLM omitted elevation — backfilling with defaults.\n');
    return { ...opt, elevation: DEFAULT_ELEVATION };
  });
}
```

Wire into `tryLLMGeneration()` pipeline (around line 794):
```typescript
const rawOptions = parseLLMResponse(result.value.content);
const withComponents = backfillComponents(rawOptions);
const withSemantics = backfillSemanticColors(withComponents);  // NEW
const options = backfillElevation(withSemantics);               // NEW
```

---

## Step 7: Update `optionToTokens()` conversion

**File:** `packages/cli/src/commands/generate-design-options.ts`, line 246

Explicitly distinguish the source of each new field — elevation comes from the LLM (or backfill), layout and z_index always come from constants:

```typescript
export function optionToTokens(option: DesignOption): DesignTokensSpec {
  return {
    // ... existing colors, typography ...
    spacing: SHARED_LAYOUT.spacing,
    borders: SHARED_LAYOUT.borders,
    touch_targets: SHARED_LAYOUT.touch_targets,
    elevation: option.elevation ?? DEFAULT_ELEVATION,  // LLM-generated or backfill
    layout: SHARED_LAYOUT.layout,                      // always constant
    z_index: SHARED_LAYOUT.z_index,                    // always constant
    ...(option.components ? { components: option.components } : {}),
  };
}
```

---

## Step 8: Expand fallback archetypes

**File:** `packages/cli/src/commands/init.ts`, `buildDesignTokensSpec()` (line 53)

For each archetype (warm/professional/bold):

1. **Expand semantic colors** to all 17 keys. Add 1-2 extra primitives per archetype if needed to cover the new semantics (e.g., warm adds `warm-gray-light` for `text-disabled`).

2. **Add archetype-specific elevation** (elevation is aesthetic, so it varies per archetype):
   - **warm**: Soft, diffuse shadows — `0 2px 8px rgba(15,110,86,0.06)` (tinted with brand color)
   - **professional**: Clean, neutral shadows — `0 1px 3px rgba(0,0,0,0.08)`
   - **bold**: Sharp, dramatic — `0 4px 16px rgba(0,0,0,0.24)`

3. **Add layout + z_index** from imported `SHARED_LAYOUT` (after step 0 dedup).

4. **Update return** in `buildDesignTokensSpec()`:
   ```typescript
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
   ```

---

## Step 9: Rewrite `generateTailwindConfig()` for shadcn conventions

**File:** `packages/cli/src/commands/init.ts`, line 298

**IMPORTANT:** The current implementation generates raw hex color values with AgentForge primitive names. This does NOT work with shadcn. shadcn components use `className="bg-primary"` which resolves to `hsl(var(--primary))` — a CSS variable reference, not a hex value.

The generated Tailwind config must use shadcn's color structure with CSS variable references:

```typescript
export function generateTailwindConfig(tokens: DesignTokensSpec): string {
  // Elevation → boxShadow (shadow values contain commas/parens, must be single-quoted)
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
```

---

## Step 10: Rewrite `generateGlobalCss()` for shadcn conventions

**File:** `packages/cli/src/commands/init.ts`, line 334

**IMPORTANT:** The current implementation only generates a font import + Tailwind directives. For shadcn, `global.css` is the actual runtime bridge — it's where semantic tokens become CSS custom properties that shadcn components consume.

shadcn requires CSS variables in **raw HSL channel format** (no `hsl()` wrapper — Tailwind adds that). The variable names must match shadcn's convention, not AgentForge's.

### Required utilities

Add a `hexToHSLChannels()` utility and a `resolveToHex()` helper. These can live in `init.ts` or in a shared utility file:

```typescript
/** Convert hex color to HSL channels string: "#0F6E56" → "160 76% 24%" */
function hexToHSLChannels(hex: string): string {
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
  if (value.startsWith('rgba')) return value; // pass through rgba values
  return primitives[value] ?? '#888888';
}
```

### Mapping from AgentForge semantic names to shadcn CSS variable names

This mapping translates intent-based names to shadcn's structure-based names. It lives in the generator — NOT in the spec files:

```typescript
/**
 * Maps AgentForge semantic color names → shadcn CSS variable names.
 * Some AgentForge tokens map to multiple shadcn variables (e.g., background-primary
 * maps to both --background and --card when no separate card color exists).
 */
const SHADCN_VARIABLE_MAP: Record<string, string> = {
  'background-primary': 'background',
  'surface-primary':    'card',
  'surface-elevated':   'popover',
  'text-primary':       'foreground',
  'text-secondary':     'muted-foreground',
  'text-disabled':      'muted-foreground',
  'text-on-cta':        'primary-foreground',
  'cta-primary':        'primary',
  'cta-hover':          'accent',
  'border-default':     'border',
  'border-focus':       'ring',
  'border-error':       'destructive',
  'error':              'destructive',
  'success':            'success',
  'warning':            'warning',
  'info':               'info',
  'overlay':            'overlay',
};

/**
 * shadcn variables that need a paired "-foreground" variable.
 * Maps the base variable name → which AgentForge semantic color to use for the foreground.
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
```

### The rewritten `generateGlobalCss()`

```typescript
export function generateGlobalCss(tokens: DesignTokensSpec): string {
  const families = Object.values(tokens.typography.font_families)
    .map((f) => f.replace(/\s+/g, '+'))
    .join('&family=');
  const importUrl = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;

  const primitives = tokens.colors.primitive;

  // Build CSS variable lines
  const lines: string[] = [];

  // Standard shadcn variables from AgentForge semantic tokens
  for (const [afName, shadcnName] of Object.entries(SHADCN_VARIABLE_MAP)) {
    const value = tokens.colors.semantic[afName];
    if (!value) continue;

    if (afName === 'overlay' || value.startsWith('rgba')) {
      // Overlay uses raw rgba, not HSL
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

  // Additional shadcn variables that map from existing tokens
  const inputHex = resolveToHex(tokens.colors.semantic['border-default'] || '', primitives);
  lines.push(`    --input: ${hexToHSLChannels(inputHex)};`);

  // Secondary = surface-secondary or surface-primary
  const secondaryValue = tokens.colors.semantic['surface-secondary'] ?? tokens.colors.semantic['surface-primary'];
  if (secondaryValue) {
    const hex = resolveToHex(secondaryValue, primitives);
    lines.push(`    --secondary: ${hexToHSLChannels(hex)};`);
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
```

### Generator architecture for future multi-library support

The current code directly calls `generateTailwindConfig()` and `generateGlobalCss()`. When MUI/Chakra support is added later, wrap these in a library-aware dispatcher:

```typescript
// Future structure (not needed now — just shadcn case exists)
function generateRuntimeFiles(tokens: DesignTokensSpec, libraryId: string) {
  switch (libraryId) {
    case 'shadcn':
      return {
        css: generateGlobalCss(tokens),            // shadcn CSS variables
        tailwind: generateTailwindConfig(tokens),   // shadcn Tailwind config
      };
    // Future:
    // case 'mui':
    //   return { bridge: generateMuiTheme(tokens) };
    // case 'chakra':
    //   return { bridge: generateChakraTheme(tokens) };
    default:
      throw new Error(`Unsupported library: ${libraryId}`);
  }
}
```

For now, the existing direct calls in `initCommand()` (init.ts line 787-792) are fine — just update them to use the rewritten functions.

---

## Step 11: Update validation

**File:** `packages/core/src/state/design-system-reader.ts`, `validateDesignTokens()` (line 305)

Add validation for new required fields:

- **Elevation**: Validate that level numbers are sequential — each `level` must equal its index in the array (0, 1, 2, 3). No duplicates. Not just "sorted ascending."
- **Z-index**: All values must be non-negative numbers.
- **Layout breakpoints**: Must be strictly ascending: `mobile < tablet < desktop < wide`.
- **Layout grid**: `columns > 0`, `gutter >= 0`, `margin >= 0`.

---

## Step 12: Update `DesignTokensFlat` and `toDesignTokens()`

**File:** `packages/core/src/state/design-system-reader.ts`

Expand `DesignTokensFlat` (line 258):

```typescript
export interface DesignTokensFlat {
  readonly colors: Readonly<Record<string, string>>;
  readonly typography: Readonly<Record<string, unknown>>;
  readonly spacing: Readonly<Record<string, string>>;
  readonly elevation: Readonly<Record<string, string>>;   // level → shadow CSS value
  readonly layout: Readonly<Record<string, unknown>>;      // grid, breakpoints, content_max_width
  readonly z_index: Readonly<Record<string, number>>;      // layer name → z-index number
}
```

Update `toDesignTokens()` (line 271) to flatten the new structures:

```typescript
// Flatten elevation: { "0": "none", "1": "0 1px 3px ..." }
const elevation: Record<string, string> = {};
for (const l of spec.elevation.levels) {
  elevation[`${l.level}`] = l.shadow;
}

// Flatten layout: { columns: 12, gutter: "24px", ... breakpoints as sub-object }
const layout: Record<string, unknown> = {
  columns: spec.layout.grid.columns,
  gutter: `${spec.layout.grid.gutter}px`,
  margin: `${spec.layout.grid.margin}px`,
  content_max_width: `${spec.layout.content_max_width}px`,
  breakpoints: spec.layout.breakpoints,
};

// Flatten z_index: direct pass-through
const z_index: Record<string, number> = { ...spec.z_index };

return { colors, typography, spacing, elevation, layout, z_index };
```

---

## Step 13: Update HTML preview

**File:** `packages/cli/src/commands/generate-design-options.ts`, `generatePreviewHtml()` (line 324)

- Add elevation visualization section: 4 cards with increasing shadow levels
- Show expanded semantic color chips (surface-primary, surface-elevated, text-on-cta, cta-hover, border-focus, border-error, overlay)

---

## Step 14: Update tests

**File:** `packages/cli/src/commands/generate-design-options.test.ts`
- Update `VALID_OPTION` fixture with all 17 semantic colors + elevation
- Add tests for `backfillSemanticColors()` (missing keys filled, present keys preserved, chain dependencies resolve correctly)
- Add tests for `backfillElevation()` (missing → defaults, present → kept)
- Update `optionToTokens()` tests: verify elevation from option, layout/z_index from SHARED_LAYOUT
- Update `SHARED_LAYOUT` tests for new layout/z_index fields

**File:** `packages/core/src/state/design-system-reader.test.ts`
- Add validation tests for elevation (sequential levels, no duplicates)
- Add validation tests for z_index (non-negative)
- Add validation tests for layout breakpoints (ascending)
- Add `toDesignTokens()` tests for new flat fields

**File:** `packages/cli/src/commands/init.test.ts` (if exists)
- Test `generateTailwindConfig()` output contains `hsl(var(--primary))` structure, not raw hex
- Test `generateGlobalCss()` output contains HSL channel values and shadcn variable names
- Test `hexToHSLChannels()` with known values (e.g., `#0F6E56` → `160 76% 24%`)

---

## Critical Files

| File | Changes |
|------|---------|
| `packages/core/src/types/design-system.ts` | New interfaces (`ElevationLevel`, `ElevationSpec`, `LayoutSpec`, `ZIndexSpec`), expand `DesignTokensSpec` with required fields |
| `packages/core/src/index.ts` | Export new types |
| `packages/core/src/state/design-system-reader.ts` | Validation for new fields, expand `DesignTokensFlat`, update `toDesignTokens()` |
| `packages/cli/src/commands/generate-design-options.ts` | `SHARED_LAYOUT` expansion, `DEFAULT_ELEVATION`, `DesignOption` expansion, prompt expansion, `backfillSemanticColors()`, `backfillElevation()`, `optionToTokens()`, HTML preview |
| `packages/cli/src/commands/init.ts` | Delete `SHARED_LAYOUT` (import), archetype expansion (17 semantics + elevation), rewrite `generateTailwindConfig()` for shadcn, rewrite `generateGlobalCss()` for shadcn with `hexToHSLChannels()`, `SHADCN_VARIABLE_MAP`, `SHADCN_FOREGROUND_PAIRS` |
| `packages/cli/src/commands/generate-design-options.test.ts` | Test updates |
| `packages/core/src/state/design-system-reader.test.ts` | Validation + toDesignTokens tests |

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Layout, z-index are shared constants** | Functional infrastructure, not aesthetic. Same values regardless of design direction. |
| **Elevation is LLM-generated per option** | Aesthetic — shadow style should match the design direction. Backfilled with `DEFAULT_ELEVATION` if LLM omits it. |
| **Semantic colors: 17 required in prompt** | 4 hard-validated in `parseLLMResponse()` (reject option if missing). 13 soft-validated in `backfillSemanticColors()` (filled with heuristic derivations). |
| **Primitive count: "5-8"** | Expanded semantic palette may need more base colors. |
| **`SHARED_LAYOUT` dedup** | Single canonical definition in `generate-design-options.ts`, imported by `init.ts`. |
| **No backward compat** | All new fields are required on `DesignTokensSpec`. Product not launched. |
| **Spec files stay library-agnostic** | `design-tokens.yaml` uses intent-based names (`cta-primary`) because multiple consumers (design agent, implementation agent, QA agent) read them. shadcn-specific names only appear in generated runtime files. |
| **Runtime files use shadcn conventions** | `global.css` emits HSL channel values with shadcn variable names. `tailwind.config.ts` uses `hsl(var(--...))` references. This is the actual bridge for shadcn. |
| **Translation lives in the generator only** | `SHADCN_VARIABLE_MAP` and `hexToHSLChannels()` live in `init.ts`. When MUI/Chakra support is added later, a parallel generator is added — spec files don't change. |
| **`DesignOption` semantic type stays as-is** | `Record<string, string>` already accepts any key. Adding typed optional keys is cosmetic. Enforcement lives in `backfillSemanticColors()`. |

---

## DesignSpec v2 Renderer Pipeline (Current Architecture)

The design pipeline now uses a **deterministic renderer** that separates WHAT (LLM → JSON) from HOW (renderer → Penpot/React API calls). This replaced the previous approach where the LLM generated Penpot scripts directly.

### Architecture: LLM → JSON → Renderer

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  LLM Call    │────▶│  DesignSpec v2   │────▶│  renderToScript()  │──▶ Penpot JS
│  (Sonnet 4.6)│     │  JSON (flat      │     │  renderToJSX()     │──▶ React/JSX
│              │     │  adjacency list) │     │                    │
└─────────────┘     └──────────────────┘     └────────────────────┘
```

- **LLM outputs structured JSON** via Anthropic SDK `output_config` with `responseSchema` — guaranteed schema compliance
- **DesignSpec v2 schema**: flat adjacency list of `NodeSpec` objects with `id`, `parentId`, `type`, optional `catalog`, `overrides`, `children`
- **Renderer is deterministic**: same JSON input always produces same output. No LLM hallucination of API calls.

### Component Renderers

| Target | Count | Entry Point |
|--------|-------|-------------|
| Penpot | 28 component renderers | `renderToScript(spec, tokens, catalog)` |
| React | 22 component renderers | `renderToJSX(spec, tokens, catalog)` |

Components are split into **accelerators** (structural: page, container, section, header, divider, spacer, text) and **differentiators** (catalog-driven: button variants, input variants, card, badge, stat, avatar, checkbox, select, segmented-control, stepper, etc.).

### Key Benefits

- **Eliminated all Penpot API bugs** — renderer enforces correct API usage (createBoard for all shapes, appendChild before layoutChild, 0-1 float ranges for colors)
- **Reduced token usage ~89%** — LLM outputs compact JSON instead of verbose JS scripts
- **Structured output** via `responseSchema` guarantees valid JSON (no regex parsing needed)
- **Dual-target** — same DesignSpec JSON renders to both Penpot and React

### Package

`packages/designspec-renderer/` — standalone package with zero external dependencies. Mirrors core types locally to avoid coupling.

## Verification

1. `nx run-many -t typecheck` — all packages pass
2. `nx test cli` — all tests pass including new backfill tests
3. `nx test core` — validation + toDesignTokens tests pass
4. Manual: `agentforge init` **with** API key → tokens have all 17 semantics + elevation + layout + z_index
5. Manual: `agentforge init` **without** API key → fallback archetypes produce identical field coverage
6. Manual: inspect generated `tailwind.config.ts` → uses `hsl(var(--primary))` structure, NOT raw hex
7. Manual: inspect generated `global.css` → contains `--primary: H S% L%` format, NOT `--cta-primary: #hex`
8. Manual: create a shadcn `<Button />` → `className="bg-primary"` resolves correctly via CSS variables
9. Manual: verify elevation shadows render in browser (inspect `--shadow-1`, `--shadow-2`, `--shadow-3`)
