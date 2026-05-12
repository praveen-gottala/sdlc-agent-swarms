# Pending Backstage Review Files

**47 entries** remaining across **9 batches** (Batches 4–12). Child plans 17+ will be created as reviews complete.

## How to use this file

For each file below, copy the prompt into a new Claude Code session. Each prompt is self-contained — it provides the issue description, runs the review, creates the child plan, checks for cross-plan conflicts, and updates the master plan. No prior context needed.

After completing a review, mark it done in this file and update the child plan number.

Alternatively, use `run-next-review.md` to auto-pick the next `[ ] Planned` entry.

---

## Batch summary

| Batch | Name | Files | Priority | Parallelization |
|-------|------|-------|----------|-----------------|
| 4 | Architecture Core | 5 | P0 | Run first — cited by everything |
| 5 | Architecture Detail | 5 | P1 | After Batch 4, parallel with 6 |
| 6 | Overview + Gateways | 5 | P1 | After Batch 4, parallel with 5 |
| 7 | Specifications | 4 | P2 | Parallel with 8, 9 |
| 8 | CLI + Pipeline Guides | 5 | P2 | Parallel with 7, 9 |
| 9 | Feature Workflow Guides | 6 | P2 | Parallel with 7, 8 |
| 10 | Infra & Ops Guides | 5 | P3 | Parallel with 11, 12 |
| 11 | Reference | 6 | P3 | Parallel with 10, 12 |
| 12 | Research | 6 | P4 | Parallel with 10, 11 |

**Excluded from review:** ADRs (fixed-format), Internal section (AI-loaded rules/skills), PRD.md (uses `/review-prd-compliance`), vision.md (canonical authority), pending-evaluation, test fixtures, audits, self-correction, archive, issues, plans, lessons-learned files (operational format).

---

## Batch 4: Architecture Core (P0)

These are the core architecture pages that explain the spine model and system design. Cited by nearly every other doc — review first to establish accurate baselines.

### 17. `docs/architecture/spine-pattern.md` — core architecture mental model

THE page that explains the spine pattern (concept-level). May have aspirational present tense for unbuilt stages. Cited by spine-implementation.md, architecture.md, and most concept pages.

```
/backstage review docs/architecture/spine-pattern.md

After the review is complete: add this as child plan 17 to docs/plans/active/backstage-improvements/. This is the foundational architecture page — check whether stage descriptions match vision.md Layer 3 locked decisions, whether stage status claims match codebase reality (only Clarifier and Design stages implemented), and whether the page follows concept-page voice rules (strengths not defenses, earn insider concepts). Review all existing child plans (1-16) in docs/plans/active/backstage-improvements/ for conflicts. Check the master plan's cross-plan decisions (D1-D14) for any that affect this page (especially D1 spine diagram colors, D7 scope boundary with spine-implementation.md). Update affected child plans and the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [x] Done — Child Plan 17 created (spine-pattern-review.md, 7 findings: 0 critical, 4 important, 3 polish)

---

### 18. `docs/architecture/spine-implementation.md` — implementation detail for all stages

538-line stage detail. Gate numbering may conflict with vision.md. Status claims for unbuilt stages (Architect, Reviewer) may be misleading. Referenced by D7, D10, D12 scope boundaries.

```
/backstage review docs/architecture/spine-implementation.md

After the review is complete: add this as child plan 18 to docs/plans/active/backstage-improvements/. This page is the implementation counterpart to spine-pattern.md (D7 scope boundary). Check whether HITL gate descriptions match hitl-governance.md (D10), whether design pipeline integration section matches design-pipeline.md (D12), whether state persistence details match state-persistence.md (D13). Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [x] Done — Child Plan 18 created (5 findings: 0 critical, 2 important, 3 polish)

---

### 19. `docs/design-decisions.md` — cross-cutting design decisions

716-line decision record. Contains "AgentForge" references. May reference superseded patterns (event bus as coordination, parallel code agents). Linked from Architecture nav.

