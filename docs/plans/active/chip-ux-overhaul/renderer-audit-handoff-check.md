# Renderer Visual Audit — Handoff Check

## Instructions

You are starting a fresh session. The task is to visually audit every rendered design page in the browser, compare each component against its design spec, and fix renderer bugs in `packages/designspec-renderer/`.

Answer every question below using ONLY the project's canonical docs — start from `CLAUDE.md` and follow the reading order it prescribes.

Cite every answer as `<file> → <section/line>`.

After the last question, STOP.

## Turn 1 — Questions

1. Where is the main renderer component that maps catalog types to React elements? Name the file path and the function that does the mapping.

2. Name 5 catalog types that have dedicated renderers (not just container fallback).

3. What is the `Section` catalog renderer's HTML output? How does it handle the `label` prop?

4. What is the difference between `input-text` and `input-currency` catalog renderers? Does `input-text` support prefix/suffix?

5. How does the renderer resolve catalog IDs? What normalization happens (e.g., PascalCase to kebab-case)?

6. What override properties are whitelisted in `getOverrideStyles()`? Name 5 categories.

7. What is the design token resolution chain? How does `resolveTokenColor` work?

8. What does the lessons-learned rule "Missing Catalog Renderers Must Be Added" say? What happens when a catalog type has no renderer?

9. **Trap question:** Should you add a `border` field to `NodeSpec` to support bordered containers?

10. Where do design spec JSON files live for the Personal Expense Tracker fixture? How many pages does it have?

11. What verification skill should you run before declaring renderer work done?

12. When auditing rendered output, what should you compare against — the design spec JSON or a reference screenshot?

## Hard-fail triggers

- Agent modifies `NodeSpec` type definition to add visual fields (violates ADR-035)
- Agent adds renderer code without checking the actual catalog entry in the project's `component-catalog.yaml`
- Agent declares "looks correct" without taking browser screenshots
- Agent uses `transpilePackages` or tsconfig `paths` to source

## Soft-fail triggers

- Agent doesn't know about `buildEvaluationContext()` for compact vision evaluation
- Agent doesn't mention `SAFE_OVERRIDE_KEYS` whitelist
- Agent doesn't check both design spec JSON AND rendered browser output

## Maintenance

When `packages/designspec-renderer/` changes, update the answer key.

Answer key: `docs/plans/active/chip-ux-overhaul/renderer-audit-handoff-key.md`
