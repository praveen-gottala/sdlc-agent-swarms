# QuickMarks — Product Requirements Document v1.0

**App concept:** A personal bookmark manager where users save, tag, and filter links.
**Purpose:** UX agent stress-test artifact — targets form validation flows and card-based list filtering.

---

## 1. Problem Statement

Users accumulate links across browsers, chats, and notes with no lightweight way to tag, search, and retrieve them. QuickMarks provides a single-screen save-and-find experience.

## 2. Target User

Solo user, no auth required. Local-first (localStorage or in-memory).

## 3. Visual Theme — Playful

**Personality:** Friendly, casual, and slightly whimsical — like a personal notebook with sticker energy, not a corporate dashboard.

**Color palette:**

| Token              | Value       | Usage                                      |
|--------------------|-------------|---------------------------------------------|
| `--color-primary`  | `#6C5CE7`   | Buttons, active tag chips, FAB              |
| `--color-secondary`| `#00CEC9`   | Hover accents, toast background             |
| `--color-surface`  | `#FFEAA7`   | Card background (soft warm yellow)          |
| `--color-bg`       | `#FFF9E6`   | Page background (lighter warm)              |
| `--color-danger`   | `#FF6B6B`   | Delete actions, error text                  |
| `--color-text`     | `#2D3436`   | Primary body text                           |
| `--color-muted`    | `#636E72`   | Secondary text (URLs, timestamps)           |

**Typography:**

| Element         | Font                  | Weight | Size   |
|-----------------|-----------------------|--------|--------|
| Headings        | `'Fredoka', sans-serif` (Google Fonts) | 600 | 24px / 20px |
| Body / inputs   | `'Inter', sans-serif`  | 400    | 15px   |
| Tag chips       | `'Inter', sans-serif`  | 500    | 12px   |
| Buttons         | `'Fredoka', sans-serif` | 500   | 15px   |

**Border radius:** `12px` for cards, `20px` for chips and buttons, `8px` for input fields — rounded and soft, never sharp.

**Shadows:** Soft, warm-toned shadows using `rgba(108, 92, 231, 0.10)` base. Cards rest at `0 2px 8px`, hover lifts to `0 6px 20px`.

**Micro-interactions:**
- FAB: Gentle 360° rotation on hover (400ms ease-in-out).
- Tag chips: Slight scale-up (1.05) on click, 100ms spring.
- Cards: 200ms ease shadow lift on hover.
- Toast: Slides down from top with a subtle bounce (CSS `cubic-bezier(0.34, 1.56, 0.64, 1)`).
- Empty state: The placeholder illustration area should pulse gently with a slow `opacity` animation (2s infinite alternate, 0.6 → 1.0).

**Iconography:** Rounded/filled icon style (e.g., Lucide or Phosphor "fill" variant). Never use sharp outlined icons — keep it soft.

**Copy tone:** Use friendly language in UI text — "Oops, that doesn't look like a URL" instead of "Invalid URL format." Error messages in the validation table (Section 7) are the canonical strings, but if the agent chooses to rephrase for tone, it must preserve the same semantic meaning and trigger condition.

## 4. Screens

### 4.1 Screen 1 — Bookmark List (Home)

**Route:** `/`

**Layout:** Top filter bar + scrollable card grid below.

**Components:**

- **SearchBar** — text input with magnifying glass icon; filters cards in real time by `title` and `url` (case-insensitive substring match).
- **TagFilterChips** — horizontal scrollable row of tag chips derived from all existing bookmarks. Clicking a chip toggles it on/off. Multiple tags can be active simultaneously (AND logic). An "All" chip clears all tag filters.
- **BookmarkCard** — displays:
  - `title` (single line, truncated with ellipsis at 60 chars)
  - `url` (single line, truncated, rendered as a muted secondary text)
  - `tags` (rendered as small chips, max 3 visible + "+N" overflow indicator)
  - `createdAt` (relative time, e.g. "2h ago")
  - **Actions:** Edit (pencil icon) → navigates to Screen 2 pre-filled; Delete (trash icon) → inline confirmation: card flips to "Delete this bookmark?" with Confirm / Cancel buttons. No modal.
