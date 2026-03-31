# Drop structured output schema + Add value validation

## Context

The browser correction adapter uses Claude's `responseSchema` (strict structured output) for vision LLM responses. This causes cascading 400 errors because Claude's compilation limits (24 optional params, 16 unions) are fundamentally incompatible with our sparse patch format (any subset of 30+ fields). We're removing structured output and adding value validation to `sanitizePatches()` instead.

## Critical Files

- `packages/agents-ux/src/ux-design/browser-correction-adapter.ts` — main adapter (modify)
- `packages/agents-ux/src/ux-design/__tests__/browser-correction-adapter.test.ts` — tests (modify)
- `packages/designspec-renderer/src/types/design-spec-v2.ts` — canonical types (read-only reference)

## Canonical Types (from `design-spec-v2.ts`)

### Numeric fields
`gap`, `px`, `py`, `pt`, `pb`, `mt`, `mb`, `ml`, `mr`, `my`, `mx`, `order`, `weight`, `height`, `radius`

### String fields
`parent`, `catalog`, `label`, `content`, `placeholder`, `helper`, `title`, `typography`, `color`, `background`, `shadow`

### String | Number fields
`value`

### Dimension keyword fields
`width`: `number | 'fill'` (only `'fill'` — no `'hug'` or `'auto'`)

### Enum fields (exact allowed values)
- `type` (AcceleratorType): `'page' | 'container' | 'section' | 'header' | 'divider' | 'spacer' | 'text'`
- `layout.dir`: `'row' | 'column'`
- `layout.align`: `'start' | 'center' | 'end' | 'stretch'`
- `layout.justify`: `'start' | 'center' | 'end' | 'space-between'`
- `textAlign`: `'left' | 'center' | 'right'`

### Boolean fields
None on NodeSpec directly. `SegmentedOption.selected` is boolean.

### Complex fields
- `layout`: `LayoutSpec` object
- `options`: `readonly SegmentedOption[]` where `SegmentedOption = { label: string, selected: boolean }`
- `overrides`: `Record<string, unknown>`
- `items`: `Record<string, unknown>[]`

---

## Step 1: Add `validatePatchValues()` to `browser-correction-adapter.ts`

Add a new function called inside `sanitizePatches()`, AFTER existing key validation, BEFORE returning the patch. This validates/coerces VALUES (existing code only validates KEYS).

```typescript
// Validation maps derived from DesignSpecV2 types in design-spec-v2.ts
const NUMERIC_FIELDS = new Set([
  'gap', 'px', 'py', 'pt', 'pb', 'mt', 'mb', 'ml', 'mr', 'my', 'mx',
  'order', 'weight', 'height', 'radius',
]);
const DIMENSION_FIELDS = new Set(['width']);  // accepts number | 'fill'
const ENUM_FIELDS: Record<string, readonly string[]> = {
  type: ['page', 'container', 'section', 'header', 'divider', 'spacer', 'text'],
  textAlign: ['left', 'center', 'right'],
};
const LAYOUT_ENUM_FIELDS: Record<string, readonly string[]> = {
  dir: ['row', 'column'],
  align: ['start', 'center', 'end', 'stretch'],
  justify: ['start', 'center', 'end', 'space-between'],
};
const STRING_FIELDS = new Set([
  'parent', 'catalog', 'label', 'content', 'placeholder', 'helper',
  'title', 'typography', 'color', 'background', 'shadow',
]);
```

Rules:
- **Numeric fields**: number→keep, string with digits→coerce (`"16"`→`16`), string with unit suffix (`"16px"`, `"1rem"`)→strip unit & coerce, null→keep (removal), else→strip
- **Dimension fields** (`width`): number→keep, `'fill'`→keep, string with digits/units→coerce to number, null→keep, else→strip
- **Enum fields**: valid value→keep, null→keep, else→strip + log warning
- **String fields**: string→keep, null→keep, non-string→strip
- **Layout sub-object**: validate inner fields against `LAYOUT_ENUM_FIELDS` for enums and `NUMERIC_FIELDS` for numeric layout props (gap, px, py, pt, pb, mt, mb, ml, mr, my, mx)

