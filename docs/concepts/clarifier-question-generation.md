# Clarifier Question Generation

> Authoritative source: [research/clarifier-question-generation.md](../research/clarifier-question-generation.md) and [research-report.md Part 3](../research/research-report.md#part-3-conversational-clarification-agents)

When the clarifier detects a gap in a user's requirements — "the PRD doesn't specify where JWT tokens are stored" — it needs to do more than ask "what do you want?" CHIP's gap detector produces divergent implementation approaches (via ClarifyGPT's consistency sampling), ranks them by EVPI score, and presents the top gaps as multiple-choice questions with domain-grounded options: "HttpOnly cookies (like Stripe)", "localStorage with refresh rotation (like Firebase)", or "in-memory with silent refresh (like Auth0)."

## Why CHIP does this

The [research report](../research/research-report.md#part-3-conversational-clarification-agents) finds that ClarifyGPT's divergence detection plus structured options improves GPT-4 Pass@1 by 10+ percentage points (FSE 2024) — but the generated options are generic without domain grounding. Most tools skip structured options entirely: Lovable, Bolt, and v0 use open-ended questions or iterate on output. Only Cursor and ClarifyGPT generate project-aware options. CHIP combines divergence detection with RAG retrieval and specialist LLM calls to produce domain-specific options that a non-technical user can pick from in seconds.

## The problem

CHIP's current implementation generates questions in two steps:

1. **ClarifyGPT divergence detection** — generate 3 implementation approaches, find where they disagree
2. **Question prioritization** — rank gaps by EVPI score (Expected Value of Perfect Information — a measure of how much the final design would improve if this gap were resolved, computed as `blastRadius × answerability × confidenceGap`)

The gap detector produces `divergentInterpretations` — the three implementation approaches that disagreed on how to handle the gap. These are meant to become the options the user sees. But two problems make them insufficient:

**Problem 1: Approaches are generic.** The LLM generates approaches from its training data without domain grounding. For a recipe app asking about auth, it produces "Approach 1 uses session-based auth" instead of "NextAuth.js with Google OAuth (like AllRecipes)" or "Magic links via Resend (like Substack)." The approaches are technically valid but don't help a non-developer make a confident decision.

**Problem 2: Deterministic gaps have no approaches at all.** The checklist-based gaps (auth, validation, error handling) are detected without LLM involvement, so they have no `divergentInterpretations`. These gaps currently show no options — just an open text field.

## How competitors handle this

The [research report](../research/clarifier-question-generation.md) surveyed 8 tools. Key findings:

| Tool | Clarification approach | Options? |
|------|----------------------|----------|
| **Cursor 2.1** | RAG-powered context-aware questions | Yes — adapts to project (e.g., "Redux global or component local?") |
| **ChatPRD** | Guided interview, PM-specialized | No — open-ended questions |
| **ClarifyGPT** (FSE 2024) | Behavioral divergence detection | Implicit — divergent behaviors become the options |
| **Lovable** | User-initiated ("ask me questions") | No options |
| **Bolt** | Prompt enhancer, no questions | N/A |
| **v0** | Generate-then-iterate, no upfront questions | N/A |
| **Sweep AI** | Plan-as-proposal via GitHub issue comments | No — humans correct the plan, no structured questions |
| **Mutable.ai** | Auto-wiki + code understanding | No — documentation-focused, no clarification |

Cursor 2.1 is the closest to what CHIP needs: context-aware questions that adapt to the specific project. But Cursor operates on code, not product requirements.

## Four strategies for generating options

### Strategy A: Same-call generation (current)

The LLM that detects the gap also generates options in the same prompt. This is what ClarifyGPT does — the divergent implementations become the options.

- **Pro**: Simple, single LLM call, no extra infrastructure
- **Con**: Options lack depth, no domain grounding, quality depends entirely on prompt quality
- **When to use**: MVP, low-complexity domains, or when speed matters more than option quality

??? question "Research question: specialist persona framing"

    What system prompt produces the best options? Should the specialist be prompted as "a senior architect who has built 50 apps in this domain" or as "a product consultant explaining options to a non-technical founder"? The persona framing affects whether options lean technical or accessible.

### Strategy B: Specialist architect call

A separate LLM call takes the gap + domain context + prior answers and generates options with pros/cons and real-world examples.

- **Pro**: Domain-aware options, can include trade-off analysis, can reference real products
- **Con**: Extra LLM call per question (latency + cost), requires careful context assembly
- **When to use**: Production clarifiers where option quality drives user trust

??? question "Research question: knowledge base design"

    What should the knowledge base contain? Options include: (a) curated articles about how specific products work, (b) architectural patterns extracted from open-source repos, (c) Stack Overflow/blog posts about common decisions, (d) a structured database of "domain → decision → options" triples. Each has different maintenance costs and freshness guarantees.

### Strategy C: RAG over domain patterns

Retrieve how real products handle this pattern from a curated knowledge base. "How do recipe apps handle user authentication?" → retrieve patterns from AllRecipes, Cookpad, Yummly.

- **Pro**: Options grounded in real implementations, avoids hallucinated solutions
- **Con**: Requires building/maintaining a knowledge base, cold-start for rare domains
- **When to use**: Mature products with accumulated domain knowledge

### Strategy D: Template + LLM hybrid

Pre-build option templates for common gap categories (auth, storage, error handling, state management) with real-world product examples. The LLM fills in project-specific details.

- **Pro**: Consistent quality for common patterns, fast, deterministic for known gaps
- **Con**: High upfront curation, poor coverage for novel domains
- **When to use**: When 80% of questions are predictable (auth, storage, validation)

??? question "Research question: template coverage"

    How many templates are needed to cover 80% of bootstrap gaps? Analysis of the deterministic checklist suggests ~6 categories (auth, validation, error handling, data persistence, state management, accessibility). But ClarifyGPT gaps are domain-specific and harder to template.

### Recommended hybrid: B + C

The research report recommends combining Strategy B (specialist call) with Strategy C (RAG grounding):

> *"Use a specialist LLM call (Approach B) as the primary generator, with RAG retrieval (Approach C) providing grounding context. For common patterns like auth or data storage, the RAG corpus supplies real implementations; the specialist call synthesizes them into project-specific options with pros/cons."* — `docs/research/clarifier-question-generation.md`

## Context accumulation across rounds

When a user answers "single-user, no auth needed" in round 1, round 2 should not ask about JWT storage. Four patterns exist for maintaining this coherence:

### Pattern 1: Accumulated decision record

Maintain a structured JSON object of all decisions made so far. Each round's question generation prompt includes the full record. The LLM is instructed: "Do not ask questions whose answers are already determined by the decision record." Implications are LLM-generated: when the user answers a question, the system infers what other decisions are now determined (e.g., "no auth" implies no JWT, no session management, no user table).

This is what Cursor does implicitly — clarification answers feed into the plan, and the plan constrains subsequent agent behavior.

### Pattern 2: Requirement refinement

Append each Q&A pair directly to the PRD text. The refined requirement grows with each round. Subsequent gap detection operates on the refined text, naturally skipping resolved areas.

The advantage: the PRD itself is the single source of truth. No separate state to maintain. The disadvantage: the PRD grows with each round, potentially exceeding token budgets.

### Pattern 3: Question dependency graph

Model questions as a DAG where some questions gate others. "Do you need user accounts?" gates "What auth provider?" and "How should sessions be stored?" If the gating question is answered "no," prune the entire subtree.

??? question "Research question: automatic dependency detection"

    Can the dependency graph be generated automatically from the gap structure, or does it need manual curation? If the gap detector's divergent interpretations can be analyzed for conditional dependencies, the graph could be auto-generated per run.

### Pattern 4: Contradiction detection

After each round, run a validation pass: "Given these accumulated answers, are any contradictory or redundant?" This catches cases where round 3's answer invalidates a round 1 assumption.

### Recommendation

Combine Pattern 1 + Pattern 2: maintain a structured decision record AND append Q&A to the requirement. Use the decision record for question filtering; use the refined requirement for gap detection. Add Pattern 4 (contradiction detection) every 2-3 rounds.

## Expertise adaptation

The same gap ("PRD doesn't specify error handling") needs different options for different users:

| User signal | Expertise level | Option style |
|-------------|----------------|--------------|
| "recipe sharing app" | Product-level | "Show friendly error messages" vs "Show nothing, just retry" |
| "recipe app with Next.js and Prisma" | Architecture-level | "React Error Boundaries with toast notifications" vs "Global error handler with retry queue" |
| "recipe app with tRPC, Zod validation, and Sentry" | Implementation-level | "Zod parse errors → tRPC error formatter → client-side toast" vs "Sentry.captureException with user-facing fallback UI" |

The research suggests detecting expertise from the user's seed input language. Technical terms → architecture-level options. Plain English → product-level options.

??? question "Research question: expertise detection approach"

    Should expertise detection be a separate classifier, or should the option generator prompt itself adapt? A separate classifier adds complexity but could be reused across stages. An adaptive prompt is simpler but may be inconsistent.

## "I don't know" / "Let CHIP decide"

The `storyWriter` node already records AI-selected defaults with `requiresConfirmation: true` in the Assumption Ledger (a structured record of every decision the system made on the user's behalf, with confidence levels). When a user selects "Let CHIP decide," the system:

1. Applies the sensible default
2. Records it as an assumption: "AI-selected default: HttpOnly cookies. Reason: industry standard for web apps handling user sessions"
3. Marks it with `requiresConfirmation: true` so downstream stages know this decision was not explicitly approved

The "Let CHIP decide" UI option is planned but not yet implemented — the recording mechanism exists, the user-facing flow does not.

## Components

| Component | File | Role |
|-----------|------|------|
| Gap detector | `packages/agents-clarifier/src/nodes/gap-detector.ts` | Generates divergent implementations, finds disagreement points |
| Question prioritizer | `packages/agents-clarifier/src/nodes/question-prioritizer.ts` | Ranks gaps by EVPI score, selects top gaps for the current round |
| Story writer | `packages/agents-clarifier/src/nodes/story-writer.ts` | Converts approved answers into PRD user stories, records assumptions |
| EVPI score | `packages/agents-clarifier/src/schemas.ts` (line 42) | `blastRadius × answerability × confidenceGap` — priority ranking formula |
| Divergent interpretations | `packages/agents-clarifier/src/schemas.ts` (line 30) | Zod schema for the 3 implementation approaches that disagreed |
| Assumption Ledger | `packages/core/src/types/cross-boundary-artifacts.schemas.ts` | Cross-boundary artifact tracking every AI-made decision with confidence |

## Known limitations

- Options are generated in the same LLM call as gap detection (Strategy A) — no specialist call or RAG grounding yet.
- No expertise detection — all users receive the same option depth regardless of technical background.
- No cross-round contradiction detection (Pattern 4 is not implemented).

## Open questions for further research

1. **What's the right number of options per question?** 2-3 feels minimal, 5+ feels overwhelming. Cursor shows 3-5 questions per round — but those are questions, not options per question.

2. **Should options include cost/complexity indicators?** E.g., "LocalStorage (simple, free)" vs "PostgreSQL with Prisma (moderate setup, $5/mo hosting)" — this helps non-technical users make informed trade-offs.

3. **How should the UI handle questions with deeply technical options?** Progressive disclosure? Expandable "learn more" sections per option? A separate "explain this" button?

4. **Can we use the user's answers to improve option quality for future users?** If 80% of recipe app builders choose "no auth, localStorage," that becomes the suggested default for the next recipe app seed.

5. **What's the latency budget?** Adding a specialist LLM call (Strategy B) per question adds ~2-5s per question. For 7 questions, that's 14-35s of extra pipeline time. Is that acceptable?

6. **How do we evaluate option quality?** Human rating? A/B testing different strategies? Measuring how often users pick "Other" (free text) — high "Other" rate = bad options?

## Related

- [Clarifier Pipeline](clarifier-pipeline.md) — the nine-node pipeline end-to-end
- [Research: Question Generation](../research/clarifier-question-generation.md) — detailed tool analysis and strategy comparison
- [RAG & Context](rag-context.md) — the retrieval layer that could ground options
- [Research Report Part 3](../research/research-report.md#part-3-conversational-clarification-agents) — academic foundations
