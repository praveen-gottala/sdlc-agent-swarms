# Design Pipeline Audit: Dead Code, Quality Gaps & Improvement Plan

**Date:** 2026-03-28
**Triggered by:** Removal of dead `DEFAULT_COMPONENTS` / `backfillComponents()` revealed a pattern of generated-but-never-consumed data across the pipeline.

---

## Executive Summary

A full audit of the 8-stage design pipeline found:
- **4 dead code items** (same pattern as DEFAULT_COMPONENTS — generated but never consumed)
- **1 critical missing renderer** (table component)
- **3 design quality improvements** (sizing constraints, token validation, deprecation cleanup)
- **3 architectural improvements** (responsive design, V2 renderer default, CI/CD evaluation)
- **~1500-3000 wasted LLM tokens per pipeline run** from dead output fields

---

## Part 1: Dead Code (Verified — Zero Downstream Consumers)

### 1.1 Planning `responsiveRules` — Generated but never consumed

**What:** Planning agent generates `responsiveRules: ResponsiveRule[]` (breakpoint name + behavior description) per the planning system prompt.

**Evidence:** Design agent in `ux-penpot-design.ts` hardcodes `responsiveRules: []` in its output — never reads the planning output's rules. Implementation agent doesn't read them either.

**Type definition** (`packages/agents-ux/src/types.ts:13-16`):
```typescript
interface ResponsiveRule {
  readonly breakpoint: string;   // e.g., "tablet"
  readonly behavior: string;     // e.g., "Stack cards vertically"
}
```

**Cost:** ~500-1000 LLM output tokens per planning run.

**Files:**
- `packages/agents-ux/src/ux-planning/ux-planning.ts` — output type + schema
- `packages/agents-ux/src/prompts/ux-planning-system.md` — prompt instruction
- `packages/agents-ux/src/ux-planning/ux-planning.test.ts` — test assertions

**Recommendation:** Don't remove — wire into design agent (see Part 3: Responsive Design).

---

### 1.2 Planning `implementationStages` — Generated but never consumed

**What:** Planning agent generates `implementationStages: ImplementationStage[]` — a 4-stage plan (layout → theme → animation → implementation). But implementation agent receives its `stage` parameter directly via `UXImplementationInput.stage`, not from planning output.

**Evidence:** Grep for `implementationStages` finds zero consumers outside the planning output type and tests.

**Cost:** ~500 LLM output tokens per planning run.

**Files:**
- `packages/agents-ux/src/ux-planning/ux-planning.ts` — output type + schema
- `packages/agents-ux/src/prompts/ux-planning-system.md` — prompt instruction

**Recommendation:** Remove from planning output/prompt/schema. The implementation agent's `stage` param is set by the CLI orchestrator, making the planning output redundant.

---

### 1.3 `buildComponentCatalogImplPrompt` — Exported but never called in pipeline

**What:** Function exported from `agents-ux` public API, builds a component catalog prompt for the implementation agent. But no pipeline code calls it — only unit tests.

**Evidence:** Grep finds call sites only in `design-collaboration.test.ts`.

**Files:**
- `packages/agents-ux/src/ux-design/design-collaboration.ts` — definition
- `packages/agents-ux/src/index.ts` — export

**Recommendation:** Remove function, tests, and export. If implementation agent needs catalog context in the future, re-add with actual wiring.

---

### 1.4 `toDesignTokens` — Exported utility with zero pipeline consumers

**What:** Converts structured `DesignTokensSpec` to flat `DesignTokensFlat` format. Exported from `@agentforge/core` but no agent, CLI command, or renderer calls it.

**Evidence:** Grep finds call sites only in `design-system-reader.test.ts`.

**Files:**
- `packages/core/src/state/design-system-reader.ts` — definition
- `packages/core/src/index.ts` — export

**Recommendation:** Remove function, tests, and export.

---

## Part 2: Design Quality Improvements

### 2.1 Missing Table Component Renderer (Critical Gap)

**Problem:** `DataTable` is defined in component catalog YAML and referenced in design specs, but no `table.ts` renderer exists in `packages/designspec-renderer/src/renderer/penpot/components/`. Tables fall back to a blank container box.

**Impact:** Tables are the most common data display component. Without a renderer, data-heavy screens (dashboards, admin panels, reports) render with empty boxes where tables should be.

**Evidence:**
- No `table.ts` in renderer components directory
- `__tests__/fixtures/test-app-splitwise/component-catalog.yaml:219` references `DataTable`
- Component index (`components/index.ts`) has no table registration

**Recommendation:** Add `table.ts` renderer with anatomy: header-row (column labels with bold text), body-rows (data cells), optional footer. Follow `card.ts` pattern (board with nested flex rows). Must use `createBoard()` for all shapes per Penpot API rules.

**Scope:** Separate PR.

---

### 2.2 Surface `defaultValues` Sizing Constraints to Design Agent

