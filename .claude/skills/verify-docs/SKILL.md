---
name: verify-docs
description: Unified documentation verification gate. Two modes — task-scoped (from verify-done or before commit, analyzes current diff) and full-sweep (standalone pre-release audit). Verifies doc content accuracy against codebase reality, absorbs review-spec-sync staleness checks, and validates CLAUDE.md state pointers. Use before declaring work done or before major releases.
context: inline
agent: main
---

# Verify Docs

Unified documentation verification. This skill exists because stale documentation actively misleads future agents — a `vision.md` Layer 7 "Current state" that describes the old pipeline causes agents to build on patterns that no longer exist. File-presence checks ("was `docs/vision.md` touched?") are insufficient; this skill reads the relevant doc sections and compares them against what the code actually does.

## When to invoke

- From `/verify-done` as its documentation verification step (task-scoped mode)
- Before committing changes that touch architecture, CLI, or public APIs (task-scoped mode)
- Before major releases as a comprehensive doc audit (full-sweep mode)
- When you suspect documentation drift after a series of changes (full-sweep mode)

## Modes

- **Task-scoped** (default): Analyzes `git diff --stat HEAD` to determine which doc areas the current changes touch. Only triggered checks run. Use when called from `/verify-done` or before a commit.
- **Full sweep** (invoke with `--full-sweep` arg or standalone with a clean working tree): Runs all 7 checks unconditionally. Use before major releases. Replaces the old `/review-spec-sync` skill.

## Protocol

### Step 0: Determine mode and scope

Check invocation context:
- If invoked from `/verify-done`, or session has uncommitted changes: **task-scoped mode**. Run `git diff --stat HEAD` to get changed files.
- If invoked with `--full-sweep`, or standalone with a clean working tree: **full-sweep mode**.

For task-scoped mode, map changed files to checks using the trigger table below. For full-sweep mode, run all checks.

### Step 1: Trigger analysis (task-scoped only)

Run `git diff --name-only HEAD` and `git diff --diff-filter=AD --name-only HEAD` (added/deleted files). Map results to checks:

| Changed files match | Triggered checks |
|---|---|
| `packages/cli/src/commands/*.ts` or `packages/cli/src/index.ts` | CLI-DOCS |
| New directory under `packages/*/src/` with `index.ts` barrel (use `--diff-filter=A`) | FEATURE-DOCS |
| `packages/agents-ux/`, `packages/designspec-renderer/` | VISION-LAYER-7 |
| `packages/dashboard/` | VISION-LAYER-14 |
| `packages/core/src/types/`, `packages/channels/` | VISION-LAYER-2 |
| `services/engine/`, `*orchestrat*` files | VISION-LAYER-1 |
| `packages/agents-*/` (agent type/role definitions, not tests) | VISION-LAYER-3 |
| Feature plan phase marked complete (detect from CLAUDE.md pointer update or user context) | SPEC-SYNC |
| `docs/vision.md` in diff AND diff touches `### Locked decisions` content | SPEC-GREP (locked decision subset) |
| Any non-trivial change (>3 production files or >50 lines changed) | LESSONS-LEARNED |
| Any plan-tracked task, or CLAUDE.md `## Current State` touched | POINTER-CHECK |
| `docs/**/*.md` (any doc file in diff) | VOICE-FLOW |

**Exclusions from trigger analysis:** Ignore files matching `__tests__/`, `*.test.*`, `*.spec.*`, `fixtures/`, `dist/`, `node_modules/`.

In full-sweep mode, skip this step — all checks run.

### Step 2: Execute triggered checks

Run each triggered check following its content-verification protocol below.

---

#### CHECK: CLI-DOCS
**Rule:** CLAUDE.md line 307 — "When adding or modifying CLI commands, update docs in `docs/cli/`."

**Protocol:**
1. Read `packages/cli/src/commands/` and extract all Commander.js `.command()` registrations — note command names and options.
2. Read `docs/cli/README.md` and each command-group file (`setup.md`, `design.md`, `orchestration.md`, etc.).
3. Compare: every registered CLI command must appear in the docs with its current options. Every documented command must exist in the code.
4. Cross-reference `.claude/rules/cli-commands.md` for the full update checklist.

**Pass:** Command sets match, or the CLI change is purely internal (no new/renamed/removed commands or options).
**Fail:** Command added/modified but docs missing or stale. Cite the specific command and the doc file that needs updating.
**n/a:** No CLI command files changed.

---

#### CHECK: FEATURE-DOCS
**Rule:** CLAUDE.md line 308 — "When adding a new feature, module, or public API, ensure documentation exists."

**Protocol:**
1. For each new directory under `packages/*/src/` that contains an `index.ts` barrel file (detected from `git diff --diff-filter=A`), search `docs/` for documentation mentioning the module.
2. Also check for entirely new packages (new `packages/*/` directories).

