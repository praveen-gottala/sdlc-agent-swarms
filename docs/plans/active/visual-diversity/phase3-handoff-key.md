# Phase 3 Handoff Key — Visual Diversity

## Turn 2: Answer Key

1. **Task 3.3** — fix prompt contradictions in **`ux-penpot-designspec-v2.md`** and **`ux-penpot-design-system.md`**. Remove **line 48** decomposition instruction, update **lines 30-37** accelerator type docs, update **working examples** (lines 186-195) to use `catalog: "Section"`.
   - Cite: `docs/plans/active/visual-diversity/execution-plan.md` → Phase 3 → task 3.3

2. Three contradictions: (a) **Line 48**: "Modal, Form, Tabs must be decomposed" — contradicts renderable catalog list. (b) **Lines 30-37**: define `section`, `header` as **accelerator types** — LLM uses these instead of catalog entries. (c) **Lines 186-195**: working examples use **`type: "section"`** not `catalog: "Section"` — LLM learns from examples.
   - Cite: `docs/plans/active/visual-diversity/execution-plan.md` → "Verification gap — root cause analysis"

3. **`agentforge/designs/{pageId}.json`** (flat canonical path). Written by **`writeDesignSpec`** from **`@agentforge/core/design-spec-store`** (`packages/core/src/design-spec-store.ts`). Called from `saveCachedArtifact` in `packages/agents-ux/src/design-pipeline/cache.ts`.
   - Cite: `docs/architecture/prototype-rendering-dataflow.md` → §2, `execution-plan.md` → Context for implementers → DesignSpecStore

4. **`--design-only`** flag. It loads cached spec but **doesn't call `saveCachedArtifact`** because the design stage is skipped ("Loaded cached designSpecV2 — skipping design"). Only a **full LLM run** triggers the store write.
   - Cite: `docs/plans/active/visual-diversity/execution-plan.md` → Context for implementers → "`--design-only` does NOT trigger the flat-file write"

5. **59** catalog IDs. Injected at **`browser-design-work.ts:136-142`** via `{{RENDERABLE_CATALOG_IDS}}` template replacement.
   - Cite: `execution-plan.md` → Context for implementers → "59 renderable catalog IDs"

6. **Task 3.5** — Pipeline verification gate (NOT DEFERRABLE). Four checks: (a) **Catalog adoption** — parse generated specs, at least **8 of 16** new types must appear. (b) **Renderer exercised** — visually confirm in browser via Chrome DevTools MCP. (c) **No regressions** — full E2E suite passes. (d) **Document results** — record which types adopted vs. which still use accelerators.
   - Cite: `execution-plan.md` → Phase 3 → task 3.5

7. Should use **`catalog: "Section"`** with **`label: "Profile Information"`** for heading instead of `type: "section"` + separate text child. Because catalog entries have **dedicated renderers** with semantic HTML (`<section role="region">`), ARIA attributes, and heading anatomy. Accelerators render as plain `<div>`.
   - Cite: `execution-plan.md` → task 3.3 bullet "Update working examples"

8. **`DesignSpecStore`** — shared read/write/exists/backup/revert functions in **`packages/core/src/design-spec-store.ts`**. Dashboard routes using it: **spec route** (`spec/route.ts`), **correct route** (`correct/route.ts`), **revert route** (`revert/route.ts`), **chat route** (`chat/route.ts`), **pages route** (`pages/route.ts`), **audit route** (`audit/route.ts`), **design route** (`design/route.ts`).
   - Cite: `execution-plan.md` → P.9

9. **NO.** This instruction is **wrong** — it was written before these components had dedicated renderers. Modal, Form, Tabs are now in the renderable catalog list with dedicated renderers in `DesignSpecRenderer.tsx`. Task 3.3 removes this instruction.
   - Cite: `execution-plan.md` → "Verification gap — root cause analysis" → contradiction #1

10. **`docs/vision.md`** → **`docs/specs/PRD.md`** → **`CLAUDE.md`** (this file). Conflict hierarchy: CLAUDE.md security/test rules > vision.md > ADRs > PRD.md > codebase.
    - Cite: `CLAUDE.md` → "Reading order (IMPORTANT)"

11. **16** dedicated catalog renderers. Layout-category: **Section** (`<section role="region">`), **PageHeader** (`<div role="banner">`), **Footer** (`<footer role="contentinfo">`), **Sidebar** (`<aside><nav>`).
    - Cite: `execution-plan.md` → P.1

12. **Synthetic fixture injection** — write a DesignSpec JSON to PET's `agentforge/designs/`, add a temp page to `pages.yaml`, clean up in `afterAll`. Test file: **`e2e/layout-catalog-renderers.spec.ts`** (6 tests) or **`e2e/catalog-renderers-full.spec.ts`** (13 tests). Assertions: tag name, ARIA role, computed CSS via `getComputedStyle`, screenshots.
    - Cite: `execution-plan.md` → P.8, `e2e/container-variety.spec.ts` (reference pattern)
