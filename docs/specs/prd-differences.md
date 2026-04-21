# PRD Differences: PRD-v2.md vs PRD-revised.md

This document summarizes all changes between the previous PRD (`docs/PRD-v2.md`) and the revised PRD (`docs/PRD-revised.md`).

---

## 1. Catalog-Constrained Generation (Section 4.2)

**Location:** Line 137

**Previous:**
> LLMs generate UI by referencing components from a declared catalog injected into the prompt, not by inventing arbitrary markup.

**Revised:**
> LLMs generate UI by referencing components from a declared catalog injected into the prompt, **with structural output guaranteed by the LLM provider's `responseSchema`**. **Hallucinated references that slip through are silently corrected via fuzzy-match to the nearest valid component — zero retries, zero wasted LLM calls.**

**Impact:** Adds two concrete mechanisms for catalog enforcement:
- `responseSchema` from the LLM provider for structural validation
- Fuzzy-match fallback for hallucinated component references (instead of rejection)

---

## 2. Planning Agent — Few-Shot Screenshot Examples (Section 11.1.1)

**Location:** Line 531

**Previous:**
> Planning Agent: Produces a component tree with layout rules (flexbox), design token bindings, responsive breakpoints, and component-to-library mappings.

**Revised:**
> Planning Agent: Produces a component tree with layout rules (flexbox), design token bindings, responsive breakpoints, and component-to-library mappings. **The Planning Agent's prompt includes screenshot examples of well-structured reference UIs** that teach compositional patterns — how badges sit inside wrapper cells rather than spanning column widths, how popovers overlay content rather than flowing inline, how two-column layouts allocate fixed vs flexible widths. These examples guide structural decisions; the Planning Agent decides WHAT the layout should be.

**Impact:** Introduces few-shot visual examples in the Planning Agent's prompt to improve layout structure quality. The Planning Agent now receives reference screenshots showing correct compositional patterns.

---

## 3. Design Agent — JSON Syntax Examples (Section 11.1.1)

**Location:** Line 533

**Previous:**
> The spec streams progressively, enabling real-time preview as nodes are generated.

**Revised:**
> **The Design Agent's prompt includes JSON syntax examples** that teach correct DesignSpec patterns — how to express flex rows with `justify: "space-between"`, how to reference design tokens by name (not hex), how to use `width: "fill"` for flexible containers. These examples guide translation accuracy; the Design Agent decides HOW to express the plan as JSON. The spec streams progressively, enabling real-time preview as nodes are generated.

**Impact:** Introduces few-shot JSON examples in the Design Agent's prompt to improve DesignSpec JSON accuracy. Separates concerns: Planning Agent uses visual examples (WHAT), Design Agent uses JSON examples (HOW).

---

## 4. Browser Renderer — Real shadcn/ui Components (Section 11.1.1)

**Location:** Line 535

**Previous:**
> Browser Renderer: Converts DesignSpec JSON to HTML/CSS, renders via Playwright (headless Chromium), produces pixel-perfect screenshot. No correction loop — the browser renders flexbox with 100% fidelity.

**Revised:**
> Browser Renderer: Converts DesignSpec JSON to **real shadcn/ui components via a Vite+React app**, renders via Playwright (headless Chromium), produces pixel-perfect screenshot. The browser renders flexbox with 100% fidelity because the browser IS the flexbox standard.

**Impact:**
- Renderer now uses **real shadcn/ui React components** instead of plain HTML/CSS
- Uses a **Vite+React app** as the rendering host
- Removes the "No correction loop" statement (correction pipeline is now added)

---

## 5. New: Design Correction Pipeline (Section 11.1.1)

**Location:** After Browser Renderer step (new content)

**Previous:** Pipeline went directly from browser render to user approval.

**Revised:** Adds a new pipeline step between browser render and user approval:
> Design Correction Pipeline: After browser render, the correction pipeline detects and fixes layout issues through DOM extraction, mechanical auto-fixes, interactive user feedback, and vision model assistance.

**Impact:** The approval flow changes from:
- **Before:** Browser Render → User Approval
- **After:** Browser Render → Correction Pipeline → User Approval (of "final" screenshot)

---

## 6. Section 11.1.2 Completely Rewritten: Verification → Correction Architecture