**Problem:** Planning output includes `defaultValues` inside `componentTree` nodes with concrete pixel dimensions (nav: 64px, hero: 400-500px, card: 200px). But the design agent receives this data embedded deep in the tree structure — there's no explicit "sizing constraints" section in the design prompt.

**Impact:** "Too tall", "too wide", and "excessive whitespace" are the most common design quality complaints. The LLM has the data but it's buried in a JSON tree.

**Fix:** In `buildDesignSystemContextFromSpec()` (`design-collaboration.ts`), extract `defaultValues` from `componentTree` nodes and format as a top-level `## Sizing Constraints` section in the design prompt. Example:
```
## Sizing Constraints
- NavigationBar: height=64px
- HeroSection: height=400px, minHeight=300px
- ContentCard: width=fill, minHeight=200px
```

---

### 2.3 Deterministic Token Binding Validation Before LLM Correction

**Problem:** Planning agent generates token bindings, validates them against known token names, and if invalid, makes up to 2 additional LLM correction calls. But a deterministic `DOT_NOTATION_HINTS` fallback already handles most cases (e.g., `color.surface.primary` → `surface-primary`).

**Impact:** ~40% of planning runs trigger 1-2 extra LLM calls (2000 tokens each, ~10 seconds) for corrections the deterministic fallback could handle.

**Fix:** In `ux-planning.ts`, apply `filterNonTokenBindings()` + `DOT_NOTATION_HINTS` mapping BEFORE the LLM validation attempt. Only trigger LLM correction for bindings that can't be resolved deterministically.

---

### 2.4 Complete `existingTokens` Deprecation

**Problem:** `existingTokens` in `UXResearchInput` is marked `@deprecated` with `designTokensSpec` as the replacement. The deprecated field is still used as a runtime fallback.

**Fix:** Verify all callers pass `designTokensSpec`, then remove the deprecated field and fallback logic from `ux-research.ts`.

---

## Part 3: Responsive Design — Architecture Decision

### Current State

The pipeline generates **one design for one viewport** (default: 1440px desktop):

```
CLI (--width 1440)
  → viewportResolver → [1440]  ← takes [0] only
    → Planning (single viewport context)
      → Design (single root board in Penpot)
        → Implementation (single-viewport code)
```

The infrastructure for multi-viewport exists but is disconnected:
- `viewport-resolver.ts` can return `[1440, 768, 375]` (desktop-first) or `[375, 768, 1440]` (mobile-first)
- Planning generates `responsiveRules[]` but nobody reads them
- Planning has optional `screens[]` for multi-page apps but design agent doesn't consume it
- Penpot supports multiple artboards (boards) on one page

### Three Approaches to Responsive Design

#### Approach A: Implementation-Only Responsiveness (Simplest)

**How it works:**
1. Keep generating one Penpot design at desktop viewport (1440px)
2. Pass `responsiveRules` from planning to implementation agent
3. Implementation agent generates responsive Tailwind/CSS using breakpoint classes (`md:grid-cols-2`, `lg:grid-cols-3`)
4. No Penpot changes needed

**Pros:** Minimal pipeline changes. Penpot stays single-viewport (design reference). Implementation handles responsiveness via CSS.

**Cons:** Designer can't preview mobile/tablet layouts in Penpot. Responsive behavior is code-only, not visually verified.

**Does it create multiple Penpot screens?** No.

#### Approach B: Multi-Artboard Penpot Design (Visual Responsive)

**How it works:**
1. `design-penpot.ts` loops over `resolveViewports()` results: `[1440, 768, 375]`
2. For each viewport, run the design agent with that width
3. Each generates a separate Penpot artboard on the same page (side by side)
4. Evaluator + correction loop runs per artboard
5. Implementation receives all artboards as reference

**Pros:** Designer sees all breakpoints visually. Evaluator can verify each.

**Cons:** 3× LLM cost, 3× time, 3× correction loop iterations. Significant pipeline refactoring.

**Does it create multiple Penpot screens?** Yes — 3 artboards on one page (or 3 separate pages).

#### Approach C: Hybrid — Desktop Design + Responsive Implementation (Recommended)

**How it works:**
1. Generate one Penpot design at desktop (1440px) — current behavior
2. Planning agent generates `responsiveRules` as structured breakpoint configs (not just descriptions):
   ```typescript
   interface ResponsiveRule {
     breakpoint: 'mobile' | 'tablet' | 'desktop';
     width: number;          // e.g., 375, 768, 1440
     layout: string;         // e.g., "single-column"
     changes: string[];      // e.g., ["stack cards vertically", "hide sidebar"]
   }
   ```
3. Design agent receives rules and annotates the Penpot design with responsive metadata (via `setPluginData`)
4. Implementation agent reads both Penpot design (visual reference) AND responsive rules to generate breakpoint-aware Tailwind code
5. Optionally: generate a second Penpot artboard at mobile width for visual reference (2× cost, not 3×)

