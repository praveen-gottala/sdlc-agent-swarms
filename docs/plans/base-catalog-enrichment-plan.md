# Base Catalog Enrichment Plan

## Implementation Status (as of 2026-03-28)

| Item | Status | Evidence |
|------|--------|----------|
| `RawCatalogEntry` has `renderer_defaults` field | DONE | `packages/designspec-renderer/src/catalog/loader.ts` line 23 |
| `transformEntry()` checks renderer_defaults first | DONE | `packages/designspec-renderer/src/catalog/loader.ts` lines 109-137 |
| Loader tests pass | DONE | `packages/designspec-renderer/src/catalog/loader.test.ts` |
| Add `renderer_defaults` to `ComponentCatalogEntry` in core | REMAINING | `packages/core/src/types/design-system.ts` |
| Add `renderer_defaults` to all 15 components in base YAML | REMAINING | `packages/core/src/catalogs/base-component-catalog.yaml` |
| Explicit handling in `generateProjectCatalog()` | REMAINING | `packages/core/src/catalogs/generate-project-catalog.ts` |

---

## Problem Statement

The `designspec-v2-requirements.md` Section 6 specifies that the project catalog at
`agentforge/spec/component-catalog.yaml` should contain flat, kebab-case component
entries with **all renderer fields** (height, radius, button_size, minus_bg, etc.).

**What actually happened:** The base catalog (`base-component-catalog.yaml`) was built
with design-knowledge fields only (anatomy, states, token_bindings, library_mapping).
Renderer fields were never added. `catalog-entries.ts` was created as a test fixture
to fill the gap. The loader merges them, producing collisions that drop renderer fields.

**Root cause:** The `ComponentCatalogEntry` schema in `packages/core` has no place to
store renderer-specific values like `button_size: 40` or `box_radius: 4`.

**Fix:** Add a `renderer_defaults` section to each base catalog entry. The loader reads
it directly when present, falls back to current extraction logic when absent.

---

## Gap Analysis: 15 Section 6 Differentiators vs Base Catalog

### Category A: Direct match — add renderer_defaults (6 components)

These exist in both places with the same identity. Add `renderer_defaults` to the YAML.

| Section 6 ID     | YAML Name  | Renderer-specific fields missing from YAML                     |
|------------------|------------|----------------------------------------------------------------|
| `card`           | Card       | shadow, radius, padding, required_fields                       |
| `badge`          | Badge      | height, radius, padding_x, padding_y, text_size, text_weight   |
| `stat`           | Stat       | shadow, radius, padding_x, padding_y, required_fields          |
| `avatar`         | Avatar     | size, text_color, bg_opacity, text_size, text_weight            |
| `checkbox`       | Checkbox   | box_size, box_radius, box_border, box_checked_bg, check_color   |
| `select`         | Select     | extends, variant, chevron_color, chevron_size + all input-text  |

### Category B: Key mismatch — YAML has generic, Section 6 has specific (4 components)

The YAML has `Button` (generic) but Section 6 has `button-primary`, `button-secondary`,
`button-ghost` (specific variants). The YAML has `Input` but Section 6 has `input-text`.

| Section 6 ID       | YAML Name | Issue                                                        |
|---------------------|-----------|--------------------------------------------------------------|
| `input-text`        | Input     | Different key. YAML is "Input" → kebab "input", not "input-text" |
| `button-primary`    | Button    | YAML is generic "Button". Section 6 needs 3 variant entries  |
| `button-secondary`  | Button    | Same — variant of Button                                     |
| `button-ghost`      | Button    | Same — variant of Button                                     |

### Category C: Not in base catalog at all (5 components)

These Section 6 differentiators have no base catalog equivalent. They need to be added
as new entries with both design knowledge AND renderer_defaults.

| Section 6 ID        | Why missing from base catalog                                 |
|----------------------|---------------------------------------------------------------|
| `input-currency`     | Extends input-text. Not a standalone component in YAML        |
| `segmented-control`  | No equivalent. YAML has Tabs but it's a different component   |
| `stepper`            | YAML Stepper is a wizard step indicator, not +/- counter      |
| `display-readonly`   | No equivalent. It's a label+value display, not an input       |
| `tooltip`            | YAML has Alert but it's a different component (status banner) |

---

## Schema Change

Add `renderer_defaults` as an optional section on `ComponentCatalogEntry` in
`packages/core/src/types/design-system.ts`:

