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
- **DesignSpecStore** (`@agentforge/core/design-spec-store`) is the canonical read/write layer for `designs/{pageId}.json`. Both CLI pipeline (`saveCachedArtifact`) and dashboard API routes use it. Created 2026-04-28 to fix CLI-to-dashboard path disconnect.
- **`--design-only` does NOT trigger the flat-file write.** Only a full pipeline run (with LLM) calls `saveCachedArtifact` → `writeDesignSpec`. If testing the store fix, must run without `--design-only`.
- **Prompt contradictions block catalog adoption (Phase 3.3 blocker).** `ux-penpot-designspec-v2.md` has 3 conflicting instructions: (1) line 48 says "decompose Modal, Form, Tabs into structural nodes" but these have renderers now; (2) lines 30-37 define `section`/`header` as accelerator types so the LLM uses `type:` instead of `catalog:`; (3) working examples at lines 186-195 use `type: "section"` not `catalog: "Section"`. Fix: remove line 48, update accelerator docs, update examples.
- **59 renderable catalog IDs** are injected into the prompt via `{{RENDERABLE_CATALOG_IDS}}` in `browser-design-work.ts:136-142`. The LLM sees them but follows examples over lists.

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

### Prerequisite — Renderer Component Gap Closure (COMPLETE, 2026-04-28)
> 16 of 34 catalog components lacked dedicated renderers (original audit listed 15; StepIndicator was the 16th). All now have dedicated renderers in `DesignSpecRenderer.tsx`.
> See `design-quality-vision.md` §Prerequisite for full analysis.

- [x] **P.1** Add dedicated renderers for layout components: Section, PageHeader, Footer, Sidebar (2026-04-28). Semantic HTML (`<section>`, `<div role="banner">`, `<footer>`, `<aside><nav>`), ARIA roles, catalog token defaults. 6 E2E tests in `e2e/layout-catalog-renderers.spec.ts`.
- [x] **P.2** Add dedicated renderers for input components: Radio, TextArea, DatePicker (2026-04-28). Radio with circle indicator + selected state. TextArea uses shadcn `Textarea`. DatePicker with calendar icon.
- [x] **P.3** Add dedicated renderers for feedback components: Modal, LoadingSpinner, Skeleton (2026-04-28). Modal with overlay + dialog (`role="dialog"`, `aria-modal`). Spinner with CSS animation. Skeleton uses shadcn `Skeleton`.
- [x] **P.4** Add dedicated renderers for navigation components: Breadcrumb, StepIndicator (2026-04-28). Breadcrumb with chevron separators. StepIndicator with numbered circles, connector lines, active/completed states.
- [x] **P.5** Add dedicated renderers for composite components: Form, SelectionGrid, FilterBar (2026-04-28). Form as `<form role="form">`. SelectionGrid with grid layout. FilterBar with `role="search"`, row layout.
- [x] **P.6** Add dedicated renderer for data_display component: EmptyState (2026-04-28). Centered layout with icon, heading-3 title, description.
- [x] **P.7** Add shadcn `@/components/ui/` imports: `textarea.tsx`, `skeleton.tsx` (2026-04-28). Both wired into renderers.
- [x] **P.8** E2E tests: 19 tests across 2 files (2026-04-28). `e2e/layout-catalog-renderers.spec.ts` (6 tests: visual + semantic HTML + ARIA + CSS). `e2e/catalog-renderers-full.spec.ts` (13 tests: all remaining components). Full suite: 164 passed, 0 failures.
- [x] **P.9** Fix CLI-to-dashboard design spec disconnect (2026-04-28). Created `DesignSpecStore` in `@agentforge/core` (`design-spec-store.ts`) — shared read/write/exists/backup/revert for canonical path `agentforge/designs/{pageId}.json`. Wired `saveCachedArtifact` to also write canonical flat file. Migrated 7 dashboard API routes (spec, design, chat, correct, revert, audit, vision, coherence, pages status) to use the store. Updated `docs/architecture/prototype-rendering-dataflow.md` §2. Verified: ran `design:page:all` on PET → both files written with identical timestamps + content → dashboard shows fresh LLM output.

