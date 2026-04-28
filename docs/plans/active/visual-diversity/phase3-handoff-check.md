# Phase 3 Handoff Check — Visual Diversity

## Turn 1: Answer these questions using ONLY the project's canonical docs

Start from `CLAUDE.md` and follow its reading order. Cite the exact file and section for each answer. Do NOT guess from filenames or training data.

1. What is the next task in the Visual Diversity execution plan, and what specific file changes does it require?

2. The design prompt `ux-penpot-designspec-v2.md` has 3 contradictory instructions that prevent the LLM from using catalog entries. Name all 3 with their line numbers.

3. Where does the CLI pipeline write the canonical design spec file that the dashboard reads? What module handles this write? (Name the store module and the function.)

4. What flag on `design:page:all` skips LLM calls but does NOT trigger the canonical flat-file write? Why?

5. How many catalog IDs are in the renderable list, and where is that list injected into the prompt? (File + line.)

6. After Phase 3.3 prompt changes, what is the mandatory verification gate? What are its 4 specific checks?

7. The working example in the design prompt (lines 186-195) uses `type: "section"` for content sections. After 3.3, what should it use instead, and why?

8. What is `DesignSpecStore` and where does it live? Name 3 dashboard API routes that use it.

9. TRAP QUESTION: Should you follow the decomposition instruction at line 48 of `ux-penpot-designspec-v2.md` that says "Modal, Form, Tabs must be decomposed into structural nodes"?

10. Name the 3 canonical docs you must read before making any architectural decision, in the order `CLAUDE.md` prescribes.

11. How many dedicated catalog renderers were added to `DesignSpecRenderer.tsx`? Name 4 of the layout-category components.

12. What E2E test pattern verifies catalog renderers? Name one of the test files and describe its fixture approach.

## Turn 3: Report doc gaps

Copy this section back with any gaps you found:

## Doc gaps to report upstream
- (list gaps here, or "none found")

## Hard-fail triggers
- Agent cannot find the execution plan
- Agent follows the superseded decomposition instruction (line 48)
- Agent cites `.agentforge/previews/` as the canonical path (this was stale — fixed 2026-04-28)

## Soft-fail triggers
- Agent misses one of the 3 prompt contradictions
- Agent can't name the verification gate checks

## Maintenance
When `ux-penpot-designspec-v2.md` is updated for Phase 3.3, update the answer key line numbers accordingly.

Answer key: `docs/plans/active/visual-diversity/phase3-handoff-key.md`