**Location:** Lines 541-585 (revised)

### Previous: "Design Verification Architecture"
Three verification layers:
1. **Layer 1 (Layout):** Browser renders HTML/CSS, Playwright extracts computed positions. Deterministic, zero LLM cost.
2. **Layer 2 (Interaction):** Prototype renderer wires click handlers, Playwright clicks through flows.
3. **Layer 3 (Visual quality):** Optional vision model evaluation for aesthetic scoring. Advisory only.

### Revised: "Design Correction Architecture"
Three-phase rollout plan with active correction (not just verification):

**Phase A: Standalone Correction**
1. **DOM Extraction:** Playwright extracts computed layout via `getBoundingClientRect()` and `getComputedStyle()`. Elements carry `data-node` attributes mapping to DesignSpec node IDs.
2. **Mechanical Auto-Fixes:** Rule-based checks against computed DOM data (not JSON). Zero LLM cost. Checks: overlapping siblings, child exceeding parent bounds, zero-height nodes, text overflow, oversized badges. Applies deterministic fixes with **monotonic improvement guard** (patches only accepted if issue count decreases).
3. **Interactive User Preview:** Browser render served as interactive preview with hover highlights and node metadata. Users click elements to tag issues with natural language feedback, producing structured `{nodeId, feedback}` tuples.
4. **Vision-Assisted Correction:** User tags + screenshot + DOM data + DesignSpec JSON sent together to a vision LLM. Maximum 3 correction iterations with monotonic improvement guard. Cost: ~$0.06/iteration, max $0.18/screen.

**Phase B: Integration with existing pipeline**
- Penpot self-evaluation loop runs first (improving JSON from ~32/100 to ~65/100)
- Then browser-based correction pipeline runs on top
- Pipeline: LLM → JSON → Penpot self-correction → Browser render → DOM extraction → mechanical fixes → interactive preview → vision-assisted correction → user approval

**Phase C: Browser-only pipeline**
- Penpot self-evaluation loop removed from critical path
- Pipeline: LLM → JSON → Browser render → DOM extraction → mechanical fixes → interactive preview → vision-assisted correction → user approval
- Quality target: first-pass ~70/100, corrections reaching ~85-90/100

**Impact:** This is the largest change in the revised PRD. The previous "verification" approach was passive (detect and report). The new "correction" approach is active (detect, fix mechanically, let user tag issues, use vision model to fix). Key new concepts:
- Interactive user preview with element-level feedback
- Combined context correction (screenshot + DOM + user tags)
- Three-phase rollout strategy (standalone → integrated → browser-only)
- Monotonic improvement guard
- Cost estimates per correction cycle

### Implementation reference change
**Previous:** `docs/design-verification-architecture.md`
**Revised:** `docs/design-correction-architecture.md`

---

## 7. Section Renumbering (11.1.3 → 11.1.3)

The "Design-to-Code Contract" section was renumbered from `11.1.3` in the previous PRD to `11.1.3` in the revised PRD (same number, but shifted due to the expanded 11.1.2). The "Design Tool Integration" section shifted from `11.1.4` to `11.1.4`.

**Content of these sections is identical** between both versions.

---

## Summary of Changes

| Area | Type | Significance |
|------|------|-------------|
| Catalog-constrained generation | Enhanced | Added `responseSchema` + fuzzy-match mechanisms |
| Planning Agent prompts | New | Few-shot screenshot examples for compositional patterns |
| Design Agent prompts | New | Few-shot JSON syntax examples for DesignSpec accuracy |
| Browser Renderer | Changed | HTML/CSS → shadcn/ui via Vite+React app |
| Correction Pipeline | New | Active correction replaces passive verification |
| Section 11.1.2 | Rewritten | 3 verification layers → 3-phase correction architecture |
| Interactive User Preview | New | Element-level feedback tagging |
| Vision-Assisted Correction | New | Combined context (screenshot + DOM + tags) correction |
| Phase rollout strategy | New | Phase A/B/C for gradual correction pipeline adoption |

All changes are concentrated in **Section 4.2** (one principle) and **Section 11.1** (design pipeline). Sections 1-10 and 12-31 are **identical** between the two versions.