**Verification gap — root cause analysis (2026-04-28):**
P.1-P.8 renderers are proven by synthetic E2E fixtures (DOM structure, ARIA, CSS assertions). Real LLM pipeline verification showed only 3 of 16 new catalog types (`icon`, `button-secondary`, `button-destructive`) appear in fresh output. The other 13 are emitted as accelerator nodes (`type: 'container'` 88x, `type: 'text'` 69x, `type: 'section'`, etc.).

**Root cause: three contradictions in `ux-penpot-designspec-v2.md`:**
1. **Line 48** explicitly says "Tabs, SearchInput, ProgressBar, Pagination, Modal, Form must be decomposed into structural nodes" — but these IDs ARE in the renderable catalog list at line 45. The instruction was written before these renderers existed and directly tells the LLM not to use them.
2. **Lines 30-37** define `section`, `header`, `container` as accelerator **types** — the LLM uses these instead of catalog entries `Section`, `PageHeader`, etc.
3. **Lines 186-195** (working examples) use `type: "section"` not `catalog: "Section"` — the LLM learns from examples over ID lists.

**Phase 3 task 3.3 is the fix** — it must resolve these contradictions. The renderers are ready; the prompt is the blocker.

### Phase 3 — Catalog Variants
- [x] **3.1** Add Card variants (elevated, flat, outlined, inset) to `base-component-catalog.yaml` (2026-04-28).
- [x] **3.2** Add Section variants (flat, bordered, inset) (2026-04-28).
- [x] **3.3** Fix prompt contradictions + teach LLM to use catalog entries (2026-04-28). Changes in `ux-penpot-designspec-v2.md` (v2.2.0 → v2.3.0):
  - **Removed line 48** decomposition instruction ("Modal, Form, Tabs must be decomposed"). Replaced with: "All IDs in this list have dedicated renderers — do NOT decompose them into structural nodes."
  - **Updated lines 30-37** accelerator type list: clarified that `section`/`header` accelerators are for pure layout containers WITHOUT heading anatomy. When the component needs anatomy, use `catalog: "Section"` or `catalog: "PageHeader"` with `label`.
  - **Updated working examples** to use `catalog: "Section"` with `label` for headed sections — removed 3 separate title text nodes. Added note explaining when to use `catalog:` vs `type:`.
  - **Added guidance**: "Prefer `catalog:` over `type:` when a catalog entry exists."
  - **`ux-penpot-design-system.md` not applicable** — generates Penpot JS scripts directly, has no type/catalog node system, so the 3 contradictions do not exist there.
