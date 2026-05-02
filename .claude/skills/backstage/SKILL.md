---
name: backstage
description: |
  Backstage documentation toolkit. Two subcommands:
  `/backstage create <type> <topic>` — create or revise an internal CHIP backstage documentation page in `docs/`. Types: concept, tutorial, guide, architecture, status.
  `/backstage sync` — regenerate Tier 3 auto-generated pages and check Tier 2 concept pages for drift against their authoritative sources.
argument-hint: "create <type> <topic> | sync"
---

# /backstage

Produces and maintains backstage docs for CHIP — an SDLC framework being demoed to leadership and rolled out to internal employees. The skill enforces specificity, audience awareness, "show the reader the mental model" before showing the API surface, and zero aspirational tense. Reference standard is LangGraph + Prisma for structural patterns, react.dev for tutorial pacing, Linear for status sparseness.

## Subcommand routing

Parse the first token of `$ARGUMENTS`:

- If `create` — shift it off, parse the remaining tokens as `<type> <topic>`, and follow the **create protocol** below (Steps 1-6).
- If `sync` — follow the **sync protocol** below.
- If the first token is one of the five doc types (`concept`, `tutorial`, `guide`, `architecture`, `status`) — treat as `create <type> <topic>` for backward compatibility.
- If empty or unrecognized — stop and ask. Do not guess.

## Backward compatibility

`/backstage <type> <topic>` (without the `create` keyword) is accepted as shorthand for `/backstage create <type> <topic>`. This preserves compatibility with invocations recorded in completed plans and existing documentation. New references should use the explicit `/backstage create <type> <topic>` form.

## When to use

- User asks to write a new page in `docs/` → `create`
- User asks to "fix" or "redo" an existing page → `create`
- User flags a page as generic, marketing-y, blog-post tone, or jargon-dense for the audience → `create`
- User asks to add a missing concept, tutorial, guide, architecture, or status page → `create`
- User asks to check docs freshness, sync backstage, or detect drift → `sync`
- Before a release, demo, or stakeholder review → `sync`

Do **not** use this skill for: ADRs (use the ADR template in `docs/adrs/`), `CLAUDE.md`, README files, package-level READMEs, or external marketing copy.

## Relationship with `/verify-docs`

These two skills share one principle and split scope cleanly:

- **`/backstage create`** writes and revises **one page at a time**. It optimizes for the quality of that page: specificity, mental-model-first opening, swap-test compliance, jargon control.
- **`/backstage sync`** identifies which concept pages are stale by comparing them against their cited authoritative sources. It does not rewrite pages — it produces a drift report with action items.
- **`/verify-docs`** audits the **entire docs site** for staleness, cross-reference consistency, and code-vs-docs drift. It does not write new content; it surfaces what's stale and proposes fixes.

**Shared rule:** every claim must be backed by a verifiable source — a file path the reader can open, a runnable command they can execute, or a citation to research-report.md / design-decisions.md / a specific ADR.

**Workflow:**

- `/backstage sync` identifies drift; `/backstage create <type> <topic>` fixes it.
- After running `/backstage create` on a page, `/verify-docs` should pass on that page (or be expected to fail only on triggers unrelated to content quality, like CLI sync or vision-layer drift).
- When `/verify-docs` flags a page as stale, the fix is to re-run `/backstage create <type> <topic>` on it. The pre-edit staleness pass in Step 1 will catch the broken paths.

If you find yourself wanting to audit the whole site from inside this skill, stop — that's `/verify-docs`'s job.

---

## Create protocol

### Inputs

`/backstage create <type> <topic>`

- `type` — one of `concept`, `tutorial`, `guide`, `architecture`, `status`
- `topic` — short subject identifier matching a `docs/` filename or describing the new page

If the type is omitted or invalid, stop and ask. Do not guess.

### The single test that drives every editorial decision

> **Replace "CHIP" with a competitor's product name (Cursor, Devin, Claude Code, Copilot, OpenHands). If the sentence is still true after the swap, it is generic. Make it CHIP-specific or cut it.**

This is the load-bearing principle of the skill. Step 4 applies it during drafting; Step 6 re-applies it mechanically before the doc ships. A page that survives this test is a page that justifies its place in the docs site.

