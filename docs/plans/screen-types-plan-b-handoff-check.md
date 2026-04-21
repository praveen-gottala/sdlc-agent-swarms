# Plan B → B2.5 Handoff Check

A three-turn protocol to verify a fresh agent has read the critical B2.5 context before writing code. Designed to surface **doc gaps** (things I need to fix upstream) separately from **agent gaps** (things the agent missed in docs that already cover it).

**How to use.** At the start of a new session, paste each block below to the agent in order. Do not paste the answer key until the agent has posted all 13 answers. The final output you care about is the `## Doc gaps to report upstream` section the agent produces in Turn 2.

---

## Turn 1 — paste to fresh agent

> Before I ask you to do any work on Phase B2.5 of `docs/plans/screen-types-plan-b.md`, answer the 13 questions below **in order**. Rules:
>
> - Cite the exact file path + the smallest section anchor that supports each answer (e.g. `docs/plans/screen-types-plan-b.md → "Context for B2.5 Implementers" item 2`).
> - If you cannot find a cite, write "no cite found" and then give your best-guess answer separately. Do not fabricate citations.
> - One-line answers are fine. Precision beats verbosity.
> - Do NOT ask me for an answer key until you have posted all 13 answers in a single reply.
>
> ### Questions
>
> 1. I'm about to run `npx playwright test e2e/screen-types-plan-b.spec.ts`. What servers do I need running, which ones does Playwright start automatically, and what helper must every test call after `page.goto('/design')`?
> 2. My Vite renderer on port 4100 is open but the iframe is blank. What's the repo-approved recovery, and what is `getRendererStatus()` explicitly NOT allowed to do here (and why)?
> 3. I want to click the "Add Expense" button in the PET prototype and assert navigation. Write the exact selector and explain why a naive `text=` locator would fail.
> 4. What does `fixtures/personal-expense-tracker/shared-chrome.e2e.json` exist for, and what does `GET /api/prototype` do with it?
> 5. I'm writing a test against a fixture (not an `apps/` project). How do I make the dashboard activate it? Name the file and the alternative API route.
> 6. In `packages/dashboard/src/app/api/prototype/route.ts`, three scrubbing rules are applied to each page spec before it's returned. Name them, point to the ADR that authorized them, and explain why the fix lives at the runtime boundary instead of at spec generation or at the ingest step.
> 7. Inside Phase B2.5, what is the **only** production-code change that is in scope, and what directories are explicitly out of scope? What should you do if a B2.5 test appears to require editing `packages/designspec-renderer/`?
> 8. What's the right `waitUntil` option for `page.goto('/design')` in these tests, and why is the obvious alternative wrong?
> 9. What does a `screenId` starting with `__` mean? Where are such ids filtered out, and which test tag guards the filter?
> 10. `docs/lessons-learned.md` contains an entry titled "Renderer Staleness: Kill-and-Restart, Not Just Port-Check". Should you follow its recommendations verbatim today? Quote the exact status marker.
> 11. What is the convention for E2E test file names in this repo, and what is an example of a name that was explicitly rejected?
> 12. Name the three helper functions added to `packages/designspec-renderer/src/renderer/browser/spec-split.ts` during B2, what each detects/removes, and where they are called.
> 13. If I asked you to start Phase B2.5 right now, which three docs would you read first, in what order, and what is the single most important thing in each that prevents you from breaking the E2E setup?

---

## Turn 2 — paste AFTER the agent has posted all 13 answers