```typescript
export interface ComponentCatalogEntry {
  // ... existing fields (description, category, anatomy, states, etc.)

  /**
   * Flat renderer defaults for the designspec-renderer.
   * These are the Section 6 values that tell the Penpot/React renderer
   * HOW to draw this component (pixel values, sub-element colors, etc.).
   *
   * When present, loadCatalogForRenderer() uses these directly instead of
   * reverse-engineering values from states/token_bindings.
   */
  renderer_defaults?: Record<string, unknown>;
}
```

Mirror this in the renderer's `RawCatalogEntry` type in `loader.ts`:

```typescript
export interface RawCatalogEntry {
  // ... existing fields
  readonly renderer_defaults?: Readonly<Record<string, unknown>>;
}
```

---

## Loader Change

In `loadCatalogForRenderer()` → `transformEntry()`, check for `renderer_defaults` first:

```typescript
function transformEntry(name: string, raw: RawCatalogEntry): CatalogEntry {
  // If renderer_defaults exists, use it directly — it IS the Section 6 format
  if (raw.renderer_defaults) {
    const entry: Record<string, unknown> = { ...raw.renderer_defaults };

    // Library mapping always comes from library_mapping (not duplicated in renderer_defaults)
    if (raw.library_mapping) {
      const lib: Record<string, unknown> = {};
      for (const [libId, mapping] of Object.entries(raw.library_mapping)) {
        lib[libId] = {
          component: mapping.component_name,
          import: mapping.import_path,
          ...(mapping.slot_mapping ? { slot_mapping: mapping.slot_mapping } : {}),
          ...(mapping.variant_prop ? { variant_prop: mapping.variant_prop } : {}),
          ...(mapping.size_prop ? { size_prop: mapping.size_prop } : {}),
        };
      }
      entry.library = lib;
    }

    return entry as CatalogEntry;
  }

  // Fallback: current extraction logic (for components without renderer_defaults)
  // ... existing code unchanged ...
}
```

This is backward compatible: components without `renderer_defaults` work exactly as before.

---

## YAML Enrichment: All 15 Components

### Category A: Add renderer_defaults to existing entries

```yaml
# ─── Card ────────────────────────────────────────────────
Card:
  # ... existing anatomy, states, token_bindings, library_mapping ...
  renderer_defaults:
    type: card
    background: surface-primary
    shadow: sm
    radius: 20
    padding: 24
    required_fields: []

# ─── Badge ───────────────────────────────────────────────
Badge:
  # ... existing ...
  renderer_defaults:
    type: badge
    height: 24
    radius: 8
    padding_x: 8
    padding_y: 2
    text_size: 11
    text_weight: 500
    required_fields: [label]

# ─── Stat ────────────────────────────────────────────────
Stat:
  # ... existing ...
  renderer_defaults:
    type: stat
    background: surface-primary
    shadow: sm
    radius: 20
    padding_x: 24
    padding_y: 20
    required_fields: [label, value]

# ─── Avatar ──────────────────────────────────────────────
Avatar:
  # ... existing ...
  renderer_defaults:
    type: avatar
    size: 36
    text_color: cta-primary
    bg_opacity: 0.12
    text_size: 14
    text_weight: 700
    required_fields: [label]

# ─── Checkbox ────────────────────────────────────────────
Checkbox:
  # ... existing ...
  renderer_defaults:
    type: checkbox
    box_size: 16
    box_radius: 4
    box_border: border-default
    box_checked_bg: cta-primary
    check_color: text-on-cta
    min_height: 44
    required_fields: [label]

# ─── Select ──────────────────────────────────────────────
Select:
  # ... existing ...
  renderer_defaults:
    type: input
    variant: select
    extends: input-text
    height: 48
    radius: 12
    border_color: border-default
    border_width: 1
    text_typography: body
    text_color: text-primary
    background: surface-input
    min_height: 44
    chevron_color: text-secondary
    chevron_size: 12
    required_fields: [label, placeholder]
```

### Category B: Add variant-specific entries

The base catalog has generic `Button` and `Input`. Section 6 needs specific variants.
Two approaches:

**Option 1: Add variant entries alongside the generic (recommended)**

