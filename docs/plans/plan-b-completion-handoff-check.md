# Plan B Completion Handoff Check

Verifies a fresh agent understands the current state of Plan B (B0-B2.5 complete), the design inspector fixes, and the remaining work before touching code.

**How to use.** At the start of a new session, paste Turn 1. Do not paste the answer key until the agent has posted all 10 answers.

---

## Turn 1 — paste to fresh agent

> Before I ask you to do any work, answer the 10 questions below **in order**. Rules:
>
> - Start with a `## Docs consulted` section listing every file you read, in the order you read them.
> - Cite the exact file path + the smallest section anchor that supports each answer.
> - If you cannot find a cite, write "no cite found" and give your best-guess answer separately.
> - One-line answers are fine. After Q10, STOP.
>
> ### Questions
>
> 1. What is the current status of Plan B? Which phases are complete, which are incomplete, and what is the one intentional `test.fixme` tripwire?
> 2. The design inspector has a known race condition. Describe the data flow: what happens when a user changes a property in the inspector, and why do some property changes get "wiped" in the iframe?
> 3. Two design inspector E2E tests previously failed: `justify-content` and `width`. What was the root cause for each, and where was the fix applied?
> 4. `packages/e2e-test/` used to have a Playwright test file. What happened to it and why? What test runner does the package use now?
> 5. What are the three runtime scrubbing rules applied by `GET /api/prototype` to each page spec? Name the ADR that authorizes them.
> 6. The `docs/lessons-learned.md` entry about `update-node-style` postMessage says it was "not applying styles to nodes." Is this correct today? Quote the status marker.
> 7. If I want to run all Plan B E2E tests, what command do I use? What servers must be running, and what does the test file's `waitForRendererReady()` helper do?
> 8. What is `shared-chrome.e2e.json` and why does it exist as a committed file?
> 9. When adding a new CSS property to the design inspector's property registry, what three things must you verify to avoid hitting the spec-reload race?
> 10. What is Plan B Phase B3, what is its status, and what are the two artifacts from B1/B2 that feed into it?

---

## Turn 2 — paste AFTER the agent has posted all 10 answers

