# Automate Skill Drift Detection and Remediation

**Created:** 2026-04-24
**Status:** Backlog — proposed, not scheduled
**Owner:** unassigned
**Depends on:** nothing hard. Phase 1 can start today.
**Related:**
- `CLAUDE.md` §"Reading order (IMPORTANT)" — the canonical hierarchy this work preserves
- `docs/vision.md` — source of architectural truth; skills derive from it
- `docs/lessons-learned.md` — Do Not Repeat list; skills should not contradict it
- `.claude/skills/check-drift/SKILL.md` — in-session drift audit; this plan is its inward-facing analog (drift of skills themselves)
- `.claude/skills/review-spec-sync/SKILL.md` — audits specs against vision/codebase; this plan extends the same pattern to skills
- `.claude/skills/session-start/SKILL.md` — consumer of canonical docs; its listed docs must stay in sync with `CLAUDE.md`
- `.claude/skills/challenge-plan/SKILL.md` — the skill whose manual update triggered this plan; see commit history 2026-04-24

---

## Why this plan exists

On 2026-04-24 the `challenge-plan` skill was updated by hand to bring it into line with the current canonical reading order in `CLAUDE.md` (which now leads with `vision.md`, `lessons-learned.md`, and `docs/adrs/` before `PRD.md`). The skill had been written before `vision.md` became the architecture authority, so it was silently out of date — and would have approved plans that violate locked vision decisions. During the update we also found a stale example ("event bus as coordination substrate") that directly contradicts `ADR-043` and `vision.md` Layer 2.

That manual ritual is exactly the kind of drift a growing framework accumulates. Left alone, every new ADR, new SUPERSEDED entry, and new vision layer makes more skills stale without anyone noticing — because skills don't run in CI and they don't fail loudly. The plan below automates the detection half of that ritual and keeps the remediation half human-reviewed.

---

## Goals

1. **Detect** when a skill references canonical docs that have changed, moved, been superseded, or describe rejected patterns.
2. **Notify** the author of the change at the moment they're making it (PR-time), not weeks later when the skill is invoked.
3. **Report** the delta in enough detail that a human (or an LLM with review) can make the edit confidently.
4. **Preserve** skill voice and structure — no auto-prose-rewrite in the default flow.

## Non-goals

1. Not creating a parallel registry of canonical docs. `CLAUDE.md` and `vision.md` remain the source of truth; skills declare dependencies **on** them.
2. Not auto-editing skill prose without human review in the default flow. A Phase 5 opt-in exists but is gated behind a human-approved PR.
3. Not policing skill content style, length, or tone. Only factual drift against canonical docs.

---

## Background: what the manual ritual was

Four steps, each automatable to a different degree:

| Step | Description | Automation ceiling |
|---|---|---|
| 1. Read the skill's intent | Understand what it's trying to do and for whom | Hard — human judgment |
| 2. Diff its references against current `CLAUDE.md` reading order | Structural comparison of listed docs | Easy — YAML + string diff |
| 3. Detect stale examples (e.g. "event bus as coordination substrate") | Pattern match against known-rejected patterns | Medium — needs a rejected-patterns manifest |
| 4. Rewrite prose preserving structure and voice | Edit while keeping intent intact | Hard — LLM-assisted, human-reviewed |

The cheapest 80% lives in steps 2 and 3. This plan automates those two and leaves step 4 as an optional, opt-in LLM-assisted flow.

---

## The enabler: declarative skill dependencies

Every skill that reads canonical docs gains a `canonical_dependencies` block in its frontmatter. This block is the machine-readable contract between the skill and the doc tree.

**Proposed frontmatter schema (YAML):**

