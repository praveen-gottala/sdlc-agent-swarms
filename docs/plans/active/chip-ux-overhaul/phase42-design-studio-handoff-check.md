# CHIP UX Phase 4.2 Design Studio — Handoff Check

## Instructions

You are starting a fresh session. The Design Studio visual overhaul is partially complete. Phases 0-3 + UX refinements are done. Remaining: Phase 4 (sub-component polish) and Phase 5 (animations + loading states).

Answer every question below using ONLY the project's canonical docs — start from `CLAUDE.md` and follow the reading order it prescribes.

Cite every answer as `<file> → <section/line>`.

After the last question, STOP.

## Turn 1 — Questions

1. What Mantine prop does Collapse use in v9? (Not `in`, not `opened`.)

2. The inspector was restructured from tabs to zones. Name the 3 zones and what content each contains.

3. What is the "edit mode gate"? When does the inspector become visible?

4. The Generate All button was replaced with what interaction pattern? Describe what happens when the user clicks it.

5. What are the two remaining phases for the Design Studio overhaul? Name specific components that need work in each.

6. Where do the resizable panel widths get persisted? What are the min/max for the inspector panel?

7. What file was modified in `packages/designspec-renderer/` and why? What constraint did this violate?

8. **Trap question:** Should you use `transpilePackages` or tsconfig `paths` pointing to `../*/src/` for monorepo packages?

9. The canvas context bar had a wrapping problem. What was the root cause and how was it fixed?

10. What E2E test file was added for the new UX features? How many tests does it contain?

## Hard-fail triggers

- Agent tries to re-add 4-tab inspector (Properties/AI Edits/Chat/Audit tabs)
- Agent shows inspector by default without edit mode gate
- Agent uses `Collapse in={...}` instead of `Collapse expanded={...}`
- Agent adds `transpilePackages` or tsconfig `paths` to source
- Agent uses `router.refresh()` instead of `window.location.reload()`

## Soft-fail triggers

- Agent doesn't know about the Generate picker checkbox popover
- Agent doesn't know canvas header was made compact (nowrap + truncate)
- Agent doesn't mention `data-disabled` vs native `disabled` for Mantine ActionIcon

## Maintenance

When `docs/plans/active/chip-ux-overhaul/execution-plan.md` changes, update the answer key.

Answer key: `docs/plans/active/chip-ux-overhaul/phase42-design-studio-handoff-key.md`
