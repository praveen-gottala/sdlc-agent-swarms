# Viewport & Breakpoint Configuration

Controls which viewport widths the design pipeline generates designs for.

## Quick Start

After `agentforge init`, your `agentforge.yaml` contains:

```yaml
design:
  primary_viewport: 1440
  layout_strategy: desktop-first
  responsive_breakpoints: false
```

This generates designs at **1440px only** (desktop). No tablet or mobile variants.

## Configuration Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `primary_viewport` | `number` | `1440` | Width in pixels for the primary design frame |
| `layout_strategy` | `'desktop-first'` \| `'mobile-first'` | `'desktop-first'` | Determines breakpoint order when `responsive_breakpoints: true` |
| `responsive_breakpoints` | `boolean` \| `number[]` | `false` | Controls which breakpoints are generated (see below) |

### `responsive_breakpoints` values

| Value | Behavior |
|-------|----------|
| `false` | Only `primary_viewport` is generated |
| `true` | Standard breakpoints: `[1440, 768, 375]` (desktop-first) or `[375, 768, 1440]` (mobile-first) |
| `[1440, 768]` | Explicit list of widths to generate |

## Resolution Priority Chain

When determining which viewports to generate, the system checks these sources in order (first match wins):

```
CLI --width flag  >  page.viewports (pages.yaml)  >  design config (agentforge.yaml)  >  default [1440]
```

1. **CLI `--width` flag** — always wins. `agentforge design:penpot --width 768 "home"` generates at 768px regardless of any config.
2. **Per-page `viewports`** in `agentforge/spec/pages.yaml` — per-screen overrides. If a page defines `viewports: [390, 768]`, those are used.
3. **`design` section** in `agentforge.yaml` — project-level defaults (this config).
4. **Hardcoded fallback** — `[1440]` if nothing is configured.

This mirrors the model resolution pattern (`resolveModelForRole`): CLI env var > per-role override > manifest default > hardcoded fallback.

## Common Configurations

### Desktop only (default after init)

```yaml
design:
  primary_viewport: 1440
  layout_strategy: desktop-first
  responsive_breakpoints: false
```

Generates one frame at 1440px. The planning agent is instructed to produce desktop-only responsive rules and skip tablet/mobile breakpoints.

### Desktop + tablet

```yaml
design:
  primary_viewport: 1440
  layout_strategy: desktop-first
  responsive_breakpoints: [1440, 768]
```

Generates two frames per page: 1440px and 768px.

### Full responsive (desktop-first)

```yaml
design:
  primary_viewport: 1440
  layout_strategy: desktop-first
  responsive_breakpoints: true
```

Generates three frames: 1440px, 768px, 375px (in that order).

### Mobile-first app

```yaml
design:
  primary_viewport: 375
  layout_strategy: mobile-first
  responsive_breakpoints: true
```

Generates three frames: 375px, 768px, 1440px (mobile first).

### Custom breakpoints

```yaml
design:
  primary_viewport: 1280
  layout_strategy: desktop-first
  responsive_breakpoints: [1280, 1024, 640]
```

Generates exactly the widths you specify, in the order you specify.

## Per-Page Overrides

Individual pages in `agentforge/spec/pages.yaml` can override the project-level config:

```yaml
pages:
  - id: home
    name: Home
    route: /
    description: Landing page
    components: [Hero, Features, Footer]
    # No viewports → uses agentforge.yaml design config

  - id: checkout
    name: Checkout
    route: /checkout
    description: Payment flow
    components: [Cart, PaymentForm]
    viewports: [390, 768]  # Mobile + tablet only for this page
```

The `checkout` page generates at 390px and 768px, while `home` uses whatever the project-level `design` config specifies.

## Effect on Planning Agent

The design config is also passed to the **planning agent** (`ux-planning`), which adjusts its responsive rules output:

- **`responsive_breakpoints: false`** — planning prompt says: "Generate responsiveRules for desktop only at {primary_viewport}px. Do NOT include tablet or mobile breakpoints."
- **`responsive_breakpoints: true` or array** — planning prompt says: "Target breakpoints: {list}px ({layout_strategy}). Generate responsiveRules for all listed breakpoints."

This prevents the planning agent from generating mobile-specific responsive rules that the design agent would ignore.

## CLI Override

The `--width` flag on any design command overrides all config:

```bash
# Generates at 768px regardless of agentforge.yaml or pages.yaml
agentforge design:penpot --width 768 "home page"
agentforge design:penpot:all --width 768
agentforge design:penpot:browser --width 768 "home page"
```

## Architecture

The resolution logic lives in `packages/core/src/config/viewport-resolver.ts`:

- `resolveViewports({ cliWidth, pageViewports, designConfig })` — returns `readonly number[]`
- `STANDARD_BREAKPOINTS_DESKTOP_FIRST` — `[1440, 768, 375]`
- `STANDARD_BREAKPOINTS_MOBILE_FIRST` — `[375, 768, 1440]`

The `DesignConfig` type is defined in `packages/core/src/types/project-manifest.ts` and exported from `@agentforge/core`.

## Affected Commands

| Command | How it uses viewport config |
|---------|-----------------------------|
| `design:penpot` | `resolveViewports({ cliWidth, designConfig })[0]` as `viewportWidth` |
| `design:penpot:all` | `resolveViewports({ cliWidth, pageViewports, designConfig })` for each page |
| `design:penpot:browser` | `resolveViewports({ cliWidth, designConfig })[0]` as `viewportWidth` |
