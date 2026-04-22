# Audit: Distribution of 2026-04-22 Session Learnings

**Auditor:** Claude (self-audit)
**Scope:** Commit `4d67b73` — distribution of Phase A6 overlay/claim-filling session learnings
**Session doc:** `docs/self-correction/2026-04-22-phase-a6-overlay-system-e2e.md`

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Blocker | 1 |
| Fix-soon | 5 |
| Nit | 3 |

---

## File 1: `.claude/rules/e2e-coverage.md`

### 1. Content fidelity

**Finding (fix-soon): "3 debug cycles" specificity dropped.**

Session original:
> "I lost 3 debug cycles to stale Vite before remembering this."

Rule file:
> "The renderer on port 4100 may serve old code."

The "3 debug cycles" was the motivating evidence. The rule is now a naked imperative — a future agent might deprioritize it because there's no indication of how costly the failure is. Should add: "Stale Vite has caused 3+ wasted debug cycles in prior sessions."

### 2. Duplication

**Finding (nit): "Test the full pipeline" appears in both e2e-coverage.md AND design-pipeline.md.**

e2e-coverage.md item 2:
> "Test the full pipeline, not just the renderer."

design-pipeline.md "Full Pipeline Verification":
> "fixture-based tests are insufficient. You must also verify the LLM produces correct output."

These are the same rule stated from two angles. Not a blocker — one is "when writing E2E tests" context, the other is "when changing the pipeline" context — but a future agent encountering both might not realize they're the same mandate. The e2e-coverage version should cross-reference the design-pipeline version instead of restating.

### 3. Lost context

**Finding (fix-soon): Chrome DevTools MCP verification pattern lost.**

Session had a concrete 8-step pattern:
```
1. mcp chrome-devtools navigate_page → http://localhost:3000/design
2. mcp chrome-devtools take_snapshot → find the Prototype button uid
3. mcp chrome-devtools click → click Prototype
4. mcp chrome-devtools wait_for → "Prototype Mode"
5. mcp chrome-devtools take_screenshot → verify the rendered prototype
6. mcp chrome-devtools take_snapshot → find the element to click
7. mcp chrome-devtools click → interact with the prototype
8. mcp chrome-devtools take_screenshot → verify the result
```

Rule file says:
> "Use Chrome DevTools MCP: navigate to `/design`, click Prototype, take screenshots, click elements, verify drawer/modal behavior."

The step-by-step MCP tool names are gone. A future agent that hasn't used Chrome DevTools MCP before would need to figure out the tool names and sequence. The session pattern was the most actionable part.

### 4. Dead cross-references

No cross-references in this file. None broken.

### 5. N/A (navigation data flow not in this file)

### 6. Session-log pruning

The session doc retains the full narrative including "The user called this out" and the debugging timeline. The rule file correctly extracts just the rule. Balance is correct.

### 7. Wrong-file placement

No issue. E2E rules belong in e2e-coverage.md.

---

## File 2: `.claude/rules/design-pipeline.md`

### 1. Content fidelity

**Finding (fix-soon): Verification steps are good but missing the "designStatus" gotcha.**

Session original:
> "Gotcha: Missing `designStatus`. LLM-generated pages.yaml doesn't include `designStatus: rendered`. Without it, the Prototype button stays disabled."

This is nowhere in design-pipeline.md. An agent running `design:page:all` after `design:generate` will hit the same issue and waste time.

### 2. Duplication

See e2e-coverage.md finding above — "full pipeline" rule stated twice.

### 3. Lost context

**Finding (nit): "Which fixture" is hardcoded.**

Rule says:
> "Run `design:page:all` on `fixtures/claim-filling-sample` (has drawer + modal screens)"

This is correct today but becomes stale if the fixture changes. Should say "a fixture with drawer + modal screens" and mention claim-filling as the current example.

### 4. Dead cross-references

No explicit cross-references. No issue.

### 5. N/A (navigation data flow not in this file)

### 6. Session-log pruning

N/A.

### 7. Wrong-file placement

**Finding (nit): Chrome Pass regeneration procedure is in BOTH docs/cli/design.md AND .claude/rules/design-pipeline.md.**

