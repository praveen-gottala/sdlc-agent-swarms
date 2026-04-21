# Step 7: Add base catalog as a framework asset

## Context

The enriched `component-catalog.yaml` (from the previous plan) contains ~30 generic UI components with anatomy, states, variants, token_bindings, min_height, spacing, library_mapping (shadcn/mui/chakra), and accessibility. This is **framework-level knowledge** — it doesn't change per project. It needs a permanent home in the framework so projects can derive their own filtered catalog from it.

## Task

Move the enriched `component-catalog.yaml` to `packages/core/src/catalogs/base-component-catalog.yaml`.

Add a loader function in `packages/core/src/catalogs/index.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComponentCatalogSpec } from '../types/design-system.js';
import { readYaml } from '../fs/yaml-utils.js';
import type { FileSystem } from '../fs/file-system.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load the framework's base component catalog.
 * This contains all ~30 generic UI components with all library mappings.
 * Use generateProjectCatalog() to filter for a specific library.
 */
export const loadBaseCatalog = (): ComponentCatalogSpec => {
  const raw = readFileSync(join(__dirname, 'base-component-catalog.yaml'), 'utf-8');
  // Parse YAML — use js-yaml or the same parser used elsewhere in core
  // Return the parsed ComponentCatalogSpec
};
```

Export from `packages/core/src/index.ts`:

```typescript
export { loadBaseCatalog } from './catalogs/index.js';
```

## Important

- The base catalog is a **read-only framework asset** — projects never modify it
- It contains library_mapping entries for ALL libraries (shadcn, mui, chakra) — filtering happens in Step 8
- The file must be included in the core package's build output (check `tsconfig.json` assets or package.json `files` to ensure YAML files are copied)
- Verify: `loadBaseCatalog()` returns a valid `ComponentCatalogSpec` that passes `validateComponentCatalog()`

### `renderer_defaults` (New)

Catalog entries can include a `renderer_defaults` section containing flat key-value pairs for the designspec-renderer. These values tell the Penpot/React renderer HOW to draw the component (pixel values, sub-element colors, sizes).

```yaml
Card:
  # ... existing anatomy, states, token_bindings ...
  renderer_defaults:
    type: card
    background: surface-primary
    shadow: sm
    radius: 20
    padding: 24
```

**Data flow**: When `renderer_defaults` is present, `loadCatalogForRenderer()` uses these values directly instead of reverse-engineering from `states`/`token_bindings`. This is the preferred path — all new components should include `renderer_defaults`.

**Current state**: `V2_BUILTIN_CATALOG` in `catalog-entries.ts` is the current built-in source for unit tests. The planned migration path is to add `renderer_defaults` entries to all 15 components in `base-component-catalog.yaml`, making the TypeScript fixture test-only.

## Verification

1. `nx run core:typecheck` — no type errors
2. `nx run core:test` — add a test that `loadBaseCatalog()` returns a spec with 20+ components
3. Verify the YAML file is included in the build output (`packages/core/dist/catalogs/base-component-catalog.yaml`)

---

# Step 8: Add `generateProjectCatalog()` and wire into init

## Context

When a user runs `agentforge init` and picks a component library (e.g., shadcn), the project needs a filtered component catalog at `<project-root>/agentforge/spec/component-catalog.yaml`. This file should:
- Contain ONLY the chosen library's mapping (no mui/chakra entries in a shadcn project)
- Pull `min_height` from the project's `design-tokens.yaml` touch_targets (not hardcoded)
- Validate that token_bindings reference tokens that actually exist in the project's design tokens

The project-level catalog is written to `agentforge/spec/component-catalog.yaml` using the existing `saveComponentCatalog()` from `@agentforge/core`.

## Task

### 8a: Create the generator function

File: `packages/core/src/catalogs/generate-project-catalog.ts`

