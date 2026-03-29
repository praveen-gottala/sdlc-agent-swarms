# Task: Modernize Penpot Design Prompt — Shadows, Depth, and Contemporary Styling

## Problem

The Penpot design agent produces designs that look dated (circa 2018). Every container has 1px borders, no shadows, flat layering, conservative border radius, and cramped spacing. The root cause is the examples in the design prompt — the LLM copies what it sees, and every example teaches the bordered-box pattern.

## File: `packages/agents-ux/src/prompts/ux-penpot-design-system.md`

### Change 1: Add "Modern Container Styling" section

Insert a new section AFTER the "Visual Hierarchy" section and BEFORE "Composition Rules". This teaches the LLM when to use shadows vs borders:

```markdown
## Modern Container Styling

### Shadows, NOT Borders for Containers

Cards, sections, and content containers use drop shadows for depth — NOT 1px borders. Borders look dated and create visual noise. Shadows create clean separation with a modern feel.

**Penpot shadow API:**
\`\`\`javascript
// Elevated card (modern — USE THIS for cards, modals, sections)
card.shadows = [{
  style: 'drop-shadow',
  offsetX: 0, offsetY: 2,
  blur: 8, spread: 0,
  color: { r: 0, g: 0, b: 0, opacity: 0.06 }
}];

// More prominent elevation (modals, dropdowns, popovers)
modal.shadows = [{
  style: 'drop-shadow',
  offsetX: 0, offsetY: 4,
  blur: 16, spread: 0,
  color: { r: 0, g: 0, b: 0, opacity: 0.10 }
}];
\`\`\`

**When to use borders vs shadows:**
| Element | Style | Why |
|---------|-------|-----|
| Cards, sections, panels | Shadow only, no border | Clean depth separation |
| Input fields, text areas | 1px border, no shadow | Indicates interactive boundary |
| Dividers between list items | 1px bottom border only | Subtle separation |
| Toggle/segmented button groups | 1px border on unselected | Groups options visually |
| Tables | 1px border on header/rows | Aligns columns |
| Nested content inside a card | Different background color, NO border | Indent without clutter |

NEVER put both a border AND a shadow on the same element — pick one.

### Background Color Layering (Depth Without Borders)

Create visual depth by alternating background colors at each nesting level:

| Layer | Background | Example |
|-------|-----------|---------|
| Page background | `T.surfaceSecondary` | The outermost canvas |
| Primary card | `T.surfacePrimary` | Main content cards sitting on the page |
| Nested content inside card | `T.surfaceSecondary` | Breakdown rows, sub-sections |
| Interactive highlight | `T.surfaceElevated` | Hover state, active selection |

This creates a natural sense of depth. The user can see nesting levels without any borders.

### Border Radius Scale

Modern interfaces use generous rounding:

| Element | Radius | Penpot Code |
|---------|--------|-------------|
| Cards, modals, hero sections | 20px | `card.borderRadius = 20` |
| Buttons, inputs, badges | 12px | `btn.borderRadius = 12` |
| Small chips, tags | 8px | `chip.borderRadius = 8` |
| Pills (full-round) | height/2 | `pill.borderRadius = height / 2` |
| Avatars | full circle | `avatar.borderRadius = size / 2` |

### Spacing Generosity

Generous padding is the single biggest factor in making a design feel "premium" vs "cramped":

| Context | Minimum Padding |
|---------|----------------|
| Primary cards | 24px all sides, 32px for hero/featured |
| Buttons | 12px vertical, 24px horizontal |
| Input fields | 12px vertical, 16px horizontal |
| Between cards in a row | 16px gap |
| Between sections | 32–48px gap |
| Page-level horizontal padding | 24px mobile, 32px tablet, 48px desktop |

Never crowd content against card edges. If content fills more than 90% of the card width, increase the card's horizontal padding.

### Typography Contrast

Create clear visual hierarchy through size AND weight differences:

| Role | Size | Weight | Color | Use |
|------|------|--------|-------|-----|
| Primary value (price, total) | heading-1 (32px) | 700 | `T.textPrimary` | The number the user came to see |
| Section title | heading-2 (24px) | 700 | `T.textPrimary` | Groups content |
| Card title | heading-3 (18px) | 600 | `T.textPrimary` | Identifies the card |
| Supporting label | label (12px) | 500 | `T.textSecondary` | Describes the value above/below |
| Metadata | small (11px) | 400 | `T.textSecondary` | Timestamps, hints, helper text |

The key: primary values should be 2-3x larger than their labels. `$42.15` at 32px with `owes` at 11px creates instant hierarchy. Both at 14-18px creates visual mush.
```

