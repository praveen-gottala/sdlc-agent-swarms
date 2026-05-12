# CHIP Documentation Reorganization — Phased Plan

!!! note "Skill renamed"

    The `/create-backstage-doc` skill referenced below was renamed to `/backstage` with subcommand routing. Current usage: `/backstage create <type> <topic>` and `/backstage sync`. Invocations below use the original name as they were at time of completion.

## Context

CHIP has 173 docs organized by document type (specs, ADRs, plans) rather than reader journey. Three audiences need different things:
- **Leadership** — "What is this? Where are we? Where are we going?" — wants summaries, roadmap, status
- **Developers** — "How does this work? How do I contribute?" — wants architecture, guides, ADRs
- **AI agents** — "What's the authority? What are the rules?" — wants lean, canonical files via CLAUDE.md reading order

**Core constraint:** 150+ hardcoded path references across skills, rules, CLAUDE.md, and memory files mean we cannot move or rename existing files without a migration strategy.

**Core insight:** MkDocs nav (`mkdocs.yml`) controls the HUMAN navigation. CLAUDE.md reading order controls the AI navigation. They are independent — we can create a completely different human experience without touching the AI path.

---

## The Human-Rich / AI-Lean Pattern

**Problem:** Rich visual content (diagrams, examples, expanded explanations) helps humans but bloats AI agent context windows. vision.md is already 787 lines (~15K tokens) loaded by 6+ skills.

**Solution: Three tiers of documentation content.**

### Tier 1 — Canonical files (AI + Human)
Existing files like vision.md, PRD.md, lessons-learned-rules.md. Lean, authoritative. AI agents read these via CLAUDE.md reading order. Humans also see them in Backstage but as "deep dives."

### Tier 2 — Handwritten concept pages (Human-only)
New files like `docs/concepts/agent-taxonomy.md`. Written by developers, richer than Tier 1 (diagrams, examples, expanded explanations). NOT in CLAUDE.md reading order — zero AI context bloat. Require manual maintenance when the canonical source changes.

### Tier 3 — Auto-generated pages (Human-only, zero maintenance)
Built by a CI script on every push. Generated FROM Tier 1 files — not maintained by hand. Examples:
- **Current Status dashboard** — parses plan execution-plan.md files, counts `[x]` vs `[ ]`, generates a progress summary
- **Package Index** — reads all `packages/*/package.json`, generates a table with names, descriptions, dependency counts
- **ADR Index** — reads all `docs/adrs/*.md`, extracts title + status, generates a sortable table
- **Architecture diagrams** — Mermaid code blocks in vision.md rendered to SVG images

