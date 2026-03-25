# Fix: Penpot Design Prompt — Token Injection, Example Alignment, and Naming Consistency

## Purpose

The Penpot design agent produces poor visual output (truncated text, wrong colors, broken layouts). This document explains the five root causes found by auditing the actual prompt sent to the LLM, and specifies the exact fixes. Each fix includes the problem, why it matters, where in the codebase to look, and what the corrected output should look like.

---

## Problem 1: Design tokens injected at the BOTTOM of the prompt

### What's wrong

The project's design system (colors, typography, spacing) is injected at **line 967** of a ~1000-line system prompt, under the heading `# PROJECT DESIGN SYSTEM`. Above it are ~950 lines of instructions, API reference, and — critically — **three complete code examples** (Dashboard, Form/Wizard, Landing Page) that all use hardcoded hex values from a completely different color palette (blues `#2563EB`, grays `#1F2937`, greens `#16A34A`).

LLMs pattern-match against examples more than instructions. When the model sees three working examples all using blue/gray colors, then sees "use these warm-cream/deep-teal colors instead" at the very bottom, it defaults to the example patterns. The instruction to override is there, but it's in the weakest position — after the examples it's supposed to override.

This was already identified in the design pipeline audit as gap #6: "Token injection at bottom of prompt (should be top, mandatory)."

### Fix

Move the `# PROJECT DESIGN SYSTEM` block to the **top** of the system prompt, immediately after the role description (currently line 11-13). The LLM should internalize the project's colors before it sees any code examples.

### Where to look

Find the code that assembles the system prompt for the Penpot design agent. It likely concatenates:
1. Role description / output format instructions
2. Visual hierarchy rules
3. Semantic color & states table
4. Elevation & depth section
5. Component library alignment
6. Composition rules
7. Working examples (Dashboard, Form/Wizard, Landing Page)
8. Penpot Plugin API reference
9. Design rules / layout rules
10. **PROJECT DESIGN SYSTEM** ← currently here, move to position 2

### Target prompt structure (after fix)

```
1. Role description ("You create Penpot designs...")
2. PROJECT DESIGN SYSTEM (colors, typography, spacing, elevation) ← MOVED HERE
3. Component Catalog (when available)
4. Visual hierarchy rules
5. Semantic color & states
6. Elevation & depth
7. Component library alignment
8. Composition rules
9. Working examples (rewritten to use token references — see Problem 2)
10. Penpot Plugin API reference
11. Design rules / layout rules
```

The design tokens should be the FIRST thing the LLM reads after understanding its role. Everything that follows — rules, examples, API reference — should reference these tokens, not contradict them.

---

## Problem 2: Working examples use hardcoded hex from a different design system

### What's wrong

The three working examples in the system prompt (Dashboard ~line 186, Form/Wizard ~line 193, Landing Page ~line 951) contain hundreds of hardcoded hex values from a generic blue/gray palette:

```javascript
// From the Dashboard example:
shape.fills = [{ fillColor: '#FFFFFF', fillOpacity: 1 }]; // token: surface-primary
txt.fills = [{ fillColor: '#6B7280', fillOpacity: 1 }];   // token: text-secondary
val.fills = [{ fillColor: '#1F2937', fillOpacity: 1 }];   // token: text-primary

// From the Form/Wizard example:
circle.fills = [{ fillColor: '#2563EB', fillOpacity: 1 }]; // token: cta-primary
circle.fills = [{ fillColor: '#16A34A', fillOpacity: 0.12 }]; // token: success
```

The comments say `// token: surface-primary` but the actual hex value is `#FFFFFF` — which is NOT the project's `surface-primary` (which is `#FFF8E7` warm-cream). The LLM sees the hex value and uses it. The comment is for humans, not for the model's code generation.

### Fix

Rewrite all three examples to use **token reference patterns** instead of hardcoded hex. There are two approaches:

**Approach A (recommended): Use a token resolver pattern in the examples**

Show the LLM how to create a color lookup from the project tokens, then use it throughout:

```javascript
// At the top of every generated script, build a color map from the project's design tokens:
const T = {
  bgPrimary: '#FFF8E7',      // token: background-primary
  surfacePrimary: '#FFF8E7',  // token: surface-primary
  surfaceElevated: '#FAFAF8', // token: surface-elevated
  textPrimary: '#444441',     // token: text-primary
  textSecondary: '#9C9C97',   // token: text-secondary
  ctaPrimary: '#0F6E56',      // token: cta-primary
  textOnCta: '#FFF8E7',       // token: text-on-cta
  error: '#E8593C',           // token: error
  borderDefault: '#9C9C97',   // token: border-default
  borderFocus: '#0F6E56',     // token: border-focus
  success: '#0F6E56',         // token: success
  // ... all 17 semantic colors
};

// Then use T.xxx throughout:
card.fills = [{ fillColor: T.surfacePrimary, fillOpacity: 1 }];
title.fills = [{ fillColor: T.textPrimary, fillOpacity: 1 }];
button.fills = [{ fillColor: T.ctaPrimary, fillOpacity: 1 }];
```

The example still works as complete runnable code, but the LLM sees the pattern: "build a color map from the project tokens, then reference it everywhere." When generating for a new project, it will build the map from whatever tokens are provided.

**Approach B: Use placeholder comments that the LLM must resolve**

```javascript
card.fills = [{ fillColor: '{{surface-primary}}', fillOpacity: 1 }];
title.fills = [{ fillColor: '{{text-primary}}', fillOpacity: 1 }];
```

Then add a rule: "Replace all `{{token-name}}` placeholders with the hex value from the PROJECT DESIGN SYSTEM section."

This is simpler but riskier — the LLM might emit the placeholders literally instead of resolving them.

**Approach A is recommended** because it produces a working code pattern the LLM can follow, and the token map at the top of the script makes the color choices explicit and auditable.

### What to change

Rewrite the three example scripts in `buildSystemPrompt()` or wherever the system prompt template lives. Replace every hardcoded hex with a `T.xxx` reference, and add the color map preamble to each example. The map values in the examples should use generic placeholder values or the project's actual values (if the examples are generated dynamically).

If the examples are static (hardcoded in the prompt template), use obviously-placeholder values so the LLM doesn't memorize them:

```javascript
const T = {
  bgPrimary: '%%BACKGROUND_PRIMARY%%',
  textPrimary: '%%TEXT_PRIMARY%%',
  ctaPrimary: '%%CTA_PRIMARY%%',
  // ...
};
```

Then add an instruction: "The `T` object values above are placeholders. Replace them with the actual hex values from the PROJECT DESIGN SYSTEM section."

---

## Problem 3: Token bindings in component spec use WRONG naming convention

### What's wrong

The component spec passed in the user message contains `tokenBindings` that use a dot-notation naming convention that does NOT match the design tokens:

```json
// What the component spec says:
"BillEntryLayout.background": "color.background.primary"
"CurrencyInput.border": "color.border.input"
"TipPercentageControl.selectedText": "color.text.inverse"
"CustomSplitPanel.background": "color.surface.tertiary"
"CalculationSummary.background": "color.surface.accent"
"SplitBillButton.disabledBackground": "color.surface.disabled"

// What the design tokens actually define:
background-primary, border-default, text-on-cta, surface-elevated, surface-secondary
```

Names like `color.border.input`, `color.text.inverse`, `color.surface.tertiary`, `color.surface.accent`, `color.surface.disabled` DO NOT EXIST in the design tokens. The LLM has to guess what these map to — and it guesses wrong, producing broken colors or falling back to the example defaults.

### Fix

This is a bug in the **component spec generation** phase (the agent that creates the `componentTree` and `tokenBindings`), not in the design prompt itself. There are two parts to fix:

**Part A: Align the naming convention.** Token bindings must use the exact semantic names from `design-tokens.yaml`:

