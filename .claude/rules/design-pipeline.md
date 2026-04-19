---
paths: ["packages/agents-ux/**", "packages/designspec-renderer/**", "packages/cli/src/commands/design-*", "apps/*/agentforge/designs/**"]
---

# Design Pipeline Change Checklist (MANDATORY)
`docs/design-pipeline-dataflow.md` is the **source of truth** for the end-to-end
design pipeline architecture. When modifying ANY of the following, you MUST update
the corresponding section in that document:

1. **Stage 0 (init)** — wizard questions, manifest shape, design options generation,
   component library/catalog logic, output files
   - Files: `packages/cli/src/commands/init.ts`, `generate-design-options.ts`,
     `design-system.ts`, `packages/core/src/catalogs/`
2. **Stage 1 (design:generate)** — app spec generation (pages/models/api), LLM
   prompts, output types, file writing
   - Files: `packages/cli/src/commands/design-generate.ts`
3. **Stage 2 (Research Agent)** — input/output types, LLM config, event wiring
   - Files: `packages/agents-ux/src/ux-research/`
4. **Stage 3 (Planning Agent)** — component tree, token bindings, validation loop,
   responsive rules
   - Files: `packages/agents-ux/src/ux-planning/`
5. **Stage 4 (Design Agent / Penpot)** — 3-phase pipeline (LLM → Execute →
   Self-correct), MCP tool usage, script generation
   - Files: `packages/agents-ux/src/ux-design/ux-penpot-design.ts`
6. **Stage 5 (Design Evaluator)** — evaluation dimensions, scoring, vision LLM config
   - Files: `packages/agents-ux/src/ux-design/design-evaluator.ts`
7. **Stage 6 (Feedback Loop)** — interactive commands, collaboration session,
   Penpot/Figma adapters
   - Files: `packages/agents-ux/src/ux-design/design-feedback-loop.ts`,
     `penpot-collaboration.ts`, `design-collaboration.ts`
8. **Stage 7 (Implementation Agent)** — input/output types, streaming config,
   generated file structure
   - Files: `packages/agents-ux/src/ux-implementation/`
9. **CLI Orchestration** — `design:penpot` options, execution flow, caching
   - Files: `packages/cli/src/commands/design-penpot.ts`
10. **Cross-cutting** — event flow, LLM model/token/temp changes, budget/governance
    changes, new file artifacts

What to update:
- ASCII diagrams if the flow changes
- Input/output type tables if fields are added/removed
- LLM usage table if model, tokens, or temperature change
- File artifacts map if new files are generated or paths change
- Event flow if events are added, renamed, or reordered
- Budget/governance table if HITL policy or budget limits change

A pipeline change without a doc update is **incomplete work** — treat it the same
as a missing test.

# DesignSpec Renderer Change Checklist (MANDATORY)
When modifying `packages/designspec-renderer/`, especially Penpot component
renderers in `src/renderer/penpot/components/`, follow these rules:

**Before implementing a component renderer:**
1. Read `docs/lessons-learned.md` section "Penpot Plugin API Rules"
2. Find a real generated Penpot script in any project's
   `.agentforge/previews/*/scripts/design.js` and locate the component
   you're implementing. Note the exact API calls, parameter formats,
   nesting structure, and numeric value ranges.
3. If no generated script exists yet, use the Penpot MCP tools
   (`penpot:high_level_overview`, `penpot:penpot_api_info`) to verify
   API contracts.

**Penpot plugin API hard rules (violations produce silent visual bugs):**
- `penpot.createBoard()` for ALL shapes. NEVER `createRectangle()` or
  `createEllipse()` — they don't support flex `layoutChild` properties.
- `board.flex.dir = 'column'` — set via the board's `.flex` property.
  NEVER via the returned flex object (silently fails).
- `appendChild(child)` MUST come BEFORE any `child.layoutChild.*` assignments.
- Shadow r/g/b: Penpot uses **0-1 floats**. CSS rgba uses 0-255 integers.
  Always divide by 255.
- Font weight: pass as **string** (`'700'`), not number.
- Root page board: explicitly set `x = 0; y = 0;` after creation.
- Divider fill opacity: `0.3` (not 1.0). Helper text opacity: `0.7`.
- Text > 18 chars: apply `growType = 'auto-height'` with
  `resize(wrapWidth, fontSize * 2.2)`.

**After implementing, verify with these greps:**
```bash
# Must return 0 results:
grep -r 'createRectangle\|createEllipse' packages/designspec-renderer/src/renderer/penpot/components/
# Must return 0 results (shadow RGB should be 0-1 floats):
grep -rn 'r: [0-9]\{2,\}' packages/designspec-renderer/src/renderer/penpot/components/shared.ts
```

**When delegating to subagents:** Include the Penpot API hard rules above
in the agent prompt. Subagents do not read CLAUDE.md or lessons-learned.md
automatically.

# Design Output Verification (MANDATORY)
After generating, modifying, or correcting a design JSON in
`apps/<project>/agentforge/designs/`, run the verification skill:

```bash
npx tsx packages/designspec-renderer/src/renderer/browser/verify-design-render.ts apps/<project> <page>
```

Or invoke `/verify-design-render <project>/<page>`.

**Pass criteria — all must hold before declaring done:**
- 0 CSS failures (FAIL)
- 0 dropped overrides (DROP)
- 0 behavioral failures (DATA-FAIL)

**When DATA-FAIL items appear:**
- `aria-label` / `role` missing → accessibility bug in the renderer, not the
  spec. The renderer must apply these as HTML attributes, not CSS properties.
  Fix in `DesignSpecRenderer.tsx` or file as a tracked issue.
- `brand_name` / `initials` / `caption` missing → the catalog component is not
  consuming the override. Fix in the relevant `renderXxx()` function.

**This applies to:**
- LLM-generated designs (design:generate, design:page pipeline)
- Correction pipeline output (browser-correction-pipeline)
- Manual spec edits
- Renderer changes that could affect how existing specs render
