# R2: Task Decomposition & Granularity

**Question:** How should Architect Node 5 (Task Planner) decompose architecture into tasks that are right-sized for a single Implementer agent? What makes a task "too big" or "too small"?

**Blocks:** M3 (Architect Core — Nodes 1-5 + shared module extraction)

## Architecture Context

CHIP's Implementer (vision Layer 8) is a single-threaded tool-loop agent that processes one task at a time. Each task has a sequential write order:

1. DB migration → 2. Backend endpoint → 3. Backend tests → 4. Frontend component → 5. Frontend tests → 6. Integration test

Cross-task parallelism happens via git worktrees — independent tasks run simultaneously in separate worktrees, merging via git. The Architect's Task Planner (Node 5) must produce tasks that satisfy:

- **Single-writer rule:** no two tasks write the same file
- **DAG acyclicity:** dependencies form a directed acyclic graph
- **PRD criterion coverage:** every acceptance criterion is covered by at least one task
- **Contract-task coverage:** every Architect contract artifact has at least one task

## TaskPlan Schema (to be created)

```typescript
const TaskPlanSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    description: z.string(),
    filePaths: z.array(z.string()),       // what files this task writes
    dependencies: z.array(z.string()),     // task IDs that must complete first
    writeOrder: z.number().int(),          // step in the Implementer's sequence
    scope: z.object({                      // which change axes this task touches
      ui: z.boolean(),
      component: z.boolean(),
      designSystem: z.boolean(),
      api: z.boolean(),
      dataModel: z.boolean(),
    }),
  })),
});
```

## Real Data: CashPulse Task Decomposition (from M0 analysis)

A human-produced task decomposition for the CashPulse expense tracker:

| Task | Description | Files | Deps | Write Order |
|------|-------------|-------|------|-------------|
| T1 | Scaffold project | package.json, dirs | — | 0 |
| T2 | DB migration (expenses, categories, budgets) | migrations/001.sql | T1 | 1 |
| T3 | Expense API (CRUD endpoints) | api/expenses/route.ts | T2 | 2 |
| T4 | Budget API (CRUD + progress) | api/budgets/route.ts | T2 | 2 |
| T5 | Backend tests | tests/api/*.test.ts | T3,T4 | 3 |
| T6 | Dashboard (design+build) | dashboard/page.tsx | T3 | 4 |
| T7 | Add Expense (design+build) | expenses/new/page.tsx | T3 | 4 |
| T8 | Spending Insights (design+build) | insights/page.tsx | T3 | 4 |
| T9 | Frontend tests | tests/*.test.tsx | T6,T7,T8 | 5 |
| T10 | Integration test | tests/integration/*.test.ts | T5,T9 | 6 |

**Key observations:**
- T3 and T4 are at the same writeOrder (parallel candidates — different files, same deps)
- T6, T7, T8 are parallel candidates — different screens, independent files
- T5 depends on both T3 and T4 (frontier waits for all backend tasks)
- Each task declares filePaths — single-writer is mechanically verifiable

## Implementer Budget Constraints (vision Layer 8, locked decisions)

- 5 iteration limit per task
- 200K token budget per task
- 15-minute wall clock per task
- LLM never self-declares completion — deterministic gates (typecheck, lint, tests) own "done"

## Settled Decisions

- The Implementer is single-threaded WITHIN a task. No parallel frontend/backend/tests within one task.
- Cross-task parallelism via git worktrees only. Merging via normal git.
- `max_concurrent_tasks` is configurable (default 3).
- Feature-level tasks (coarse) — the Implementer handles sequential write order internally.
- The Architect Node 5 validates the TaskPlan with deterministic checks before emitting.

## External Reference Architectures

- **Kiro (AWS):** `tasks.md` — explicit task list with dependencies, steering-file-constrained boundaries
- **GitHub Spec Kit:** Phase 2 `tasks.md` — task decomposition from contracts
- **MetaGPT:** SOP materialization as task list from system design document
- **Cursor 2.0:** Worktree isolation for parallel execution of independent tasks

## Desired Output

A research report answering:

1. **What is the right granularity for a task?** Feature-level? Screen-level? File-level? With concrete examples showing tradeoffs at each level.
2. **How should the Task Planner handle shared code?** (e.g., utility functions used by multiple screens — which task writes them?)
3. **How should brownfield tasks differ from greenfield?** (delta tasks, skip scaffolding, existing test compatibility)
4. **What heuristics detect "task too big"?** (file count, estimated token budget, dependency fan-out)
5. **How do Kiro, Spec Kit, and MetaGPT handle task granularity?** (3 concrete examples with their approach)
6. **Should the TaskPlan include test tasks explicitly?** Or are tests part of each implementation task's write order?
