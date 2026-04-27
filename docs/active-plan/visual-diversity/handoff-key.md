# Visual Diversity — Handoff Answer Key (Phase 2.6+ continuation)

Read ONLY after answering all questions in `handoff-check.md`.

## Turn 2: Authoritative Answers

**Q1.** The 4 migrated fields are **`active`**, **`textAlign`**, **`helper`**, **`title`**. After migration, NodeSpec has **19 of 24** optional fields = **5 slots of headroom**. Cite: `execution-plan.md` → Phase 1 Progress Checklist; `design-spec-v2.ts:48` → budget comment.

**Q2.** **`ResolvedNode`** (in `packages/designspec-renderer/src/types/catalog.ts:129`) and **`TreeNode`** (in `catalog.ts:186`). They were kept because they are **internal renderer types** — renderers read from them unchanged. Only the **LLM-facing** `NodeSpec` type and `submit_design` tool schema had the fields removed. Cite: `execution-plan.md` → "Context for implementers" → "`ResolvedNode` and `TreeNode` KEEP...".

**Q3.** Five treatments: **elevated** (shadow + radius), **outlined** (border + radius, no shadow), **flat** (background only), **inset** (background + border), **separated** (bottom border only). Prompt rule: **"A page with 3+ content sections MUST use at least 2 different treatments."** Cite: `ux-penpot-designspec-v2.md` → "Container Treatment Patterns" section.

**Q4.** **`ux-penpot-design-system.md`** — loaded by the old Penpot MCP pipeline (`ux-penpot-design.ts:144`). **`ux-penpot-designspec-v2.md`** — loaded by the active DesignSpec v2 pipeline (`browser-design-work.ts:37`). Phase 2.3 updated **`ux-penpot-design-system.md`** (the old one). Cite: `execution-plan.md` → "Context for implementers" → first bullet.

**Q5.** The deleted file was **`ux-design-system.md`** (the dead Figma prompt, 51KB). The removed function was **`loadDesignSystemPrompt`** from `design-system-context.ts:218`. Also removed from re-exports in `design-collaboration.ts` and `index.ts` barrel. Cite: `execution-plan.md` → Phase 2 Task 2.5.

**Q6.** Next task is **Phase 2.6**: "Visual verification: run `design:page:all` on fitness fixture, screenshot, confirm mixed treatments." It requires **LLM API calls** (running the actual design pipeline), which Phases 1-2 did not need (they were code migration + prompt editing). Cite: `execution-plan.md` → Phase 2 Progress Checklist.

**Q7.** **No** — the comments were already updated in **Task 1.5** to say **"19 of 24"**. Both `design-spec-v2.ts:48` and `submit-design-tool.ts:9` now have the correct count. Cite: `execution-plan.md` → Phase 1 Task 1.5 (marked complete 2026-04-27).

**Q8.** Title is rendered in **`renderAlertNode`** at `DesignSpecRenderer.tsx:1191` via `node.label ?? node.title ?? ''`. E2E tests should use **`catalog: "alert"`** with a `label` field to verify title rendering — NOT `type: "section"`, because the section accelerator renders `{children}` only. Cite: `execution-plan.md` → "Context for implementers" → "Section accelerator does NOT render `title`."

**Q9.** Three node map paths: (1) **`data.nodes`** (design spec files like `dashboard.json`), (2) **`data.spec.nodes`** (some wrapped formats), (3) **`data.designSpec.nodes`** (penpot-design.json files). Cite: `execution-plan.md` → "Context for implementers" → "Penpot-design.json has structure `designSpec.nodes`."

**Q10.** The resolver checks **`overrides.textAlign`** (camelCase) and **`overrides.text_align`** (snake_case) at `resolver.ts:172`. Both are checked because **LLMs emit both forms** — the correction adapter and LLM output can use either convention. Cite: `execution-plan.md` → "Context for implementers" → "`text_align` alias."

**Q11.** Three files: **`ux-penpot-designspec-v2.md`**, **`ux-penpot-design-system.md`**, **`ux-planning-system.md`**. All set to version **`2.1.0`**. Cite: frontmatter of each file.

**Q12.** Remaining incomplete in Phase 2: **Task 2.6** (visual verification with LLM pipeline run) and **Task 2.7** (E2E test `e2e/container-variety.spec.ts`). Next phase is **Phase 3 — Catalog Variants** (add card/section variants to `base-component-catalog.yaml`). Cite: `execution-plan.md` → Phase 2 + Phase 3 Progress Checklists.