```
/backstage review docs/design-decisions.md

After the review is complete: add this as child plan 19 to docs/plans/active/backstage-improvements/. Check for stale "AgentForge" brand references (should be CHIP), superseded architectural patterns that conflict with vision.md and spine-pattern.md, and decisions that have been formalized into ADRs but not cross-referenced. Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [x] Done — Child Plan 19 created (3 findings: 0 critical, 1 important, 2 polish)

---

### 20. `docs/architecture/agent-contracts.md` — agent interface contracts

"AgentForge" in first sentence. Contract schema may not reflect post-spine agent model (4-stage spine + specialists vs. old flat agent network).

```
/backstage review docs/architecture/agent-contracts.md

After the review is complete: add this as child plan 20 to docs/plans/active/backstage-improvements/. Check whether contract schemas match the spine + specialist model from vision.md Layer 3, whether the page references the correct agent taxonomy (cross-check with concepts/agent-taxonomy.md per child plan 2). Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [x] Done — Child Plan 20 created (7 findings: 2 critical, 3 important, 2 polish)

---

### 21. `docs/architecture/design-pipeline-dataflow.md` — pipeline dataflow architecture

1107-line dataflow doc. May describe pre-unification pipeline stages (superseded by ADR-046 unified design pipeline). Stale brand likely.

```
/backstage review docs/architecture/design-pipeline-dataflow.md

After the review is complete: add this as child plan 21 to docs/plans/active/backstage-improvements/. Check whether pipeline stages match the unified pipeline from ADR-046 (not the old 4-stage standalone pipeline). Cross-check with design-pipeline.md concept page (child plan 9, D12 scope). Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [x] Done — Child Plan 21 created (4 findings: 0 critical, 2 important, 2 polish)

---

## Batch 5: Architecture Detail (P1)

Architecture pages for specific subsystems. Lower traffic than core pages but still user-facing in the Architecture nav.

### 22. `docs/architecture/design-evaluator.md` — design evaluator architecture

Evaluator deferred to Phase 2 (ADR-045), then partially built in visual-diversity Phase 3.7-3.8. Page may describe aspirational scoring as if current.

```
/backstage review docs/architecture/design-evaluator.md

After the review is complete: add this as child plan 22 to docs/plans/active/backstage-improvements/. Check whether evaluator capabilities described match current implementation (progressive evaluator from visual-diversity Phase 3.8, not the full evaluator deferred in ADR-045). Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [ ] Planned

---

### 23. `docs/architecture/prototype-rendering-dataflow.md` — prototype rendering flow

May reference Penpot-specific rendering paths superseded by browser-default design tool (ADR-047). Dataflow may not reflect current DesignSpecRenderer architecture.

```
/backstage review docs/architecture/prototype-rendering-dataflow.md

After the review is complete: add this as child plan 23 to docs/plans/active/backstage-improvements/. Check whether rendering paths reference Penpot (superseded by ADR-047 browser-default) and whether the dataflow matches current DesignSpecRenderer in packages/designspec-renderer/. Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [ ] Planned

---

### 24. `docs/architecture/error-handling.md` — error handling patterns

Contains "AgentForge" brand. Short page. Needs brand fix and alignment check with vision.md (Result pattern, no-throw convention).

```
/backstage review docs/architecture/error-handling.md

After the review is complete: if 3+ findings, add as child plan 24 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 25. `docs/architecture/component-catalog.md` — component catalog

Title may read like a task heading rather than architecture documentation. May need reframing as a reference for the catalog-first component model (ADR-035).

```
/backstage review docs/architecture/component-catalog.md

After the review is complete: if 3+ findings, add as child plan 25 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 26. `docs/architecture/provider-abstraction.md` — provider layer architecture

Opens with raw TypeScript code, no context. May not reflect ADR-033 configurable model resolution or current ProviderConfig auth patterns.

```
/backstage review docs/architecture/provider-abstraction.md

After the review is complete: if 3+ findings, add as child plan 26 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

## Batch 6: Overview + Gateways (P1)

Site entrance pages and section gateways. High visibility — these are the first pages many readers see.

