# Fix: Penpot Design Generation — Text Truncation, Layout Collapse, and Flex Direction Issues

## Problem

The Penpot design agent generates scripts where:
- Text truncates ("Split the b...", "Enter your bill de...")
- Sections collapse to zero/minimum width
- Elements overlap (currency prefix on amount value)
- Entire sections aren't visible (tip segmented control, people section)

Root causes: the design prompt doesn't teach the LLM about Penpot's `growType`, `layoutChild` sizing, flex direction workaround, or section width requirements.

## File: `packages/agents-ux/src/prompts/ux-penpot-design-system.md`

### Change 1: Add to the Penpot Plugin API numbered rules section (near line 340)

After the existing rule about `parent.appendChild(child)`, add these rules:

```markdown
10. **Use `shape.layoutChild`** AFTER `parent.appendChild(child)` — NOT before. The `layoutChild` property is only available after a shape has been added to a flex/grid parent. Properties:
    - `horizontalSizing`: `"fill"` (stretch to parent width), `"auto"` (size to content), `"fix"` (use resize dimensions)
    - `verticalSizing`: `"fill"` (stretch to parent height), `"auto"` (size to content), `"fix"` (use resize dimensions)
    - `alignSelf`: `"start" | "center" | "end" | "stretch" | "auto"`

11. **Use `shape.growType`** on text nodes to control text sizing:
    - `"auto-width"` (DEFAULT) — text expands horizontally to fit content. Use for short text only (numbers, single words, button labels)
    - `"auto-height"` — text wraps at the given width and grows vertically. Use for multi-word text (headings, descriptions, labels >20 chars). MUST call `resize(width, estimatedHeight)` first to set the wrap width
    - `"fixed"` — text clips to exact dimensions. Avoid unless intentionally truncating

12. **Flex direction workaround (CRITICAL)**: Setting `dir` on the object returned by `addFlexLayout()` may silently fail due to a known Penpot bug. Always set direction via the board's `.flex` property:
    ```js
    // WRONG — direction may silently stay as 'row'
    const flex = board.addFlexLayout();
    flex.dir = 'column';

    // RIGHT — reliably sets direction
    const flex = board.addFlexLayout();
    board.flex.dir = 'column';
    // Other properties (padding, gap, alignment) work fine on the returned flex object
    flex.rowGap = 16;
    flex.topPadding = 24;
    ```

13. **Section boards without visible background** (transparent containers used for grouping) MUST have either:
    - An explicit `resize(parentWidth, estimatedHeight)` call, OR
    - `layoutChild.horizontalSizing = "fill"` set AFTER being appended to their parent
    Without one of these, sections collapse to zero width inside flex layouts.

14. **Children ordering in flex layouts** may be reversed relative to visual order. The first `appendChild` may render at the bottom (column) or right (row). If the visual order appears reversed, reverse the `appendChild` call order.
```

### Change 2: Replace the "Text overflow prevention" section (near line 348)

Find the existing "Text overflow prevention" section (currently ~3 lines) and replace with:

```markdown
### Text overflow prevention

**The #1 cause of broken Penpot designs is text without proper `growType` and width constraints.**

Every text node MUST follow one of these two patterns:

**Pattern A — Short text (numbers, button labels, single words):**
```js
const label = penpot.createText('$124.50');
label.fontSize = 32;
label.fontWeight = '700';
label.fills = [{ fillColor: T.textPrimary, fillOpacity: 1 }];
// Leave growType as default 'auto-width' — text expands to fit
parent.appendChild(label);
```

**Pattern B — Long text (headings, descriptions, any text >20 characters):**
```js
const heading = penpot.createText('Split the bill, not the friendship.');
heading.fontSize = 24;
heading.fontWeight = '700';
heading.fills = [{ fillColor: T.textPrimary, fillOpacity: 1 }];
heading.resize(CONTENT_W, 40);          // Set wrap width to container width
heading.growType = 'auto-height';        // Wrap text, grow vertically
parent.appendChild(heading);
heading.layoutChild.horizontalSizing = 'fill';  // Stretch to parent width
```

**Recommended `makeLabel` helper:**
```js
function makeLabel(txt, size, weight, color, opacity, parentWidth) {
  const t = penpot.createText(txt);
  t.fontSize = size;
  t.fontWeight = String(weight);
  t.fills = [{ fillColor: color, fillOpacity: opacity !== undefined ? opacity : 1 }];
  // For long text, set wrap width and auto-height
  if (parentWidth && txt.length > 20) {
    t.resize(parentWidth, size * 2);
    t.growType = 'auto-height';
  }
  return t;
}
```

After adding ANY text to a flex parent, set layout sizing:
```js
parent.appendChild(label);
label.layoutChild.horizontalSizing = 'fill';  // Always stretch text to parent
```

**NEVER do this:**
```js
// WRONG — long text with auto-width overflows horizontally
const desc = penpot.createText('Enter your bill details below and we will calculate exactly who owes what.');
desc.fontSize = 14;
parent.appendChild(desc);
// Text extends far beyond parent bounds, gets clipped