### Audience

Audience drives what to include and exclude. Decide audience from `type`, refine if `topic` implies otherwise:

| Type           | Primary reader                              | Secondary reader     | Optimize for                                                        |
|----------------|---------------------------------------------|----------------------|---------------------------------------------------------------------|
| `concept`      | Leadership + employees evaluating CHIP      | Developers           | Mental model + sourced "why CHIP does this differently"             |
| `tutorial`     | First-time CHIP user (any internal employee)| Onboarding lead      | One real success in ≤15 minutes; runnable from zero state           |
| `guide`        | Internal developer using CHIP               | Praveen as reference | Reproducible action with verifiable end state                       |
| `architecture` | Internal engineers extending CHIP + Claude Code | Praveen          | Loadable summary an LLM agent can read cold and act on              |
| `status`       | Leadership + cross-team stakeholders        | Praveen              | What is true today, with no aspirational tense                      |

Two audience principles fall out of this matrix:

**Concept and tutorial pages may be read by non-engineers.** Define every acronym (EARS, RAG, HITL, MCP, ADR, etc.) on first use, or replace with a plain-English equivalent. Architecture and guide pages may assume the reader is technical.

**Architecture pages have a non-human reader.** Claude Code reads architecture pages cold to make code changes. Mermaid diagrams (text-parseable) over images. File paths over descriptions. Linked Zod schemas over inline duplicates. An architecture page that an LLM cannot read and act on is a failed architecture page.

**No claim is allowed in any doc type without one of:** a citation to research-report.md / a specific ADR, a file path the reader can open, or a runnable command the reader can execute. If a claim has none of these, cut it.

### Length and splitting

Each type has a target range for a single page. Content that exceeds the ceiling is not "too long" — it means the page covers more than one page's worth of concepts. Split it; don't cut it.

| Type           | Single-page target (markdown lines) | When content exceeds the ceiling                                                  |
|----------------|-------------------------------------|-----------------------------------------------------------------------------------|
| `concept`      | 80–150                              | Create a summary concept page linking to sub-concept pages (e.g., `clarifier.md` → `clarifier-gap-detection.md`, `clarifier-question-budget.md`) |
| `tutorial`     | 100–200                             | Split into "Part 1: first session" + "Part 2: deeper" with explicit handoff       |
| `guide`        | 60–120                              | Split into per-action guides (e.g., "How to run the pipeline" + "How to resume a failed stage") |
| `architecture` | 100–180                             | Create a parent architecture page linking to per-subsystem pages                  |
| `status`       | 40–150                              | Move per-initiative detail to dedicated pages, keep summary table with links      |

**Never delete substantive content to hit a target.** If a concept genuinely requires 200 lines to explain, it requires 200 lines. The target range is a signal to check whether the page is doing one job or two — not a hard cap.

When splitting:
- The parent page is a complete summary that stands on its own (not an index of links)
- Each child page follows the same type template
- Parent links to children with one-line descriptions: `[Gap Detection](clarifier-gap-detection.md) — how the clarifier identifies ambiguity through deterministic checklists and consistency sampling`
- Add all child pages to `mkdocs.yml` nav under the parent

### Diagram rules

Diagrams are the highest-value element on a concept or architecture page — they are what a reader remembers from a 2-minute scan.

#### Generate the full diagram first

Never simplify a diagram by removing nodes. If the system has 15 components, the diagram has 15 nodes. Generate the complete Mermaid diagram and provide it in two forms:

1. **Inline Mermaid block** — renders in Backstage TechDocs for quick reference.
2. **Interactive link** — a URL that opens the diagram in an interactive editor where the reader can zoom, pan, and annotate:
   ```markdown
   > [Open full diagram in Mermaid Live Editor](https://mermaid.live/edit#pako=<encoded>) | [Open in Excalidraw](https://excalidraw.com/)
   ```
   To generate the Mermaid Live Editor link: base64-encode the Mermaid source wrapped in `{"code":"<mermaid>","mermaid":{"theme":"default"}}`, then zlib-compress and base64url-encode for the `pako=` parameter. If encoding is impractical in the current run, provide the raw Mermaid source in a collapsible block so the reader can paste it manually:
   ```markdown
   <details><summary>Mermaid source (paste into mermaid.live or Excalidraw)</summary>

   ```mermaid
   <full diagram source>
   ```

   </details>
   ```

