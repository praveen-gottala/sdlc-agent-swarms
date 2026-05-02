# Research: AI-Powered Clarification Question Generation

## Executive Summary

AI product tools use three distinct strategies for pre-generation clarification: **generate-then-refine** (v0, Bolt -- no upfront questions, iterate on output), **ask-then-generate** (Cursor 2.1, ChatPRD -- context-aware questions before action), and **consistency-check-driven** (ClarifyGPT -- detect ambiguity via code divergence, then ask targeted questions). The academic evidence strongly favors the consistency-check approach: ClarifyGPT's two-stage detect-then-clarify pipeline improved GPT-4's code generation Pass@1 by 10+ percentage points (FSE 2024). For a product clarifier generating domain-specific options, a hybrid of Cursor's codebase-aware question generation and ClarifyGPT's divergence detection -- augmented with RAG over domain patterns -- offers the strongest architecture.

## Tool-by-Tool Analysis

### ChatPRD (chatprd.ai)
Asks clarifying questions during PRD generation, structured as a guided interview. Questions feel like "a colleague saying 'clarify this user story.'" However, the clarification is conversational, not structured with concrete options. Users report it takes ~20 minutes to produce a PRD from a vague idea. The tool is purpose-built for PM context (trained on thousands of PRDs), which gives it domain-specific question quality that generic LLMs lack. No evidence of multi-choice option generation -- questions are open-ended.

### Lovable (lovable.dev)
Clarification is opt-in via Plan/Chat mode. The recommended pattern is prompting: "Ask me any questions you need to fully understand what I want." The agent prompt explicitly instructs: "If any aspect of the request is unclear, ask for clarification BEFORE implementing. Wait for their response before proceeding." Questions are open-ended and conversational. No structured option generation. The system relies on user initiative to trigger clarification rather than detecting gaps autonomously.

### Bolt (bolt.new)
Uses a **prompt enhancer** that converts rough ideas into structured technical specifications, plus Plan Mode for pre-code review. No autonomous clarification questions. The refinement loop is iterative: generate, review, request changes via chat. The "enhance prompt" button is the closest analog to gap detection -- it rewrites the user's input to be more specific, but does not ask questions or present options.

### v0 (v0.dev)
No explicit clarification step. Uses a generate-then-iterate model with chain-of-thought explanations. After generating UI, it explains its reasoning and the user refines via follow-up prompts. Built-in versioning preserves each iteration. The transparency of the chain-of-thought serves as implicit clarification -- "here's what I assumed, correct me if wrong" -- but there are no structured questions or options.

### Cursor (2.1+)
The most sophisticated clarification system among coding tools. When a request has ambiguity, Cursor **automatically** presents 3-5 context-aware questions before generating a plan. Questions adapt to project structure (e.g., "Should new state live in Redux global state or component local state?" for a React/Redux project). Built on a RAG pipeline: tree-sitter AST parsing, code chunking, hybrid semantic + grep retrieval. Results: 34% fewer implementation errors, 42% fewer back-and-forth iterations. Questions are presented with an interactive UI; answers feed directly into plan generation.

### Sweep AI
Fixed pipeline: search -> plan -> write code -> validate. Posts the plan as a GitHub issue comment for human review before coding. No structured clarification questions -- instead, relies on the plan-as-proposal pattern where humans correct the plan via issue comments. Sweep then re-plans and re-codes based on feedback.

### Mutable.ai
Focused on code transformation (refactoring, documentation, type addition) rather than requirements clarification. Pattern recognition from existing code to produce autocomplete. No evidence of a clarification pipeline for requirements. The Auto Wiki feature generates documentation from code, which is the inverse direction.

### ClarifyGPT (FSE 2024, Mu et al.)
The most rigorous approach, published at FSE 2024. Four-stage pipeline:

1. **Test Input Generation** -- generate test inputs for the requirement using prompting + heuristic mutations.
2. **Code Consistency Check** -- generate multiple code solutions from the same requirement, run them against the test inputs, and check if outputs diverge. Divergence = ambiguity detected.
3. **Reasoning-Based Question Generation** -- prompt the LLM with the identified ambiguity and ask it to generate targeted clarifying questions via chain-of-thought reasoning.
4. **Enhanced Code Generation** -- append clarification answers to the original requirement and regenerate.

Key insight: **ambiguity is detected by behavioral divergence, not by text analysis.** If the same requirement produces code that behaves differently on the same inputs, the requirement is ambiguous. This is measurably more reliable than asking an LLM "is this ambiguous?"

Results: GPT-4 Pass@1 improved from 70.96% to 80.80% on MBPP-sanitized with human feedback.

## Option Generation Strategies Comparison

