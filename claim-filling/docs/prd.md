# ClaimFlow — Claims Filing Application

## Product Requirements Document

**Version:** 1.0  
**Status:** Approved  
**Complexity:** Medium  
**Purpose:** Design Agent test fixture — exercises forms, tables, dashboards, status flows, and detail views

---

## 1. Executive Summary

ClaimFlow is an internal claims filing and tracking application for a mid-size insurance company. Employees submit claims on behalf of policyholders, adjusters review and process them, and managers monitor pipeline health through a dashboard. The application handles property damage claims only (no health/auto specialization).

## 2. User Personas

### Persona A: Claims Agent (Primary)
- **Role:** Files new claims, gathers documentation, communicates with policyholders
- **Pain points:** Switching between 4 systems to file a single claim, re-entering policyholder data manually, no visibility into where a claim is stuck
- **Goals:** File a complete claim in under 10 minutes, track all active claims in one view

### Persona B: Claims Adjuster
- **Role:** Reviews submitted claims, requests additional documentation, approves/denies/escalates
- **Pain points:** Paper-heavy review process, no structured way to flag incomplete submissions, inconsistent damage assessment formatting
- **Goals:** Process 15+ claims per day, clear decision audit trail

### Persona C: Claims Manager
- **Role:** Monitors team throughput, identifies bottlenecks, handles escalations
- **Pain points:** No real-time visibility into pipeline, manual report generation, SLA tracking done in spreadsheets
- **Goals:** Dashboard showing pipeline health, SLA compliance, and adjuster workload at a glance

## 3. Feature Map

### 3.1 Core Features (MVP)

| ID | Feature | Priority | Persona |
|----|---------|----------|---------|
| F-01 | Submit new claim with multi-step form | Must | Agent |
| F-02 | Claims list with filtering, sorting, search | Must | Agent, Adjuster |
| F-03 | Claim detail view with timeline | Must | All |
| F-04 | Adjuster review workflow (approve/deny/request info/escalate) | Must | Adjuster |
| F-05 | Dashboard with pipeline metrics | Must | Manager |
| F-06 | Document upload and attachment management | Must | Agent, Adjuster |
| F-07 | Notifications panel | Should | All |
| F-08 | Policyholder search and auto-fill | Should | Agent |

### 3.2 Deferred Features (V2)
- Automated damage estimation from photos
- Email integration for policyholder communication
- Bulk claim operations
- Export to PDF/CSV

## 4. Data Model

### 4.1 Entities

**Claim**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | UUID | Yes | Auto-generated |
| claim_number | string | Yes | Format: CLM-YYYYMMDD-XXXX |
| status | enum | Yes | See 4.2 |
| priority | enum | Yes | low, medium, high, critical |
| policyholder_id | UUID (FK) | Yes | |
| policy_number | string | Yes | |
| incident_date | date | Yes | |
| filed_date | datetime | Yes | Auto-set on creation |
| incident_type | enum | Yes | fire, water, wind, theft, vandalism, other |
| incident_description | text | Yes | Min 50 chars |
| incident_address | object | Yes | street, city, state, zip |
| estimated_damage | decimal | No | USD, set by adjuster |
| approved_amount | decimal | No | USD, set on approval |
| assigned_adjuster_id | UUID (FK) | No | Null until assigned |
| filed_by_id | UUID (FK) | Yes | Agent who filed |
| documents | Document[] | No | Attached files |
| notes | Note[] | No | Internal notes timeline |
| updated_at | datetime | Yes | Auto-updated |

**Policyholder**
| Field | Type | Required |
|-------|------|----------|
| id | UUID | Yes |
| full_name | string | Yes |
| email | string | Yes |
| phone | string | Yes |
| address | object | Yes |
| policy_number | string | Yes |
| policy_type | enum | Yes | basic, standard, premium |
| policy_start_date | date | Yes |
| policy_end_date | date | Yes |
| claims_history_count | integer | Yes |

**Document**
| Field | Type | Required |
|-------|------|----------|
| id | UUID | Yes |
| claim_id | UUID (FK) | Yes |
| filename | string | Yes |
| file_type | string | Yes |
| file_size | integer | Yes |
| uploaded_by | UUID (FK) | Yes |
| uploaded_at | datetime | Yes |
| category | enum | Yes | photo, receipt, report, police_report, estimate, other |