#### Then slice and explain

After the full diagram, break the flow into 2-4 sections. Each section:

1. Shows a focused Mermaid sub-diagram of just that slice (3-6 nodes)
2. Walks through that slice in 1-2 paragraphs
3. Names the components by the same labels used in the full diagram

The full diagram provides orientation ("where am I in the system"). The slices provide understanding ("how does this part work"). Both are required for concept and architecture pages. Guide and tutorial pages use only the relevant slice.

### Step 1 — Resolve type, audience, and target file

- Parse `$ARGUMENTS` into `type` and `topic` (the `create` keyword has already been shifted off by the subcommand router).
- If creating new content: confirm the slug, decide where it goes in `mkdocs.yml`, and check whether an adjacent page overlaps. If overlap exists, stop and ask whether to merge or differentiate.
- If editing existing content:
  1. Open `docs/<section>/<topic>.md` and read it whole before drafting anything.
  2. **Pre-edit staleness pass.** For every file path cited in the existing doc, run `test -f <path>`. For every internal markdown link, confirm the target page is in `mkdocs.yml`. List broken paths in the run report. Remove or update each broken reference *before* drafting changes — do not propagate stale references into the revised doc. If more than 30% of cited paths are broken, the page is structurally stale and the revise pass is really a rewrite — say so explicitly in the run report so the user can confirm before a heavy edit.

### Step 2 — Pick reference exemplars and state them out loud

Before drafting, name two specific reference pages and write a one-line "what they do that I will copy." References are tiered by how well their audience matches CHIP's:

**Structural references (audience matches CHIP — copy structure freely):**

| Product          | Strong at                                            | Look at                                                      |
|------------------|------------------------------------------------------|--------------------------------------------------------------|
| LangGraph        | Concept pages with a graph diagram and object model  | `langchain-ai.github.io/langgraph/concepts/low_level/`       |
| Vercel AI SDK    | Guides with runnable code per provider               | `sdk.vercel.ai/docs/getting-started`                         |
| Prisma           | Concept pages that teach the model first, API second | `prisma.io/docs/orm/prisma-schema/data-model/models`         |
| Next.js          | Mental-model-first per-feature pages                 | `nextjs.org/docs/app/building-your-application/routing`      |

**Tone references (audience differs — copy structure and voice, not depth assumptions):**

| Product          | Strong at                                            | Look at                                                      |
|------------------|------------------------------------------------------|--------------------------------------------------------------|
| react.dev        | Tutorial pacing; "Pitfalls" call-outs                | `react.dev/learn/tutorial-tic-tac-toe`                       |
| Stripe           | Quickstart with explicit success/failure paths       | `stripe.com/docs/payments/quickstart`                        |
| Supabase         | Architecture pages with named services and contracts | `supabase.com/docs/guides/auth/architecture`                 |
| Linear           | Status pages: sparse, confident, no padding          | `linear.app/docs/changelog`                                  |

State chosen references in your draft notes (not in the published doc), and **carry both the URL and the borrowed structural feature into the run report** so the user can spot-check in five seconds:

> *"prisma.io/docs/orm/prisma-schema/data-model/models — borrowed: opens by teaching how to think about a Prisma data model before showing any schema syntax. The CHIP clarifier concept page must walk the reader through how to think about gap detection before showing any node names."*

The named feature is the verifiable claim. If the recall of the page is wrong, the named feature will be wrong, and the user can catch it without opening the URL. If the recall is right but the user wants to verify, the URL is right there.

Rely on training recall for reference structure; the patterns are stable across redesigns. If a chosen reference page is one you cannot reconstruct confidently from memory, swap it for one you can. Do not fetch at runtime — speed and offline-safety win for a skill the sole maintainer runs frequently.

### Step 3 — Extract verifiable codebase facts

Pull only facts the reader can independently verify by opening a file:

