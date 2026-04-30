# CHIP Documentation Reorganization — Phased Plan

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

## Phase 2 — Concept Pages (human-friendly layer summaries)

**Goal:** Create 5-7 concept pages that extract and expand vision.md layers into human-friendly docs with diagrams and examples. Vision.md stays unchanged — concept pages are additive views.

**New files (all under `docs/concepts/`):**
- `docs/concepts/overview.md` — "What is CHIP" product brief (1 page: what, who, why, architecture-at-a-glance, tech stack)
- `docs/concepts/agent-taxonomy.md` — 4-stage spine explained with diagram (from vision Layers 3, 5, 8, 9)
- `docs/concepts/design-pipeline.md` — how designs are generated, corrected, prototyped (from vision Layer 7 + dataflow doc)
- `docs/concepts/coordination-and-state.md` — typed channels, state persistence (from vision Layers 2, 4)
- `docs/concepts/hitl-governance.md` — HITL gates, governance middleware (from vision Layer 10 + governance spec)
- `docs/concepts/observability.md` — OpenTelemetry + Langfuse setup (from vision Layer 11 + Langfuse guide)
- `docs/concepts/current-status.md` — where we are across all initiatives, what's working, what's not

**Each concept page follows this template:**
```markdown
# <Concept Name>

> Authoritative source: [vision.md Layer N](../vision.md#layer-n-name)

## Summary
<2-3 paragraphs, no jargon, leadership-friendly>

## How It Works
<Diagram (ASCII/Mermaid) + step-by-step explanation>

## Current State
<What's implemented today>

## What's Next
<Planned improvements, link to relevant active plan>

## Key Decisions
<Table: decision, rationale, ADR link>

## Related Docs
- [Vision Layer N](../vision.md#layer-n-name) — canonical authority
- [ADR-NNN](../adrs/ADR-NNN-*.md) — relevant decisions
- [Guide: ...](../guides/...) — operational how-to
```

**Add to mkdocs.yml nav:**
```yaml
  - Concepts:
      - What is CHIP: concepts/overview.md
      - Current Status: concepts/current-status.md
      - Agent Taxonomy: concepts/agent-taxonomy.md
      - Design Pipeline: concepts/design-pipeline.md
      - Coordination & State: concepts/coordination-and-state.md
      - HITL & Governance: concepts/hitl-governance.md
      - Observability: concepts/observability.md
```

**Add forward links in vision.md** (per-layer, one line each):
```markdown
## Layer 5: Clarifier (front door)
> For an expanded overview with diagrams, see [Concepts: Agent Taxonomy](concepts/agent-taxonomy.md)
```

**Impact on skills/agents:** None. Concept pages not in CLAUDE.md reading order. Vision.md content unchanged — only additive forward links.
**Estimate:** ~3-4 hours.

---

## Phase 3 — Vision.md Refresh (content improvements to the canonical file)

**Goal:** Make vision.md itself friendlier without breaking its authority role. Changes are additive — no content removed.

**Changes to vision.md:**
1. Fix title: "ARCHON / AgentForge" → "CHIP — Architecture Vision"
2. Add executive summary (5 lines) before Section 0:
   ```
   > CHIP is a multi-agent SDLC framework. Four spine stages (Clarify →
   > Architect → Implement → Review) coordinate via typed LangGraph channels.
   > Single-writer discipline per artifact. Human-in-the-loop at three gates.
   > Context quality is the single invariant.
   ```
3. Add "Where We Are Today" row to the Layer overview table (Section 2) — a third column showing implementation status (Done / In Progress / Not Started)
4. Update stale references (Python engine → note deprecation per ADR-043)
5. Add Mermaid layer diagram in Section 2 (renders in Backstage, shows as code block for AI — acceptable overhead)

**Impact on skills/agents:** Minimal. Skills read the full file — additive content at the top adds ~200 tokens. The layer structure is preserved. No headings renamed (skills reference "Layer 2", "Layer 8" etc. by content search, not heading anchors).
**Estimate:** ~2 hours.