**Pass:** Documentation exists or was created, or no new modules/packages were added.
**Fail:** New module `<path>` added but no documentation found. Suggest a doc location.
**n/a:** No new module directories or public API exports added.

**Proportionality guard:** Does NOT fire for new test files, helper files within existing modules, or files that don't create new public API surface.

---

#### CHECK: VISION-LAYER-N
**Rule:** CLAUDE.md lines 309-310 — "When making an architectural change that touches vision Layer N, update `docs/vision.md` Layer N's Current State section."

**Protocol:**
1. Identify which layer(s) are affected using the layer-to-path mapping:
   - Layer 1 (Orchestration): `packages/core/src/llm/`, langgraph config, `services/engine/`
   - Layer 2 (Coordination): `packages/channels/`, event-related files in `packages/core/`
   - Layer 3 (Taxonomy): agent type/role definitions in `packages/agents-*/`
   - Layer 7 (Design): `packages/agents-ux/`, `packages/designspec-renderer/`
   - Layer 8 (Implementation): `packages/agents-code/`
   - Layer 12 (Evaluation): `*evaluator*`, `*vision*`, `*correction-pipeline*` under `packages/agents-ux/`
   - Layer 14 (Dashboard): `packages/dashboard/`
2. For each affected layer, read `docs/vision.md` — find the `## Layer N:` section, read only the `### Current state` subsection (~40-60 lines).
3. Read the actual code packages that the layer describes. Compare: does the "Current state" text accurately describe what the code does today?
4. Key verification points:
   - Does it mention the correct packages and their actual pipeline stages?
   - Are deprecated components marked as deprecated (not described as active)?
   - Does it reference the correct technology (e.g., LangGraph not EventEmitter)?

**Pass:** Current State is accurate, or `docs/vision.md` appears in the diff with correct updates.
**Fail:** Current State describes pre-change behavior. Cite the stale sentences and what they should say.
**n/a:** No new/deleted files in layer-mapped paths (modifications to existing files within those paths do NOT trigger this check in task-scoped mode — that would be too noisy).

---

#### CHECK: SPEC-SYNC
**Rule:** CLAUDE.md lines 312-314 — "When completing a feature plan phase, update the relevant domain spec section in `docs/specs/`."

**Protocol:**
1. Determine if a feature plan phase was completed. Detection heuristics:
   - CLAUDE.md `## Current State` "Active plans" was updated to advance a phase
   - The user explicitly stated a plan phase is done
   - The session's work corresponds to a phase in `docs/plans/active/` or `docs/plans/backlog/`
2. Identify the relevant domain spec: map the plan's topic to `docs/specs/` files:
   - Platform/orchestration/coordination → `platform-architecture.md`
   - Agent behavior/pipeline stages → `sdlc-agents.md`
   - HITL/governance/trust → `governance-and-operations.md`
   - Dashboard features → `dashboard.md`
3. Read the relevant section of the domain spec. Compare against the implemented behavior — not the planned behavior, not the old behavior, but what the code actually does now.

**Pass:** Domain spec describes the current implementation, or a `docs/specs/*.md` file appears in the diff with correct updates.
**Fail:** Feature plan phase completed but domain spec still describes pre-implementation behavior. Cite the stale section.
**n/a:** No plan phase was completed in this session (standalone fix, not part of a tracked plan).

---

#### CHECK: SPEC-GREP
**Rule:** CLAUDE.md lines 315-316 — "When a `vision.md` locked decision changes, grep all domain specs for the affected pattern and update or annotate them."

Also absorbs all checks from the former `/review-spec-sync` skill.

**Protocol — Part A: Locked decision propagation** (task-scoped trigger: vision.md locked decisions changed)
1. Identify which locked decision changed from the diff.
2. Extract the key pattern keyword (e.g., "LangGraph", "single-threaded", "typed channels").
3. Grep all `docs/specs/*.md` for that keyword.
4. For each match, verify the spec's description is consistent with the new locked decision.

**Protocol — Part B: Staleness greps** (always runs in full-sweep; in task-scoped, runs only when Part A triggers or when `docs/specs/` files are in the diff)

Run these 7 pattern checks against `docs/specs/`:

1. **Figma references:**
   ```bash
   grep -rn "Figma" docs/specs/
   ```
   Flag any occurrence presenting Figma as a current/active integration. Historical context ("previously used Figma") is acceptable.

2. **Event bus as coordination:**
   ```bash
   grep -rn "event bus" docs/specs/ | grep -iv "telemetry\|observability\|retained for"
   ```
   Flag any occurrence describing event bus as the coordination substrate.

3. **MCP as orchestration:**
   ```bash
   grep -rn "MCP" docs/specs/ | grep -i "orchestrat\|coordinat"
   ```
   Flag any occurrence presenting MCP as orchestration or coordination layer.

