---
name: verify-done
description: Pre-completion gate for dashboard, prototype, and renderer work. Blocks "done" claims until the CLAUDE.md test triad (typecheck, test, lint) plus headed E2E, stale-Vite kill, Chrome DevTools visual verification, full LLM pipeline verification (when applicable), evaluator/vision sanity-check (when applicable), and documentation verification via /verify-docs are proven. Born from a session where 4 premature "done" calls cost ~4 hours.
context: inline
agent: main
---

# Verify Done

You are about to declare a task "done" that touches the dashboard, prototype, or renderer. This skill exists because of a specific failure: on 2026-04-22, four successive "done" declarations were wrong — each time typecheck + unit tests passed but the browser showed broken behavior. 7 of 8 E2E tests failed on first headed run. Stale Vite served old code for 3 debug cycles. A drawer opened as a full-page replacement because the navigation mode chain had bugs at 4 of 5 decision points, none visible without Chrome DevTools MCP.

This skill forces you to prove the work before reporting it.

## When to invoke

Fire this skill when ALL of these are true:
- The task modifies files in `packages/dashboard/`, `packages/designspec-renderer/`, `e2e/`, `packages/agents-ux/src/prototype/`, or `packages/agents-ux/src/ux-design/`
- OR the task modifies any file matching `*evaluator*`, `*vision*`, or `*correction-pipeline*` under `packages/agents-ux/`
- You are about to tell the user "done", "complete", "all tests pass", or similar

Do NOT invoke for pure doc changes, config changes, or work that doesn't touch the prototype/renderer/dashboard surface.

When invoked for code changes, the skill also verifies that required documentation updates were made per CLAUDE.md Section Documentation (lines 306-317) via `/verify-docs`.

## Protocol

### Step 0: Run the CLAUDE.md test triad (prerequisite)

Per `CLAUDE.md` §"Full Ownership of All Tests" (lines 60-73), no task is "done" until all three of these pass with zero failures:

```bash
nx run-many -t typecheck
nx run-many -t test
nx run-many -t lint
```

This skill assumes these are green — the 2026-04-22 origin failures all had typecheck + unit tests passing while the browser was broken. If Step 0 is red, stop here; Steps 1–5 only matter once the universal gate is clean.

### Step 1: Kill stale Vite (always)

```bash
lsof -ti:4100 | xargs kill -9
```

Stale Vite has caused 3+ wasted debug cycles in prior sessions. The test passes but the browser shows old behavior. The dashboard auto-starts fresh Vite on next `/design` load.

If you skip this step and a test later fails with "element not found" or "expected hidden, got visible," the FIRST thing to check is whether Vite was stale.

### Step 2: Run E2E tests in headed mode

```bash
npx playwright test <your-test-file>.spec.ts --headed
```