```yaml
---
name: challenge-plan
description: "..."
context: inline
agent: main

# NEW — skill declares what it depends on
canonical_dependencies:
  # Docs the skill ALWAYS reads. Must be a superset of CLAUDE.md's "always read" when kind == framework-reader.
  always:
    - CLAUDE.md
    - docs/vision.md
    - docs/lessons-learned.md
    - docs/adrs/              # directory — any ADR matching plan scope
    - docs/specs/PRD.md
    - docs/architecture/architecture.md

  # Docs the skill reads only if the plan scope touches them.
  conditional:
    - path: docs/architecture/design-pipeline-dataflow.md
      when: "plan touches packages/agents-ux/ or the spec pipeline"
    - path: docs/architecture/prototype-rendering-dataflow.md
      when: "plan touches packages/designspec-renderer/ or correction flow"
    - path: docs/specs/sdlc-agents.md
      when: "plan adds/splits/reassigns agent work"
    - path: docs/specs/platform-architecture.md
      when: "plan touches cross-cutting platform concerns"
    - path: docs/specs/dashboard.md
      when: "plan touches packages/dashboard/"
    - path: docs/specs/governance-and-operations.md
      when: "plan touches HITL, approvals, budgets, or ops"

  # Optional: where to find rejected patterns for grep-style drift detection.
  rejected_patterns_source: docs/rejected-patterns.md

# Skill classification — controls which audit rules apply.
kind: framework-reader  # or: tooling-helper | workflow-gate | handoff | meta
---
```

**`kind` taxonomy (initial cut):**

| Kind | Meaning | Example skills |
|---|---|---|
| `framework-reader` | Reads canonical docs to judge/review work. Must stay in sync with CLAUDE.md. | `challenge-plan`, `check-drift`, `review-prd-compliance`, `review-spec-sync`, `session-start` |
| `workflow-gate` | Enforces a process before/after work (handoffs, completion gates). Lighter dep. | `prepare-handoff`, `receive-handoff`, `verify-done`, `verify-design-render` |
| `tooling-helper` | Domain-specific helpers that don't need the full reading order. | `demo-readiness`, `sprint-plan`, `write-adr` |
| `meta` | Audits/edits other skills or the framework itself. | `audit-skills` (proposed below) |

Only `framework-reader` kind triggers the "your always-reads must be a superset of CLAUDE.md's" check. Other kinds can declare `canonical_dependencies` optionally.

---

## Phased rollout

### Phase 1 — Declarative dependencies (1 hour, unblocks everything)

**Scope:** Add `canonical_dependencies` and `kind` to every skill under `.claude/skills/`. Write the convention rule.

**Steps:**
1. Enumerate every SKILL.md under `.claude/skills/`. As of 2026-04-24: `analyze-codebase`, `challenge-plan`, `check-drift`, `demo-readiness`, `implement-feature`, `prepare-handoff`, `receive-handoff`, `review-prd-compliance`, `review-spec-sync`, `session-start`, `sprint-plan`, `verify-design-render`, `verify-done`, `write-adr`.
2. For each, add frontmatter `kind` and `canonical_dependencies.always` / `.conditional`. Derive `always` from the skill body's existing "Step 2: Read …" section (or equivalent).
3. Create `.cursor/rules/skill-authoring.mdc` (or add to `AGENTS.md`) requiring new skills to declare `kind` and `canonical_dependencies`.
4. Update `.claude/skills/create-skill/` templates (if present; otherwise add a template stub) with the new frontmatter fields.

**Acceptance criteria:**
- Every skill under `.claude/skills/` has a `kind` and (for `framework-reader`) `canonical_dependencies.always`.
- The convention rule file exists and references this plan.
- `challenge-plan`'s already-updated body aligns with its declared dependencies (no mismatch).

**Deliverables:**
- Updated SKILL.md files (frontmatter only)
- `.cursor/rules/skill-authoring.mdc` or equivalent AGENTS.md section
- Template stub for new skills

---

### Phase 2 — The linter (`nx run skills:audit`, ~½ day)

**Scope:** Build a Node/TS linter that parses skill frontmatter and checks for mechanical drift.

**Checks to implement (in priority order):**

| # | Check | Severity | Detection method |
|---|---|---|---|
| 1 | **Broken doc path** — any `docs/...` path cited in SKILL.md body or frontmatter that doesn't resolve on disk | error | `fs.existsSync` against repo root |
| 2 | **Missing always-read doc** — skill's `kind == framework-reader` but its `canonical_dependencies.always` is not a superset of CLAUDE.md's "Reading order (IMPORTANT)" block | error | Parse the numbered list in CLAUDE.md §"Reading order"; compare |
| 3 | **Superseded ADR reference** — skill cites `ADR-XXX` whose frontmatter contains a `Superseded by:` or title starting with `SUPERSEDED` | warn | Parse ADR frontmatter/title |
| 4 | **Superseded section reference** — skill cites a section title that appears under a `> **SUPERSEDED:**` blockquote in any spec | warn | Regex scan of `docs/specs/*.md` |
| 5 | **Rejected-pattern mention without disclaimer** — skill body contains a phrase listed in `docs/rejected-patterns.md` and not within a "don't do this" context | warn | String match + proximity check for negation keywords |
| 6 | **Frontmatter/body mismatch** — skill declares a dep in `canonical_dependencies` that never appears in the body, or vice versa | warn | Cross-check |
| 7 | **Stale "last updated" signal** (optional, nice-to-have) — skill not touched since before the most recent change to any of its declared deps | info | Git log timestamps |