- Component names that exist in code today
- File paths that exist in the repo today
- Function signatures that compile today
- Stage names emitted by the spine
- Packages visible via `ls packages/` or `nx show projects`
- CLI commands that run today

**Do not include:**

- Test counts, suite counts, line counts, coverage percentages
- "Performance" claims without a benchmark file referenced
- Adjectives describing engineering quality (battle-tested, production-grade, robust, enterprise-ready)
- Future state described in present tense

If a fact you want to include cannot be verified in the codebase right now, either find a different fact or move the claim to a future-tagged callout: `!!! note "Planned"`. Aspirational present tense is the single most damaging editorial failure for a doc that will be read during a leadership demo — a leader who catches one will distrust the whole site.

**Citations must be opened, not remembered.** If your draft cites `docs/research-report.md`, `docs/design-decisions.md`, or any ADR — **open that file in this run** before writing the citation, and quote the specific finding (~1–2 sentences with file and section). Do not cite from training memory or summarize from prior conversation. Vague paraphrases ("research shows our approach is better") are worse than no citation; they look authoritative while being unverifiable. A good citation reads:

> *"Research Report Part 1, §"The agent taxonomy problem", finds that parallel write-agents produce incompatible outputs; Cognition, Devin, and Claude Code are all single-threaded in production for this reason."*

A bad citation reads:

> *"Research shows parallel agents don't work well."*

If you cannot open the cited file in this run, do not cite it. State the gap in the run report.

### Step 4 — Apply the competitor-swap test during drafting

For every heading, paragraph, and bullet in the draft:

1. Mentally substitute "CHIP" with Cursor, Devin, Claude Code, Copilot, or OpenHands.
2. If the sentence is still true after the swap, it is generic.
3. Either rewrite with a fact only true of CHIP, or delete.

Audience-specific extra checks during drafting:

- **Concept pages**: does each strategic claim cite an opened source (research-report, ADR, external benchmark)? If not, cut.
- **Tutorial pages**: can a first-time user actually run every step from zero state, on a fresh checkout, without prior tribal knowledge? If not, fix the prereqs section.
- **Guide pages**: does each claim reference a real file path, function, or runnable command? If not, cut.
- **Architecture pages**: would Claude Code, reading this page cold, know which files to open and which contracts to honor? If not, the page is incomplete.
- **Status pages**: is every "in flight" item bounded by a milestone or owner? Unbounded items become "always in flight" and erode the page's credibility.
- **All types**: does this paragraph explain something the reader already knows by virtue of being on this page? If yes, cut.

### Step 5 — Write using the template for the chosen type

Templates are skeletons, not prose. Follow the section order. If a section truly has nothing to say, mark it with a one-line "Not yet documented — see issue #NNN" rather than skipping silently. Visible gaps drive completion; invisible gaps don't.

#### `concept` (target: 80–150 lines)

```
# <Concept name>

<Mental model paragraph: how the reader should *think about* this concept before
they see any API, file, or acronym. One paragraph. Define every term the page
hasn't earned yet. Audience may include non-engineers.>

## Why CHIP does this

<2–3 sentences answering: what does CHIP do here that competitors don't, and on
what evidence? Cite an opened file (research-report.md or a specific ADR) and
quote the specific claim or decision. Do not paraphrase. If you cannot quote a specific
claim or decision, cut this section entirely — a vague "why this matters" paragraph is
worse than no section.>

## How it works

<Mermaid diagram. One screen tall. Nodes labeled with names that exist in code.>

<2–4 paragraphs walking the diagram in reading order. Define every CHIP-specific
term on first use.>

## Components

| Component | File | Role |
|-----------|------|------|
| <name> | `packages/.../foo.ts` | <one line, no adjectives> |

## Current implementation

<What exists in code today, in plain language. No test counts. No "we are
working on…" — that belongs in status pages.>

## Known limitations

<2–4 things this concept does not yet do, or does only partially. Name the
limitation, name what would lift it, link to the relevant ADR or planned work
if one exists. Examples: "Cross-screen coherence is post-hoc only; in-loop
coherence is planned (see ADR-NNN)." or "Vision-assisted correction supports
single-screen only; batch correction is planned." This section is always
fillable for an early-stage product — if you cannot name a limitation, the
concept is either trivial or you have not understood it deeply enough.>

## Related

- [<sibling concept>](../concepts/<slug>.md)
- [<relevant ADR>](../adrs/ADR-NNN-<slug>.md)
```