**Note**
| Field | Type | Required |
|-------|------|----------|
| id | UUID | Yes |
| claim_id | UUID (FK) | Yes |
| author_id | UUID (FK) | Yes |
| content | text | Yes |
| type | enum | Yes | internal, status_change, document_request, decision |
| created_at | datetime | Yes |

**User**
| Field | Type | Required |
|-------|------|----------|
| id | UUID | Yes |
| name | string | Yes |
| email | string | Yes |
| role | enum | Yes | agent, adjuster, manager |
| avatar_url | string | No |
| active_claims_count | integer | Yes |

### 4.2 Claim Status Flow

```
draft → submitted → under_review → [approved | denied | info_requested | escalated]
                                        ↓                    ↓
                                    closed            submitted (re-enters review)
```

Valid transitions:
- `draft` → `submitted` (Agent submits)
- `submitted` → `under_review` (Adjuster picks up)
- `under_review` → `approved` (Adjuster approves)
- `under_review` → `denied` (Adjuster denies with reason)
- `under_review` → `info_requested` (Adjuster needs more docs)
- `under_review` → `escalated` (Adjuster escalates to manager)
- `info_requested` → `submitted` (Agent provides info, re-submits)
- `approved` → `closed` (Payout processed)
- `denied` → `closed` (After appeal window)
- `escalated` → `under_review` (Manager reassigns)

## 5. Screens

### Screen 1: Dashboard (SCR-001)
**Route:** `/dashboard`  
**Persona:** Manager (primary), all roles (read)  
**Layout:** Top navigation + full-width content

**Components:**
- **Stats row** (4 cards): Total open claims, Claims filed today, Average processing time (days), SLA compliance rate (%)
- **Claims pipeline chart**: Horizontal stacked bar showing count per status (submitted, under_review, info_requested, escalated, approved, denied)
- **Priority distribution**: Donut chart showing claims by priority level
- **Recent activity feed**: Last 10 status changes across all claims (avatar, action text, timestamp, claim link)
- **Adjuster workload table**: Table showing each adjuster's name, active claims count, avg processing time, oldest claim age

**Interactions:**
- Click any stat card → navigates to filtered claims list
- Click claim in activity feed → navigates to claim detail
- Click adjuster name → navigates to claims list filtered by adjuster

### Screen 2: Claims List (SCR-002)
**Route:** `/claims`  
**Persona:** Agent, Adjuster  
**Layout:** Top navigation + sidebar filters + main content

**Components:**
- **Search bar**: Full-text search across claim number, policyholder name, description
- **Filter sidebar**: Status (multi-select checkboxes), Priority (multi-select), Incident type (multi-select), Date range picker, Assigned adjuster (dropdown)
- **Claims table**: Columns — Claim #, Policyholder, Incident Type, Status (badge), Priority (badge), Filed Date, Assigned To, Estimated Damage
- **Pagination**: 20 per page, page numbers + prev/next
- **Sort**: Clickable column headers (filed date default desc)
- **Bulk actions bar** (appears when rows selected): Assign adjuster, Change priority
- **"New Claim" button**: Top right, primary action

**Table row interactions:**
- Click row → navigate to claim detail
- Status badge colors: submitted=blue, under_review=yellow, approved=green, denied=red, info_requested=orange, escalated=purple, closed=gray

### Screen 3: New Claim Form (SCR-003)
**Route:** `/claims/new`  
**Persona:** Agent  
**Layout:** Top navigation + centered form (max-width 720px)

**Multi-step form (3 steps with progress indicator):**

**Step 1: Policyholder**
- Policy number input (text field with search icon) — on blur, auto-fills policyholder data
- Policyholder name (read-only after auto-fill, or manual entry)
- Policyholder email (read-only or manual)
- Policyholder phone (read-only or manual)
- Verify address checkbox + address fields (street, city, state, zip)
- "Policyholder not found" inline alert with manual entry fallback

**Step 2: Incident Details**
- Incident date (date picker, cannot be future)
- Incident type (select dropdown)
- Priority (radio buttons: low, medium, high, critical — with helper text for each)
- Incident address (defaults to policyholder address, toggle for "different location")
- Description (textarea, min 50 chars, character count shown)