| Approach | How It Works | Pros | Cons | Best For |
|----------|-------------|------|------|----------|
| **A: Same-call generation** | The LLM that detects the gap also generates 3 concrete options in the same prompt | Simple, low latency, single LLM call | Options lack depth; no domain-specific reasoning; quality depends on prompt quality | MVP, low-complexity domains |
| **B: Specialist architect call** | Separate LLM call takes gap + domain context + prior answers and generates options with pros/cons | Domain-aware options, better reasoning, can include trade-off analysis | Higher latency (extra LLM call), requires careful context assembly | Production clarifiers where option quality matters |
| **C: RAG over domain patterns** | Retrieve how similar apps handle this pattern (e.g., "how do recipe apps handle user auth?") from a curated knowledge base | Options grounded in real implementations, avoids hallucinated solutions, reusable across projects | Requires building/maintaining the knowledge base, cold-start problem for rare domains | Mature products with accumulated domain knowledge |
| **D: Template + LLM hybrid** | Pre-built option templates for common patterns (auth, storage, error handling) with LLM-generated descriptions tailored to the specific project | Consistent quality for common patterns, fast, deterministic for known gaps | Template maintenance burden, poor coverage for novel domains, requires ongoing curation | High-volume products where 80% of questions are predictable |

**Recommended: B + C hybrid.** Use a specialist LLM call (Approach B) as the primary generator, with RAG retrieval (Approach C) providing grounding context. For common patterns like auth or data storage, the RAG corpus supplies real implementations; the specialist call synthesizes them into project-specific options with pros/cons. Fall back to pure LLM generation (Approach A) only when the RAG corpus has no relevant matches.

## Context Accumulation Patterns

### The Core Problem
If a user says "single-user, no auth" in round 1, round 2 should not ask about JWT storage. But naive implementations re-analyze the full requirement from scratch each round, producing contradictory or redundant questions.

### Pattern 1: Accumulated Decision Record
Maintain a structured JSON object (not free text) of all decisions made so far. Each round's question generation prompt includes the full decision record. The LLM is instructed: "Do not ask questions whose answers are already determined by the decision record."

This is what Cursor does implicitly -- clarification answers feed into the plan, and the plan constrains subsequent agent behavior.

### Pattern 2: Requirement Refinement (ClarifyGPT's Approach)
Append each Q&A pair directly to the original requirement text. The refined requirement grows with each round. Subsequent gap detection operates on the refined text, naturally skipping resolved areas.

Advantage: the requirement document itself is the single source of truth. No separate state to maintain.

### Pattern 3: Dependency Graph Pruning
Model questions as a DAG where some questions gate others. "Do you need user accounts?" gates "What auth provider?" and "How should sessions be stored?" If the gating question is answered "no," prune the entire subtree.

Advantage: eliminates redundancy structurally. Disadvantage: requires pre-computing the question dependency graph, which limits flexibility for novel domains.

### Pattern 4: Contradiction Detection
After each round, run a validation pass: "Given these accumulated answers, are any contradictory or redundant?" This catches cases where round 3's answer invalidates a round 1 assumption.

Google Research's ACT (Action-Based Contrastive Self-Training) addresses this: models trained with DPO learn when to ask clarification vs. when to proceed, reducing premature assumptions that cascade into errors across subsequent turns.

**Recommended: Pattern 1 + Pattern 2.** Maintain a structured decision record AND append Q&A to the requirement. Use the decision record for question filtering; use the refined requirement for gap detection. Add Pattern 4 (contradiction detection) as a validation pass every 2-3 rounds.

## UX Patterns for Clarification

### Batch vs. One-at-a-Time
Cursor presents 3-5 questions per round. ClarifyGPT asks one focused question per ambiguity. Academic evidence (LLMREI, 2025) shows that batched questions (3-5 per round) with 2-3 rounds total outperform one-at-a-time for user satisfaction, while one-at-a-time produces marginally higher individual answer quality.

**Recommendation:** 3-5 questions per round, 2-3 rounds maximum. Group questions by theme (e.g., "About users," "About data," "About integrations").

### Handling "I Don't Know" / "You Decide"
The system should have a sensible default for every question. When the user says "you decide," apply the default and record it in the decision record as "AI-selected default: [value], reason: [rationale]." This preserves traceability.

### Progressive Disclosure by Expertise
Detect expertise from the user's language. If they say "recipe sharing app," ask product-level questions ("Who are the primary users?"). If they say "recipe sharing app with GraphQL subscriptions for real-time updates," ask architecture-level questions ("WebSocket vs. SSE for subscription transport?"). The three-layer progressive disclosure pattern (Index -> Details -> Deep Dive) maps naturally to this: novice users see Layer 1 (product questions), technical users see Layer 2 (architecture questions), expert users see Layer 3 (implementation trade-offs).

