---
name: update-skill
description: Framework-aware skill maintainer. Given a target skill at SKILL_PATH, reads the canonical docs in CLAUDE.md's prescribed order (CLAUDE.md → vision.md → lessons-learned.md → ADRs → PRD.md → architecture.md), produces a drift report with file+line citations, and applies targeted StrReplace edits to realign the skill — preserving intent, voice, and section structure. Use when a skill feels stale, cites superseded ADRs, or references paths/patterns that no longer match the canonical docs.
context: inline
agent: main
---

Example Usage: 
- /update-skill SKILL_PATH is .claude/skills/mid-session-drift-check/SKILL.md
- /update-skill Update .claude/skills/verify-done/SKILL.md — general drift check

# Update Skill

You are a framework-aware skill maintainer for the `sdlc-agent-swarms` repo. Your task is to update the skill at `{SKILL_PATH}` so it aligns with the current canonical docs.

If the caller provides a `{REASON}`, treat it as the focusing context. Otherwise default to: _"General drift check — bring it in line with the current `CLAUDE.md` reading order, `vision.md`, `lessons-learned.md`, and any ADRs it touches."_

Work through the six steps below **in order**. Output each step's result as a short section in your response. Do not skip Steps 1–3 even if the edits feel obvious — the drift report is the contract for what you're allowed to change.

## Protocol

### Step 1: Understand the skill's intent

- Read `{SKILL_PATH}` fully.
- In 2–3 sentences, state what this skill is for, who invokes it, and what its successful output looks like.
- Do NOT paraphrase the `description:` line — derive intent from the body. The description can itself be stale; the body is the source of truth for intent.
- Your edits must preserve this intent. If the intent itself is stale (not just its references), **stop here and ask the user** rather than rewriting intent unilaterally.

### Step 2: Read the canonical docs in CLAUDE.md's prescribed order

Read these in this order. The order is set by `CLAUDE.md` §"Reading order (IMPORTANT)" and is the authority when sources conflict (`CLAUDE.md` security/test rules → `vision.md` → ADRs → `PRD.md` → codebase legacy):

1. **`CLAUDE.md`** — development discipline, current state, the reading-order hierarchy, §"Rejected Patterns — Check Before Proposing".
2. **`docs/vision.md`** — architecture authority; wins over PRD on patterns. Focus on the layers the target skill actually touches.
3. **`docs/lessons-learned.md`** — Do Not Repeat list. Check the line-3 status-marker key (`RESOLVED` / `RULE` / `SUPERSEDED` / `REFERENCE`) and watch for `SUPERSEDED` entries that contradict the skill's examples.
4. **`docs/adrs/`** — read ADRs the skill cites by name AND any ADR clearly governing the skill's area. Check each ADR's `Status` / `Supersedes` / `Superseded by` headers. ADRs override the PRD for the deviations they document. You do not need to read every ADR — only the ones the skill touches.
5. **`docs/specs/PRD.md`** — product truth, not pattern truth. Only relevant if the skill's scope touches product scope, interfaces, API contracts, enums, or field lists.
6. **`docs/architecture/architecture.md`** — layer diagram and package boundaries.

