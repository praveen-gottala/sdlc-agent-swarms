---
name: receive-handoff
description: Verify a fresh agent has actually read and understood a handoff-check doc before touching code. Use at the start of any new session that was prepared with the prepare-handoff skill. Produces a READY/NOT-READY gate — no code changes until the user confirms.
context: inline
agent: main
---

# Receive Handoff

You are a fresh agent starting work on a codebase where a prior session captured tribal knowledge into a handoff-check doc. Your job: prove you **read and understood** that knowledge before you touch any code. Not by claiming, by demonstrating.

## Input

The user will either (a) name the handoff-check doc directly, or (b) ask you to find it. If (b), search `docs/plans/*-handoff-check.md` and `docs/handoff/*-handoff-check.md`. If multiple, ask which one.

## Protocol — do these in order, do not skip

### 1. Read the handoff-check questions file — **NOT the answer key**

Read the handoff-check file (e.g. `docs/plans/<topic>-handoff-check.md`). This file contains Turn 1 questions, hard-fail/soft-fail triggers, and maintenance info. It does **not** contain the answer key.

The answer key lives in a separate file (`docs/plans/<topic>-handoff-key.md`). **Do not read the key file until step 5.** The key exists to grade your answers, not to supply them. Reading it before answering makes the self-audit theater.

**Legacy single-file format:** If the handoff-check file contains both Turn 1 and Turn 2 (answer key embedded in the same file), disclose this immediately: "The answer key is embedded in the questions file. I have seen it. All answers in step 4 are potentially contaminated." Then proceed with the protocol, but in step 5 add `Inference risk: Q1–Qn possibly contaminated by pre-loaded Turn 2` to every question. This is a soft signal, not a blocker — but the handoff-check should be split into two files for future use.

### 2. Read the canonical docs, in a sensible order

Do **not** open the Turn 2 answer key to discover file names — that leaks the answers.

Instead: start with `AGENTS.md` (the map), then read the active plan doc the handoff is for (e.g. `docs/plans/active/visual-diversity/execution-plan.md`), especially any **Context for … implementers** or Guardrails section. Turn 1 question 13 (coverage probe) often names the three critical docs — use that order when present. Also read any ADR the plan cites by path (e.g. `docs/adrs/ADR-035-…md`).

**Context optimization:** If `/session-start` has already run in this session, the following docs are already loaded — do NOT re-read them:
- `docs/lessons-learned-rules.md` (already read by session-start)
- `.claude/rules/*` (auto-loaded in system context)
- `CLAUDE.md` (auto-loaded in system context)
- Any active plan doc already read by session-start

Only read docs that session-start did NOT cover: the handoff-check file itself, specific ADRs, type files, and source code files referenced by the questions.

Open each file. Read the cited sections **and** enough surrounding context that you could explain the tradeoff, not just the headline. Do not search-and-peek.

### 3. Produce a "Proof of read" block

This is the honesty gate. For each canonical doc you read in step 2, output:

```
**<file path>**
- Quote: "<verbatim quote, 1–2 sentences, from a substantive section you read in step 2>"
- Why it matters for upcoming work: <one sentence>
- Quote 2: "<a second verbatim quote from a different section>"
- Why it matters: <one sentence>
```

**Rules:**
- Quotes must be verbatim — exact punctuation, exact words. If you paraphrase, say "paraphrased" and you fail this gate.
- Quotes must come from different sections of the doc, not from the same paragraph.
- Quotes must be substantive. "The file exists" is not a quote.
- If you cannot produce two distinct verbatim quotes for a doc, you did not read it. Go back to step 2.

### 4. Answer the handoff-check questions (open-book)

Use the Turn 1 question list. You may reference files now. For each:

```
Q<n>. <one-line answer>. Cite: <file> → <smallest anchor>.
```

Do not look at the Turn 2 answer key yet — that's for self-audit in the next step. If you cannot answer a question without looking at the key, say "I could not answer this from the canonical docs alone" and name which doc you expected to cover it.

### 5. Self-audit against the Turn 2 answer key