Never report pass/fail from `--list`, headless, or typecheck alone. Headed mode is the only way to catch:
- Overlay rendering bugs (drawer opens as full page, modal doesn't center)
- Navigation wiring bugs (hotspot exists but click does nothing)
- ScreenSelectorBar badge bugs (screen type not shown)
- Spec-reload race conditions (inline style applied then immediately wiped)

If any test fails, fix it before proceeding. Do not report "7 of 8 pass" as success.

### Step 3: Visual verification via Chrome DevTools MCP

Required for: overlay/drawer/modal changes, navigation binding changes, LayoutShell/chrome changes, ScreenSelectorBar changes.

Tool sequence:
```
1. navigate_page → http://localhost:3000/design
2. take_snapshot  → find the Prototype button uid
3. click          → enter prototype mode
4. wait_for       → "Prototype Mode" or "Exit Prototype"
5. take_screenshot → verify the rendered prototype visually
6. take_snapshot  → find the element to interact with
7. click          → interact (bell icon, nav link, overlay trigger)
8. take_screenshot → verify the result (drawer slid in? modal centered? page replaced?)
```

Screenshot BEFORE and AFTER every interaction. If you can't see the change in the screenshot, the fix isn't working.

### Step 4: Full pipeline verification (conditional)

Required ONLY when changes affect design GENERATION (not just rendering):
- `screen_type` support (viewport resolver, overlay prompt)
- Chrome Pass (region derivation, frozen chrome merge, `submit_design` schema)
- `navigateTo` propagation or navigation binding logic
- `submit_design` tool schema changes

```bash
cd fixtures/claim-filling-sample
node ../../packages/cli/dist/bin.js design:page:all
```

Then verify:
- Viewport widths: `jq '.width' .agentforge/previews/bookshelf-*/scripts/designspec-v2.json`
- Shared chrome regions: `jq '.regions' .agentforge/previews/shared-chrome.json` (must be non-empty)
- Open prototype in browser and visually verify overlay behavior

Use `--design-only` (~8s) when only fixing post-LLM logic (manifest, regions). Use full run (~3min) when changing prompts or tool schemas.

**Gotcha:** After `design:generate`, pages.yaml lacks `designStatus: rendered`. Prototype button stays disabled. Add `designStatus: rendered` to each page that has a design file.

### Step 4b: Evaluator / vision model verification (conditional)

Required ONLY when changed files include an evaluator, vision model caller, or correction pipeline (`*evaluator*`, `*vision*`, `*correction-pipeline*` under `packages/agents-ux/`).

Run a real design evaluation against a known fixture screen with a rendered design (e.g., `fixtures/claim-filling-sample`). Capture the raw evaluator JSON response and verify:
- `score` is between 1–99 (not 0, not 100)
- `issues` array is non-empty with at least one actionable fix

**Sensor failure cases — treat as BLOCKED, not DONE:**
- Score is 0 → evaluator call likely errored silently. The canonical cause is `docs/lessons-learned.md` §"Claude 4.7+ Models Reject Sampling Parameters": `claude-opus-4-7+` and `claude-sonnet-4-7+` return 400 on any non-default `temperature` / `top_p` / `top_k`, on **both** Anthropic-direct and Vertex (not Vertex-specific). `modelSupportsTemperature()` in `packages/providers/src/claude/claude-provider.ts` now strips unsupported params; if you're on a version without that guard, pin to `claude-opus-4-6` / `claude-sonnet-4-6` / `claude-haiku-4-5` (per `CLAUDE.md` lines 204-207) or drop the sampling params.
- Score is 100 → evaluator is not inspecting the screenshot (no real design scores perfect)
- Issues array is empty → evaluator returned a score but no actionable feedback

**Origin:** Vision evaluator silently returned 0/100 for all evaluations (2026-04-22) because `EVALUATOR_MODEL = 'claude-opus-4-7'` was called with `temperature: 0` and the model family rejects sampling params. The entire self-correction loop produced no corrections while appearing to run successfully. See `docs/lessons-learned.md` §"Claude 4.7+ Models Reject Sampling Parameters".

### Step 5: Session retrospective

This step captures what the session learned so future sessions don't repeat the same struggles. It runs active detection first, then fills gaps with self-analysis.

**5a. Active struggle detection** — run these checks against the session's git history:

```bash
# How many commits in this session? (rough: commits in last 4 hours)
git log --oneline --since="4 hours ago" | wc -l

# Files touched by 3+ commits (debugging loop signal)
git log --since="4 hours ago" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -10

# "Fix" commit chains (iterative troubleshooting signal)
git log --oneline --since="4 hours ago" | grep -i "fix\|revert\|undo\|retry\|attempt"
```

**Struggle signals** (any of these = lessons-learned entry is MANDATORY):
- A file was edited in 3+ separate commits this session → debugging loop
- 2+ consecutive commits with "fix" in the message → iterative troubleshooting
- Any reverted or undone commits → approach was tried and abandoned
- Stale Vite was detected in Step 1 (and caused actual debugging time)
- A test failed in headed mode (Step 2) that passed in headless → environment-specific issue

**5b. Self-analysis** — even if no struggle signals are detected, answer honestly:
- What was the hardest part of this task? Why?
- Did any approach fail before the one that worked? What was wrong with it?
- Is there anything a future agent would waste time on that this session now knows?

**5c. Write the lessons-learned entry** — if any struggle signal fired OR the self-analysis identified a non-trivial learning:

1. Grep `docs/lessons-learned.md` for keywords related to this learning — don't duplicate an existing entry.
2. If no existing entry covers it, **write a new entry directly** to `docs/lessons-learned.md`. Use this format:
   ```
   ### <Short descriptive title> — **RESOLVED** (YYYY-MM-DD)
   **Context:** <What was being done when this happened>
   **Problem:** <What went wrong, with specifics — file paths, error messages, symptoms>
   **Root cause:** <Why it happened — the actual reason, not the symptom>
   **Fix:** <What solved it — be specific enough that a future agent can apply it directly>
   **Rule:** <One-sentence rule to prevent recurrence>
   ```
3. Preserve specifics per the anti-bleach rule. "Port 4100 served stale Vite because the dashboard's auto-start silently failed when the previous process held the port" is useful. "Had build environment issues" is not.
4. **If the entry's status is RULE or SUPERSEDED**, also add it to `docs/lessons-learned-rules.md` (the compact rules file read by session-start). Keep both files in sync — the rules file is the session-start fast path.

**This step auto-writes.** Unlike other doc checks that propose-then-confirm, lessons-learned entries must be written before the session ends — the debugging context cannot be recovered later.

**5d. Auto-update CLAUDE.md pointers** — read `CLAUDE.md` `## Current State` and update:
- **Active plans** — advance phase status if a plan phase was completed
- **Completed plans** — move finished plans here with completion date
- **Last session** — one-line pointer to what was done

These are factual fields with low risk of error. Auto-update without asking.

### Step 6: Documentation verification

Run `/verify-docs` in task-scoped mode. At this point, lessons-learned and CLAUDE.md pointers are already updated (Step 5). This step checks the remaining doc areas:
- Checks vision.md Layer N Current State accuracy if architecture changed (VISION-LAYER-N)
- Validates domain specs reflect implemented behavior if a plan phase completed (SPEC-SYNC)
- Checks CLI docs if CLI commands changed (CLI-DOCS)
- Runs staleness greps on domain specs if locked decisions changed (SPEC-GREP)
- Checks for new undocumented modules (FEATURE-DOCS)

For VISION-LAYER-N, SPEC-SYNC, CLI-DOCS, and FEATURE-DOCS: if a gap is found, `/verify-docs` **proposes the fix with exact text** and asks for confirmation before writing. These docs are nuanced enough that auto-writing risks inaccuracy.

If `/verify-docs` reports any FAILURE after proposed fixes are applied (or user declines a fix), the failure remains and blocks done.

### Step 7: Produce the verification table

Before reporting "done" to the user, output this table with evidence:

```
## Verification

| Check | Status | Evidence |
|-------|--------|----------|
| CLAUDE.md test triad | N/N pass | `nx run-many -t typecheck`, `-t test`, `-t lint` output lines |
| Stale Vite killed | yes/no | `lsof -ti:4100` output |
| E2E headed mode | N/N pass | test file name, headed flag |
| Visual verification | yes/no | screenshot description or "not applicable" |
| Full pipeline | yes/no/n/a | viewport widths, region check, or "no generation changes" |
| Evaluator check | yes/no/n/a/BLOCKED | raw score + issue count, or "no evaluator changes". BLOCKED if score=0, score=100, or issues=[] |
| Session retrospective | written/n/a | lessons-learned entry title, or "no struggles detected, no learnings" |
| CLAUDE.md pointers | updated/n/a | fields updated, or "standalone fix, no plan changes" |
| Doc verification | pass/fail/n/a | verify-docs report summary: N failures, M warnings. Key issues if any. |
```

If any row is "no", "fail", or blank, you are NOT done. Fix it first.

## Anti-bleach rule

When writing the verification table or reporting results, preserve the specific failure context. Do not convert "7/8 tests failed because the prototype API doesn't discover new screens when a saved manifest exists" into "tests needed adjustment." The specificity is what helps the next agent debug the same class of issue.

## Bail-out

If the change is truly renderer-internal (e.g., refactoring a style function with no behavioral change) and all existing E2E tests pass in headed mode, steps 3-4 may be skipped. But step 2 (headed E2E) is never skippable for code under `packages/designspec-renderer/src/renderer/browser/app/`.

Step 5 (session retrospective) is never skippable — even renderer-internal refactors can surface environment gotchas worth capturing. Step 6 (doc verification via `/verify-docs`) may be skipped for renderer-internal refactors with no behavioral change.
