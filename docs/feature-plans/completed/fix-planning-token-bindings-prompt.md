# Fix: Unrecognized Token Names in Planning Agent — tokenBindings vs defaultValues

## Problem

The planning agent's `validateTokenBindings()` rejects LLM output because the LLM puts component-specific layout values (width, height, maxWidth, columns, imageHeight, etc.) and non-design-token properties (ariaLive, ariaLabel) into `tokenBindings` instead of `defaultValues`. This wastes correction retries on values that can never be valid tokens.

Root cause: the system prompt's example puts spacing numbers like `"AppLayout.gap": "24"` in tokenBindings, teaching the LLM that ALL numeric values belong there. There's also no explicit rule saying what does NOT belong in tokenBindings.

## Files to modify

1. `packages/agents-ux/src/prompts/ux-planning-system.md`
2. `packages/agents-ux/src/ux-planning/ux-planning.ts`
3. `packages/agents-ux/src/ux-planning/ux-planning.test.ts`

Read each file fully before making changes.

---

## Change 1: Update system prompt — clarify tokenBindings scope

**File:** `packages/agents-ux/src/prompts/ux-planning-system.md`

### 1a. Add exclusion rules

Find the section about "Using Project Design Tokens" (or wherever tokenBindings format is explained). Add this new subsection immediately AFTER it:

```markdown
### What does NOT belong in tokenBindings

tokenBindings maps component properties to **design system tokens only**. The following do NOT belong in tokenBindings — put them in `defaultValues` instead:

- **Component-specific dimensions**: width, height, maxWidth, minWidth, cardWidth, imageHeight, thumbnailSize, columnWidth, buttonSize — these are layout decisions, not design tokens
- **Counts and structural values**: columns, rows, itemCount, maxItems — these are structural, not design tokens
- **Accessibility attributes**: ariaLive, ariaLabel, role — these are HTML attributes, not design tokens
- **Arbitrary pixel values**: If the value is a number not listed in the VALID TOKEN NAMES spacing values, it belongs in `defaultValues`

Rule of thumb: If the value references a **named token** from the design system (like `surface-primary`, `heading-1`, `24`, `medium`, `elevation-1`), it goes in `tokenBindings`. If it's a component-specific number or a non-design property, it goes in `defaultValues`.
```

### 1b. Fix the example

Find the tokenBindings example in the prompt. It currently shows spacing numbers like `"AppLayout.gap": "24"` and `"AppLayout.padding": "32"` inside tokenBindings. Update the example so tokenBindings contains ONLY named token references, and move the spacing numbers to defaultValues:

**BEFORE (approximate — find the actual example):**
```json
"tokenBindings": {
    "ContentSection.background": "surface-primary",
    "ContentSection.border": "border-default",
    "ContentSection.font": "body",
    "AppLayout.gap": "24",
    "AppLayout.padding": "32"
}
```

**AFTER:**
```json
"tokenBindings": {
    "ContentSection.background": "surface-primary",
    "ContentSection.border": "border-default",
    "ContentSection.font": "body",
    "ContentSection.borderRadius": "medium",
    "ContentSection.shadow": "elevation-1"
},
"defaultValues": { "columns": 1, "gap": 24, "padding": 32, "maxWidth": 1200 }
```

The key change: spacing numbers move from tokenBindings to defaultValues. tokenBindings only contains named token references.

---

## Change 2: Add pre-validation filtering in ux-planning.ts

**File:** `packages/agents-ux/src/ux-planning/ux-planning.ts`

### 2a. Add `filterNonTokenBindings()` function

Add this function near the other token-related helper functions (near `extractValidTokenNames`, `buildTokenAllowlist`, `validateTokenBindings`):