// WRONG — resize without growType clips text
const heading = penpot.createText('A very long heading that needs wrapping');
heading.resize(400, 30);
// growType is now 'fixed' — text clips at 400x30 box
```
```

### Change 3: Update ALL three working examples

In each of the three examples (Dashboard, Form/Wizard, Mobile Form), apply these changes:

**A. Fix flex direction on every board with column layout:**

Find every instance of:
```js
const xxxFlex = board.addFlexLayout();
xxxFlex.dir = 'column';
```

Change to:
```js
const xxxFlex = board.addFlexLayout();
board.flex.dir = 'column';
```

Keep `xxxFlex.dir = 'row'` as-is — only column direction has the bug.

**B. Update the `makeLabel` helper in each example:**

Replace the existing pattern (if present) or add at the top of each example's script:
```js
function makeLabel(txt, size, weight, color, opacity, parentWidth) {
  const t = penpot.createText(txt);
  t.fontSize = size;
  t.fontWeight = String(weight);
  t.fills = [{ fillColor: color, fillOpacity: opacity !== undefined ? opacity : 1 }];
  if (parentWidth && txt.length > 20) {
    t.resize(parentWidth, size * 2);
    t.growType = 'auto-height';
  }
  return t;
}
```

**C. After every `appendChild` of a text node, add layoutChild sizing:**

After lines like:
```js
root.appendChild(pageTitle);
```

Add:
```js
pageTitle.layoutChild.horizontalSizing = 'fill';
```

Do this for ALL text nodes and section boards appended to flex parents.

**D. Section boards without resize() — add layoutChild sizing:**

After every section board `appendChild` (boards with `fills = []` that serve as grouping containers):
```js
col.appendChild(billSection);
billSection.layoutChild.horizontalSizing = 'fill';  // ADD THIS
```

### Change 4: Add text truncation detection to design evaluator

**File:** `packages/agents-ux/src/ux-design/design-evaluator.ts`

In the scoring criteria section of the evaluator prompt (around line 90-94), add:

```
Text quality (critical — these indicate broken layout, not just poor design):
- Deduct 15 points if any text appears truncated (cut off mid-word, or text visibly extends beyond its container)
- Deduct 10 points if text nodes overlap each other or overlap input field boundaries
- Deduct 5 points per text node that appears to overflow its parent container
- If text labels show partial words (e.g., "Enter your bill de" instead of full text) → report as critical issue
- If a value and its label overlap (e.g., "$0.00" overlapping "Amount") → report as critical issue
```

This allows the correction loop to detect text problems even if they slip past the prompt rules.

---

## What NOT to change

- The Penpot Plugin API reference section's existing rules 1-9 — don't remove or reorder them
- The component catalog section — it's injected via `{{COMPONENT_CATALOG}}`
- Token Color Map Pattern section — already correct
- Visual Hierarchy, Composition Rules, Modern Container Styling sections
- The design evaluator's existing scoring criteria (hierarchy, color, spacing, density, completeness)

## Verification

1. `nx run agents-ux:typecheck` — evaluator changes compile
2. `nx run agents-ux:test` — no regressions
3. `grep "growType" packages/agents-ux/src/prompts/ux-penpot-design-system.md` — should find multiple mentions
4. `grep "layoutChild" packages/agents-ux/src/prompts/ux-penpot-design-system.md` — should find multiple mentions
5. `grep "board.flex.dir" packages/agents-ux/src/prompts/ux-penpot-design-system.md` — should find the workaround in all column-layout examples
6. Re-run `agentforge design:penpot "bill entry"` — text should render fully, sections should fill width