---

## Phase 4 — Path Registry (preparation for eventual file reorganization)

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

## Phase 5 — Contributor Getting Started Guide

**Goal:** New contributors can go from clone to running demo in one page.

**Create `docs/guides/getting-started.md`:**
- Prerequisites (Node.js 20+, Python 3, Docker)
- Clone + npm install + nx build
- Run the dashboard (`npm run dev:dashboard`)
- Run the design pipeline on a sample project
- Run tests (`nx run-many -t test`)
- Reading order (CLAUDE.md → vision → PRD)
- How to add a new agent (link to `.claude/rules/new-agent.md`)
- How to navigate docs (Backstage portal at localhost:3003)

**Add to mkdocs.yml nav** under Guides.

**Impact:** New file only. Zero existing behavior changes.
**Estimate:** ~1-2 hours.

---

## Execution Order

```
Phase 1 (Branding + Nav)       ← Do first, quick wins, ~1-2hrs
  ↓
Phase 2 (Concept Pages)        ← Biggest human UX improvement, ~3-4hrs
  ↓
Phase 3 (Vision Refresh)       ← Makes the canonical file friendlier, ~2hrs
  ↓
Phase 5 (Getting Started)      ← Unblocks new contributors, ~1-2hrs
  ↓
Phase 6 (Auto-Generated)       ← Rich dashboards with zero maintenance, ~3-4hrs
  ↓
Phase 4 (Path Registry)        ← Preparation for eventual file moves, ~1.5hrs
```

Phases 1-3 are foundational. Phase 5 + 6 are independent of each other. Phase 4 is infrastructure for future work.

**Total estimated effort:** ~12-16 hours across 6 phases, doable in 3-4 focused sessions.

---

## Phase 6 — Auto-Generated Enrichment Layer (Tier 3)

**Goal:** CI pipeline generates rich human-only pages from canonical sources on every push. Zero manual maintenance.

**Create `scripts/generate-docs.ts`** — TypeScript script that:
1. **Parses plan execution plans** → generates `docs/_generated/current-status.md`
   - Reads every `docs/plans/active/*/execution-plan.md`
   - Counts `- [x]` (done) vs `- [ ]` (pending) checkboxes
   - Outputs a table: Plan name | Progress (e.g., 7/10) | Next task | Link
2. **Parses package.json files** → generates `docs/_generated/package-index.md`
   - Reads every `packages/*/package.json`
   - Extracts: name, description, dependencies (only `@agentforge/*`)
   - Outputs a table with dependency count and links to README (once they exist)
3. **Parses ADR files** → generates `docs/_generated/adr-index.md`
   - Reads every `docs/adrs/ADR-*.md`
   - Extracts: number, title, status (from `## Status` line)
   - Outputs a sortable table: ADR# | Title | Status | Date
4. **Renders Mermaid** — install `backstage-plugin-techdocs-addon-mermaid` in Backstage app for client-side Mermaid rendering (no build-time rendering needed)

**Add to `.gitignore`:** `docs/_generated/`

**Add to `mkdocs.yml` nav:**
```yaml
  - Dashboards:
      - Current Status: _generated/current-status.md
      - Package Index: _generated/package-index.md
      - ADR Index: _generated/adr-index.md
```

**Add to `.github/workflows/docs.yml`:**
```yaml
- name: Generate enriched docs
  run: npx tsx scripts/generate-docs.ts
- name: Build TechDocs
  run: npx @techdocs/cli generate --source-dir . --output-dir ./site
```

**Local development:** Developers run `npx tsx scripts/generate-docs.ts` before `mkdocs serve` to see generated pages locally. Or skip them — Backstage shows Tier 1 + 2 pages regardless.

**Impact on AI agents:** Zero. Generated files are gitignored. AI agents never see `docs/_generated/`. CLAUDE.md reading order unchanged.

**Estimate:** ~3-4 hours (script + CI workflow + Mermaid addon).

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