**Step 3: Documentation**
- File upload zone (drag-and-drop + click, accepts jpg/png/pdf, max 10MB per file, max 10 files)
- Each uploaded file shows: thumbnail/icon, filename, size, category dropdown (photo, receipt, report, police_report, estimate, other), remove button
- "No documents yet" empty state with helper text
- Review summary panel: shows all entered data in a compact read-only layout before submission

**Form actions:**
- Back / Next buttons per step
- "Save as Draft" available on all steps
- "Submit Claim" on final step (with confirmation dialog)

### Screen 4: Claim Detail (SCR-004)
**Route:** `/claims/:id`  
**Persona:** All  
**Layout:** Top navigation + two-column layout (main content 65% + sidebar 35%)

**Main column:**
- **Claim header**: Claim number, status badge, priority badge, filed date, incident type icon
- **Policyholder card**: Name, email, phone, policy number, policy type badge (basic/standard/premium)
- **Incident section**: Date, address (with small map placeholder), description
- **Documents section**: Grid of document cards (thumbnail, filename, category badge, uploaded date, download button). Upload button to add more.
- **Activity timeline**: Chronological list of all notes and status changes. Each entry: avatar, author name, action/content, timestamp, type icon (status_change, note, document_request, decision). New note input at bottom with type selector.

**Sidebar (right):**
- **Status panel**: Current status with colored indicator, "Assigned to" with adjuster avatar+name (or "Unassigned" with assign button)
- **Financial panel**: Estimated damage (editable by adjuster), Approved amount (shown after approval)
- **Actions panel** (role-dependent):
  - Agent sees: "Edit Claim" (if draft/info_requested), "Add Document", "Add Note"
  - Adjuster sees: "Approve" (green), "Deny" (red), "Request Info" (orange), "Escalate" (purple), "Set Estimate", "Add Note"
  - Manager sees: "Reassign", "Override Status", "Add Note"
- **Quick info panel**: Days since filed, Days in current status, SLA status (on track / at risk / breached)

