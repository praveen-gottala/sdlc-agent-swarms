# Answer Key — ChatPRD Split-Panel PRD Builder Handoff

## Turn 2 — Authoritative answers

### Q1: Streaming API method
**LangGraph native `graph.stream()`** with **`streamMode: 'updates'`**. NOT a custom callback.
- Cite: `docs/plans/active/chatprd-split-panel/execution-plan.md` → Phase 1 progress, Task 1.2
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, §3.1

### Q2: PRD section delivery
**Entire PRD arrives at once** in a single LLM call. The `prdAnalyzer` node uses **`claude-opus-4-6`** with **forced-JSON `responseSchema`**. There is no section-by-section streaming.
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, "Context for implementers" Gotcha 2
- Cite: `docs/plans/active/chatprd-split-panel/execution-plan.md` → Challenge report resolutions, item 3

### Q3: HITL interrupt detection
The stream does **NOT emit** any special event for interrupts. After the stream ends, you must call **`compiled.getState(config)`** and check **`next.length > 0`**.
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, "Context for implementers" Gotcha 3

### Q4: Jest/SWC polyfills
Three globals needed: **`TextEncoder`** and **`TextDecoder`** from **`node:util`**, **`ReadableStream`** from **`node:stream/web`**.
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, "Context for implementers" Gotcha 4

### Q5: Two pipeline runner functions
1. **`runClarifierPipeline`** — blocking, returns `Promise<Result<ClarifierOutput, ClarifierError>>`. Used by **CLI**.
2. **`runClarifierPipelineStream`** — async generator, yields `ClarifierStreamEvent`. Used by **dashboard API route**.
- Cite: `packages/agents-clarifier/src/run.ts`, `packages/agents-clarifier/src/index.ts` (exports both)

### Q6: Respond route status
**NOT upgraded yet** — still returns JSON. The `useClarifierStream` hook checks `content-type` header: if **`text/event-stream`** → SSE parsing, otherwise → **`res.json()`**.
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, §3.8 "NOT STARTED"
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, "Context for implementers" Gotcha 5

### Q7: PRD panel resize config
- File: **`packages/dashboard/src/components/clarifier/split-panel-layout.tsx`**
- Storage key: **`chip-prd-panel-width`**
- Min: **320px**, Max: **640px**, Default: **480px**
- Cite: `docs/plans/active/chatprd-split-panel/execution-plan.md` → Phase 2, Task 2.2

### Q8: When PRD panel appears
When **`prdDraft` data first arrives** (not at page load, not at seed submission). The page has a `useEffect` that sets `prdPanelVisible = true` when `clarifier.prdDraft` becomes non-null.
- Cite: `docs/plans/active/chatprd-split-panel/execution-plan.md` → Phase 5, Task 5.1 code snippet
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, §3.2 "PRD panel slides in from right when prdDraft first arrives"

### Q9: React Flow graph status
**NOT STARTED**. Planned in Phase 3.3 / Phase 6. Will add `@xyflow/react` + `dagre`, create `clarifier-graph.tsx`, and add a `Document | Graph` toggle via Mantine `SegmentedControl`.
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, §3.3 "NOT STARTED"
- Cite: `docs/plans/active/chatprd-split-panel/execution-plan.md` → Phase 6

### Q10: Progressive rendering animation
**Staggered `animationDelay`** (100ms between sections) using `fadeSlideUp` CSS animation on each `PrdSection` component. All data arrives from one LLM call; the animation creates the progressive *appearance*.
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, §3.5 "staggered fadeSlideUp animation (100ms between sections)"
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, "Context for implementers" Gotcha 2

### Q11: TRAP — onNodeEnter/onNodeExit callbacks
**No.** The original plan (§3.1 pre-update) mentioned `onNodeEnter`/`onNodeExit` callbacks, but this was **superseded** by the challenge report resolution. The implementation uses **LangGraph native `graph.stream()`** instead. Adding custom callbacks would fight the framework (vision Layer 1).
- Cite: `docs/plans/active/chatprd-split-panel/execution-plan.md` → Challenge report resolutions, item 1
- Cite: `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 3, §3.1 "using LangGraph native graph.stream()"

### Q12: Three canonical documents in reading order
1. **`docs/vision.md`** — architectural vision
2. **`docs/specs/PRD.md`** — product spec
3. **`CLAUDE.md`** — development discipline rules
- Cite: `CLAUDE.md` → §"Reading order (IMPORTANT)"