```typescript
/**
 * Remove entries from tokenBindings that are fundamentally not design tokens.
 * These are component-specific dimensions, counts, and accessibility attributes
 * that the LLM incorrectly places in tokenBindings instead of defaultValues.
 *
 * Filter logic uses BOTH key suffix AND value to avoid false positives:
 * - Keys like .ariaLive, .columns are ALWAYS non-tokens (regardless of value)
 * - Keys like .width, .height are non-tokens ONLY when the value is not a valid token name
 *   (e.g., "280" is not a token, but "touch-min-height" could be)
 */
function filterNonTokenBindings(
  bindings: Record<string, string>,
  validNames: Set<string>,
): { cleaned: Record<string, string>; removed: string[] } {
  // These key suffixes are NEVER design tokens regardless of value
  const alwaysNonTokenKeys = /\.(columns|rows|itemCount|maxItems|ariaLive|ariaLabel|role)$/;

  // These key suffixes are non-tokens ONLY when the value is not a recognized token name
  const dimensionKeys = /\.(width|height|maxWidth|minWidth|maxHeight|minHeight|cardWidth|imageHeight|thumbnailSize|columnWidth|buttonSize|searchMaxWidth)$/;

  const cleaned: Record<string, string> = {};
  const removed: string[] = [];

  for (const [key, value] of Object.entries(bindings)) {
    if (alwaysNonTokenKeys.test(key)) {
      removed.push(key);
    } else if (dimensionKeys.test(key) && !validNames.has(value)) {
      removed.push(key);
    } else {
      cleaned[key] = value;
    }
  }

  return { cleaned, removed };
}
```

### 2b. Call `filterNonTokenBindings()` before `validateTokenBindings()`

Find where `validateTokenBindings()` is called on the LLM output (in the token binding validation loop). BEFORE the validation call, insert the filtering step:

```typescript
// Filter out non-token bindings before validation to avoid wasting correction retries
if (validTokenNames) {
  const { cleaned, removed } = filterNonTokenBindings(tokenBindings, validTokenNames);
  if (removed.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[planning] Removed ${removed.length} non-token bindings (component dimensions/counts/a11y attributes): ${removed.join(', ')}`,
    );
    tokenBindings = cleaned;
  }
}
```

IMPORTANT: Make sure `tokenBindings` is declared with `let` not `const` if it isn't already, since we're reassigning it. The variable holding the LLM's tokenBindings output needs to be mutable for this reassignment.

Also apply the same filtering after each correction retry — the corrected output may still contain non-token bindings. The filter should run before every `validateTokenBindings()` call.

### 2c. Update `buildTokenCorrectionPrompt()` to guide the LLM

Find `buildTokenCorrectionPrompt()` (around line 484 — verify exact location by searching for the function name). Add this paragraph to the correction prompt text, BEFORE the list of invalid bindings:

```
IMPORTANT: If a property is a component-specific dimension (width, height, maxWidth, cardWidth, imageHeight, buttonSize, thumbnailSize, etc.), a count (columns, rows), or an accessibility attribute (ariaLive, ariaLabel), REMOVE it from tokenBindings entirely. These are NOT design tokens — they belong in the component's defaultValues, not in tokenBindings. Do not try to find a matching token name for these properties; just remove them.
```

### 2d. Add `"0"` to valid spacing values

Find `extractValidTokenNames()`. It builds a `Set<string>` of valid token names from the design tokens spec. Find where it adds spacing scale values (it iterates `spec.spacing.scale` or similar). Add `"0"` as a valid value:

```typescript
// Zero spacing is a valid design choice (e.g., no gap, no padding)
names.add('0');
```

### 2e. Harden `applyDotNotationFallback()` as a safety net

Find `applyDotNotationFallback()`. After the existing dot-notation mapping logic (e.g., `color.surface.primary` → `surface-primary`), add a final cleanup pass that strips any remaining non-token dimension/count/a11y bindings. This ensures these values never survive even if the pre-filter didn't run:

```typescript
// Final cleanup: strip any remaining non-token bindings that slipped through
const alwaysNonTokenKeys = /\.(columns|rows|itemCount|maxItems|ariaLive|ariaLabel|role)$/;
const dimensionKeys = /\.(width|height|maxWidth|minWidth|maxHeight|minHeight|cardWidth|imageHeight|thumbnailSize|columnWidth|buttonSize|searchMaxWidth)$/;