**Interactions:**
- Approve → confirmation modal with approved amount input (required)
- Deny → confirmation modal with denial reason (required textarea)
- Request Info → modal with message to agent (what's needed) and optional checklist of document types
- Escalate → modal with escalation reason

### Screen 5: Notifications Panel (SCR-005)
**Route:** Slide-over panel from bell icon in top nav  
**Persona:** All

**Components:**
- **Notification list**: Each item has — icon (by type), title, description snippet, timestamp, read/unread indicator, link to relevant claim
- **Filter tabs**: All, Unread, Action Required
- **Mark all read** button
- **Empty state**: "You're all caught up" illustration

**Notification types:**
- Claim assigned to you (adjuster)
- Info requested on your claim (agent)
- Claim approved/denied (agent)
- Claim escalated (manager)
- SLA warning — claim approaching deadline (adjuster, manager)

## 6. Design Tokens

### 6.1 Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `color.primary` | #2563EB (Blue 600) | Primary actions, links, active states |
| `color.primary-hover` | #1D4ED8 (Blue 700) | Hover states |
| `color.secondary` | #64748B (Slate 500) | Secondary text, borders |
| `color.background` | #FFFFFF | Page background |
| `color.surface` | #F8FAFC (Slate 50) | Card backgrounds, table rows |
| `color.surface-elevated` | #FFFFFF | Modals, dropdowns |
| `color.text-primary` | #0F172A (Slate 900) | Headings, primary text |
| `color.text-secondary` | #475569 (Slate 600) | Descriptions, helper text |
| `color.text-muted` | #94A3B8 (Slate 400) | Timestamps, placeholders |
| `color.border` | #E2E8F0 (Slate 200) | Dividers, card borders |
| `color.success` | #16A34A (Green 600) | Approved status, positive metrics |
| `color.error` | #DC2626 (Red 600) | Denied status, errors, destructive actions |
| `color.warning` | #F59E0B (Amber 500) | Info requested, at-risk SLA |
| `color.info` | #2563EB (Blue 600) | Submitted status, informational badges |
| `color.escalated` | #9333EA (Purple 600) | Escalated status |

### 6.2 Status Badge Mapping

| Status | Background | Text |
|--------|------------|------|
| draft | slate-100 | slate-700 |
| submitted | blue-100 | blue-700 |
| under_review | amber-100 | amber-700 |
| approved | green-100 | green-700 |
| denied | red-100 | red-700 |
| info_requested | orange-100 | orange-700 |
| escalated | purple-100 | purple-700 |
| closed | gray-100 | gray-500 |

### 6.3 Typography

| Token | Value |
|-------|-------|
| `font.family.sans` | Inter, system-ui, sans-serif |
| `font.family.mono` | JetBrains Mono, monospace |
| `font.size.xs` | 12px |
| `font.size.sm` | 14px |
| `font.size.base` | 16px |
| `font.size.lg` | 18px |
| `font.size.xl` | 20px |
| `font.size.2xl` | 24px |
| `font.size.3xl` | 30px |

### 6.4 Spacing

Base unit: 4px. Scale: 0, 1 (4px), 2 (8px), 3 (12px), 4 (16px), 5 (20px), 6 (24px), 8 (32px), 10 (40px), 12 (48px), 16 (64px).

### 6.5 Shadows

| Token | Value |
|-------|-------|
| `shadow.sm` | 0 1px 2px rgba(0,0,0,0.05) |
| `shadow.md` | 0 4px 6px rgba(0,0,0,0.07) |
| `shadow.lg` | 0 10px 15px rgba(0,0,0,0.10) |

### 6.6 Border Radius

| Token | Value |
|-------|-------|
| `radius.sm` | 4px |
| `radius.md` | 8px |
| `radius.lg` | 12px |
| `radius.xl` | 16px |
| `radius.full` | 9999px |

## 7. Component Catalog

All components sourced from **shadcn/ui** unless noted as custom.

| Component | Source | Variants Used | Screens |
|-----------|--------|---------------|---------|
| Button | shadcn | primary, secondary, ghost, destructive, outline | All |
| Badge | shadcn | default + custom status colors | SCR-002, SCR-004 |
| Card | shadcn | default | SCR-001, SCR-004 |
| Input | shadcn | default, with icon | SCR-002, SCR-003 |
| Textarea | shadcn | default | SCR-003, SCR-004 |
| Select | shadcn | default | SCR-003 |
| Checkbox | shadcn | default | SCR-002 |
| RadioGroup | shadcn | default | SCR-003 |
| DatePicker | shadcn | default | SCR-002, SCR-003 |
| Dialog (Modal) | shadcn | default | SCR-004 |
| Table | shadcn | default | SCR-001, SCR-002 |
| Tabs | shadcn | default | SCR-005 |
| Avatar | shadcn | default | SCR-001, SCR-004 |
| Progress | shadcn | default | SCR-003 (step indicator) |
| Separator | shadcn | default | SCR-004 |
| DropdownMenu | shadcn | default | SCR-002 (bulk actions) |
| Sheet (Slide-over) | shadcn | default | SCR-005 |
| Alert | shadcn | default, destructive | SCR-003 |
| StatsCard | **custom** | default | SCR-001 |
| FileUploadZone | **custom** | default | SCR-003 |
| ActivityTimeline | **custom** | default | SCR-004 |
| NotificationItem | **custom** | read, unread | SCR-005 |
| ClaimStatusBadge | **custom** | per-status colors | SCR-002, SCR-004 |
| PriorityBadge | **custom** | low, medium, high, critical | SCR-002, SCR-004 |

## 8. API Surface

### 8.1 Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/claims` | List claims with filters, pagination, sort | Yes |
| POST | `/api/claims` | Create new claim | Yes (agent) |
| GET | `/api/claims/:id` | Get claim detail with notes and documents | Yes |
| PATCH | `/api/claims/:id` | Update claim fields | Yes |
| POST | `/api/claims/:id/status` | Transition claim status | Yes |
| POST | `/api/claims/:id/notes` | Add note to claim | Yes |
| POST | `/api/claims/:id/documents` | Upload document to claim | Yes |
| DELETE | `/api/claims/:id/documents/:docId` | Remove document | Yes |
| GET | `/api/claims/:id/timeline` | Get activity timeline | Yes |
| GET | `/api/policyholders/search` | Search policyholders by policy number or name | Yes |
| GET | `/api/policyholders/:id` | Get policyholder detail | Yes |
| GET | `/api/dashboard/stats` | Aggregate dashboard metrics | Yes (manager) |
| GET | `/api/dashboard/pipeline` | Claims count by status | Yes (manager) |
| GET | `/api/dashboard/workload` | Adjuster workload summary | Yes (manager) |
| GET | `/api/notifications` | Get user's notifications | Yes |
| PATCH | `/api/notifications/:id/read` | Mark notification as read | Yes |
| POST | `/api/notifications/read-all` | Mark all as read | Yes |
| GET | `/api/users/me` | Get current user profile | Yes |

### 8.2 Key Request/Response Schemas

**POST /api/claims**
```json
{
  "policyholder_id": "uuid",
  "policy_number": "string",
  "incident_date": "2026-03-15",
  "incident_type": "water",
  "priority": "medium",
  "incident_address": {
    "street": "123 Main St",
    "city": "Springfield",
    "state": "IL",
    "zip": "62701"
  },
  "incident_description": "Burst pipe in basement caused flooding...",
  "status": "draft"
}
```

**POST /api/claims/:id/status**
```json
{
  "new_status": "approved",
  "reason": "All documentation verified, damage estimate confirmed.",
  "approved_amount": 15000.00
}
```

**GET /api/dashboard/stats response**
```json
{
  "open_claims": 47,
  "filed_today": 8,
  "avg_processing_days": 4.2,
  "sla_compliance_rate": 0.89
}
```

## 9. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | Page load (initial) | < 2s |
| Performance | API response (p95) | < 500ms |
| Performance | File upload (10MB) | < 5s |
| Accessibility | WCAG compliance | AA |
| Accessibility | Keyboard navigation | Full |
| Security | Authentication | JWT with role-based access |
| Security | File uploads | Virus scan, type validation |
| Responsiveness | Minimum viewport | 1024px (desktop-only app) |
| Data | Claims list max | 10,000 active claims |
| Data | Documents per claim max | 10 files |

## 10. Acceptance Criteria

### F-01: Submit New Claim
- [ ] Agent can search policyholder by policy number and auto-fill form fields
- [ ] Form validates all required fields before allowing step progression
- [ ] Incident date cannot be in the future
- [ ] Description requires minimum 50 characters with visible counter
- [ ] Draft can be saved at any step and resumed later
- [ ] Submit creates claim with status "submitted" and shows confirmation
- [ ] Claim number is auto-generated in CLM-YYYYMMDD-XXXX format

### F-02: Claims List
- [ ] Table displays all claims accessible to the user's role
- [ ] Filters narrow results without page reload
- [ ] Search matches against claim number, policyholder name, and description
- [ ] Sort works on all sortable columns
- [ ] Pagination shows correct total count and page controls
- [ ] Status and priority badges use correct color mappings

### F-03: Claim Detail
- [ ] All claim data renders in correct sections
- [ ] Timeline shows chronological activity with correct icons per type
- [ ] Documents display with thumbnails for images, icons for PDFs
- [ ] Sidebar shows role-appropriate action buttons only
- [ ] SLA indicator updates based on claim age and status

### F-04: Adjuster Review Workflow
- [ ] Approve requires entering an approved amount
- [ ] Deny requires entering a denial reason
- [ ] Request Info sends a notification to the filing agent
- [ ] Escalate sends a notification to managers
- [ ] All status transitions update the timeline immediately

### F-05: Dashboard
- [ ] Stats cards show real-time aggregate data
- [ ] Pipeline chart shows accurate counts per status
- [ ] Activity feed updates without manual refresh
- [ ] Workload table shows all active adjusters with metrics
- [ ] Clicking any metric navigates to a filtered claims list

## 11. Mock Data Specification

For design agent testing, generate mock data with these distributions:

- **47 open claims** across statuses: 8 submitted, 15 under_review, 5 info_requested, 3 escalated, 10 approved, 4 denied, 2 closed
- **6 adjusters** with varying workloads (2-8 active claims each)
- **3 agents** who file claims
- **Priority distribution**: 30% low, 40% medium, 20% high, 10% critical
- **Incident types**: 25% water, 20% fire, 20% wind, 15% theft, 10% vandalism, 10% other
- **Average estimated damage**: $5,000 - $75,000 range
- **Policyholder policy types**: 40% standard, 35% premium, 25% basic

---

*End of PRD — ClaimFlow v1.0*