### 27. `docs/index.md` — home page

First page visitors see. May have D1-flagged spine stage colors without legend. "Single invariant" principle may be unearned for cold readers (insider concept before explanation).

```
/backstage review docs/index.md

After the review is complete: add this as child plan 27 to docs/plans/active/backstage-improvements/. This is the highest-traffic page. Check voice rules (no competitor-bashing, earn insider concepts, don't duplicate nav), D1 spine diagram colors, and whether stage descriptions match current implementation status. Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [ ] Planned

---

### 28. `docs/roadmap.md` — project roadmap

Phase completion status claims may be stale. Sequencing may not reflect current priority order (e.g., visual diversity, clarifier initiative priorities).

```
/backstage review docs/roadmap.md

After the review is complete: add this as child plan 28 to docs/plans/active/backstage-improvements/. Check whether phase statuses match CLAUDE.md "Current State" and active plans. Verify timeline claims against actual completion dates. Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [ ] Planned

---

### 29. `docs/concepts/current-status.md` — current project status

Status claims need verification against codebase reality. May reference old brand or stale feature states.

```
/backstage review docs/concepts/current-status.md

After the review is complete: add this as child plan 29 to docs/plans/active/backstage-improvements/. Check every status claim against current code and CLAUDE.md "Current State." This page must reflect reality — stale status is worse than no status. Review all existing child plans (1-16) for conflicts. Check cross-plan decisions D1-D14. Update the master plan accordingly. Update CLAUDE.md plan #8 status. Don't execute yet.
```

**Status:** [ ] Planned

---

### 30. `docs/specs/README.md` — specifications overview

Short gateway page. May need expansion to describe sub-spec coverage and reading guidance for the specs section.

```
/backstage review docs/specs/README.md

After the review is complete: if 3+ findings, add as child plan 30 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 31. `docs/guides/README.md` — how-to guides overview

"AgentForge" in line 2. Short gateway for 17 guides with no reading guidance or categorization.

```
/backstage review docs/guides/README.md

After the review is complete: if 3+ findings, add as child plan 31 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

## Batch 7: Specifications (P2)

Spec documents beyond PRD and sdlc-agents (already covered). Format and voice check — factual accuracy critical for spec pages.

### 32. `docs/specs/platform-architecture.md` — platform architecture spec

5 "AgentForge" references. Framework architecture spec may describe pre-spine patterns (5-phase model, event bus coordination).

```
/backstage review docs/specs/platform-architecture.md

After the review is complete: if 3+ findings, add as child plan 32 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 33. `docs/specs/governance-and-operations.md` — governance and operations spec

3 "AgentForge" references. HITL spec content may conflict with hitl-governance.md concept page (D10 scope boundary).

```
/backstage review docs/specs/governance-and-operations.md

After the review is complete: if 3+ findings, add as child plan 33 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. Check HITL content against child plan 8 (hitl-governance.md) and D10 content ownership. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 34. `docs/specs/dashboard.md` — dashboard spec

7 "AgentForge" references (highest of any uncovered file). May reference architecture.md as source of truth (D8 scope).

```
/backstage review docs/specs/dashboard.md

After the review is complete: if 3+ findings, add as child plan 34 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. Check architecture citations against child plan 6 (architecture.md) and D8 downstream consumers. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 35. `docs/specs/appendices.md` — spec appendices

6 "AgentForge" references. Tech stack listing and milestone dates may be stale.

```
/backstage review docs/specs/appendices.md

After the review is complete: if 3+ findings, add as child plan 35 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

## Batch 8: CLI + Pipeline Guides (P2)

User-facing CLI reference and design pipeline guide. Users follow these to operate the system.

### 36. `docs/cli/README.md` — CLI overview

Stale brand in subtitle. Command listings may reference removed or renamed commands.

```
/backstage review docs/cli/README.md

After the review is complete: if 3+ findings, add as child plan 36 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 37. `docs/cli/setup.md` — CLI setup guide

Config paths, env vars, init wizard steps may have changed since ADR-019 (TTY requirement). Setup instructions must match current `agentforge init` behavior.

```
/backstage review docs/cli/setup.md

