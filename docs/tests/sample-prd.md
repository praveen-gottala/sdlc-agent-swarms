# TaskFlow — Team Task Manager

**Product Requirements Document — Sample App**

| Field   | Value                    |
| ------- | ------------------------ |
| Author  | AgentForge Team          |
| Date    | March 27, 2026           |
| Status  | Sample / Reference       |
| Version | 1.0                      |
| Purpose | Component catalog showcase|

---

## 1. Overview

TaskFlow is a lightweight team task management app for small teams (3–10 people).
Users can create projects, assign tasks, track progress with stats, and collaborate
through comments and status updates. The app demonstrates every V2 built-in
catalog component in a realistic, production-style context.

**Target platforms:** Mobile-first (375px), responsive to desktop (1440px).

---

## 2. Design Tokens

```yaml
colors:
  cta-primary: "#6366F1"        # Indigo-500
  cta-primary-hover: "#4F46E5"  # Indigo-600
  text-primary: "#1E293B"       # Slate-800
  text-secondary: "#64748B"     # Slate-500
  text-on-cta: "#FFFFFF"
  surface-primary: "#FFFFFF"
  surface-secondary: "#F1F5F9"  # Slate-100
  surface-elevated: "#F8FAFC"   # Slate-50
  surface-input: "#FFFFFF"
  border-default: "#E2E8F0"     # Slate-200
  success: "#22C55E"
  warning: "#F59E0B"
  error: "#EF4444"

typography:
  heading-1: { size: 28, weight: 700, line-height: 1.2 }
  heading-2: { size: 22, weight: 600, line-height: 1.3 }
  heading-3: { size: 16, weight: 600, line-height: 1.4 }
  body: { size: 15, weight: 400, line-height: 1.5 }
  label: { size: 13, weight: 500, line-height: 1.4 }
  caption: { size: 11, weight: 400, line-height: 1.3 }

spacing:
  xs: 4
  sm: 8
  md: 16
  lg: 24
  xl: 32

shadows:
  sm: "0 1px 3px rgba(0,0,0,0.08)"
  md: "0 4px 12px rgba(0,0,0,0.10)"
```

---

## 3. Pages & Screens

### 3.1 Dashboard (Home)

The main landing screen after login. Shows project overview stats, recent tasks,
and quick actions.

**Layout:** Single-column scrollable.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `stat`              | 3 stat cards at top — "Open Tasks" (12), "Completed This Week" (27), "Team Members" (5) |
| `card`              | Container for "Recent Tasks" list and "My Assignments" section |
| `badge`             | Task priority labels: "High" (error bg), "Medium" (warning bg), "Low" (success bg) |
| `avatar`            | Team member avatars next to assigned tasks, showing initials (e.g., "PG", "AK") |
| `chip`              | Project tag filters — "Frontend", "Backend", "Design", "DevOps" |
| `button-primary`    | "New Task" floating action button at bottom                  |
| `button-ghost`      | "View All" link below recent tasks list                      |
| `skeleton`          | Loading placeholders for stat cards and task list while data fetches |
| `loading-spinner`   | Centered spinner shown on initial page load                  |

#### Behavior:
- On load, show `skeleton` placeholders for 3 stat cards and 5 task rows.
- Once data arrives, replace skeletons with real content.
- Tapping a `chip` filter narrows the task list to that project tag.
- Tapping a task `card` navigates to Task Detail (3.3).
- `badge` colors: High = error, Medium = warning, Low = success.

---

### 3.2 Create Task

A form screen for creating a new task with all relevant details.

**Layout:** Single-column form, sticky bottom CTA.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `input-text`        | Task title field — label: "Task Title", placeholder: "Enter task name..." |
| `input-text`        | Description field — label: "Description", placeholder: "Describe the task..." |
| `input-currency`    | Budget field — label: "Estimated Cost", placeholder: "0.00" (for paid tasks/bounties) |
| `select`            | Project selector — label: "Project", placeholder: "Select project..." with options: "Frontend Redesign", "API v2", "Mobile App", "Infrastructure" |
| `select`            | Priority selector — label: "Priority", placeholder: "Choose priority..." with options: "High", "Medium", "Low" |
| `select`            | Assignee selector — label: "Assign To", placeholder: "Select team member..." |
| `segmented-control` | Task type toggle — options: ["Bug", "Feature", "Chore"]     |
| `stepper`           | Story points — label: "Story Points", value: 3, min: 1, max: 13 |
| `checkbox`          | "Mark as urgent" — unchecked by default                     |
| `checkbox`          | "Notify assignee via email" — checked by default            |
| `switch`            | "Require review before closing" — toggle, off by default    |
| `button-primary`    | "Create Task" — full-width sticky at bottom                 |
| `button-secondary`  | "Save as Draft" — below primary button                      |
| `tooltip`           | Info tooltip next to "Story Points" label — content: "Story points estimate relative effort using the Fibonacci scale" |
| `alert`             | Validation error banner — "Please fill in all required fields" (shown on submit with missing fields) |

