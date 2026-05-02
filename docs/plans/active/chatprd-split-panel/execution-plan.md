# Plan: ChatPRD-Style Split-Panel PRD Builder

## Progress (2026-05-01)

**Phases 1-7 COMPLETE. Phase 8 REMAINING.**

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Types + Streaming + Hook | COMPLETE | `clarifier-chat-types.ts`, `runClarifierPipelineStream()`, `useClarifierStream` hook. 6+9 unit tests passing. |
| Phase 2: Split Panel Layout | COMPLETE | `SplitPanelLayout`, `ResizeHandle`. localStorage persistence. Mobile responsive. |
| Phase 3: Chat Panel | COMPLETE | `ChatPanel`, `WelcomeHero`, `ChatThread`, `ChatMessage`, `ChatInput`. |
| Phase 4: PRD Document Panel | COMPLETE | `PrdPanel`, `PrdPanelHeader`, `LivePrdDocument` (9 sections), `PrdSection`, `SuggestionCallout`, `OpenQuestionsSection`. |
| Phase 5: Page Rewrite | COMPLETE | `page.tsx` rewritten 763→336 lines. `slideInRight` keyframe added. Browser verified clean. |
| Phase 6: React Flow Graph | COMPLETE | `@xyflow/react@12.10.2` + `@dagrejs/dagre@3.0.0`. `graph-node.tsx` custom node, `clarifier-graph.tsx` DAG with dagre layout, 8 nodes + conditional edges, `Document\|Graph` toggle in PrdPanel. Hook extended with `activeNode`, `completedNodes`, `interruptedAt`. |
| Phase 7: Respond Route SSE | COMPLETE | Respond route upgraded from `runClarifierPipeline` (blocking JSON) to `runClarifierPipelineStream` (SSE). Same event structure as `/api/clarifier`. Hook already handled both via content-type check. |
| Phase 8: Visual Polish | NOT STARTED | Run `/improvise-ux` against ChatPRD reference |

**Drift check (mid-session):** All violations fixed — unit tests added, typecheck passing, browser verified. Pre-existing lint errors fixed (header-bar.tsx setState-in-effect, live-prd-document.tsx mutable render variable).

---

## Context

The `/new` (clarifier) page currently uses a single-column phased layout where the PRD only appears at the very end. The user wants a **ChatPRD-inspired experience**: a split-panel layout with a chat conversation on the left and a live PRD document building simultaneously on the right — including inline suggestions, quality scoring, tool execution visibility, and progressive section rendering.

The clarifier pipeline already produces rich data (9-section PRD, gap analysis with divergence scores, EVPI-ranked questions, assumption ledger, feature plans with EARS criteria) — but the current UI only surfaces a fraction of it at completion. This plan transforms the `/new` page to expose that data progressively as the pipeline runs.

**Parent plan:** This implements and extends `docs/plans/active/chip-ux-overhaul/execution-plan.md` Phase 3 ("Clarifier `/new` Page Showcase"). It adds the split-panel PRD document (not in the original Phase 3) and uses a three-way `Chat | Graph | PRD` toggle to incorporate Phase 3.3's React Flow graph visualization. The parent plan should be updated to reflect this expanded scope after implementation.

**Challenge report resolutions:**
1. Use LangGraph `streamEvents` (not custom `onNodeComplete` callback) — aligns with vision Layer 1
2. Include React Flow graph as a three-way toggle — fulfills both parent plan Phase 3.3 and ChatPRD requirements
3. PRD "progressive" rendering is animated stagger from a single node payload, not section-by-section streaming (prdAnalyzer produces the full PRD in one LLM call)

---

## What We're Building

**Left panel (Chat):** Conversational thread showing the clarifier's work — tool results, thinking stages, questions, and user answers — with a persistent input at the bottom.

**Right panel (three-way toggle: PRD | Graph | both):**
- **PRD Document:** Builds section-by-section as the clarifier runs, with suggestion callouts, open questions, quality scores, and confidence indicators.
- **Graph View:** React Flow DAG showing the clarifier pipeline nodes with animated edges, status indicators, and clickable state inspection (per UX Overhaul Phase 3.3).

