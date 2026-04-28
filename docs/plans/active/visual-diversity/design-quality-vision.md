# UX Design Quality Vision

> Strategic evolution from baseline generated designs to state-of-the-art automated design quality.
> Each tier builds on the previous. Research backing for each decision is in [`docs/design-decisions.md` Section 9](../../design-decisions.md).
> Market research and competitive analysis: [`docs/research/visual-diversity-investigation.md`](../../research/visual-diversity-investigation.md).

## Related Documents

- **Execution plan:** `docs/plans/active/visual-diversity/execution-plan.md` (tactical tasks)
- **Design decisions:** `docs/design-decisions.md` Section 9 (research rationale)
- **Market research:** `docs/research/visual-diversity-investigation.md` (12+ AI design tools, standards, academic findings)
- **ADR-035:** Catalog-first component model
- **Vision:** `docs/vision.md` Layer 5 (Clarifier), Layer 7 (Design pipeline), Layer 14 (Dashboard)

---

## Current Position (2026-04-27)

**What works:**
- Five container treatments defined in prompts (elevated, outlined, flat, inset, separated)
- Renderer handles all treatments correctly (E2E-verified: `e2e/container-variety.spec.ts`, 6 tests)
- Design prompts include "3+ sections MUST use 2+ treatments" rule
- Evaluator diversity scoring enforces treatment variety (Phase 4 complete: `assess-container-diversity.ts`, 10-point deduction for monotonous specs)
- Properties Free panel in dashboard: 23-property direct editing, zero tokens, live preview, per-node revert (`design-inspector.tsx`, `property-registry.ts`)
- 19/24 NodeSpec field budget available (5 slots of headroom)
- TracedProvider captures all LLM I/O in Langfuse for debugging
- Renderer uses real shadcn/ui components (`@/components/ui/` — Button, Badge, Avatar, Card, Input, Progress, Checkbox, Pagination)
- Catalog has `library_mapping.shadcn` for all 34 components

**What doesn't work yet:**
- LLM still produces monotonous treatments despite prompt rules (Phase 2.6 finding) — evaluator scoring now catches this, but correction loop compliance not yet verified at scale
- No catalog variants — all cards/sections use the same base component
- No domain awareness — a finance app and a social app get identical treatment patterns
- **15 of 34 catalog components lack dedicated renderers** — Radio, TextArea, DatePicker, Modal, LoadingSpinner, Skeleton, Breadcrumb, Form, SelectionGrid, FilterBar, Section, PageHeader, Footer, Sidebar, EmptyState fall through to generic flexbox container. Effect packs and domain bundles are meaningless if components render as blank boxes.
- No effect pack system — treatments are hardcoded in prompts, not data-driven
- No style intelligence — no PRD-derived style inference, no competitor analysis, no user-uploadable effect packs

---

## Prerequisite: Renderer Component Gap Closure

**Status:** Not started. **Priority: HIGHEST — blocks Tier 1 completion and all downstream tiers.**

15 of 34 catalog components have `library_mapping.shadcn` entries and full anatomy/state definitions in `base-component-catalog.yaml`, but no dedicated render function in `DesignSpecRenderer.tsx`. They fall through to the generic `default:` case (empty flexbox container).

| Component | Category | Impact |
|-----------|----------|--------|
| Radio | input | Forms render incomplete |
| TextArea | input | Multi-line input shows as blank box |
| DatePicker | input | Date selection not visible |
| Modal | feedback | Overlay designs can't be previewed |
| LoadingSpinner | feedback | Loading states invisible |
| Skeleton | feedback | Loading placeholders invisible |
| Breadcrumb | navigation | Navigation hierarchy missing |
| Form | composite | Form layouts broken |
| SelectionGrid | composite | Grid selection patterns broken |
| FilterBar | composite | Data filtering UI missing |
| Section | layout | Content sections lose anatomy |
| PageHeader | layout | Page headers render as empty containers |
| Footer | layout | Page footers invisible |
| Sidebar | layout | Side navigation broken |
| EmptyState | data_display | Empty state illustrations missing |

