# Backstage Improvements — Master Plan

## Goal

Systematic doc quality improvements across the CHIP documentation site, driven by `/backstage review` audits. Each child plan targets a specific page or section, applies the backstage review protocol (competitor-swap test, voice/flow rules, diagram de-duplication), and produces concrete rewrites.

## Scope

- Concept pages (`docs/concepts/`)
- Architecture pages (`docs/architecture/`)
- Research pages (`docs/research-report.md`, `docs/research/`)
- Home page (`docs/index.md`)
- Guide pages (`docs/guides/`) — as needed

Out of scope: ADRs, CLAUDE.md, package READMEs. Specs are generally out of scope, except when they contain internal contradictions against locked architectural decisions (e.g., sdlc-agents.md Section 11.3.1 vs 11.3.4).

## Child Plans

| # | Plan | Target | Status | Findings |
|---|------|--------|--------|----------|
| 1 | Concepts Overview + Section Review | `docs/concepts/overview.md` + broader concepts section | **COMPLETE** (2026-05-04) | 9 overview findings applied: opener rewritten (competitor-swap test), "How it works" promoted to first heading, "Why CHIP does this differently" → "What the Clarifier does differently" (strength statement), EVPI/ClarifyGPT jargon removed (D2: 2 paragraphs + link), HITL gate details slimmed to 1 paragraph + link (D11: verified Plan 8 gate-focused diagram), "Current implementation" → 4-sentence "Current state" + link, Related expanded (+clarifier-pipeline.md, +hitl-governance.md). B3: current-status.md authoritative source citation added. |
| 2 | Agent Taxonomy Review | `docs/concepts/agent-taxonomy.md` | **COMPLETE** (2026-05-04) | 9 findings applied: phantom predecessor removed (ten-agent → collapsible historical context with vision.md citation), node count fixed 6→9 (D3, slimmed to taxonomy level per D2 with link to clarifier-pipeline.md), mental model paragraph added, planned stages wrapped in admonitions (future tense), diagram legend added (D1), duplicate "single-writer" removed, Current implementation + Known limitations sections added |
| 3 | Research Report Review | `docs/research-report.md` | Complete | 13 findings (3 critical, 6 important, 4 polish): brand rename, voice rewrite, gap analysis update, 2 Mermaid diagrams, admonitions, collapsibles, Part 4.5 absorbed |
| 4 | Clarifier Pipeline Review | `docs/concepts/clarifier-pipeline.md` | **COMPLETE** (2026-05-04) | 13 findings applied: page restructured (competitive content → collapsible), diagram updated (6→9 nodes with prdUpdater/escalationGate/emitComplete), 3 new node descriptions, stale limitation qualified, ClarifyGPT citation fixed, EVPI reworded, Components table expanded (14 rows), downstream D3 fix in clarifier-question-generation.md |
| 5 | Coordination & State Review | `docs/concepts/coordination-and-state.md` | **COMPLETE** (2026-05-04) | 10 findings applied: opener rewritten (channels/reducers defined, CHIP-specific), Clarifier topology diagram replaced with generic channels pattern, Components table 8→9 nodes + routeAfterPrdUpdater added, negative framing reduced to Telemetry section + Known Limitations only, duplicate migration note merged, Related links expanded (research-report Part 1, design-decisions §1.2), D13 crosslink to state-persistence.md |
| 6 | Architecture Review | `docs/architecture/architecture.md` | **COMPLETE** (2026-05-04) | 17 findings applied: 4-stage spine, 19 packages, ADR-044–051, telemetry reframing (D8), 6 cross-references, planned admonitions for unbuilt stages |
| 7 | SDLC Agents Spec Review | `docs/specs/sdlc-agents.md` | **COMPLETE** (2026-05-04) | 13 findings applied: brand rename AgentForge→CHIP (9 prose occurrences), 5-agent table removed → Implementer workflow description, LLM routing Code review haiku→sonnet, 11.3.3 workflow rewrite (single-threaded Implementer + Reviewer stage), 3 planned admonitions (11.4, 11.5, 12), Phase B historical collapsible, supersession note clarified, opening blockquote count fixed |
| 8 | HITL Governance Review | `docs/concepts/hitl-governance.md` | **COMPLETE** (2026-05-04) | 12 findings applied: opener rewritten (mental model first, no LangGraph jargon), gate-focused diagram replacing spine replica (neutral fills per D1), gate table aligned with vision.md 3-gate model + Gate 1.5 footnote + spine-impl discrepancy note, stale brand fixed (agentforge→chip.yaml with Planned admonition), LangGraph mechanics consolidated into collapsible section (D10 ownership split), ADR-004 admonition added, Known Limitations section (4 items), Related docs expanded (8 links incl. spine-impl §9, coordination-and-state, overview) |
| 9 | Design Pipeline Review | `docs/concepts/design-pipeline.md` | **COMPLETE** (2026-05-04) | 13 findings applied: opener rewritten (purpose-first, sequential reasoning), mental model paragraph added (why four stages), Spine Integration section with 4→2 redistribution table (D12), Three-Layer diagram updated with Spine Implementer caller, cross-screen architecture restructured (subsection headings, positive framing), evaluator two-pass reasoning added, renderer design/render separation cross-ref, schema constraint admonition, neutral fills per D1, dataflow link annotated (standalone), spine-impl §4 as first Related link |
| 10 | State Persistence Review | `docs/concepts/state-persistence.md` | **COMPLETE** (2026-05-04) | 13 findings applied: opener rewritten (CHIP-specific three-tier description), "Why CHIP does this" section added (Research Report + Design Decisions §2.1 citations), diagram redesigned (spine stages → tiers with legend), duplicate Mermaid fixed (inner fence → text), insider concepts defined on first use, spine stage → tier mapping added, file event bridge marked deprecated, silent fallback converted to admonition, D2 crosslink to clarifier-pipeline.md, D13 crosslinks to coordination-and-state.md |
| 11 | Observability Review | `docs/concepts/observability.md` | **COMPLETE** (2026-05-04) | 9 findings applied: env var fixed (`LANGFUSE_HOST` → `LANGFUSE_BASE_URL`), opening strengthened (competitor-swap pass), "Why CHIP does this" section added (ADR-046 locked decisions), diagram labels logical + legend added (D1 category fills), CompositeSink jargon defined (SSE, transport sinks), Components table added (4 rows), "Not built" removed → Known limitations section (positive framing, 3 items incl. sampling strategy from vision.md Layer 11) |
| 12 | RAG Context Review | `docs/concepts/rag-context.md` | **COMPLETE** (2026-05-04) | 7 findings applied: jargon defined on first use (Merkle tree, BM25, RRF, AST-aware, PageRank), 3 citations hyperlinked, duplicate Mermaid block removed (24 lines saved), precision@5 "gate"→"metric", design indexer clarified, limitations in active voice, collection name context note |
| 13 | Dashboard Architecture Review | `docs/concepts/dashboard-architecture.md` | **COMPLETE** (2026-05-04) | 7 findings applied: API route count fixed (67→63 in diagram + details block), UI subgraph arrows removed (flat node listing), "Current implementation" section removed (Recharts moved to Components table), sidebar label fixed ("Langfuse link"→"Observability" matching sidebar-nav.tsx), /audit and /traces direct-URL-only note added after route table, details block kept (convention), hook references given full paths |
| 14 | Clarifier Question Generation Review | `docs/concepts/clarifier-question-generation.md` | **COMPLETE** (2026-05-04) | 13 findings applied: fabricated blockquote removed (rewritten as synthesis), D3 node count verified (Plan 4 step 10 already applied), EVPI defined with formula, `divergentInterpretations` + Assumption Ledger grounded, defensive framing removed, "Why CHIP does this" added (research report citation), competitor table expanded (8 tools: +Sweep AI, +Mutable.ai), Components table added (6 rows), 5 `!!! question` → `??? question` (collapsed), implications field explained, Pattern depth balanced (code block removed), Known limitations added (3 items), "Let CHIP decide" clarified (existing mechanism vs planned UI) |
| 15 | Vision Overview Review | `docs/architecture/vision-overview.md` | **COMPLETE** (2026-05-04) | 5 findings applied: Single Invariant relocated from opener to after Spine section (earned insider concept), test count removed (114+ stale+banned), Locked Decisions table removed (26-row duplication of per-layer prose, "Decision Landscape"→"Open Decisions"), diagram legend added (green/orange/gray), length reduced 297→261 (justified for 15-layer dashboard) |
| 16 | Architecture README Review | `docs/architecture/README.md` | **COMPLETE** (2026-05-04) | 7 findings applied: CHIP-specific opener (spine model + dual axes), reading path for 12 sub-pages (4 ordered + 7 deep dives), promoted to nav position 1 (D14), expanded 6→18 lines, cross-section links (Concepts, Specs, Guides), accurate content categories |
| 17 | Spine Pattern Review | `docs/architecture/spine-pattern.md` | **COMPLETE** (2026-05-04) | 7 findings applied: CHIP status admonitions for unbuilt stages (Architect/Implementer/Reviewer), D1 diagram legends for both Mermaid diagrams, D15 three-way scope boundary in abstract admonition, Documentation Generator added to Diagram 2 (5→6 specialists per vision.md Layer 3), length justified (357 lines, 24-citation research synthesis), Related expanded (4→9 links grouped by type), orientation sentence before "The Problem" |
| 18 | Spine Implementation Review | `docs/architecture/spine-implementation.md` | **COMPLETE** (2026-05-04) | 5 findings applied: D1 legends for 5 Mermaid diagrams (overview, clarifier graph, architect nodes, specialist tools, assumption ledger — each with context-appropriate legend), D12 backlink to design-pipeline.md in Design Pipeline Integration section, Stale Documentation section updated (3/4 items fixed by Plans 2/6/7, CLAUDE.md item noted as outside scope), D15 reciprocal scope note in abstract, Related expanded (+design-pipeline.md, +state-persistence.md) |
| 19 | Design Decisions Review | `docs/design-decisions.md` | **COMPLETE** (2026-05-04) | 3 findings applied: brand fix line 13 + line 659 ("AgentForge"→"CHIP"), 6 See-also cross-reference blocks added (§1.1→spine-impl, §1.2→coordination, §1.3→spine-pattern, §2.3→state-persistence, §4→rag-context, §6.2→hitl-governance), Known Limitations section added (4 items). Superseded patterns correctly documented. |
| 20 | Agent Contracts Review | `docs/architecture/agent-contracts.md` | **COMPLETE** (2026-05-04) | 7 findings applied: deprecation admonition added (scope: design agents only, ten-agent model rejected), brand fix ("AgentForge"→"CHIP"), "Phase 1 Agent Definitions"→"Design Agent Definitions", Spec/Code/CI-CD agents under "Planned Agents (not implemented)" with historical warning admonition, Known Limitations section (4 items), Related section (4 links incl. dashboard.md dependency). |
| 21 | Design Pipeline Dataflow Review | `docs/architecture/design-pipeline-dataflow.md` | **COMPLETE** (2026-05-04) | 1 finding applied: brand name fix line 3 ("AgentForge"→"CHIP"). File paths at lines 177, 199 verified CORRECT (design-system.ts and generate-design-options.ts exist). 34 agentforge refs in file paths are filesystem namespace (acceptable). Post-ADR-046 unified pipeline (current). Hub document — no content changes needed beyond brand. |

