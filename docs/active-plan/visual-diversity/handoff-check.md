# Visual Diversity — Handoff Check (Phase 2.6+ continuation)

Read the canonical docs before answering. Do NOT guess from filenames or training data.

## Turn 1: Answer these questions

1. Phase 1 migrated 4 fields from NodeSpec to overrides. Name all 4 fields and the number of optional fields remaining on NodeSpec after migration.

2. The renderer has two internal types that STILL have `textAlign`, `helper`, and `title` as fields even after Phase 1. Name both types and explain why they were kept.

3. Name the 5 container treatment patterns introduced in Phase 2 and the prompt rule about minimum variety per page.

4. There are TWO Penpot prompts. Name both filenames and which pipeline loads each. Which one was updated in Phase 2.3?

5. A dead Figma prompt was deleted in Phase 2.5. What was the filename, and what function in `design-system-context.ts` was removed alongside it?

6. What is the next task in the execution plan (Phase 2.6)? What does it require that wasn't needed for Phases 1-2?

7. (Trap question) Should you update the field budget comments in `design-spec-v2.ts` and `submit-design-tool.ts`? They currently say "21 of 24."

8. The section accelerator in `DesignSpecRenderer.tsx` does NOT render the `title` field visually. Where IS title rendered, and what test pattern should you use to verify title rendering in E2E tests?

9. When writing a backfill script for fixture JSON files, you must handle 3 different node map paths. Name all 3.

10. The resolver checks TWO key names for textAlign on the catalog resolution path. Name both and explain why.

11. Name the 3 prompt files that received version frontmatter, and what version they were set to.

12. (Coverage probe) What are the remaining incomplete tasks in Phase 2, and what Phase comes next? Cite the execution plan.

## Turn 3: Copy back

After self-grading, copy the `## Doc gaps to report upstream` section from your grading back here.

## Hard-fail triggers

- Agent claims NodeSpec still has `textAlign`, `helper`, or `title` fields → FAIL
- Agent claims `ux-design-system.md` still exists or is active → FAIL
- Agent doesn't know about container treatment patterns → FAIL
- Agent says field budget is "21 of 24" → FAIL (it's 19 of 24)

## Soft-fail triggers

- Agent can't name all 5 container treatments
- Agent doesn't know about the `text_align` alias in the resolver
- Agent misses that penpot-design.json uses `designSpec.nodes`

## Maintenance

If the execution plan changes, update the answer key at:
`docs/active-plan/visual-diversity/handoff-key.md`

Answer key: `docs/active-plan/visual-diversity/handoff-key.md`