for (const key of Object.keys(bindings)) {
  if (alwaysNonTokenKeys.test(key)) {
    delete bindings[key];
  } else if (dimensionKeys.test(key) && validNames && !validNames.has(bindings[key])) {
    delete bindings[key];
  }
}
```

Note: `applyDotNotationFallback()` may not currently receive `validNames` as a parameter. If not, add it as an optional parameter: `function applyDotNotationFallback(bindings: Record<string, string>, validNames?: Set<string>)` and pass it from the call site.

---

## Change 3: Add tests

**File:** `packages/agents-ux/src/ux-planning/ux-planning.test.ts`

Add a new `describe('filterNonTokenBindings')` block. You'll need to export `filterNonTokenBindings` from ux-planning.ts, or if the project convention is to not export internals, test it indirectly through the planning pipeline. Check how existing helper functions like `extractValidTokenNames` are tested and follow the same pattern.

### Test cases:

```typescript
describe('filterNonTokenBindings', () => {
  const validNames = new Set([
    'surface-primary', 'text-primary', 'heading-1', 'body',
    'border-default', 'medium', 'elevation-1', 'touch-min-height',
    '4', '8', '12', '16', '24', '32', '48', '64', '0',
  ]);

  it('removes always-non-token keys regardless of value', () => {
    const bindings = {
      'Grid.columns': '3',
      'Banner.ariaLive': 'polite',
      'Section.background': 'surface-primary',
    };
    const { cleaned, removed } = filterNonTokenBindings(bindings, validNames);
    expect(cleaned).toEqual({ 'Section.background': 'surface-primary' });
    expect(removed).toContain('Grid.columns');
    expect(removed).toContain('Banner.ariaLive');
  });

  it('removes dimension keys when value is not a valid token', () => {
    const bindings = {
      'Sidebar.width': '280',
      'Card.imageHeight': '200',
      'Header.height': '56',
      'Section.background': 'surface-primary',
    };
    const { cleaned, removed } = filterNonTokenBindings(bindings, validNames);
    expect(cleaned).toEqual({ 'Section.background': 'surface-primary' });
    expect(removed).toHaveLength(3);
  });

  it('keeps dimension keys when value IS a valid token name', () => {
    const bindings = {
      'Button.height': 'touch-min-height',
      'Section.background': 'surface-primary',
    };
    const { cleaned, removed } = filterNonTokenBindings(bindings, validNames);
    expect(cleaned).toEqual({
      'Button.height': 'touch-min-height',
      'Section.background': 'surface-primary',
    });
    expect(removed).toHaveLength(0);
  });

  it('keeps spacing scale values in tokenBindings', () => {
    const bindings = {
      'Section.gap': '24',
      'Layout.padding': '32',
    };
    // Note: gap and padding don't match dimension key patterns,
    // so they pass through. Their values (24, 32) are valid spacing tokens.
    const { cleaned, removed } = filterNonTokenBindings(bindings, validNames);
    expect(cleaned).toEqual(bindings);
    expect(removed).toHaveLength(0);
  });

  it('handles empty bindings', () => {
    const { cleaned, removed } = filterNonTokenBindings({}, validNames);
    expect(cleaned).toEqual({});
    expect(removed).toHaveLength(0);
  });
});
```

Also add a test that `"0"` is included in `extractValidTokenNames()` output:

```typescript
it('extractValidTokenNames includes "0" as valid spacing', () => {
  // Use the project's design tokens spec or a minimal test fixture
  const names = extractValidTokenNames(testDesignTokensSpec);
  expect(names.has('0')).toBe(true);
});
```

---

## Verification

Run these commands after all changes:

```bash
nx run agents-ux:typecheck
nx test agents-ux
```

Then grep to confirm the prompt changes landed:

```bash
grep -A5 "does NOT belong in tokenBindings" packages/agents-ux/src/prompts/ux-planning-system.md
grep "REMOVE it from tokenBindings" packages/agents-ux/src/ux-planning/ux-planning.ts
grep "names.add.*0" packages/agents-ux/src/ux-planning/ux-planning.ts
```

## Important notes

- Do NOT move filtered bindings into `defaultValues` on the component tree — just drop them from tokenBindings and log a warning. The component tree structure would require tree-walking to find the matching ComponentTreeNode by name, which adds complexity for minimal benefit.
- The filter must run BEFORE every `validateTokenBindings()` call — including after correction retries, not just on the initial output.
- The `alwaysNonTokenKeys` regex and `dimensionKeys` regex must be consistent between `filterNonTokenBindings()` and the safety net in `applyDotNotationFallback()`. Consider extracting them as module-level constants to avoid drift.