## Cross-Plan Decisions

Decisions that span multiple child plans. Resolve these before executing any individual plan.

### D1: Spine diagram colors

Plans 1 and 2 both flag diagram color issues. The spine uses 4 different fills (`#4A90D9`, `#7B68EE`, `#2ECC71`, `#E67E22`) across `index.md`, `overview.md`, `agent-taxonomy.md`, and `hitl-governance.md` with no legend. On concept pages these could be misread as status encoding.

**Decision needed:** (a) uniform color for all spine stages on concept pages, or (b) keep per-stage identity colors and add a legend note. Whichever is chosen, apply consistently to all four files.

**D1 addendum — status-encoding fills:** `vision-overview.md` (Plan 15) uses fills as status indicators (#2ECC71=Done, #F39C12=Partial, #95A5A6=Not started) — a different semantic from per-stage identity colors. Status-encoding pages are exempt from the uniform-color decision. A legend is still recommended (Plan 15 Finding #4).

### D2: Clarifier detail ownership

After Plan 1 slims overview and Plan 2 fixes agent-taxonomy, three pages will describe Clarifier internals:
- `overview.md` — 1-2 sentences + link (after Plan 1)
- `agent-taxonomy.md` — taxonomy level: what it does, what it produces, which specialists it invokes
- `clarifier-pipeline.md` — node-level detail: 9 nodes, routing, gap detection mechanics, HITL interrupts

**Decision:** No page should duplicate node-level detail. The 9-node sequence with routing lives in `clarifier-pipeline.md` only. Agent-taxonomy keeps a summary paragraph linking out.

### D1 addendum: Research report diagrams

Plan 3 (research diagrams) should follow the D1 decision for any new Mermaid diagrams added to research-report.md. Research diagrams are conceptual — uniform fills are likely correct. Use neutral fills initially and update when D1 resolves.

### D3: Stale "6 nodes" across docs

The Clarifier has 9 nodes (verified in `clarifier-graph.ts`). The stale "6 nodes" claim appears in:
- `agent-taxonomy.md` line 44 (Plan 2 finding #2)
- `coordination-and-state.md` Components table line 100 says "8 nodes" (Plan 5 finding #6 — table-only fix; diagram is REPLACED entirely by Plan 5 with a generic channels pattern, not updated with missing node)
- `clarifier-pipeline.md` lines 5, 25, 141 (Plan 4 finding #4 — canonical page fix)
- `clarifier-question-generation.md` line 179 says "six stages" (Plan 14 finding #2 / Plan 4 step 10 downstream fix)
- `spine-implementation.md:521` already flags this

**Decision:** Fix all occurrences when executing. The canonical node list lives in `clarifier-pipeline.md`. Plan 4 fixes the canonical page and the downstream reference in `clarifier-question-generation.md` line 179 (step 10). Plan 2 fixes agent-taxonomy downstream reference. Plan 5 fixes coordination-and-state.md Components table (the diagram on that page is replaced entirely — see D6). Plan 14 verifies the fix after Plan 4 executes.

### D4: Brand rename and citation chain

Plan 3 renames ARCHON/AgentForge → CHIP in research-report.md (7+ occurrences). Two concept pages directly quote research-report.md text containing "AgentForge":

- `clarifier-pipeline.md` line 15 (direct quote of research-report.md line 301)
- `clarifier-pipeline.md` lines 3, 101 and `clarifier-question-generation.md` lines 3, 182 cite `#part-3-conversational-clarification-agents` anchor — safe if Part 3 heading text stays identical

**Decision:** Plan 3 updates both the source (research-report.md) AND the downstream quote (`clarifier-pipeline.md` line 15). Plans 1 and 2 verify their target pages don't introduce new stale brand references. Plan 4 does NOT touch line 15 brand fix (already scoped in Plan 3). No other stale brand references found in `clarifier-pipeline.md`.

### D5: Execution order re-sequencing for Plan 4

Plan 4 rewrites the canonical Clarifier page (D2). Plans 1 and 2 depend on this page being correct before they can slim their own content and link to it.

**Decision:** Insert Plan 4 between Plans 3 and 2. Insert Plan 5 after Plan 4. Updated execution order:

1. Plan 3 (research-report) — fix source material, brand cascade to clarifier-pipeline.md line 15
2. Plan 4 (clarifier-pipeline) — fix canonical Clarifier page (depends on Plan 3 brand fix)
3. Plan 5 (coordination-and-state) — rewrite opener, replace diagram with generic channels pattern, fix jargon (independent but after Plan 4 for clean Related links)
4. Plan 2 (agent-taxonomy) — fix downstream node count reference (depends on Plan 4 canonical node list)
5. Plan 1 (overview) — restructure, slim, de-duplicate (depends on Plans 2-5; MINUS coordination-and-state.md work, moved to Plan 5)
6. Plan 1 Part 2 (cross-section de-duplication minus coordination-and-state step)

### D6: coordination-and-state.md ownership

Plan 1 B2 identified that the Clarifier graph in coordination-and-state.md should become a generic typed-channels diagram. Plan 5 now owns the full page rewrite including this diagram replacement.

**Decision:** Plan 5 owns all changes to coordination-and-state.md. Plan 1 Step 3 is removed — Plan 1 no longer touches this file. D3 fix for this page is Components table only (line 100: "8 nodes" → "9 nodes"), not diagram node addition.

### D7: architecture.md scope boundary with spine-implementation.md

Plans 6 and the existing spine-implementation.md overlap: both describe the system's structure.

**Decision:** After Plan 6, the scope boundary is:
- **architecture.md** = system-level view: package layout, dependency graph, API contracts, cross-cutting concerns (governance, error handling, MCP middleware), layer diagram showing how packages relate
- **spine-implementation.md** = stage-level view: how each spine stage works internally, node sequences, context handoffs, HITL gate mechanics, specialist invocation patterns

Plan 6 rewrites architecture.md as the "system map." The "Typical Workflow" section shows the 4-stage spine with typed handoffs between stages but links to spine-implementation.md for per-stage detail. It does NOT duplicate spine stage internals.

### D8: architecture.md downstream consumers

`docs/specs/dashboard.md` treats architecture.md as source of truth for event registry, API contracts, and MCP middleware. Plan 6 reframes the event registry (move under "Telemetry Events" heading) which could affect dashboard.md citations.

**Decision:** Plan 6 preserves the Event Bus Interface and Event Registry sections (accurate for telemetry plane) but moves them under a "Telemetry Events" heading. Plan 7 (sdlc-agents.md) and future plans verify their architecture.md citations after Plan 6 executes. Flag in Plan 7's cross-plan coordination.

### D9: sdlc-agents.md Section 11 phase structure preservation

Sections 11.1-11.5 organize content by SDLC phase (Design, Spec, Code Gen, CI/CD, Observe) while the spine uses 4 stages (Clarifier, Architect, Implementer, Reviewer). These are different decompositions — phases describe *what work is done*, stages describe *who does the work*.

**Decision:** Preserve Section 11's phase structure (PRD section describing product phases, not architecture). Plan 7 fixes factual errors *within* the phase sections (parallel agents → single-threaded, stale workflows) but does NOT restructure the section headings. Aspirational phases (CI/CD, Observe, Research) are marked as planned/future. A full Section 11 restructuring around spine stages would be a PRD rewrite beyond backstage scope.

### D10: HITL content ownership between hitl-governance.md and spine-implementation.md §9

Both pages describe the gate system. Plan 8 establishes the scope boundary.

**Decision:** After Plan 8:
- **hitl-governance.md** = concept level: why humans approve at phase boundaries, what each gate approves, policy levels, governance middleware framework, rejected patterns. Non-engineer readable. No LangGraph API calls in main flow.
- **spine-implementation.md §9** = implementation level: LangGraph `interruptBefore` mechanics, node names (`storyWriter`, `escalationGate`), `graph.stream` resume semantics, Postgres checkpointer behavior, timeout handling.

Gate table exists in both with different columns: hitl-governance has Trigger/Behavior/Mechanism (plain language); spine-implementation has Location/Decision/Mechanism/Status (implementation detail). No duplication — different audiences, different detail level.

**D10 addendum — Gate numbering discrepancy (flag only):** vision.md Layer 10 defines 3 gates. spine-implementation.md §9 defines 4 (Gate 1, 1.5, 2, 3) with Gate 2 = architecture review (not design/API approval). Concept page follows vision.md. If spine-impl's Gate 2 is architecturally correct, vision.md should be updated — architectural decision outside backstage scope.

### D12: Design pipeline concept/integration scope boundary

Plan 9 establishes the scope boundary between design-pipeline.md and spine-implementation.md §4.

**Decision:** After Plan 9:
- **design-pipeline.md** = concept level: why the pipeline exists, 4-stage standalone mechanics, renderer separation, evaluator approach, cross-screen architecture
- **spine-implementation.md §4** = integration level: how stages redistribute in spine mode (4→2), what Architect prepares (ScreenPlan + ComponentComposition + DesignTokensSpec), what Implementer invokes

design-pipeline.md has a brief "Spine Integration" section naming the redistribution and linking to §4. spine-implementation.md §4 should backlink to design-pipeline.md for standalone pipeline detail (currently missing — flag as out-of-scope gap).

### D13: State persistence vs. coordination-and-state content boundary

Plans 5 and 10 target sibling pages that both discuss LangGraph state from different angles.

**Decision:** After Plans 5 and 10:
- **state-persistence.md** = physical view: *where* state lives (YAML in git, Postgres checkpointer, in-memory), *how* it's stored (atomic writes, content hashing, checkpoint factory), *why* three tiers (access pattern matching)
- **coordination-and-state.md** = logical view: *what* flows through channels (typed LangGraph channels with reducers), *how* agents coordinate (read/write channel state), *why* channels not events (telemetry separation)

Each page has a brief crosslink in its Related section naming the other's scope. Neither page explains the other's domain. When state-persistence.md says "channel contents" it links to coordination-and-state.md rather than defining channels. When coordination-and-state.md says "checkpoints fire on every node boundary" it links to state-persistence.md rather than explaining the checkpointer factory.

**D13 addendum — vision.md Layer 4 drift (flag only):** Vision.md Layer 4 Current state (line 312) says "Not yet wired into any pipeline." State-persistence.md correctly states checkpointer is wired into the Clarifier graph. The concept page is more current than its authoritative source. Vision.md update needed — outside backstage scope.

### D14: Architecture section gateway ownership and nav position

README.md is labeled "Architecture Overview" at nav position 6 of 12. vision-overview.md is "Architecture at a Glance" at position 1. After Plan 6, architecture.md becomes "System Architecture" (the system map). Three pages compete for the "entry point" role.

**Decision:** README.md is promoted to nav position 1 as the section gateway. It frames the reading path and links to vision-overview.md (layer dashboard), architecture.md (system map), and spine-pattern/implementation (spine deep dives). vision-overview.md moves to position 2 — it's a detailed 15-layer status dashboard, not a gateway. This gives readers: gateway → dashboard → pattern → implementation → deep dives.

**Affected plans:**
- Plan 15: vision-overview.md's nav label unchanged but position shifts from 1 to 2. No content impact.
- Plan 6: architecture.md's nav position unchanged. README links to it as "System Architecture."

### D15: Three-way scope boundary (spine-pattern.md / architecture.md / spine-implementation.md)

D7 defines the scope boundary between architecture.md and spine-implementation.md but not between spine-pattern.md and either. Plan 17 extends this to a three-way split:

- **spine-pattern.md** = WHY: universal research synthesis, five load-bearing properties, rejected alternatives, evidence base. Not CHIP-specific — describes the convergent pattern across Cognition, Anthropic, Cursor, Aider, MetaGPT, Kiro, Spec Kit.
- **architecture.md** = WHERE: CHIP-specific system map — 19 packages, dependency graph, API contracts, cross-cutting concerns (governance, error handling, MCP middleware).
- **spine-implementation.md** = HOW: CHIP-specific stage internals — node sequences, context handoffs, gate mechanics, specialist invocation patterns.

**Implementation:** Plan 17 adds the three-way scope note to spine-pattern.md's abstract admonition. architecture.md (Plan 6, COMPLETE) already has Related link to spine-pattern.md. spine-implementation.md already has "Read The Spine Pattern first" directive. Plan 18 should verify reciprocal scope language.

**Affected plans:** Plan 17 (implements), Plan 18 (verify reciprocal language).

### D11: Plan 1 Step 2 / Plan 1 Part 2 hitl-governance diagram ownership

Plan 1 Step 2 planned to "De-duplicate hitl-governance.md diagram — replace spine-replica with gate-focused diagram." Master plan step 8 (Plan 1 Part 2) planned to "de-duplicate hitl-governance diagrams."

**Decision:** Plan 8 owns all changes to hitl-governance.md including the diagram replacement. Plan 1 Step 2 should be updated to: "Handled by Plan 8 — verify hitl-governance diagram is gate-focused after Plan 8 executes." Plan 1 Part 2 scope reduced to remaining cross-section work (minus hitl-governance diagram).

## Execution Order

Execute child plans in dependency order, not priority order (see D5, D6, D7, D8, D9, D10, D11, D12, D13, D15):

1. **Plan 3 (research-report)** — fix source material (brand, voice, gap analysis). Must happen first because concept pages cite and quote this document.
2. **Plan 6 (architecture)** — rewrite system architecture page (5-phase → 4-stage spine, parallel agents → single-threaded, event coordination → typed channels). Independent of Plan 4; can run in parallel. Must execute before Plan 2 (taxonomy alignment) and Plan 1 (overview links).
3. **Plan 4 (clarifier-pipeline)** — fix canonical Clarifier page (node count, structure, stale limitation). Depends on Plan 3 brand fix at line 15.
4. **Plan 5 (coordination-and-state)** — rewrite opener, replace diagram with generic channels pattern, fix jargon. Independent but after Plan 4 for clean Related links.
5. **Plan 10 (state-persistence)** — add "Why CHIP does this" section, fix incorrect citation (§2.2→§2.1), define jargon, redesign diagram, add spine context. Soft dependency on Plan 3 (Research Report citation) and Plan 5 (D13 content boundary crosslinks).
6. **Plan 11 (observability)** — fix wrong env var, add "Why CHIP does this" and "Known limitations" sections, rename diagram labels to logical, strengthen opening. No blocking dependencies. Shares D1 diagram color issue with Plan 10. After Plan 10 so D1 fills are consistent.
7. **Plan 2 (agent-taxonomy)** — fix node count and remove phantom predecessor. Depends on Plan 4 fixing the canonical node list and Plan 6 fixing architecture.md agent listing.
8. **Plan 7 (sdlc-agents)** — fix spec internal contradictions (parallel agents → single-threaded, stale brand, aspirational tense). Depends on Plan 6 for architecture.md citation verification (D8). Per D9, preserves phase headings.
9. **Plan 8 (hitl-governance)** — rewrite opener, replace spine-replica diagram with gate-focused diagram, consolidate LangGraph implementation details into collapsible section, fix stale brand. Depends on Plan 4 for clean Gate 1 link to clarifier-pipeline.md. Must execute before Plan 1 (so overview links to corrected page). Handles hitl-governance diagram work previously scoped in Plan 1 Step 2 (D11).
10. **Plan 9 (design-pipeline)** — restructure opener (purpose before function ref), add spine integration context (4→2 stage redistribution per D12), add mental model paragraph, update Three-Layer diagram with spine caller. Independent of Plans 1-8 content. Must execute before Plan 1 (overview links to this page).
11. **Plan 1 (overview)** — restructure, slim content, de-duplicate diagrams. Depends on Plans 2-11 being correct. No longer touches coordination-and-state.md (D6). Step 2 (hitl-governance diagram) handled by Plan 8 (D11).
12. **Plan 1 Part 2 (cross-section)** — remaining cross-section de-duplication. hitl-governance diagram handled by Plan 8 (D11). coordination-and-state.md work handled by Plan 5 (D6).
13. **Plan 13 (dashboard-architecture)** — fix stale API route count (67→63), redesign misleading UI diagram arrows, remove redundant "Current implementation" section, fix sidebar label, document route/sidebar gap, add full hook paths. No blocking dependencies. Soft dependencies on Plans 8, 9, 11 for Related section link verification.
14. **Plan 14 (clarifier-question-generation)** — fix fabricated blockquote, ground jargon (EVPI, Assumption Ledger), remove defensive framing, add missing template sections (Why CHIP does this, Components, Known limitations), fix competitor table, consolidate inline research questions. No hard dependencies. Soft dependencies on Plan 3 (citation anchor stability) and Plan 4 (D3 node count fix at line 179).
15. **Plan 15 (vision-overview)** — relocate Single Invariant section (unearned concept as opener), remove banned test counts, eliminate locked decisions table duplication (prose already covers), add diagram legend. No blocking dependencies. Soft dependency on Plan 6 (architecture.md adds Related link to this page).
16. **Plan 16 (architecture-readme)** — rewrite section landing page: CHIP-specific opener (competitor-swap), reading path for 12 sub-pages, promote to nav position 1 (D14), expand from 6 to ~30 lines. Soft dependency on Plan 6 (architecture.md rewrite) and Plan 15 (nav position shift).
17. **Plan 17 (spine-pattern)** — add CHIP status admonitions for unbuilt stages (Architect/Implementer/Reviewer), D1 diagram legends, fix Diagram 2 (add Documentation Generator), D15 three-way scope boundary in abstract, expand Related links. No blocking dependencies (Plans 6, 8, 15 all COMPLETE). Should execute before Plan 18 (spine-implementation) so D15 scope boundary is established first.
18. **Plan 18 (spine-implementation)** — add D1 diagram legends (5 diagrams with context-appropriate legends), close D12 backlink gap to design-pipeline.md, update stale documentation section (3/4 items fixed by Plans 2/6/7), D15 reciprocal scope note in abstract, expand Related links (+design-pipeline.md, +state-persistence.md). No blocking dependencies. Execute after Plan 17 (done).
19. **Plan 19 (design-decisions)** — brand fix line 13, add Related links to sections lacking cross-references, add Known Limitations. No blocking dependencies. Light-touch fixes.
20. **Plan 20 (agent-contracts)** — add deprecation warning (describes rejected 10-agent model), scope clarification (design agents only), brand fix, add standard sections (Why, Known Limitations, Related), note dashboard.md dependency. No blocking dependencies but highest impact — CRITICAL misalignment with vision.md.
21. **Plan 21 (design-pipeline-dataflow)** — brand name fix line 3, fix 2 stale file paths (lines 177, 199), agentforge file path refs are filesystem namespace (acceptable). No blocking dependencies. Hub document with 34 inbound links.

## Priority Order

1. **Research report** — brand (ARCHON/AgentForge → CHIP) and voice fixes are foundational. Downstream concept pages cite and directly quote this document.
2. **Architecture** — system-level page with 5 critical findings. 18 files reference it as source of truth. Stale 5-phase model, parallel agents, event-driven coordination all contradict spine model. Blocks Plan 2 (taxonomy alignment) and Plan 1 (overview links).
3. **Clarifier pipeline** — canonical node-level detail. Stale node count (6→9), defensive opener, missing node descriptions, stale known-limitation. Blocks Plans 1, 2, and 5 from linking to correct content.
4. **Coordination & state** — defensive opener, wrong diagram type (Clarifier topology → generic channels pattern), jargon without grounding. Subsumes Plan 1 B2 finding.
5. **Agent taxonomy** — factual errors (wrong node count, phantom predecessor). Depends on research report and architecture page being correct.
6. **SDLC agents spec** — internal contradiction (5 parallel agents vs single-threaded mandate), stale brand, aspirational present tense. Depends on architecture page for citation verification.
7. **HITL governance** — procedural opener, LangGraph jargon for non-engineer audience, stale brand, Gate 2 factual mismatch with spine-impl, spine-replica diagram. Must execute before overview slim (Plan 1 links to it). Handles diagram work previously in Plan 1 Step 2.
8. **Overview page** — highest leverage for readers. Critical voice/flow issues. Depends on taxonomy, clarifier pipeline, architecture, sdlc-agents spec, coordination-and-state, and hitl-governance being correct.
9. **Broader concepts de-duplication** — spine diagram 3x, HITL details 2x (hitl-governance diagram now handled by Plan 8).
10. **State persistence** — not previously audited. Missing concept template sections (Why CHIP does this), incorrect citation (§2.2 is EARS not persistence), jargon without definition, missing spine integration context. Independent except for D13 content boundary with coordination-and-state.
11. **Observability** — factually accurate (95%) but missing concept template sections (Why CHIP does this, Known limitations), wrong env var, physical diagram labels, defensive "Not built" framing. Self-contained fixes, no blocking dependencies. Shares D1 diagram color issue with Plan 10.
12. **Plan 12 (rag-context)** — add jargon definitions, hyperlink citations, remove duplicate Mermaid, fix aspirational "gate" claim. No blocking dependencies. Soft dependencies on Plans 2, 3, 5 for Related section link verification. Self-contained fixes.
13. **Plan 13 (dashboard-architecture)** — fix stale API route count (67→63), redesign misleading UI diagram arrows, remove redundant "Current implementation" section, fix sidebar label, document route/sidebar gap. No blocking dependencies. Self-contained fixes.
14. **Plan 14 (clarifier-question-generation)** — fabricated blockquote (critical), stale node count (D3, critical), jargon without grounding, defensive framing, missing template sections. Self-contained fixes. Soft dependencies on Plans 3, 4 for citation/node-count stability.
15. **Plan 15 (vision-overview)** — architecture page with 3 important findings: unearned insider concept as opener, banned test count, locked decisions triple repetition. All facts verified correct except test count (stale). Self-contained fixes, no dependencies. Low priority because the page is otherwise well-structured and factually accurate.
16. **Architecture README** — section gateway with 5 important findings: generic opener fails competitor-swap, no reading guidance, misleading nav position, underpowered vs peers. Expand to ~30 lines, promote to nav position 1 (D14). Soft dependencies on Plans 6, 15.
17. **Spine pattern** — research synthesis page with 4 important findings: unbuilt stage status disambiguation, D1 diagram legends, missing specialist tool (Documentation Generator), D15 scope boundary. Page is well-structured and voice is strong — targeted fixes only. No blocking dependencies. Should execute before Plan 18.
18. **Spine implementation** — 538-line HOW page with 2 important findings: D1 legends for 5 diagrams, D12 backlink gap. Page is well-structured with accurate status markers — targeted fixes only. No blocking dependencies. Execute after Plan 17.
19. **Design decisions** — 716-line decisions doc. 1 brand fix, missing Related links. Well-structured and internally consistent. Light-touch fixes.
20. **Agent contracts** — CRITICAL: 415-line doc describes rejected 10-agent model. Needs deprecation warning, scope clarification (design agents only), dashboard.md dependency noted. Highest impact of remaining P0 files.
21. **Design pipeline dataflow** — 1107-line hub document with 34 inbound links. Brand name fix, 2 stale file paths. Post-ADR-046 (current). Essential operational doc — keep and fix.
22. Future child plans TBD based on additional `/backstage review` runs.

## Process

Each child plan follows the backstage review protocol:

1. Gather context (page content, nav position, inbound/outbound links)
2. Apply quality checks (voice, flow, competitor-swap, aspirational tense, diagrams)
3. Produce findings table with severity, rule violated, current text, suggested rewrite
4. Implement fixes
5. Verify (`mkdocs build`, cited paths exist, competitor-swap on 3 riskiest sentences, length check)
