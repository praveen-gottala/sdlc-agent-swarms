# CASHPULSE
## Personal Expense Tracker — UX Screen Specification PRD

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Date | March 29, 2026 |
| Author | Product Team |
| Status | Ready for UX Agent Build |
| Screens | 3 (Dashboard → Add Expense → Spending Insights) |
| Platform | Desktop |
| Complexity | Medium (~40–60 shapes per screen) |

---

## 1. Purpose & Scope

This PRD defines the UX specification for CashPulse, a clean personal expense tracking app. It is scoped exclusively to visual and interaction design — no backend functionality is required.

The document covers three screens: a daily dashboard showing recent expenses and budget status, an add/edit expense flow with category selection, and a spending insights view with charts and breakdowns. The design language is sharp, structured, and confident — financial data presented with clarity and zero clutter.

---

## 2. Design System Tokens

### 2.1 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| blue-600 | #2563EB | Primary CTA, active states, chart fills |
| blue-100 | #DBEAFE | Selected states, light accents |
| gray-900 | #111827 | Headings, primary text, monetary values |
| gray-500 | #6B7280 | Secondary text, labels, captions |
| gray-100 | #F3F4F6 | Page background, dividers |
| gray-50 | #F9FAFB | Card hover states, alternating rows |
| emerald-500 | #10B981 | Income, under-budget indicators, positive trends |
| emerald-50 | #ECFDF5 | Income badge background |
| red-500 | #EF4444 | Over-budget warnings, expense highlights, delete actions |
| red-50 | #FEF2F2 | Over-budget badge background |
| amber-500 | #F59E0B | Near-budget warnings (80%+ spent) |
| amber-50 | #FFFBEB | Warning badge background |
| violet-500 | #8B5CF6 | Entertainment category accent |
| orange-500 | #F97316 | Food & Dining category accent |
| white | #FFFFFF | Card surfaces, button text on dark fills |

### 2.2 Typography

| Role | Size | Weight | Font |
|------|------|--------|------|
| Page Title | 24px | 700 | Inter |
| Section Label | 16px | 600 | Inter |
| Card Title | 15px | 600 | Inter |
| Body | 14px | 400 | Inter |
| Caption | 12px | 500 | Inter |
| Amount Display | 32px | 700 | Inter (tabular-nums) |
| Amount Secondary | 20px | 600 | Inter (tabular-nums) |
| Small Amount | 14px | 600 | Inter (tabular-nums) |

### 2.3 Spacing, Radius & Shadows