**Why this is the highest priority:** Every generated design that uses these components produces a visually broken output. The evaluator flags them as "missing components" and the correction loop can't fix a renderer gap — it wastes iterations trying. Domain bundles (Tier 2) and effect packs (Tier 3) are meaningless if the components they target render as blank boxes.

**Effort estimate:** Each renderer is ~50-150 lines following existing patterns (e.g., `renderInputText`, `renderAlertNode`). The 8 existing shadcn `@/components/ui/` imports cover Button, Badge, Avatar, Card, Input, Progress, Checkbox, Pagination — additional shadcn components may need to be added for the gaps.

---

## Tier 1: Foundation (Phases 3-4)

**Status:** Phase 4 COMPLETE (2026-04-27). Phase 3 not started.

### What's included

| Item | Phase | Description |
|------|-------|-------------|
| Evaluator diversity scoring | 4.1-4.2 | Structural post-processing counts treatment types per page. Deducts 10 points if 3+ sections all use one treatment. Issues trigger correction loop. **COMPLETE.** |
| Vision LLM diversity guidance | 4.1 | `EVALUATION_SYSTEM_PROMPT` teaches the evaluator to flag visual monotony in screenshots. **COMPLETE.** |
| Catalog variants | 3.1-3.2 | Card variants (elevated, flat, outlined, inset) and Section variants (flat, bordered, inset) in `base-component-catalog.yaml`. |
| Catalog prompt builder | 3.3 | Design LLM sees available variants and can select appropriate ones per section. |

### What this achieves

- **Enforced minimum variety** via the correction loop: monotonous designs get flagged, corrected, and re-evaluated until they meet the 2+ treatment threshold.
- **Catalog-driven variety**: the LLM selects from named variants instead of inventing CSS, reducing hallucination.
- **Deterministic + vision scoring**: structural analysis provides a reliable floor; vision LLM catches visual issues structural analysis misses.

### Key research references