---

## Phase 1: Foundation — Types, Hook, and API Streaming

### Task 1.1: Chat message types
**File:** `packages/dashboard/src/lib/clarifier-chat-types.ts` (new)

Discriminated union for chat thread messages:
- `user-seed` — initial idea input
- `tool-result` — context loading, gap detection, EVPI scoring (with icon, status badge, result summary)
- `agent-thinking` — processing indicator
- `agent-question` — question card (carries `Question` with options)
- `user-answer` — selected answer displayed as chat bubble
- `prd-update` — notification that PRD sections were updated
- `escalation` — max rounds reached
- `error` — error message

Each message: `{ id, timestamp, kind, payload }`.

### Task 1.2: Stream per-node state via LangGraph `streamEvents`
**File:** `packages/agents-clarifier/src/run.ts`

Change `runClarifierPipeline` from `graph.invoke()` to `graph.stream()` using LangGraph's native streaming API. Return an async iterable of node completion events instead of a single result.

New signature: `runClarifierPipelineStream(input): AsyncIterable<ClarifierStreamEvent>` where:
```
type ClarifierStreamEvent =
  | { type: 'node-complete'; node: string; state: Partial<ClarifierState> }
  | { type: 'interrupt'; state: ClarifierState; threadId: string }
  | { type: 'complete'; state: ClarifierState; threadId: string }
  | { type: 'error'; error: { code: string; message: string } }
```

Keep the existing `runClarifierPipeline` (blocking) for CLI use. Add the streaming variant alongside it.

**File:** `packages/dashboard/src/app/api/clarifier/route.ts`

Consume the async iterable and emit SSE events per node:
- After `contextRetriever` → `event: stage` with context summary
- After `prdAnalyzer` → `event: prd-draft` with the full PRD draft
- After `gapDetector` → `event: gaps` with gap data
- After `questionPrioritizer` → `event: stage` with "Questions ready"
- On interrupt → `event: result` with questions + threadId
- On complete → `event: result` with final state

**Note on "progressive" rendering:** The `prdAnalyzer` node produces the entire PRD in one LLM call (`claude-opus-4-6` with forced-JSON `responseSchema`). All 9 sections arrive at once. The LivePrdDocument should use staggered animation (100ms delay between sections) to create a progressive appearance from this single payload.

### Task 1.3: `useClarifierStream` hook
**File:** `packages/dashboard/src/lib/hooks/use-clarifier-stream.ts` (new)

Replaces inline SSE parsing from `page.tsx` lines 293-339. Returns:
```
{ messages, prdDraft, featurePlan, gaps, assumptions, clarifierState,
  stage, isRunning, error, startClarifier, submitAnswers, submitEscalation }
```

- Builds `ChatMessage[]` as SSE events arrive
- Extracts `prdDraft` from intermediate `prd-draft` SSE event
- Extracts `gaps` from `gaps` SSE event
- Handles both `/api/clarifier` (SSE) and `/api/clarifier/respond` (JSON) flows
- Converts each API event into the appropriate chat message type

---

## Phase 2: Layout — Split Panel with Resize

### Task 2.1: Reusable `ResizeHandle` component
**File:** `packages/dashboard/src/components/clarifier/resize-handle.tsx` (new)

Extract the proven pattern from `design/page.tsx` lines 91-116:
- Props: `onResize(delta)`, `direction: 'horizontal'`
- 4px strip, transparent bg, `hover:bg-border/50`, active `bg-accent-blue/40`
- `cursor: col-resize`, document-level mousemove/mouseup

### Task 2.2: `SplitPanelLayout` container
**File:** `packages/dashboard/src/components/clarifier/split-panel-layout.tsx` (new)

- Flex row, `h-full overflow-hidden`
- Left panel: `flex-1`, min-width 360px
- ResizeHandle (center)
- Right panel: controlled width (default 480px, min 320px, max 640px), persisted to `chip-prd-panel-width`
- PRD panel slides in from right (`animate-slideInRight`) when `prdDraft` first arrives
- Mobile (`< md`): single column with `Chat | Document` segmented control tab switcher

