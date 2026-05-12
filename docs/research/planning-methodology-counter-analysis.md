# Balanced Analysis: Planning Methodology for CHIP

!!! warning "Point-in-time snapshot (2026-04-30)"

    Pressure test of the [Planning Methodology Investigation](planning-methodology-investigation.md).
    Methodology decisions are settled. For current planning patterns,
    see [vision.md Layer 8](../vision.md#layer-8-implementation).

This analysis verifies the cited sources, pressure-tests the arXiv mapping, surfaces planning models the doc ignores, assesses `future-roadmap.md` honestly against its own arguments, and lays out the trade-offs without recommending. Where the methodology doc is right, that's stated. Where it overreaches, that's stated too.

---

## 1. Source Verification

### 1.1 arXiv 2509.06216 — Hassan et al., "Agentic Software Engineering: Foundational Pillars and a Research Roadmap"

**Verdict on existence: ACCURATELY CITED.** The paper exists, is by Ahmed E. Hassan, Hao Li, Dayi Lin, Bram Adams, Tse-Hsun Chen, Yutaro Kashiwa, and Dong Qiu (2025), and proposes the SE 3.0 / Structured Agentic Software Engineering (SASE) vision [Source](https://arxiv.org/abs/2509.06216v2).

**Verdict on the "three-tier" framing: LOOSELY PARAPHRASED, with material distortion.**

The methodology doc compresses the paper's framework into a tidy three-tier model (BriefingScript = what / LoopScript = how / MentorScript = why). The paper itself does not present a clean three-tier hierarchy. It defines **six interconnected engineering activities** — Briefing Engineering, Agentic Loop Engineering, AI Teammate Mentorship Engineering, Agentic Guidance Engineering, AI Teammate Lifecycle Engineering, and AI Teammate Infrastructure Engineering — supported by **five categories of artifacts**: BriefingScript, LoopScript, MentorScript, Consultation Request Packs (CRPs), and Merge-Readiness Packs (MRPs), plus Version-Controlled Resolutions (VCRs) [Source](https://www.themoonlight.io/en/review/agentic-software-engineering-foundational-pillars-and-a-research-roadmap).

The three "scripts" the doc focuses on are real, but the paper presents them as part of a bidirectional, multi-artifact dialogue, not as a layered "what/how/why" tower [Source](https://huggingface.co/papers/2509.06216). Reducing the paper to three tiers strips out the agent→human artifacts (CRPs, MRPs) that the paper considers structurally co-equal — and those are precisely the artifacts most relevant to AgentForge's reviewer/specialist loop.

### 1.2 AWS AI-Driven Development Lifecycle (AI-DLC) — "bolts" and "units of work"

**Verdict: ACCURATELY CITED.** The AWS DevOps blog confirms: "Traditional 'sprints' are replaced by 'bolts' – shorter, more intense work cycles measured in hours or days rather than weeks; Epics are replaced by Units of Work" [Source](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/). AI-DLC has three phases (Inception, Construction, Operations), introduces "Mob Elaboration" and "Mob Construction" rituals, and is now open-sourced as steering/rules files at `github.com/awslabs/aidlc-workflows` [Source](https://michaelrishiforrester.com/2026/03/11/deep-dive-aws-ai-development.html). Implementation is via Amazon Q Developer's Project Rules feature [Source](https://aws.amazon.com/blogs/devops/building-with-ai-dlc-using-amazon-q-developer/).

**Important nuance the doc misses:** AI-DLC explicitly *adapts depth* to project complexity and *can skip stages* including Application Design and Units of Work Planning for simple projects. AWS itself frames AI-DLC's most recent evolution as "Adaptive Workflows" — an explicit pushback against rigid one-size-fits-all process [Source](https://aws.amazon.com/blogs/devops/open-sourcing-adaptive-workflows-for-ai-driven-development-life-cycle-ai-dlc/). This is the opposite of "specs replace roadmaps" — it's "process adapts to context, including dropping spec stages when not needed."

**Counter-evidence the doc doesn't cite:** ELEKS' analysis explicitly flags that AI-DLC "emphasises planning over coding velocity; better for complex projects, worse for exploratory work" and that traditional practices are better when "you're working alone without managing stakeholders, you're exploring solutions that aren't clear yet, you have tight deadlines and need to ship fast instead of documenting everything" [Source](https://eleks.com/blog/aws-ai-dlc-explained/). AI-DLC's own promoters identify solo/exploratory work as a poor fit — directly relevant to AgentForge.

### 1.3 GitHub Spec Kit

**Verdict: LOOSELY PARAPHRASED.** Spec Kit does place specifications at the center of the engineering process. The official GitHub Blog states: "Spec Kit makes your specification the center of your engineering process. Instead of writing a spec and setting it aside, the spec drives the implementation, checklists, and task breakdowns" [Source](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/).

But the methodology doc's phrasing ("auto-generates issues/assigns coding agents") is not quite right. Spec Kit's actual workflow is `/constitution → /specify → /plan → /tasks → /implement`, where `/tasks` produces a `tasks.md` with **dependency-ordered tasks**, parallel-execution markers, and file paths — explicitly described as a "clear roadmap for the `/speckit.implement` command" [Source](https://github.com/github/spec-kit). Issue creation and agent assignment exist as community extensions (e.g., Jira/GitHub Issues sync), not as core auto-generation behavior.

**Counter-evidence the doc omits:** Spec Kit itself produces a phase-sequenced, dependency-ordered task list with checkpoints — exactly the structure the methodology doc objects to in `future-roadmap.md`. The "spec at the center" framing in GitHub's own marketing coexists with a tasks.md that looks like a phased roadmap. Spec-driven development at GitHub is not "no roadmap"; it's "spec-generated roadmap."

Even more pointedly: Martin Fowler's published review of Kiro and Spec Kit reports the agent "ignored the notes that these were descriptions of existing classes, it just took them as a new specification and generated them all over again, creating duplicates," and notes that for a 3–5 point feature the workflow felt "like overkill for the size of the problem… in the same time it took me to run and review the spec-kit results I could have implemented the feature with 'plain' AI-assisted coding" [Source](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html). This is significant counter-evidence to the spec-driven argument that the methodology doc does not engage with.

### 1.4 PwC 2026 study — engineers reviewing agent outputs, behavioral metrics replacing KPIs

**Verdict: PARTIALLY MISATTRIBUTED.**

The PwC publication exists: "Agentic SDLC in practice: the rise of autonomous software delivery" is a real PwC Middle East study (2026), surveying GCC-region adoption of GenAI across the SDLC's seven stages [Source](https://www.pwc.com/m1/en/publications/2026/docs/future-of-solutions-dev-and-delivery-in-the-rise-of-gen-ai.pdf). Its general claim that GenAI moves engineers toward review/oversight roles is supported by the report.

However, the specific claim "behavioral metrics replace traditional KPIs, with acceptance rate, escalation quality, and supervision burden emerging as primary indicators" comes from **Codebridge's ADLC playbook**, not from PwC [Source](https://www.codebridge.tech/articles/agentic-ai-software-development-lifecycle-the-production-ready-playbook). EPAM's Agentic Development Lifecycle (ADLC) makes a similar point about "cycle time, accuracy, cost, latency, and escalation rates" [Source](https://www.epam.com/insights/ai/blogs/agentic-development-lifecycle-explained). If the methodology doc attributes the behavioral-metrics claim to PwC, that attribution is incorrect.

PwC's *consultancy-side* news in 2026 — its PwC One platform putting agents directly in front of clients with "PwC professionals reviewing outputs in the background" — is real and reinforces the human-as-reviewer narrative, but is about consulting delivery, not the SDLC [Source](https://thenewstack.io/pwcs-ai-agents-are-now-your-consultants-whether-youre-ready-or-not/).

### 1.5 McKinsey/QuantumBlack — hierarchical task decomposition and dynamic replanning

**Verdict: LOOSELY PARAPHRASED, generally supported.** QuantumBlack's published material does discuss agentic workflows where AI agents "continuously forecast demand… identify risks… and dynamically replan transport and inventory flows" [Source](https://www.mckinsey.com/capabilities/quantumblack/our-insights/seizing-the-agentic-ai-advantage), and frames "the handoff from requirements to design to implementation" as "where context goes to die," advocating deterministic workflow engines over agent-driven control flow [Source](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d).

The exact phrasing "hierarchical task decomposition and dynamic replanning" is more readily sourced from generic agentic-AI planning literature (e.g., Tungsten Automation's Plan-Act-Reflect-Repeat pattern [Source](https://www.tungstenautomation.com/learn/blog/the-agentic-ai-planning-pattern)) than from McKinsey specifically, but the substance is broadly accurate.

**Counter-evidence to surface:** McKinsey's own most-cited 2025 lesson is "focus on workflows, not just agents" and "agents aren't always the answer; simpler approaches like automation, rules, or analytics can sometimes be more effective, particularly in standardized, low-variance workflows" [Source](https://www.brianheger.com/one-year-of-agentic-ai-six-lessons-from-the-people-doing-the-work-quantum-black-ai-by-mckinsey/). This complicates any strong "specs replace roadmaps because agents make iteration free" claim.

### 1.6 Deloitte 2025 — 42% developing roadmap, 35% no strategy

**Verdict: ACCURATELY CITED.** Deloitte's *Tech Trends 2026* report, drawing on the *2025 Emerging Technology Trends Survey* (500 US technology leaders, June–July 2025), states: "42% of organizations report they are still developing their agentic strategy road map, with 35% having no formal strategy at all" [Source](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/agentic-ai-strategy.html). The same numbers appear in Deloitte's Tech Trends 2026 main page [Source](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends.html).

**Caveat:** The number describes *organizational adoption strategy*, not *project-level roadmap practices*. Deloitte is saying enterprises lack a strategic plan for adopting agentic AI — it is not evidence that engineering teams using agents should drop project roadmaps. The methodology doc's use of this stat is technically accurate but contextually stretched.

### 1.7 Gartner — >40% of agentic AI projects canceled by 2027

**Verdict: ACCURATELY CITED.** Gartner press release dated June 25, 2025: "Over 40% of agentic AI projects will be canceled by the end of 2027, due to escalating costs, unclear business value or inadequate risk controls," attributed to Anushree Verma, Senior Director Analyst [Source](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027).

**Critical caveat the doc ignores:** Gartner's stated *causes* of failure are "escalating costs, unclear business value or inadequate risk controls" — not "rigid roadmaps" or "lack of spec-driven development." If anything, Gartner's prescription is the opposite of "iterate freely" — it's "cut through the hype to make careful, strategic decisions about where and how they apply this emerging technology." Citing this stat in service of a "specs > roadmaps" argument is a stretch; Gartner's actual recommendation leans toward more strategic discipline, not less sequencing.

---

## 2. Pressure-Testing the arXiv Three-Tier Mapping

The methodology doc claims `execution-plan.md` (a task checklist with exit criteria) maps to BriefingScript. **This mapping is inaccurate to the paper.**

According to the paper itself, a **BriefingScript** is "a structured document comprising sections like Goal & Why, What & Success Criteria (e.g., pre-conditions, invariants), All Needed Context (to prevent hallucination), **Implementation Blueprint**, and Validation Loop" [Source](https://www.themoonlight.io/en/review/agentic-software-engineering-foundational-pillars-and-a-research-roadmap). It is not just "what to achieve"; it explicitly includes an Implementation Blueprint and a Validation Loop.

A **LoopScript** is a "declarative language for defining Standard Operating Procedures (SOPs). It specifies task decomposition, parallelization (enabling N-version programming), workflow strategy (level of rigor), and evidence-based acceptance criteria for MRPs" [Source](https://www.themoonlight.io/en/review/agentic-software-engineering-foundational-pillars-and-a-research-roadmap). Task decomposition with exit criteria is squarely a LoopScript concern.

A **MentorScript** is a "structured, machine-readable rulebook defining principles (e.g., coding styles, architectural patterns)" [Source](https://medium.com/@huguosuo/agentic-software-engineering-foundational-pillars-and-a-research-roadmap-952410205d8e) — closer to AgentForge's CLAUDE.md, AGENTS.md, and the spine + specialists architectural constitution than to anything in `execution-plan.md`.

**Where this leaves the doc's mapping:**
- The doc maps `execution-plan.md` (task checklist + exit criteria) to BriefingScript. By the paper's own definitions, that artifact is closer to a **LoopScript** (SOP with task decomposition and acceptance criteria), with some BriefingScript elements (success criteria, validation loop) bleeding in. The doc has conflated tiers in a specific direction: it's pulled execution semantics up into the "what" tier.
- More fundamentally, the paper's BriefingScript *contains* an Implementation Blueprint. So the binary "BriefingScript = what / LoopScript = how" framing the doc relies on is the doc's own simplification, not the paper's claim. The paper sees blueprinting and validation as part of briefing.
- The doc's claim that the paper supports "specifications replace roadmaps" is also a stretch: the paper does not argue against sequenced delivery. It argues for *structured, version-controlled, machine-readable* artifacts at every layer (spec, SOP, mentorship, evidence packs). A phased roadmap with exit criteria is, in the paper's vocabulary, a LoopScript — not something the paper rejects.

The paper supports formalizing planning artifacts. It does not support eliminating sequenced execution plans.

---

## 3. Planning Models the Doc Ignores

### 3.1 Shape Up (Basecamp / Ryan Singer, 2019)

Shape Up is the most influential non-roadmap planning methodology of the last decade for small teams. Its core ingredients:

- **Appetite, not estimates.** Instead of "how long will this take," ask "how much is this worth?" Typical appetites are 2-week "small batch" or 6-week "big batch" cycles; nothing exceeds 6 weeks [Source](https://basecamp.com/shapeup/0.3-chapter-01).
- **Pitches.** A shaped pitch contains: problem, appetite, solution sketch (breadboards / fat-marker sketches), rabbit holes, and no-gos [Source](https://basecamp.com/shapeup).
- **Betting table.** A small group of senior people commits to specific projects for one cycle. **No backlog is maintained;** unselected pitches are discarded (individuals keep private notes) [Source](https://www.curiouslab.io/blog/what-is-basecamps-shape-up-method-a-complete-overview).
- **Hill charts.** Progress visualized on a "unknown → known → done" spectrum, replacing burn-down charts.
- **Circuit breaker.** Default is to *cancel* projects that don't ship in one cycle, not extend them [Source](https://www.process.st/shape-up-process/).
- **Hand over responsibility.** Small integrated teams discover and track their own tasks; no upfront decomposition by managers.

**How Shape Up reinforces the methodology doc's argument:**
- Shape Up explicitly rejects roadmaps with date estimates and rolling backlogs.
- The *pitch* artifact is conceptually adjacent to a Specification: problem-first, solution-as-rough-sketch, with explicit rabbit holes (think: out-of-scope) and no-gos.
- "Appetite" is closer to the methodology doc's "Capability Visions" than to roadmap phasing.
- Shape Up has been adapted for AI-augmented teams (e.g., Ferreira's "Shape Up AI Native") with the explicit framing that "the bottleneck shifts from coding to validation" when AI agents build code 10–100x faster — a near-identical premise to the doc's "iteration cost has dropped to near-zero" claim [Source](https://github.com/sergiolindolfoferreira/shape-up-ai-native).

**How Shape Up complicates the methodology doc's argument:**
- Shape Up *fixes* time and *varies* scope. It is not "no time-based sequencing"; it is *six-week sequencing with circuit breakers*. The doc's binary framing of "roadmaps (predict execution) vs. specifications (don't)" misses the entire middle ground that Shape Up occupies — appetite-bounded, sequenced bets without long-range commitment.
- Shape Up has hill charts, which are explicitly progress-tracking artifacts on shaped scopes. They look a lot like AgentForge's exit criteria.
- Shape Up requires shaping *before* betting — meaning a structured upfront artifact (the pitch) that includes solution sketch, rabbit holes, and no-gos. This is closer to specification than to objective-setting, but it is bounded by an appetite and committed to a cycle. That is a planning structure, not the absence of one.
- Shape Up explicitly rejects backlog accumulation. The methodology doc's "Capability Visions" sound similar but the doc's `future-roadmap.md` "Backlog" section with trigger conditions is closer to a bounded backlog than to Shape Up's discard-and-reshape pattern. Shape Up would push harder against accumulated future-state lists than the doc does.

For a solo developer, the most relevant Shape Up pattern is **the appetite + circuit breaker combination**: time-box to 1–6 weeks, ship or cancel, don't extend. The methodology doc's framework does not have this concept.

### 3.2 OKRs as a Separate Layer

OKRs (Objectives and Key Results) are commonly used as an *outcome-setting* layer that sits *above* sequenced work, not in opposition to it. A well-functioning OKR system has quarterly objectives with measurable key results — and underneath that, teams choose and sequence the work that will move those KRs. OKRs reinforce the doc's "Objectives" artifact type but explicitly assume that sequenced delivery sits beneath them. They do not justify removing the sequenced layer; they explain why the sequenced layer should be *outcome-anchored*.

### 3.3 Lean / Continuous Delivery / Discovery–Delivery

Lean and continuous delivery models (Reinertsen's *Principles of Product Development Flow*, Humble & Farley's *Continuous Delivery*, Cagan's discovery/delivery split) lean toward:
- Small batch sizes
- Pull-based work, not push-based
- WIP limits
- Decoupled discovery (specification) from delivery (execution)

These reinforce the spec-driven argument insofar as they decouple "what we're sure of" from "what we'll discover during build." They complicate it because they are explicitly *flow-based*, not *iteration-cost-zero*. Lean assumes there is still a meaningful cost to switching context and an asymmetric cost to large batches. If the methodology doc's premise "iteration cost has dropped to near-zero" were taken literally, batch size would be irrelevant — but in practice, agents still consume context, attention, review time, and (especially for AgentForge as a sole-dev project) human judgment.

### 3.4 Other Agentic-Era SDLC Models

- **EPAM's ADLC** (Agentic Development Lifecycle): six phases from intent specification through continuous learning. Explicitly retains phased structure; replaces *deterministic* assumptions, not *sequenced* ones [Source](https://www.epam.com/insights/ai/blogs/agentic-development-lifecycle-explained).
- **Codebridge's ADLC playbook**: same six-phase structure, with the "behavioral metrics replace KPIs" framing the methodology doc misattributed to PwC [Source](https://www.codebridge.tech/articles/agentic-ai-software-development-lifecycle-the-production-ready-playbook).
- **Esteban Abait's Four Modalities for Coding with Agents** (2026): identifies "Agentic Engineering" as the modality where teams "invest in context-engineering" with "documented architecture, documented design patterns, and best practices available for Agents." Explicitly notes "The chunk of work specified in the plan must be kept as small as possible so the size of the generated implementation is also acceptable for a human reviewer (as the 2025 DORA report shows)" [Source](https://dev.to/eabait/the-four-modalities-for-coding-with-agents-4cdf). This contradicts a strict "iteration cost is zero" reading: review cost, not generation cost, is the binding constraint.
- **Verified Spec-Driven Development (VSDD)** counter-critique: published critiques of pure VSDD note that "Deciding upfront which parts of the system will be a 'deterministic, side-effect-free core' requires understanding the full shape of the problem — which you won't have until you've partially built it" [Source](https://gist.github.com/dollspace-gay/d8d3bc3ecf4188df049d7a4726bb2a00). Spec-first approaches have known failure modes when the problem shape is genuinely uncertain.

### 3.5 The Spec-Driven Counter-Position

The strongest published counter-evidence to the methodology doc's central claim comes from spec-driven practitioners themselves:

- **Martin Fowler's review** of spec-kit and Kiro: explicit warnings that the workflow can feel "like overkill for the size of the problem" on small features, that agents both ignore and over-follow specs, and that "the term 'spec-driven development' isn't very well defined yet, and it's already semantically diffused" [Source](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html).
- **An arXiv survey on spec-driven development** is direct: "SDD may be overkill in certain situations. Throwaway prototypes don't justify spec investment that will be discarded. **Solo, short-lived projects may find the overhead exceeds benefits when there's only one developer and no long-term maintenance.** Exploratory coding suffers from premature specification that constrains learning when you don't yet know what you're building" [Source](https://arxiv.org/html/2602.00180v1). The methodology doc engages with none of these failure modes.

---

## 4. Honest Assessment of `future-roadmap.md`

### 4.1 Is it a "roadmap" by the methodology doc's own definition?

The methodology doc's stated objection is to artifacts that *predict execution*. By that definition, `future-roadmap.md` is a roadmap. It contains:

- **Time-implied sequencing** ("Merge each PR before starting the next phase")
- **Phase numbers** (0 through 8) with directional ordering
- **Per-phase exit criteria** (which is functionally the same as committing to what "done" looks like for a future state)
- **Prereq decisions and decision gates** (which predict that decisions will be made in a particular order)

The methodology doc's claim that this file is "an objectives document, keep as-is" is, on its own framing, indefensible. The user has already acknowledged this. The file is a roadmap.

### 4.2 But what *kind* of roadmap?

There is a meaningful distinction the methodology doc does not make: **time-based sequencing vs. dependency-based sequencing**.

- A **time-based roadmap** says: "Phase 3 in Q3, Phase 4 in Q4." This commits to dates and predicts execution velocity. This is what most agile critiques target.
- A **dependency-based roadmap** says: "You can't build the implementer (Phase 5) without the clarifier (Phase 1) producing specs to implement, and you can't run RAG over a corpus (Phase 2) without first migrating off the Python engine (Phase 0)." This commits to a *graph*, not a *calendar*.

`future-roadmap.md` is much closer to the second. The phase numbers encode a topological sort of the dependency graph. The exit criteria are functional ("Postgres checkpointer working," "Zod schemas adopted across artifacts"), not date-based.

This distinction matters. The agentic SDLC literature does not actually argue against dependency-ordered delivery:
- AWS AI-DLC's `unit-name-code-generation-plan.md` is a *dependency-ordered checklist* with checkboxes [Source](https://aws.amazon.com/blogs/devops/building-with-ai-dlc-using-amazon-q-developer/).
- GitHub Spec Kit's `tasks.md` provides "dependency management — tasks are ordered to respect dependencies between components (e.g., models before services, services before endpoints)" and "test-driven development structure — if tests are requested, test tasks are included and ordered to be written before implementation" [Source](https://github.com/github/spec-kit). Spec Kit explicitly calls this "a clear roadmap for the `/speckit.implement` command."
- The arXiv SASE paper's LoopScript explicitly "specifies task decomposition, parallelization… workflow strategy (level of rigor), and evidence-based acceptance criteria" [Source](https://www.themoonlight.io/en/review/agentic-software-engineering-foundational-pillars-and-a-research-roadmap).

In all three references the methodology doc cites, **dependency-ordered phased delivery is not opposed to spec-driven development; it is one of its outputs.** The doc's binary framing — "specifications replace roadmaps" — is not actually supported by the literature it cites. The literature is closer to: "specifications generate roadmaps, and the roadmaps are kept in sync with the specs."

### 4.3 What does `future-roadmap.md` provide that pure objectives + specifications would lose?

For a solo developer bootstrapping a partially-built framework, the phased structure provides three concrete things that are not trivial to recover from a flat set of specs:

1. **Dependency awareness at a glance.** "Phase 5 needs Phase 1's clarifier output" is a structural fact about AgentForge. Encoding it in numbered phases makes it visible without re-deriving it from spec cross-references each time.
2. **WIP discipline.** "Merge each PR before starting the next phase" is a working WIP=1 constraint. For a sole developer with limited context-switching budget, this is a real engineering control — it's the same logic Shape Up applies with circuit breakers and Spec Kit applies with phase checkpoints.
3. **Visible "what's next."** When the developer sits down on Monday, "I'm in Phase 3, Phase 4 is blocked on a decision gate" is faster-to-load than scanning all open specifications and inferring readiness.

A pure objectives + specifications model can recover (1) by linking, (2) by WIP rules, and (3) by dashboards — but for a solo dev, the phased file *is* the dashboard. The cost of decomposing it is real.

### 4.4 What is the practical risk of decomposing it?

By the methodology doc's own logic, the risks of *keeping* `future-roadmap.md` are:
- **Roadmap alignment debt:** if priorities shift, the phase order must be rewritten and re-justified.
- **Recursive inconsistency:** AgentForge's own agents don't produce roadmaps, so AgentForge's own development using a roadmap creates a methodology mismatch.
- **Over-commitment:** exit criteria written before the work is done can encode wrong success conditions.

By practitioner experience reports, the risks of *decomposing* it are:
- **Loss of dependency visibility:** dependencies must now be inferred from spec metadata, which agents and humans both miss.
- **Loss of WIP discipline:** without a sequenced phase, there's no obvious answer to "what should I be working on right now."
- **Spec proliferation overhead:** Fowler's documented experience that spec-kit on a 3–5 point feature "felt like overkill" applies a fortiori to spec-decomposing every roadmap item [Source](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html).
- **Bootstrapping fragility:** the arXiv survey on SDD explicitly flags solo, short-lived, and exploratory projects as poor fits for full SDD [Source](https://arxiv.org/html/2602.00180v1).

---

## 5. Trade-offs (Not a Recommendation)

### 5.1 Solo developer vs. team adoption

The cited research is overwhelmingly about teams:
- AWS AI-DLC's central rituals are "Mob Elaboration" and "Mob Construction" [Source](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/) — they require multiple humans.
- GitHub Spec Kit's spec-as-source-of-truth solves a *coordination* problem ("nobody can find the original reasoning… decisions buried in Slack threads" [Source](https://medium.com/quantumblack/agentic-workflows-for-software-development-dc8e64f4a79d)) that does not exist in the same form for a solo dev.
- The arXiv SASE paper's BriefingScript is explicitly framed as a contract between human Agent Coaches and agent teammates — a structured replacement for human-to-human handoffs.
- Deloitte's "42% developing strategy roadmap" and Gartner's "40% will fail" are organizational statistics about enterprise adoption.

For a solo developer, the *coordination* benefit of specs-as-contract degrades significantly. The remaining benefit — using specs to constrain the agent during implementation — is narrower than the doc claims and is something AgentForge already does at the per-task level (clarifier produces specs that the implementer consumes). That is *task-scoped* spec-driven development, not *project-scoped*.

### 5.2 Early-stage vs. mature framework

AgentForge's stated state: spine partially built, specialist agents are stubs, design pipeline most mature. This is a bootstrapping context. Bootstrapping has properties that mature systems do not:
- **Heavy dependency surface:** changes to the spine break specialists; changes to schemas break artifacts. A topological order is genuinely useful.
- **Working-system bias:** the user is correct that "letting a documentation methodology debate block a working pipeline improvement is exactly the kind of meta-work-over-real-work trap." Bootstrapping rewards getting components functional in dependency order.
- **Unknown unknowns:** SDD literature warns that premature specs can constrain learning when you don't know what you're building [Source](https://arxiv.org/html/2602.00180v1). A specialist agent that has never been built end-to-end will surface design questions only at integration time.

The doc's argument for spec-driven development is strongest when components are mature and the work is replacing/refactoring known behaviors. It is weakest when components are stubs and the work is filling them in for the first time.

### 5.3 Documentation methodology vs. actual planning

The methodology doc's argument has a self-defeat risk the user has already identified: if the dominant cost is "roadmap alignment debt," then the cost of debating planning methodology is itself a form of alignment debt. A stable, imperfect `future-roadmap.md` that the developer actually executes against has lower alignment debt than a theoretically pure objectives + specifications system that requires a methodology rewrite first. The McKinsey lesson "agents aren't always the answer; simpler approaches… can sometimes be more effective" generalizes: *methodologies aren't always the answer; simpler artifacts that the developer actually uses can sometimes be more effective* [Source](https://www.brianheger.com/one-year-of-agentic-ai-six-lessons-from-the-people-doing-the-work-quantum-black-ai-by-mckinsey/).

The flip side: deferring methodology debate indefinitely accumulates technical debt of a different kind, and the user has already noted that the dishonest framing of `future-roadmap.md` as "an objectives document" was a symptom of avoidance. Both directions have a real cost.

### 5.4 Recursive consistency: engineering principle vs. aesthetic

The user's framing is correct: recursive consistency / dogfooding is, on the face of it, an aesthetic preference. But there are two engineering arguments adjacent to it that are worth separating from the aesthetic:

**Engineering case *for* dogfooding:**
- *Defect discovery.* Using your own framework on its own development surfaces bugs and friction the framework's eventual users will encounter. This is the canonical Microsoft/UNIX dogfooding argument and it is genuinely engineering, not aesthetic.
- *Truthful documentation.* If AgentForge's docs say "use specifications, not roadmaps," but its own development uses a phased roadmap, that's an inconsistency a sophisticated reader will spot — and may interpret as the framework's authors not believing their own claims. This is a credibility cost, not an aesthetic one.
- *Capability gap detection.* If AgentForge can't produce roadmaps for its users' apps, but its developer needed one for AgentForge itself, that gap is data: either the framework is missing a capability users will also miss, or the user-facing pattern doesn't actually fit reality.

**Engineering case *against* dogfooding:**
- *Domain mismatch.* AgentForge generates *applications* (UX-driven, product-shaped). AgentForge itself is a *framework* (infrastructure-shaped). The two domains have different planning requirements: applications are pitch-shaped and shippable; frameworks have hard dependency graphs (you can't build a reviewer without an implementer to review). Forcing the same artifact set on both is a category error.
- *Premature constraint.* Locking AgentForge's own development into AgentForge's app-development methodology assumes the methodology is right. A solo developer building a framework is also a *researcher*, and researchers' planning artifacts (lab notebooks, dependency graphs, capability roadmaps) are legitimately different from product specs.
- *Empirical separation.* The `future-roadmap.md` is fitness-checked by whether the developer ships against it. If it's working, that's evidence — and "but the methodology says…" is a weaker signal than "the artifact predicts what gets done."

The engineering arguments cut both ways. The aesthetic argument (it's elegant) cuts only one way and is, as the user noted, not an argument.

### 5.5 What gets gained/lost in each direction

**If the user keeps `future-roadmap.md` as a phased roadmap:**
- *Concrete costs by the doc's logic:* roadmap alignment debt every time priorities shift; recursive inconsistency between framework's recommended pattern and its own use; risk of locking in exit criteria that turn out to be wrong.
- *Concrete preserved value:* dependency visibility, WIP discipline, single-glance "what's next," continuity with current working practice.

**If the user decomposes into objectives + specifications:**
- *Concrete losses by practitioner experience:* dependency information must be inferred from spec linkage; "what should I work on now" becomes a query, not a glance; spec-decomposition overhead documented as "overkill" for small/solo work [Source](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html); risk of premature specification on stub components [Source](https://arxiv.org/html/2602.00180v1).
- *Concrete gains by the doc's logic:* methodology consistency with framework's own recommended pattern; specs become directly usable as inputs to the clarifier (dogfooding the pipeline at planning-artifact level); reduced commitment to phase ordering that may turn out wrong.

**A middle option not framed by the doc:** keep `future-roadmap.md` as an explicit *dependency graph* (not a time-based roadmap), with each phase pointing to the specifications that define its scope. This is what Spec Kit's `tasks.md` and the arXiv paper's LoopScript actually look like in the real cited literature. It is neither pure objectives nor pure roadmap — it's a sequenced spec index. The methodology doc's binary framing precludes this option but the literature does not.

---

## 6. Other Things That Surfaced Worth Knowing

1. **The methodology doc's "iteration cost has dropped to near-zero" premise is contested.** Practitioners working with coding agents in 2026 consistently report that *generation* cost has dropped, but *review* cost has become the binding constraint. The 2025 DORA report (cited by Abait) explicitly recommends keeping work chunks small "so the size of the generated implementation is also acceptable for a human reviewer" [Source](https://dev.to/eabait/the-four-modalities-for-coding-with-agents-4cdf). If review is the bottleneck, then sequenced delivery with WIP limits matters *more*, not less, in agent-augmented work.

2. **Spec-driven development has a definitional problem.** Martin Fowler explicitly notes "the term 'spec-driven development' isn't very well defined yet, and it's already semantically diffused. I've even recently heard people use 'spec' basically as a synonym for 'detailed prompt'" [Source](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html). The methodology doc treats SDD as a settled concept; it isn't.

3. **AWS AI-DLC has already pivoted toward adaptive workflows that skip stages.** The methodology doc cites AI-DLC's bolts/units terminology as evidence of the shift, but AI-DLC's most recent open-source release (Adaptive Workflows) is explicitly about *not* forcing every project through the same sequence and dropping spec stages when the project doesn't need them [Source](https://aws.amazon.com/blogs/devops/open-sourcing-adaptive-workflows-for-ai-driven-development-life-cycle-ai-dlc/). If the methodology doc were updated for this, it would have to add an adaptivity dimension that "specs replace roadmaps" doesn't currently capture.

4. **Gartner's 40%-failure prescription is closer to "more discipline" than "less sequencing."** Gartner's quoted recommendation is "make careful, strategic decisions about where and how they apply this emerging technology" and "rethinking workflows with agentic AI from the ground up" [Source](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027). Citing this stat to support spec-driven, no-roadmap practice is a stretch.

5. **The PwC misattribution matters because the "behavioral metrics replace KPIs" claim is genuinely interesting and is supported by other sources** (EPAM, Codebridge). If the doc moves the citation to the right source, the claim survives. If not, it weakens the doc's evidence base.

6. **The Shape Up gap is the most consequential missing model.** It is the closest thing to a published, battle-tested methodology for small teams shipping in agent-friendly cycles, and it sits in the middle ground between "phased roadmap" and "pure specs" that the methodology doc's binary framing erases. Adopting Shape Up's appetite + circuit breaker pattern would address the doc's "predict execution" objection while preserving sequencing — a synthesis the doc doesn't consider.

7. **Deloitte's 42% / 35% statistic is about organizational adoption strategy, not project planning practice.** The doc's framing implies enterprises lacking a roadmap are vindicated by the data; the data says the opposite — they lack a *strategy* and Deloitte presents this as a problem to solve, not a virtue. The stat undercuts rather than supports the doc's argument when read in context.