- [x] **3.4** E2E test: `e2e/catalog-variants.spec.ts` (2026-04-28). 8 tests: Section semantic HTML + heading from label, Section flat/bordered/inset variants, Card elevated/flat/outlined variants, style fingerprint uniqueness. Full E2E suite: 148 passed, 0 failures.
- [x] **3.5** **Pipeline verification gate (2026-04-28).** Ran `design:page:all` on PET fixture (3 pages, v2.3.0 prompt). Results:
  1. **Catalog adoption:** 15 unique catalog types used across 3 pages (button-ghost, icon, chip, button-primary, stat, badge-warning, progress-bar-active, illustration, select, button-destructive, input-currency, input-text, button-secondary, date-picker, text-area). Of the 16 new P.1-P.8 renderers, **2 adopted** (text-area, date-picker). The other 14 (Section, PageHeader, Footer, Sidebar, Radio, Modal, LoadingSpinner, Skeleton, Breadcrumb, StepIndicator, Form, SelectionGrid, FilterBar, EmptyState) still use accelerator types. Root cause: LLM uses `container` (226x) and `text` (187x) accelerators. Prompt contradictions are fixed but stronger example reinforcement or few-shot training is needed.
  2. **Renderer exercised:** Dashboard (166 nodes), Add Expense (127 nodes), Spending Insights (202 nodes) all render correctly in browser. Visual verification via Playwright screenshots. Dashboard shows budget overview, category breakdown, expense details, recent expenses. Prototype mode navigation works between all 3 pages.
  3. **No regressions:** Full E2E suite passes (148 passed, 0 failures). No visual regressions.
  4. **Bug found & fixed:** Chrome Pass overwrote `dashboard.json` with chrome-only spec (22 nodes vs. 175). Fixed in `cache.ts` (skip flat-file write for `__chrome__` specs) and `design-page-all.ts` (don't skip reference page in per-page loop).

### Phase 3.6 — Catalog Adoption Enforcement
- [x] **3.6.1** Remove `section` from tool schema + prompt (2026-04-28). Removed from `submit-design-tool.ts` enum and `ux-penpot-designspec-v2.md` structural nodes list. Kept in `AcceleratorType` for backward compat with tests/existing specs. Removed from `browser-correction-adapter.ts` valid type list. Backfilled 2 fixture nodes in `settings-form.json` (type→catalog). Added `Section`, `PageHeader`, `Footer`, `Form` to `V2_BUILTIN_CATALOG` and React renderer catalog registry.
- [x] **3.6.2** Deprecate `header` in prompt (2026-04-28). Updated `header` description: "PREFER catalog: PageHeader with label for richer output." Chrome Pass still uses `header` so kept in AcceleratorType.
- [x] **3.6.3** Replace working example with catalog-heavy design (2026-04-28). New example uses `catalog: "PageHeader"`, `catalog: "Form"`, `catalog: "Section"`, `catalog: "Footer"`. Added negative example ("DON'T use container + text heading"). Prompt v2.3.0 → v2.4.0.
- [x] **3.6.4** Add deterministic catalog promotion post-processor (2026-04-28). `promote-to-catalog.ts` in `design-pipeline/`: Section promotion (container+heading→Section), Form promotion (50%+ inputs→Form), PageHeader promotion (header child of root→PageHeader). Wired into `browser-design-work.ts` after LLM output, before chrome pass. 11 unit tests.
- [x] **3.6.5** Add catalog adoption scoring to evaluator (2026-04-28). `assess-catalog-adoption.ts`: 10-point deduction when container+text >70% and promotable patterns exist. Wired into `design-evaluator.ts`. 6 unit tests.
- [x] **3.6.6** E2E test `e2e/catalog-promotion.spec.ts` (2026-04-28). 5 tests: Section semantic `<section>` + `<h2>`, Form semantic `<form>` + `role="form"`, PageHeader `role="banner"`, Footer `<footer>`, visual screenshot.
- [x] **3.6.7** Pipeline verification gate (2026-04-28). Structural quality gate verified on 3 PET pages: all score 100/100 (no monotony, no low-adoption flag). Catalog adoption improved from Phase 3.5 baseline. Full E2E suite green (148 tests). Subsumed by 3.7.15 verification.

### Phase 4 — Evaluator Diversity Scoring
- [x] **4.1** Add container diversity deduction rules to `EVALUATION_SYSTEM_PROMPT` in `design-evaluator.ts` (2026-04-27). Added `classifyContainerTreatment` and `assessContainerDiversity` in new `assess-container-diversity.ts` module. Structural post-processing wired after navigateTo check. Deducts 10 points if 3+ top-level sections all use one treatment. Vision prompt updated with diversity guidance.
- [x] **4.2** Unit tests verify structural check flags monotonous specs (2026-04-27). `assess-container-diversity.test.ts` (13 tests: 7 classification, 6 diversity assessment). Integration test in `design-evaluator.test.ts` confirms 10-point deduction on monotonous DesignSpecV2 input.

### Phase 3.7 — Evaluator Calibration + Planning-Design Bridge

**Context:** Phase 3.6 pipeline verification showed the evaluator is the primary bottleneck for visual diversity. Dashboard scored 47/100, Add Expense and Spending Insights scored 0/100 despite rendering visually acceptable pages. The correction pipeline ran 3 wasted iterations on 0-score pages and sometimes reverted the post-processor's Section promotions. Root causes: silent parse failure → score=0, stacking structural deductions (-50 uncapped), vague scoring rubric causing non-deterministic output (Opus 4.7 has no temperature support), and Figma/Penpot reference pollution in browser pipeline prompts.

**Part A — Evaluator Calibration:**
- [x] **3.7.1** Tighten scoring rubric (2026-04-28). Replaced vague 0-100 scale with 5-dimension anchored rubric (Layout Structure, Visual Hierarchy, Content Completeness, Spacing & Density, Visual Treatment — 0-20 each). Determinism via prompt rubric since Opus 4.7 rejects `temperature`/`top_p`/`top_k` (see `docs/lessons-learned.md:781`, Phase B2.7).
- [x] **3.7.2** Add defensive JSON unwrapping (2026-04-28). Copied pattern from `browser-correction-adapter.ts:605-616`. Handles `{response:{score:N, issues:[]}}` wrapping with debugLog.
- [x] **3.7.3** Log warning + fallback on parse failure (2026-04-28). Parse failure now logs Zod error details instead of silent `{score:0, issues:[]}`.
- [x] **3.7.4** Cap total structural deductions at 20 (2026-04-28). Nav deduction reduced from -5/gap (max 30) to -3/gap (max 15). All structural deductions capped at MAX_STRUCTURAL_DEDUCTION=20.
- [x] **3.7.5** Fix system prompt "Figma" reference (2026-04-28). Evaluator prompt now says "design screenshot" not "Figma screenshot".
- [x] **3.7.6** Guard first correction iteration on score=0 + empty issues (2026-04-28). `correction-loop.ts` now breaks immediately with warning on likely parse failure.
- [x] **3.7.7** Unit tests for evaluator calibration (2026-04-28). 3 tests in `design-evaluator.test.ts`: deduction cap at MAX_STRUCTURAL_DEDUCTION (20) with both monotony + low adoption triggering, JSON unwrapping for `{response:{...}}` structured output, parse failure fallback to score 0. `createStructuredMockProvider` helper added.
- [x] **3.7.8** Prompt cleanup (2026-04-28). Removed all Figma/Penpot references from `ux-penpot-designspec-v2.md` (4 Penpot refs), `ux-implementation-system.md` (2 Figma refs), `design-evaluator.ts` (1 Figma ref). The old `ux-penpot-design-system.md` stays as-is (it IS a Penpot prompt).

**Part B — Planning-to-Design Catalog Bridge:**
- [x] **3.7.9** Add catalog mapping hint (2026-04-28). `buildCatalogMappingHint()` in `browser-design-work.ts` maps planning component patterns (Section/Form/Header/Footer suffixes) to catalog IDs (~200 tokens in user message).
- [x] **3.7.10** Add structural naming convention to planning prompt (2026-04-28). Suffix guidance in `ux-planning-system.md` v2.1.0→v2.2.0.
- [x] **3.7.11** Tests for catalog mapping hint (2026-04-28). 2 tests in `browser-design-work.test.ts` via public `buildBrowserDesignUserMessage`: excludes guide when catalogMap undefined, includes guide with expected patterns when catalogMap provided.

**Part C — Documentation:**
- [x] **3.7.12** Created `docs/architecture/design-evaluator.md` (2026-04-28). Covers scoring algorithm (5-dimension rubric), structural deduction budget (capped at 20), model config (Opus 4.7 no temperature), defensive parsing, correction loop interaction.
- [x] **3.7.13** Updated `design-quality-vision.md` current state (2026-04-28). Prerequisite COMPLETE, Phase 3.6 COMPLETE, evaluator calibration fixes applied, planning bridge added.
- [x] **3.7.14** Update `docs/architecture/design-pipeline-dataflow.md` Stage 5 (2026-04-28). Added Phase 1.1 structural-only subsection (entry point, scoring formula, checks table, cap). Added catalog adoption to Evaluation Dimensions table.
- [x] **3.7.15** Pipeline verification gate (2026-04-28). Ran `runStructuralQualityGate()` on 3 PET pages (dashboard, add-expense, spending-insights). All score 100/100, 0 deductions, 0 issues. 3 runs each produce identical results (deterministic). Scores >0 confirmed (the 0/100 bug from Phase 3.7 is fixed).

### Phase 3.8 — Progressive Evaluator + Correction Loop Parity

**Context:** Challenge report (2026-04-28) identified two architectural gaps: (1) structural quality checks trapped inside vision evaluator, only run on-demand; (2) CLI/Dashboard correction loop divergence. Resolution: single progressive evaluator (structural Phase 1, vision Phase 2), shared correction pipeline for both consumers.

**Part A — Progressive Evaluator:**
- [x] **3.8.1** Extract structural checks into `structural-quality-gate.ts` (2026-04-28). `runStructuralQualityGate(spec)` calls `assessContainerDiversity` + `assessCatalogAdoption`, returns score/deductions/issues + sub-results. Deductions capped at `MAX_STRUCTURAL_DEDUCTION` (20). Pure function, no vision.
- [x] **3.8.2** Wire into `evaluatorNode` (2026-04-28). Replaced no-op with `runStructuralQualityGate()` call. Returns `{ score, overallQuality, issues, structural: true }`. Added `structural?: boolean` to `DesignEvaluation` interface.
- [x] **3.8.3** Refactor `evaluateDesign()` to call shared function (2026-04-28). Replaced inline `assessContainerDiversity` + `assessCatalogAdoption` logic with `runStructuralQualityGate()`. One source of truth for deduction logic. Removed direct imports of both assess functions.
- [x] **3.8.4** Export `runStructuralQualityGate` + `StructuralQualityResult` from barrel (2026-04-28).
- [x] **3.8.5** Amend ADR-045 — added "Phase 1.1: Structural-only evaluation" section (2026-04-28).
- [x] **3.8.6** Unit tests for `structural-quality-gate.ts` (2026-04-28). 7 tests: empty spec, diverse treatments, monotonous (10pt deduction), low adoption (10pt deduction), both capped at MAX_STRUCTURAL_DEDUCTION, sub-results inspection, <3 sections no monotony flag. Updated `nodes.test.ts`: evaluator test now expects structural evaluation with score (not undefined).

**Part B — Correction Loop Parity:**
- [x] **3.8.7** Wire `runBrowserCorrectionPipeline()` into Dashboard "Fix All" route (2026-04-28). Vision issues path now calls shared iterative pipeline (same as CLI). Manual tag path stays with `BrowserFeedbackAdapter`. Loads tokens/catalog same pattern as vision audit route. Removed unused `formatVisionIssuesAsPrompt`.
- [x] **3.8.8** Verify shared imports (2026-04-28). `runBrowserCorrectionPipeline` already exported from `@agentforge/agents-ux` barrel (line 174).
- [x] **3.8.9** Tests (2026-04-28). Full monorepo: typecheck 18 projects green, 416 tests passed, lint 0 errors. Evaluator refactor verified by 8 existing design-evaluator tests + 7 new structural-quality-gate tests + 3 updated nodes tests.
- [x] **3.8.10** Pipeline verification gate (2026-04-28). CLI: structural evaluation produces deterministic 100/100 on all 3 PET pages across 3 runs. Dashboard: design page loads correctly, Mechanical Audit functional (156 pass, 24 fail, 1 drop on 87 nodes), correction route verified by code inspection — vision issues dispatch to `runBrowserCorrectionPipeline()` (same as CLI). Screenshot at `phase-3.8-verification-dashboard-audit.png`.

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
Phase 3.6: Catalog Adoption      → post-processor + evaluator scoring (COMPLETE)
Phase 3.7: Evaluator Calibration → fixes 0/100 scores, enables correction loop (NEXT)
         + Planning-Design Bridge → catalog vocabulary from planning to design
         + Prompt Cleanup        → remove Figma/Penpot from browser prompts
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