#### `tutorial` (target: 100–200 lines)

```
# Build your first <thing> in <N> minutes

<One paragraph: what the reader will have running at the end. State the success
criterion explicitly — "you will see X output" or "your terminal will show Y."
Tutorials are for first-time users; success must be visible and unambiguous.>

## Before you start

- <prereq with verification command, e.g., "Node 20+ — verify with `node --version`">
- <env var or config — show how to set it, not just that it must be set>
- <prior page read, only if genuinely required>

## 1. <First action — short verb phrase>

<runnable code block. Not pseudocode.>

<One sentence "what just happened" only if non-obvious. First-time users do not
need every line explained; they need the non-obvious lines explained.>

## 2. <Next action>

… (4–8 steps total — if more, the tutorial is too long; split or convert to a guide)

## What you built

<Mermaid diagram of the system you built, OR a screenshot of the visible end
state (browser, terminal output). Prefer Mermaid for architecture; prefer
screenshots for UI results. Screenshots live in `docs/images/<tutorial-slug>/`
named `step-N-<description>.png`. Keep under 200KB (compress with pngquant or
save as JPEG at 80%).>

<One paragraph: what the reader now understands about CHIP that they did not
before. This is the payoff section — it converts a 15-minute time investment
into a mental model they can build on.>

## Where to go next

- [<related concept page>](../concepts/<slug>.md) — to understand why it works
- [<deeper guide>](../guides/<slug>.md) — to do more with it
```

#### `guide` (target: 60–120 lines)

```
# How to <verb> <object>

<Goal paragraph: what the reader will have working at the end. Audience is a
developer who already knows what CHIP is.>

## Prerequisites

- <package installed>
- <env var set>
- <prior page read, if applicable>

## Steps

### 1. <Action>

<runnable code block>

<one paragraph explaining what just happened, only if non-obvious>

### 2. <Action>

… (typically 3–6 steps; if more, split the guide)

## Verify

<How the reader confirms they got the right result — exact command, expected output.>

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|

## What's next

- [<follow-on guide or concept>](...)
```

#### `architecture` (target: 100–180 lines)

```
# <System or subsystem name> architecture

<One-paragraph mental model: what this system is responsible for and what it
is explicitly not. Audience includes Claude Code reading cold.>

## Components

<Mermaid component diagram. One screen tall. Each box is a package or service
that exists in code today.>

| Component | Package | Owns |
|-----------|---------|------|

## Data flow

<Mermaid sequence or flow diagram for the primary path. Annotate edges with
the typed artifact crossing each boundary.>

## Interface contracts

<For each cross-component boundary, link to the Zod schema file. Do not
duplicate the schema inline — duplication drifts.>

| Boundary | Schema | File |
|----------|--------|------|

## Package boundaries

<What lives in which package and why. One paragraph per package, no more.>

## Out of scope

<Explicitly list what this architecture does *not* cover, so a reader (human
or LLM) knows where to look next instead of inferring.>
```

#### `status` (target: 40–150 lines)

```
# Current status

<One sentence: what works end-to-end today. No qualifiers.>

## Layer status

| Layer | Owner | State | Role |
|-------|-------|-------|------|
| <name> | <person or team> | shipped / in flight / planned | <one line> |

## Active initiatives

| Initiative | Owner | State | Next milestone |
|------------|-------|-------|----------------|

## Package inventory

| Package | Role | State |
|---------|------|-------|

## Backlog

<Bullets, one line each. Order by priority. No essays. No "we believe."
Leadership reads this column to know what's next; padding it dilutes the signal.>
```

### Step 6 — Verify mechanically

Before declaring done, run all seven checks:

1. `python3 -m mkdocs build` — zero broken references, zero warnings about missing pages.
2. For every file path cited in the doc, run `test -f <path>`. Every cited path must exist.
3. For every internal markdown link, confirm the target page is in `mkdocs.yml` nav.
4. Add the new page to `mkdocs.yml` under the correct section if it is new.
5. **Mechanical competitor-swap test.** Identify the three sentences in the finished doc most at risk of surviving the swap test (typically: section openers, the "Why CHIP does this" paragraph, anything that sounds like marketing). Quote each verbatim in the output report. For each, either defend it with a fact only true of CHIP, or rewrite it inline before declaring the doc done. The three quotes must appear in the run report regardless of whether they passed or were rewritten — visibility is the point.
6. **Length check.** Count lines in the finished file. If above the ceiling for the type, either split into linked sub-pages per the splitting guidance, or justify why the content genuinely belongs on one page in the run report. Never trim substantive content to hit a target.
7. Confirm zero occurrences of: test counts ("116 tests"), suite counts, line counts, "battle-tested," "production-grade," "non-negotiable," "every AI tool today," "we believe," "robust," "enterprise-ready," "seamlessly."

If any check fails, fix and re-verify. Do not hand off a draft that doesn't build, doesn't link, hasn't been swap-tested with quoted evidence, or exceeds the length ceiling without splitting or justification.

### Anti-patterns (principles, not a fixed list)

The single principle is the competitor-swap test. The examples below are illustrative failures from prior sessions; they are *teaching cases*, not an exhaustive blocklist.

**Generic problem statements.** *"Every AI coding tool today shares the same failure mode…"* — true of every product in the category, says nothing about CHIP. Either name the specific failure mode CHIP fixes that competitors don't (with a quoted citation), or cut.

**Internal engineering metrics dressed as product documentation.** *"116 tests across 7 suites."* — interesting to the engineering team, irrelevant to a leader or new user. Move to `CLAUDE.md` or the package README.

**Patronizing section titles.** *"Why Observability is Non-Negotiable."* — the reader is either a leader who knows why it matters or an engineer who definitely knows. Replace with what CHIP does about it: *"Tracing in the spine."*

**Aspirational present tense.** *"The reviewer agent validates every diff against the assumption ledger."* — if it doesn't yet, this is a lie. Move to `!!! note "Planned"` or write what does happen today. This failure mode is especially damaging during leadership demos.

**API-surface-first concept pages.** Opening a concept page with a function signature or YAML schema before the reader has the mental model. The mental model — what category of system this is, what it replaces, what stays the user's problem — comes first, in plain English. The schema comes after.

**Acronym-dense concept pages.** *"The clarifier emits EARS ACs into the assumption ledger via the HITL interrupt."* — a non-engineer reader bounces. Define each acronym on first use, or use the long form on concept pages and reserve acronyms for guide / architecture pages where the audience is technical.

**Unbounded "in flight" items on status pages.** *"Reviewer pipeline: in flight."* with no owner and no milestone is indistinguishable from "we forgot about it." Every in-flight item carries an owner and a next milestone, or it moves to backlog.

**Paraphrased citations.** *"Research suggests parallel agents have problems."* — unverifiable, looks authoritative. Either open the cited file and quote the specific finding, or remove the citation.

### Why no `reference` (API / CLI surface) type yet

Considered and deferred. Reference docs are auto-generatable from typed contracts and CLI definitions; hand-writing them now bakes in churn. When the CLI surface and the public TypeScript exports stabilize (likely after the dashboard wiring lands and the spine API freezes), generate reference docs from source rather than adding a sixth template here. Re-evaluate when at least three CHIP releases have shipped without breaking CLI changes.

### Create output format

When the create subcommand completes, report:

1. **File written or edited** — full path.
2. **Reference exemplars used** — for each of the two chosen references, include the URL *and* the one-line borrowed structural feature, so the user can spot-check the recall in five seconds.
3. **Pre-edit staleness pass** (only when editing existing content) — list of broken file paths and links found, each marked as removed, updated, or left for follow-up.
4. **`python3 -m mkdocs build` result** — pass or specific failures.
5. **Mechanical swap test** — the three quoted sentences from Step 6, each marked as either "defended (fact: …)" or "rewritten (was: …, now: …)".
6. **Length check** — actual line count vs target range; justification if over the ceiling.
7. **Cuts** — anything removed for failing the swap test or any other Step 4 check, with the deleted text quoted so the user can confirm.

---