After the review is complete: if 3+ findings, add as child plan 37 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 38. `docs/cli/design.md` — CLI design commands

606 lines. May describe pre-unification pipeline commands (ADR-046). Command arguments and examples must match current CLI implementation.

```
/backstage review docs/cli/design.md

After the review is complete: if 3+ findings, add as child plan 38 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 39. `docs/cli/orchestration.md` — CLI orchestration commands

May use stale 5-phase terminology instead of 4-stage spine. Orchestration commands may reference deprecated Python engine.

```
/backstage review docs/cli/orchestration.md

After the review is complete: if 3+ findings, add as child plan 39 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 40. `docs/guides/design-generation.md` — design generation guide

Cites vision.md Layer 7. May describe pre-unification design steps that no longer match the pipeline.

```
/backstage review docs/guides/design-generation.md

After the review is complete: if 3+ findings, add as child plan 40 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

## Batch 9: Feature Workflow Guides (P2)

Guides for specific feature workflows. Procedural docs — check command accuracy and config values.

### 41. `docs/guides/cli-design-commands.md` — CLI design commands guide

Cross-references two other design docs. Potential content overlap or duplication with cli/design.md.

```
/backstage review docs/guides/cli-design-commands.md

After the review is complete: if 3+ findings, add as child plan 41 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 42. `docs/guides/agent-model-guide.md` — agent model configuration guide

References ADR-033 (configurable model resolution). Model config patterns and supported providers may have evolved.

```
/backstage review docs/guides/agent-model-guide.md

After the review is complete: if 3+ findings, add as child plan 42 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 43. `docs/guides/failure-mode-testing.md` — failure mode testing guide

May not cover spine-specific failure modes (stage retry, checkpoint recovery). Testing patterns may reference old pipeline architecture.

```
/backstage review docs/guides/failure-mode-testing.md

After the review is complete: if 3+ findings, add as child plan 43 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 44. `docs/guides/messaging-integration.md` — messaging integration guide

"Two-Layer Abstraction" may describe patterns superseded by event bus demotion to telemetry plane (vision Layer 2).

```
/backstage review docs/guides/messaging-integration.md

After the review is complete: if 3+ findings, add as child plan 44 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 45. `docs/guides/planning-docs.md` — planning docs guide

Meta-guide about planning workflow. May be superseded by current plan skill system (`/create-plan`, `/challenge-plan`).

```
/backstage review docs/guides/planning-docs.md

After the review is complete: if 3+ findings, add as child plan 45 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 46. `docs/guides/viewport-config.md` — viewport configuration guide

Self-contained guide. Needs config path and default value verification against current implementation.

```
/backstage review docs/guides/viewport-config.md

After the review is complete: if 3+ findings, add as child plan 46 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

## Batch 10: Infra & Ops Guides (P3)

Infrastructure setup and operations guides. Lower traffic but critical when users need them.

### 47. `docs/guides/design-studio-logging.md` — design studio logging guide

May reference pre-Langfuse logging patterns (ADR-052 introduced Langfuse observability).

```
/backstage review docs/guides/design-studio-logging.md

After the review is complete: if 3+ findings, add as child plan 47 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 48. `docs/guides/langfuse-setup.md` — Langfuse setup guide

Env var names need verification (child plan 11 found wrong env var pattern `LANGFUSE_HOST` → `LANGFUSE_BASE_URL`). Setup steps must match current docker-compose config.

```
/backstage review docs/guides/langfuse-setup.md

After the review is complete: if 3+ findings, add as child plan 48 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. Check env var names against child plan 11 (observability.md) findings. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 49. `docs/guides/design-pipeline-unification-review-notes.md` — pipeline unification review notes

Dated 2026-04-24 review notes. May be a historical artifact misplaced in guides — should possibly be in reference or archive.

```
/backstage review docs/guides/design-pipeline-unification-review-notes.md