### Change 2: Update ALL three working examples

In each of the three examples (Dashboard, Form/Wizard, Mobile Form), make these changes:

**A. Replace card borders with shadows.**

Find every instance of:
```javascript
card.strokes = [{ strokeColor: T.borderDefault, strokeOpacity: 1, strokeWidth: 1, strokeAlignment: 'inner' }];
```

Replace with:
```javascript
card.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 2, blur: 8, spread: 0, color: { r: 0, g: 0, b: 0, opacity: 0.06 } }];
```

KEEP borders ONLY on:
- Input fields (the `Input-*` boards in the form examples)
- The step circle in the Form/Wizard example (strokes on circles are fine)
- Secondary/ghost buttons (the "Back" button uses a border to distinguish from primary)

**B. Use `borderRadius = 20` for cards, `borderRadius = 12` for inputs and buttons.**

Find every `card.borderRadius = 12` or `content.borderRadius = 16` on card-level containers and change to:
```javascript
card.borderRadius = 20;
```

Keep `borderRadius = 12` on inputs, buttons, and small elements.

**C. Use `T.surfaceSecondary` for page background, `T.surfacePrimary` for cards.**

The root board in each example should use `T.surfaceSecondary` (the lighter/receded color) as the page background. Cards sitting on it should use `T.surfacePrimary`. This is already correct in the Dashboard and Form/Wizard examples — verify the Mobile Form example does the same.

**D. Increase card padding from 16px to 24px.**

Find card padding like:
```javascript
cf.topPadding = 16;
cf.rightPadding = 16;
cf.bottomPadding = 16;
cf.leftPadding = 16;
```

Change to:
```javascript
cf.topPadding = 24;
cf.rightPadding = 24;
cf.bottomPadding = 24;
cf.leftPadding = 24;
```

For the main content card in the Form/Wizard example (already at 32px), leave as-is.

### Change 3: Update the Component Catalog styling in the prompt

The component catalog section in the prompt lists states with `border=border-default` for Card, Section, NavigationBar, etc. Update these to reflect the shadow-first approach:

For **Card** default state, change:
```
- **default**: bg=surface-primary, text=text-primary, border=border-default, border-width=1px, shadow=shadow-sm
```
To:
```
- **default**: bg=surface-primary, text=text-primary, shadow=shadow-sm (no border)
```

For **Card** hover state, change:
```
- **hover**: bg=surface-primary, text=text-primary, border=border-default, shadow=shadow-md
```
To:
```
- **hover**: bg=surface-primary, text=text-primary, shadow=shadow-md (no border)
```

For **Card** selected state, keep the border (selection states DO use borders):
```
- **selected**: bg=surface-secondary, text=text-primary, border=cta-primary, border-width=2px, shadow=shadow-md
```

Apply the same pattern to **Section** and **NavigationBar** — remove `border=border-default` from default state, keep shadow.

Do NOT remove borders from **Input**, **Select**, **TextArea**, **Checkbox**, **Radio** — form controls need borders.

### Change 4: Update Token Color Map Pattern section

In the "Token Color Map Pattern" section (~line 1141), add `surfaceElevated` to the example T map:

```javascript
const T = {
  bgPrimary: '#___',
  surfacePrimary: '#___',
  surfaceSecondary: '#___',
  surfaceElevated: '#___',    // ← ADD THIS
  textPrimary: '#___',
  // ... rest stays the same
};
```

## What NOT to change

- Input field borders — inputs MUST have borders to show interactive boundary
- Selected/focus state borders (cta-primary border on selected cards is correct)
- The Penpot Plugin API reference section — that's API documentation, not styling guidance
- Token values or semantic role mappings
- Component catalog anatomy, accessibility, or spacing definitions (only change the states)

## Verification

1. `grep -c "strokeColor: T.borderDefault" packages/agents-ux/src/prompts/ux-penpot-design-system.md` — count should be significantly reduced (only inputs, secondary buttons, and dividers should remain)
2. `grep -c "shadows = \[" packages/agents-ux/src/prompts/ux-penpot-design-system.md` — should find shadow usage in all three examples
3. `grep "borderRadius = 20" packages/agents-ux/src/prompts/ux-penpot-design-system.md` — should find card-level radius in examples
4. Read through each example and verify: cards use shadows, inputs use borders, page bg is surfaceSecondary, cards are surfacePrimary
5. The "Modern Container Styling" section should appear between "Visual Hierarchy" and "Composition Rules"
