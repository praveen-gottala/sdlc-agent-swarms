---
name: verify-design-render
description: Verify that all DesignSpec JSON properties render correctly in the browser. Property-by-property gap analysis between spec and renderer.
argument-hint: "<project>/<page>"
---

## Design Render Verification

You are verifying that a DesignSpec JSON is faithfully rendered to CSS/HTML by the browser renderer. This skill is the glue between design specs and the renderer — it catches silent property drops, override conflicts, and mechanical rendering issues.

### Pre-loaded context
!`ls apps/ 2>/dev/null | head -20`
!`git log --oneline -5 2>/dev/null`

### Step 1: Parse arguments

Split `$ARGUMENTS` on `/` to get `<project>` and `<page>`.

- Project must be in `apps/` directory
- Page is the design JSON filename without extension

Resolve these files:
- Spec: `apps/<project>/agentforge/designs/<page>.json`
- Tokens: `apps/<project>/agentforge/spec/design-tokens.yaml`
- Catalog: `apps/<project>/agentforge/spec/component-catalog.yaml`

If any file is missing, report which file and stop.

### Step 2: Run the verification script

Run the headless verification tool:

```bash
npx tsx packages/designspec-renderer/src/renderer/browser/verify-design-render.ts apps/<project> <page>
```

This will:
1. Load the spec, tokens, and catalog
2. Render headlessly via Playwright (no dashboard needed)
3. Extract comprehensive computed styles from every `[data-node]` element
4. Compare spec properties against actual computed CSS
5. Run mechanical issue detection (overlap, overflow, zero-size, text-clip, badge-oversize)
6. Output a structured gap analysis report

### Step 3: Interpret the results

The report categorizes every property check as:

| Verdict | Meaning |
|---------|---------|
| **PASS** | Spec property rendered correctly in the DOM |
| **FAIL** | Spec property did not match computed CSS — likely a renderer bug or missing handler |
| **DROP** | Override key not in `SAFE_OVERRIDE_KEYS` — silently filtered by the renderer |
| **DATA** | Non-CSS behavioral override (role, aria-label, variant, etc.) — not expected in CSS |

### Step 4: Analyze failures

For each **FAIL**:
1. Read the relevant renderer code in `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx`
2. Trace the property through the style builder functions (`getCommonNodeStyles`, `getLayoutStyles`, `getSizeStyles`, `getOverrideStyles`, etc.)
3. Determine if the failure is:
   - A renderer bug (property has no handler or handler is wrong)
   - A spec issue (spec declares conflicting properties)
   - A token resolution issue (semantic token doesn't resolve to hex)
4. Suggest the specific fix with file path and function name

For each **DROP**:
1. Check if the override key should be added to `SAFE_OVERRIDE_KEYS` (line ~132 in DesignSpecRenderer.tsx)
2. If the key is a valid CSS property that the renderer should support, recommend adding it
3. If the key is data/behavioral (like `role`, `aria-label`), recommend adding it to `NON_CSS_OVERRIDE_KEYS` in the verification script

### Step 5: Report

Present findings as:
1. Summary line (pass rate, failure count)
2. Failures with root cause analysis and fix suggestions
3. Dropped overrides with recommendation (add to safe list or mark as data)
4. Mechanical issues if any

### Key files reference

| File | Purpose |
|------|---------|
| `packages/designspec-renderer/src/renderer/browser/verify-design-render.ts` | Verification script |
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx` | Style builder — source of truth for spec-to-CSS mapping |
| `packages/designspec-renderer/src/renderer/browser/dom-extraction.ts` | DOM computed style extraction |
| `packages/designspec-renderer/src/renderer/browser/mechanical-fixes.ts` | Mechanical issue detection |
| `packages/designspec-renderer/src/catalog/resolver.ts` | Catalog merge logic |
| `packages/designspec-renderer/src/types/design-spec-v2.ts` | NodeSpec type definition |

### Rules
- Always run the verification script first — do not guess or theorize
- Failures in the verification script itself (false positives) should be fixed in the script, not ignored
- Real renderer failures should be fixed in the renderer, not worked around
- After fixing renderer code, re-run the verification to confirm the fix