4. **Generic model names:**
   ```bash
   grep -rn "Claude Opus\|Claude Sonnet\|Claude Haiku\|GPT-4\b" docs/specs/
   ```
   Flag model references without versioned IDs (e.g., should be `claude-opus-4-6`, not "Claude Opus").

5. **Parallel code generation:**
   ```bash
   grep -rn "parallel.*frontend\|frontend.*parallel\|concurrent.*agent\|agent.*concurrent" docs/specs/
   ```
   Flag within-task parallel coding agents (rejected by vision Layer 8).

6. **Old ten-agent taxonomy:**
   ```bash
   grep -rn "five.*categor\|ten.*agent\|20.*agent\|peer.*agent" docs/specs/
   ```
   Flag references to old taxonomy without four-stage spine framing.

7. **Python engine:**
   ```bash
   grep -rn "Python.*engine\|services/engine\|python.*orchestrat" docs/specs/
   ```
   Flag references presenting the Python engine as current (deprecated per ADR-043).

**Protocol — Part C: Cross-reference checks** (full-sweep only)

For each pair, read both sections and flag contradictions:
- Layer 1 (Orchestration) vs `platform-architecture.md` Section 4.1
- Layer 2 (Coordination) vs `platform-architecture.md` Sections 4.2 and 7
- Layer 3 (Taxonomy) vs `sdlc-agents.md` Section 10
- Layer 7 (Design) vs `sdlc-agents.md` Section 11.1
- Layer 8 (Implementation) vs `sdlc-agents.md` Section 11.3

**Pass:** No stale patterns found and cross-references are consistent.
**Fail:** Stale pattern found or cross-reference contradiction. Cite file:line and what it should say.
**n/a (task-scoped):** No vision.md locked decision changes and no spec files in the diff.

---

#### CHECK: LESSONS-LEARNED
**Rule:** CLAUDE.md line 206 — "Persist learnings to `docs/lessons-learned.md`. Keep entries short and actionable."

**When called from verify-done:** This check is handled by verify-done's Session Retrospective (Step 5), which uses active struggle detection + self-analysis and auto-writes the entry. Mark as PASS if the entry was written, or "no struggles detected" if Step 5 found nothing.

**When called standalone or in full-sweep mode:** Run the full protocol:

1. **Active struggle detection** — check git history for signals:
   - Files touched by 3+ commits in this session (debugging loop)
   - Consecutive "fix" commits (iterative troubleshooting)
   - Reverted or undone commits (abandoned approach)
2. **Self-report prompt** — did this session encounter any of these?
   - A gotcha that cost real debugging time (>2 failed attempts at the same problem)
   - A non-obvious behavior that would surprise a future agent
   - A pattern that was tried and abandoned (with reasons)
   - A tool/API quirk that isn't documented
3. If either detection method identifies a learning: check whether `docs/lessons-learned.md` already has a matching entry (grep for keywords).
4. If no existing entry: **write the entry directly** to `docs/lessons-learned.md`. Use this format:
   ```
   ### <Short descriptive title> — **RESOLVED** (YYYY-MM-DD)
   **Context:** <What was being done>
   **Problem:** <What went wrong — file paths, error messages, symptoms>
   **Root cause:** <Why it happened>
   **Fix:** <What solved it — specific enough for a future agent to apply directly>
   **Rule:** <One-sentence rule to prevent recurrence>
   ```

5. **If the entry's status is RULE or SUPERSEDED**, also add it to `docs/lessons-learned-rules.md` (the compact rules file read by session-start). Keep both files in sync.

**This check auto-writes.** Lessons-learned entries must be written before the session ends — the debugging context cannot be recovered later. This is an exception to the "surface and stop" rule that applies to other doc checks.

**Pass:** Entry was written, or agent confirms "no material learnings this session" after active detection found no struggle signals.
**Fail:** Struggle signals detected AND no entry was written.
**n/a:** Never — this check always runs.

**Anti-bleach rule:** Preserve specifics. "Port 4100 served stale Vite because the dashboard's auto-start silently failed when the previous process held the port" is useful. "Had build environment issues" is not.

---

#### CHECK: POINTER-CHECK
**Rule:** CLAUDE.md `## Current State` must reflect completed work.

**When called from verify-done:** This check is handled by verify-done's Session Retrospective (Step 5d), which auto-updates the pointers. Mark as PASS if the pointers were updated, or n/a if no plan changes.

**When called standalone or in full-sweep mode:** Run the full protocol:

1. Read `CLAUDE.md` `## Current State` section. Verify:
   - **Active plans** — If the task was part of an active plan, is its phase status current? (e.g., if Phase 3 was just completed, does the entry still say "Phase 2 complete, Phase 3 next"?) If a plan is fully done, it should move to "Completed plans" with a date.
   - **Completed plans** — If a plan just finished, is it listed here with the completion date?
   - **Last session** — Is it updated with a one-line pointer to what was done?
   - **Path validity** — Do the plans referenced under Active plans still exist at their documented paths?
2. In full-sweep mode, also verify that every plan listed under "Active plans" actually has incomplete work remaining (not a completed plan that was never moved).
3. **Auto-update** the pointers directly — these are factual fields with low risk of error.

**Pass:** All pointers are current.
**Fail:** Stale pointer found. Cite the specific field and what it should say.
**n/a (task-scoped):** The task is a standalone fix not part of any tracked plan, and doesn't warrant a "Last session" update.

---

#### CHECK: VOICE-FLOW
**Rule:** `.claude/rules/docs-formatting.md` Voice and Page flow sections.

**Protocol:**
1. For each doc file in the diff, read the changed sections (not the whole file — scope to the diff hunks).
2. Check for:
   - Defensive framing in section titles or opening paragraphs ("Why X fails", "Doesn't this mean...?", "But what about...?")
   - Redundant sections that restate diagram content in list form
   - Abstract concepts (invariants, properties) introduced before the reader has context to understand them
   - Sections that mirror the sidebar navigation (a "Documentation Sections" table listing all nav entries)
   - Orphaned paragraphs floating between sections without heading or visual connection
   - Status labels in conceptual diagrams (Built/Planned/checkmarks belong on status pages, not concept or home pages)
3. For each violation, quote the text and suggest a concrete rewrite.

**Pass:** No defensive framing, no redundancy, no orphaned content in the changed sections.
**Fail:** Quote the violating text and the rule it violates. Suggest a rewrite.
**n/a:** No `docs/**/*.md` files changed, or changes are purely structural (nav ordering, formatting fixes).

---

### Step 3: Produce the verification report

Output this format:

```
DOC VERIFICATION REPORT
========================
Mode: <task-scoped | full-sweep>
Checks triggered: <N>

FAILURES (must fix before done):
  [F1] <check-name> — <file:line> — <what's wrong> — <what it should say>
  [F2] ...

WARNINGS (should fix soon):
  [W1] <check-name> — <file:line> — <stale pattern or missing doc>
  [W2] ...

PASS:
  [P1] <check-name> — verified accurate
  [P2] ...

NOT TRIGGERED (task-scoped only):
  <check-name> — <reason: no matching files changed>

DOC SCORE: <N> failures, <M> warnings, <K> pass across <J> checks
```

### Step 4: Recommend specific fixes (do not execute)

For each FAILURE, output an actionable fix block:

```
## Fix: [F1] <check-name>
File: <doc-file-path>
Section: <section heading>
Current text: "<stale text>"
Should say: "<corrected text>"
Source: <canonical source or code evidence supporting the correction>
```

**Doc update behavior — split approach:**
- **Auto-write (no confirmation needed):** Lessons-learned entries and CLAUDE.md pointers. These are session-specific context or factual fields — delay risks losing them.
- **Propose-then-confirm:** For VISION-LAYER-N, SPEC-SYNC, CLI-DOCS, and FEATURE-DOCS failures, propose the exact fix text (current vs. corrected) and ask for confirmation before writing. These docs are nuanced enough that auto-writing risks inaccuracy.

## Anti-theater guards

- **Content, not ceremony.** Every failure must cite a specific stale sentence and what it should say. "Vision.md might be outdated" is not a finding; "vision.md Layer 7 Current State says 'Chrome Pass derives regions from Penpot' but the code uses `shared-chrome.json` manifest since Phase 3" is.
- **Do not inflate.** If 1 check fails, report 1 failure. Do not round up with speculative concerns.
- **Do not deflate.** If 5 checks fail, report 5. The user decides priority.
- **Grep context matters.** When running staleness greps, read the surrounding 3-5 lines before flagging. "Figma" in "Previously used Figma, now using Pencil" is not a violation.

## Efficiency rules

These files are large. Do not read them fully unless in full-sweep mode:
- `vision.md` (49KB): Read only the triggered Layer's "Current state" subsection (~40-60 lines per layer)
- `lessons-learned.md` (79KB): Grep for topic keywords first, then read only matching sections. In full-sweep, read the table of contents (lines 1-60) plus SUPERSEDED entries.
- Domain specs: Read only the specific section numbers identified by the cross-reference table

## Bail-out

In task-scoped mode, if the trigger analysis produces zero triggered checks (e.g., the change was a single test file fix), report:

> "No documentation checks triggered. Changed files: `<list>`. None match the doc-update trigger table. Doc verification: n/a."

This is a valid result, not a failure. Do not fabricate checks to justify running the skill.
