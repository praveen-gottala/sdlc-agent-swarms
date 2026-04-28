# Visual Diversity in Generated UX Designs — Execution Plan

## Related Documents

- **Vision:** `docs/vision.md` Layer 5 (Clarifier), Layer 7 (Design pipeline)
- **ADR-035:** `docs/adrs/ADR-035-catalog-first-component-model.md` — catalog-first principle (visual quality in catalog, not per-node LLM fields)
- **ADR-037:** `docs/adrs/ADR-037-standalone-renderer-package.md` — renderer package boundary
- **Roadmap:** `docs/roadmap.md` Phase 1 (Clarifier), Phase 4 (cross-screen coherence)
- **Quality vision:** `docs/plans/active/visual-diversity/design-quality-vision.md` — strategic evolution (Tiers 1-5)
- **Design decisions:** `docs/design-decisions.md` Section 9 — research-backed rationale
- **Pipeline dataflow:** `docs/architecture/design-pipeline-dataflow.md`
- **Lessons learned:** `docs/lessons-learned.md` §"NodeSpec Field Budget: Internal Fields Use Type Intersections"

## Context

Generated UX designs lack visual variety — every content section uses the identical treatment (white/cream card + rounded corners + drop shadow). Root causes span six pipeline layers: prompts actively forbid borders, evaluator has no diversity scoring, catalog has no card variants, and domain awareness is zero.

**Key architectural decisions (from challenge report):**
- **No `border` on NodeSpec** — contradicts ADR-035. Use catalog variants + overrides.
- **Clarifier owns domain detection + references** — `vision.md` Layer 5. Design pipeline is a consumer.
- **Effects are catalog entries, not a separate system** — ADR-035's one-catalog principle.
- **Figma prompt (`ux-design-system.md`) is dead code** — active pipeline uses `ux-penpot-designspec-v2.md`.

**Context for implementers:**
- **TWO Penpot prompts exist.** `ux-penpot-design-system.md` is loaded by the old Penpot MCP pipeline (`ux-penpot-design.ts:144`). `ux-penpot-designspec-v2.md` is loaded by the active DesignSpec v2 pipeline (`browser-design-work.ts:37`). Both need container variety updates in Phase 2. The Figma prompt (`ux-design-system.md`) has a function `loadDesignSystemPrompt` in `design-system-context.ts:218` that loads it — but `browser-design-work.ts:33` defines its own local `loadDesignSystemPrompt()` that shadows the export and loads the v2 prompt instead. The exported one is dead code.
- **Borders already render via overrides.** `SAFE_OVERRIDE_KEYS` in `DesignSpecRenderer.tsx:184-186` includes `border`, `borderTop`, etc. No renderer code changes needed for border support — only prompt guidance teaching `overrides: { border: '1px solid ...' }`.
- **"Shadows NOT Borders" in the Penpot prompt is the root cause** of visual monotony. It was correct for initial quality (consistent cards) but must be replaced with container treatment variety in Phase 2. The rule is at `ux-penpot-design-system.md:137-172` and `ux-penpot-designspec-v2.md` (similar section).
- **NodeSpec field budget comments are wrong NOW and will be wrong until Task 1.5.** The code comments (`design-spec-v2.ts:48` says "21 of 24"; `submit-design-tool.ts:9` says "21 of 24") are stale. The actual tool schema count is 22 optional fields. After Phase 1 completes (textAlign, helper, title removed from tool schema), the count will be **19 of 24 in the tool schema** = 5 slots of headroom. The TypeScript type will be 18 of 24 (also removed `active` which was never in the tool schema). Task 1.5 fixes the comments. **Trust the execution plan's count over the code comments until Task 1.5 is done.**
- **`placeholder` was considered for migration but kept on NodeSpec** — appears in 46.7% of design files (too high usage to migrate without significant backfill risk). The 4 fields being migrated (active, textAlign, helper, title) cover the low-risk candidates.
- **Phase 1 is COMPLETE (2026-04-27).** NodeSpec + tool schema both at 19/24 optional fields. Code comments updated. All verification gates green (typecheck, 377 unit tests, lint, 111 E2E tests, 5 field-migration-specific E2E tests with visual screenshots).
- **Phase 2 Tasks 2.1-2.5 are COMPLETE (2026-04-27).** Container treatment patterns in all 3 prompts. Dead Figma prompt deleted. `loadDesignSystemPrompt` dead export removed. Prompt version frontmatter added (v2.1.0). Dataflow docs updated. Prompt rule: **"A page with 3+ content sections MUST use at least 2 different treatments."**
- **Section accelerator does NOT render `title`.** The browser renderer's `case 'section'` renders `{children}` only. `title` only renders in `renderAlertNode` (via `node.label ?? node.title`). E2E tests must verify title via alert catalog, not section type.
- **Penpot-design.json has structure `designSpec.nodes`** — not `nodes` or `spec.nodes`. Backfill scripts must handle all three node map paths.
- **`ResolvedNode` and `TreeNode` KEEP `textAlign`/`helper`/`title`** — only `NodeSpec` (LLM-facing) lost them. Renderers read from internal types unchanged. Resolver/tree-builder populate from overrides.
- **`text_align` alias** — resolver checks both `overrides.textAlign` and `overrides.text_align` on the catalog path because LLMs emit both forms.