```json
// WRONG — invented names:
"BillEntryLayout.background": "color.background.primary"
"CurrencyInput.border": "color.border.input"
"TipPercentageControl.selectedText": "color.text.inverse"

// CORRECT — matches design-tokens.yaml:
"BillEntryLayout.background": "background-primary"
"CurrencyInput.border": "border-default"
"TipPercentageControl.selectedText": "text-on-cta"
```

**Part B: Only reference tokens that exist.** The spec generation agent must be constrained to the 17 semantic token names that actually exist in `design-tokens.yaml`. Names like `surface.tertiary`, `surface.accent`, `surface.disabled`, `border.input`, `text.inverse` are fabricated. Map them to existing tokens:

| Invented name | Correct mapping |
|---|---|
| `color.background.primary` | `background-primary` |
| `color.surface.primary` | `surface-primary` |
| `color.surface.secondary` | `surface-secondary` |
| `color.surface.tertiary` | `surface-elevated` (closest match) |
| `color.surface.accent` | `surface-elevated` or `cta-primary` at low opacity |
| `color.surface.disabled` | `surface-secondary` with reduced opacity |
| `color.border.input` | `border-default` |
| `color.border.subtle` | `border-default` |
| `color.text.inverse` | `text-on-cta` |
| `color.text.accent` | `cta-primary` |
| `color.text.primary` | `text-primary` |
| `color.text.secondary` | `text-secondary` |
| `color.primary` | `cta-primary` |
| `spacing.xl` | Use spacing scale value (e.g., 32) |
| `spacing.lg` | Use spacing scale value (e.g., 24) |

### Where to look

Find the agent or function that generates the `componentTree` and `tokenBindings` object. It needs access to the list of valid semantic token names from `design-tokens.yaml` and must be constrained to only use those names. The prompt for THAT agent should include the valid token names as an allowlist.

---

## Problem 4: Component catalog is missing

### What's wrong

Line 17 of the prompt: `(No component catalog available)`

The system prompt has a `## Component Catalog (MANDATORY when available)` section that's empty. Without the catalog, the LLM has no reference for:
- What slots each component has (anatomy)
- What states each component supports (default, hover, disabled, error)
- What tokens bind to which visual properties
- What library component maps to each design element

The LLM is working from component NAMES only (`BillInputSection`, `TipPercentageControl`, `CalculationSummary`) and guessing at everything else.

### Fix

This depends on the `component-catalog.yaml` being generated at init (per the earlier expansion plan). Once it exists:

1. Load `component-catalog.yaml` in the prompt assembly code
2. Inject relevant component entries into the `## Component Catalog` section
3. Format each entry so the LLM knows the anatomy, states, and token bindings

Example of what the catalog section should look like when populated:

```markdown
## Component Catalog (MANDATORY when available)

### button
- Anatomy: [icon-left, label, icon-right]
- Sizes: sm (32px), md (40px), lg (48px)
- Variants: primary, secondary, ghost, destructive
- States:
  - default: bg=cta-primary, text=text-on-cta, border=none
  - hover: bg=cta-hover, opacity=0.9
  - disabled: bg=surface-secondary, text=text-disabled, opacity=0.5
- Token bindings: background → cta-primary, text → text-on-cta, border-radius → medium (12px)
- Library: shadcn Button, variant prop, import from @/components/ui/button

### card
- Anatomy: [header, body, footer]
- States:
  - default: bg=surface-primary, border=border-default (1px), radius=large (16px)
  - selected: bg=surface-elevated, border=cta-primary (2px)
- Token bindings: background → surface-primary, border → border-default, padding → 24px

### input
- Anatomy: [label, field, helper-text]
- States:
  - default: bg=surface-primary, border=border-default (1px), radius=medium (12px)
  - focus: border=border-focus (2px)
  - error: border=border-error (2px), helper-text color=error
  - disabled: bg=surface-secondary, opacity=0.5
```

This gives the LLM exact specifications for every component it needs to render — no guessing.

### Where to look

Find the code that assembles the design agent's system prompt. Look for where `(No component catalog available)` is set. Add a conditional that loads `component-catalog.yaml` (if it exists) and formats each entry for injection.