**File layout:**

```
scripts/
  audit-skills/
    index.ts              # CLI entry; exits non-zero on error
    parse-frontmatter.ts  # YAML parsing
    checks/
      broken-paths.ts
      always-read-superset.ts
      superseded-adr.ts
      superseded-section.ts
      rejected-patterns.ts
      frontmatter-body-sync.ts
    __tests__/            # unit tests per check, using fixture skills
```

**Nx wiring:**
- New Nx project/target: `nx run skills:audit`
- Added to `nx run-many -t lint` so it runs as part of the standard lint step (per `CLAUDE.md` Development Rules)

**Output format:**
- Terminal: grouped per skill, with severity and citation. Exit code 1 if any error, 0 if only warn/info.
- JSON: `--json` flag produces machine-readable output for the GitHub Action in Phase 3.

**Acceptance criteria:**
- `nx run skills:audit` runs in under 10 seconds.
- All 7 checks implemented with unit tests using fixture SKILL.md files.
- Running against the current tree produces zero errors after Phase 1 lands.
- A fixture test proves each check fires on a known-bad skill and doesn't fire on a known-good one.

**Deliverables:**
- `scripts/audit-skills/` directory with implementation and tests
- `project.json` / Nx config wiring
- `docs/rejected-patterns.md` stub (see separate section below)

---

### Phase 3 — GitHub Action (PR-time notification, ~2 hours)

**Scope:** Close the notification loop so skill drift is surfaced **when canonical docs change**, not months later.

**Trigger paths:**
- `CLAUDE.md`
- `docs/vision.md`
- `docs/lessons-learned.md`
- `docs/adrs/**`
- `docs/specs/**`
- `docs/architecture/**`
- `AGENTS.md`

**Action behavior:**
1. On PR open/sync touching any trigger path: run `nx run skills:audit --json`.
2. Cross-reference the PR's changed files against each skill's declared `canonical_dependencies`. For any skill whose deps overlap the changed files, add to a "potentially impacted" list.
3. Post (or update) a sticky PR comment: "This PR changes canonical docs that N skills depend on. Please verify they're still accurate: [list with links]."
4. If audit reports any **error**, fail the check (blocks merge until resolved or explicitly overridden by a repo admin).
5. Schedule (nightly): if drift accumulates unaddressed, open (or update) a single tracking issue titled "Skill drift — N skills out of sync with canonical docs."

**Acceptance criteria:**
- A test PR that modifies `docs/vision.md` produces the sticky comment with the correct skill list.
- A test PR that introduces a broken `docs/...` path in a skill fails the check.
- The nightly job opens exactly one tracking issue, even across many drifted skills.

**Deliverables:**
- `.github/workflows/skills-audit.yml`
- Nightly scheduled workflow (can be same file with two `on:` triggers)

---

### Phase 4 — The `audit-skills` meta-skill (~½ day)

**Scope:** The LLM-powered semantic drift layer — covers everything the linter cannot (stale examples, tone, conceptual drift, reordered hierarchies).

**File:** `.claude/skills/audit-skills/SKILL.md`

**Frontmatter:**
```yaml
---
name: audit-skills
description: Audit the .claude/skills/ tree for drift against the current canonical docs. Reads CLAUDE.md, vision.md, lessons-learned.md, and the ADR index; for each skill, produces a report of required and suggested edits. Read-only by default — does not edit skills.
kind: meta
canonical_dependencies:
  always:
    - CLAUDE.md
    - docs/vision.md
    - docs/lessons-learned.md
    - docs/adrs/
    - docs/rejected-patterns.md
---
```

**Protocol (skill body, summarized):**

