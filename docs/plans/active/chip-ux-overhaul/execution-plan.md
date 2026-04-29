# CHIP — Dashboard UX Overhaul & Rebrand

**CHIP = Crafted Human Intelligence Platform**

## Context

AgentForge's dashboard looks like an AI-generated prototype. The name "AgentForge" is already taken by multiple projects. The Clarifier `/new` page (just committed — 114 tests, 6 LangGraph nodes) works but has no streaming (153s typing dots), broken UX, and no pipeline visibility. Competitive platforms (Devin, LangGraph Studio, Cursor, CrewAI, Replit Agent) set a much higher bar. This plan rebrands to CHIP, replaces the UI foundation with Mantine v7, adds React Flow for graph visualization, and phases the work incrementally with testing at each gate.

---

## Feature-to-Library Mapping

| Feature | Current State | Best Library | Why |
|---------|--------------|-------------|-----|
| LangGraph StateGraph viz | None | **React Flow + Dagre** | Industry standard for DAGs. Custom nodes show active/completed/pending. Dagre auto-layout. |
| Pipeline step progress | Typing dots | **Mantine Stepper** | Built-in vertical/horizontal, active/completed states, timer support. |
| Streaming AI chat | No streaming | **Vercel AI SDK `useChat`** | SSE streaming native, token-by-token rendering, React hooks. |
| HITL approval gates | Not in dashboard | **Mantine Modal + Timeline** | Approval dialog + visual flow. |
| Cost/token monitoring | Recharts (works) | **Keep Recharts** | Already integrated. Wrap in Mantine Card. |
| Event timeline/activity | Raw text list | **Mantine Timeline** | Dot colors, grouping, smooth animations. |
| Agent status cards | Basic table | **Mantine Card + Progress** | Status badges, progress bars, model info. |
| Code diff viewer | Not built | **react-diff-viewer-continued** | Split/inline, syntax highlight, dark mode. Future. |
| JSON state inspector | Not built | **@uiw/react-json-view** | Zero deps, dark mode, collapsible. For graph node click. |
| Question cards | Hand-rolled | **Mantine Radio.Group + Card** | Polished radio buttons, text areas, badges. |
| Assumption display | Basic accordion | **Mantine Accordion + Progress** | Confidence bars, warning icons, smooth collapse. |
| PRD preview | Basic card | **Mantine Card + RingProgress + Tabs** | Confidence ring, feature tabs, EARS display. |
| Design spec renderer | Custom (working) | **Keep custom** | Working React renderer. Restyle containers only. |
| Prototype navigation | Custom (working) | **Keep custom** | Working iframe. Restyle chrome only. |
| Brand identity | "AgentForge" (taken) | **SVG logo + CSS variables** | CHIP brand with custom mark. |

### Dependencies to install
```
@mantine/core @mantine/hooks @mantine/form @mantine/notifications
postcss postcss-preset-mantine postcss-simple-vars
@xyflow/react
ai @ai-sdk/anthropic                    # Vercel AI SDK
@uiw/react-json-view                   # JSON inspector
react-diff-viewer-continued            # Future: code diffs
```

---

## Phase 1 — Brand Identity + Design Tokens (~1 session)

**Goal:** Rename to CHIP, new logo, upgraded color system. Every page immediately looks different.

### 1.1 Rename AgentForge → CHIP
- `packages/dashboard/src/components/layout/sidebar-nav.tsx` — logo + brand name
- `packages/dashboard/src/app/layout.tsx` — page title, metadata
- `globals.css` — any brand color references
- Browser tab title: "CHIP Dashboard"
- Do NOT rename npm packages or internal code references yet — just user-facing strings

### 1.2 Logo design
- SVG mark: stylized chip/circuit icon that works at 24px (sidebar) and 64px (welcome page)
- Monochrome version for dark backgrounds
- Place in `packages/dashboard/public/chip-logo.svg`

### 1.3 Upgraded design tokens in globals.css
- **Glassmorphism tokens:** `--glass-bg: rgba(255,255,255,0.03)`, `--glass-border: rgba(255,255,255,0.08)`, `--glass-blur: 12px`
- **Gradient accents:** `--gradient-primary: linear-gradient(135deg, #3b82f6, #8b5cf6)` (blue-to-purple)
- **Glow effects:** `--glow-blue: 0 0 20px rgba(59,130,246,0.3)`
- **Micro-animation keyframes:** `fade-in`, `slide-up`, `scale-in`, `shimmer`, `typing-dots`
- **Elevation system:** 4 levels with subtle gradient backgrounds

### 1.4 Install Mantine + PostCSS
- `npm install @mantine/core @mantine/hooks @mantine/notifications`
- `postcss.config.cjs` with `postcss-preset-mantine`
- `MantineProvider` in layout with `forceColorScheme="dark"`
- Custom theme: map existing palette to Mantine color tuples
- Keep Tailwind for custom styling — Mantine components accept `className`