- **EmptyState** — when no bookmarks exist: illustration placeholder area + "No bookmarks yet" heading + "Save your first link" subtext + CTA button that navigates to Screen 2.
- **NoResultsState** — when filters yield zero matches: "No bookmarks match your filters" + "Clear filters" text button.
- **FAB (Floating Action Button)** — bottom-right, "+" icon, navigates to Screen 2.

**Data flow:** Reads from `BookmarkStore`. Filters are applied client-side in this order: tag filter → search filter.

### 4.2 Screen 2 — Add / Edit Bookmark

**Route:** `/add` (new) | `/edit/:id` (edit)

**Layout:** Centered single-column form, max-width 480px.

**Fields:**

| Field   | Type        | Required | Validation Rules                                                                                         |
|---------|-------------|----------|----------------------------------------------------------------------------------------------------------|
| `title` | text input  | Yes      | Min 2 chars, max 120 chars. Trim whitespace. Show inline error: "Title must be 2–120 characters."        |
| `url`   | text input  | Yes      | Must match URL pattern (starts with `http://` or `https://`). Show inline error: "Enter a valid URL."    |
| `tags`  | tag input   | No       | Comma-separated entry. Each tag: lowercase, alphanumeric + hyphens only, max 20 chars, max 5 tags total. Show inline error: "Max 5 tags allowed" or "Tags can only contain letters, numbers, and hyphens." |
| `notes` | textarea    | No       | Max 280 chars. Live char counter displayed below field ("142 / 280").                                    |

**Behaviors:**

- **On mount (edit mode):** Pre-fill all fields from `BookmarkStore.getById(id)`. If `id` not found, show error state: "Bookmark not found" + "Go back" link.
- **Submit button label:** "Save Bookmark" (add) | "Update Bookmark" (edit).
- **Validation trigger:** Validate on blur per-field AND on submit for all fields. Fields that have not been touched should not show errors on initial render.
- **On valid submit:** Upsert to `BookmarkStore`, navigate to `/` with a transient success toast ("Bookmark saved" / "Bookmark updated") visible for 3 seconds.
- **Cancel button:** Returns to `/` with no changes. If form is dirty (any field modified), show an inline warning bar at top of form: "You have unsaved changes" with "Discard" and "Keep editing" actions. No browser `confirm()` dialogs.

### 4.3 Screen 3 — Bookmark Detail (Optional stretch)

**Route:** `/bookmark/:id`

**Layout:** Full-width content view.

**Content:** Displays all bookmark fields in read-only format with an "Open Link" primary button (opens `url` in new tab), Edit button, and Delete button (same inline confirm pattern as card).

## 5. Data Model

```typescript
interface Bookmark {
  id: string;          // UUID v4, generated on create
  title: string;       // 2–120 chars
  url: string;         // valid http/https URL
  tags: string[];      // 0–5 items, each lowercase alphanumeric+hyphens, max 20 chars
  notes: string;       // 0–280 chars
  createdAt: string;   // ISO 8601 timestamp
  updatedAt: string;   // ISO 8601 timestamp
}
```

## 6. BookmarkStore Interface

```typescript
interface BookmarkStore {
  getAll(): Bookmark[];
  getById(id: string): Bookmark | null;
  create(input: CreateBookmarkInput): Bookmark;
  update(id: string, input: UpdateBookmarkInput): Bookmark;
  delete(id: string): void;
  getAllTags(): string[];   // deduplicated, sorted alphabetically
}
```

## 7. Validation Rules Summary