The `rm` + re-run procedure appears in both. cli/design.md has it as CLI reference, design-pipeline.md has it embedded in verification steps. The rule should reference the CLI doc instead of inlining the commands.

---

## File 3: `docs/architecture/prototype-rendering-dataflow.md`

### 1. Content fidelity

**Finding (blocker): Bug annotations stripped from the data flow.**

Session original step 3:
> `navMode = binding?.mode   ← FIXED: was `binding?.mode ?? 'navigate'``

Architecture doc step 3:
> `navMode = binding?.mode   (undefined if no binding — NOT defaulting to 'navigate')`

The architecture doc describes the CURRENT correct behavior but doesn't say what the bug WAS or why the current behavior matters. The parenthetical "(undefined if no binding — NOT defaulting to 'navigate')" hints at it but doesn't explain that defaulting to 'navigate' was the bug that broke drawer overlays for inline navigateTo nodes.

Session original step 5:
> `FIXED: handledHashRef skips hash changes set by navigateTo()`
> `Without fix: onHashChange uses only screenType, overrides navigate decisions`

Architecture doc step 5:
> `handledHashRef prevents re-processing (hash already handled by step 4)`
> `Without handledHashRef: onHashChange uses only screenType, overrides step 4`

The architecture doc keeps the "without" line but drops "FIXED" — so a reader doesn't know this was a discovered bug. This matters because if someone removes `handledHashRef` thinking it's cleanup, they won't know it's a deliberate fix.

**This is a blocker** because the data flow is the primary debugging reference for overlay navigation. Stripping bug context makes it a description of the status quo rather than a map of known traps.

### 2. Duplication

No issue. The data flow exists only here.

### 3. Lost context

See blocker above — the "why this step exists" context was stripped when bugs became descriptions.

### 4. Dead cross-references

> `See `docs/lessons-learned.md` "Screen Type Must Be Set BEFORE Design Generation"`

Verified: exists at line 602 of lessons-learned.md. Valid.

### 5. Navigation mode data flow — all 5 steps present?

All 5 steps are present. Step numbering matches. The bug at step 3 (default to 'navigate') and step 5 (hash override) are described but not flagged as historical bugs. Step 1 (no bug, architecture description) and step 2 (no bug, API behavior) are accurate. Step 4 (resolvedMode parameter added) is described correctly.

**Missing:** The session doc had "a bug at each one was discovered" framing. The architecture doc lists 5 steps with correct current behavior but only 2 of the 4 bugs are even hinted at (steps 3 and 5). Bugs at steps 2 (onNavigate not passing mode) and 4 (PrototypeApp not accepting mode parameter) are invisible — they're now just the current API shape.

### 6. Session-log pruning

The architecture doc correctly avoids narrative tone. It's a reference doc, not a story. The tradeoff cost is the bug context (see blocker).

### 7. Wrong-file placement

The data flow belongs here. Correct placement.

---

## File 4: `docs/cli/design.md`

### 1. Content fidelity

**Finding (fix-soon): "Chrome Pass only" timing row is misleading.**

CLI doc says:
| Chrome Pass only | ~30s | Chrome only |

There is no CLI flag to run "Chrome Pass only." The 30s is the Chrome Pass portion within a full `design:page:all` run. A future agent might try `--chrome-only` and fail. Should clarify this is measured time within a full run, not a separate invocation.

### 2. Duplication

Chrome Pass regeneration procedure (`rm` + re-run) is here AND in design-pipeline.md. See File 2 finding.

### 3. Lost context

**Finding (fix-soon): `design:generate` interactive limitation not documented.**

Session original:
> "The command is interactive (readline prompts). Piped input partially works but may hang on the theme selection prompt. Best run manually with `! <command>` in Claude Code."

CLI doc says:
> "Interactive. Prompts for design theme selection and spec approval."

The Claude Code workaround (`! <command>`) is missing. This is the most important operational detail for an agent trying to run the command programmatically.

### 4. Dead cross-references

No cross-references in this file. None broken.

### 5. N/A

### 6. Session-log pruning

N/A.

### 7. Wrong-file placement

**Finding (fix-soon): Chrome Pass regeneration is a PROCEDURE, not a CLI reference.**