- [Agentic Design Review System (AAAI 2025)](https://arxiv.org/html/2508.10745): VLMs have "novice-level awareness" of design characteristics — structural grounding is essential.
- [MLLM-as-a-Judge](https://mllm-judge.github.io/): Vision scoring achieves 0.557 similarity to human ratings. Useful but not sufficient alone.

### Prerequisites

- Renderer component gap closure (prerequisite section above).

---

## Tier 2: Domain-Adaptive Bundles + Style Intelligence

> Supersedes the earlier "Domain Intelligence (Phases 5-6)" scope. Expanded by `docs/design-decisions.md` §9.5 (domain bundles) and §9.6 (style intelligence). Research basis: `docs/research/visual-diversity-investigation.md`.

**Status:** Not started. Prerequisite: Tier 1 complete + renderer gap closed.

### What's included

| Item | Description |
|------|-------------|
| **Domain bundles (§9.5)** | A domain is a bundle of treatment palette + component catalog subset + layout primitives + content scaffolds + iconography. Bundles are YAML data. The 5 current treatments become the `saas-dashboard` bundle. |
| **PRD-derived style seed (§9.6 Channel 1)** | Clarifier infers domain, audience, density, tone, and banned patterns from PRD text. Produces a seed StyleProfile. User confirms before generation. |
| **Effect pack system (§9.7)** | shadcn-registry-shaped catalog extensions. Users upload YAML packs. LLM selects treatments by name. Targeted section regeneration with branch/diff/revert. |
| **Properties panel extensions (§9.6 Channel 4)** | Extend existing Properties Free panel (23 properties) with effect-pack-specific properties. Add `boxShadow` and `backdropFilter` to renderer `SAFE_OVERRIDE_KEYS`. |

### What this achieves

- **Domain-appropriate designs**: a finance dashboard looks like a finance dashboard, not a generic card grid. "Same PRD, five domains, watch the output change" demo.
- **User-configurable style without code changes**: effect packs are data, not code.
- **Negative constraints**: `banned_patterns` prevents generic defaults (Inter, blue, card-wrapping-everything).
- **Direct manipulation for polish**: Properties panel (zero tokens) is the default refinement path, not LLM chat.

### Key research references

- [1D-Bench (Alibaba 2025)](https://arxiv.org/abs/2502.08314): generic web benchmarks can't measure domain-specific layout diversity.
- [FontBench (2026)](https://arxiv.org/abs/2603.xxxxx): VLMs can't extract typography from screenshots — algorithmic extraction required for competitor analysis.
- v0 Design Mode, Lovable Visual Edits: industry converged on direct AST manipulation for refinement, not LLM chat.

### Demo milestone

"Same PRD, five domains, watch the output change" — pairwise color distance (CIEDE2000 ΔE > 15), component Jaccard (J < 0.6), density tier matching bundle spec from rendered DOM.

---

## Tier 3: Exemplar-Based Evaluation

**Status:** Not started. Prerequisite: Tier 2 complete.

### What's included

| Item | Description |
|------|-------------|
| In-context exemplar selection | Retrieve relevant design examples (good and bad) from a curated library and inject as vision input to the evaluator. The evaluator sees "this is a well-diversified dashboard" alongside "this is a monotonous dashboard" as calibration. |
| Graph-matching design retrieval (GRAD) | Use spatial relationship and semantic content matching (Wasserstein + Gromov-Wasserstein distances) to find the most relevant exemplars, not just visually similar ones. |
| Structured Design Descriptions (SDD) | Generate textual descriptions of element locations and relationships to anchor evaluator responses in spatial grounding. |
| Good/bad treatment example pairs | Curated pairs showing the same page with diverse vs. monotonous treatments, used as few-shot examples in the evaluator prompt. |

### What this achieves

- **Calibrated evaluation**: the evaluator knows what "good diversity" looks like from examples, not just rules. LLM scoring quality improves significantly with exemplar-based calibration.
- **Spatial awareness**: graph-matching retrieval finds structurally relevant examples (same layout type) rather than just visually similar ones.

### Key research references

- [Agentic Design Review System (AAAI 2025)](https://arxiv.org/html/2508.10745): GRAD exemplar selection improved evaluation accuracy by providing context-specific design comparisons. Static + dynamic agent specialization outperformed single-evaluator approaches.

---

## Tier 4: Cross-Page Coherence

**Status:** Not started. Prerequisite: Tier 1 complete (can run in parallel with Tier 2-3).

### What's included

| Item | Description |
|------|-------------|
| Generation Diversity (GD) metrics | Pairwise perceptual hash comparison across page screenshots within a project. Measures whether pages are visually distinct while maintaining design system coherence. |
| Design system coherence scoring | Verify that cross-page elements (navigation, color usage, typography) are consistent while page-level content sections are diverse. |
| Cross-page treatment distribution | Ensure the project as a whole uses a healthy distribution of treatments, not just each individual page. |

### What this achieves

- **Holistic project quality**: individual pages may each be diverse, but the project as a whole needs both coherence (shared design language) and variety (pages don't all look the same).
- **Automated design system governance**: catch design system violations across the full page set, not just page-by-page.

### Key research references

- [UI Design with LLMs: Generation Diversity (GD)](https://arxiv.org/html/2412.20071v3): Perceptual hashing measures low-level visual diversity. Larger average distances indicate broader variety.
- [Comparative Evaluation of Perceptual Hashing (MDPI 2025)](https://www.mdpi.com/2079-9292/15/7/1493): CNN-based embeddings outperform classical perceptual hashes for robustness in high-diversity environments.

---

## Tier 5: Adaptive Design Intelligence + Competitor Analysis

> Competitor analysis (§9.6 Channel 2) deferred to this tier per research findings: VLMs can't reliably extract typography or spacing from screenshots (FontBench 2026). Ship only when algorithmic extraction + constrained taxonomy-bounded vision queries are proven.

**Status:** Long-term. Prerequisite: Tiers 1-3 complete.

### What's included

| Item | Description |
|------|-------------|
| **Constrained competitor analysis (§9.6 Channel 2)** | User provides URLs. Algorithmic color extraction (k-means LAB → Material 3 HCT). Vision LLM picks from fixed taxonomy (density, vibe, layout pattern). CSS computed styles for typography/spacing. Surfaces suggestions, never auto-applies. |
| Embedding-based diversity scoring | Map designs to high-dimensional vector spaces via VLM embeddings. Quantify diversity using UMAP/DBSCAN clustering and PCA eigenvalue dispersion analysis. |
| Multi-agent specialized reviewers | Separate evaluator agents for typography, color harmony, composition, and content organization (AAAI agentic framework). Meta-agent orchestrates and aggregates. |
| Personalized evaluation models | Fine-tune evaluation on project-specific design language. The evaluator learns what "good" means for this specific design system. |
| Real-time design governance | Live evaluation feedback in the design editor (dashboard), not just post-generation scoring. |

### What this achieves

- **Production-grade automated design governance**: moves from "does the design meet minimum standards?" to "does the design match the project's specific design language?"
- **Honest competitor analysis**: extracts what VLMs can reliably assess (colors, density, vibe), uses algorithmic methods for what they can't (hex values, typography), and surfaces results for user confirmation.
- **Continuous quality improvement**: the system learns from corrections and user feedback, getting better over time.

### Key research references

- [LiveIdeaBench: LLM Ideation Benchmark](https://www.emergentmind.com/topics/liveideabench): Embedding-based diversity metrics.
- [Agentic Design Review System (AAAI 2025)](https://arxiv.org/html/2508.10745): Multi-agent specialization outperforms single-evaluator approaches.
- [Personalized Visual Design Evaluation](https://www.emergentmind.com/topics/personalized-visual-design-evaluation): Tailoring evaluation to specific users/projects.

---

## Tier Summary

| Tier | Focus | Key Capability | Status |
|------|-------|----------------|--------|
| Prereq | Renderer gaps | 15 missing component renderers → all 34 catalog components render | **NOT STARTED — HIGHEST PRIORITY** |
| 1 | Foundation | Enforced minimum variety via structural scoring + correction loop | **Phase 4 complete, Phase 3 remaining** |
| 2 | Domain Bundles + Style Intelligence | Domain-adaptive designs, effect packs, PRD-derived style, direct editing extensions | Not started |
| 3 | Exemplar Evaluation | Calibrated scoring from good/bad design examples | Not started |
| 4 | Cross-Page Coherence | Project-wide design system governance | Not started |
| 5 | Adaptive Intelligence + Competitor Analysis | Learning, specialized, personalized design evaluation; honest competitor extraction | Long-term |

---

## Priority Order (next steps)

1. **Renderer component gap closure** — 15 components need dedicated renderers. Blocks Tier 1 completion and all downstream tiers. Each renderer is ~50-150 lines following existing patterns.
2. **Phase 3 catalog variants** — completes Tier 1 Foundation. Small scope: add card/section variants to catalog YAML + prompt builder update.
3. **Tier 2: Domain bundles + effect packs** — the "same PRD, five domains" demo. Requires renderer gap closed + Tier 1 complete.

---

## Meta

- Update this vision doc when a tier completes or when new research changes the trajectory.
- Each tier's research references should be verified against current state of the art before implementation — research from 2025 may be superseded.
- This doc captures strategic direction. Tactical tasks live in `execution-plan.md`. Decision rationale lives in `design-decisions.md` §9.