> Below is the authoritative answer key. Grade yourself **strictly** against it. Do not soften PARTIAL up to PASS, and do not soften FAIL up to PARTIAL. If you rationalize a wrong answer I will catch it and we'll both waste a session.
>
> ### Output format (exactly this)
>
> For each question, one row:
>
> `Q<n> | PASS | PARTIAL | FAIL — <1-sentence diff vs key> | classification: [AGENT_GAP | DOC_GAP | KEY_AMBIGUOUS | N/A]`
>
> - **PASS** = hit all bolded keywords in the key, cite matches.
> - **PARTIAL** = hit some bolded keywords but missed one or more. Be explicit about which you missed.
> - **FAIL** = contradicted the key, answered a different question, or missed the point entirely.
> - **AGENT_GAP** = the docs cover this clearly, I missed it. Point at where it was.
> - **DOC_GAP** = I looked and the docs are silent / unclear / contradictory. Name the files you searched.
> - **KEY_AMBIGUOUS** = the key is open to interpretation; say why.
> - **N/A** = only for PASS rows.
>
> ### Special rules
>
> - **Question 10 is a trap.** The only PASS answer is "no, it is superseded 2026-04-20". Any answer that follows the old recommendations or describes them as current is a **FAIL**, not a PARTIAL. Do not rationalize.
> - **Question 13 is a coverage probe.** A PASS requires naming all three of: `docs/plans/screen-types-plan-b.md` (Context block), `docs/lessons-learned.md` (SUPERSEDED banner), `docs/adrs/ADR-040-prototype-runtime-scrubbing.md`. Missing any one is PARTIAL at best.
>
> ### After the table
>
> Produce a section titled `## Doc gaps to report upstream` listing only the rows classified `DOC_GAP` or `KEY_AMBIGUOUS`. For each, propose a specific doc edit (file + section + one-line change). If there are no such rows, write exactly `none`.
>
> Do NOT propose any code changes yet. Do NOT revise your Turn 1 answers. This turn is grading only.
>
> ### Answer key
>
> A correct answer must hit the **bolded keywords**. Keywords are what I diff against — prose style is irrelevant.
>
> 1. **Next.js on port 3000 started manually** (e.g. `nx serve dashboard`). Playwright's config has **no `webServer` block**. `e2e/global-setup.ts` checks **only Next.js**. Vite (port 4100) is **started on-demand** by the dashboard when `/design` loads. Every test must call **`waitForRendererReady()`** (defined in `e2e/screen-types-plan-b.spec.ts`), which polls `/api/renderer/status`. — Source: `docs/plans/screen-types-plan-b.md` → "Context for B2.5 Implementers" item 1.
>
> 2. **Manually** kill the port and restart Vite (`nx serve browser` from `packages/designspec-renderer`). `getRendererStatus()` **must NOT reintroduce source-mtime staleness or auto-restart on stale** — it deliberately returns `'ready'` whenever the HTTP health check passes. Rationale: the removed logic caused **OOM death spirals** with Vite recompile + Next + headed Chromium during E2E. — Source: `docs/lessons-learned.md` SUPERSEDED banner + `docs/adrs/ADR-040-prototype-runtime-scrubbing.md` + Context block item 1.
>
> 3. **`iframe.getByRole('button', { name: 'Add Expense', exact: true })`**, scoped to the **ScreenSelectorBar** container. Reason: the PET fixture has **two "Add Expense" buttons** — the chrome header's decorative `+ Add Expense` (NOT wired for navigation) and the ScreenSelectorBar's (wired). A `text=` locator hits the wrong one first. — Source: Context block item 2.
>
> 4. A **committed static fallback** shared-chrome spec. `GET /api/prototype` reads `.agentforge/previews/shared-chrome.json` first and **falls back** to `shared-chrome.e2e.json` when absent, so visual / chrome-consistency tests can run **without first invoking `design:page:all`**. Must be kept in sync if the PET fixture is regenerated. — Source: Context block item 3.
>
> 5. **`.agentforge-dashboard-prefs.json`** (the `activeProject` field), written in `globalSetup` — because `project-reader.ts#discoverProjects()` scans only `apps/`, not `fixtures/`. Alternative: **`PUT /api/projects/active`** with `{ "path": "<absolute fixture path>" }` (route file: `packages/dashboard/src/app/api/projects/active/route.ts`; exposes `GET` + `PUT`, not `POST`, and the path is `active`, not `activate`). The freshly-onboarded `@b2.5-full-loop` flow does NOT need this step. — Source: Context block item 4.
>
> 6. The three rules: (i) strip **duplicate chrome** via `findPageChromeRootIds` (exact / compact / pattern+type matching); (ii) strip **persistent overlay backdrops** via `isPersistentOverlayBackdrop` + `stripPersistentOverlays`; (iii) filter **pseudo-screens** whose `screenId` starts with `__` (and nav bindings referencing them). Authorized by **ADR-040** (`docs/adrs/ADR-040-prototype-runtime-scrubbing.md`). Why runtime: Option A (LLM prompt) is the correct long-term fix but would block B2 verification; Option B (fix at ingest) was rejected to preserve the **stored spec as the LLM's artifact of record** for downstream tools (Penpot round-trip, exports). — Source: ADR-040.
>
> 7. Only in-scope production change: **`POST /api/design/generate-all`** dashboard route for `@b2.5-full-loop`, if the test can't shell out to the CLI cleanly. **Out of scope:** `packages/designspec-renderer/` and `packages/agents-ux/`. If a B2.5 test seems to require edits there, **stop** and decide: regression the scrub missed (extend the scrub + log a lesson) vs new feature (out of scope, open a new phase). — Source: Context block item 7 + B2.5 "Files" section.
>
> 8. **`'domcontentloaded'`**. `'networkidle'` is **unreliable** because the prototype iframe keeps connections warm. — Source: Context block item 1 (last sub-bullet).
>
> 9. **Pseudo-screens** (e.g. `__shared-chrome__`, `__chrome__`) — internal markers used by Chrome Pass, never navigable. Filtered at **`GET /api/prototype`** (stripped from the manifest and from nav bindings that reference them). Guarded by **`@b2.5-no-pseudo-screen`**. — Source: Context block item 5 + ADR-040 rule (iii).
>
> 10. **No.** Marked **"SUPERSEDED 2026-04-20"**. Auto-restart-on-stale + source-mtime tracking were removed during Plan B Phase B2. Kept only for historical context; cross-references ADR-040 and the B2.5 Context block. — Source: `docs/lessons-learned.md` ~line 428.
>
> 11. Convention: descriptive, phase-anchored `<topic>.spec.ts` names — e.g. **`screen-types-plan-b.spec.ts`**. Explicitly rejected: **`plan-b-shared-layout.spec.ts`**. — Source: Context block item 6.
>
> 12. (i) **`findPageChromeRootIds(pageSpec, regions)`** — resolves page-spec root-child ids that duplicate a shared-chrome region using exact / compact (hyphen-insensitive) / pattern+type matching (handles `topbar` vs `top-bar`). (ii) **`isPersistentOverlayBackdrop(node)`** — detects root-level absolute/fixed nodes with overlay-style background. (iii) **`stripPersistentOverlays(spec)`** — removes those via `stripChromeFromSpec`. All three are called in **`packages/dashboard/src/app/api/prototype/route.ts`** before serialization. Unit tests in `spec-split.test.ts`. — Source: ADR-040 Decision section + `packages/designspec-renderer/src/renderer/browser/spec-split.ts`.
>
> 13. Read in this order: (a) **`docs/plans/screen-types-plan-b.md`** — especially the "Context for B2.5 Implementers" block; most important: **no `webServer` in Playwright config; Next.js must be started manually; tests must call `waitForRendererReady()`**. (b) **`docs/lessons-learned.md`** — the "Renderer Staleness" entry; most important: **it is SUPERSEDED; do NOT reintroduce mtime staleness or auto-restart on stale**. (c) **`docs/adrs/ADR-040-prototype-runtime-scrubbing.md`** — most important: **the three scrub rules are a safety net, not a replacement for upstream prompt fixes; don't add a fourth rule without an ADR**.

