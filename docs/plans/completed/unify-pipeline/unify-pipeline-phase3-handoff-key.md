# Unify Pipeline Phase 3 — Answer Key

## Turn 2: Answer key

1. Phase 0, 0.5, 0.6, 1, 2 are **complete**. Phase 3 is **complete** (all tasks 3.0–3.6 done 2026-04-25). Phase 4 (**not started**, independent of Phases 1-3) and Phase 5 (**not started**, depends on 2.1 and 3.2) remain. Cite: `docs/active-plan/unify-pipeline/execution-plan.md` → Progress Checklist.

2. `PREVIEW_DIR_REL` now points to **`agentforge/designs`**. Before Task 3.0 it was **`.agentforge/previews`**. Cite: `packages/core/src/constants.ts`.

3. **1 LLM call** via **`BrowserFeedbackAdapter`** (specifically `reviewDesign(spec, chatMessage)`). Cite: `packages/dashboard/src/app/api/pages/[pageId]/design/chat/route.ts`.

4. Direct import and instantiation of **`BrowserFeedbackAdapter`** from **`@agentforge/agents-ux`**. Tags converted to a feedback message string, adapter calls `reviewDesign()`, patch applied via `applyPatch()`. Cite: `packages/dashboard/src/app/api/pages/[pageId]/design/correct/route.ts`.

5. Lives at **`packages/dashboard/src/app/api/_lib/dashboard-sink.ts`**. Implements **`PipelineTelemetrySink`** from `@agentforge/agents-ux`. Capitalizes stage names via **`capitalize()`** — `s.charAt(0).toUpperCase() + s.slice(1)`. Cite: `packages/dashboard/src/app/api/_lib/dashboard-sink.ts` → lines 27, 37.

6. **`callPipelineStage`**, **`callClaudeDesignAPI`**, **`buildDesignSpecSystemPrompt`**. Cite: `docs/active-plan/unify-pipeline/execution-plan.md` → Task 3.2.

7. **`packages/dashboard/src/app/api/_lib/shallow-wrappers.ts`**. Cite: Phase 3 plan at `~/.claude/plans/robust-popping-treasure.md` → Task 3.2.

8. **Skips them** — `if (entry.name.startsWith('__')) continue;` at line 50. Added because after artifact consolidation to `agentforge/designs/`, the `__shared-chrome__` directory was scanned as a regular screen and polluted `prototype.json` with a pseudo-screen entry. Cite: `packages/agents-ux/src/prototype/build-manifest.ts` → line 50; `docs/lessons-learned.md` → "Pseudo-Screen Directories Must Be Filtered at Build Time".

9. **No.** Pseudo-screens must be filtered at **build time** in `buildPrototypeManifest`, not at runtime. Runtime filters are defense-in-depth. Static fixtures committed to git must reflect filtered output. Cite: `docs/lessons-learned.md` → "Pseudo-Screen Directories Must Be Filtered at Build Time".

10. **`../../_lib/project-reader`** (two levels up from `__tests__/` → `pages/` → `api/` → `_lib/`). Not `../../../../_lib/` (which is the route file's import path). Cite: `packages/dashboard/src/app/api/pages/__tests__/chat-route.test.ts` → mock declarations.

11. **`nx run-many -t typecheck`**, **`nx run-many -t test`**, **`nx run-many -t lint`**. Cite: `CLAUDE.md` → "Full Ownership of All Tests".

12. Phase 4 (Task 4.1 — unify `design:generate` and `spec/generate`) is **independent** — can start anytime, **not blocked** by Phases 1-3. Phase 5 (Tasks 5.1, 5.2 — parity test green, ADRs, docs, cleanup) **depends on** Tasks 2.1 and 3.2 (both complete). Cite: `docs/active-plan/unify-pipeline/execution-plan.md` → Dependency Graph, Phase 4, Phase 5.