> Below is the authoritative answer key. Grade yourself **strictly**.
>
> ### Output format
>
> `Q<n> | PASS | PARTIAL | FAIL — <1-sentence diff vs key> | classification: [AGENT_GAP | DOC_GAP | KEY_AMBIGUOUS | N/A]`
>
> ### Special rules
>
> - **Q6 is a trap.** The only PASS answer is "No, it is marked **Resolved (2026-04-22)**". Any answer treating it as an open issue is **FAIL**.
> - **Q9 is a coverage probe.** PASS requires all three verification steps.
>
> ### After the table
>
> Produce `## Doc gaps to report upstream` listing only DOC_GAP or KEY_AMBIGUOUS rows with a proposed edit. If none, write `none`.
>
> ### Answer key
>
> 1. **B0-B2.5 complete.** B3 (Layout-Aware Code Generation) is **future/not started**. The one `test.fixme` tripwire is **`@b2.5-single-screen-chrome`** — waiting for `design-generate` to be wired to read `shared-chrome.json`. — Source: `docs/plans/screen-types-plan-b.md` → Progress section.
>
> 2. `handlePropertyChange` does two things: (a) sends **inline styles via `bridgeRef.current?.updateNodeStyle()`** (instant), and (b) calls **`setDesignSpec(updated)`** which triggers a **`useEffect` that reloads the entire spec into the iframe**. The iframe **re-renders from spec data**, wiping the inline styles. For most properties the renderer produces the same CSS so it's invisible, but for **value-format mismatches** the wipe is exposed. — Source: `docs/lessons-learned.md` → "Design Inspector Spec-Reload Race Condition".
>
> 3. **`justify-content`**: property registry stored **`'between'`** but renderer's `getLayoutStyles` only handled **`'space-between'`**. Fixed by adding **shorthand aliases** (`'between'`, `'around'`, `'evenly'`) in `DesignSpecRenderer.tsx`. **`width`**: text input stored **string `'200'`** but `getSizeStyles` only handled **`number | 'fill'`**. Fixed by adding **string-numeric coercion** in both `getSizeStyles` and `handlePropertyChange`. — Source: `docs/lessons-learned.md` → "Chat-driven design iteration" Resolved note + "Design Inspector Spec-Reload Race Condition".
>
> 4. `packages/e2e-test/src/onboarding-prototype.spec.ts` was a **stale duplicate** of the root `e2e/onboarding-prototype.spec.ts`. It lacked **`test-base` fixtures** and `setActiveProject`, always failing because no active project was set. **Removed** because the root `e2e/` version is authoritative. Package now uses **Jest only** (via `jest.config.cjs`). — Source: `docs/lessons-learned.md` → "Test Runner Scoping: Playwright *.spec.ts, Jest *.test.ts".
>
> 5. (i) Strip **duplicate chrome** via `findPageChromeRootIds`; (ii) strip **persistent overlay backdrops** via `stripPersistentOverlays`; (iii) filter **pseudo-screens** with ids starting with `__`. Authorized by **ADR-040** (`docs/adrs/ADR-040-prototype-runtime-scrubbing.md`). — Source: ADR-040 + `docs/plans/screen-types-plan-b.md` → "Context for B2.5 Implementers" item 5.
>
> 6. **No.** Marked **"Resolved (2026-04-22)"**. The bridge works correctly. The failures were caused by the **spec-reload race condition**, not the bridge. — Source: `docs/lessons-learned.md` → first entry, line starting with "Resolved".
>
> 7. **`npx playwright test e2e/screen-types-plan-b.spec.ts`** from repo root. **Next.js on port 3000 must be running manually** (no `webServer` in Playwright config). Vite on 4100 is **started on-demand** by the dashboard. `waitForRendererReady()` **polls `/api/renderer/status`** until HTTP 200 with `status: 'ready'`. — Source: `docs/plans/screen-types-plan-b.md` → "Context for B2.5 Implementers" item 1 + `e2e/screen-types-plan-b.spec.ts` lines 36-56.
>
> 8. A **committed static fallback** for `shared-chrome.json`. `GET /api/prototype` reads `.agentforge/previews/shared-chrome.json` first and **falls back** to `shared-chrome.e2e.json` when absent. Lets B2.5 tests run **without `design:page:all`** (since `.agentforge/previews/` is gitignored). — Source: `docs/plans/screen-types-plan-b.md` → Context block item 3.
>
> 9. (a) The **stored spec value** must match what the **renderer expects** (e.g., `'space-between'` not `'between'`). (b) **Numeric-looking strings** from text inputs must be **coerced to numbers** before storing in the spec. (c) Test by changing the property, **waiting 500ms** for the spec-reload cycle, then checking the iframe node's **computed style** — not just the immediate inline style. — Source: `docs/lessons-learned.md` → "Design Inspector Spec-Reload Race Condition" How to apply.
>
> 10. **Phase B3: Layout-Aware Code Generation.** Status: **future / not started**. Fed by: (a) **`shared-chrome.json`** from B1 Chrome Pass, and (b) **`resolveSharedComponents()`** output from B1. Together they provide the implementation agent with layout structure for generating **`app/layout.tsx`** with `{children}` slot. — Source: `docs/plans/screen-types-plan-b.md` → Phase B3 section.

---

## Turn 3 — you to me

Copy just the `## Doc gaps to report upstream` section back. I'll patch the source docs.

---

## Hard-fail triggers

- **Q2 FAIL** — doesn't understand the race condition; will re-introduce value-mapping bugs.
- **Q6 anything other than PASS** — didn't read the Resolved marker; may waste time investigating a non-bug.
- **Q5 FAIL** — doesn't know about runtime scrubbing; may add a fourth rule without ADR.

## Soft-fail triggers

- **Q9 PARTIAL** missing the 500ms wait step — point at the lessons-learned entry.
- **Q4 PARTIAL** not mentioning why it was removed — mention root `e2e/` is authoritative.

---

## Maintenance

When source docs change, update the matching answer in the Turn 2 key. Keep to 10 questions max.