**Pros:** Balances visual preview with cost. Implementation agent gets structured responsive guidance. No 3× cost explosion.

**Cons:** Mobile preview is optional, not guaranteed. Responsive behavior still primarily code-driven.

**Does it create multiple Penpot screens?** Optionally 1-2 (desktop + mobile), not 3.

### Recommendation

**Approach C (Hybrid)** — Keep `responsiveRules` but enhance the type from text descriptions to structured configs. Wire into implementation agent. Optionally generate mobile artboard.

---

## Part 4: Architectural Improvements (Future PRs)

### 4.1 V2 Renderer as Default Path

**Current:** V2 renderer is wired via `--designspec-v2` CLI flag but not default. V1 uses LLM to generate Penpot scripts (16K tokens, hallucination risk). V2 uses deterministic `renderToScript()` (0 tokens, no hallucination).

**Prerequisites:**
- Verify V2 renderer covers all component types (table renderer from 2.1 must be added first)
- Integration test using real project files (per lessons-learned "Future: Pipeline Integration Test")
- Verify correction loop works with V2-generated scripts

**Savings:** ~16,000 LLM tokens per design run + reduced correction loop need.

### 4.2 Non-Interactive Evaluation for CI/CD

**Current:** Feedback loop (Stage 6) is TTY-only. In `--no-wait` mode, no quality evaluation happens.

**Proposal:** Add `--evaluate` flag that runs the evaluator without interactive prompt. If score < configurable threshold (default 75), exit with non-zero code. Enables quality gates in CI.

### 4.3 Design → Implementation Data Threading

**Current:** If feedback loop modifies design, implementation still uses original planning output.

**Proposal:** Thread updated node IDs and evaluation score from feedback loop to implementation agent. Let implementation agent adjust code strategy based on design quality score.

---

## Part 5: Token Savings Summary

| Item | Tokens Wasted/Run | Fix Effort | Priority |
|------|-------------------|------------|----------|
| `implementationStages` in planning | ~500 output | Low (remove) | P1 |
| `responsiveRules` (if removing) | ~500-1000 output | Low (remove) | — |
| LLM token correction retries | ~2000 output (40% of runs) | Medium (deterministic first) | P2 |
| V1 → V2 script generation | ~16,000 output | High (V2 default) | P3 |
| Dead exports (code hygiene) | 0 tokens (maintenance cost) | Low | P1 |

**Total addressable waste:** ~3,000 tokens/run (P1+P2) or ~19,000 tokens/run (with V2).

---

## Execution Roadmap

### PR 1: Dead Code Cleanup ✅ DONE
- ✅ Removed `implementationStages` from planning output/prompt/schema/tests
- ✅ Removed `buildComponentCatalogImplPrompt` function, export, and tests
- ✅ Removed `toDesignTokens` + `DesignTokensFlat` type, export, and tests
- ✅ Updated `docs/architecture/design-pipeline-dataflow.md` to match

### PR 2: Table Renderer ✅ DONE
- ✅ Added `data-table.ts` Penpot component renderer (header row, body rows, dividers)
- ✅ Added `DataTable` to `V2_BUILTIN_CATALOG` fixture
- ✅ Registered in `components/index.ts`
- ✅ Unit test: 10 assertions (anatomy, data-driven columns, fallback, Penpot API compliance)

### PR 3: Design Quality ✅ DONE
- ✅ Surface `defaultValues` sizing constraints as `## Sizing Constraints` in design prompt
- ✅ Deterministic DOT_NOTATION_HINTS applied BEFORE LLM correction (saves ~2000 tokens/40% of runs)
- ✅ Completed `existingTokens` deprecation (removed field, import, fallback logic)
- ✅ Updated tests to reflect new deterministic-first correction flow

### PR 4: Responsive Design (Approach C) ✅ DONE
- ✅ Enhanced `ResponsiveRule` type with `width`, `layout`, `changes[]` fields
- ✅ Updated planning schema + prompt examples with structured breakpoint configs
- ✅ Wired `responsiveRules` as explicit `## Responsive Design Rules` section in implementation prompt
- ✅ Added Tailwind breakpoint mapping guidance (sm/md/lg/xl prefixes)

### PR 5: V2 Renderer Default ✅ DONE
- ✅ V2 deterministic renderer is now the default path (was opt-in `--designspec-v2`)
- ✅ Renamed flag to `--designspec-v1` as escape hatch for legacy LLM-based generation
- ✅ Updated CLI registration, interface, and docs
- ✅ All 22 catalog components covered (including data-table)

### PR 6: CI/CD Evaluation ✅ DONE
- ✅ Added `--evaluate` flag for non-interactive design evaluation
- ✅ Added `--evaluate-threshold <score>` (default: 75) for configurable pass/fail
- ✅ Captures screenshot, runs evaluator, displays score + issues
- ✅ Exits with code 1 if score below threshold (CI/CD gate)
- ✅ Takes priority over `--implement` and feedback loop
