# CHIP UX Phase 4.2 Design Studio — Answer Key

## Turn 2 — Answers

1. **`expanded`**. Mantine v9 Collapse uses `expanded: boolean`, not `in` (v6) or `opened`.
   - `docs/lessons-learned-rules.md` → "Next.js 16 + Mantine v9 Compatibility Gotchas" point 8

2. **Properties** (selected node's CSS properties, catalog type, add/remove/revert), **Quality** (merged AI Edits feedback tags + Mechanical/Vision audit results + score/iteration), **Chat** (persistent conversational AI editing, always at bottom with input visible).
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 4.2 implementation

3. The **edit mode gate** hides the inspector panel entirely by default. Inspector becomes visible when: (a) user clicks the pencil/Edit icon in the toolbar, or (b) user clicks a node on the canvas (auto-enters edit mode via `handleNodeClicked`).
   - `packages/dashboard/src/app/(dashboard)/design/page.tsx` → `editMode` state + `handleNodeClicked`

4. Replaced with a **checkbox popover**. Clicking the play icon opens a Mantine `Popover` showing all pages with checkboxes. Undesigned pages are pre-checked; designed pages are unchecked but show "(redesign)" label and can be checked to regenerate. Bottom shows "N selected" + "Generate (N)" button.
   - `packages/dashboard/src/app/(dashboard)/design/page.tsx` → `generatePickerOpen` state + Popover

5. **Phase 4** (sub-component polish): `pipeline-progress.tsx` → Mantine Stepper, `coherence-results-modal.tsx` → Mantine Modal, `navigation-editor.tsx` → Mantine Select/Menu. **Phase 5** (animations + loading states): CSS animations in globals.css, Skeleton loading states replacing "Loading...", Mantine Notifications replacing hand-rolled toast.
   - `docs/plans/active/chip-ux-overhaul/execution-plan.md` → Phase 4.2 "Remaining"

6. **localStorage**. Inspector: key `chip-inspector-width`, min 260px, max 500px, default 300px. Activity aside: key `chip-aside-width`, min 200px, max 480px, default 280px.
   - `packages/dashboard/src/app/(dashboard)/design/page.tsx` → `INSPECTOR_STORAGE_KEY`
   - `packages/dashboard/src/components/layout/dashboard-shell.tsx` → `ASIDE_WIDTH_KEY`

7. **`PrototypeApp.tsx`** — the `ScreenSelectorBar` was modified to use horizontal scroll with truncated names (`maxWidth: 140`, `whiteSpace: 'nowrap'`, `textOverflow: 'ellipsis'`). This technically modified `packages/designspec-renderer/` which was in the original "MUST NOT change" list, but the user explicitly requested the fix for the oversized bottom bar.
   - `packages/designspec-renderer/src/renderer/browser/app/src/PrototypeApp.tsx` → `ScreenSelectorBar`

8. **NO to both.** `transpilePackages` was removed entirely. tsconfig `paths` pointing to `../*/src/` were removed. Dashboard uses pre-built `dist/`. Must `nx run-many -t build` before `npm run dev`.
   - `CLAUDE.md` → "Dashboard Dev Server (IMPORTANT)"

9. The project name ("Personal Expense Tracker") was wrapping to 3 lines because the flex container allowed wrapping and the name had `text-sm` sizing. Fixed by adding `flexWrap: 'nowrap'`, `truncate` class on the name, reducing font to `text-xs`, and adding `flex-shrink` to the name container.
   - `packages/dashboard/src/components/design/design-canvas.tsx` → context bar div

10. **`e2e/design-studio-ux.spec.ts`** with **4 tests**: search filter end-to-end, edit mode gate + toggle, edit disabled guard, generate picker with redesign labels.
    - `e2e/design-studio-ux.spec.ts`