```yaml
# Keep existing generic Button for LLM design knowledge
Button:
  # ... existing anatomy, states, variants, token_bindings ...

# Add Section 6 differentiators as new entries
ButtonPrimary:
  description: Primary CTA button
  category: input
  # anatomy/states can reference Button or be minimal
  library_mapping:
    shadcn:
      component_name: Button
      import_path: "@/components/ui/button"
      variant_prop: variant
  renderer_defaults:
    type: button
    variant: primary
    height: 48
    radius: 12
    background: cta-primary
    text_color: text-on-cta
    text_typography: body
    text_weight: 600
    width: fill
    shadow: none
    required_fields: [label]

ButtonSecondary:
  # ... similar ...
  renderer_defaults:
    type: button
    variant: secondary
    height: 44
    radius: 12
    background: surface-primary
    text_color: text-primary
    text_typography: body
    text_weight: 500
    border_color: border-default
    border_width: 1
    shadow: none
    required_fields: [label]

ButtonGhost:
  # ... similar ...
  renderer_defaults:
    type: button
    variant: ghost
    height: 44
    radius: 0
    background: transparent
    text_color: cta-primary
    text_typography: body
    text_weight: 500
    shadow: none
    required_fields: [label]

InputText:
  description: Standard text input with label and helper
  category: input
  # ... anatomy/states from existing Input ...
  renderer_defaults:
    type: input
    variant: text
    height: 48
    radius: 12
    border_color: border-default
    border_width: 1
    text_typography: body
    text_color: text-primary
    background: surface-input
    min_height: 44
    required_fields: [label, placeholder]
```

**Key:** `generateProjectCatalog()` converts PascalCase → kebab-case:
`ButtonPrimary` → `button-primary`, `InputText` → `input-text`. This matches Section 6 IDs.

### Category C: Add new entries entirely

```yaml
# ─── Input Currency (extends InputText) ──────────────────
InputCurrency:
  description: Currency input with $ prefix
  category: input
  anatomy:
    - name: prefix
      contents: currency symbol ($)
    - name: input_field
      contents: numeric input with placeholder
    - name: label
      contents: field label (label)
      typography_role: label
  states:
    default:
      bg: surface-input
      text: text-primary
      border: border-default
  library_mapping:
    shadcn:
      component_name: Input
      import_path: "@/components/ui/input"
  renderer_defaults:
    type: input
    variant: currency
    extends: input-text
    prefix: "$"
    height: 48
    radius: 12
    border_color: border-default
    border_width: 1
    text_typography: body
    text_color: text-primary
    background: surface-input
    min_height: 44
    required_fields: [label, placeholder]

# ─── Segmented Control ──────────────────────────────────
SegmentedControl:
  description: Pill-shaped option selector for toggling between choices
  category: input
  min_height: 44
  anatomy:
    - name: container
      contents: pill-shaped container holding option buttons
    - name: options
      contents: clickable option segments with selected state
  states:
    default:
      bg: surface-elevated
      text: text-primary
      border: border-default
    selected:
      bg: cta-primary
      text: text-on-cta
  library_mapping:
    shadcn:
      component_name: Tabs
      import_path: "@/components/ui/tabs"
  renderer_defaults:
    type: segmented-control
    height: 48
    radius: 24
    inner_radius: 20
    padding: 4
    container_background: surface-elevated
    container_border_color: border-default
    container_border_opacity: 0.5
    selected_bg: cta-primary
    selected_text: text-on-cta
    selected_weight: 600
    unselected_bg: transparent
    unselected_text: text-primary
    unselected_weight: 400
    text_size: 14
    required_fields: [options]

# ─── Stepper (increment/decrement) ──────────────────────
# NOTE: The existing YAML "Stepper" is a wizard step indicator.
# This is a DIFFERENT component — a +/- counter.
# User has already renamed the wizard Stepper to avoid collision.
IncrementStepper:
  description: Increment/decrement counter with label and +/- buttons
  category: input
  min_height: 44
  anatomy:
    - name: label
      contents: counter label (body)
      typography_role: body
    - name: minus_button
      contents: decrement button
    - name: count
      contents: current count value (heading-2)
      typography_role: heading-2
    - name: plus_button
      contents: increment button
  states:
    default:
      bg: surface-elevated
      text: text-primary
  library_mapping:
    shadcn:
      component_name: div
      import_path: html
  renderer_defaults:
    type: stepper
    height: 56
    radius: 12
    background: surface-elevated
    shadow: sm
    button_size: 40
    minus_bg: surface-secondary
    minus_border: border-default
    minus_border_opacity: 0.5
    minus_text_color: text-secondary
    plus_bg: cta-primary
    plus_text_color: text-on-cta
    count_typography: heading-2
    count_color: text-primary
    required_fields: [label, value]

# ─── Display Readonly ────────────────────────────────────
DisplayReadonly:
  description: Label + value display for read-only data
  category: data_display
  anatomy:
    - name: label
      contents: field label (label)
      typography_role: label
    - name: value
      contents: display value (heading-3)
      typography_role: heading-3
  states:
    default:
      bg: surface-elevated
      text: text-secondary
  library_mapping:
    shadcn:
      component_name: div
      import_path: html
  renderer_defaults:
    type: display
    text_typography: heading-3
    text_color: text-secondary
    background: surface-elevated
    height: 48
    radius: 8
    padding_x: 16
    required_fields: [label, value]

# ─── Tooltip (inline info) ───────────────────────────────
TooltipInline:
  description: Icon + message inline information display
  category: feedback
  anatomy:
    - name: icon
      contents: info icon (16px)
    - name: message
      contents: tooltip message text (small)
      typography_role: small
  states:
    default:
      bg: surface-elevated
      text: text-primary
  library_mapping:
    shadcn:
      component_name: Alert
      import_path: "@/components/ui/alert"
  renderer_defaults:
    type: tooltip
    height: 40
    radius: 8
    shadow: sm
    padding_x: 16
    icon_size: 16
    text_size: 11
    text_color: text-primary
    required_fields: [content]
```

