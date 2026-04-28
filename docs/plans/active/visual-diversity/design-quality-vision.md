# UX Design Quality Roadmap

> Strategic evolution from baseline generated designs to state-of-the-art automated design quality.
> Each tier builds on the previous. Research backing for each decision is in [`docs/design-decisions.md` Section 9](../../design-decisions.md).

## Related Documents

- **Execution plan:** `docs/plans/active/visual-diversity/execution-plan.md` (tactical tasks)
- **Design decisions:** `docs/design-decisions.md` Section 9 (research rationale)
- **ADR-035:** Catalog-first component model
- **Vision:** `docs/vision.md` Layer 7 (Design pipeline)

---

## Current Position (2026-04-27)

**What works:**
- Five container treatments defined in prompts (elevated, outlined, flat, inset, separated)
- Renderer handles all treatments correctly (E2E-verified)
- Design prompts include "3+ sections MUST use 2+ treatments" rule
- 19/24 NodeSpec field budget available (5 slots of headroom)
- TracedProvider captures all LLM I/O in Langfuse for debugging

**What doesn't work yet:**
- LLM still produces monotonous treatments despite prompt rules (Phase 2.6 finding)
- No catalog variants — all cards/sections use the same base component
- No domain awareness — a finance app and a social app get identical treatment patterns

---

## Tier 1: Foundation (Phases 3-4) <-- YOU ARE HERE

**Status:** Phase 4 complete (2026-04-27). Phase 3 not started.

### What's included

| Item | Phase | Description |
|------|-------|-------------|
| Evaluator diversity scoring | 4.1-4.2 | Structural post-processing counts treatment types per page. Deducts 10 points if 3+ sections all use one treatment. Issues trigger correction loop. |
| Vision LLM diversity guidance | 4.1 | `EVALUATION_SYSTEM_PROMPT` teaches the evaluator to flag visual monotony in screenshots. |
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

None. Foundation tier.

---

## Tier 2: Domain Intelligence (Phases 5-6)

**Status:** Not started. Prerequisite: Tier 1 complete.

### What's included

| Item | Phase | Description |
|------|-------|-------------|
| Domain detection | 5.1-5.2 | Keyword-based domain bridge identifies app category (finance, social, healthcare, e-commerce, etc.) from PRD/description. |
| Domain-specific treatment patterns | 5.3 | Design prompt receives domain context: finance apps favor data-dense layouts with outlined/flat treatments; social apps favor card-heavy elevated layouts. |
| Reference image support | 5.4 | Users can supply reference screenshots as vision input to the design LLM, anchoring style expectations. |
| Pattern library | 5.5 | Global pattern library in `packages/core/src/catalogs/patterns/` with domain-specific archetypes. |

### What this achieves

- **Domain-appropriate designs**: a finance dashboard looks like a finance dashboard, not a generic card grid.
- **User-guided style anchoring**: reference images let users show the LLM what "good" looks like for their domain.
- **Pattern reuse**: common layouts (data table + filters, card grid + pagination, form wizard) are pre-defined patterns, not reinvented per generation.

### Key research references

- [From Concept to Manufacturing: VLMs for Engineering Design (Springer 2025)](https://link.springer.com/article/10.1007/s10462-025-11290-y): VLMs perform best on design tasks when given domain-specific context and constraints.
- [AI4Design: Generative AI for Creativity in Design (ScienceDirect 2025)](https://www.sciencedirect.com/science/article/pii/S2666920X25000414): Reference images significantly improve design output quality.

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

- [UI Design with LLMs: Generation Diversity (GD)](https://arxiv.org/html/2412.20071v3): Perceptual hashing measures low-level visual diversity. Larger average distances indicate broader variety. Valuable for detecting failure cases where outputs are overly uniform.
- [Comparative Evaluation of Perceptual Hashing (MDPI 2025)](https://www.mdpi.com/2079-9292/15/7/1493): CNN-based embeddings outperform classical perceptual hashes for robustness in high-diversity environments. Consider CNN approach for production.

---

## Tier 5: Adaptive Design Intelligence

**Status:** Long-term. Prerequisite: Tiers 1-3 complete.

### What's included

| Item | Description |
|------|-------------|
| Embedding-based diversity scoring | Map designs to high-dimensional vector spaces via VLM embeddings. Quantify diversity using UMAP/DBSCAN clustering and PCA eigenvalue dispersion analysis. |
| Multi-agent specialized reviewers | Separate evaluator agents for typography, color harmony, composition, and content organization (AAAI agentic framework). Meta-agent orchestrates and aggregates. |
| Personalized evaluation models | Fine-tune evaluation on project-specific design language. The evaluator learns what "good" means for this specific design system, not generic design principles. |
| Real-time design governance | Live evaluation feedback in the design editor (dashboard), not just post-generation scoring. |

### What this achieves

- **Production-grade automated design governance**: moves from "does the design meet minimum standards?" to "does the design match the project's specific design language?"
- **Continuous quality improvement**: the system learns from corrections and user feedback, getting better over time.
- **Specialized depth**: each reviewer agent develops expertise in its domain (typography agent understands kerning and line-height; color agent understands contrast ratios and palette harmony).

### Key research references

- [LiveIdeaBench: LLM Ideation Benchmark](https://www.emergentmind.com/topics/liveideabench): Embedding-based diversity metrics using UMAP/DBSCAN clustering and PCA eigenvalue analysis for quantitative diversity assessment.
- [Agentic Design Review System (AAAI 2025)](https://arxiv.org/html/2508.10745): Multi-agent specialization outperforms single-evaluator approaches. Static agents handle universal principles; dynamic agents adapt contextually.
- [Personalized Visual Design Evaluation](https://www.emergentmind.com/topics/personalized-visual-design-evaluation): Tailoring evaluation to specific users/projects improves accuracy across UI design, interior styling, and accessibility.
- [AI-Augmented Design Systems (2026)](https://www.parallelhq.com/blog/automating-design-systems-with-ai): 62% reduction in design inconsistencies, 78% workflow efficiency improvement reported with AI governance.

---

## Tier Summary

| Tier | Focus | Key Capability | Status |
|------|-------|----------------|--------|
| 1 | Foundation | Enforced minimum variety via structural scoring + correction loop | **IN PROGRESS** |
| 2 | Domain Intelligence | Domain-appropriate designs with reference image anchoring | Not started |
| 3 | Exemplar Evaluation | Calibrated scoring from good/bad design examples | Not started |
| 4 | Cross-Page Coherence | Project-wide design system governance | Not started |
| 5 | Adaptive Intelligence | Learning, specialized, personalized design evaluation | Long-term |

---

## Meta

- Update this roadmap when a tier completes or when new research changes the trajectory.
- Each tier's research references should be verified against current state of the art before implementation — research from 2025 may be superseded.
- This roadmap captures strategic direction. Tactical tasks live in `execution-plan.md`.