After the review is complete: if 3+ findings, add as child plan 49 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Flag whether this file belongs in guides/ or should move to reference/. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 50. `docs/guides/backstage-techdocs-local-preview.md` — TechDocs local preview guide

Setup steps may be stale if Backstage config or mkdocs extensions changed since initial setup.

```
/backstage review docs/guides/backstage-techdocs-local-preview.md

After the review is complete: if 3+ findings, add as child plan 50 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 51. `docs/guides/backstage-developer-portal.md` — developer portal guide

Portal integration status claims need verification. Setup instructions must match current Backstage config (ADR-051).

```
/backstage review docs/guides/backstage-developer-portal.md

After the review is complete: if 3+ findings, add as child plan 51 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

## Batch 11: Reference (P3)

Reference materials. Less narrative than concept pages but still user-facing. Check for stale status claims and superseded patterns.

### 52. `docs/reference/README.md` — reference overview

Short gateway page. May need expansion to describe sub-page coverage and reading guidance.

```
/backstage review docs/reference/README.md

After the review is complete: if 3+ findings, add as child plan 52 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 53. `docs/reference/failure-modes.md` — failure modes reference

"Phase 1 Critical Failures" may use stale phase terminology (5-phase → 4-stage spine).

```
/backstage review docs/reference/failure-modes.md

After the review is complete: if 3+ findings, add as child plan 53 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 54. `docs/reference/pipeline-improvements.md` — pipeline improvements reference

May have stale plan completion statuses. Improvement proposals may have been implemented or superseded.

```
/backstage review docs/reference/pipeline-improvements.md

After the review is complete: if 3+ findings, add as child plan 54 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 55. `docs/reference/plan-prompt-quality.md` — plan prompt quality reference

"PARTIALLY RESOLVED" status may need updating for current pipeline. Quality criteria may reference old pipeline stages.

```
/backstage review docs/reference/plan-prompt-quality.md

After the review is complete: if 3+ findings, add as child plan 55 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 56. `docs/reference/prototype-limitations.md` — prototype limitations reference

May reference Penpot-specific limitations superseded by browser-default design tool (ADR-047).

```
/backstage review docs/reference/prototype-limitations.md

After the review is complete: if 3+ findings, add as child plan 56 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 57. `docs/reference/v2-readiness-certification.md` — V2 readiness certification

Certification dated 2026-03-18. Criteria validity and completion status need checking against current codebase.

```
/backstage review docs/reference/v2-readiness-certification.md

After the review is complete: if 3+ findings, add as child plan 57 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

## Batch 12: Research (P4)

Time-stamped investigation docs. Review for patterns described as current that are now superseded — not for general narrative quality. These are investigative records, not concept pages.

### 58. `docs/research/architect-design.md` — architect design alternatives

Design alternatives that may be mistaken by readers for current decisions. Check whether conclusions align with implemented architecture.

```
/backstage review docs/research/architect-design.md

After the review is complete: if 3+ findings, add as child plan 58 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 59. `docs/research/architect-codebase-grounded-design.md` — codebase-grounded design research

644 lines. May reference refactored code paths or file locations that have moved.

```
/backstage review docs/research/architect-codebase-grounded-design.md

After the review is complete: if 3+ findings, add as child plan 59 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 60. `docs/research/clarifier-research.md` — clarifier competitive analysis

Competitive analysis of clarification tools. Tool capabilities and landscape may have changed.

```
/backstage review docs/research/clarifier-research.md

After the review is complete: if 3+ findings, add as child plan 60 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 61. `docs/research/clarifier-question-generation.md` — question generation research

Not in mkdocs.yml nav but exists on disk. Referenced as authoritative source by concept page (child plan 14). Review should flag the nav omission.

```
/backstage review docs/research/clarifier-question-generation.md

After the review is complete: if 3+ findings, add as child plan 61 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. Flag that this file is NOT in mkdocs.yml nav despite being cited by concepts/clarifier-question-generation.md. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 62. `docs/research/planning-methodology-investigation.md` + `docs/research/planning-methodology-counter-analysis.md` — planning methodology research pair