---

## Phase 4 Impact

Phase 4 (SDK Integration) will now work because:

1. `loadCatalogForRenderer()` reads enriched YAML → gets all renderer fields
2. No merge with `catalog-entries.ts` needed → no collision
3. `catalog-entries.ts` stays as a test fixture for unit tests that don't need YAML
4. Integration tests use the real YAML path

### What Phase 4 steps need to be aware of:

- **Step 19 (Tool definition):** The `catalog` field in the schema accepts Section 6
  kebab-case IDs. The LLM sees these IDs in the reduced prompt. No change needed.

- **Step 21 (Reduced design prompt):** Lists available catalog IDs for the LLM.
  Must include all 15 Section 6 IDs. The `generateProjectCatalog()` output can be
  used to auto-generate this list.

- **Step 23 (End-to-end test):** Will work because the YAML catalog now produces
  valid CatalogEntry objects with all renderer fields.

### What Phase 4 does NOT address (still gaps):

- `generateProjectCatalog()` needs to pass through `renderer_defaults` to the project
  YAML. Current implementation doesn't know about this field — it only copies anatomy,
  states, token_bindings, library_mapping, min_height.

- The `ComponentCatalogEntry` type in `packages/core` needs the new field.

---

## Implementation Steps

### Step 1: Schema (packages/core)
- Add `renderer_defaults?: Record<string, unknown>` to `ComponentCatalogEntry`
- Add same to `RawCatalogEntry` in `loader.ts`

### Step 2: Base catalog enrichment (packages/core)
- Add `renderer_defaults` to 6 Category A entries (card, badge, stat, avatar, checkbox, select)
- Add 4 Category B entries (ButtonPrimary, ButtonSecondary, ButtonGhost, InputText)
- Add 5 Category C entries (InputCurrency, SegmentedControl, IncrementStepper, DisplayReadonly, TooltipInline)

### Step 3: generateProjectCatalog() (packages/core)
- Pass through `renderer_defaults` when copying entries to project catalog

### Step 4: Loader update (packages/designspec-renderer)
- Update `transformEntry()` to check `renderer_defaults` first
- Remove `V2_BUILTIN_CATALOG` import from production code
- Keep `catalog-entries.ts` for unit tests only

### Step 5: Test
- Run enrichment test for each of the 15 components
- Verify `loadCatalogForRenderer(yamlCatalog)` output matches `V2_BUILTIN_CATALOG` for all 15
- Existing renderer tests continue to pass (they use catalog-entries.ts directly)
- Pipeline integration tests pass with enriched YAML

### Step 6: Cleanup
- Remove the merge logic from `loadCatalogForRenderer()` (no more `{ ...V2_BUILTIN_CATALOG }`)
- Update `catalog-entries.ts` comment to clarify it's test-only
- Document the `renderer_defaults` pattern in the codebase context brief