#### Behavior:
- `segmented-control` defaults to "Feature" selected.
- `stepper` increments by Fibonacci: 1, 2, 3, 5, 8, 13.
- On submit with empty required fields, show `alert` banner at top.
- Successful creation navigates to Task Detail (3.3) with a success `alert`.

---

### 3.3 Task Detail

Shows full task information with status management and activity feed.

**Layout:** Header with back nav, scrollable content, sticky bottom actions.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `card`              | Main task info container and activity feed container         |
| `badge`             | Priority badge ("High") and status badge ("In Progress")     |
| `avatar`            | Assignee avatar with initials in task header                 |
| `display-readonly`  | Read-only fields — "Created", "Due Date", "Story Points", "Estimated Cost" |
| `chip`              | Labels/tags on the task — "frontend", "urgent", "v2.1"      |
| `segmented-control` | Status switcher — options: ["To Do", "In Progress", "Done"] |
| `checkbox`          | Subtask checklist items — "Set up database schema", "Write API endpoints", "Add unit tests" |
| `switch`            | "Watch this task" — notifications toggle                    |
| `tooltip`           | Info icon next to "Estimated Cost" — content: "Budget allocated for external resources or bounties" |
| `button-primary`    | "Update Status" — confirms status change                    |
| `button-secondary`  | "Edit Task" — navigates to edit form                        |
| `button-ghost`      | "Delete Task" — destructive action with confirmation        |
| `link`              | "View in GitHub" — external link to linked PR/issue         |
| `link`              | "View Activity Log" — navigates to full history             |
| `alert`             | Success alert — "Task status updated to In Progress"        |
| `loading-spinner`   | Shown while status update is processing                     |
| `skeleton`          | Placeholder for activity feed while loading comments         |

#### Behavior:
- Changing `segmented-control` status shows `loading-spinner` briefly, then `alert` on success.
- Checking a `checkbox` subtask auto-updates progress percentage in header.
- `display-readonly` fields show formatted values (dates, currency, points).
- `link` to GitHub opens in external browser.
- `switch` for "Watch" persists preference and toggles push notifications.

---

### 3.4 Team Members

Lists all team members with role management.

**Layout:** Search bar, scrollable member list.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `input-text`        | Search field — label: "Search", placeholder: "Find team member..." |
| `card`              | Member row card — contains avatar, name, role, and task count |
| `avatar`            | Member profile avatar with initials                          |
| `badge`             | Role badge — "Admin" (indigo), "Member" (slate), "Viewer" (green) |
| `stat`              | Team summary — "Total Members" (8), "Active Today" (5)      |
| `chip`              | Role filter chips — "All", "Admin", "Member", "Viewer"      |
| `button-primary`    | "Invite Member" — opens invite modal                        |
| `button-ghost`      | "Remove" — per-row action with confirmation                 |
| `select`            | Role selector in invite modal — label: "Role", options: "Admin", "Member", "Viewer" |
| `switch`            | "Can create projects" — permission toggle in member settings |
| `skeleton`          | Loading state for member list                                |
| `link`              | Member email — mailto link                                   |
| `alert`             | "Invitation sent to alex@team.com" — success notification   |

#### Behavior:
- Typing in `input-text` search filters the member list in real-time.
- `chip` role filters are mutually exclusive (radio-style).
- `avatar` shows first+last initials, colored by role.
- `switch` toggles are persisted immediately on change.

---

### 3.5 Settings

App preferences and account settings.

