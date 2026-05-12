# Planning Methodology for an Agentic SDLC Framework

!!! warning "Point-in-time snapshot (2026-04-27)"

    Methodology decisions documented here are settled. See the
    [counter-analysis](planning-methodology-counter-analysis.md) for a
    pressure test of the sources cited. For current planning patterns,
    see [vision.md Layer 8](../vision.md#layer-8-implementation).

> Date: 2026-04-27
> Status: Investigation complete. Decisions made. See §6 for outcomes.

---

## 1. Background

AgentForge is an open-source multi-agent framework for end-to-end SDLC
orchestration. It uses a four-stage vertical spine (Clarify → Architect →
Implement → Review) with specialist agents invoked as tools. The design
pipeline is the most mature component: it generates UX designs via LLM,
renders them to a browser-based preview, evaluates quality via a vision LLM,
and runs correction loops until the design meets a quality threshold.

During a session focused on observability cleanup and UX design diversity, a
methodology question surfaced: **how should an agentic SDLC framework plan
its own development, and should that methodology be consistent with what the
framework teaches its agents?**

### How the question arose

1. Phase 2.6 of the visual diversity plan demonstrated that LLM design prompts
   cannot guarantee compliance — the evaluator (correction loop) is the
   enforcement mechanism. This meant we needed a strategic vision for how
   design quality evolves beyond the current phase.

2. We created a "design quality roadmap" (five maturity tiers backed by
   research) and consolidated scattered planning docs into lifecycle folders
   (`docs/plans/{active,backlog,completed}/`).

3. The consolidation raised three questions:
   - If the parent roadmap is high-level, do we need child roadmaps for
     every phase?
   - If child roadmaps exist, how do we ensure alignment with the parent?
   - If the parent were granular enough, wouldn't children be unnecessary?

4. These questions led to a deeper investigation: do roadmap hierarchies
   apply at all when autonomous agents make iteration nearly free?

---

## 2. Initial Analysis (Agent)

The agent surveyed six sources (arXiv SASE paper, AWS AI-DLC, GitHub Spec Kit,
PwC 2026 study, McKinsey/QuantumBlack, Deloitte 2025) and concluded:

- **Specifications are replacing roadmaps** as the primary planning artifact.
- The arXiv paper proposes a "three-tier hierarchy" (BriefingScript / LoopScript
  / MentorScript) that maps to AgentForge's existing artifacts.
- **Roadmaps create alignment debt** because iteration cost is near-zero.
- AgentForge's agents produce specs, not roadmaps, so the framework should
  **dogfood its own methodology** — no roadmaps for its own development either.
- `future-roadmap.md` is "really just an objectives document."

---

## 3. Counter-Analysis (User Research)

The user independently verified every cited source and pressure-tested the
claims. Findings:

### 3.1 Source verification results

| Source | Verdict |
|--------|---------|
| arXiv SASE paper (Hassan et al.) | Exists. But the "three-tier" framing is a **material distortion**. The paper has six activities and five artifact types, not three tiers. BriefingScript includes an Implementation Blueprint (not just "what to achieve"). The paper does not argue against sequenced delivery. |
| AWS AI-DLC | Accurate on "bolts" and "units of work." But AI-DLC's most recent release (Adaptive Workflows) is about **skipping stages when not needed** — the opposite of "specs replace roadmaps." Counter-evidence: ELEKS analysis says AI-DLC is worse for exploratory/solo work. |
| GitHub Spec Kit | Spec Kit's `tasks.md` is explicitly described by GitHub as "a clear **roadmap** for the implement command" — a dependency-ordered, sequenced task list with checkpoints. Spec-driven development at GitHub is not "no roadmap"; it's "spec-generated roadmap." Martin Fowler's review: "felt like overkill for the size of the problem." |
| PwC 2026 | Exists, but the "behavioral metrics replace KPIs" claim was **misattributed** — it comes from Codebridge/EPAM, not PwC. |
| McKinsey/QuantumBlack | Broadly accurate. But McKinsey's most cited 2025 lesson is "agents aren't always the answer; simpler approaches can sometimes be more effective." |
| Deloitte 42% / Gartner 40% | Accurately cited, but both are about **organizational adoption strategy**, not project-level planning practice. Gartner's prescription is "more strategic discipline," not "less sequencing." |

### 3.2 Missing planning models

**Shape Up** (Basecamp, 2019) — the most influential non-roadmap planning
model for small teams — was not considered. Shape Up uses appetite-bounded
cycles with circuit breakers (ship or cancel, never extend). It sits in the
middle ground between "phased roadmap" and "pure specs" that the initial
analysis's binary framing erased. It has been adapted for AI-augmented teams
(Shape Up AI Native).

**OKRs** — commonly used as an outcome-setting layer above sequenced work,
not in opposition to it. Reinforces the "objectives" artifact type but
explicitly assumes sequenced delivery sits beneath it.

**Lean / Continuous Delivery** — decouples discovery from delivery but is
flow-based, not "iteration-cost-zero." Assumes meaningful context-switching
cost and asymmetric cost of large batches.

### 3.3 The critical finding about `future-roadmap.md`

The initial analysis claimed this file was "an objectives document, keep as-is."
This was dishonest. The file contains:

- Phase numbers (0-8) with directional ordering
- "Merge each PR before starting the next phase" (sequencing)
- Per-phase exit criteria (commitment to future done-state)
- Prereq decisions and decision gates

However, it is a **dependency-based roadmap, not a time-based roadmap.** No
dates, no quarters. Phase numbers encode a topological sort of the dependency
graph. This distinction matters because the literature does not argue against
dependency-ordered delivery — it argues against calendar-based prediction.

### 3.4 The contested premise

The initial analysis assumed "iteration cost has dropped to near-zero." The
2025 DORA report and 2026 practitioner experience consistently report that
**generation cost** dropped but **review cost** is the binding constraint.
If review is the bottleneck, sequenced delivery with WIP limits matters
more in agent-augmented work, not less.

### 3.5 The spec-driven counter-position

Published counter-evidence from spec-driven practitioners themselves:

- Martin Fowler on Spec Kit: "felt like overkill for the size of the problem"
  on 3-5 point features.
- arXiv SDD survey: "Solo, short-lived projects may find the overhead exceeds
  benefits when there's only one developer and no long-term maintenance."
- VSDD critique: "Deciding upfront which parts of the system will be a
  deterministic, side-effect-free core requires understanding the full shape
  of the problem — which you won't have until you've partially built it."

---

## 4. What the Literature Actually Supports

The binary framing "specifications replace roadmaps" is not supported by the
literature cited. The literature is closer to:

> **Specifications can generate dependency-ordered plans, and those plans are
> kept in sync with the specs.**

Evidence:

- AWS AI-DLC's `unit-name-code-generation-plan.md` is a dependency-ordered
  checklist with checkboxes.
- GitHub Spec Kit's `tasks.md` provides "dependency management — tasks are
  ordered to respect dependencies between components" and is explicitly
  called "a clear roadmap for the implement command."
- The arXiv SASE paper's LoopScript "specifies task decomposition,
  parallelization, workflow strategy, and evidence-based acceptance criteria."

In all three references, dependency-ordered phased delivery is not opposed to
spec-driven development — it is one of its outputs.

---

## 5. The Recursive Consistency Question

The question "should AgentForge's own development methodology match what the
framework teaches its agents?" has engineering arguments on both sides:

**For dogfooding:**
- Defect discovery: using the framework on its own development surfaces bugs
  users will encounter.
- Truthful documentation: if the framework recommends specs but its own
  development uses a phased roadmap, sophisticated readers will notice.
- Capability gap detection: if the developer needed a roadmap but the
  framework can't produce one for users, that's data about a missing
  capability.

**Against dogfooding:**
- Domain mismatch: AgentForge generates applications (product-shaped).
  AgentForge itself is a framework (infrastructure-shaped, heavy dependency
  graph). The two domains have different planning requirements.
- Premature constraint: locking the framework's development into its own
  app-development methodology assumes the methodology is right before it's
  been proven.
- Empirical test: if the current roadmap works (developer ships against it),
  that's stronger evidence than methodology arguments.

---

## 6. Decisions Made

Based on the investigation:

### 6.1 Keep `docs/roadmap.md` as a dependency graph

It provides dependency visibility, WIP discipline, and single-glance "what's
next" — all non-trivial to recover from flat specs. It is not a time-based
prediction; it's a topological sort. The literature supports this form.

Renamed from `future-roadmap.md` to `roadmap.md` — it's a human-facing
document, the "future-" prefix was unnecessary.

### 6.2 Rename design quality roadmap to capability vision

`design-quality-roadmap.md` → `design-quality-vision.md`. It describes a
maturity trajectory backed by research, not a schedule. Both the initial
analysis and counter-analysis agree on this.

### 6.3 Don't decompose the roadmap into pure specs

The Fowler and arXiv SDD critiques (overkill for solo/small, premature spec
constrains learning) apply directly. The cost of decomposition exceeds the
alignment debt it would resolve for a solo developer bootstrapping a
partially-built framework.

### 6.4 Correct the methodology doc's distortions

The initial analysis (`planning-methodology-for-agentic-sdlc.md`) contained
five dishonest or inaccurate framings that were identified and acknowledged:

1. The arXiv three-tier mapping was a material distortion of a six-activity,
   five-artifact framework.
2. The PwC behavioral metrics claim was misattributed (source: Codebridge/EPAM).
3. Shape Up — the most relevant planning model for small teams — was not
   considered.
4. "Iteration cost near-zero" is contested; review cost is the binding
   constraint per DORA 2025.
5. `future-roadmap.md` was dishonestly framed as "an objectives document."

### 6.5 Planning artifact hierarchy (settled)

| Artifact | Purpose | Example |
|----------|---------|---------|
| Dependency-ordered roadmap | Phase sequencing with exit criteria (human-facing) | `docs/roadmap.md` |
| Execution plans | Task checklists with verification criteria (drives daily work) | `docs/plans/active/*/execution-plan.md` |
| Decision records | Research-backed rationale with revisit triggers | `docs/design-decisions.md` |
| Capability visions | Strategic maturity trajectory per capability area | `docs/plans/active/*/design-quality-vision.md` |
| Development rules | How to execute (LoopScript equivalent) | `CLAUDE.md`, `.claude/rules/` |
| Lessons learned | Why decisions follow norms (MentorScript adjacent) | `docs/lessons-learned.md` |

---

## 7. References

### Primary sources (verified)

1. Hassan et al., "Agentic Software Engineering: Foundational Pillars and a Research Roadmap" (arXiv, 2025) — [paper](https://arxiv.org/abs/2509.06216v2), [review](https://www.themoonlight.io/en/review/agentic-software-engineering-foundational-pillars-and-a-research-roadmap)
2. AWS AI-DLC — [blog](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/), [adaptive workflows](https://aws.amazon.com/blogs/devops/open-sourcing-adaptive-workflows-for-ai-driven-development-life-cycle-ai-dlc/), [implementation](https://aws.amazon.com/blogs/devops/building-with-ai-dlc-using-amazon-q-developer/)
3. GitHub Spec Kit — [repo](https://github.com/github/spec-kit), [blog](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
4. PwC Middle East, "Agentic SDLC in Practice" (2026) — [PDF](https://www.pwc.com/m1/en/publications/2026/docs/future-of-solutions-dev-and-delivery-in-the-rise-of-gen-ai.pdf)
5. Deloitte, "Tech Trends 2026: Agentic AI Strategy" — [report](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/agentic-ai-strategy.html)
6. Gartner, ">40% of agentic AI projects canceled by 2027" — [press release](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)

### Counter-evidence and alternative models

7. Martin Fowler, "Exploring Generative AI: SDD Tools" — [article](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
8. arXiv SDD survey, "Solo/short-lived projects" failure modes — [paper](https://arxiv.org/html/2602.00180v1)
9. VSDD critique — [gist](https://gist.github.com/dollspace-gay/d8d3bc3ecf4188df049d7a4726bb2a00)
10. ELEKS, "AWS AI-DLC Explained" (counter-evidence for solo/exploratory work) — [article](https://eleks.com/blog/aws-ai-dlc-explained/)
11. Basecamp, "Shape Up" — [book](https://basecamp.com/shapeup)
12. Shape Up AI Native adaptation — [repo](https://github.com/sergiolindolfoferreira/shape-up-ai-native)
13. Abait, "Four Modalities for Coding with Agents" (DORA 2025 review cost finding) — [article](https://dev.to/eabait/the-four-modalities-for-coding-with-agents-4cdf)
14. McKinsey/QuantumBlack, "One Year of Agentic AI: Six Lessons" — [article](https://www.brianheger.com/one-year-of-agentic-ai-six-lessons-from-the-people-doing-the-work-quantum-black-ai-by-mckinsey/)
15. EPAM, "Agentic Development Lifecycle Explained" — [article](https://www.epam.com/insights/ai/blogs/agentic-development-lifecycle-explained)
16. Codebridge, "ADLC Production-Ready Playbook" — [article](https://www.codebridge.tech/articles/agentic-ai-software-development-lifecycle-the-production-ready-playbook)

### Design quality evaluation (from earlier in session)

17. "Agentic Design Review System" (AAAI 2025) — [paper](https://arxiv.org/html/2508.10745)
18. MLLM-as-a-Judge benchmark — [site](https://mllm-judge.github.io/)
19. LiveIdeaBench (embedding-based diversity scoring) — [topic](https://www.emergentmind.com/topics/liveideabench)
20. Generation Diversity (GD) metrics for UI design — [paper](https://arxiv.org/html/2412.20071v3)