### Verification gate
- `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint`
- Browser: every existing page still renders (no regressions)
- Sidebar shows "CHIP" with new logo
- New design tokens visible in DevTools

---

## Phase 2 — Layout Shell Redesign (~1 session)

**Goal:** Replace hand-rolled layout with Mantine AppShell. Professional navigation, header, activity panel.

### 2.1 Mantine AppShell layout
- `AppShell` wrapping the dashboard with `Navbar`, `Header`, `Aside`, `Main`
- Responsive sidebar collapse (240px → 60px icon-only)
- Smooth expand/collapse animation

### 2.2 Sidebar → Mantine NavLink
- `NavLink` components with icons, active gradient highlight bar
- Add "New Project" (`/new`) link with + icon
- Glassmorphic panel styling via className
- Project switcher at bottom with `Mantine Select`

### 2.3 Header → Mantine AppShell.Header
- `Group` layout: breadcrumbs + phase badge + budget progress + clock
- `Mantine Breadcrumbs` for navigation context
- `Mantine Badge` for phase indicator
- `Mantine Progress` for budget bar

### 2.4 Activity sidebar → Mantine Timeline
- Replace raw event list with `Mantine Timeline`
- Colored dots: blue (info), amber (warning), red (error), green (success)
- Grouped by time (just now, minutes ago, hours ago)
- `Mantine ScrollArea` for overflow
- Collapsible via `AppShell.Aside`

### Verification gate
- All existing pages render within new layout
- Sidebar navigation works for all routes
- Activity events still display
- `npx playwright test` — all E2E pass
- Chrome DevTools: screenshot before/after comparison

---

## Phase 3 — Clarifier `/new` Page Showcase (~2 sessions)

**Goal:** The `/new` page becomes demo-worthy. Streaming, graph viz, rich interactions.

### 3.1 SSE streaming API + hook
- Refactor `POST /api/clarifier` to emit SSE events per node
- Add `onNodeEnter(name)` / `onNodeExit(name, elapsed)` callbacks to `runClarifierPipeline`
- Event types: `stage` (node progress), `thinking` (AI reasoning), `result` (final state), `error`
- New hook: `packages/dashboard/src/hooks/use-clarifier-stream.ts`
  - Consumes `fetch()` + `ReadableStream.getReader()` (not EventSource — POST body needed)
  - Returns: `{ messages, stage, isRunning, state, error, submit, respond }`

### 3.2 Pipeline stepper — Mantine Stepper
- Vertical orientation, left panel of `/new` page
- 6 steps matching Clarifier nodes:
  1. Context Retrieval — "Loading project context"
  2. PRD Analysis — "Analyzing with Claude Opus"
  3. Gap Detection — "Finding ambiguities (ClarifyGPT)"
  4. Question Prioritization — "Ranking by impact (EVPI)"
  5. Story Writing — "Generating EARS criteria"
  6. Critic Review — "INVEST/DAG quality check"
- Active: animated spinner + description + elapsed timer
- Completed: green checkmark + elapsed time
- HITL interrupt: amber pause icon + "Awaiting your input"

### 3.3 React Flow graph visualization
- Install `@xyflow/react`
- Render Clarifier DAG with custom node/edge components:
  - **Nodes:** Rounded glassmorphic cards with icon, name, status glow
  - **Edges:** Animated dashed for conditional paths, solid for sequential
  - **HITL nodes:** Amber border, pause icon
  - **Active node:** Blue glow pulse animation
  - **Completed node:** Green checkmark, dimmed
- Dagre for auto-layout
- Toggle: `Mantine SegmentedControl` — "Chat" | "Graph" views
- Click node → `Mantine Drawer` with `@uiw/react-json-view` state snapshot

### 3.4 Modern chat interface
- **User messages:** Right-aligned, `Mantine Paper` with blue gradient bg, `Mantine Avatar`
- **AI messages:** Left-aligned, glassmorphic card, CHIP avatar, streaming text (word-by-word via rAF at 20-30ms)
- **Thinking state:** Shimmer skeleton matching expected response shape (not bouncing dots)
- **Stage context:** Small badge above AI message showing which node generated it
- **Input:** `Mantine Textarea` full-width, gradient submit button, Enter to send, Shift+Enter newline

### 3.5 Question cards
- `Mantine Card` with glassmorphic className
- `Mantine Radio.Group` for multiple-choice with smooth selection
- `Mantine Textarea` for open-ended answers
- `Mantine Badge` for priority ("High Impact" = amber glow)
- Question number in `Mantine ThemeIcon` circle

### 3.6 Assumption display
- `Mantine Accordion` with smooth collapse/expand
- Each entry: `Mantine Progress` bar colored by confidence (green ≥0.8, amber ≥0.5, red <0.5)
- `Mantine ThemeIcon` for warning/check icons
- "Needs Review" badge on `requiresConfirmation` items

