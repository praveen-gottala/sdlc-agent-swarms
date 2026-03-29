# Task: Add Configurable Viewport/Breakpoint Control for Design Generation

## Problem

The design agent currently generates designs at whatever width the planning agent suggests (480px, 768px, 1440px). We need project-level control over which breakpoints are generated, with the ability to start desktop-only (1440px) and enable tablet/mobile later.

## Approach

Add a `design` config section to the project manifest (`agentforge.yaml`) that controls viewport behavior. The CLI reads this config and passes it to the design agent, which uses it to determine the root board width and whether to generate responsive variants.

---

## Step 1: Add config schema to project manifest

**File:** `packages/core/src/types/index.ts` (or wherever `ProjectManifest` is defined)

Add a new optional section to the `ProjectManifest` type:

```typescript
/** Design generation configuration. */
export interface DesignConfig {
  /** Primary viewport width in pixels. Default: 1440 */
  readonly primary_viewport: number;
  /** Layout approach: 'desktop-first' or 'mobile-first'. Default: 'desktop-first' */
  readonly layout_strategy: 'desktop-first' | 'mobile-first';
  /** 
   * Which breakpoints to generate designs for.
   * When false or empty, only the primary_viewport is generated.
   * When true, generates for all standard breakpoints (desktop, tablet, mobile).
   * Can also be an array of specific widths: [1440, 768, 375]
   */
  readonly responsive_breakpoints: boolean | readonly number[];
}
```

Add to `ProjectManifest`:
```typescript
export interface ProjectManifest {
  // ... existing fields ...
  /** Design generation settings. */
  readonly design?: DesignConfig;
}
```

## Step 2: Set defaults in init

**File:** `packages/cli/src/commands/init.ts`

When scaffolding `agentforge.yaml`, include the design config with desktop-only defaults:

```yaml
design:
  primary_viewport: 1440
  layout_strategy: desktop-first
  responsive_breakpoints: false
```

This means: generate designs at 1440px only, no tablet/mobile variants. When ready to go responsive, the user changes `responsive_breakpoints` to `true` or `[1440, 768, 375]`.

## Step 3: Read config in CLI design commands

**File:** `packages/cli/src/commands/design-penpot.ts`

When building the design agent input, read the design config from the project manifest:

```typescript
import { loadProjectManifest } from '@agentforge/core';

const manifest = loadProjectManifest(rootDir, fileSystem);
const designConfig = manifest.ok ? manifest.value.design : undefined;

const primaryViewport = designConfig?.primary_viewport ?? 1440;
const responsiveBreakpoints = designConfig?.responsive_breakpoints ?? false;

// Resolve breakpoints list
let breakpoints: number[];
if (responsiveBreakpoints === true) {
  breakpoints = designConfig?.layout_strategy === 'mobile-first'
    ? [375, 768, 1440]
    : [1440, 768, 375];
} else if (Array.isArray(responsiveBreakpoints)) {
  breakpoints = [...responsiveBreakpoints];
} else {
  breakpoints = [primaryViewport];
}
```

Pass `breakpoints` to the design agent input. The design agent uses `breakpoints[0]` as the primary width for the root board, and generates additional frames for each subsequent breakpoint if present.

Apply the same logic in:
- `packages/cli/src/commands/design-penpot-all.ts`
- `packages/cli/src/commands/design-penpot-browser.ts`

If the CLI command has a `--width` flag, it should override the config (explicit CLI flags win over config file):

```typescript
const primaryViewport = options.width ?? designConfig?.primary_viewport ?? 1440;
```

## Step 4: Pass to design agent and update prompt injection

**File:** `packages/agents-ux/src/ux-design/ux-penpot-design.ts` (and `penpot-browser-agent.ts`)

The design input already has a `width` or `breakpoints` field — ensure it accepts the resolved breakpoints array. When assembling the user message for the design prompt:

```typescript
const viewportInstruction = breakpoints.length === 1
  ? `\n## Viewport\nGenerate a single design at ${breakpoints[0]}px width. Do NOT create tablet or mobile variants.`
  : `\n## Viewports\nGenerate designs for these breakpoints (${designConfig?.layout_strategy ?? 'desktop-first'} approach):\n${breakpoints.map(bp => `- ${bp}px`).join('\n')}\nCreate a separate root board for each breakpoint.`;

userMessageParts.push(viewportInstruction);
```

This overrides any responsive rules from the planning agent. If the config says desktop-only, the design agent generates one frame at 1440px regardless of what the planning agent suggested.

## Step 5: Update planning agent responsive rules

**File:** `packages/agents-ux/src/ux-planning/ux-dashboard-planning.ts`

When building the planning prompt, inject the viewport config so the planning agent doesn't generate irrelevant responsive rules:

```typescript
if (designConfig && !designConfig.responsive_breakpoints) {
  userMessageParts.push(`\n## Viewport Configuration\nThis project is configured for desktop-only at ${designConfig.primary_viewport}px. Generate responsiveRules for desktop only. Do NOT include tablet or mobile breakpoints — they will be added later when responsive_breakpoints is enabled.`);
}
```

This prevents the planning agent from producing mobile-specific responsive rules that the design agent will ignore anyway.

---

## Example Configurations

### Phase 1: Desktop only (current need)
```yaml
design:
  primary_viewport: 1440
  layout_strategy: desktop-first
  responsive_breakpoints: false
```

### Phase 2: Add tablet
```yaml
design:
  primary_viewport: 1440
  layout_strategy: desktop-first
  responsive_breakpoints: [1440, 768]
```

### Phase 3: Full responsive
```yaml
design:
  primary_viewport: 1440
  layout_strategy: desktop-first
  responsive_breakpoints: true  # generates 1440, 768, 375
```

### Mobile-first app (alternative)
```yaml
design:
  primary_viewport: 375
  layout_strategy: mobile-first
  responsive_breakpoints: true  # generates 375, 768, 1440
```

---

## What NOT to change

- The planning prompt's responsive rules schema (keep `responsiveRules` in the output — it's still useful for documenting intended behavior even if only one breakpoint is generated)
- The `--width` CLI flag behavior — it should override the config as an escape hatch
- The design prompt examples — they should stay at whatever width they currently use (the viewport instruction in the user message handles the override)

## Verification

1. `nx run core:typecheck` — `DesignConfig` type compiles
2. `agentforge init` → check `agentforge.yaml` contains `design:` section with defaults
3. `agentforge design:penpot "bill entry"` → design prompt trace shows `Viewport: Generate a single design at 1440px width`
4. `agentforge design:penpot --width 768 "bill entry"` → CLI flag overrides config, generates at 768px
5. Edit `agentforge.yaml` to set `responsive_breakpoints: [1440, 768]` → generates two root boards
6. Planning prompt trace shows desktop-only responsive rules when `responsive_breakpoints: false`