```typescript
import type { ComponentCatalogSpec, ComponentCatalogEntry, DesignTokensSpec } from '../types/design-system.js';

/**
 * Generate a project-specific component catalog by filtering the base catalog
 * for the chosen library and binding project-specific token values.
 *
 * @param baseCatalog - The framework's base catalog (all libraries, all components)
 * @param libraryId - The chosen library (e.g., 'shadcn', 'mui', 'chakra')
 * @param designTokens - The project's design tokens (for min_height and token validation)
 * @returns A filtered ComponentCatalogSpec for the project
 */
export function generateProjectCatalog(
  baseCatalog: ComponentCatalogSpec,
  libraryId: string,
  designTokens: DesignTokensSpec,
): ComponentCatalogSpec {
  const filteredComponents: Record<string, ComponentCatalogEntry> = {};

  for (const [name, entry] of Object.entries(baseCatalog.components)) {
    // 1. Filter library_mapping — keep only the chosen library
    const libraryMapping: Record<string, typeof entry.library_mapping[string]> = {};
    if (entry.library_mapping[libraryId]) {
      libraryMapping[libraryId] = entry.library_mapping[libraryId];
    }

    // 2. Set min_height from design tokens touch_targets (not hardcoded)
    const interactiveCategories = new Set(['input', 'navigation']);
    const minHeight = (interactiveCategories.has(entry.category) || entry.min_height)
      ? designTokens.touch_targets.minimum_height
      : undefined;

    // 3. Validate token_bindings — warn on unresolvable tokens
    if (entry.token_bindings) {
      const semanticNames = new Set(Object.keys(designTokens.colors.semantic));
      const radiusNames = new Set(Object.keys(designTokens.borders.radius));
      for (const [prop, value] of Object.entries(entry.token_bindings)) {
        if (typeof value === 'string' && !semanticNames.has(value) && !radiusNames.has(value)) {
          // Log warning but don't fail — base catalog tokens should always resolve
          console.warn(`[catalog] ${name}.token_bindings.${prop} references "${value}" which is not in design tokens`);
        }
      }
    }

    filteredComponents[name] = {
      ...entry,
      library_mapping: libraryMapping,
      ...(minHeight !== undefined ? { min_height: minHeight } : {}),
    };
  }

  return {
    version: baseCatalog.version,
    created_by: 'agentforge-init',
    components: filteredComponents,
  };
}
```

Export from `packages/core/src/catalogs/index.ts` and from `packages/core/src/index.ts`:

```typescript
export { generateProjectCatalog } from './catalogs/generate-project-catalog.js';
```

### 8b: Wire into init

File: `packages/cli/src/commands/init.ts`

In the `initCommand()` function, after the design system files are saved (around line 785-793 where `saveDesignTokens` and `saveBrandSpec` are called), add:

```typescript
import { loadBaseCatalog, generateProjectCatalog, saveComponentCatalog } from '@agentforge/core';

// After saving design tokens and brand spec:
const baseCatalog = loadBaseCatalog();
const projectCatalog = generateProjectCatalog(baseCatalog, libraryId, designResult.tokens);
saveComponentCatalog(rootDir, projectCatalog, fileSystem);
out.write(successMsg('✓ Component catalog generated\n'));
```

The `libraryId` comes from the component library selection earlier in the init flow (the `pickComponentLibrary()` call). You may need to capture the return value or read it from the saved `component-library.yaml`.

### 8c: Add regenerate command

File: `packages/cli/src/commands/design-system.ts` (or new file)

Add a CLI command `agentforge design-system regenerate-catalog` that re-runs the generator. This is used when design tokens or library choice change after init:

```typescript
// Pseudocode — adapt to existing CLI command patterns
export async function regenerateCatalog(rootDir: string, fs: FileSystem): Promise<void> {
  const tokens = loadDesignTokens(rootDir, fs);
  if (!tokens.ok) throw new Error(tokens.error.message);

  const library = loadComponentLibrary(rootDir, fs);
  if (!library.ok) throw new Error(library.error.message);

  const baseCatalog = loadBaseCatalog();
  const projectCatalog = generateProjectCatalog(baseCatalog, library.value.library_id, tokens.value);
  saveComponentCatalog(rootDir, projectCatalog, fs);
}
```

## Important

- The project-level catalog lives at `<project-root>/agentforge/spec/component-catalog.yaml` — this is where `saveComponentCatalog()` already writes to
- The `loadComponentCatalog()` function in core already reads from this path — no changes needed for downstream consumers
- `libraryId` must match the keys used in the base catalog's `library_mapping` (e.g., `'shadcn'`, `'mui'`, `'chakra'`)
- Components where the chosen library has no mapping in the base catalog still get included — they just have an empty `library_mapping: {}` (the design agent can still use their anatomy/states, the implementation agent uses native HTML)

## Verification

1. `nx run core:typecheck` and `nx run cli:typecheck` — no type errors
2. `nx run core:test` — add tests for `generateProjectCatalog()`:
   - Filters to only shadcn mappings when `libraryId = 'shadcn'`
   - Sets `min_height` from tokens, not hardcoded
   - Warns on unresolvable token_bindings
   - Components without a mapping for the chosen library get empty `library_mapping`
3. `agentforge init` (pick shadcn) → check `agentforge/spec/component-catalog.yaml`:
   - `grep -c "mui\|chakra" agentforge/spec/component-catalog.yaml` → **0**
   - `min_height` values match `design-tokens.yaml` touch_targets.minimum_height
   - File is ~40-50% smaller than the base catalog
4. `agentforge design-system regenerate-catalog` → overwrites the project catalog with fresh output
5. Downstream: `agentforge design-penpot` now gets catalog content in the `{{COMPONENT_CATALOG}}` placeholder (from Task 3 wiring)
