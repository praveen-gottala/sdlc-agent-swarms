# Token Vocabulary Mismatch — Pipeline Analysis

## Summary

Three independent data sources define semantic color vocabularies with no shared canonical list, causing silent visual failures in generated Penpot designs.

## Root Cause

During `agentforge init`, two files are generated from independent sources:
- `design-tokens.yaml` — 17 semantic colors from LLM/archetypes, enforced by JSON Schema
- `component-catalog.yaml` — static template from `base-component-catalog.yaml`, uses different token names

These are saved by different functions with no reconciliation beyond a warning-only `validateTokenBindings()` call.

## Key Mismatches Found

| Token | Used By | Exists in design-tokens.yaml? |
|---|---|---|
| `text-on-primary` | base-component-catalog.yaml (~10 refs) | NO — should be `text-on-cta` |
| `surface-secondary` | base-component-catalog.yaml (~36 refs) | Blocked by LLM JSON Schema |
| `surface-input` | renderer fixtures | Blocked by LLM JSON Schema |
| `shadow-xl` | base-component-catalog.yaml (Dialog) | NOT in shadow alias map |

## Pipeline Propagation

`text-on-primary` traced through the pipeline:
1. **Init** — never generated in design tokens
2. **Catalog Gen** — `validateTokenBindings()` warns but writes anyway
3. **Planning** — `DOT_NOTATION_HINTS` has no mapping → accepted with warning
4. **Design** — LLM sees `text-on-primary` from catalog → emits `T.textOnPrimary`
5. **Renderer** — `buildTokenMap()` skips it → NOT in `const T = {}`
6. **Penpot Runtime** — `T.textOnPrimary` is `undefined` → silent visual failure

## Loader Transformation Gaps

`transformEntry()` in `catalog/loader.ts` has silent data loss:
- `states.default.opacity` — not transferred → components lose opacity
- `token_bindings['text']` — `applyTokenBindings()` skips it
- `token_bindings['background']` — not mapped

## Fix Applied

- Step 2: Normalized `text-on-primary` → `text-on-cta` in base catalog
- Step 3: Added `surface-secondary` and `surface-input` to LLM JSON Schema (17 → 19 colors)
- Step 4: Added semantic color defaults for new tokens
- Step 5: Updated LLM system prompt with guidance for new tokens
- Step 6: Fixed DEFAULT_COMPONENTS to use `text-on-cta` instead of `background-primary`
- Step 7: `transparent`/`none` skipped in catalog validation
- Step 8: Added `text-on-primary` → `text-on-cta` fallback in DOT_NOTATION_HINTS
- Step 9: Created `validate-token-refs.ts` for token reference validation
- Step 10: Added Proxy safety net returning `#FF00FF` for missing tokens
- Step 11: Fixed `shadow-xl` → `shadow-lg` in base catalog; added `xl` to shadow aliases
- Step 12: Fixed loader transformation gaps (opacity, text, background bindings)
- Step 13: Updated design prompts with `surface-input` token
- Step 14: Updated tests

## Verification

```bash
# No text-on-primary in base catalog
grep -c 'text-on-primary' packages/core/src/catalogs/base-component-catalog.yaml
# Expected: 0

# No shadow-xl in base catalog
grep -c 'shadow-xl' packages/core/src/catalogs/base-component-catalog.yaml
# Expected: 0

# surface-secondary in LLM schema
grep 'surface-secondary' packages/cli/src/commands/generate-design-options.ts
# Expected: found in schema properties

# Token ref validation exists
ls packages/designspec-renderer/src/validation/validate-token-refs.ts
# Expected: file exists
```