**How Tier 3 works with Backstage:**
Backstage TechDocs has two builder modes ([docs](https://backstage.io/docs/features/techdocs/configuration/)):
- `builder: 'local'` — Backstage generates docs on-the-fly (current setup, Phase 1)
- `builder: 'external'` — CI/CD pre-generates docs and publishes to storage (recommended for production)

The CI pipeline would:
1. Run a generator script (`scripts/generate-docs.ts`) that reads canonical files and writes Tier 3 `.md` files into a `docs/_generated/` directory
2. Run `@techdocs/cli generate` to build the full MkDocs site (Tiers 1 + 2 + 3)
3. Publish to Backstage storage

**Tier 3 pages are `.gitignored`** — they exist only in the build output. The source repo stays clean. AI agents never see them.

**Maintenance model:**
| Tier | Who maintains | When updated | AI reads? |
|------|--------------|-------------|-----------|
| 1. Canonical | Developers | Manually | Yes |
| 2. Concept pages | Developers | Manually (when canonical changes) | No |
| 3. Auto-generated | CI pipeline | Every push | No |

### Two navigation layers over the same source files.

```
HUMAN PATH (mkdocs.yml → Backstage sidebar):
  Overview > What is CHIP (new, summary)
  Concepts > Clarifier (new, expanded with diagrams)
  Concepts > Design Pipeline (new, expanded)
  Architecture > Vision (existing vision.md)
  ...

AI PATH (CLAUDE.md reading order → raw file reads):
  1. vision.md (canonical, all 15 layers, lean)
  2. PRD.md
  3. lessons-learned-rules.md
  4. adrs/ (as needed)
```

**Rules:**
- **Concept pages** (new files under `docs/concepts/`) are human-only. They are NOT added to CLAUDE.md reading order. AI agents never read them. Zero context bloat.
- **Canonical files** (vision.md, PRD.md, lessons-learned-rules.md) stay lean. They are the authority for both audiences.
- **Concept pages link back** to the canonical source: "Authoritative source: vision.md Layer 5"
- **Canonical files link forward** to concept pages: "For an expanded overview, see concepts/clarifier.md"
- Forward links are inert for AI — agents see the text but don't follow unless instructed.

**Context budget impact:** Zero. New concept pages are additive files that only appear in `mkdocs.yml` nav. AI agents read the same files as before.

---

## Phase 1 — Branding + Nav Reorganization (no new content files) ✅ COMPLETE (2026-04-29)

**Goal:** Fix ARCHON/AgentForge → CHIP in titles. Restructure mkdocs.yml nav from document-type grouping to reader-journey grouping.

**Changes:**
1. Global find-replace in doc titles/headers: ARCHON → CHIP, AgentForge → CHIP
   - Keep `@agentforge` npm package names unchanged (code, not docs)
   - Keep historical references in ADR bodies (e.g., "formerly AgentForge")
2. Restructure `mkdocs.yml` nav:
   ```
   Overview
     Home (existing index.md)
     Roadmap (existing roadmap.md)
   Architecture
     Vision (existing vision.md)
     System Architecture (existing architecture.md)
     Design Decisions (existing)
     Research Report (existing — promoted for leadership)
   Specifications (existing 7 docs)
   How-To Guides (existing guides + CLI docs)
   ADRs (existing 47+, collapsed section)
   Operations
     Active Plans (PROMOTED from Internal)
     Backlog Plans
     Completed Plans
     Known Issues
   Reference
     Lessons Learned Rules (existing)
     Failure Modes, Limitations (existing)
   Internal (audits, archive, test fixtures)
   ```

**Impact on skills/agents:** None. No files moved or renamed. Only mkdocs.yml changes.
**Estimate:** ~1-2 hours.

---

## Phase 2 — Concept Pages + `/create-backstage-doc` Skill ✅ COMPLETE (2026-04-30)

**Goal:** Create initial concept pages AND codify the documentation methodology as a reusable skill.

**What shipped:**
- 7 concept pages under `docs/concepts/` (overview, agent-taxonomy, design-pipeline, coordination-and-state, hitl-governance, observability, current-status)
- Forward links in vision.md (Layers 2-5, 7-11)
- Concepts section in mkdocs.yml nav
- Mermaid rendering: `pymdownx.superfences` config in mkdocs.yml + `backstage-plugin-techdocs-addon-mermaid` in Backstage app
- "Open source" / "Apache 2.0" removed from all docs (proprietary)

**Skill created:** `/create-backstage-doc` at `.claude/skills/create-backstage-doc/SKILL.md`
- 5 doc types: `concept`, `tutorial`, `guide`, `architecture`, `status`
- Competitor-swap test as the load-bearing editorial principle
- Audience-aware templates (leadership vs developer vs AI agent)
- Diagram rules: full diagram first (with interactive link to Mermaid Live Editor / Excalidraw), then sliced sub-diagrams for explanation
- Length guidance: split into sub-pages, never cut substantive content
- Mechanical verification: 3 quoted swap-test sentences in every run report
- Citation discipline: open the cited file, quote the specific claim — no paraphrasing from memory

**Template superseded.** The Phase 2 concept template (Summary/How It Works/Current State) was replaced during implementation. The authoritative templates now live in the skill file. All future Tier 2 docs use `/create-backstage-doc`.

---

## Phase 3 — Vision.md Refresh (content improvements to the canonical file) ✅ COMPLETE (2026-04-30)

**Goal:** Make vision.md itself friendlier without breaking its authority role. Changes are additive — no content removed.

**All items complete:**
- ~~Fix title: "ARCHON / AgentForge" → "CHIP — Architecture Vision"~~ ✅ Phase 1
- ~~Forward links to concept pages~~ ✅ Phase 2 + Phase 7 MEDIUM (Layers 4, 6, 14)
- ~~Add executive summary (5 lines) before Section 0~~ ✅ Phase 3
- ~~Add "Where We Are Today" column to the Layer overview table~~ ✅ Phase 3 — 5 Done, 5 Partial, 3 Not started
- ~~Update stale references (Python engine → deprecation per ADR-043)~~ ✅ Phase 3 — current state, locked decision, open decision updated
- ~~Add Mermaid layer diagram in Section 2~~ ✅ Phase 3 — color-coded diagram (green=done, yellow=partial, grey=not started)
- ~~Add Status column to migration map (Section 16)~~ ✅ Phase 3 — bonus: migration map now shows completion status

**Impact on skills/agents:** Minimal. Executive summary adds ~80 tokens. Layer table adds ~200 tokens. Layer structure preserved.

---

## Phase 4 — Path Registry (preparation for eventual file reorganization) ✅ COMPLETE (2026-04-30)

**Goal:** Decouple skills and rules from hardcoded doc paths by introducing a registry file. This is the prerequisite for any future file moves.

**Create `docs/registry.yaml`:**
```yaml
# Documentation Path Registry
# Skills and rules should reference logical names, not physical paths.
# When files move, update this registry — skills follow automatically.

canonical:
  vision: docs/vision.md
  prd: docs/specs/PRD.md
  lessons-rules: docs/lessons-learned-rules.md
  lessons-full: docs/lessons-learned.md
  architecture: docs/architecture/architecture.md
  roadmap: docs/roadmap.md

plans:
  active: docs/plans/active/
  backlog: docs/plans/backlog/
  completed: docs/plans/completed/

specs:
  platform: docs/specs/platform-architecture.md
  agents: docs/specs/sdlc-agents.md
  governance: docs/specs/governance-and-operations.md
  dashboard: docs/specs/dashboard.md

adrs: docs/adrs/
guides: docs/guides/
concepts: docs/concepts/   # human-only, not in AI reading order
```

**Phase 4 does NOT migrate skills yet** — it creates the registry and documents the pattern. Migration of skills to use the registry is Phase 6 (future work, not in this plan).

**Why a registry?** Currently 150+ hardcoded paths mean any file move requires updating 40+ files. A registry is the indirection layer that makes future moves safe. Skills would read the registry to find paths instead of hardcoding them.

**Impact:** Zero — registry is a new file. No existing behavior changes.
**Estimate:** ~30 minutes to create, ~1 hour to document the migration pattern.

---

## Phase 5 — Tutorials + Getting Started → MOVED TO BACKLOG

**Moved to:** `docs/plans/backlog/docs-tutorials.md`
**Reason:** All infrastructure phases complete. Tutorials are additive content work with no dependencies — safe to defer.

---

## Execution Order

```
Phase 1 (Branding + Nav)       ✅ COMPLETE (2026-04-29)
  ↓
Phase 2 (Concept Pages + Skill)✅ COMPLETE (2026-04-30)
  ↓
Phase 7 (Content Quality Pass) ✅ COMPLETE (2026-04-30) — HIGH + MEDIUM + LOW, 12 pages
  ↓
Phase 3 (Vision Refresh)       ✅ COMPLETE (2026-04-30) — executive summary, status columns, Mermaid diagram, Python deprecation
  ↓
Phase 5 (Tutorials + Guide)    → MOVED TO BACKLOG (docs/plans/backlog/docs-tutorials.md)
  ↓
Phase 6 (Auto-Generated)       ✅ COMPLETE (2026-04-30) — generate-docs.ts, 3 generated pages, mkdocs nav
  ↓
Phase 4 (Path Registry)        ✅ COMPLETE (2026-04-30) — docs/registry.yaml, migration pattern documented
```

Phases 1-4, 6, and 7 COMPLETE. Phase 5 (tutorials) moved to backlog. This plan is effectively done — all infrastructure and content phases shipped.

**Completed effort:** ~17 hours (Phases 1-4, 6, 7).

---

## Phase 6 — Auto-Generated Enrichment Layer (Tier 3) ✅ COMPLETE (2026-04-30)

**Goal:** CI pipeline generates rich human-only pages from canonical sources on every push. Zero manual maintenance.

**Already done (Phase 2):**
- ~~Mermaid rendering~~ ✅ `pymdownx.superfences` + `backstage-plugin-techdocs-addon-mermaid` installed

**Remaining: Create `scripts/generate-docs.ts`** — TypeScript script that:
1. **Parses plan execution plans** → generates `docs/_generated/current-status.md`
   - Reads every `docs/plans/active/*/execution-plan.md`
   - Counts `- [x]` (done) vs `- [ ]` (pending) checkboxes
   - Outputs a table: Plan name | Progress (e.g., 7/10) | Next task | Link
2. **Parses package.json files** → generates `docs/_generated/package-index.md`
   - Reads every `packages/*/package.json`
   - Extracts: name, description, dependencies (only `@agentforge/*`)
   - Outputs a table with dependency count and links to README
3. **Parses ADR files** → generates `docs/_generated/adr-index.md`
   - Reads every `docs/adrs/ADR-*.md`
   - Extracts: number, title, status (from `## Status` line)
   - Outputs a sortable table: ADR# | Title | Status | Date

**Add to `.gitignore`:** `docs/_generated/`

**Impact on AI agents:** Zero. Generated files are gitignored.
**Estimate:** ~3 hours (script + CI workflow).

---

## Phase 7 — Content Quality Pass (using `/create-backstage-doc`)

**Goal:** Apply the skill to existing pages and fill coverage gaps identified by docs site audit (2026-04-30).

All pages created or revised via `/create-backstage-doc <type> <topic>`. The skill enforces the competitor-swap test, citation discipline, diagram rules, and audience-appropriate content.

### HIGH priority (leadership visibility) ✅ COMPLETE (2026-04-30)

| # | Invocation | Target | Status |
|---|-----------|--------|--------|
| 1 | `/create-backstage-doc concept overview` | `docs/concepts/overview.md` | ✅ Rewritten with "why CHIP" positioning citing research/research-report.md + design-decisions.md |
| 2 | `/create-backstage-doc architecture design-evaluator` | `docs/architecture/design-evaluator.md` | ✅ Added sample evaluations (pass/fail), 80/100 threshold explanation, correction loop walkthrough |
| 3 | `/create-backstage-doc status current-status` | `docs/concepts/current-status.md` | ✅ Narrative callouts for "Partial" layers, dependency flow, "Tests" → "Role" column rename |

### MEDIUM priority (developer onboarding) ✅ COMPLETE (2026-04-30)

| # | Invocation | Target | Status |
|---|-----------|--------|--------|
| 4 | `/create-backstage-doc guide design-generation` | `docs/guides/design-generation.md` | ✅ Rewritten from 835-line implementation plan to 121-line guide with pipeline stages, CLI steps, troubleshooting |
| 5 | `/create-backstage-doc concept coordination-and-state` | `docs/concepts/coordination-and-state.md` | ✅ Added worked example: `ClarifierStateAnnotation` with 15 typed channels, reducer strategies, HITL interrupts |
| 6 | `/create-backstage-doc concept rag-context` | `docs/concepts/rag-context.md` | ✅ NEW: 5-tool taxonomy, hybrid search pipeline diagram, indexing/search/repo-map walkthrough |
| 7 | `/create-backstage-doc concept dashboard-architecture` | `docs/concepts/dashboard-architecture.md` | ✅ NEW: 15-route table, 5-section sidebar groups, backend communication patterns, build requirements |
| 8 | `/create-backstage-doc guide cli-design-commands` | `docs/guides/cli-design-commands.md` | ✅ NEW: 10-command reference with decision tree, flag tables, troubleshooting |
| 9 | `/create-backstage-doc concept state-persistence` | `docs/concepts/state-persistence.md` | ✅ NEW: 3-tier persistence model, checkpointer factory code, YAML loaders table, human-edit protection |

### LOW priority (nice to have) ✅ COMPLETE (2026-04-30)

| # | Invocation | Target | Status |
|---|-----------|--------|--------|
| 10 | `/create-backstage-doc guide failure-mode-testing` | `docs/guides/failure-mode-testing.md` | ✅ NEW: F1/F2/F3/F11 reproduction steps, mock provider usage, "not yet testable" table |
| 11 | `/create-backstage-doc guide model-selection` | `docs/guides/agent-model-guide.md` | ✅ Rewritten: corrected model defaults, added persona-based presets (solo/team/CI), marked planned pipelines |
| 12 | `/create-backstage-doc architecture error-handling` | `docs/architecture/error-handling.md` | ✅ Rewritten: pipeline error flow diagram, HITL gate escalation patterns, circuit breaker thresholds |

**Remove test counts from existing concept pages:** ✅ COMPLETE (2026-04-30)
- ~~`docs/concepts/overview.md` — remove "116 tests on the Clarifier graph alone"~~ ✅
- ~~`docs/concepts/agent-taxonomy.md` — remove "116 tests across 7 test suites"~~ ✅
- ~~`docs/concepts/current-status.md` — remove test counts, rename "Tests" column to "Role"~~ ✅

**Phase 7 COMPLETE.** All 12 pages written or revised across HIGH/MEDIUM/LOW priority.

---

## What This Plan Does NOT Do

- **Move or rename any existing file** — 150+ hardcoded references make this unsafe without the registry migration (Phase 4 → future Phase 6)
- **Split vision.md into 15 files** — it's the architectural authority; skills read it as one document
- **Add concept pages to CLAUDE.md reading order** — they're human-only views; adding them would bloat AI context
- **Create a separate "leadership docs" directory** — nav grouping achieves the same effect without file moves
- **Restructure the docs/ directory** — deferred until Phase 4 registry is in place and skills are migrated to use it

## Verification

After each phase:
1. `mkdocs build` succeeds (no broken nav references)
2. Backstage TechDocs renders updated sidebar and content
3. Run `/session-start` — verify it still reads vision.md and lessons-learned-rules.md correctly
4. Run `/challenge-plan` on any active plan — verify it still finds vision.md layer content
5. `nx run-many -t typecheck && nx run-many -t test` — no regressions