---

## Progress Checklist

Update this checklist as each task completes.

### Phase 1 — NodeSpec Field Cleanup
- [x] **1.1** Remove `active` from NodeSpec (2026-04-26). Zero usage, internal only. `spec-split.ts` already uses `MutableNode` type intersection. Lesson recorded in `docs/lessons-learned.md`.
- [x] **1.2** Migrate `textAlign` to overrides (2026-04-27). Removed from NodeSpec + tool schema. Resolver cascades `overrides.textAlign` (+ `text_align` alias) on all three paths (accelerator, catalog, unresolved). Tree-builder reads from overrides. 239 nodes backfilled across 37 JSON files. All typecheck/test/lint green.
- [x] **1.3** Migrate `helper` to overrides (2026-04-27). Removed from NodeSpec + tool schema. Resolver and tree-builder read from `overrides.helper`. 8 nodes backfilled across 4 JSON files. Renderers (renderInputText, renderInputCurrency) unchanged — read from ResolvedNode/TreeNode which still has the field. All typecheck/test/lint green.
- [x] **1.4** Migrate `title` to overrides (2026-04-27). Removed from NodeSpec + tool schema. Resolver, tree-builder, evaluation-context all read from `overrides.title`. 13 nodes backfilled across 4 JSON files. Fixed type errors in pipeline-integration.test.ts, evaluation-context.ts, import-integration.test.ts. All typecheck/test/lint green.
- [x] **1.5** Update field budget comments (2026-04-27). Both `design-spec-v2.ts` and `submit-design-tool.ts` now say "19 of 24 optional fields" with 5 slots of headroom. NodeSpec and tool schema counts now match.
- [x] **1.6** E2E regression test (2026-04-27). `e2e/field-migration-regression.spec.ts` — 5 tests: visual verification (1920x1080, sidebars collapsed), textAlign center, textAlign right, helper on input-text, alert label+content. Synthetic fixture injected into PET with cleanup. All headed + full suite (111 passed).

### Phase 2 — Prompt Rewrite for Container Variety (HIGHEST IMPACT)
- [x] **2.1** Replace "Shadows NOT Borders" in `ux-penpot-designspec-v2.md` (active prompt) with "Container Treatment Patterns" (2026-04-27). 5 treatments: elevated, outlined, flat, inset, separated. Rule: "3+ sections MUST use 2+ treatments."
- [x] **2.2** Update working examples in `ux-penpot-designspec-v2.md` to show mixed treatments (2026-04-27). Settings form example now uses Elevated (profile), Outlined (notifications), Flat (danger zone).
- [x] **2.3** Same treatment table + examples in `ux-penpot-design-system.md` (old Penpot MCP prompt) (2026-04-27). Replaced "Shadows, NOT Borders for Containers" section. Kept Penpot shadow API code block for Elevated treatment.
- [x] **2.4** Update planning prompt token binding examples in `ux-planning-system.md` (2026-04-27). Added SecondarySection (flat) and FormGroup (outlined) bindings. Added container treatment variety guidance.
- [x] **2.5** Clean up dead Figma prompt (2026-04-27). Deleted `ux-design-system.md` (51KB). Removed `loadDesignSystemPrompt` from `design-system-context.ts`, `design-collaboration.ts`, and `index.ts` barrel. Cleaned unused imports. Added version 2.1.0 frontmatter to all 3 modified prompts.
- [x] **2.6** Visual verification (2026-04-27). Ran `design:page:all` on PET fixture (5 pages, v2.2.0 prompt). Found prompt conflict: line 88 "do not use border overrides" contradicted container treatment patterns. Fixed in v2.2.0. Also fixed `buildPageDescription` crash for pages without `components`. Re-ran pipeline — LLM still produces monotonous treatments (all Elevated or all Bare). Conclusion: prompts establish rules but cannot guarantee compliance alone. Phase 4 evaluator diversity scoring is the enforcement mechanism.
- [x] **2.7** E2E test (2026-04-27). `e2e/container-variety.spec.ts` — 6 tests verifying renderer handles all 4 treatments (Elevated, Outlined, Flat, Separated) with correct CSS properties. Synthetic fixture, no LLM calls. All pass headed. Screenshot at `e2e/screenshots/container-variety.png`.

### Phase 3 — Catalog Variants
- [ ] **3.1** Add Card variants (elevated, flat, outlined, inset) to `base-component-catalog.yaml`.
- [ ] **3.2** Add Section variants (flat, bordered, inset).
- [ ] **3.3** Update catalog prompt builder to show available variants.
- [ ] **3.4** E2E test: `e2e/catalog-variants.spec.ts`.