Call `validatePatchValues()` inside `sanitizePatches()` on each node's cleaned patch.

## Step 2: Remove structured output schema

In `browser-correction-adapter.ts`:

1. **Delete** `LAYOUT_SCHEMA`, `NODE_PATCH_SCHEMA`, and `PATCH_SCHEMA` constant definitions entirely (~50 lines of schema construction)
2. **Remove** `responseSchema: PATCH_SCHEMA` from the `provider.complete()` options
3. Keep `model`, `maxTokens`, `temperature` options

## Step 3: Simplify parsing logic

1. Keep `structured` branch as defensive fallback (don't delete — another provider might return it)
2. Keep text-parsing path as primary (extract JSON from code fences or raw text)
3. Accept **both** formats (LLM is unconstrained now):
   - Object-map: `{ "patches": { "node-id": { ...patch } } }`
   - Array: `{ "patches": [{ "nodeId": "...", ...patch }] }`
4. Add defensive unwrapping:
   - If JSON has `{ "response": { "patches": ... } }` → unwrap
   - If `patches` is missing but top-level keys look like node IDs (values are objects with known NodeSpec fields) → treat entire object as patches map
5. All parsed patches flow through `sanitizePatches()` (which now includes value validation)

## Step 4: Update system prompt

Revert to simpler object-map format in the example. Restore `null` for field removal:

```json
{
  "patches": {
    "card-header": {
      "layout": { "dir": "row", "justify": "space-between", "align": "center", "px": 24, "py": 16, "gap": 12 }
    },
    "status-badge": {
      "width": null
    }
  },
  "reasoning": "..."
}
```

Keep the `removeFields` support in parsing code (handle both `null` and `removeFields`), but show `null` in the prompt example since it's more natural.

Do NOT change the NodeSpec interface listing, CSS blocklist, or valid property enumeration in the system prompt.

## Step 5: Update tests

File: `packages/agents-ux/src/ux-design/__tests__/browser-correction-adapter.test.ts`

### Remove/replace
- Delete `responseSchema has additionalProperties: false on node patch level` test
- Delete `responseSchema has additionalProperties: false on layout level` test

### Add new tests
1. `does not pass responseSchema to provider.complete()` — verify options do NOT include `responseSchema`
2. **Value validation tests** (on `sanitizePatches` or `validatePatchValues`):
   - `strips CSS unit values and coerces to numbers` — `{ "gap": "16px" }` → `{ "gap": 16 }`
   - `coerces string numbers` — `{ "radius": "8" }` → `{ "radius": 8 }`
   - `rejects invalid enum values` — `{ "dir": "flex-row" }` → stripped
   - `preserves valid dimension keywords` — `{ "width": "fill" }` → kept
   - `strips non-numeric non-keyword dimensions` — `{ "width": "100%" }` → stripped
   - `preserves null for field removal` — `{ "background": null }` → kept
3. **Degenerate response parsing tests**:
   - `parses patches from wrapped response object` — `{ "response": { "patches": { ... } } }`
   - `parses patches when top-level object is patches map` — `{ "node-id": { "layout": { ... } } }`
   - `handles both null and removeFields for field removal`

## Verification

Run in order, stop and fix if any step fails:
1. `nx run-many -t typecheck` — zero errors in framework packages
2. `nx test @agentforge/agents-ux` — all pass including new tests
3. `nx run-many -t test` — full suite passes

## Do NOT

- Invent enum values from memory — use the values listed above (from `design-spec-v2.ts`)
- Remove the system prompt's NodeSpec listing, CSS blocklist, or worked examples
- Change `sanitizePatches()`'s existing key validation or CSS alias mapping — only ADD value validation
- Change downstream patch application in `browser-correction-pipeline.ts`
- Modify files outside `browser-correction-adapter.ts` and its test file unless typecheck forces it