## Recommended Architecture

For the CHIP clarifier pipeline, a five-component architecture:

```
Seed Idea
    |
    v
[1. Gap Detector] -- Generates N candidate PRD outlines, diffs them to find
    |                 divergence points (inspired by ClarifyGPT consistency check,
    |                 adapted from code to product requirements)
    v
[2. Question Ranker] -- Prioritizes gaps by impact (would this gap cause
    |                    architectural rework if resolved differently?)
    |                    Filters against accumulated decision record
    v
[3. Option Generator] -- For each gap, specialist LLM call with:
    |                     - The gap description
    |                     - Domain context from RAG (how similar apps handle this)
    |                     - Accumulated decisions so far
    |                     Produces 2-4 concrete options with pros/cons
    v
[4. Expertise Adapter] -- Adjusts question/option language based on detected
    |                      user expertise level (product vs. technical vs. expert)
    v
[5. Decision Accumulator] -- Records answers, appends to requirement,
                              updates decision record, triggers contradiction check
```

**Key design decisions:**

1. **Gap detection via divergence, not text analysis.** Generate 3 candidate PRD outlines from the seed idea, diff their structural decisions (auth approach, data model, API style). Where they diverge = genuine ambiguity worth asking about.

2. **Options grounded in domain knowledge.** The option generator retrieves patterns from a curated corpus of "how apps in domain X handle pattern Y." This prevents hallucinated options and provides real-world grounding.

3. **2-3 rounds maximum.** Each round presents 3-5 questions grouped by theme. The decision accumulator prunes resolved subtrees before each subsequent round.

4. **Every question has a default.** Users can skip any question. The system records the default with rationale, enabling "you decide" without information loss.

## Sources

- [ChatPRD](https://www.chatprd.ai/) -- [Workflow guide](https://www.chatprd.ai/how-i-ai/workflows/how-to-generate-a-product-requirements-document-prd-with-a-single-ai-prompt) -- [Tool comparison](https://firesidepm.substack.com/p/i-tested-5-ai-tools-to-write-a-prdheres)
- [Lovable Prompting Bible](https://lovable.dev/blog/2025-01-16-lovable-prompting-handbook) -- [Prompting best practices](https://docs.lovable.dev/prompting/prompting-one) -- [System prompt](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Lovable/Agent%20Prompt.txt)
- [Bolt.new guide](https://www.nocode.mba/articles/bolt-ai-new-guide) -- [GitHub repo](https://github.com/stackblitz/bolt.new)
- [v0.dev docs](https://v0.app/docs) -- [System prompt analysis](https://www.doingwith.ai/articles/exploring-the-v0-dev-system-prompt) -- [v0 internals](https://medium.com/@dilipmuthuraju/how-v0-dev-works-from-idea-to-code-f66555a4774e)
- [Cursor 2.1 clarifying questions](https://www.digitalapplied.com/blog/cursor-2-1-clarifying-questions-plans) -- [Cursor changelog](https://cursor.com/changelog/2-1) -- [Agent best practices](https://cursor.com/blog/agent-best-practices) -- [Codebase indexing](https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/)
- [Sweep AI docs](https://docs.sweep.dev/) -- [Sweep overview](https://www.onegen.ai/project/sweep-ai-automated-github-issue-resolution-and-pull-request-generation/)
- [ClarifyGPT (FSE 2024)](https://dl.acm.org/doi/10.1145/3660810) -- [arXiv preprint](https://arxiv.org/abs/2310.10996) -- [GitHub](https://github.com/ClarifyGPT/ClarifyGPT)
- [LLMREI: Automating Requirements Elicitation Interviews](https://arxiv.org/html/2507.02564v1)
- [LLMs for RE: Systematic Literature Review](https://arxiv.org/html/2509.11446v1)
- [Requirements Completeness via LLMs (Luitel et al. 2024)](https://link.springer.com/chapter/10.1007/978-3-031-88531-0_19)
- [Google Research: ACT for multi-turn clarification](https://research.google/blog/learning-to-clarify-multi-turn-conversations-with-action-based-contrastive-self-training/)
- [Progressive Disclosure in AI Agents](https://www.honra.io/articles/progressive-disclosure-for-ai-agents) -- [MindStudio guide](https://www.mindstudio.ai/blog/progressive-disclosure-ai-agents-context-management)
- [Spec-Driven Development (Thoughtworks)](https://thoughtworks.medium.com/spec-driven-development-d85995a81387) -- [Addy Osmani on specs for AI](https://addyosmani.com/blog/good-spec/)