| Rule ID | Field   | Condition                              | Error Message                                           |
|---------|---------|----------------------------------------|---------------------------------------------------------|
| V-01    | title   | Empty or < 2 chars after trim          | "Title must be 2–120 characters."                       |
| V-02    | title   | > 120 chars                            | "Title must be 2–120 characters."                       |
| V-03    | url     | Empty                                  | "URL is required."                                      |
| V-04    | url     | Does not start with http:// or https://| "Enter a valid URL starting with http:// or https://."  |
| V-05    | tags    | A single tag has invalid characters    | "Tags can only contain letters, numbers, and hyphens."  |
| V-06    | tags    | A single tag > 20 chars                | "Each tag must be 20 characters or less."               |
| V-07    | tags    | More than 5 tags                       | "Maximum 5 tags allowed."                               |
| V-08    | notes   | > 280 chars                            | "Notes must be 280 characters or less."                 |

## 8. Interaction Specs

- **Card hover:** Subtle elevation increase (shadow change), edit/delete icons appear (hidden by default on desktop, always visible on mobile).
- **Tag chip toggle:** Active chips use filled style; inactive use outlined style. Transition: 150ms ease.
- **Toast:** Appears top-center, auto-dismisses after 3s, includes close "×" button.
- **Dirty form warning:** Yellow/amber inline bar, appears below form header, not a browser dialog.
- **Delete inline confirmation:** Replaces card content with confirmation prompt; 200ms crossfade transition. Auto-reverts after 5 seconds if no action taken.

## 9. Responsive Behavior

| Breakpoint     | Card Grid          | Form Width    |
|----------------|--------------------|---------------|
| ≥ 1024px       | 3 columns          | 480px centered|
| 768px – 1023px | 2 columns          | 480px centered|
| < 768px        | 1 column           | Full width, 16px padding |

## 10. Accessibility Requirements

- All form fields have associated `<label>` elements.
- Error messages linked via `aria-describedby`.
- Cards are keyboard-navigable (Tab through cards, Enter to open detail/edit).
- Delete confirmation is focus-trapped until resolved.
- Color contrast ratio ≥ 4.5:1 for all text.
- Toast has `role="status"` and `aria-live="polite"`.

## 11. Seed Data (for testing)

```json
[
  {
    "title": "LangGraph Documentation",
    "url": "https://langchain-ai.github.io/langgraph/",
    "tags": ["ai", "agents", "python"],
    "notes": "Core orchestration framework reference."
  },
  {
    "title": "Penpot Design Tool",
    "url": "https://penpot.app",
    "tags": ["design", "open-source"],
    "notes": ""
  },
  {
    "title": "Tailwind CSS Docs",
    "url": "https://tailwindcss.com/docs",
    "tags": ["css", "frontend"],
    "notes": "Utility-first CSS framework."
  },
  {
    "title": "shadcn/ui Components",
    "url": "https://ui.shadcn.com",
    "tags": ["frontend", "react", "design"],
    "notes": "Component library for deterministic composition."
  },
  {
    "title": "Nx Monorepo Guide",
    "url": "https://nx.dev/getting-started/intro",
    "tags": ["devtools", "frontend"],
    "notes": "Monorepo build system docs."
  }
]
```

## 12. What This PRD Intentionally Tests

| UX Agent Capability              | Where It's Exercised                                                   |
|----------------------------------|------------------------------------------------------------------------|
| Form generation with validation  | Screen 2: 4 fields, 8 validation rules, blur+submit triggers          |
| Inline error rendering           | V-01 through V-08 with distinct messages per condition                 |
| Card layout with actions         | Screen 1: BookmarkCard with truncation, overflow chips, action icons   |
| Client-side filtering            | SearchBar (substring) + TagFilterChips (multi-select AND logic)        |
| State-driven empty states        | EmptyState vs NoResultsState — different copy, different CTAs          |
| Dirty form detection             | Cancel with unsaved changes → inline warning, not browser dialog       |
| Inline vs modal interactions     | Delete uses inline card flip, not a modal — tests pattern selection    |
| Responsive grid logic            | 3 breakpoints, column count shifts, form width adapts                  |
| Data model → UI mapping          | TypeScript interfaces → rendered fields, no ambiguity in field list    |
| Theme → visual fidelity          | Section 3: explicit tokens, fonts, radii, shadows, micro-interactions — tests whether agent applies theme holistically or cherry-picks |