Companion investigation and counter-analysis docs. Review together for internal consistency. Dated 2026-04-27.

```
/backstage review docs/research/planning-methodology-investigation.md

After the review is complete: also review docs/research/planning-methodology-counter-analysis.md (companion doc — review both for consistency). If 3+ combined findings, add as child plan 62 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

### 63. `docs/research/visual-diversity-investigation.md` — visual diversity research

514 lines. May reference restructured pipeline stages (pre-unification terminology).

```
/backstage review docs/research/visual-diversity-investigation.md

After the review is complete: if 3+ findings, add as child plan 63 to docs/plans/active/backstage-improvements/ following the standard conflict-check process. If fewer than 3 findings, note as "confirmed clean — minor fixes only" in the master plan and apply fixes inline without a child plan. Update CLAUDE.md plan #8 status either way. Don't execute child plan fixes yet.
```

**Status:** [ ] Planned

---

## Parallelization guide

Batches with no cross-dependencies can run in separate Claude Code sessions simultaneously:

- **Batch 4** must complete first (architecture core pages are cited by everything else)
- **Batches 5 + 6** can run in parallel after Batch 4
- **Batches 7 + 8 + 9** can all run in parallel (specs and guides are independent at review stage)
- **Batches 10 + 11 + 12** can all run in parallel (infra guides, reference, research are independent)

Within each group, start any batch — order does not matter. Cross-plan conflicts discovered during review will be logged as new D-number decisions (D15+) in the master plan.

---

## Completed Batches

<details>
<summary>Batches 1–3 (16 files — all done, child plans 1–16 created)</summary>

### Batch 1 (child plans 1–5)

| # | File | Child Plan |
|---|------|-----------|
| 1 | `docs/concepts/overview.md` | concepts-overview-review.md |
| 2 | `docs/concepts/agent-taxonomy.md` | agent-taxonomy-review.md |
| 3 | `docs/research/research-report.md` | research-report-review.md |
| 4 | `docs/concepts/clarifier-pipeline.md` | clarifier-pipeline-review.md |
| 5 | `docs/concepts/coordination-and-state.md` | coordination-state-review.md |

### Batch 2 (child plans 6–10)

| # | File | Child Plan |
|---|------|-----------|
| 6 | `docs/architecture/architecture.md` | architecture-review.md |
| 7 | `docs/specs/sdlc-agents.md` | sdlc-agents-review.md |
| 8 | `docs/concepts/hitl-governance.md` | hitl-governance-review.md |
| 9 | `docs/concepts/design-pipeline.md` | design-pipeline-review.md |
| 10 | `docs/concepts/state-persistence.md` | state-persistence-review.md |

### Batch 3 (child plans 11–16)

| # | File | Child Plan |
|---|------|-----------|
| 11 | `docs/concepts/observability.md` | observability-review.md |
| 12 | `docs/concepts/rag-context.md` | rag-context-review.md |
| 13 | `docs/concepts/dashboard-architecture.md` | dashboard-architecture-review.md |
| 14 | `docs/concepts/clarifier-question-generation.md` | clarifier-question-generation-review.md |
| 15 | `docs/architecture/vision-overview.md` | vision-overview-review.md |
| 16 | `docs/architecture/README.md` | architecture-readme-review.md |

</details>

---

## Summary

| Batch | Files | Priority | Status |
|-------|-------|----------|--------|
| 1 (done) | 5 | High | Child plans 1–5 created |
| 2 (done) | 5 | Medium-High | Child plans 6–10 created |
| 3 (done) | 6 | Low | Child plans 11–16 created |
| 4 | 5 | P0 | Planned |
| 5 | 5 | P1 | Planned |
| 6 | 5 | P1 | Planned |
| 7 | 4 | P2 | Planned |
| 8 | 5 | P2 | Planned |
| 9 | 6 | P2 | Planned |
| 10 | 5 | P3 | Planned |
| 11 | 6 | P3 | Planned |
| 12 | 6 | P4 | Planned |
| **Total** | **63 entries** | | **16 done, 47 planned** |