---

## Phase 3: Chat Panel (Left Side)

### Task 3.1: `ChatPanel` wrapper
**File:** `packages/dashboard/src/components/clarifier/chat-panel.tsx` (new)

- Flex column: scrollable thread area + sticky input at bottom
- Shows `WelcomeHero` when no messages yet (welcome phase)
- Shows `ChatThread` once interaction begins

### Task 3.2: `WelcomeHero` component
**File:** `packages/dashboard/src/components/clarifier/welcome-hero.tsx` (new)

Extract from current `page.tsx` lines 444-468: icon, "What do you want to build?" heading, suggestion chips, gradient blobs (constrained to left panel).

### Task 3.3: `ChatThread` and message components
**File:** `packages/dashboard/src/components/clarifier/chat-thread.tsx` (new)
**File:** `packages/dashboard/src/components/clarifier/chat-message.tsx` (new)

`ChatThread`: scrollable container, renders `ChatMessage` list, auto-scrolls on new messages.

`ChatMessage`: renders based on `kind`:
- **user-seed / user-answer**: right-aligned bubble, `bg-accent-blue/8 border-accent-blue/20`
- **tool-result**: card with icon + tool name + "Completed" green badge + result summary (e.g., "Loaded 12 components from catalog", "Detected 5 gaps via ClarifyGPT"). Expandable details.
- **agent-question**: the existing question card UI (options, recommendation badges, tradeoff tags, free-text input) — extracted from `page.tsx` lines 494-610
- **agent-thinking**: inline `ThinkingTimeline` (existing component)
- **prd-update**: subtle notification "PRD updated — 3 features, 2 personas extracted"
- **escalation**: the existing escalation card (lines 673-698)

### Task 3.4: `ChatInput` component
**File:** `packages/dashboard/src/components/clarifier/chat-input.tsx` (new)

Sticky bottom input:
- Auto-growing textarea
- Send button (accent-indigo arrow icon)
- Enter to submit, Shift+Enter newline
- Disabled during `running` phase
- Placeholder changes contextually ("Describe what you want to build..." → "Type your answer..." → "Ask a follow-up or request revisions...")
- Bottom toolbar row: project context indicator, question count badge

---

## Phase 4: PRD Document Panel (Right Side)

### Task 4.1: `PrdPanel` wrapper
**File:** `packages/dashboard/src/components/clarifier/prd-panel.tsx` (new)

- Full-height right panel with sticky header + scrollable document body
- Empty state (before prdDraft arrives): "Your PRD will build here as we analyze your idea" with subtle illustration
- After prdDraft: renders `PrdPanelHeader` + `LivePrdDocument`
- At completion: shows approval actions (from existing `PrdPreview` approve/reject)

### Task 4.2: `PrdPanelHeader` component
**File:** `packages/dashboard/src/components/clarifier/prd-panel-header.tsx` (new)

Sticky header at top of PRD panel:
- PRD title (large, `text-lg font-semibold`)
- Status badge: "Draft" (amber) during building, "Complete" (green) at end
- Confidence score: percentage + color-coded indicator (reuse `confidenceLabel` from `prd-preview.tsx`)
- "Build in CHIP" action button (accent gradient, top-right) — triggers approve flow

### Task 4.3: `LivePrdDocument` component
**File:** `packages/dashboard/src/components/clarifier/live-prd-document.tsx` (new)

Renders all 9 PRD sections progressively. Each section appears with `fadeSlideUp` animation as data populates:

| Section | Data Source | Rendering |
|---------|------------|-----------|
| Overview | `prdDraft.description` | Rich text paragraph |
| Features | `prdDraft.features[]` | Cards with priority badges (must/should/could/won't) |
| Personas | `prdDraft.personas[]` | Name + role + goals list |
| Data Model | `prdDraft.dataEntities[]` | Entity name + fields table |
| Screens | `prdDraft.screens[]` | Name + type badge + description |
| NFRs | `prdDraft.nfrs[]` | Category tag + description + target metric |
| Success Metrics | `prdDraft.successMetrics[]` | Name + target + measurement |
| Out of Scope | `prdDraft.outOfScope[]` | Strikethrough-styled items |
| Assumptions | `assumptions.entries[]` | Statement + confidence + blast radius badge |

Each section uses a shared `PrdSection` sub-component (collapsible, with count badge in header).

### Task 4.4: `SuggestionCallout` component
**File:** `packages/dashboard/src/components/clarifier/suggestion-callout.tsx` (new)

Orange/yellow callout boxes inline in the PRD document (ChatPRD style):
- Left border: `border-l-4 border-accent-orange`
- Background: `bg-accent-orange/5`
- Label: "SUGGESTION" in `text-accent-orange text-xs font-semibold uppercase`
- Content text below

**Sources for suggestions:**
- Assumptions with `requiresConfirmation: true` → "Consider clarifying: {statement}"
- Gaps with `category: 'incomplete'` → "This section could benefit from: {description}"
- Low-confidence PRD sections → "Add more detail to improve confidence"

### Task 4.5: `OpenQuestionsSection` component
**File:** `packages/dashboard/src/components/clarifier/open-questions-section.tsx` (new)

Dedicated section in the PRD showing unanswered gaps:
- Renders gaps that weren't converted to questions (below EVPI threshold)
- Each gap shows: topic, description, category badge, divergence score
- Styled as blockquote-like entries (indent + muted border)

### Task 4.6: Quality scoring panel
Embedded in `LivePrdDocument` as a collapsible section or sidebar strip:

- **Overall confidence**: percentage from `requirement.confidence`
- **Section completeness**: per-section indicator (features: 5, personas: 2, screens: 3, NFRs: 0)
- **Assumption risk**: count of `requiresConfirmation` items + highest blast radius
- **EVPI insight**: "3 high-impact questions remain" or "All critical gaps resolved"

Visual: thin progress bar per section, color-coded (green/yellow/red based on completeness).

---

## Phase 5: Page Rewrite and Integration

### Task 5.1: Rewrite `page.tsx`
**File:** `packages/dashboard/src/app/(dashboard)/new/page.tsx`

Shrink from ~760 lines to ~150 lines. The page becomes an orchestrator:

```tsx
export default function NewProjectPage() {
  const clarifier = useClarifierStream();
  const [prdPanelVisible, setPrdPanelVisible] = useState(false);

  useEffect(() => {
    if (clarifier.prdDraft && !prdPanelVisible) setPrdPanelVisible(true);
  }, [clarifier.prdDraft]);

  return (
    <SplitPanelLayout prdPanelVisible={prdPanelVisible}>
      <ChatPanel
        messages={clarifier.messages}
        isRunning={clarifier.isRunning}
        onSubmitSeed={clarifier.startClarifier}
        onSubmitAnswer={clarifier.submitAnswers}
        onEscalation={clarifier.submitEscalation}
      />
      <PrdPanel
        prdDraft={clarifier.prdDraft}
        featurePlan={clarifier.featurePlan}
        gaps={clarifier.gaps}
        assumptions={clarifier.assumptions}
        requirement={clarifier.clarifierState?.requirement}
        confidence={clarifier.clarifierState?.requirement?.confidence}
        isComplete={clarifier.stage === 'complete'}
        onApprove={...}
        onRequestChanges={...}
      />
    </SplitPanelLayout>
  );
}
```

### Task 5.2: CSS animations
**File:** `packages/dashboard/src/app/globals.css`

Add:
- `@keyframes slideInRight` — PRD panel entrance
- `@keyframes sectionAppear` — individual PRD section fade-in
- Existing `fadeSlideUp`, `fade-in` are already defined and reusable

### Task 5.3: Mobile responsive
Below `md` breakpoint:
- Hide ResizeHandle
- Show segmented control: `Chat | Document`
- Only render active tab content
- Document tab shows confidence badge when PRD data exists

---

## Phase 6: React Flow Graph Visualization

### Task 6.1: Clarifier DAG graph component
**File:** `packages/dashboard/src/components/clarifier/clarifier-graph.tsx` (new)

Per UX Overhaul Phase 3.3:
- Install `@xyflow/react` + `dagre` for auto-layout
- 7 nodes matching clarifier pipeline: contextRetriever → prdAnalyzer → gapDetector → questionPrioritizer → storyWriter → critic → (conditional routing)
- Custom node components: rounded glassmorphic cards with icon, name, status glow
- Edge styles: animated dashed for conditional paths (retry, escalation), solid for sequential
- HITL interrupt nodes: amber border + pause icon
- Active node: blue glow pulse animation
- Completed node: green checkmark, dimmed
- Click node → Mantine Drawer with state snapshot (JSON viewer)
- Receives current `stage` from `useClarifierStream` to highlight active node

### Task 6.2: Three-way toggle in right panel
**File:** `packages/dashboard/src/components/clarifier/prd-panel.tsx` (modify)

Add `Mantine SegmentedControl` at the top of the right panel: `Document | Graph`
- **Document**: shows `LivePrdDocument` (default when prdDraft exists)
- **Graph**: shows `ClarifierGraph` (useful during pipeline execution for debugging)
- Default to Document when prdDraft data exists, Graph when running with no PRD yet

## Phase 7: Respond Route Upgrade

### Task 7.1: Add SSE streaming to `/api/clarifier/respond`
**File:** `packages/dashboard/src/app/api/clarifier/respond/route.ts`

Currently returns plain JSON. Upgrade to SSE using the same `runClarifierPipelineStream` async iterable so the chat can show tool-result messages during follow-up rounds too. The `useClarifierStream` hook already handles both flows.

---

## Files Summary

### New Files (18)
| File | Purpose |
|------|---------|
| `lib/clarifier-chat-types.ts` | Chat message type definitions |
| `lib/hooks/use-clarifier-stream.ts` | SSE consumer + chat message builder hook |
| `components/clarifier/split-panel-layout.tsx` | Two-panel container with resize |
| `components/clarifier/resize-handle.tsx` | Reusable resize divider |
| `components/clarifier/chat-panel.tsx` | Left panel wrapper |
| `components/clarifier/welcome-hero.tsx` | Extracted welcome phase |
| `components/clarifier/chat-thread.tsx` | Scrollable message list |
| `components/clarifier/chat-message.tsx` | Individual message renderer |
| `components/clarifier/chat-input.tsx` | Bottom input area |
| `components/clarifier/prd-panel.tsx` | Right panel wrapper |
| `components/clarifier/prd-panel-header.tsx` | Title, confidence, action button |
| `components/clarifier/live-prd-document.tsx` | Progressive PRD section renderer |
| `components/clarifier/prd-section.tsx` | Individual section (collapsible + count) |
| `components/clarifier/suggestion-callout.tsx` | Orange suggestion box |
| `components/clarifier/open-questions-section.tsx` | Unanswered gaps display |
| `components/clarifier/escalation-card.tsx` | Extracted escalation UI |
| `components/clarifier/clarifier-graph.tsx` | React Flow DAG visualization |
| `components/clarifier/graph-node.tsx` | Custom React Flow node component |

### Modified Files (4)
| File | Change |
|------|--------|
| `app/(dashboard)/new/page.tsx` | Rewrite: 760 → ~150 lines, orchestrator only |
| `app/api/clarifier/route.ts` | Add intermediate SSE events (prd-draft, gaps) |
| `app/api/clarifier/respond/route.ts` | Upgrade to SSE streaming |
| `app/globals.css` | New animation keyframes |

### Backend Change (1)
| File | Change |
|------|--------|
| `packages/agents-clarifier/src/run.ts` | Add `runClarifierPipelineStream()` using LangGraph `graph.stream()` |

### Existing Components Kept (unchanged)
- `prd-preview.tsx` — still used at completion for approve/reject actions
- `assumption-card.tsx` — reused in PRD panel assumptions section
- `status-bar.tsx` — can be reused if needed

---

## Verification

1. **TypeScript**: `nx run-many -t typecheck` — zero errors
2. **Unit tests**: Test `useClarifierStream` hook with mock SSE stream
3. **Visual verification** (Chrome DevTools MCP):
   - Navigate to `localhost:3000/new`
   - Verify welcome hero renders in full-width (no PRD panel yet)
   - Submit a seed → verify split-panel slides in, chat shows tool results
   - Verify PRD sections appear progressively on the right
   - Check suggestion callouts render for high-risk assumptions
   - Check confidence score updates
   - Answer questions → verify chat thread + PRD panel both update
   - Resize handle works, persists to localStorage
   - Test mobile viewport (375px) → tab switcher appears
4. **E2E**: Add `e2e/clarifier-prd-builder.spec.ts` testing the full flow
5. **Lint**: `nx run-many -t lint` — zero errors

---

## Phase 8: Visual Polish — `/improvise-ux` Against ChatPRD Reference

After functional implementation is complete, run `/improvise-ux` to polish the new components against the ChatPRD reference (https://www.chatprd.ai/). The skill will:

1. Capture baseline screenshots of the implemented split-panel
2. Deep-study the ChatPRD reference in matching color scheme
3. Audit design tokens — identify gaps between CHIP tokens and what ChatPRD achieves
4. Compute target contrast values (WCAG ratios for text, lightness deltas for surfaces)
5. Extend tokens additively (never modify existing) for any new surface/accent needs
6. Verify every interactive state (hover, focus, active, disabled) and both color schemes
7. Polish specifics: suggestion callout styling, tool result cards, chat bubbles, PRD section typography, confidence indicators, resize handle feel, panel entrance animation

Key areas for `/improvise-ux` polish:
- **Suggestion callouts**: Match ChatPRD's orange callout boxes precisely (border weight, bg opacity, label typography)
- **Tool result cards**: The "Notion: search_pages → Completed → Found 4 relevant docs" pattern — icon sizing, badge colors, result text styling
- **PRD document typography**: Section heading hierarchy, paragraph spacing, list indentation
- **Confidence/scoring badges**: Number display, color gradient, micro-animation
- **Chat bubble alignment**: User vs agent message visual weight, avatar sizing, timestamp placement
- **Panel transitions**: Slide-in timing curve, resize handle hover feedback, section appear stagger

---

## Key Design Decisions

1. **New `LivePrdDocument` vs evolving `PrdPreview`**: PrdPreview is a compact approval card (142 lines). The live document is fundamentally different — progressive, multi-section, with callouts. Both coexist: live doc during building, PrdPreview actions at completion.

2. **LangGraph `streamEvents` for per-node streaming** (challenge report resolution): Use LangGraph's native `graph.stream()` API instead of a custom `onNodeComplete` callback. Aligns with vision Layer 1. The API route consumes the async iterable and emits SSE events per node completion. Keep the blocking `runClarifierPipeline` for CLI use.

3. **Suggestions sourced from existing data**: No new LLM calls needed. Suggestions come from `assumptions.requiresConfirmation`, incomplete gaps, and low-confidence sections — all already computed by the pipeline.

4. **Scoring from existing confidence**: The pipeline already computes overall confidence (0-1) and per-assumption confidence. Section completeness is derived by checking which PRD arrays have data.

5. **React Flow graph as right-panel view** (challenge report resolution): The graph is a toggle alongside the PRD document, not a separate page. It provides pipeline debugging visibility during execution and fulfills UX Overhaul Phase 3.3. Default to Document when PRD data exists, Graph when pipeline is running with no PRD yet.

6. **Parent plan alignment**: This plan implements and extends CHIP UX Overhaul Phase 3. After implementation, update `docs/plans/active/chip-ux-overhaul/execution-plan.md` Phase 3 to reflect the expanded scope (split-panel PRD + three-way toggle + streamEvents).
