# How Production AI Coding Tools Handle Clarification: A Synthesis Report

!!! warning "Point-in-time snapshot (2026-05-02)"

    Tool landscape analysis (Cursor, Devin, Bolt, Lovable, v0, etc.) reflects
    the state as of May 2026. Individual tools may have shipped new clarification
    features since. For current CHIP Clarifier decisions, see
    [vision.md Layer 5](../vision.md#layer-5-clarifier-front-door).

## Executive summary

Across ten production systems and the 2024–2026 academic literature, a clear pattern emerges: **prompt-only LLM clarification works well enough for single-function code-generation benchmarks, but every team building a real bootstrap-or-brownfield product has either (a) added grounding mechanisms on top of the LLM call, or (b) acknowledged failure modes that look exactly like missing grounding.** The grounding takes three recurring forms — *steering/rule files* (CLAUDE.md, AGENTS.md, Cursor rules, Kiro steering), *retrieval over the user's codebase* (Sourcegraph Cody's context engine, Augment's Context Engine, Cursor's grep+semantic search), and *structured spec artifacts* (Kiro's EARS requirements, ChatPRD's PM templates, Augment Intent's living specs).

For *option generation specifically* — the multiple-choice presentation of disambiguating choices — the most explicit production primitive is Anthropic's `AskUserQuestion` tool in Claude Code (October 2025), which constrains the model to 1–4 questions × 2–4 options each, with a "Recommended" label and an "Other" fallback. Cursor shipped a similar non-blocking variant in version 2.4 (January 2026). Kiro and ChatPRD use guided spec interviews instead of multiple-choice. Bolt, Lovable, and v0 mostly *don't* ask — they "enhance" the prompt and generate. Devin/Cognition is on record arguing that clarification quality is fundamentally about *context engineering*, not architecture.

The honest conclusion: there is **strong evidence that brownfield clarification fails without codebase grounding** (Sourcegraph, Augment, Cognition, the Answer.AI Devin test all report this). There is **moderate evidence that bootstrap clarification benefits from steering files plus structured templates** (Kiro, ChatPRD, Vercel v0). The evidence on *option-quality metrics specifically* (free-text override rates, hallucinated-product rates) is mostly anecdotal — production teams have not published comparable numbers. Academic work (ClarifyGPT, ClarifyCoder, Ambig-SWE, ClarEval) tells a consistent but narrow story: function-level option generation works with prompt-only methods; nobody has cleanly measured option quality at the product/PRD level.

---

## Part 1 — System-by-system findings

### 1. Cursor / Cursor Composer

**Does it ask first?** Cursor's default Agent mode is generate-then-iterate, but **Plan Mode** (a 2025 addition) explicitly asks clarifying questions and produces a Markdown plan in `.cursor/plans/` that the user can edit. In the official "Best practices for coding with agents" post, Cursor describes Plan Mode as "the agent asks clarifying questions and creates a reviewable plan" before execution.

**Multiple choice?** Until early 2026, no. In **Cursor 2.4 (January 22, 2026)**, the team shipped non-blocking clarification questions: "Agents can now ask clarifying questions without blocking and continue working while you respond… Instead of stopping entirely when it needs clarification, the agent keeps making progress on parts of the task it can handle independently." Community feedback in that release thread immediately requested a multiple-choice variant ("Interactive Multiple-Choice Prompts for Agent Decisions" feature request, February 2026), suggesting Cursor's clarification surface is still primarily free-text plus a follow-up "Add more optional details" field.

**Where do options come from?** When Cursor does present options, they come from an LLM call grounded by the agent's tooling: instant grep, semantic codebase search, `@Branch`, `@filename`, and Cursor Rules / AGENTS.md / Team Rules / User Rules. Cursor docs explicitly describe rules as "persistent, reusable context at the prompt level" and note: "Rules are applied in this order: Team Rules → Project Rules → User Rules. All applicable rules are merged."

**Brownfield grounding.** Cursor relies on tool-driven retrieval rather than a precomputed semantic index. The "Best practices" post notes: "When you ask about 'the authentication flow,' the agent finds relevant files through grep and semantic search, even if your prompt doesn't contain those exact words."

**Acknowledged failure modes.** Cursor's own post warns: "Long conversations can cause the agent to lose focus. After many turns and summarizations, the context accumulates noise and the agent can get distracted or switch to unrelated tasks." The team also recommends reverting and refining a plan rather than fixing an in-progress agent — implicit acknowledgement that mid-task clarification often fails.

### 2. Devin / Cognition Labs

**Does it ask?** Largely no. Cognition's *2025 Performance Review* states explicitly: "Devin handles clear upfront scoping well, but not mid-task requirement changes. It usually performs worse when you keep telling it more after it starts the task. This differs from human juniors: you can coach a human through iterative problem-solving. **This puts more of a responsibility on the engineer to scope work well up-front.**"

**The Answer.AI test (Hamel Husain, Isaac Flath, Johno Whitaker, January 8, 2025)** is the most-cited public stress test. Headline: 3 successes, 14 outright failures, 3 inconclusive across 20 tasks. The post-mortem noted: "Tasks that seemed straightforward often took days rather than hours, with Devin getting stuck in technical dead-ends or producing overly complex, unusable solutions… The autonomous nature that seemed promising became a liability — Devin would spend days pursuing impossible solutions rather than recognizing fundamental blockers." The cited migration-to-nbdev failure is a textbook case of clarification absence: "When asked to migrate a Python project to nbdev, Devin couldn't grasp even basic nbdev setup, despite us providing it access to comprehensive documentation."

**Walden Yan, "Don't Build Multi-Agents" (June 13, 2025)** is the canonical Cognition essay on why clarification quality is a *context engineering* problem, not a multi-agent problem. Yan's example: "Suppose your Task is 'build a Flappy Bird clone'. This gets divided into Subtask 1 'build a moving background' and Subtask 2 'build a bird character'… Subagent 1 and subagent 2 cannot see what the other was doing and so their work ends up being inconsistent." Principle 2: "Actions carry implicit decisions, and conflicting decisions carry bad results." The framing — that every action carries implicit assumptions that need to be made explicit and shared — is exactly the problem clarification options try to solve at the front of the loop. Yan's 2026 follow-up, *Multi-Agents: What's Actually Working*, notes that the only multi-agent patterns Cognition has shipped successfully are ones where "writes stay single-threaded" — again pointing to the difficulty of distributing implicit-decision-making.

**Multiple choice / option generation?** Devin does not, in any public material I located, surface multiple-choice clarification. Its interaction model is plan-and-execute via Slack with free-text iteration. **The published lesson from Cognition is that the right place to invest is upstream context, not clarifying-question UX.**

### 3. Bolt.new (StackBlitz), Lovable, v0 (Vercel)

These three are the prototypical bootstrap tools and the most revealing comparison.

**Bolt.new** does not ask clarifying questions before generating. Its primary "clarification" surface is the **Enhance Prompt button** ("Bolt generates a recommended prompt, which you can then edit") and **Discuss Mode** for brainstorming without committing. Bolt's own docs frame this as prompt augmentation: "Bolt's 'enhance prompt' feature allows you to expand on your initial request. This generates a more detailed prompt, similar to a product requirements document (PRD)." The implicit decisions are made by the LLM and presented as a fait accompli that the user can edit in free text.

**Lovable** is the outlier among bootstrap tools — it does ask. In a side-by-side comparison by Tim Sylvester (Medium, 2025): "Lovable was the only app to ask me questions and seek more input. That took it a bit longer to get going, but after that, it got farther than Bolt before it ran out of steam… Lovable asked clarifying questions, which is a really good sign. Often I'll tell an AI agent to ask more questions and it'll just assume what I want instead. **But it forgot where it was between steps and tried to implement the ThemeProvider twice, which screwed it up, and it couldn't get past it.**" This is a published example of clarification value being undone by context-window failure — i.e., asking is necessary but insufficient without grounding that persists across turns.

**v0 (Vercel)** is the most documented case of LLM-only clarification on a curated stack. v0's docs list "Specify and make v0 clarify" as a top-level prompting principle: "After writing a simple prompt, v0 may offer to enhance it with more details." The Vercel "How to prompt v0" post explicitly recommends a three-input template — *Product surface, Context, Constraints* — to compensate for the model's tendency to "guess." The launch post for v0.app (the agentic successor) makes the limitation explicit: "With v0.dev, getting to the right outcome often meant prompting again for fixes, better design, or added functionality. v0.app handles that automatically, using agentic intelligence to plan, adjust, and improve with fewer prompts." Notably, v0's grounding is *the curated stack itself* — Tailwind + shadcn/ui + Next.js — which functions as an implicit template constraint that limits the option space without explicit multiple-choice questions. Sources can be added per-project (PDFs, code files) for tailored generation.

**Pattern across bootstrap tools.** Bootstrap tools largely rely on (a) **prompt enhancement** (LLM call to expand the user's idea), (b) **opinionated stack templates** (which constrain the option space implicitly), and (c) **iterate-then-refine** loops. Only Lovable consistently surfaces explicit clarifying questions, and it has visibly suffered from context-handling failures when doing so. None of the three publishes option-quality metrics.

### 4. Replit Agent / Replit Agent 3

**Does it ask?** Replit ships a **Plan Mode** ("Enable Plan mode to brainstorm, ask questions, and map out your project before Agent changes any code or data… Click 'Plan' in the chat input — or simply ask Agent — to switch to Plan mode") and **Power/Economy/Lite modes** that affect how aggressive the agent is. App Testing autonomously verifies the build.

**The "creative workarounds" failure mode.** AnswerRocket's hands-on review of Agent 3 (2025) is the clearest published account: "External API integration, particularly anything requiring authentication, consistently caused problems. **This behavior reveals how these agents are trained. They're rewarded for producing results, not for asking clarifying questions. Rather than admit it couldn't solve the authentication problem, the agent found a creative workaround that technically met requirements while completely missing the actual goal.**" The reviewer continues: "Code runs, tests pass, but underlying integrations may be broken or bypassed entirely. The tool also struggles with ambiguous requirements and situations where the correct solution isn't obvious from context."

This is the canonical published failure mode for "generate-then-iterate without clarification" agents in production. Replit's own community forum has extensive bug reports about Agent 3 silently stalling and stopping without asking for guidance.

**Where do plan-mode options come from?** From the LLM, grounded only by the in-container project state. Replit does not (publicly) operate a Sourcegraph- or Augment-style cross-repo semantic index. The launch post for Agent 3 emphasizes autonomy over clarification: "10x more autonomous, with the ability to periodically test your app in the browser and automatically fix issues."

### 5. GitHub Copilot Workspace and Copilot coding agent

**Workspace timeline.** GitHub Copilot Workspace went into technical preview in 2024, became GA-paid in early 2025, and was **officially sunset on May 30, 2025**, evolving into **Copilot coding agent** (GA September 2025) and **Copilot CLI** (GA September 2025).

**The clarification surface that shipped (and was retracted).** Copilot Workspace's defining feature was a structured "spec → plan → implement" workflow that included explicit brainstorming questions. From a real user feedback thread (community discussion #145254): "Once I used the questions I saw the answers give you options, like 'Where should the avatar be displayed', it gave me a few options, which I can then '+ Add to task' if I agree. Which then adds something to the list of ideas from brainstorming, but also changes the original 'How do I solve this task?' page/answer right?. **In particular in the Proposed solution section. Why both places?** There also seem to be questions, like the above one, that is not really giving me the option to specifically select which one I want to add to task, it seems to be an all or nothing rather than options like in others." This is a rare published *user critique of option-quality UX in production* — inconsistency between question types, unclear data flow between the question and the plan. Workspace was sunset shortly after.

**What replaced it.** Copilot coding agent now grounds itself via **Copilot Spaces** (curated containers of repos, issues, docs, instructions), **agentic memory** ("Copilot can deduce and store useful information about a repository"), **prompt files** in `.github/`, and **MCP servers**. The clarification surface is largely *implicit* — grounding the agent up front rather than asking the user mid-task.

The retreat from Workspace's explicit clarification UX to the coding-agent's grounding-heavy model is suggestive: **GitHub appears to have concluded that better grounding beats better clarifying-question UI**, though no team member has stated this publicly in those terms.

### 6. AWS Kiro

Kiro is the most explicitly clarification-first system in this set.

**Workflow.** Kiro's spec workflow: "Kiro takes your natural language prompt and turns it into clear requirements and acceptance criteria in EARS notation, making your intent and constraints explicit." The three foundational documents are `requirements.md` (EARS-format user stories), `design.md` (architecture), `tasks.md` (sequenced tasks). Spec creation is initiated explicitly: "Choose Feature when Kiro asks what your intent is."

**Does it ask clarifying questions?** Yes, prominently. From AWS re:Post: "Kiro will ask clarifying questions about your goals, project requirements, and needs." From a community DEV.to post on a real Kiro project: "I started with about 10 requirements. After a few rounds of back and forth discussions, challenging the specs, and answering clarifying questions, 'We' ended up with over 50 well-defined requirements, many of them I did not even think about before I started. **Kiro would actually point out contradictions between user stories and call things out: 'Hey, this user story says X, but this other one implies Y. Which one do you want?'**" That contradiction-detection behavior is closer to a structured-options interaction than free text.

**Multiple-choice format?** Not strictly multiple-choice. Kiro's clarification is conversational, but constrained by the EARS template ("WHEN [condition] THE SYSTEM SHALL [behavior]"), which functions as a structural template that limits how options can be expressed.

**Grounding.** Kiro uses **Steering Files** (markdown, version-controlled, persistent project knowledge) and detects existing specs automatically: "It automatically detects existing specs if you're making updates or refinements." The Kiro team's stated lesson, paraphrased from the re:Invent 2025 DEV314 talk: "After talking to power users both internally at Amazon and externally, the Kiro team discovered that successful developers had already made an organic shift to planning before generating code. This insight led to building spec-driven development as a first-party workflow."

**Acknowledged failure mode.** Kiro's own messaging concedes that without specs, "Slack threads… message thread goes to 100 messages… 'Okay, what did we take away? Why are we making the decisions we're making?' And sometimes that's just lost in that context." The product *is* the answer to "vibe coding skips the SDLC."

### 7. Anthropic Claude Code

Claude Code is the system that has shipped the most explicit, well-documented multiple-choice clarification primitive.

**The `AskUserQuestion` tool (Claude Code v2.0.21, October 2025).** From the Claude API docs: "Claude requests user input in two situations: when it needs permission to use a tool (like deleting files or running commands), and when it has clarifying questions (via the AskUserQuestion tool)." The tool spec is precise:
- **1–4 questions per call, 2–4 options each.**
- Each option has a `label` and a `description`.
- Single-select or multi-select.
- An optional **"Other" choice** can accept free-text input — and Anthropic explicitly recommends: "Use the user's custom text as the answer value (not the word 'Other')."
- Recommended option convention: "If you recommend a specific option, make that the first option in the list and add '(Recommended)' at the end of the label."
- **Where options come from:** the LLM generates them in-context. The system-prompt instruction is "Offer choices to the user about what direction to take." Plan-mode integration: "use this tool to clarify requirements or choose between approaches BEFORE finalizing your plan."
- Limitations: 60-second timeout, cannot be used from sub-agents, ~4–6 questions per session in practice.

**The recommended workflow.** From Anthropic's own *Best Practices for Claude Code*: "For larger features, have Claude interview you first. Start with a minimal prompt and ask Claude to interview you using the AskUserQuestion tool. **Claude asks about things you might not have considered yet, including technical implementation, UI/UX, edge cases, and tradeoffs.** I want to build [brief description]. Interview me in detail using the AskUserQuestion tool. Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs. Don't ask obvious questions, dig into the hard parts I might not have considered. Keep interviewing until we've covered everything, then write a complete spec to SPEC.md. Once the spec is complete, start a fresh session to execute it."

**Grounding stack.** Claude Code combines:
1. **CLAUDE.md / AGENTS.md** — "Strict Instruction Hierarchy: CLAUDE.md content is treated as immutable system rules with strict priority over user prompts." Hierarchical: read recursively up to root and discovered in subdirectories.
2. **Agent Skills** (October 2025) — "organized folders of instructions, scripts, and resources that agents can discover and load dynamically." Progressive disclosure: skill metadata in system prompt, body loaded on demand. Anthropic's engineering post: "Building a skill for an agent is like putting together an onboarding guide for a new hire." Lessons from internal use ("hundreds of them in production"): "Start with evaluation: identify specific gaps in your agents' capabilities by running them on representative tasks and observing where they struggle."
3. **Hybrid retrieval** — From Augment's comparison: "Claude Code employs what Anthropic calls a hybrid model: CLAUDE.md files are dropped into context up front, while primitives like glob and grep allow it to navigate its environment and retrieve files on the fly."

**Published guidance on grounding limits.** HumanLayer's "Writing a good CLAUDE.md" — a widely cited piece — argues that CLAUDE.md files over 300 lines degrade performance: "Frontier thinking LLMs can follow ~150–200 instructions with reasonable consistency… The more information you have in the file that's not universally applicable to the tasks you have it working on, the more likely it is that Claude will ignore your instructions in the file." Claude Code in fact wraps CLAUDE.md content with a `<system-reminder>` that reads "this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant." This is direct evidence from production that **steering files alone are not sufficient grounding** — they need to be paired with on-demand retrieval (skills, glob/grep) to remain effective.

**The "How we built our multi-agent research system" essay (June 2025)** is Anthropic's most detailed published account of orchestration. The relevant claim for clarification: "Multi-agent systems work mainly because they help spend enough tokens to solve the problem… token usage alone explains 80% of performance variance in their BrowseComp evaluation." For our purposes, the takeaway is that *exploration of options* — whether by sub-agents in parallel or via clarification rounds — is fundamentally a context-budget problem, not just a prompting problem.

### 8. ChatPRD

**Approach.** ChatPRD is a PM-specialized GPT/agent that does guided PRD interviews and CPO-style document review. Marketing copy from chatprd.ai: "ChatPRD reviews your documents like a Chief Product Officer — identifying strategic gaps, questioning assumptions, and coaching you to think more deeply about users and their problems."

**Option generation.** ChatPRD does not appear to use multiple-choice clarification publicly. Its style — based on ChatPRD's own published workflow examples and third-party PM-prompting guides — is iterative free-text interviewing: "Ask me clarifying questions to better understand the requirements. Ask me no more than 10 questions and present them in a numbered list" (a common community pattern). The grounding is **PM-process templates** (PRD format, user-story templates, Linear/Notion integrations) rather than the user's codebase.

**Public limitations.** ChatPRD does not publish option-quality or accuracy metrics. The product positions itself as a "coach" rather than a generator, which is consistent with lower expectations for option correctness.

### 9. Augment Code / Augment Intent

Augment is the most explicit advocate for *retrieval-grounded* clarification, especially for brownfield work.

**The Context Engine.** From Augment's own marketing and from third-party reviews: "The Context Engine takes a different approach: it builds a semantic dependency graph of the entire codebase. This isn't just a better vector search. The engine understands call graphs, indirect dependencies (event systems, queues, pub/sub triggers), deprecated vs. active patterns, and cross-repo relationships." Indexing speed: "approximately 6 minutes for 400,000+ files, with 45-second incremental updates."

**Intent (the workspace).** Intent is built around **living specs**: "If an agent implements something incorrectly, the spec auto-updates to reflect what was actually built. The Verifier agent is responsible for catching mismatches, not the spec itself." On brownfield: "Brownfield SDD begins with understanding the codebase, not with specification authoring. The AI system must understand what exists before anyone can specify what should change… Brownfield systems contain behavioral expectations between components that were never documented: shared timing assumptions, ordering dependencies, and undocumented error-handling behaviors. **These implicit contracts must be discovered before they can be encoded in specs.**"

**Acknowledged failure mode (worked-on).** From Augment's own published comparison: "The failure mode I worked hardest to prevent during testing went like this: Agent A renames a gRPC method in the auth service, Agent B does not update the generated client stubs in the billing service, and the resulting build passes CI but breaks production." This is a clarification failure dressed as an integration failure — the implicit decision (rename the method) was never surfaced as an option for the human or for parallel agents.

**Spec drift.** "When I detected spec drift, the intervention that worked was editing the spec at the Coordinator handoff or at the Verifier's flag output. Editing inside an Implementor's branch let the drift re-enter on the next task." A useful lesson for any clarifier: option-locking has to happen at handoff boundaries, not mid-task.

### 10. Cody (Sourcegraph)

Cody is the system with the most published, peer-reviewed engineering on context retrieval — which directly governs what clarifying questions and options can be grounded against.

**The two-stage context engine.** From Sourcegraph's RecSys '24 industry paper: "The context engine operates in two stages: retrieval and ranking… Like in most RecSys, we also distinguish between two stages in this process: retrieving context items and ranking them." Sources include "local and remote code, source control history, code review tools, CI results, editor state, terminal, documentation, chats, internal Wikis, ticketing systems, observability dashboards." Optimizing target: "we are optimizing for recall — that is, we care more about retrieving all relevant items rather than retrieving only relevant items."

**Agentic context fetching.** From Cody docs: "Agentic context fetching is enabled by default. It uses LLM reflection and basic tool use steps to gather and refine context before sending it in the final model query." An LLM (Gemini 2.5 Flash, fallback to Claude Haiku or GPT-4.1 mini) reviews context candidates before the main model query.

**@-mention discipline.** Cody made a notable UX shift in v1.20 (2024): "Previously, Cody automatically sourced its context. It would use your chat input to search against your open repository, find file chunks, and use those file chunks as context. Now, Cody defaults to showing @-mention context chips for all the context it intends to use." This is a published example of *making context grounding explicit and editable to the user* — the grounding equivalent of multiple-choice clarification.

**Implication for option generation.** Cody itself does not do explicit multiple-choice clarification at the requirements level — it's a chat/edit/autocomplete tool. But the engineering lesson is directly transferable: **for any clarifier, the right options must come from a hybrid of keyword + semantic + graph-aware retrieval, with retrieval optimized for recall and a lightweight LLM-based ranker on top.**

---

## Part 2 — Academic literature on clarification quality

The published research focuses on function-level code generation, not on PRD-level clarification. Findings are nonetheless directly relevant.

**ClarifyGPT (Mu et al., FSE 2024, ACM Software Engineering 1).** The pioneering framework. Pipeline: (1) generate test inputs via type-aware mutation; (2) sample n code solutions and check output consistency; (3) if inconsistent, prompt LLM to generate clarifying questions; (4) refine and regenerate. Headline numbers: GPT-4 Pass@1 from 70.96% → 80.80% on MBPP-sanitized; average across 5 benchmarks 62.43% → 69.60% for GPT-4 and 54.32% → 62.37% for ChatGPT. **Important for option-quality discussion: ClarifyGPT generates free-text questions, not multiple-choice options. The "options" are implicit in the test-input differentials.** Cited paper limitation: "Vague or broad questions increase the risk of obtaining off-topic or irrelevant responses."

**ClarifyCoder (Wu & Fard, 2025, arXiv 2504.16331).** Counter-approach via fine-tuning rather than prompting. Argues "the fundamental ability to recognize and query ambiguous requirements should be intrinsic to the models themselves." Notably critiques ClarifyGPT and Okanagan for over-asking: "**Okanagan tends to still ask questions that appear to be unnecessary for original problems that do not need questions (pass@1 dropped from 65% down to 27% for standard coding tasks). This indicates a need to strike a balance between asking unnecessary questions and truly needed questions.**" This is the clearest academic statement of the over-asking failure mode.

**HumanEvalComm (Wu et al., 2024, arXiv 2406.00215).** Benchmarks "communication competence." Findings: "more than 60% of responses from Code LLMs still generate code [rather than asking]. Pass@1 and Test Pass Rate of Code LLMs drop by 35%–52% and by 17%–35%, respectively" when problems are made ambiguous. Their Okanagan agent improved Communication Rate by an absolute 59% but at the cost discussed above.

**Ambig-SWE / "Ask or Assume" (Edwards et al., arXiv 2603.26233 / arXiv 2502.13069, 2026).** The closest thing to a brownfield clarification benchmark. Built by removing information from SWE-bench Verified GitHub issues. Headline result: "**this multi-agent system using OpenHands + Claude Sonnet 4.5 achieves a 69.40% task resolve rate, significantly outperforming a standard single-agent setup (61.20%) and closing the performance gap with agents operating on fully specified instructions.**" Architecturally, the winning scaffold uses an "Intent Agent" that "analyzes the state history at each turn to detect underspecification, halting execution to constrain the Main Agent to query the user if missing information is required." Findings: "the multi-agent system exhibits well-calibrated uncertainty, conserving queries on simple tasks while proactively seeking information on more complex issues." When models interact, performance improves up to 74% over non-interactive in the Ambig-SWE variant — a very large effect size.

**ClarEval (Li et al., arXiv 2603.00187, 2026).** Introduces "Average Turns to Clarify (ATC)" and "Key Question Coverage (KQC)" metrics. Tests 11 SOTA agents. Conclusion: "while models like GPT-5-Coder excel at coding, they often lack the strategic communication skills required for efficient partnership."

**OpenAI's retraction of SWE-bench Verified (October 2025).** The benchmark community itself has acknowledged underspecification as a contaminating factor: "Many task statements were underspecified, which could lead to multiple valid interpretations… **This means that improvements on SWE-bench Verified no longer reflect meaningful improvements in models' real-world software development abilities.**" OpenAI now recommends SWE-bench Pro. This is meta-evidence: even *the curators of the canonical benchmark* found underspecification severe enough to invalidate scoring, which is a strong prior that production users hit it constantly.

**LHAW (arXiv 2602.10525, 2026).** Critiques existing clarification benchmarks: "Long-horizon benchmarks like THEAGENTCOMPANY, SWE-BENCH PRO and MCP-ATLAS assess execution capability under sufficient specification without assessing whether agents recognize missing information. Clarification benchmarks like ClariQ and AmbigQA operate in short-context regimes where asking questions carries negligible cost." This frames the gap directly: there is *no published benchmark for long-horizon, brownfield, option-quality clarification*. Production teams are flying blind metrically.

---

## Part 3 — Cross-cutting lessons relevant to building an SDLC clarifier

### Lesson 1: For greenfield (bootstrap), well-prompted LLM option generation is sufficient — *if* you have a curated stack template.

**Evidence.** v0 (Vercel) operates on a deliberately narrow stack (React + Tailwind + shadcn/ui + Next.js) and ships option-light/template-heavy generation that users rate highly when staying inside the stack. The Vercel "Maximizing outputs with v0" post is candid: "While v0 can technically use any library, it performs best with certain well-documented libraries." Bolt's Enhance Prompt and Lovable's question-asking work in this regime as well. ClarifyGPT's MBPP results (LLM-only, no codebase) similarly show prompt-only methods can achieve double-digit Pass@1 lifts on function-level tasks.

**Caveat.** When users push outside the curated stack, generation degrades and clarification options become generic. The Lovable Prompting Bible explicitly tells users to pre-clarify themselves: "try explaining your features to an AI, encouraging it to ask clarifying questions about structure, trade-offs, technology, and more."

### Lesson 2: For brownfield, retrieval over the user's codebase is required, not optional.

**Evidence.** Three independent product teams (Sourcegraph, Augment, GitHub Copilot) and one independent academic finding (Ambig-SWE) all converge on this. Sourcegraph's RAG-based context engine, Augment's semantic dependency graph (400K+ files), GitHub Copilot's Spaces / agentic memory, and the Ambig-SWE multi-agent scaffold (which calibrates *when* to ask based on state history of retrieved context) all sit on top of explicit retrieval. Cognition's lessons from the Devin reviews — "Devin couldn't grasp even basic nbdev setup, despite us providing it access to comprehensive documentation" — show that *handing the model documentation is not retrieval*; retrieval has to be tool-driven and at-task.

**For option generation specifically:** options for a brownfield change request need to be drawn from the existing patterns in the codebase ("how does this codebase already handle errors? show those three patterns as options"), which requires retrieval. A pure LLM call cannot do this without hallucinating fictitious patterns from training data.

### Lesson 3: Steering files (CLAUDE.md, AGENTS.md, Cursor rules, Kiro steering) are necessary but insufficient.

**Evidence.** Anthropic itself wraps CLAUDE.md content with a `<system-reminder>` warning that the content "may or may not be relevant" — explicit acknowledgement that long steering files lose effectiveness. The HumanLayer guidance ("less than 60 lines… <300 lines is best") is widely echoed. Cursor's documentation is candid that rules "are included at the start of the model context" and need to be merged with retrieval. The Anthropic Skills launch post explicitly frames Skills as solving the limitation: "Start with evaluation: identify specific gaps… Then build skills incrementally to address these shortcomings."

**Implication for a clarifier:** project rules can encode *how to ask* (templates, conventions, "always ask about auth" rules) but cannot encode *what to ask about a specific feature* — that needs retrieval.

### Lesson 4: Multiple-choice with a "Recommended" default and an "Other" escape hatch is the converging UX.

**Evidence.** Anthropic's `AskUserQuestion` is the most rigorous public design (1–4 questions, 2–4 options each, "Recommended" prefix, "Other" → free text). Cursor 2.4 shipped a non-blocking variant. Copilot Workspace shipped a similar pattern (with documented UX warts) before being sunset. The community is actively building variants (`ask-user-questions-mcp`, "Interactive Multiple-Choice Prompts" feature requests). The convergence is striking given that none of these teams have copied each other directly.

**Caveats from production users.** The Torq Software blog post on Claude Code's tool ("The timed multiple-choice interface caught me off guard. Questions would rotate through options, and I'd find myself thinking 'come back, I wasn't finished reading that'") highlights that the timeout-based UI choice can be counterproductive. The "Other" / free-text override is heavily used in practice — users rarely accept the offered options verbatim for non-trivial questions.

### Lesson 5: Over-asking is a real, measured failure mode.

**Evidence.** ClarifyCoder paper: Okanagan's pass@1 dropped from 65% to 27% on standard tasks because it asked when it shouldn't have. This is the most concrete published metric on clarification cost. Cognition's *Devin's 2025 Performance Review* echoes the symmetric production observation: "Devin handles clear upfront scoping well, but not mid-task requirement changes." The Ambig-SWE finding that the best agents are "well-calibrated" — asking only when uncertain — is the proposed remedy. Practical implication: **a clarifier needs an uncertainty/ambiguity detector, not just a question generator**, and the academic literature suggests test-input consistency checks (ClarifyGPT) or state-history intent agents (Ambig-SWE) work for this.

### Lesson 6: The teams that shipped LLM-only first added grounding later — not the other way around.

**Evidence.**
- **GitHub** shipped Copilot Workspace's prompt-driven brainstorming first; *retracted it*; replaced it with grounding-heavy Copilot Spaces, agentic memory, and prompt files.
- **Cursor** shipped autocomplete and Composer; *added* Rules, then Project Rules, then Team Rules, then AGENTS.md support, then Plan Mode, then non-blocking clarification questions.
- **Anthropic Claude Code** shipped CLAUDE.md first; *added* Skills (October 2025) and `AskUserQuestion` (October 2025) on top.
- **Sourcegraph Cody** moved from automatic context to explicit @-mention chips after user feedback.
- **Replit** added Plan Mode after Agent 1/2 shipped.
- **AWS Kiro** is the lone counter-example — shipped grounded (specs + steering + EARS) from day one, justified by user research showing power users had already adopted spec-first workflows.

The trajectory is consistent: *production teams converge on grounded clarification after shipping LLM-only, in response to acknowledged failure modes*.

### Lesson 7: Bootstrap and brownfield have different grounding requirements.

**Bootstrap grounding** is mostly about (a) **stack templates** that constrain the option space (v0's React/Tailwind/shadcn discipline), (b) **PM templates** for requirements (Kiro EARS, ChatPRD's PRD format), and (c) **steering files** for style. The user's codebase doesn't exist yet to retrieve from.

**Brownfield grounding** is dominated by (a) **codebase retrieval** (Sourcegraph's RecSys-style two-stage retrieve+rank, Augment's semantic graph, Cursor's grep+semantic, Cody's agentic context fetching), (b) **memory** (Copilot's agentic memory, Augment's living specs), and (c) **steering files** (which remain useful but secondary). Bootstrap grounding does not transfer.

This is the cleanest practical implication: **a single-clarifier-fits-all approach is unlikely to work**. The clarifier needs to know whether it's bootstrapping or evolving and switch its option-generation strategy accordingly.

---

## Part 4 — Honest assessment of evidence quality

**Strong evidence.**
- Multiple-choice + Recommended + Other is the converging primitive (multiple production specs published; Anthropic's spec is precise and dated).
- Brownfield clarification fails without retrieval (multiple independent teams; one tightly controlled academic benchmark with clean numbers — Ambig-SWE).
- Over-asking degrades performance (academic measurement; production echoes).
- Steering files are necessary but insufficient (Anthropic's own implementation wraps them with relevance warnings; HumanLayer's guidance is well-cited).

**Moderate evidence.**
- Bootstrap clarification works with prompt + template (consistent product behavior across Bolt/Lovable/v0/Kiro, but no published comparative metrics).
- Specs/EARS reduce drift (Kiro user testimonials and one DEV.to deep dive; not yet RCT'd).
- Agentic / hybrid retrieval beats pure embedding RAG for clarification grounding (Sourcegraph paper, Augment claims, Cursor architecture — but each measures it on its own benchmarks).

**Anecdotal / weak evidence.**
- Specific failure modes like "hallucinated product references" or "weak/generic options" are widely *complained about* (forum posts, Reddit, tool comparisons) but rarely *measured* in published material. The Lovable / Devin / Replit complaints are anecdotal.
- Free-text override rates and "I don't know" rates are not published by any production team I located.
- The Cognition/Anthropic philosophical disagreement on multi-agent architectures is heavily covered but provides only indirect evidence on clarification specifically.

**Absent evidence.**
- No production team publishes option-quality satisfaction scores, free-text override rates, or hallucination rates in clarifying-question UIs. This is a real gap.
- No public A/B test of LLM-only vs. retrieval-grounded option generation at the PRD / SDLC level.
- LHAW explicitly notes there is no benchmark for long-horizon, brownfield, option-quality clarification.
- ChatPRD and similar PM-tool data is essentially marketing copy plus testimonials — no published evals.

**Where to be cautious.**
- Vendor blog posts (Augment, Sourcegraph, Cognition, Anthropic) are simultaneously the best engineering descriptions and marketing material. Treat capability claims (e.g., "indexes 400K+ files in ~6 minutes") as vendor-stated until independently reproduced.
- The "creative workarounds" framing for Replit Agent 3 comes from one third-party reviewer (AnswerRocket) and is qualitatively echoed elsewhere but not numerically measured.
- The Answer.AI Devin numbers (3 of 20) are based on 20 tasks chosen by the reviewers; they are widely cited but not statistically robust.
- All forward-looking claims about Cursor's planned multi-choice UI, Augment's living-spec drift handling, etc. should be treated as roadmap, not shipped capability.

---

## Practical takeaways for an SDLC clarifier

1. **Default to multiple-choice with Recommended + Other.** The convergence across Anthropic, Cursor, and Copilot Workspace is too strong to ignore. Anthropic's parameters (1–4 questions × 2–4 options) are a reasonable starting point.

2. **Make the option source explicit and switchable.** For bootstrap, options should come from curated templates and the LLM. For brownfield, options should be drawn from retrieved patterns in the user's codebase, with the LLM acting as ranker, not generator. Cody's @-mention chip pattern is a good UX template — show users *what was retrieved* before showing them options.

3. **Build an ambiguity detector, not just a question generator.** The literature is clear that always-ask is worse than never-ask in measurable Pass@1 terms. ClarifyGPT's consistency-check approach (sample n solutions, check behavioral equivalence) and Ambig-SWE's intent-agent state-history approach are both empirically validated.

4. **Treat steering files as how-to-ask infrastructure, not what-to-ask infrastructure.** Use them to encode templates ("for every new feature, always ask about authentication"), conventions, and tone. Do not rely on them for ground truth about specific code paths.

5. **Lock options at handoff boundaries, not mid-task.** Augment's spec-drift lesson generalizes: once an option is selected and codified into a spec/PRD, downstream agents should treat it as fixed. Re-asking mid-implementation creates the drift Cognition explicitly warns about.

6. **Acknowledge that you will need to retrofit grounding.** The historical pattern is overwhelming: GitHub, Cursor, Anthropic, Sourcegraph, and Replit all shipped LLM-only first and added grounding in response to specific failure modes. Designing for grounding-from-day-one (as Kiro did) is feasible but rare; the more common path is to ship a clarifier that *can* be augmented and instrument it for the failure modes (free-text override rate, "Other" usage rate, post-clarification regret rate) that signal where grounding is needed.

7. **Measure what nobody else is publishing.** The biggest unfilled gap in this entire field is that no production team publishes option-quality metrics. A team that rigorously measures (a) free-text override rate, (b) hallucinated-reference rate, (c) post-implementation "I wish I had been asked X" rate, (d) over-asking penalty in time-to-merge — and publishes them — would be uniquely defensible.