### Phase 4 — Evaluator Diversity Scoring
- [x] **4.1** Add container diversity deduction rules to `EVALUATION_SYSTEM_PROMPT` in `design-evaluator.ts` (2026-04-27). Added `classifyContainerTreatment` and `assessContainerDiversity` in new `assess-container-diversity.ts` module. Structural post-processing wired after navigateTo check. Deducts 10 points if 3+ top-level sections all use one treatment. Vision prompt updated with diversity guidance.
- [x] **4.2** Unit tests verify structural check flags monotonous specs (2026-04-27). `assess-container-diversity.test.ts` (13 tests: 7 classification, 6 diversity assessment). Integration test in `design-evaluator.test.ts` confirms 10-point deduction on monotonous DesignSpecV2 input.

### Phase 5 — Domain + Effects Foundation (Clarifier Interface)
- [ ] **5.1** Add `domain`, `domainPatterns`, `referenceImages`, `selectedEffects` to `PipelineInput`.
- [ ] **5.2** Build keyword-based domain bridge (`domain-bridge.ts`).
- [ ] **5.3** Inject domain context into design prompt in `browser-design-work.ts`.
- [ ] **5.4** Reference image support — include as `ContentBlock` vision inputs.
- [ ] **5.5** Global pattern library scaffold in `packages/core/src/catalogs/patterns/`.
- [ ] **5.6** Write ADR (effects as catalog patterns, Clarifier owns domain, bridge pattern).
- [ ] **5.7** E2E test: `e2e/domain-bridge.spec.ts`.

### Phase 6 — Documentation
- [ ] **6.1** Update `docs/architecture/design-pipeline-dataflow.md` — field table, container treatments, evaluator diversity, domain bridge.
- [ ] **6.2** Update `docs/architecture/prototype-rendering-dataflow.md` — catalog variant rendering, border via overrides.

---

## Execution Order

```
Phase 1: NodeSpec Cleanup        → frees field budget, per-app verification
Phase 2: Prompt Rewrite          → no dependencies, highest impact
Phase 3: Catalog Variants        → can run in parallel with Phase 2
Phase 4: Evaluator Diversity     → depends on Phase 2 (prompts must teach variety first)
Phase 5: Domain + Effects        → independent, builds interface for future Clarifier
Phase 6: Documentation           → after all above
```

---

## Migration Protocol (Phase 1, per field)

1. Update NodeSpec type in `design-spec-v2.ts` (remove field)
2. Update tool schema in `submit-design-tool.ts` (remove field)
3. Update resolver in `resolver.ts` to cascade from `overrides`
4. Update render functions to read from resolved node (overrides fallback)
5. Write backfill script: scan all fixtures, move field values into `overrides`
6. Run backfill, then verify:
   - `nx run-many -t typecheck && nx run-many -t test && nx run-many -t lint`
   - Per-app headed browser check: load fixture in renderer, screenshot before/after

**Apps to verify per migration:** Every app in `fixtures/` and `apps/` with design JSON files.

---

## Key Files

| File | Role | Phase |
|------|------|-------|
| `packages/designspec-renderer/src/types/design-spec-v2.ts` | NodeSpec type | 1 |
| `packages/designspec-renderer/src/sdk/submit-design-tool.ts` | LLM tool schema | 1 |
| `packages/designspec-renderer/src/renderer/browser/app/src/DesignSpecRenderer.tsx` | Browser renderer | 1, 3 |
| `packages/designspec-renderer/src/catalog/resolver.ts` | Catalog resolution | 1, 3 |
| `packages/agents-ux/src/prompts/ux-penpot-designspec-v2.md` | Active design prompt | 2 |
| `packages/agents-ux/src/prompts/ux-penpot-design-system.md` | Penpot MCP prompt | 2 |
| `packages/agents-ux/src/prompts/ux-planning-system.md` | Planning prompt | 2 |
| `packages/agents-ux/src/prompts/ux-design-system.md` | Dead Figma prompt (DELETE) | 2 |
| `packages/core/src/catalogs/base-component-catalog.yaml` | Component catalog | 3 |
| `packages/agents-ux/src/ux-design/design-evaluator.ts` | Vision evaluator | 4 |
| `packages/agents-ux/src/design-pipeline/types.ts` | PipelineInput | 5 |
| `packages/agents-ux/src/design-pipeline/browser-design-work.ts` | Design LLM call | 5 |

---

## Rejected Approaches

| Rejected | Reason |
|----------|--------|
| Add `border` to NodeSpec | Contradicts ADR-035. Visual quality belongs in the catalog. |
| Separate effects library | Creates a second catalog system. ADR-035 says one catalog. |
| Domain detection in design pipeline | `vision.md` Layer 5 says Clarifier owns all intent capture. |
| Increase 24-field limit | Hard Anthropic API constraint. |
| Modify Figma prompt | Dead code — active pipeline uses `ux-penpot-designspec-v2.md`. |
