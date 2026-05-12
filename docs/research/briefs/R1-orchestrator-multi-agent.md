# R1: Orchestrator & Multi-Agent Coordination

!!! info "Full research report"

    For the detailed industry survey with 7-tool comparison, see
    [Orchestrator & Multi-Agent Coordination](../R1-orchestrator-management.md).

**Question:** How does the Orchestrator manage multiple Implementer agents executing tasks in parallel across git worktrees? What is the coordination protocol for task dispatch, merge, conflict resolution, and failure handling?

**Blocks:** M4 (Full Spine — Implementer + Reviewer + backward compat cleanup)

## Architecture Context

CHIP's four-stage spine: Clarifier → Architect → Implementer → Reviewer.

The Architect produces a `TaskPlan` — a DAG of tasks where each task declares:
- `filePaths[]` — what files it will write (single-writer rule: no overlap)
- `dependencies[]` — which tasks must complete first
- `writeOrder` — which step in the build sequence

The Orchestrator (not yet built) dispatches ready tasks to Implementer instances. "Ready" means all dependencies have status `completed`. Ready tasks run in parallel in separate git worktrees.

## The Coordination Model (settled)

```
Orchestrator reads TaskPlan DAG
  ↓
Identifies frontier (tasks with all deps complete)
  ↓
Dispatches each frontier task to an Implementer in a git worktree
  ↓
On task completion: worktree merges to integration branch
  ↓
Orchestrator re-evaluates frontier (new tasks may become ready)
  ↓
Loop until all tasks complete or failure
```

**Key invariant:** Single-writer per file. No two concurrent tasks write the same file. The TaskPlan's `filePaths[]` declarations enforce this statically at plan time.

**Coordination substrate:** Git (not in-memory state). Worktrees share the same repo. Merging is via `git merge`. No custom coordination protocol between Implementer instances.

## What Exists Today

- **Clarifier:** 9-node LangGraph StateGraph with typed channels. Single-process, in-memory coordination.
- **Design pipeline:** 4-stage sequential loop. No parallelism.
- **`MemorySaver`:** In-memory LangGraph checkpointer used in eval. For production: Postgres checkpointer.
- **Git worktrees:** Not yet used by any CHIP code. Cursor 2.0 uses them for parallel editing.

## The Open Questions

### 1. Orchestrator architecture
Is the Orchestrator a LangGraph graph? A simple loop? A separate process? Options:

- **LangGraph outer graph:** The Orchestrator is a LangGraph graph where each node dispatches a batch of frontier tasks, waits for completion, then transitions. State: TaskPlan with completion status per task.
- **Simple event loop:** A `while` loop that polls task status, dispatches new tasks, handles failures. Simpler but no checkpointing.
- **Separate process:** The Orchestrator runs as a service. Implementer instances are separate processes or containers. Most complex but most scalable.

### 2. Worktree lifecycle
- When is a worktree created? (on task dispatch)
- When is it destroyed? (after successful merge? after review?)
- What branch naming convention? (e.g., `task/{taskId}`)
- What if merge conflicts? (single-writer rule SHOULD prevent this, but... what if the Architect's filePaths are wrong?)

### 3. Failure handling
- Task exceeds budget (5 iterations, 200K tokens, 15 minutes) → what happens to the DAG?
- Task fails tests → retry? escalate? skip dependent tasks?
- Merge conflict (shouldn't happen with single-writer, but...) → human intervention?
- Multiple tasks fail → abort entire plan? continue with independent tasks?

### 4. Reviewer integration
- Does each task get its own review? Or is there a batched review after all tasks complete?
- Vision says: Reviewer reviews a diff. Per-task diffs or aggregate diff?

## Real Data: CashPulse Parallelism Opportunities

From the M0 task decomposition:
- **T3 || T4:** Expense API and Budget API — both depend on T2, independent files, write order 2. Max 2 concurrent.
- **T6 || T7 || T8:** Dashboard, Add Expense, Spending Insights — all depend on T3, independent screens. Max 3 concurrent.
- **Sequential:** T2→T3→T6→T9→T10 is the critical path.

With `max_concurrent_tasks = 3`, the CashPulse project has 3 parallelism windows:
1. T3 + T4 (2 concurrent)
2. T6 + T7 + T8 (3 concurrent)
3. Everything else is sequential

## Settled Decisions

- Implementer is single-threaded WITHIN a task (vision Layer 8, locked).
- Cross-task parallelism via git worktrees (vision Layer 8, locked).
- `max_concurrent_tasks` configurable (default 3).
- Coordination via git, not in-memory state.
- TaskPlan DAG validated by Architect Critic (acyclic, single-writer, complete coverage).

## External References

- **Walden Yan, "Multi-Agents: What's Actually Working" (April 2026):** Manager-Devin pattern — manager dispatches tasks, Devin instances execute independently, results merge. Key finding: "The manager needs to understand the DAG, but individual Devins don't need to know about each other."
- **Cursor 2.0 (October 2025):** Worktree isolation for parallel editing. Worktrees solve "two agents editing the same file" by making it impossible.
- **Anthropic Engineering (June 2025):** Orchestrator-worker pattern for multi-agent research. 90.2% lift from parallelism. ~15x tokens but better quality.
- **Liu et al., "Dive into Claude Code" (arXiv 2604.14228):** Single-threaded master loop with h2A queue. Subagents return compressed summaries. Master never delegates understanding.

## Desired Output

A research report answering:

1. **What is the recommended Orchestrator architecture?** (LangGraph graph vs event loop vs separate process — with tradeoffs)
2. **What is the worktree lifecycle?** (creation, branching convention, merge strategy, cleanup)
3. **How should the Orchestrator handle task failures?** (retry policy, DAG impact, human escalation triggers)
4. **Per-task or aggregate review?** What does the Reviewer receive?
5. **How do Cursor, Devin, and Anthropic's research system handle parallel agent coordination?** (3 concrete approaches with pros/cons)
6. **What is the maximum practical `max_concurrent_tasks`?** (based on git merge costs, context window limits, API rate limits)
7. **Diagram: recommended Orchestrator loop** (dispatch → execute → merge → re-evaluate)