**Now** read the answer key file (`docs/plans/<topic>-handoff-key.md`). If the handoff used the legacy single-file format, re-read the Turn 2 section you already saw.

For each question, grade honestly using the rubric in the handoff-check doc (PASS / PARTIAL / FAIL). For each non-PASS, classify:

- **AGENT_GAP** — I missed it but the docs clearly say it. I need to re-read.
- **DOC_GAP** — the docs don't actually cover this. Escalate to the user.
- **KEY_AMBIGUOUS** — the key and my answer are both defensible interpretations.

**Additional self-audit requirement (this is what makes this skill honest):** flag every question where your answer required **inference** rather than direct citation. Those are comprehension risks even if the answer was right. Format:

```
## Inference risks
- Q<n>: answered correctly but via inference from <doc>, not direct citation. Risk: <what I might be wrong about>.
```

If you have zero inference risks, you are probably not being honest. Real comprehension always has some inferred gaps.

### 6. Restate the plan in your own words

Not a summary of the doc — your plan. Format:

```
## My plan

### What I will do
1. <concrete step with file paths>
2. <concrete step with file paths>
3. ...

### Landmines I will avoid (from the handoff)
- <landmine 1>: <one-line description of what would break>
- <landmine 2>: ...
- <landmine 3>: ...

### Stop-and-ask conditions
If I find myself doing any of these, I will stop and ask before proceeding:
- <thing 1 — usually a scope-creep trigger from the plan>
- <thing 2>
```

The landmines section must name at least three specific things from the handoff-check's "hard-fail triggers" or Context block. Generic phrases ("I'll be careful with tests") do not count.

### 7. Draft the first 3–5 TODOs

Concrete, file-level, mechanically clear. Each TODO is something you could hand to another engineer and they would know exactly what to do.

### 8. Declare READY or NOT-READY

One of:

```
## Status: READY

I have read the handoff, proven comprehension via direct quotes, self-audited my answers against the key, named the landmines, and drafted initial TODOs. Awaiting your "go" before any code changes.
```

Or:

```
## Status: NOT-READY

Specific gaps that block me from starting:
- <gap 1 — which doc is missing what>
- <gap 2>

Proposed resolution: <either "patch these docs" or "user needs to clarify X">.
I will not start coding until these are resolved.
```

**NOT-READY is a valid and expected outcome sometimes.** If you feel pressure to declare READY despite real gaps, that pressure is the exact failure mode this skill exists to prevent.

### 9. Wait for explicit user confirmation

After READY, **do not start coding.** Do not offer to start. Do not say "shall I proceed?" Wait for the user's explicit "go" or equivalent. This is non-negotiable.

If the user's first instruction after READY is unrelated to the handoff ("also, can you fix this typo?") — handle it, but do not treat it as "go" for the handoff work.

## Anti-theater guards

- **No blind memory test on the incoming side.** The outgoing side already validated the docs via a blind subagent (if `prepare-handoff` was run correctly). Your job is comprehension, not recall. The Proof-of-read + Inference-risks sections are what catch skim-and-claim — they cannot be faked without actually reading.
- **If you already "know" the answers** (because canonical docs appear in your pre-loaded context via open editor tabs or auto-attached files): say so explicitly before step 3. "I appear to have these files pre-loaded; I will still produce verbatim quotes but note this may not be a clean blind." Then proceed. Hiding context leakage poisons the signal.
- **If the answer key file was pre-loaded or accidentally read early** — disclose at the start. Still do Proof-of-read from canonical docs only. In step 5, add `Inference risk: Q1–Qn possibly contaminated by pre-loaded answer key` and treat that as a soft signal, not a PASS parade. With the two-file format this should not happen unless the user or editor tabs pulled in both files.
- **Do not edit any docs during this skill.** If you find errors in the handoff-check or canonical docs, include them in the NOT-READY list or under "minor issues to flag" in the READY block. Edits belong to a later turn after the user acknowledges.
- **If the user says "go" before you complete the protocol**: explicitly re-confirm. "I haven't finished the READY gate yet — steps remaining: <list>. Proceed anyway, or should I complete the gate first?" Do not silently skip the gate.