The `rm` commands + "must run without --design-only" is operational procedure, not command documentation. CLI docs should describe what the command does and its flags. Procedures for cache invalidation belong in `.claude/rules/design-pipeline.md` (where they already exist, creating duplication).

---

## File 5: `docs/lessons-learned.md`

### 1. Content fidelity

The "Screen Type Must Be Set BEFORE Design Generation" entry was written in the main session, not during the distribution commit. It predates the distribution. Content is faithful to the session — it lists all three constraints with specific examples.

No issue found.

### 2. Duplication

The screen_type constraint appears in lessons-learned.md AND in prototype-rendering-dataflow.md (as "Critical constraint"). The dataflow doc version is a 3-line summary that cross-references lessons-learned. This is intentional — the dataflow doc needs the constraint in-context but delegates the full rule. Acceptable.

### 3. Lost context

No issue. The lessons-learned entry has full context including file paths, the specific fixture that exposed it, and the three sub-constraints.

### 4. Dead cross-references

No explicit cross-references to verify.

### 5. N/A

### 6. Session-log pruning

N/A.

### 7. Wrong-file placement

No issue. Design constraints belong in lessons-learned.md.

---

## Corrections Diff

### Correction 1 (blocker): Restore bug annotations in prototype-rendering-dataflow.md

```diff
--- a/docs/architecture/prototype-rendering-dataflow.md
+++ b/docs/architecture/prototype-rendering-dataflow.md
@@ -309,8 +309,10 @@
 Step 3: DesignSpecRenderer (render time)
   Populates navMap from both sources (bindings + inline navigateTo)
   Looks up binding: navigationBindings.find(b => b.sourceNodeId === nodeId)
-  navMode = binding?.mode   (undefined if no binding — NOT defaulting to 'navigate')
+  navMode = binding?.mode   (undefined if no binding)
+  BUG FIXED: previously defaulted to 'navigate' when no binding existed,
+    which overrode screenType-based overlay derivation for inline navigateTo nodes
   Renders: data-nav-mode attribute, onClick → onNavigate(target, navMode)
 
 Step 4: PrototypeApp.navigateTo(screenId, resolvedMode?)
@@ -321,7 +323,9 @@
 
 Step 5: Hash change handler
   navigateTo sets window.location.hash → triggers onHashChange
-  handledHashRef prevents re-processing (hash already handled by step 4)
+  handledHashRef prevents re-processing (hash already handled by step 4)
+  BUG FIXED: without handledHashRef, onHashChange re-derived mode using only
+    screenType, overriding step 4's binding-mode decision for drawer screens
   Without handledHashRef: onHashChange uses only screenType, overrides step 4
```

### Correction 2 (fix-soon): Add cost context to stale Vite rule in e2e-coverage.md

```diff
--- a/.claude/rules/e2e-coverage.md
+++ b/.claude/rules/e2e-coverage.md
@@ -37,7 +37,8 @@
 1. **Kill stale Vite before running.** The renderer on port 4100 may serve old code.
    ```bash
    lsof -ti:4100 | xargs kill -9
    ```
-   The dashboard auto-starts a fresh Vite when `/design` loads. Tests use
+   Stale Vite has caused 3+ wasted debug cycles in prior sessions — the test
+   passes but the browser shows old behavior. The dashboard auto-starts a fresh Vite when `/design` loads. Tests use
    `waitForRendererReady()` to wait for it.
```

### Correction 3 (fix-soon): Add Chrome DevTools MCP step pattern to e2e-coverage.md

```diff
--- a/.claude/rules/e2e-coverage.md
+++ b/.claude/rules/e2e-coverage.md
@@ -50,4 +50,14 @@
 3. **Visual verification is non-negotiable for overlay/navigation work.** Use
    Chrome DevTools MCP: navigate to `/design`, click Prototype, take screenshots,
    click elements, verify drawer/modal behavior. Code-only verification has
    missed 4+ bugs in overlay rendering that were immediately visible in
    screenshots.
+
+   MCP tool sequence for prototype verification:
+   ```
+   navigate_page → http://localhost:3000/design
+   take_snapshot  → find the Prototype button uid
+   click          → enter prototype mode
+   wait_for       → "Prototype Mode"
+   take_screenshot → verify rendered state
+   take_snapshot  → find target element uid
+   click          → interact, then screenshot again to verify
+   ```
```