## Sync protocol

The sync subcommand audits documentation freshness in three tiers.

### Tier 3 — Deterministic regeneration

Run `npx tsx scripts/generate-docs.ts` to regenerate the three auto-generated pages in `docs/_generated/`:

- `current-status.md` — plan progress from `docs/plans/active/*/execution-plan.md`
- `package-index.md` — package table from `packages/*/package.json`
- `adr-index.md` — ADR table from `docs/adrs/ADR-*.md`

Report the line counts for each generated file. If the script fails, report the error and stop — do not proceed to Tier 2 with stale generated pages.

### Tier 2 — LLM-powered drift check

For each `.md` file in `docs/concepts/`:

1. **Read line 3** (the blockquote line). Extract the authoritative source citation using the pattern:
   ```
   > Authoritative source: [<label>](<relative-path>#<optional-anchor>) [and [<label2>](<path2>)]
   ```
   If the page has no authoritative source line (e.g., `current-status.md` uses `> Last updated:` instead), skip the drift check for that page and note it in the report as "no canonical source — manual review required."

2. **Read the concept page** in full.

3. **Read each cited canonical source.** Resolve the relative path from `docs/concepts/` (e.g., `../vision.md#layer-3-agent-taxonomy` resolves to `docs/vision.md`). If the path includes an anchor (`#layer-N-...`), read the section from that heading to the next `## Layer` heading. If no anchor, read the entire file.

   If the cited file does not exist, report it as a **major** drift finding with severity "broken citation" and move to the next page.

4. **Compare using LLM.** For each concept page + canonical source pair, evaluate:
   - Does the concept page accurately reflect the canonical source's current state?
   - Are there factual claims in the concept page that the canonical source no longer supports?
   - Are there significant additions to the canonical source that the concept page does not mention?

   For each drifted claim, produce:
   - **Concept page claim** — quote the specific sentence from the concept page
   - **Canonical source says** — quote what the canonical source currently states (or "no longer mentioned" if the claim has been removed)
   - **Severity** — `none`, `minor` (wording difference, still factually correct), or `major` (factual disagreement, missing critical update, or broken citation)
   - **Recommendation** — "update concept page" or "flag for human review" with a one-sentence explanation

### Structural checks

After the drift analysis:

1. **mkdocs.yml nav completeness.** List every `.md` file in `docs/concepts/`. For each, confirm it appears in the `Concepts` section of `mkdocs.yml` nav. Report any concept pages missing from nav.

2. **Citation path validity.** For every authoritative source citation found in Tier 2 Step 1, confirm `test -f <resolved-path>` passes. Report any broken file paths.

3. **Registry consistency.** Read `docs/registry.yaml`. Confirm the `concepts` entry points to `docs/concepts/`. Report if the registry path is stale.

### Sync output format

When the sync subcommand completes, report:

1. **Tier 3 regeneration** — pass/fail + line counts for each generated file.

2. **Tier 2 drift summary table:**

   | Page | Canonical source | Severity | Drifted claims |
   |------|-----------------|----------|----------------|
   | `overview.md` | `vision.md` | none | — |
   | `agent-taxonomy.md` | `vision.md#layer-3` | minor | 1 claim (see details) |
   | ... | ... | ... | ... |

3. **Drift details** — for each page with severity > none, the quoted claims with canonical source comparison and recommendation.

4. **Structural check results** — nav completeness, citation path validity, registry consistency.

5. **Action items** — prioritized list of pages to update, ordered by severity (major first), with the specific `/backstage create <type> <topic>` invocation to fix each one.

---

## Files this skill is allowed to touch

**Create subcommand:**

- `docs/**/*.md` — create or edit
- `mkdocs.yml` — only to add new pages to nav, never to restructure existing nav

**Sync subcommand:**

- `docs/_generated/*.md` — via `npx tsx scripts/generate-docs.ts` (Tier 3 regeneration)
- Read-only access to all other files (concept pages, canonical sources, mkdocs.yml, registry.yaml)

This skill must not edit:

- `CLAUDE.md`, `README.md`, package READMEs, ADRs, package source code, or test files

If a doc page being written truly requires changes to one of those files, stop and ask before proceeding.