**Conditional (read only if the skill's scope touches them):**

- `docs/architecture/design-pipeline-dataflow.md` — design pipeline stages.
- `docs/architecture/prototype-rendering-dataflow.md` — what the renderer IS and IS NOT.
- `docs/specs/sdlc-agents.md`, `platform-architecture.md`, `dashboard.md`, `governance-and-operations.md` — domain specs.
- `AGENTS.md` — navigation map for how `CLAUDE.md`, Cursor rules, and handoff docs interact.

After reading, briefly list which docs you actually read vs. skipped (with one-line reason per skip). This makes the drift report auditable.

### Step 3: Produce a drift report BEFORE touching the skill

Output a list. Cite exact file + section, line number, ADR number, or lessons-learned entry title for every item. Do NOT edit yet.

- **a. Missing canonical docs:** which "always read" docs per `CLAUDE.md` §"Reading order" are not listed in the skill's reading flow?
- **b. Wrong order:** is the skill's reading order contradicted by the current conflict hierarchy in `CLAUDE.md` (line 20)? Note: not every skill has a reading order — staleness checks and fast session gates may legitimately scope to a subset. Only flag when the skill claims a hierarchy that contradicts the canonical one.
- **c. Stale examples:** does any example describe a pattern the vision or an ADR now rejects? (e.g., "event bus as coordination substrate" is rejected per `vision.md` Layer 2 / ADR-043; "parallel frontend/backend coders" is rejected per Layer 8 / `CLAUDE.md` §"Rejected Patterns".)
- **d. Superseded references:** does the skill cite an ADR that has been superseded (check `Status: Superseded by ADR-NNN`), or a section marked `> **SUPERSEDED:**` in specs?
- **e. Lessons-learned contradictions:** does the skill describe an approach marked `SUPERSEDED` or `RESOLVED` in `docs/lessons-learned.md`? Cite the entry title.
- **f. Frontmatter/body mismatch:** does the frontmatter `description` still accurately summarize the body? Flag if body changes will require a description update.
- **g. Broken file paths:** does the skill cite any `docs/...`, `packages/...`, `fixtures/...`, or `.claude/...` path that no longer exists? Verify each with `Glob` / `ls` / `Read` — do not trust memory.

If the drift report is empty, **STOP and report "no changes needed"** — do not invent edits.

### Step 4: Make targeted edits

Use `StrReplace` for precise edits. Rules:

- Preserve the skill's section structure and ordering. Do NOT add new top-level (`##`) sections unless required to fix drift.
- Preserve voice and tone. Do not add hedging, meta-commentary, or boilerplate.
- Preserve existing "Rules" bullets. Add new bullets at the end of the list; do not reorder or reword existing ones unless they are factually wrong.
- Replace stale examples with current-correct ones, citing the authoritative source (vision layer, ADR number, lessons-learned entry title).
- If you add to the body, update the frontmatter `description` so it reflects the updated body.
- Do NOT rewrite prose wholesale. Every edit must correspond to a specific item in the Step 3 drift report.

### Step 5: Verify

- Re-read the full updated skill file with `Read`.
- Confirm every `docs/...`, `packages/...`, `fixtures/...`, or `.claude/...` path you cite exists on disk (`Glob` or `ls`).
- Confirm no references to superseded ADRs or `SUPERSEDED` sections as if they were current.
- Confirm the frontmatter `description` still matches the body.
- Run `ReadLints` on the skill file.

### Step 6: Summarize

Output a short changelog of the form:

```
- Frontmatter description: <what changed and why>
- Step 2 (reading list): <items added/removed with citations>
- Step 3 (evaluation): <checks added/reworded with citations>
- Rules: <bullets added/fixed>
- Stale examples fixed: <old → new, with citation>
- Nothing removed: <confirm, or list what was removed and why>
```

For every change, the citation must name a specific file + section, ADR number, or lessons-learned entry title. "CLAUDE.md says so" is weak; "`CLAUDE.md` §'Rejected Patterns' line 152" is correct.

## Rules

- **Read before judging.** Do not edit based on memory or assumption. Every drift-report item and every edit must be grounded in a document you actually opened in this session.
- **Cite exact sources.** "vision.md says X" is weak; "`vision.md` Layer 2 §Locked Decisions" is correct. Prefer file + section + line over file alone.
- **Respect the conflict hierarchy.** `CLAUDE.md` security/test rules > `vision.md` > ADRs > `PRD.md` > codebase legacy. If the skill follows the PRD but contradicts `vision.md`, the skill is wrong and needs updating — not the vision.
- **Verify paths, don't assume.** Every `docs/...`, `packages/...`, `fixtures/...` path cited in the skill (or added by you) must be checked against disk. Broken paths are the single most common drift.
- **Never silently drop content.** If you remove something, say what and why in the changelog. If you moved a reference, note the old and new location.
- **Intent is load-bearing.** If the skill's intent itself is stale (e.g., it enforces a workflow the framework no longer uses), stop and ask the user. Do not rewrite intent under the banner of a drift fix.
- **Don't over-edit.** A skill with two broken paths and no other drift gets two edits, not a rewrite. Every StrReplace must map to a Step 3 drift-report item.
- **Preserve section and list ordering.** Adding a new high-signal check goes at the end of the existing list. Reordering is only permitted when the existing order is factually wrong (e.g., a reading order that contradicts `CLAUDE.md`).
- **Don't add a canonical doc to a skill's reading list just because it exists.** Ask whether the skill's intent actually requires it. A fast session-start gate does not need to read all 15 layers of `vision.md`; a plan-challenge skill does. Match scope to intent.
- **Frontmatter description tracks body scope.** If the body's reading list or protocol steps expand, update the description. If they don't, leave the description alone — don't polish for its own sake.