### Correction 4 (fix-soon): Add designStatus gotcha to design-pipeline.md

```diff
--- a/.claude/rules/design-pipeline.md
+++ b/.claude/rules/design-pipeline.md
@@ -140,6 +140,11 @@
 1. Run `design:page:all` on `fixtures/claim-filling-sample` (has drawer + modal screens)
 2. Check viewport widths: `jq '.width' .agentforge/previews/bookshelf-*/scripts/designspec-v2.json`
 3. Check `shared-chrome.json` has non-empty `regions`
 4. Open prototype in browser, verify overlay behavior visually
 5. Navigate between screens, verify ScreenSelectorBar badges
+
+**Gotcha after `design:generate`:** The LLM-regenerated pages.yaml does NOT
+include `designStatus: rendered`. The Prototype button stays disabled until
+you add `designStatus: rendered` to each page that has a matching design
+file in `agentforge/designs/`.
```

### Correction 5 (fix-soon): Add Claude Code workaround to cli/design.md

```diff
--- a/docs/cli/design.md
+++ b/docs/cli/design.md
@@ -8,6 +8,10 @@
 
 **Interactive.** Prompts for design theme selection and spec approval.
 
+**Claude Code limitation:** Piped input (`printf 'n\ny\n' |`) partially works
+but hangs on the theme selection prompt (expects 1/2/3, not y). Run
+interactively via `! cd <project> && node ../../packages/cli/dist/bin.js design:generate`.
+
 ```bash
 cd <project-root>
 agentforge design:generate
```

### Correction 6 (fix-soon): Clarify "Chrome Pass only" timing row

```diff
--- a/docs/cli/design.md
+++ b/docs/cli/design.md
@@ -68,7 +68,7 @@
 | Run type | Time | LLM calls |
 |----------|------|-----------|
 | Full | ~163s wall-clock | All stages |
 | `--design-only` | ~8s | None (cached) |
-| Chrome Pass only | ~30s | Chrome only |
+| Chrome Pass (within full run) | ~30s | Chrome LLM only (no separate flag) |
```

### Correction 7 (nit): Remove Chrome Pass procedure from cli/design.md (already in design-pipeline.md)

No diff — this is a judgment call. The duplication is minor and the CLI doc version is more discoverable for someone reading command docs. Recommend: keep both but add a cross-reference in design-pipeline.md: "See also `docs/cli/design.md` for full command reference."

### Correction 8 (nit): Cross-reference pipeline rule from e2e-coverage.md

```diff
--- a/.claude/rules/e2e-coverage.md
+++ b/.claude/rules/e2e-coverage.md
@@ -44,7 +44,8 @@
 2. **Test the full pipeline, not just the renderer.** Fixture-based tests prove
    the renderer works. But they don't prove the LLM produces correct input.
    For features that change how design specs are generated (screen_type,
-   navigateTo, Chrome Pass), also run `design:page:all` on a real fixture
+   navigateTo, Chrome Pass), also run `design:page:all` on a real fixture
+   (see `.claude/rules/design-pipeline.md` "Full Pipeline Verification")
    and visually verify the prototype.
```

---

## Process Reflection

My primary failure mode was **stripping diagnostic context during formalization**. When converting a narrative ("I lost 3 debug cycles") into a rule ("kill stale Vite"), I dropped the severity signal that makes an agent actually follow the rule. Rules without motivation read as style preferences, not learned-the-hard-way mandates.

Secondary failure: **fear of duplication made me drop the MCP tool sequence**. The 8-step Chrome DevTools pattern was the most immediately actionable content in the session. I summarized it to one line ("Use Chrome DevTools MCP: navigate, click, screenshot") because the full sequence felt too detailed for a rules file. But the rules file is exactly where a future agent looks when it needs to know HOW.

The distribution architecture was correct — rules in `.claude/rules/`, data flow in `docs/architecture/`, CLI in `docs/cli/`. The content within each file was under-preserved.

---

## PRD Issues Found

No contradictions with CLAUDE.md patterns. The "Browser-First Debugging" section in CLAUDE.md (lines 25-35) already mandates Chrome DevTools MCP verification for dashboard work. The e2e-coverage.md rule reinforces it for prototype-specific work. Consistent.