### 3.7 PRD preview (completion state)
- `Mantine Card` with gradient header
- `Mantine RingProgress` for confidence score (animated conic gradient)
- `Mantine Tabs`: Overview | Features | Acceptance Criteria | Dependencies
- Feature tree in `Mantine Accordion`
- EARS criteria in `Mantine Code` (monospace)
- `Mantine Button.Group`: "Approve & Continue" (gradient primary), "Request Changes" (outline)

### 3.8 Welcome state
- Large centered layout with gradient text: "What do you want to build?"
- CHIP logo mark (64px) above heading
- `Mantine Chip.Group` for suggestion prompts with hover glow
- Subtle CSS grid background pattern (no library)
- Large centered `Mantine Textarea` with gradient submit

### Verification gate
- Start dev server, navigate to `/new`
- Screenshot: welcome state with CHIP branding
- Type seed text, click Start → verify streaming stages appear in real-time
- Verify pipeline stepper shows correct node progression
- Toggle to graph view → verify React Flow DAG renders
- Click graph node → verify JSON state drawer opens
- Verify questions render with radio buttons after HITL interrupt
- Answer questions → verify PRD preview with confidence ring
- `npx playwright test` — all E2E pass
- `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint`

---

## Phase 4 — Migrate Existing Pages (~1-2 sessions)

**Goal:** Every dashboard page uses Mantine components. Consistent look across the app.

### 4.1 Design Studio
- Replace hand-rolled tabs → `Mantine Tabs`
- Inspector panel → `Mantine Paper` + `Mantine ScrollArea`
- ChatTab → reuse streaming chat from Phase 3

### 4.2 Tasks + Agents
- `Mantine Table` with sorting/filtering
- Agent cards with `Mantine Card` + `Badge` + `Progress`
- Status indicators with `Mantine ThemeIcon`

### 4.3 Pipeline page
- Add React Flow DAG for design pipeline (research → planning → design → eval → correction)
- Reuse stepper pattern from Clarifier

### 4.4 Approvals
- `Mantine Timeline` for approval flow
- `Mantine Modal` for approve/reject dialogs
- `Mantine Alert` for pending count

### 4.5 Audit + Costs + Traces
- Keep Recharts charts, wrap in `Mantine Card`
- `Mantine Table` for data display
- `Mantine Tabs` for section navigation

### 4.6 Remove hand-rolled components
- Migrate 12 files in `components/ui/` → Mantine equivalents
- Delete old files after all pages migrated
- Update imports across codebase

### Verification gate
- Every page: screenshot before/after
- All E2E tests pass
- No hand-rolled components remain in use

---

## Phase 5 — Roadmap Items (Document Only)

**Goal:** Capture competitive features for future work. No implementation.

| Feature | Inspiration | Priority | Notes |
|---------|-------------|----------|-------|
| Parallel agent swim lanes | Replit Agent, Cursor | High | Show concurrent agents in horizontal tracks |
| A2UI — agent-generated UI | CrewAI | Medium | Agents emit JSON UI surfaces, dashboard renders dynamically |
| Live artifact preview | Replit, Bolt.new | Medium | Running code in iframe alongside agent reasoning |
| State inspection debugger | LangGraph Studio | High | Partial in Phase 3.3 (click node → JSON). Full: compare before/after, replay |
| Team collaboration | Devin | Low | Multi-user observation, async HITL via Slack |
| Session replay | LangGraph Cloud | Medium | Replay past pipeline runs step by step |
| Cost Sankey diagram | LangGraph Studio | Low | Token flow visualization across pipeline stages |
| `/evolve` page | Vision Layer 5 | High | Evolution mode clarifier for existing projects |
| Full pipeline orchestration | Vision Layer 3 | High | Clarifier → Architect → Implementer → Reviewer spine |

Write these to `docs/roadmap.md` and `docs/plans/backlog/`.

---

## Key Files

| File | Phase |
|------|-------|
| `packages/dashboard/package.json` | 1 |
| `packages/dashboard/postcss.config.cjs` | 1 |
| `packages/dashboard/src/app/layout.tsx` | 1 |
| `packages/dashboard/src/app/globals.css` | 1 |
| `packages/dashboard/src/theme.ts` (new) | 1 |
| `packages/dashboard/public/chip-logo.svg` (new) | 1 |
| `packages/dashboard/src/components/layout/dashboard-shell.tsx` | 2 |
| `packages/dashboard/src/components/layout/sidebar-nav.tsx` | 2 |
| `packages/dashboard/src/components/layout/header-bar.tsx` | 2 |
| `packages/dashboard/src/hooks/use-clarifier-stream.ts` (new) | 3 |
| `packages/dashboard/src/components/clarifier/*.tsx` | 3 |
| `packages/dashboard/src/app/(dashboard)/new/page.tsx` | 3 |
| `packages/dashboard/src/app/api/clarifier/route.ts` | 3 |
| `packages/agents-clarifier/src/run.ts` | 3 |
| All `packages/dashboard/src/app/(dashboard)/*/page.tsx` | 4 |
| `packages/dashboard/src/components/ui/*.tsx` | 4 (delete) |
| `docs/roadmap.md` | 5 |