---

## Problem 5: No viewport/layout context for narrow form layouts

### What's wrong

The `componentTree` specifies `maxWidth: 480` (a phone-width form), but all three working examples in the prompt create 1440px-wide boards for dashboards and landing pages. The LLM has no guidance on how to handle a narrow form within a desktop-width board.

The result: it creates a 1440px board with the 480px content poorly centered, massive dead space on both sides, and components that don't fill their container properly. Text truncates ("plit the Bi", "Custom Split A") because the LLM sized elements for a narrow column but didn't account for text length.

### Fix

Add viewport context to the **user message** (not the system prompt — this varies per component). The spec generation agent should include layout intent:

```
Module ID: bill-entry
Viewport: mobile-first form, 480px max-width, single column
Board size: Create a 480px × auto board (not 1440px). Let flex layout determine height.
Layout: Single column, 24px horizontal padding, 32px vertical section gaps.
```

Also add a **mobile/form layout example** to the system prompt alongside the existing Dashboard, Form/Wizard, and Landing Page examples. The current examples are all 1440px desktop layouts. A 480px form example would teach the LLM the right pattern:

```javascript
// Mobile form pattern
const root = penpot.createBoard();
root.name = 'FormRoot';
root.x = 0;
root.y = 0;
root.resize(480, 800); // Mobile-width form, not 1440px
root.fills = [{ fillColor: T.bgPrimary, fillOpacity: 1 }];
const rootFlex = root.addFlexLayout();
rootFlex.dir = 'column';
rootFlex.rowGap = 24;
rootFlex.topPadding = 24;
rootFlex.rightPadding = 24;
rootFlex.bottomPadding = 24;
rootFlex.leftPadding = 24;

// Page heading — full width of 480px container
const heading = penpot.createText('Split the Bill');
heading.fontSize = 32; // role: heading-1
heading.fontWeight = '700';
heading.fills = [{ fillColor: T.textPrimary, fillOpacity: 1 }];
root.appendChild(heading);

// Input field — stretches to fill column
// ... (label above, 432px wide input, helper text below)
```

### Where to look

1. The agent that generates the `componentTree` — it should include viewport/layout metadata
2. The system prompt assembly — add a mobile/form example alongside the existing desktop examples
3. Consider adding a `viewport` field to the component spec:
   ```json
   {
     "viewport": "mobile",
     "boardWidth": 480,
     "layout": "single-column"
   }
   ```

---

## Summary of changes

| # | Problem | Fix | Impact |
|---|---------|-----|--------|
| 1 | Tokens at bottom of prompt | Move to top, after role description | High — LLM sees project colors before examples |
| 2 | Examples use wrong hardcoded colors | Rewrite with token map pattern (`T.xxx`) | High — LLM follows the pattern with project tokens |
| 3 | Token bindings use invented names | Align to `design-tokens.yaml` semantic names | High — LLM can resolve colors instead of guessing |
| 4 | No component catalog | Inject `component-catalog.yaml` when available | Medium — LLM knows component anatomy and states |
| 5 | No viewport context for narrow layouts | Add viewport metadata + mobile form example | Medium — LLM sizes the board correctly |

Fixes 1 and 3 are the highest priority — they directly explain why the design uses wrong colors and broken layouts. Fix 2 prevents the problem from recurring for every new project. Fixes 4 and 5 improve output quality but are less critical than getting colors and naming right.

---

## Verification

After implementing:

1. Run `agentforge init` → `agentforge design-penpot` for a simple form app
2. Check the assembled prompt:
   - Design tokens appear BEFORE examples
   - Examples use `T.xxx` pattern, not hardcoded hex
   - Token bindings in component spec use names from `design-tokens.yaml`
3. Check the generated Penpot design:
   - Colors match the project's palette (warm-cream background, deep-teal CTA, etc.)
   - Text is not truncated (board width matches viewport intent)
   - Components have correct states (border-default for resting, cta-primary for active)