1. Resolve current canonical reading order from `CLAUDE.md` §"Reading order (IMPORTANT)".
2. Load the locked decisions and rejected patterns from `docs/vision.md` (parse by heading — Layer 1..N each has a Current/Target/Locked section).
3. Load SUPERSEDED entries from `docs/lessons-learned.md`.
4. Load the ADR index; note any ADR with `Superseded by:`.
5. For each SKILL.md under `.claude/skills/`:
   a. Read its `canonical_dependencies` and body.
   b. Run the Phase 2 mechanical checks.
   c. In addition, prompt-style check: "Does any example in this skill describe a pattern the vision now rejects? Cite line + rejected pattern."
   d. Prompt-style check: "Is the skill's reading order aligned with CLAUDE.md's current hierarchy? If not, name the missing/extra docs."
   e. Prompt-style check: "Does the skill reference a SUPERSEDED lessons-learned entry as if it were current?"
6. Output a per-skill report with: mechanical errors/warnings, semantic concerns, suggested edits (as diff-style proposals, **not applied**).
7. Summarize: N skills OK, M skills need minor edits, K skills need major rework.

**Use cases:**
- After landing a new ADR.
- After a vision layer's decision becomes locked.
- Before a release / quarterly review.
- When the Phase 3 GitHub Action's tracking issue crosses a threshold (e.g. 5+ drifted skills).

**Acceptance criteria:**
- Skill file exists and matches the framework-reader skill conventions.
- Running it against the current tree (post-Phase 1) produces a coherent report.
- A "seeded drift" test (e.g. adding `event bus coordination` back to `challenge-plan`) causes the skill to flag it with a citation to `vision.md` Layer 2.

**Deliverables:**
- `.claude/skills/audit-skills/SKILL.md`

---

### Phase 5 — Opt-in LLM auto-fix PR flow (day or two, **defer unless drift is frequent**)

**Only build this if Phases 1–4 show drift is frequent enough to warrant automated editing.**

**Scope:** Convert the Phase 4 report into a draft PR that applies suggested edits, gated behind human review.

**Trigger:** manual (slash command or CLI) — never automatic.

**Flow:**
1. Run `audit-skills` to get the report.
2. For each skill with suggested edits: produce a structured diff.
3. Open a single draft PR with all skill edits, one commit per skill.
4. PR body includes the `audit-skills` report as justification.
5. Human reviewer must approve each skill's diff individually.

**Risks / why this is last:**
- Prose rewrites are easy to over-do. LLMs strip voice and add hedging.
- Edits to SKILL.md silently change agent behavior — a botched rewrite could degrade every future session that loads the skill.
- Better to leave a human in the loop for edits, with the LLM as a suggestion engine rather than an editor.

**Acceptance criteria (if built):**
- Draft-only PRs (never merge-ready without human approval).
- Per-skill commits so reviewers can reject individual edits.
- Report is reproducible: running the auditor twice on the same tree produces the same diff.

---

## Cross-cutting: `docs/rejected-patterns.md`

A single-page manifest of patterns the framework has explicitly rejected, with pointers to the authoritative source. Initial contents (to be expanded):

```markdown
# Rejected Patterns

Patterns the framework has explicitly rejected. New code, skills, plans, and
agent prompts must NOT describe these as current practice except in a "don't
do this" context.

## Architecture

- **Event bus as coordination substrate.**
  Source: vision.md Layer 2; ADR-043.
  The event bus (EventEmitter) is retained for telemetry only. Coordination is typed LangGraph channels with Zod schemas.
  Superseded section: platform-architecture.md §7.

- **Python engine / Python LangGraph orchestration.**
  Source: ADR-043; ADR-022.
  TypeScript @langchain/langgraph is the sole orchestration runtime. services/engine/ is scheduled for deletion.

- **Parallel implementers on a single task.**
  Source: vision.md Layer 8.
  The implementer pattern is single-threaded. PRD §24.2 describes a parallel pattern that is superseded by the vision.

- **Figma as a supported design tool in the current framework.**
  Source: sdlc-agents.md:249; appendices.md:250 (2026-04-24 spec sync).
  Only `browser` and `penpot` are supported DesignTool values.

## Process

- **Hardcoding values the PRD defines as configurable.**
  Source: CLAUDE.md §"PRD is Source of Truth".

- **Skipping docs/lessons-learned.md at session start.**
  Source: CLAUDE.md §"At session start".
```