**Layout:** Grouped settings sections in cards.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `card`              | Section containers — "Notifications", "Appearance", "Account" |
| `switch`            | "Push Notifications" — on/off toggle                        |
| `switch`            | "Email Digest" — daily summary toggle                       |
| `switch`            | "Dark Mode" — appearance toggle                             |
| `checkbox`          | Notification types — "Task assigned to me", "Task completed", "Comments on my tasks", "Weekly summary" |
| `select`            | "Language" — options: "English", "Spanish", "French", "German" |
| `select`            | "Time Zone" — options: timezone list                        |
| `input-text`        | "Display Name" — label: "Display Name", placeholder: "Your name" |
| `input-text`        | "Email" — label: "Email Address", placeholder: "you@team.com" |
| `button-primary`    | "Save Changes" — persists all settings                      |
| `button-secondary`  | "Cancel" — discards changes                                 |
| `button-ghost`      | "Delete Account" — destructive with multi-step confirmation |
| `display-readonly`  | "Plan" — shows "Pro Plan", "Member Since" — shows "Jan 2026" |
| `tooltip`           | Info next to "Email Digest" — content: "Receive a daily summary of all task updates at 9:00 AM your local time" |
| `alert`             | "Settings saved successfully" — success notification         |
| `link`              | "Privacy Policy" and "Terms of Service" — footer links       |

#### Behavior:
- `switch` toggles save immediately (optimistic UI).
- `checkbox` notification preferences require "Save Changes" to persist.
- "Delete Account" `button-ghost` shows a confirmation modal with `input-text` requiring the user to type "DELETE" to confirm.

---

## 4. Component Catalog Reference

All 21 V2 built-in components used in this app:

| #  | Component           | Pages Used In                              |
| -- | ------------------- | ------------------------------------------ |
| 1  | `input-text`        | Create Task, Team Members, Settings        |
| 2  | `input-currency`    | Create Task                                |
| 3  | `button-primary`    | Dashboard, Create Task, Task Detail, Team Members, Settings |
| 4  | `button-secondary`  | Create Task, Task Detail, Settings         |
| 5  | `button-ghost`      | Dashboard, Task Detail, Team Members, Settings |
| 6  | `segmented-control` | Create Task, Task Detail                   |
| 7  | `stepper`           | Create Task                                |
| 8  | `display-readonly`  | Task Detail, Settings                      |
| 9  | `card`              | Dashboard, Task Detail, Team Members, Settings |
| 10 | `badge`             | Dashboard, Task Detail, Team Members       |
| 11 | `stat`              | Dashboard, Team Members                    |
| 12 | `avatar`            | Dashboard, Task Detail, Team Members       |
| 13 | `tooltip`           | Create Task, Task Detail, Settings         |
| 14 | `checkbox`          | Create Task, Task Detail, Settings         |
| 15 | `select`            | Create Task, Team Members, Settings        |
| 16 | `chip`              | Dashboard, Task Detail, Team Members       |
| 17 | `alert`             | Create Task, Task Detail, Team Members, Settings |
| 18 | `skeleton`          | Dashboard, Task Detail, Team Members       |
| 19 | `loading-spinner`   | Dashboard, Task Detail                     |
| 20 | `link`              | Task Detail, Team Members, Settings        |
| 21 | `switch`            | Create Task, Task Detail, Team Members, Settings |

---

## 5. Navigation

```
Tab Bar (bottom):
├── Dashboard (home icon)
├── Create Task (+ icon)
├── Team (people icon)
└── Settings (gear icon)

Task Detail ← reached via tapping a task card from Dashboard
```

---

## 6. Data Models

### Task
```yaml
id: string (uuid)
title: string
description: string
project: string
type: "bug" | "feature" | "chore"
priority: "high" | "medium" | "low"
status: "todo" | "in_progress" | "done"
assignee_id: string
story_points: number (1 | 2 | 3 | 5 | 8 | 13)
estimated_cost: number (currency, nullable)
is_urgent: boolean
require_review: boolean
notify_assignee: boolean
subtasks: Subtask[]
tags: string[]
created_at: datetime
updated_at: datetime
```

### Subtask
```yaml
id: string (uuid)
title: string
completed: boolean
```

### TeamMember
```yaml
id: string (uuid)
display_name: string
email: string
role: "admin" | "member" | "viewer"
avatar_initials: string (2 chars)
can_create_projects: boolean
active_task_count: number
joined_at: datetime
```

### UserSettings
```yaml
user_id: string (uuid)
display_name: string
email: string
language: string
timezone: string
push_notifications: boolean
email_digest: boolean
dark_mode: boolean
notify_task_assigned: boolean
notify_task_completed: boolean
notify_comments: boolean
notify_weekly_summary: boolean
```

---

## 7. Non-Functional Requirements

- **Performance:** All screens load within 300ms on 4G. Skeleton states shown for any fetch > 200ms.
- **Accessibility:** All interactive components meet WCAG 2.1 AA. Min touch target 44px.
- **Responsive:** Mobile-first at 375px, tablet at 768px, desktop at 1440px.
- **Offline:** Tasks cached locally. Create/update queued and synced when online.