- **Base unit:** 4px. Spacing multiples: 4, 8, 12, 16, 24, 32, 48.
- **Card radius:** 16px. **Button radius:** 10px. **Badge radius:** 20px (fully rounded). **Input radius:** 8px.
- **Card shadow:** `0 1px 3px rgba(0,0,0,0.06)`. **Elevated:** `0 8px 24px rgba(0,0,0,0.10)`.
- **Input border:** 1px solid gray-200 (#E5E7EB). **Input focus border:** blue-600.

### 2.4 Animations

- Micro-interactions: 150ms ease-out.
- Layout transitions: 250ms ease-in-out.
- Chart renders: 600ms ease-out with staggered entry (50ms per bar/segment).
- Screen transitions: 350ms ease-in-out, vertical slide (20px).
- Number counter: 400ms ease-out for amount value animations.

---

## 3. Global Components

### 3.1 Top Bar

Height: 64px. Background: white. Bottom border: 1px solid gray-100.

- **Left:** App logo — a small pulse/wave icon (20px, blue-600) followed by "CashPulse" in section label style, gray-900. Clickable; navigates to Screen 1 (Dashboard).
- **Center:** Navigation tabs — three text tabs: "Dashboard", "Add Expense", "Insights". Active tab: blue-600 text with a 2px bottom underline (blue-600). Inactive tabs: gray-500 text. Hover: gray-900. Underline slides to active tab (250ms ease-in-out).
- **Right:** A month/year selector pill showing the current month (e.g., "Mar 2026") in caption style inside a rounded chip (gray-100 background, gray-900 text). Left/right chevron icons (16px, gray-500) on either side to navigate months. Click chevrons to change month (number counter animation on displayed amounts). Also a settings gear icon (20px, gray-500) with 16px left margin.

### 3.2 Settings Dialog

A centered modal dialog (max-width: 420px) with dark scrim overlay (fade-in 250ms). Contains:

- **Currency selector:** "Currency" label + a dropdown showing current currency (e.g., "$ USD"). Options: USD, EUR, GBP, INR, JPY. Selecting a currency updates all displayed amounts.
- **Monthly budget input:** "Monthly Budget" label + a numeric input field (120px wide) with currency symbol prefix. Default: $2,000.
- **Category manager:** "Categories" label + a vertical list of 6 default categories with colored dot + name + a trash icon (gray-400, hover: red-500). Below the list, a text link: "+ Add category" in blue-600.
- **Close:** close (×) button at top-right (24px, gray-500). Click scrim or press Escape to dismiss.

---

## 4. Screen 1: Dashboard

The home screen. Users see their spending status, recent expenses, and budget health at a glance. The design should feel organized and informative without being dense.

### 4.1 Layout

Two-column layout below the top bar. Left column: 360px (summary cards). Right column: flexible remaining width (expense list). Gap: 24px. Outer padding: 32px. Background: gray-100.

### 4.2 Budget Summary Card

Top of the left column. A white card with 16px radius and card shadow. Padding: 24px.

- **Header row:** "This Month" label (section label style, gray-900) on the left. On the right, a status badge — a small rounded pill showing budget status:
  - Under 80% spent: emerald-50 background, emerald-500 text, "On Track".
  - 80–100% spent: amber-50 background, amber-500 text, "Heads Up".
  - Over 100%: red-50 background, red-500 text, "Over Budget".
- **Amount display:** Below the header, the total spent amount in amount display style (32px, 700 weight, gray-900). Format: "$1,247.50". Below it, "of $2,000.00 budget" in body text, gray-500.
- **Progress bar:** A horizontal bar, full card width, 8px tall, 4px radius. Track: gray-100. Fill: blue-600 (proportional to spend/budget). If over budget, fill becomes red-500. If 80–100%, fill becomes amber-500. Fill width animates on load (600ms ease-out).
- **Remaining indicator:** Below the progress bar, right-aligned: "Remaining: $752.50" in caption, gray-500. If over budget, this reads "Over by: $47.50" in caption, red-500.

### 4.3 Category Breakdown Mini-Chart

Below the budget summary card in the left column. White card, 16px radius, card shadow. Padding: 24px.

- **Header:** "By Category" (section label, gray-900).
- **Donut chart:** A 160px diameter donut ring (stroke: 24px) centered in the card. Segments colored by category (see 4.3.1). Center of the donut shows the total number of transactions: value in amount secondary style (20px, 600, gray-900), label "transactions" in caption below.
- **Legend:** Below the donut, a vertical list of categories (max 6). Each row: a 10px colored circle + category name (body, gray-900) + amount (small amount, gray-900, right-aligned). Rows separated by 8px vertical spacing.

#### 4.3.1 Default Category Colors

| Category | Color Token | Hex |
|----------|-------------|-----|
| Food & Dining | orange-500 | #F97316 |
| Transport | blue-600 | #2563EB |
| Shopping | violet-500 | #8B5CF6 |
| Bills & Utilities | gray-500 | #6B7280 |
| Entertainment | amber-500 | #F59E0B |
| Health | emerald-500 | #10B981 |

### 4.4 Recent Expenses List

Right column. Full height of the content area, scrollable.

- **Header row:** "Recent Expenses" (section label, gray-900) on the left. On the right, a small filter dropdown chip: "All Categories" with a down chevron (caption, gray-500, gray-100 background, 20px radius). Clicking opens a dropdown with all categories + "All Categories" option. Single select. Selecting filters the list instantly (fade transition, 200ms).
- **Expense rows:** A vertical list of expense items. Each row is a white card (12px radius, card shadow) with 16px padding and 8px gap between rows.

**Expense row structure:**

- **Left zone:** A 40px circle with the category icon inside (outlined style, white icon on category-colored background).
- **Center zone:** Two lines — merchant/description name (card title, gray-900) + category label and date (caption, gray-500). Example: "Starbucks Coffee" / "Food & Dining · Mar 28".
- **Right zone:** Expense amount in small amount style (14px, 600, gray-900), prefixed with "–" and currency symbol (e.g., "–$4.50"). Below the amount, payment method in caption, gray-400 (e.g., "Visa •••4821").
- **Hover state:** gray-50 background (150ms). Cursor: pointer.
- **Click:** Opens a detail/edit popover (see 4.5).
- Each row has a subtle left border (3px) in the category color.

### 4.5 Expense Detail Popover

When an expense row is clicked, a popover card (320px wide) appears anchored to the right of the clicked row. White background, 12px radius, elevated shadow. Contains:

- **Header:** Merchant name (card title, gray-900). Close (×) button top-right (20px, gray-500).
- **Detail rows:** Four rows of label-value pairs, left-aligned labels (caption, gray-500), right-aligned values (body, gray-900):
  - Amount: "$4.50"
  - Category: "Food & Dining" with colored dot
  - Date: "Mar 28, 2026"
  - Payment: "Visa •••4821"
- **Note:** If a note exists, shown below the detail rows in body text, gray-500, italic, with a small quote icon (12px, gray-300) prefix.
- **Action buttons:** Two buttons at the bottom, side by side:
  - "Edit" — text button, blue-600. Navigates to Screen 2 pre-filled with this expense's data.
  - "Delete" — text button, red-500. Shows inline confirmation: text changes to "Confirm delete?" with a 3-second auto-revert. Clicking again during confirmation deletes the row (fade-out, 200ms).
- Click outside or press Escape to dismiss (fade-out, 150ms).

### 4.6 Empty State

When no expenses exist for the selected month:

- The right column shows a centered illustration placeholder: a simple outlined receipt icon (64px, gray-300) + "No expenses yet" in section label, gray-400 + "Add your first expense to get started" in body, gray-400 + a "Add Expense" button (blue-600 background, white text, 10px radius, 40px height). Clicking navigates to Screen 2.

### 4.7 Screen 1 Interaction Matrix

| Element | Interaction | Behavior |
|---------|-------------|----------|
| Month Selector Chevrons | Click | Navigate to previous/next month. All amounts animate (counter, 400ms). Category chart re-renders (600ms staggered). |
| Budget Status Badge | — | Auto-calculated. No interaction. Updates reactively based on total spend vs budget. |
| Category Filter Dropdown | Click | Opens dropdown with category list. Selecting filters expense list (200ms fade). "All Categories" resets filter. |
| Expense Row | Click | Opens detail popover (150ms fade-in) anchored to the right. |
| Expense Row | Hover | gray-50 background highlight (150ms). |
| Detail Popover — "Edit" | Click | Navigate to Screen 2 with expense data pre-filled. Popover dismisses. |
| Detail Popover — "Delete" | Click | Text changes to "Confirm delete?" (150ms). Second click deletes row (fade-out). Auto-reverts after 3 seconds. |
| Donut Chart Segment | Hover | Segment slightly expands outward (4px, 150ms). Tooltip shows category name + amount + percentage. |
| Navigation Tab — "Add Expense" | Click | Navigate to Screen 2. Tab underline slides (250ms). |
| Settings Gear | Click | Settings dialog opens (250ms fade-in). Scrim overlay appears. |

---

## 5. Screen 2: Add Expense

A focused form for logging a new expense. Clean layout with clear groupings. Should feel quick — designed for frequent, daily use.

### 5.1 Layout

Single centered column, max-width: 520px. Background: gray-100. Padding: 32px top. Sections stacked vertically with 24px gaps.

### 5.2 Amount Input (Hero)

The dominant element at the top.

- A large, centered amount input field. The currency symbol ("$") displayed as a static prefix in amount display style (32px, 700, gray-300). The input value in amount display style (32px, 700, gray-900). Placeholder: "0.00" in gray-300.
- No visible input border — just the number displayed large and centered. Below the input, a thin underline (2px): gray-200 default, blue-600 on focus (250ms transition).
- Auto-focuses on screen load. Numeric keyboard entry. Decimal auto-formatting (max 2 decimal places).

### 5.3 Category Selector

Below the amount input. A label: "Category" (section label, gray-900).

Below the label, a grid of category chips: 3 columns, 2 rows (6 categories). Each chip:

- Size: flexible width (fills column), 44px height. 8px radius. 8px gap between chips.
- **Unselected:** white background, 1px gray-200 border. Left-aligned 10px colored circle + category name (body, gray-700).
- **Selected:** category-color background at 10% opacity (e.g., orange-50 for Food), category-color border (1.5px), category name in category-color text. Scale-bounce (1.05x → 1.0, 150ms).
- Single select. Required field.

Below the grid, a text link: "+ New Category" (caption, blue-600). Clicking opens an inline row (slide-down, 200ms) with a text input (placeholder: "Category name") + a color picker showing 6 small color circles (the 6 palette colors) + a "Save" mini-button (blue-600, white text, caption size). Saving adds the chip to the grid and auto-selects it.

### 5.4 Date Picker

Below the category selector. A label: "Date" (section label, gray-900).

- A single input field styled as a clickable row: calendar icon (16px, gray-400) + date text (body, gray-900), e.g., "Mar 29, 2026". gray-100 background, 8px radius, 44px height, 1px gray-200 border.
- **Default:** today's date, pre-filled.
- **Click:** Opens a mini calendar dropdown (280px wide, elevated shadow, 12px radius). Calendar shows a month grid with:
  - Header: left/right chevrons for month navigation + "March 2026" centered (card title style).
  - Day grid: 7 columns (S M T W T F S headers in caption, gray-400). Day cells are 36px squares. Today: blue-600 text, blue-100 circle background. Selected day: blue-600 filled circle, white text. Hover: gray-50 background.
  - Clicking a day selects it, closes the calendar (150ms fade-out), and updates the display text.
- Cannot select future dates. Future days are gray-300 text, cursor: not-allowed.

### 5.5 Payment Method Selector

Below the date picker. A label: "Payment Method" (section label, gray-900).

A horizontal row of 4 rounded chips: "Cash", "Debit Card", "Credit Card", "UPI/Other". Single select.

- **Unselected:** white background, 1px gray-200 border, gray-700 text. Each chip has a small icon (16px) to the left: banknote, card, credit-card, smartphone.
- **Selected:** blue-100 background, blue-600 border (1.5px), blue-600 text and icon.
- Default: "Debit Card" pre-selected.
- Chips are horizontally scrollable if they overflow (rare at 520px).

### 5.6 Note Input

Below payment method. A label: "Note (optional)" (section label, gray-900).

- A single-line text input. Placeholder: "What was this for?" in gray-400. gray-100 background, 8px radius, 44px height, 1px gray-200 border. Focus: blue-600 border.
- Max length: 100 characters. No character counter shown until 80+ characters, then a caption counter appears (gray-400, right-aligned), turning red-500 at 95+.

### 5.7 Save Button

A large, full-width CTA button at the bottom. Height: 52px. Background: blue-600. Text: "Save Expense" in white, 16px, 600 weight. Border-radius: 10px.

- **Hover:** darken to blue-700, cursor: pointer. **Active/press:** scale-down (0.98).
- **Disabled state:** if amount is $0.00 or no category selected, button is gray-200 background, gray-400 text, cursor: not-allowed.
- **On save:** Button text briefly changes to "✓ Saved!" with emerald-500 background (400ms), then navigates to Screen 1 (slide transition, 350ms). The new expense appears at the top of the recent list with a brief highlight animation (blue-50 background flash, 1s).

### 5.8 Quick Entry Suggestions

Below the save button. A label: "Quick Add" (caption, gray-400). A horizontal scrollable row of 3–4 suggestion chips based on frequent past expenses (e.g., "☕ Starbucks $4.50", "🚌 Metro Pass $2.75", "🥗 Lunch $12.00").

- Chip style: white background, 1px gray-200 border, 20px radius, 36px height. Body text, gray-700.
- **Click:** auto-fills the entire form with the suggestion's data (amount, category, description, payment method). All fields populate with a brief cascade animation (each field fills 50ms apart, top-to-bottom). The user can modify any field before saving.
- **Hover:** gray-50 background (150ms).

### 5.9 Screen 2 Interaction Matrix

| Element | Interaction | Behavior |
|---------|-------------|----------|
| Amount Input | Focus | Auto-focused on load. Underline transitions to blue-600 (250ms). |
| Amount Input | Typing | Numeric only, auto-formats with 2 decimal places. Leading zeros stripped. |
| Category Chip | Click | Select chip, deselect others. Bounce animation (150ms). Border and background change to category color. |
| "+ New Category" link | Click | Inline row slides down (200ms). Text input + color picker + save button. |
| Date Row | Click | Mini calendar opens below (150ms fade-in). |
| Calendar Day Cell | Click | Select date. Calendar closes (150ms). Date text updates. |
| Payment Method Chip | Click | Select chip, deselect others (150ms). |
| Note Input | Focus | Border transitions to blue-600 (150ms). |
| Save Button | Click | If valid: button shows "✓ Saved!" (emerald-500, 400ms) → navigate to Screen 1 (350ms slide). If invalid: button disabled, no action. |
| Quick Add Chip | Click | Auto-fills entire form with cascade animation (50ms per field). |
| Quick Add Chip | Hover | gray-50 background (150ms). |

---

## 6. Screen 3: Spending Insights

An analytical view showing spending patterns, trends, and top categories. Should feel insightful — the reward for tracking consistently.

### 6.1 Layout

Single column, max-width: 720px, centered. Background: gray-100. Padding: 32px top. Vertical stacking with 24px between sections.

### 6.2 Period Summary Header

A full-width white card (16px radius, card shadow, 24px padding) containing a row of three stat cells separated by 1px vertical dividers (40px tall, gray-200).

Each stat cell:
- **Value** (amount secondary style, 20px, 600, gray-900) centered.
- **Label** (caption, gray-500) centered below.
- **Trend indicator** (caption, 12px) below the label: a small up or down arrow + percentage. Green arrow + emerald-500 text for decrease (good). Red arrow + red-500 text for increase (bad).

The three stats:

| Cell | Value Example | Label | Trend Example |
|------|---------------|-------|---------------|
| Left | $1,247.50 | Total Spent | ↓ 12% vs last month |
| Center | $41.58 | Daily Average | ↑ 5% vs last month |
| Right | 30 | Transactions | ↓ 3 vs last month |

### 6.3 Spending Over Time Chart

A white card (16px radius, card shadow, 24px padding).

- **Header row:** "Daily Spending" (section label, gray-900) on the left. On the right, a toggle group of two small chips: "Bar" and "Line". Selected: blue-600 background, white text. Unselected: gray-100 background, gray-500 text. Toggles chart type (250ms transition — bars shrink/grow into line points and vice versa).
- **Chart area:** 100% card width, 200px height.
  - **Bar chart (default):** Vertical bars for each day of the month (1–31). Bar width: flexible to fill. Bar color: blue-600. Bars with spending over the daily average (budget ÷ days-in-month) have blue-600 fill; bars significantly over (2x+ average) have red-500 fill. X-axis: day numbers (caption, gray-400), showing every 5th day label (1, 5, 10, 15, 20, 25, 30). Y-axis: 4 horizontal gridlines with amount labels (caption, gray-400).
  - **Line chart:** Same axes. A smooth curved line (blue-600, 2px stroke) connecting daily totals. Filled area below the line with blue-600 at 8% opacity. Data points as 6px circles (blue-600 fill, white 2px stroke) at each day.
  - **Hover (both types):** Tooltip near the hovered bar/point: a small card (elevated shadow, 8px radius) showing "Mar 15" (caption, gray-500) + "$67.30" (card title, gray-900) + "3 transactions" (caption, gray-400).
- **Average line:** A dashed horizontal line (1px, amber-500, dash pattern: 4px on, 4px off) at the daily budget average. Right-end label: "avg $66.67" (caption, amber-500).
- **Chart entrance:** bars grow from bottom (600ms staggered, 30ms per bar) on first render.

### 6.4 Top Categories Breakdown

A white card (16px radius, card shadow, 24px padding).

- **Header:** "Top Categories" (section label, gray-900).
- **Horizontal stacked bar:** A single full-width bar (12px tall, 6px radius) showing proportional segments for each category, colored by category color (see 4.3.1). The bar animates from left to right on load (600ms).
- **Category detail rows:** Below the bar, a vertical list of categories sorted by spend (highest first). Each row:
  - **Left:** 10px colored circle + category name (body, gray-900).
  - **Center:** A horizontal progress bar (120px wide, 6px tall, 4px radius). Track: gray-100. Fill: category color. Width proportional to that category's share of total.
  - **Right:** Amount (small amount, gray-900) + percentage (caption, gray-500). Example: "$380.00 · 30%".
  - Row height: 44px. Separated by 4px vertical spacing.
- **Hover:** Row background becomes gray-50 (150ms). Progress bar fill darkens slightly.

### 6.5 Biggest Expenses

A white card (16px radius, card shadow, 24px padding).

- **Header:** "Biggest Expenses" (section label, gray-900).
- **List:** Top 5 individual expenses, sorted by amount (highest first). Each row:
  - **Left:** Rank number in a 28px circle (gray-100 background, gray-500 text, caption weight). #1 uses blue-600 background, white text.
  - **Center:** Merchant name (body, gray-900) + category and date (caption, gray-500). Two lines.
  - **Right:** Amount in small amount style (gray-900). Example: "$185.00".
  - Row height: 52px. Separated by 1px gray-100 dividers.

### 6.6 Comparison Card

A white card (16px radius, card shadow, 24px padding).

- **Header:** "vs Last Month" (section label, gray-900).
- **Two-column comparison:** Side-by-side vertical bars representing this month and last month.
  - Left bar label: "Last Month" (caption, gray-400). Bar: gray-300 fill. Height proportional.
  - Right bar label: "This Month" (caption, gray-900). Bar: blue-600 fill. Height proportional.
  - Bar width: 60px each. Max height: 120px. Gap: 24px between bars. Bars grow from bottom on load (600ms).
  - Below the bars, centered: the difference as a large badge — "You spent $142 less" (emerald-500 text on emerald-50 background, 20px radius pill) or "You spent $142 more" (red-500 text on red-50 background).

### 6.7 Export Button

Below all cards, right-aligned. A secondary button: "Export CSV" with a download icon (16px). White background, 1px gray-200 border, gray-700 text, 10px radius, 40px height.

- **Hover:** gray-50 background. **Click:** button text changes to "✓ Exported" with emerald-500 text (1.5s), then reverts.

### 6.8 Screen 3 Interaction Matrix

| Element | Interaction | Behavior |
|---------|-------------|----------|
| Period Summary Trends | — | Auto-calculated. No interaction. Compares current vs previous month. |
| Bar/Line Toggle | Click | Switch chart type (250ms morph transition). Selected chip highlights. |
| Chart Bar/Point | Hover | Tooltip appears near cursor (150ms fade-in). Shows date, amount, transaction count. |
| Category Row | Hover | gray-50 background (150ms). |
| Stacked Bar Segment | Hover | Segment lifts slightly (2px up, 150ms). Tooltip: category name + amount + percentage. |
| Export CSV Button | Click | Button text → "✓ Exported" (emerald-500, 1.5s auto-revert). |
| Month Selector (top bar) | Click chevrons | All data and charts re-render. Bars/line animate fresh (600ms). Stats counter-animate (400ms). |

---

## 7. Screen Flow & Navigation

| From | Action | To | Transition |
|------|--------|----|------------|
| Screen 1 | Click "Add Expense" tab or empty state button | Screen 2 | Slide up (350ms) |
| Screen 2 | Save expense successfully | Screen 1 | Slide down (350ms). New expense highlighted. |
| Screen 1 | Click "Insights" tab | Screen 3 | Slide left (350ms) |
| Screen 3 | Click "Dashboard" tab | Screen 1 | Slide right (350ms) |
| Any | Click "CashPulse" logo | Screen 1 | Slide right (300ms) |
| Any | Click navigation tab | Target screen | Tab underline slides (250ms). Content transitions (350ms). |

---

## 8. Responsive Behavior

This app is a desktop application with a centered content area. Dashboard uses a two-column layout; other screens use a single centered column.

| Breakpoint | Behavior |
|------------|----------|
| 768–1024px | Dashboard: stacks to single column (summary cards above expense list). Max content width: 560px. Chart heights reduce to 160px. |
| 1024–1440px | Dashboard: two-column layout (360px + flex). Insights: 680px max-width. Standard spacing. |
| > 1440px | Dashboard: two-column layout (400px + flex). Insights: 720px max-width. Maximum whitespace. Expense list shows 10+ items without scroll. |

---

## 9. Accessibility

- All buttons and interactive elements have minimum 36×36px click targets.
- Amount inputs use `inputmode="decimal"` for appropriate mobile keyboards.
- Charts include `role="img"` with `aria-label` describing the data summary (e.g., "Bar chart showing daily spending for March 2026, averaging $41.58 per day").
- Chart tooltips are accessible via keyboard focus (Tab moves through bars/points, tooltip appears on focus).
- Color is never the sole indicator — budget status uses both color and text labels. Category breakdowns include percentage text alongside colored bars.
- Focus rings: 2px blue-600 outline, 2px offset on all interactive elements. Full keyboard navigation (Tab, Enter, Space, Escape).
- Reduced motion: respect `prefers-reduced-motion`. Replace chart animations with instant renders. Disable bounce and cascade effects. Replace slide transitions with instant cuts.
- Delete confirmation uses text change (not color alone) and auto-reverts to prevent accidental deletion.

---

## 10. Empty & Error States

- **No expenses for selected month (Screen 1):** Right column shows empty state (see 4.6). Left column budget card shows "$0.00 of $2,000.00 budget" with empty progress bar. Donut chart shows a single gray-200 ring with "0 transactions" in center.
- **No spending data (Screen 3):** All chart areas show a centered message: "Not enough data yet" (body, gray-400) with a small bar-chart outline icon (48px, gray-300). Stats show "$0.00" with no trend indicators.
- **No recent frequent expenses (Screen 2):** The "Quick Add" section is hidden entirely — no empty state shown for it. The save button area takes its space.
- **Invalid amount input:** If user types non-numeric characters, they are silently rejected (no error message, input simply doesn't accept them). If amount exceeds $99,999.99, input stops accepting digits and a caption appears below: "Maximum amount: $99,999.99" in amber-500.
- **Currency change (Settings):** On currency change, a small toast appears at bottom-center: "Currency updated to EUR" (body, gray-900 on white background, card shadow, 12px radius). Auto-dismisses after 2 seconds.
