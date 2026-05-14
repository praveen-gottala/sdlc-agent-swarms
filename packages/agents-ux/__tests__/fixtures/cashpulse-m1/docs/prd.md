# CashPulse — Personal Expense Tracker

CashPulse is a clean, desktop-first personal expense tracking application with three core screens: a daily dashboard, an add/edit expense flow, and a spending insights view with charts. Built with Inter font and blue-600 primary accent.

## Screens
- **Dashboard** (page): Home screen with budget summary, category donut, and expenses list.
- **Add Expense** (page): Single-column form for logging expenses.
- **Spending Insights** (page): Analytical view with charts and breakdowns.
- **Settings Dialog** (modal): Modal for currency, budget, and category management.
- **Expense Detail Popover** (drawer): Detail card for a selected expense.
- **Date Picker Calendar** (sheet): Mini calendar dropdown.
- **Category Filter Dropdown** (sheet): Dropdown for filtering expenses by category.

## Data Entities
- **Expense**
  - `id`: string _(required)_
  - `amount`: number _(required)_
  - `description`: string _(required)_
  - `categoryId`: reference _(required)_
  - `date`: date _(required)_
  - `paymentMethod`: enum _(required)_
  - `note`: string
  - `createdAt`: date _(required)_
  - Relationships: entity-002
- **Category**
  - `id`: string _(required)_
  - `name`: string _(required)_
  - `color`: string _(required)_
  - `icon`: string
  - `isDefault`: boolean _(required)_
- **Budget**
  - `id`: string _(required)_
  - `monthlyLimit`: number _(required)_
  - `currency`: enum _(required)_
  - `month`: string _(required)_
- **UserSettings**
  - `id`: string _(required)_
  - `currency`: enum _(required)_
  - `defaultMonthlyBudget`: number _(required)_
  - Relationships: entity-003
- **MonthSummary**
  - `month`: string _(required)_
  - `totalSpent`: number _(required)_
  - `transactionCount`: number _(required)_
  - `dailyAverage`: number _(required)_
  - `budgetLimit`: number _(required)_
  - `budgetStatus`: enum _(required)_
  - `remainingAmount`: number _(required)_
  - Relationships: entity-001, entity-003
- **CategorySpending**
  - `categoryId`: reference _(required)_
  - `month`: string _(required)_
  - `totalAmount`: number _(required)_
  - `percentage`: number _(required)_
  - `transactionCount`: number _(required)_
  - Relationships: entity-002, entity-005
- **DailySpending**
  - `date`: date _(required)_
  - `totalAmount`: number _(required)_
  - `transactionCount`: number _(required)_
  - Relationships: entity-001
- **QuickAddSuggestion**
  - `id`: string _(required)_
  - `description`: string _(required)_
  - `amount`: number _(required)_
  - `categoryId`: reference _(required)_
  - `paymentMethod`: enum _(required)_
  - `frequency`: number _(required)_
  - Relationships: entity-002

## Personas
- **Alex** (Budget-Conscious Individual)
  - Goal: Track daily expenses with minimal friction
  - Goal: Stay within monthly budget with visual feedback
  - Goal: Understand spending patterns across categories
  - Goal: Compare month-over-month trends
- **Priya** (Frequent Expense Logger)
  - Goal: Log expenses rapidly using quick-add suggestions
  - Goal: Categorize every expense accurately
  - Goal: Review recent expenses at a glance
  - Goal: Edit or delete incorrectly logged expenses
- **Jordan** (Data-Driven Saver)
  - Goal: Analyze spending with charts and breakdowns
  - Goal: Identify biggest expenses and top categories
  - Goal: Export data for external analysis
  - Goal: Track daily averages against budget

## Features
- **Budget Summary Dashboard** _[must-have]_: Budget summary card with progress bar and status badge (On Track / Heads Up / Over Budget).
- **Category Breakdown Donut Chart** _[must-have]_: 160px donut chart showing spending distribution across categories with hover tooltips.
- **Recent Expenses List** _[must-have]_: Scrollable expense list with category-colored borders, filter dropdown, and clickable detail popovers.
- **Expense Detail Popover** _[must-have]_: 320px popover with amount, category, date, payment, edit/delete actions.
- **Add/Edit Expense Form** _[must-have]_: Single-column form with hero amount input, category grid, date picker, payment method chips, and save button.
- **Quick Entry Suggestions** _[must-have]_: Horizontal scrollable chips for frequent past expenses with auto-fill.
- **Spending Insights Period Summary** _[must-have]_: Three stat cells with trend indicators comparing to last month.
- **Daily Spending Chart** _[must-have]_: Bar/line toggle chart with hover tooltips and average line.
- **Top Categories Breakdown** _[must-have]_: Stacked bar with sorted category list and progress bars.
- **Biggest Expenses List** _[must-have]_: Top 5 expenses ranked by amount.
- **Month Comparison** _[must-have]_: Side-by-side bars comparing this month vs last month.
- **Month Navigation** _[must-have]_: Month/year selector with chevrons in top bar.
- **Top Navigation Bar** _[must-have]_: 64px bar with logo, tabs, month selector, and settings.
- **Settings Dialog** _[must-have]_: Modal with currency, budget, and category management.
- **Inline Category Creation** _[must-have]_: Add new categories from the expense form.
- **Export CSV** _[must-have]_: Export spending data from Insights screen.
- **Empty & Error States** _[must-have]_: Comprehensive empty states for all screens.
- **Currency Change Toast** _[should-have]_: Toast notification on currency change.
- **Responsive Breakpoints** _[should-have]_: Desktop-first responsive at 768, 1024, 1440px.
- **Reduced Motion Support** _[should-have]_: Respect prefers-reduced-motion media query.
- **Keyboard Navigation** _[should-have]_: Full keyboard nav with focus rings and ARIA.
- **Multi-Currency Support** _[could-have]_: 5 currencies selectable in Settings.
- **Recurring Expense Templates** _[could-have]_: Save and auto-log recurring expenses.
- **Search Expenses** _[could-have]_: Search by merchant, note, or amount.
- **Per-Category Budget Limits** _[could-have]_: Individual budget limits per category.

## Non-Functional Requirements
- **Performance**: Micro-interactions within 150ms, layout transitions within 250ms. — target: ≤150ms micro, ≤250ms layout
- **Performance**: Screen transitions within 350ms. — target: ≤350ms
- **Accessibility**: WCAG 2.1 AA with 36x36px targets and keyboard navigation. — target: Zero critical violations
- **Accessibility**: Respect prefers-reduced-motion. — target: All animations disabled when set
- **Responsiveness**: Desktop-first with breakpoints at 768, 1024, 1440px. — target: Functional at all breakpoints

## Success Metrics
- **Expense Entry Speed**: Average time to log a new expense — target: Under 15s with Quick Add, under 30s manual
- **Daily Active Usage**: Users logging at least one expense per day — target: 60% of active users

## Out of Scope
- Backend API development
- User authentication
- Mobile native app
- Receipt scanning / OCR
- Dark mode
