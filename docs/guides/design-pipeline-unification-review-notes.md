# Design Pipeline Unification — Cross-Agent Review Briefing

**Created:** 2026-04-24
**Type:** Working briefing for cross-agent review (not a permanent operational guide — the `docs/guides/` folder is its current home only because it's cross-referenced from multiple docs; once the plan stabilizes this can move to `docs/reference/` or be deleted)
**Audience:** any coding agent (e.g., Claude Code) doing a second review of the design pipeline unification plan
**Purpose:** consolidate the analysis, structural principles, and critical feedback that have emerged across multiple review passes so a second reviewer has the full context without having to re-derive it
**Inputs to read first (in order):**
1. `docs/issues/cli-dashboard-pipeline-divergence.md` (rev 2) — the divergence inventory, now reconciled with the 2026-04-24 spec sync
2. `docs/feature-plans/unify-design-pipeline.md` (rev 2) — the unification plan
3. `docs/specs/sdlc-agents.md` — especially §10 (agent taxonomy), §11.1.1 (design pipeline), §11.1.2 (correction architecture incl. Phase C), §11.1.4 (design tool integration)
4. `docs/specs/dashboard.md` §4.10.4 (Design Tools view — Penpot + Browser Renderer cards)
5. `CLAUDE.md` — the four non-negotiables, Spec Sync on Feature Completion, and Rejected Patterns
6. `docs/adrs/ADR-043-typescript-only-orchestration.md` — Phase M-3 is the LangGraph port of the design phase graph

---

## 0. TL;DR for the second reviewer

If you only read one section, read this one.

**The divergence between CLI and dashboard design pipelines is real and well-documented.** The rev-2 divergence doc classifies each row as A (intentional channel/tool choice), B (real `CLAUDE.md` violation), C (channel-specific input, shared work missing), or D (minor cleanup). The plan unifies everything via a single `runDesignPipeline({ designTool })` orchestrator with three layers (transport → Layer B → Layer A work functions).

Three review questions have been posed so far. Short answers:

| Question | Presented options | Right answer |
|---|---|---|
| Bottom-up (fix dashboard B violations first) vs top-down (Layer B first) | "Bottom-up recommended" | **Neither as stated.** Front-load Phase 0 (schemas + parity test) and Phase 0.5 (scaffolding) — that's the narrow top-down slice. Bottom-up forces AgentContext/telemetry plumbing to be built twice. |
| Defer Phase 0.5 (scaffolding) / Phase 2.5 (browser feedback loop) / OTel-shaped telemetry | "Defer all three recommended" | **Keep 0.5 (cheap + addresses a live bug). Trim OTel framing but keep the sink interface (it's definitional to Layer B). Don't defer 2.5 without a correlated decision on CLI default or dashboard Phase 3.5 — it's load-bearing for both.** |
| Fix the dashboard chat route 3× rerun in first track vs after Layer B | "First track recommended" | **Split the defect.** The shape fix lands in Phase 0 (needs only schemas). The mechanism fix lands in Phase 3.5 (needs the browser feedback adapter from Phase 2.5). Skip any cost stopgap because dashboard is not in steady use. |

**The pattern across all three questions:** the reviewer keeps proposing earlier-landing options framed as "ship value sooner," and each time the framing hides a structural cost — rework, throwaway code, or contradicting the locked Phase C target. These are not neutral sequencing choices.

---

## 1. Source-of-truth facts established by the 2026-04-24 spec sync

Before re-reviewing, internalize what the spec sync actually did — several long-standing ambiguities are now resolved.

### 1.1 Browser rendering is the primary design surface (no longer a fallback)

- `sdlc-agents.md:67` — *"The browser-rendered prototype is the primary design surface. If Penpot is configured, an optional collaboration workspace is also created for human designers."* (This inverted the previous "Falls back to browser-rendered prototypes if no design tool is configured" language.)
- `sdlc-agents.md:221-227` (§11.1.2, Phase C: Remove self-correction, browser-only pipeline) — *"The pipeline simplifies to: LLM → JSON → Browser render → DOM extraction → mechanical fixes → interactive preview → vision-assisted correction → user approval."*
- `sdlc-agents.md:245-249` (§11.1.4, Design Tool Integration Optional) — *"Design tools are NOT in the verification path — the browser renderer is the source of truth for layout fidelity."*
- `dashboard.md:400` (Design Tools view) — *"The browser renderer is the source of truth for layout fidelity — not an optional tool."*

**Implication:** the dashboard's browser-only design stage is *not* a divergence from the intended architecture — it's the committed target. The CLI's Penpot-backed pipeline is now the optional collaboration mode, not the default.

### 1.2 Figma support is removed framework-wide

- `sdlc-agents.md:249` — *"Figma support removed."*
- `appendices.md:250` — *"Figma removed. Penpot is the optional design tool. Browser rendering is primary."*
- `governance-and-operations.md:137` — Figma MCP row struck out, replaced with "Penpot MCP (Optional)."
- `dashboard.md` Design Tools view — Figma card replaced with Penpot card + Browser Renderer card.
- `platform-architecture.md` — Figma MCP → Penpot MCP throughout.
- `PRD.md:99` — Figma handoff language genericized to "design."

**Implication:** the shared-pipeline `designTool` enum is `'browser' | 'penpot'` only. Any plan that still lists `'figma'` as a valid value is stale. Re-introducing Figma would require a new ADR, not a resurrection of existing plumbing.

### 1.3 Agent taxonomy restructured (old five-category model superseded)

`sdlc-agents.md:§10` now describes the system as:

- **Four-stage spine** (sequential, single writer per stage): Clarifier → Architect → Implementer → Reviewer.
- **Specialist tools** (invoked by spine stages, not independent agents): Design pipeline, Test generator, Security scanner, Research subagents, Visual validator, Build/Deploy agents, Documentation generator, Observability agents.

The Design pipeline is a **specialist invoked by the Architect stage** (and re-invoked by the Implementer when code-gen needs a design refresh). What the divergence doc calls "Stage 0" through "Stage 7" are the **internal stages of the Design specialist** — not top-level spine stages.

**Implication:** the entire divergence + unification analysis is scoped inside the Design specialist's boundary. The four-stage spine is unaffected. Do not conflate "stage" (internal to the Design specialist) with "spine stage" (Clarifier/Architect/Implementer/Reviewer).

### 1.4 Event bus is downgraded to telemetry-only

`platform-architecture.md:§7` is now marked SUPERSEDED for coordination:

> *"Per `vision.md` Layer 2, the coordination substrate is typed LangGraph channels with Zod schemas. The event bus (`EventEmitter`) is retained for telemetry and observability only — it is not the coordination substrate."*

**Implication:** documented event-driven handoffs like `DesignBriefCompleted` are aspirational from the old architecture and were never built. The plan is correct to replace event coordination with direct function calls through a state schema.

### 1.5 LangGraph TS is locked-in (ADR-022 superseded)

- `appendices.md:51` — *"Orchestration engine: @langchain/langgraph (TypeScript)"*
- Previously "custom DAG engine" per ADR-022, now explicitly *"ADR-022's 'not LangGraph' note is superseded — LangGraph TS is now the locked decision."*

**Implication:** Layer B's node-function signatures must be LangGraph-compatible. This is not a forward-looking nicety; it's the Phase M-3 port target (ADR-043).

### 1.6 CLAUDE.md now mandates "Spec Sync on Feature Completion"

New section requires: *"When completing a feature plan phase, update the relevant domain spec section in docs/specs/ to reflect the implemented behavior."* Plus a new `/review-spec-sync` skill for drift detection.

**Implication:** the unification plan's Phase 5 (ADRs + dataflow doc update) is now a hard requirement, not optional polish.

---

## 2. The A/B/C/D classification (from divergence doc rev 2)

This is the single most important analytical tool for any unification question. Every divergence is one of:

| Label | Meaning | What's different | How to resolve |
|---|---|---|---|
| **A** | Intentional channel/tool choice | The *work* genuinely differs by design (e.g., Penpot script generation vs browser render). Shared adapter not yet extracted. | Extract shared work function with a channel/tool parameter. Both callers dispatch through it. |
| **B** | Real bug / `CLAUDE.md` violation | Nothing should legitimately differ, but something does (e.g., free-text markdown instead of typed `UXResearchOutput`). | Fix the offending caller to use the typed work function. No ADR needed. |
| **C** | Legitimate input-collection difference, shared work missing | Only the *input-gathering UI* is channel-specific (stdin wizard vs React form). The *work behind it* is identical and duplicated. | Extract the work as a shared function; each channel maps its inputs to it. |
| **D** | Minor cleanup | Tiny signature or argument-shape inconsistencies. | Tighten the interface. |

Current classification per stage:

| Stage (Design specialist internal) | Category | Fix |
|---|---|---|
| 0 — Init/Scaffold | **C** | Extract `scaffoldProject`. |
| 1 — App spec | **B** | Extract `generateAppSpec`; both channels call it. |
| 2 — Research | **B** | Dashboard calls `uxResearchWork` with typed output. |
| 3 — Planning | **B** | Dashboard calls `uxPlanningWork` with typed output. |
| 4 — Design (DesignSpec gen) | **A** | Parameterize `designNode` on `designTool`. Dashboard hardcodes `'browser'`; CLI accepts both. |
| 5 — Design evaluator | **D** | Tighten `evaluateDesign` second-argument contract. |
| 6 — Feedback loop | **A** (channel) + **B** (mechanism) | Channel: Penpot-session vs browser-chat is legitimate. Mechanism: 3-LLM-stage rerun per message is B — replace with browser feedback adapter. |
| 7 — Implementation | **A** | Dashboard deferral is explicit; wire in later via `runDesignPipeline({ stage: 'implementation' })`. |

**Why this matters for sequencing:** B bugs can be fixed without Layer B (they just need the Zod schemas from Phase 0). A items require Layer B. C requires an extracted shared work function but not Layer B. D is a signature tweak. Mixing them into "fix bugs first" buckets loses structural clarity.

---

## 3. Plan rev-2 sequencing (current proposal)

Phase order in the current plan:

| Phase | What | Est days | Blocks? |
|---|---|---|---|
| **0** | Zod schemas (`DesignPhaseStateSchema`, `DesignOutputSchema`, `DesignToolSchema`), parity test (red), lint rule (fails on current code) | 1 | Prereq for everything else |
| **0.5** | Extract `scaffoldProject` — Category C fix | 1–1.5 | Independent of Layer B |
| **1** | Layer B — `runDesignPipeline` orchestrator, node functions, minimal `PipelineTelemetrySink` with CLI + dashboard sinks | 2–3 | Blocks Phases 2 and 3 |
| **2** | CLI migration; `--tool=browser` default; browser feedback adapter (Phase 2.5) | 2–3 | Blocks Phase 3.5 feedback route |
| **3** | Dashboard migration; `callPipelineStage` deleted; chat route uses feedback adapter; Stage 7 deferred explicitly | 3–5 | Biggest phase |
| **4** | Unify Stage 1 (`generateAppSpec`) | 1 | Independent of Phase 3 |
| **5** | ADRs + dataflow doc update | 1 | After Phases 2 + 3 |

Total: ~10–15 working days, serial; parallelizable across two engineers in ~7–9 days.

---

## 4. Review question 1 — Bottom-up vs top-down

**The question posed:** "The original plan proposes extracting Layer B FIRST then migrating callers. My review recommends the opposite: fix the dashboard's Category B violations FIRST (replace `callPipelineStage` with `uxResearchWork`/`uxPlanningWork`), THEN extract Layer B informed by what worked. This delivers value on day 2 instead of day 8."

### 4.1 What the bottom-up proposal gets right

- Time-to-value is real. Architectural refactors without user-visible payoff tend to stall.
- "Informed by what worked" has a kernel of truth — speculative abstractions often miss.

### 4.2 Why the bottom-up framing is structurally wrong

1. **AgentContext/telemetry plumbing cost is paid twice.** The reason `callPipelineStage` exists (per `cli-dashboard-pipeline-divergence.md:142`) is that wiring `uxResearchWork` into an HTTP handler requires building an `AgentContext` with `projectRoot`, `fs`, `telemetry`, `resolvedModel`, prompt-trace sinks, etc. That is exactly the work Phase 1 formalizes via `PipelineTelemetrySink`. Bottom-up builds a dashboard-specific adapter first, then refactors into a sink interface later. Two refactors of the most fragile code.

2. **Schemas are a prerequisite for fixing B violations.** A Category B fix without the Zod schemas in place is either (a) symptom-patching with new ad-hoc shapes or (b) reinventing the schemas inline. Phase 0 (schemas + parity test + lint) is not optional — it must land before any B fix is correct.

3. **"Day 2 vs day 8" compares different scopes.** Day 2 (bottom-up) = dashboard B bug fixed. CLI is already fine (already uses `uxResearchWork`). Day 8 (top-down) = Layer B + CLI migration + dashboard migration, which unlocks Category A (parameterized design tool), Category C (scaffolding), Stage 7 dashboard wiring, and the ADR-043 M-3 prerequisite. These are not the same thing.

4. **The "learn by doing" argument is weak.** What you'd learn from bottom-up is the AgentContext/telemetry plumbing — but the CLI already demonstrates the shape that works. What Layer B adds is the *abstraction shared between channels*, which can't be learned bottom-up.

5. **Organizational risk.** When the high-severity bug is fixed, pressure to complete Layer B drops. The tactical fix crowds out the strategic fix. Six months later, two orchestrators still exist, Stage 7 is still missing, ADR-043 M-3 can't start.

6. **Categories A and C don't benefit from bottom-up.** Bottom-up fixes B only. A (parameterized design tool, deferred Stage 7) and C (shared scaffolding) still require Layer B. So bottom-up is "fix B, then do 80% of the original plan anyway."

### 4.3 Recommendation — narrow top-down slice

Neither the original top-down nor bottom-up is the sharpest knife. Front-load the work that *doesn't* depend on Layer B:

| Day | Lands | Category impact |
|---|---|---|
| 1–2 | Phase 0 (schemas, lint, parity test red) | Prereq; no behavior change |
| 2–3 | Phase 0.5 (`scaffoldProject`) | **Category C done** |
| 3–4 | Narrow dashboard shape fix: rewrite `research.json` + `planning.json` to `UXResearchOutputSchema` / `UXPlanningOutputSchema`. Still via `callPipelineStage`. | **Half of Category B done** (on-disk shape correct; still bypasses contracts) |
| 4–6 | Phase 1 (Layer B + minimal sink interface) | Prereq for A + full B |
| 6–7 | Phase 2 (CLI migrates, includes Phase 2.5 browser feedback adapter) | No user-visible change |
| 7–10 | Phase 3 (dashboard migrates, `callPipelineStage` deleted) | **Full Category B done**; Category A unlocked |

This captures the reviewer's "value early" insight (visible improvements on days 2–4) without paying AgentContext plumbing twice.

---

## 5. Review question 2 — Defer Phase 0.5 / Phase 2.5 / OTel-shaped telemetry

**The question posed:** "The original plan includes scaffolding unification (Phase 0.5), browser feedback loop (Phase 2.5), and OTel-shaped telemetry — totaling ~4 extra days. My review defers all three as non-critical."

Each item is actually a different category and must be analyzed separately.

### 5.1 Phase 0.5 — scaffolding unification (1–1.5 days) — KEEP IT

- Smallest phase in the plan.
- Fixes a live Category C divergence (documented: different defaults for `platforms`/`stack`/`budget`; different optional fields).
- Classic silent-drift bug: next required field added to scaffolding will land in one scaffolder only.
- Orthogonal deferrals rarely ship — when there's no dependency on ongoing work, follow-ups get pushed forever.

**Do not defer.** 1.5 days of work is cheap insurance against a known-live divergence.

### 5.2 Phase 2.5 — browser feedback loop (~1 day) — CANNOT DEFER CLEANLY

The plan commits to:
- CLI default `--tool=browser` (matches `sdlc-agents.md:67` + `:221-227` Phase C).
- Dashboard Phase 3.5 replaces `runChatPipelineAsync` with a call into a shared feedback adapter.

CLI's *only* existing feedback loop (`design-page.ts:1017`, `runDesignFeedbackLoop`) requires a Penpot collaboration session. If Phase 2.5 is deferred:

| Forced consequence | Cost |
|---|---|
| (a) Keep CLI default at `'penpot'` | Contradicts `sdlc-agents.md:67` + Phase C. Primary path not dogfooded. |
| (b) Ship CLI `--tool=browser` with no feedback loop | Functional regression on the default path. |
| (c) Keep dashboard on `runChatPipelineAsync` in v1 | Category B mechanism only half-fixed after Phase 3. Second migration needed. |

**Phase 2.5 is load-bearing for two other things in the plan.** The reviewer's "non-critical" framing misses this coupling. Either keep Phase 2.5, or explicitly pick one of (a)/(b)/(c) and document the trade-off. Don't silently defer.

### 5.3 OTel-shaped telemetry — trim the framing, keep the interface

Two separable things in the plan:

- **(a) A shared telemetry sink interface** so `runDesignPipeline` can be called from CLI and dashboard without internal branching. **Definitional to Layer B.** Without it, the orchestrator has to either (i) call `run-manager.ts` directly (dashboard coupling leaks in), (ii) call `console.log` directly (CLI coupling leaks in), or (iii) branch on caller (exactly the anti-pattern Layer B eliminates).
- **(b) The sink interface being OTel-span-shaped** so a future Phase 7 OTel exporter plugs in cheaply. **Aspirational, deferrable.**

Minimal sink: `{ onStageStart, onStageEnd, onError, onLlmCall }` with `CliStdoutSink` + `DashboardSseSink`. ~1 day. Widening to OTel span shape later is additive, not a rewrite.

**Defer (b), keep (a).** Saves ~0.5 day. Do not drop the sink interface — that would make Layer B definitionally incomplete.

### 5.4 Net recommendation on scope

| Option | Verdict |
|---|---|
| Option 1 — defer all three | **Wrong.** Breaks CLI default or Phase 3.5 completion. Removes Layer B's definitional abstraction. Defers a 1.5-day cleanup of a live bug. |
| Option 2 — keep scaffolding only | **Partially right.** Keeps the cheap win; still wrong on Phase 2.5 + sink interface. |
| Option 3 — keep everything | **Defensible**, slightly over-scoped on OTel span shape. |
| "Option 4" — keep 0.5, keep Phase 2.5, keep sink interface, drop OTel span shape | **Best.** Est ~12–13 days. |

---

## 6. Review question 3 — When to fix the dashboard chat route 3× rerun

**The question posed:** "The chat route re-runs all 3 LLM stages per message (3× cost). Should fixing this be in the first track or deferred to after Layer B?"

The defect has **two separable parts** — the reviewer treats as one:

| Defect | What fixes it | Phase |
|---|---|---|
| **Shape** (half of Category B) | Write typed `UXResearchOutput`/`UXPlanningOutput` to disk instead of `{ brief: <markdown> }` | Phase 0 (schemas only) |
| **Mechanism** (3× rerun) | Replace `runChatPipelineAsync` with `BrowserFeedbackAdapter.reviewDesign(spec, userMessage)` — single LLM call returning a structured spec patch | Phase 3.5 (requires Phase 2.5) |

### 6.1 Why "first track fix" is really "bottom-up in disguise"

The proper mechanism fix is a feedback adapter. "Fix in first track" without Phase 2.5 means inventing the adapter inline in `chat/route.ts`, which is the throwaway-adapter pattern already rejected in §4.2 (item 1).

### 6.2 Why "after Layer B" is too coarse

The shape fix (typed disk artifacts) needs only the schemas, not Layer B. Deferring it to Phase 3.5 leaves the wrong-shape writes in place for ~6 extra days when a ~half-day fix could land them in Phase 0.

### 6.3 Cost stopgap (cache research.json/planning.json, rerun only design) — NOT NEEDED

Cost/value math depended on current dashboard usage. **User confirmed dashboard is not yet in steady use.** No material LLM spend to save. Skip the stopgap. Don't introduce throwaway code when the cost justification is absent.

### 6.4 Recommendation

1. **Phase 0 (day 2–3):** fix the shape — `chat/route.ts` writes typed artifacts. ~0.5 day.
2. **Phase 3.5 (day ~9):** fix the mechanism — chat route calls the browser feedback adapter. Clean, no throwaway.
3. **No stopgap.** Dashboard is not in steady use; 3× cost for ~6 days is immaterial.

---

## 7. Cross-cutting structural principles the reviewer kept missing

Use these as heuristics on any future sequencing question:

### 7.1 "Day X vs day Y" is often apples-to-oranges

The scope shipped on day X rarely equals the scope shipped on day Y. When a reviewer compares ship dates, first ask: *what exactly lands on each day, and which categories (A/B/C/D) are fixed?*

### 7.2 Infrastructure abstractions built twice cost more than building them once later

If a fix requires building telemetry/context plumbing anyway, "fix now, abstract later" pays the plumbing cost twice. The saved time from shipping earlier often evaporates when the second pass has to retroactively generalize.

### 7.3 Orthogonal follow-ups rarely ship

If a deferred item has no dependency on ongoing work, it drops off the roadmap. This is an organizational failure mode, not a planning one. Keep short cheap items (like Phase 0.5) in the main plan when possible.

### 7.4 "Load-bearing" is not the same as "nice-to-have"

Before classifying something as a deferrable follow-up, check its downstream consumers. Phase 2.5 looked deferrable until you trace the dependency to Phase 3.5 and to CLI default behavior. Always walk the dependency chain before deferring.

### 7.5 Definitional vs aspirational

Some abstractions are definitional to a boundary (the sink interface makes Layer B possible). Others are aspirational (OTel span shape makes future Phase 7 work cheaper). Deferring definitional pieces breaks the boundary; deferring aspirational pieces is safe. Separate these explicitly in any scope discussion.

### 7.6 Two separable defects should not be fixed together unless they share a mechanism

The chat route has a shape defect (needs schemas) and a mechanism defect (needs adapter). The reviewer's "fix in first track" treated them as one. Splitting surfaces the fact that half the fix is free-ish (only needs Phase 0) and half requires more plumbing.

### 7.7 Specs tell you what the committed target is; code tells you what the current state is; the divergence between them is the plan

Before proposing a sequencing option, verify:
- What does the spec commit to? (e.g., `sdlc-agents.md:67` — browser primary)
- What does the code currently do? (e.g., CLI defaults to Penpot)
- Does the proposed option move code toward spec, away from spec, or sideways?

An option that moves sideways (e.g., keeps CLI on Penpot to defer Phase 2.5) is a legitimate trade-off only if it's explicit about which spec commitment it violates and for how long.

---

## 8. What's explicitly NOT in scope for this unification plan

To avoid scope creep suggestions:

- **LangGraph port (ADR-043 Phase M-3).** The plan is a prerequisite. The port itself is separate.
- **OTel/Langfuse exporter (Phase 7 of roadmap).** The sink interface is sized so this plugs in additively later.
- **Penpot adapter cleanup** (`pipeline-improvements.md` Plan 2). Complementary axis, not this axis.
- **Deleting `runAgent()` / `executeUXResearch`** (the event-bus governance path). Tracked under ADR-043 M-4.
- **Cross-page batch generation** (roadmap Phase 4). Comes after unification lands.
- **Stage 7 dashboard route.** Explicit deferral to a follow-up; trigger condition is "Stages 2–6 stabilized on shared Layer B."
- **Dashboard tool-selector UI** (letting users pick Penpot from dashboard). Future work; the plan is sized so it's a three-line change when needed.

---

## 9. Open questions that genuinely remain undecided

These are legitimately open — not me dodging, but places where additional signal is needed before committing:

1. **Browser feedback adapter — single-shot patch vs multi-turn loop?** Phase 2.5a (adapter interface) vs Phase 2.5b (two separate CLI loops). Decide during implementation based on how the single-shot patch performs.
2. **Should `DesignOutput.designToolMetadata` be required or optional?** Currently optional. If it becomes required, Penpot callers have to populate it always, which may or may not match their flow.
3. **Where does `scaffoldProject` live — `packages/agents-ux` or `packages/core`?** The former is easier (existing home for UX work); the latter keeps `agents-ux` dep-free from scaffolding concerns.
4. **Stage 1 (app spec) status reconciliation.** CLI writes `status: 'approved'`; dashboard writes `status: 'draft'`. The plan says "make it an input parameter." Which caller decides, and based on what? Probably an explicit `autoApprove: boolean` flag, default `false`.

---

## 10. Falsifiability — what would change the recommendations

Evidence that would shift my analysis:

- **If dashboard chat goes into steady use before Phase 3.5 lands** → §6.3 recommendation changes; ship the caching stopgap.
- **If a third design-tool adapter is in active development** → revisit the `DesignTool` enum extensibility assumption; the three-line addition claim might not hold.
- **If Phase 1 reveals that the CLI's `AgentContext` shape isn't portable to the dashboard runtime** → the sink interface might need to be richer than the minimal `{ onStageStart, onStageEnd, onError, onLlmCall }` shape proposed. Not a reason to defer Phase 1, but a reason to budget for a mid-phase schema adjustment.
- **If the parity test at Phase 0.2 turns up artifact differences the plan didn't anticipate** (e.g., timing-dependent fields in telemetry that leak into the parity comparison) → the allowed-diff envelope needs widening, and the lint rule might need adjustment.
- **If ADR-043 M-3 pre-work uncovers a LangGraph state-schema constraint the plan misses** → `DesignPhaseStateSchema` might need restructuring. Plan the Layer B phase to stop at a point where the state schema can be revised without rewriting node functions.

---

## 11. Meta-instruction for the reviewing agent

If you're doing a second pass on the unification plan:

1. **Start from the A/B/C/D classification** (§2). Every proposal should map to one or more categories. A proposal that fixes nothing in any category is almost certainly scope creep.
2. **Verify against the three source-of-truth facts** (§1.1, §1.2, §1.3): browser primary, Figma removed, taxonomy restructured.
3. **For any sequencing proposal, run the principles in §7** before accepting the framing. Especially §7.1 (day X vs day Y), §7.2 (double-plumbing), §7.5 (definitional vs aspirational).
4. **Challenge "non-critical"** claims by walking the dependency chain (§7.4). If A blocks B blocks C, A isn't deferrable.
5. **Don't conflate defects with different mechanisms** (§7.6). Split them, classify separately, sequence independently.

If your analysis arrives at a conclusion that contradicts any of §1 (source-of-truth facts), either you've found a spec-sync drift that needs re-reconciliation, or you've missed a spec citation. Flag it explicitly rather than silently diverging.

---

## 12. Quick-reference code citations

For any analysis, here's the current state of the canonical call sites (verify before citing — line numbers drift):

| Function | Location | Purpose |
|---|---|---|
| `callPipelineStage` | `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts:250` | Dashboard's ad-hoc stage runner (replaces `uxResearchWork`/`uxPlanningWork`) |
| `callClaudeDesignAPI` | `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts:311` | Dashboard's ad-hoc design stage (replaces `penpotDesignWork` for browser-only flow) |
| Dashboard `maxTokens: 8192` | `packages/dashboard/src/app/api/_lib/pipeline-helpers.ts:283` | Hard-coded, disconnected from `UX_RESEARCH_CONTRACT.budget.max_tokens_per_task = 40000` |
| `uxResearchWork` | `packages/agents-ux/src/ux-research/ux-research.ts:110` (called from `design-page.ts:399`) | Canonical research work function |
| `uxPlanningWork` | `packages/agents-ux/src/ux-planning/ux-planning.ts` (called from `design-page.ts:451`) | Canonical planning work function |
| `penpotDesignWork` | called from `design-page.ts:750` | Canonical Penpot design work function |
| `evaluateDesign` | called from `design-page.ts:883` and `api/design/audit/vision/route.ts:67` | Partially shared; signature needs tightening (Category D) |
| `uxImplementationWork` | called from `design-page.ts:928`; absent from dashboard | Stage 7 canonical |
| `runDesignFeedbackLoop` | `design-page.ts:1017` | CLI's Penpot-only feedback loop |
| `runChatPipelineAsync` | `api/pages/[pageId]/design/chat/route.ts:190` | Dashboard's 3× rerun chat handler |
| `correct/route.ts` vision-correction TODO | `api/pages/[pageId]/design/correct/route.ts:155` | Incomplete feedback wiring |
| `createProject` | `api/_lib/project-creation.ts:123` | Dashboard scaffolder |
| `initCommand` | `packages/cli/src/commands/init.ts:421` | CLI scaffolder |
| `UXResearchOutputSchema` | `packages/agents-ux/src/schemas.ts:11` | Canonical research contract |
| `UXPlanningOutputSchema` | `packages/agents-ux/src/schemas.ts:22` | Canonical planning contract |
| `UX_RESEARCH_CONTRACT` | `packages/agents-ux/src/ux-research/ux-research.ts:64` | Budget + governance policy |

---

## 13. Summary

The design pipeline unification plan has been stress-tested against three review passes. The pattern in each pass was that the reviewer proposed earlier-shipping options framed as obviously better, and in each case the framing hid a structural cost — AgentContext plumbing rework, load-bearing dependency coupling, or throwaway code.

The current plan (rev 2) and divergence doc (rev 2) reflect:
- The 2026-04-24 spec sync (browser-primary, Figma removed, taxonomy restructured, event bus demoted).
- The A/B/C/D classification that separates real bugs from intentional channel choices.
- The parameterized-pipeline shape (`runDesignPipeline({ designTool: 'browser' | 'penpot' })`).
- ADRs deferred to follow the shared-layer landing, not precede it.

A second reviewer should feel free to challenge any specific claim in §4–§6 — but should do so with the structural principles in §7 and the source-of-truth facts in §1 in hand. Challenges that rely on framings already addressed here should either introduce new information or surface an error in the prior analysis explicitly.