---

## Turn 3 — you to me

After the agent produces its grading table, copy just the `## Doc gaps to report upstream` section back to me in this repo's chat. I'll patch the plan / lessons / ADR so the next session passes without gaps.

---

## Hard-fail triggers (abort the handoff, re-brief the agent)

If any of these show up in the grading table, do NOT let the agent start coding. Re-open the three docs and walk through them explicitly before proceeding.

- **Q2 FAIL** where the agent proposed re-adding mtime staleness or auto-restart → didn't read the SUPERSEDED banner.
- **Q6 FAIL or PARTIAL** where the agent wanted to fix the duplicate-chrome bug in `applyFrozenChromeToPageSpec` or in UX-design prompts → didn't read ADR-040's rationale.
- **Q7 FAIL** where the agent proposed edits in `packages/designspec-renderer/` as B2.5 scope → didn't read the scope boundary.
- **Q10 anything other than PASS** → didn't read `docs/lessons-learned.md` at all (or rationalized after reading the key).
- **Q13 PARTIAL or FAIL** → didn't survey all three docs; will miss at least one landmine during implementation.

## Soft-fail triggers (clarify briefly, then proceed)

- **Q3 PARTIAL** without mentioning the two-button quirk → point the agent at Context block item 2.
- **Q4 PARTIAL** without mentioning the `design:page:all` bypass → point the agent at Context block item 3.
- **Q9 PARTIAL** without naming `@b2.5-no-pseudo-screen` → point the agent at ADR-040 rule (iii).

---

## Maintenance

When you add or change a piece of B2.5 context that would change any answer in the key:

1. Update the relevant source doc (`screen-types-plan-b.md`, `lessons-learned.md`, or the appropriate ADR) — that's the canonical place.
2. Update the matching answer in the **Turn 2 answer key** here.
3. If a new gotcha deserves a new question, add it — but keep this file to ≤ 15 questions. Longer than that and agents will skim.