This file is also the source-of-truth for the Phase 2 "rejected-pattern mention" check. Every entry has (a) a name, (b) the authoritative source, (c) what the correct pattern is.

---

## Test strategy

| Phase | Test approach |
|---|---|
| 1 | Inspect every skill post-edit. Confirm `kind` and `canonical_dependencies` parse as YAML. |
| 2 | Unit tests per check using fixture SKILL.md files under `scripts/audit-skills/__tests__/fixtures/`. One good fixture + one deliberately-broken fixture per check. |
| 3 | Integration test: a throwaway branch that (a) modifies `docs/vision.md`, (b) opens a PR, (c) asserts the sticky comment appears. |
| 4 | Seeded-drift test: temporarily reintroduce a known-stale phrase to a skill, run `audit-skills`, assert it's flagged with the right citation, revert. |
| 5 | (If built) reproducibility test: running auditor twice produces identical diffs. |

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Skills drift from the format mid-rollout (author writes a new skill without the new frontmatter) | `.cursor/rules/skill-authoring.mdc` + create-skill template stub make the format the path of least resistance |
| `rejected-patterns.md` itself drifts (patterns change, manifest not updated) | Treat it as canonical; add it to vision.md's locked-decisions change process so updates to vision trigger a manifest review |
| CLAUDE.md's "Reading order" block format changes and breaks the Phase 2 parser | Pin the parser to a specific heading + numbered-list structure; add a test that fails loudly if CLAUDE.md restructures, forcing an intentional parser update |
| Phase 4 LLM reports are noisy / low-signal | Start with Phase 2 mechanical checks only; only build Phase 4 once mechanical drift is quiet and remaining drift is clearly semantic |
| Over-automation erodes human ownership of skills | Never ship Phase 5 without explicit approval. Default remains: auditor reports, human edits |

---

## Open questions

1. **Where does `rejected-patterns.md` live — `docs/` or `docs/architecture/`?** Leaning `docs/rejected-patterns.md` for visibility. Alternative: a section inside `vision.md` so the manifest and the locked decisions co-locate. Decide at Phase 2 kickoff.
2. **Should `canonical_dependencies.always` be normative for ALL `framework-reader` skills, or per-skill?** Normative is simpler but would force skills that genuinely don't need (say) `prototype-rendering-dataflow.md` to list it anyway. Current draft: normative for the top-level reading-order docs (CLAUDE.md, vision, lessons, ADRs, PRD, architecture), per-skill for everything below.
3. **Do we version the `kind` taxonomy?** If we add a new kind later, existing skills need to opt in. Probably yes — add a `schema_version` to frontmatter.
4. **How does this interact with `.cursor/skills-cursor/` and `~/.claude/skills/`?** Those are user-global, not repo-scoped. This plan targets `.claude/skills/` only — the repo-owned skills. User-global skills are out of scope.
5. **Should `audit-skills` also audit `.cursor/rules/*.mdc`?** Rules face the same drift. Probably yes in a Phase 4.5 — same mechanism, different target tree. Keep it out of this plan's core to avoid scope creep.

---

## What "done" looks like for the minimum viable slice

Phases 1 + 2 + 3, skipping 4 and 5, is a defensible end state:

- Every skill declares its dependencies.
- CI fails on broken doc paths and missing always-reads.
- PRs touching canonical docs get a sticky comment listing impacted skills.
- A human still writes every skill edit, informed by the notification.

Total effort: ~1 day for the MVP slice. Phase 4 adds semantic coverage when it's worth the build.

---

## Pointer for the next session

If picking this up cold:

1. Read this plan top to bottom.
2. Read `.claude/skills/challenge-plan/SKILL.md` — it's the exemplar of a correctly-updated skill post-2026-04-24.
3. Read `CLAUDE.md` §"Reading order (IMPORTANT)" — the source the parser will pin to.
4. Start at Phase 1. Every skill under `.claude/skills/` needs `kind` and `canonical_dependencies` frontmatter. Derive from each skill's existing "Step 2: Read …" section.
5. Phase 2 unblocks once Phase 1's frontmatter is in place and the tree is green under the mechanical checks.
