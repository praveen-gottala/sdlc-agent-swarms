# R3: Context Management Between Tasks

**Question:** When task T2 depends on task T1, what context does T2's Implementer instance receive? The full code T1 wrote? Just the contracts? The repo map? How much is too much?

**Blocks:** M3 (Architect Core — Nodes 1-5 + shared module extraction)

## Architecture Context

CHIP's Implementer processes tasks in git worktrees. When T1 completes:
1. T1's worktree merges to the integration branch
2. T2's worktree is created from the integration branch (includes T1's code)
3. T2's Implementer starts with fresh context

**The fresh-context principle** (validated by Cognition's Devin Review): the Reviewer works better when it does NOT inherit the Implementer's conversation. Applied to inter-task handoff: each task's Implementer should start fresh, not inherit the previous task's reasoning trace.

But "fresh" doesn't mean "empty." The question is what goes into the fresh context.

## What Exists Today

The Clarifier demonstrates the fresh-context pattern:
- Each LangGraph node receives state through typed channels (Zod-validated)
- The Critic gets outputs from earlier nodes but NOT their reasoning traces
- Human responses are injected via `updateState` + `stream(null)` (not passed as input)

## The Context Spectrum

```
MINIMAL                                                              MAXIMAL
contracts  ←→  contracts+code  ←→  contracts+code+tests  ←→  full repo map+everything
```

**Minimal (contracts only):** T2 receives the Architect's `ContractBundle` (architecture spec, data model, API contracts, screen specs, task plan). T2 does NOT see T1's code. Risk: T2 may generate code that's technically correct per contracts but stylistically inconsistent with T1.

**Medium (contracts + code):** T2 receives contracts PLUS the actual files T1 wrote (via git merge). T2's Implementer can `search_code` to see T1's patterns. Risk: context window pressure for large codebases.

**Maximal (everything):** T2 receives contracts + code + repo map + T1's test results. Risk: context overload, reasoning drift.

## Relevant Schemas

```typescript
// ContractBundle — what the Architect produces (shared across ALL tasks)
interface ContractBundle {
  architectureSpec: ArchitectureSpec;
  adrs: ADR[];
  dataModel?: DataModelSpec;          // concrete column types, indexes
  apiContracts?: OpenAPISpec;         // OpenAPI 3.1 fragments
  componentComposition?: ComponentComposition;
  screenSpecs?: ScreenPlan[];
  taskPlan: TaskPlan;
  assumptionLedger: AssumptionLedger;
}

// TaskPlan — each task declares what it writes and depends on
interface TaskPlan {
  tasks: Array<{
    id: string;
    description: string;
    filePaths: string[];              // single-writer: exclusive file ownership
    dependencies: string[];           // task IDs that must complete first
    writeOrder: number;               // sequential write step
  }>;
}
```

## Real Data: CashPulse Example

T3 (Expense API) and T4 (Budget API) both depend on T2 (DB migration). After T2 completes:

- **T2 wrote:** `migrations/001.sql` — creates `expenses`, `categories`, `budgets` tables
- **T3 needs to know:** table schema (column names, types), migration has been applied
- **T4 needs to know:** same tables, plus that T3 is running in parallel (don't conflict on file paths)

T6 (Dashboard) depends on T3 (Expense API):
- **T3 wrote:** `api/expenses/route.ts` — GET/POST/PUT/DELETE endpoints
- **T6 needs to know:** API endpoint shapes (request/response), or just the OpenAPI contract from the Architect?

## Settled Decisions

- Inter-task coordination is via git (worktree merge), NOT in-memory state.
- The Architect's `ContractBundle` is the SHARED context — every task receives it.
- Each Implementer instance has `search_code` and `get_repo_map` tools to explore the integration branch.
- `report-assumption-violation` tool lets T2 flag conflicts with assumptions made during T1.
- Fresh context per task — no conversation state carries over.

## External References

- **Cognition Devin Review:** Fresh-context reviewer catches ~2 bugs/PR, 58% severe — validates fresh context over inherited context.
- **Anthropic multi-agent research:** Subagents return compressed summaries, not full reasoning traces.
- **Spec Kit Agents (arXiv 2604.05278):** "Context blindness" — internally coherent but incompatible with repo. Fix: read-only context-grounding hooks.
- **ACON (arXiv 2510.00615):** Context compression prevents reasoning drift; explicit context budgeting.
- **Augment Code "Intent":** Bidirectional feedback — specs flow downstream, violations flow upstream via AssumptionLedger.

## Desired Output

A research report answering:

1. **What is the recommended context package for a dependent task?** (contracts? contracts+code? contracts+code+test-results?)
2. **How should context be scoped for different dependency types?** (data dependency: T3→T6 vs parallel sibling: T3||T4)
3. **What context compression techniques apply?** (repo map vs full code, contract summaries vs full specs)
4. **How do real systems handle this?** (Cursor worktree merges, Devin task handoffs, Claude Code subagent summaries)
5. **What is the token budget for inter-task context?** (hard cap recommendation based on model context window)
6. **Should the integration branch be the ONLY inter-task communication channel?** Or should there be an explicit "task completion report"?
