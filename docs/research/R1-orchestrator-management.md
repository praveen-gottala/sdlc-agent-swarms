# Orchestrator → Implementer Across Git Worktrees: Industry Survey and a Concrete Design for CHIP

!!! info "Compact version available"

    For a self-contained LLM research brief covering this topic, see
    [R1: Orchestrator & Multi-Agent Coordination](briefs/R1-orchestrator-multi-agent.md).

## TL;DR

- **The industry has converged on a single pattern for coding agents in 2025-2026: a single-writer "spine" (the orchestrator/main agent) decomposes work into scoped tasks, dispatches each to an isolated worker that runs in its own git worktree (or VM), and integrates results through git rather than through shared in-memory state.** Cursor 2.0, Claude Code's Agent Teams, Codex, Devin's Managed Devins, GitHub Copilot's `/fleet`, Replit Agent 4, and Augment's Intent all instantiate this pattern. CHIP's spine + worktree commitments are aligned with the consensus, not against it.
- **For CHIP specifically, the simplest workable design is: one persistent LangGraph thread per task (the spine), one worktree per task, and an out-of-graph TaskQueue that drives the cross-task DAG via a small Node.js process pool.** Do **not** put the parallel implementer fan-out inside a LangGraph subgraph using `Send()`; that pattern is for in-process map-reduce, not for long-running, isolated, filesystem-bound work. Keep LangGraph state inside one task; let git, Postgres rows, and a Node process pool handle cross-task coordination.
- **The two patterns most likely to attract you and most likely to fail are: (1) putting all parallel implementers inside one LangGraph graph with shared channels and accumulator reducers, and (2) trying to detect file-overlap conflicts before dispatch with anything fancier than "the Architect emits per-task file globs and the Orchestrator rejects any plan that overlaps." Both are over-engineered for a single developer; defer them.**

---

## Key Findings

1. **"Multi-agent" in 2026 means orchestrator-worker, not peer-to-peer.** Walden Yan's April 2026 follow-up ("Multi-Agents: What's Actually Working", cognition.ai/blog/multi-agents-working) explicitly retains the rule that *writes stay single-threaded*; what changed since June 2025's "Don't Build Multi-Agents" is only that read-only "intelligence-contributing" subagents now work reliably. Anthropic's June 2025 "How we built our multi-agent research system" applies the same orchestrator-worker pattern but acknowledges it is "less effective for tightly interdependent tasks such as coding." The Liu et al. paper "Dive into Claude Code" (arXiv 2604.14228, April 2026) confirms Claude Code uses the *orchestrator-workers* pattern from Anthropic's "Building Effective Agents" taxonomy with a single-threaded master loop (`nO`) and at most one subagent branch active at a time. CHIP's sequential spine is the conservative-correct choice.

2. **Worktrees are the de-facto isolation primitive for local coding agents; VMs are the cloud equivalent.** Cursor 2.0 (Oct 29, 2025, cursor.com/changelog/2-0) ships "up to eight agents in parallel … using git worktrees or remote machines to prevent file conflicts." Claude Code added a `--worktree` flag in v2.1.50 with a paper-documented worktree-isolated subagent delegation mechanism. OpenAI Codex's app keeps the most recent 15 Codex-managed worktrees by default with snapshot-on-delete. Devin uses full VMs per Managed Devin; Augment's Intent uses worktrees per Space. The choice between worktree and VM is a security/parity trade-off, not a correctness one — for a single developer, worktrees win on simplicity and disk economy.

3. **Worktree disk and tool friction is real but bounded.** A pnpm + global virtual store setup (pnpm.io/next/git-worktrees, an officially documented multi-agent recipe) makes per-worktree `node_modules` near-zero overhead through symlinks to a shared global store. Cursor users have reported ~9.82 GB used in 20-minute sessions on a 2 GB codebase; Codex caps at 15 worktrees and snapshots before deletion. Lockfile churn and database/port collisions are the two most-reported failure modes. Tools like Clash (clash-sh/clash) attempt pre-write conflict detection via read-only merge simulation, but every team that has shipped this pattern in production accepts that conflicts surface at merge time and uses standard git tooling to resolve them.

4. **The "DAG of tasks" is consistently produced by the planner and executed by an external scheduler — not modeled inside the agent loop.** GitHub's `/fleet` orchestrator decomposes the task into "discrete work items with dependencies, identifies which items can run in parallel versus which must wait, dispatches independent items as background sub-agents simultaneously, polls for completion, then dispatches the next wave" (github.blog Oct 2025). Devin's Manage Devins assigns scoped pieces to separate sessions and reads child trajectories to improve future decomposition. Replit Agent 4 splits tasks across forks and recombines. The planner/scheduler is always *outside* the worker's context window.

5. **LangGraph's parallelism primitives are designed for in-process fan-out, not for filesystem-bound workers.** The `Send()` API and `operator.add` accumulator reducers were built for cases like "summarize 21 chunks in parallel"; they share a single graph/thread and run in one event loop. For long-running, isolated, externally-side-effecting work (an Implementer that owns a worktree for hours), the canonical pattern is **separate threads with separate `thread_id` values, sharing a `PostgresSaver` checkpointer** — not subgraphs in one graph. Singleton-graph + concurrent invocations has a confirmed cross-thread contamination bug in `langgraphjs` (issue #2040, March 2026) when async-local-storage context propagation interacts with shared graph instances under concurrency; mitigations include creating fresh agents per invocation or pinning worker concurrency to 1.

6. **Postgres checkpointer is safe for concurrent threads but does not give you a "merge function" across them.** Each `thread_id` is its own row sequence keyed by `(thread_id, checkpoint_ns, checkpoint_id)`. The maintainers explicitly state "it is entirely safe to share a graph between executions, whether they happen concurrently or not" provided each invocation passes a distinct `thread_id` and a connection from a pool with `autocommit=True`. There is **no built-in "join across threads"**: when you want to aggregate work from N parallel implementer threads back into the orchestrator thread, you do that by *reading* their final state out of the checkpointer (or out of a side table you wrote yourself) and *writing* an aggregated update into the orchestrator thread. Cross-thread reducers do not exist.

7. **Pre-dispatch conflict detection is an ROI sinkhole for solo developers.** Industry tools (Clash, agentree, worktree-cli, `git-worktree-runner`) attempt it; the actual practice that has shipped in incident.io, Anthropic's docs, Augment's docs, Termdock's guides, and Cursor itself is: (a) the planner produces tasks with stated file scopes, (b) you accept that overlapping plans turn into ordinary three-way merges at integration time, (c) you bias toward additive-only changes and "single-writer for hotspot files." Praveen's principle of "deterministic gates own done" extends naturally to this: the integration gate is `git merge --no-ff` returning zero, plus the spine's existing test/lint/typecheck gates re-run on the merged tree.

---

## Details

### Part 1 — Industry Pattern Survey

#### 1.1 Worktree lifecycle: how the production systems do it

| System | Workspace primitive | Branch naming | Cleanup | Limit |
|---|---|---|---|---|
| **Cursor 2.0** (Oct 29, 2025) | git worktree *or* remote VM, chosen per agent | auto, opaque, hidden under temp dir | discard on reject; Apply merges back | 8 concurrent agents on one prompt |
| **Claude Code v2.1.50+** | `.claude/worktrees/<name>/` with branch `worktree-<name>` | `--worktree <name>` CLI flag | auto-prompt on session end: keep / discard | "as many as your disk can hold"; Anthropic recommends 3–5 teammates × 5–6 tasks |
| **OpenAI Codex app** | Codex-managed worktrees | per-thread, named after thread | auto-prune after 15 worktrees; snapshot before deletion | 15 default, configurable |
| **Devin (Managed Devins)** | full isolated VM per child session | branch per session | session archive/terminate via API | concurrency caps by plan (10 on Core, unlimited on Team) |
| **GitHub Copilot CLI `/fleet`** | per-subagent context window; VS Code path uses git worktrees explicitly | per-task | session-bound | "waves" of dispatch, dependency-aware |
| **Replit Agent 4** | "isolated copies of your project" (containers, not git worktrees) | task-board entries | merge or discard per task | 1 background task on Core, up to 10 on Pro |
| **Augment Intent** | per-Space worktree on macOS | per-Space branch | Verifier validates before merge; Coordinator manages merge sequencing | unstated; reports of 371 worktrees anecdotal |

**Convergent worktree mechanics (the "boring consensus"):**

- **Isolation:** worktree gives separate working dir + index + HEAD, shares `.git` object database. Conflict surfaces move from runtime ("silent overwrite") to integration time ("normal three-way merge"). This is universally cited as the *core* benefit.
- **Branch creation:** new branch per worktree, named after the task ID or ticket, branched off `main` (or the parent branch). `git worktree add -b <branch> <path> <base>`.
- **Seeding:** the working directory is the branch checkout. Per-worktree config (`.env`, ports, DB names) is a manual concern; Upsun, Termdock, and others have written entire articles cataloguing the pain.
- **Cleanup policies:** Codex's "keep 15 with snapshot before deletion" is the most operationally mature pattern in the wild. Claude Code's "no changes → auto-remove; changes → prompt" is the simplest.
- **Recovery from crash:** `git worktree repair`, `git worktree prune`, or removal of `.git/worktrees/<name>` plus directory.

**Package-manager interaction.** pnpm with `enableGlobalVirtualStore: true` in `pnpm-workspace.yaml` is the documented approach (pnpm.io/next/git-worktrees) and produces near-zero per-worktree `node_modules` overhead via symlinks into the shared global store. This is the only configuration where running 5–10 worktrees of a real TypeScript monorepo is comfortable on a laptop. Lockfile merge conflicts are a recurring failure mode; mitigations include `npm-merge-driver`-style auto-resolvers or a single-writer rule for `pnpm-lock.yaml` (only the Reviewer regenerates it after merging).

**Practical disk/perf limits.** Concrete numbers from public reports: Cursor users see ~10 GB per ~2 GB repo over 20 minutes of agent activity; XFS or ZFS handles high worktree counts better than ext4 (inode pressure); IDE indexers (Cursor's `/ide`, GitLens) do not always recognize worktrees and waste cycles re-indexing. The realistic ceiling for parallelism on a developer laptop is **3–6 worktrees**, dominated by RAM/CPU for test runners and dev servers, not by git itself.

#### 1.2 Task assignment and DAG execution

The pattern is uniform across all systems that have shipped this:

1. **A planner produces a typed plan.** Anthropic's lead-agent decomposes the query and "describes subtasks to subagents" with "objective, output format, guidance on tools and sources, and clear task boundaries." `/fleet` generates "discrete work items with dependencies." Devin's coordinator "scopes the work, assigns each piece to a managed Devin." CHIP's Architect already does this — the TaskPlan DAG is the same artifact.
2. **A scheduler walks the DAG topologically.** `/fleet`'s orchestrator: "Dispatches independent items as background sub-agents simultaneously. Polls for completion, then dispatches the next wave." This is a standard topological ready-queue. **None of the production systems use a research-grade DAG scheduler (HLFET, MD, RL-based) — they use a simple ready-queue with a concurrency cap.**
3. **Concurrency cap.** Cursor: 8. Claude Code Agent Teams: recommended 3–5 teammates. GitHub Copilot CLI: implicit, governed by your token budget. Devin: plan-tier-bound. The cap exists because the bottleneck is review attention, not compute.
4. **Failure handling.** Universally: a failed task does *not* automatically abort downstream tasks; instead, the orchestrator (or human) decides whether to retry, re-scope, or proceed with degraded coverage. Devin can "read full trajectories of its managed Devins" to learn from failures. Replit reverts via auto-commits. *No production system has written a "fail downstream" cascade comparable to Airflow.*
5. **What makes a task "parallelizable."** The shipped heuristic is consistently file-level disjointness, often expressed as:
   - "3+ unrelated tasks or independent domains, no shared state, clear file boundaries with no overlap" (Claude Code Fast routing rules)
   - "additive-only changes" + "single-writer for hotspot files" (Termdock guide)
   - The Architect/planner is responsible for declaring scope per task. There is **no production-deployed pre-dispatch conflict-detection system** outside experimental tools like Clash (which uses read-only merge simulation as a hint, not a gate).
6. **Manager-Devin "map-reduce-and-manage" specifics.** Cognition's coordinator can: spin up managed Devins, message child sessions mid-task, monitor ACU (compute) consumption, sleep/terminate child sessions, and schedule self-messages for follow-up checkpoints. This is the most operationally mature parallel-coding-agent pattern shipped to date. It is essentially a small workflow engine on top of an MCP server, not anything magic. The architecture lesson: **the manager is a separate process / control plane from the workers, with explicit lifecycle APIs.**

#### 1.3 State coordination across parallel workers

This is where the LangGraph-specific story matters and where most CHIP-adjacent designs go wrong.

**LangGraph subgraphs vs separate threads vs separate graph instances — the right choice depends on whether workers share an event loop.**

- **Subgraphs (single thread, single graph):** Best for in-process map-reduce where workers complete in seconds and share the parent's checkpoint namespace. With `operator.add` / accumulator reducers, parallel workers append to a shared field. Critically, subgraphs invoked in parallel *do not support per-thread persistence multiplexing* — calling the same subgraph multiple times in parallel writes to the same checkpoint namespace and conflicts (LangChain docs explicitly warn this and recommend `ToolCallLimitMiddleware` or per-invocation persistence). This is wrong for CHIP's Implementers because:
  1. Implementers are long-running (minutes to hours).
  2. They produce real filesystem side effects in worktrees.
  3. CHIP's HITL requires resume after process restart, which means *each Implementer needs its own thread row in Postgres* so it can be resumed independently.
- **Separate threads, shared compiled graph:** This is the production pattern. Compile the graph once at process startup; invoke with distinct `thread_id` values. The maintainers confirm "no state is ever stored on the graph instance, and the graph instance isn't ever mutated." Each implementer gets its own checkpoint history, can be resumed independently, can be inspected/replayed, and writes do not interfere. Cross-thread reads are explicit (you query the checkpointer or a side table).
- **Separate graph instances:** Necessary only if the *graph topology* differs per worker. For CHIP, the spine is the same graph for every task; one compiled instance is correct.

**Postgres checkpointer behavior under parallel writes.** `PostgresSaver` / `AsyncPostgresSaver` use parameterized SQL keyed by `thread_id` and `checkpoint_ns`, wrapped in transactions. Concurrent writes to *different* `thread_id`s do not contend; concurrent writes to the *same* `thread_id` from two processes are unsafe (you'd be running two implementers on the same task — don't). The known sharp edge: `langgraphjs` issue #2040 (March 2026) documents data leakage between concurrent invocations under specific conditions involving the singleton `AsyncLocalStorageProviderSingleton` when a graph is reused. The maintainers' recommended workarounds are **(a) create a fresh agent per invocation, or (b) pin worker concurrency to 1 per process**. For CHIP, "1 implementer per Node.js child process" is the safest design and aligns with worktree-per-task isolation.

**Reducer design — when last-write-wins fails.**

- **Last-write-wins is correct** for any field where only one writer exists at a time. CHIP's spine is sequential within a task; 14 of 15 channels are correctly LWW.
- **Accumulator (`operator.add` / array spread) is required** when multiple writers in the same superstep all contribute. CHIP already has this for `humanResponses`. The same pattern should be used for any cross-implementer aggregation field on the orchestrator graph if you ever introduce one (you probably won't — see Part 2).
- **Custom merge functions** become necessary when accumulators don't preserve ordering or when set-semantics matter. LangGraph supports them via `BinaryOperatorAggregate` (TS) / annotated reducers. CHIP should not need any of these for parallel implementers because *implementer state lives in the implementer's own thread, not in the orchestrator's*.

**Cross-worker telemetry aggregation.** Across systems, telemetry is funneled through one of three channels: (a) an event bus / event stream (OpenHands' append-only EventLog, Replit's Mastra event-driven engine), (b) the orchestrator polls per-task status, (c) a side database keyed by task ID. LangGraph has `astream_events(version='v2')` which can stream from any thread. The simplest CHIP design is option (b) + (c): the Orchestrator polls Postgres for task rows it owns and uses `client.threads.getState(thread_id)` to fetch latest implementer state when needed.

**Streaming progress to a single UI.** This is solved by attaching a streamer per thread and multiplexing in the UI, not by trying to fan in inside LangGraph. LangGraph Cloud / LangSmith Studio, the Devin web app, Cursor's Agents window, and Replit's task board all do exactly this.

**Cancellation and pause/resume.** With Postgres checkpointing, cancellation is "stop the worker process; the last successful superstep's state remains in Postgres." Resume is `invoke({ ...None, thread_id })`. Pause/resume across parallel workers therefore just means cancelling and re-enqueuing in the scheduler. **No graph-level "pause all parallel branches" primitive exists or is needed.**

#### 1.4 Sandbox / VM-per-agent alternatives

E2B (Firecracker microVMs, ~150 ms cold start), Daytona (Docker containers, ~27–90 ms), Modal (gVisor), Northflank (Kata/Firecracker BYOC), and Vercel Sandbox cover the cloud-isolation case. They become relevant when (a) you need to run untrusted code, (b) you want full environment parity (databases, ports), or (c) you scale to dozens of concurrent workers. **For a single-developer local TypeScript project, sandboxing is overkill; git worktrees + your own machine is correct.** Defer sandbox-per-implementer until you actually run more workers than your machine has cores or until CHIP runs untrusted PRs from external contributors.

---

### Part 2 — CHIP Design Recommendation

#### 2.1 The architecture in one diagram (text form)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Orchestrator process (Node.js)                                       │
│   ┌────────────────────────────────────────────────────────┐         │
│   │ TaskQueue                                              │         │
│   │   - reads task rows from Postgres (status: ready)      │         │
│   │   - holds a concurrency semaphore (default: 3)         │         │
│   │   - spawns child processes for ready tasks             │         │
│   └────────────────────────────────────────────────────────┘         │
│   ┌────────────────────────────────────────────────────────┐         │
│   │ WorktreeManager                                        │         │
│   │   - git worktree add / remove / prune                  │         │
│   │   - pnpm install (global virtual store)                │         │
│   │   - port allocation per worktree                       │         │
│   └────────────────────────────────────────────────────────┘         │
│   ┌────────────────────────────────────────────────────────┐         │
│   │ MergeCoordinator (single writer to main)               │         │
│   │   - rebase task branch onto main                       │         │
│   │   - run integration gates (test/lint/typecheck/build)  │         │
│   │   - merge --no-ff or reject                            │         │
│   └────────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
        │ spawns (one per task)         shares
        ▼                                ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│ Implementer worker #1    │   │ Postgres                 │
│   - one child process    │◄──┤  - task table            │
│   - one LangGraph thread │   │  - langgraph_checkpoints │
│   - thread_id = task_id  │   │  - shared by all         │
│   - cwd = worktree path  │   └──────────────────────────┘
│   - SPINE: Clarifier →   │
│     Architect → Implem-  │
│     enter → Reviewer     │
└─────────────────────────┘
```

Three deliberate decisions:

1. **The cross-task DAG lives in Postgres rows, not in a LangGraph graph.** The LangGraph spine is the per-task workflow only. The DAG executor is a few hundred lines of Node.
2. **Each task is one thread (`thread_id = task_id`).** This gives independent HITL resume, independent cancellation, and zero cross-thread state-merging logic.
3. **One Implementer worker = one OS process = one worktree.** This sidesteps the langgraphjs #2040 cross-thread contamination concern and makes worktree CWD natural.

#### 2.2 Code-level patterns

**Worktree spawning (TypeScript):**

```ts
// src/orchestrator/worktree-manager.ts
import { execa } from "execa";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

export interface Worktree {
  taskId: string;
  branch: string;       // chip/task/<taskId>
  path: string;         // <repoRoot>/.chip/worktrees/<taskId>
  baseCommit: string;   // sha at creation time
}

export async function createWorktree(args: {
  repoRoot: string;
  taskId: string;
  baseRef: string;          // usually "main"
}): Promise<Worktree> {
  const branch = `chip/task/${args.taskId}`;
  const wtPath = path.join(args.repoRoot, ".chip/worktrees", args.taskId);

  await mkdir(path.dirname(wtPath), { recursive: true });

  // Resolve base commit pinned at dispatch time — every implementer in
  // a given DAG dispatch wave starts from the same commit.
  const { stdout: baseCommit } = await execa("git", [
    "rev-parse", args.baseRef
  ], { cwd: args.repoRoot });

  await execa("git", [
    "worktree", "add",
    "-b", branch,
    wtPath,
    baseCommit.trim()
  ], { cwd: args.repoRoot });

  // pnpm with global virtual store makes this near-instant after first run.
  // Requires `enableGlobalVirtualStore: true` in pnpm-workspace.yaml.
  await execa("pnpm", ["install", "--frozen-lockfile"], { cwd: wtPath });

  return { taskId: args.taskId, branch, path: wtPath, baseCommit: baseCommit.trim() };
}

export async function removeWorktree(repoRoot: string, wt: Worktree): Promise<void> {
  // --force tolerates a dirty tree; we already captured anything we cared about
  // via the commit on the branch.
  await execa("git", ["worktree", "remove", "--force", wt.path], { cwd: repoRoot });
  // We deliberately leave the branch in place until the merge step decides
  // whether to keep or delete it. Praveen's "accept cruft over regression
  // risk" principle: an extra branch is harmless; a deleted branch we needed
  // is recovery work.
}
```

**Task scheduler (the cross-task DAG executor):**

```ts
// src/orchestrator/task-queue.ts
import pg from "pg";

interface Task {
  id: string;
  status: "pending" | "ready" | "running" | "succeeded" | "failed" | "blocked";
  dependsOn: string[];
  fileScopes: string[];     // glob patterns the Architect committed to
  baseCommit: string | null;
}

export class TaskQueue {
  constructor(
    private pool: pg.Pool,
    private maxConcurrency = 3,            // default cap; see §2.3
    private runOne: (task: Task) => Promise<"succeeded" | "failed">,
  ) {}

  async run(): Promise<void> {
    const inFlight = new Set<Promise<void>>();

    while (true) {
      // 1. Promote pending → ready when all deps succeeded.
      await this.pool.query(`
        UPDATE tasks t
        SET status = 'ready'
        WHERE t.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM unnest(t.depends_on) AS dep
            JOIN tasks d ON d.id = dep
            WHERE d.status <> 'succeeded'
          )
      `);

      // 2. Hard stop on any failure: mark unblocked descendants as 'blocked'.
      //    Praveen's "no fallback strategies": we do not try to re-plan; we
      //    surface the failure and let the human decide.
      await this.pool.query(`
        UPDATE tasks SET status = 'blocked'
        WHERE status IN ('pending','ready')
          AND id IN (
            SELECT t.id FROM tasks t
            WHERE EXISTS (
              SELECT 1 FROM unnest(t.depends_on) AS dep
              JOIN tasks d ON d.id = dep
              WHERE d.status = 'failed'
            )
          )
      `);

      // 3. Pull up to (cap - inFlight) ready tasks atomically.
      const slots = this.maxConcurrency - inFlight.size;
      if (slots <= 0) {
        await Promise.race(inFlight);
        continue;
      }

      const { rows } = await this.pool.query<Task>(`
        UPDATE tasks SET status = 'running'
        WHERE id IN (
          SELECT id FROM tasks WHERE status = 'ready'
          ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `, [slots]);

      if (rows.length === 0 && inFlight.size === 0) {
        break;  // DAG complete or fully blocked.
      }

      for (const task of rows) {
        const p = this.runOne(task)
          .then(outcome => this.pool.query(
            `UPDATE tasks SET status = $1 WHERE id = $2`,
            [outcome, task.id]
          ))
          .catch(err => this.pool.query(
            `UPDATE tasks SET status = 'failed', failure_reason = $1 WHERE id = $2`,
            [String(err), task.id]
          ))
          .finally(() => { inFlight.delete(p); });
        inFlight.add(p);
      }

      if (rows.length === 0) await Promise.race(inFlight);
    }
  }
}
```

**Implementer worker process (one per task; SPINE inside):**

```ts
// src/worker/implementer-worker.ts
// Spawned by the orchestrator as a Node.js child process.
// argv: [taskId, worktreePath]

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { compileSpineGraph } from "../spine/graph.js";  // CHIP's existing 4-stage spine

const [, , taskId, worktreePath] = process.argv;

process.chdir(worktreePath);  // Spine tools (read FS, write FS, run tests) inherit this cwd.

const checkpointer = PostgresSaver.fromConnString(process.env.PG_URL!, {
  // autocommit on the connection pool: required pattern from LangGraph forum
});
const graph = compileSpineGraph({ checkpointer });

// thread_id = task_id is the contract: one task = one thread = one worktree.
const config = { configurable: { thread_id: taskId } };

try {
  const result = await graph.invoke(
    // input is null on resume; orchestrator sets initial state via update_state
    // or via the first invoke from cold-start.
    null,
    config
  );

  // Commit whatever the spine produced. The spine's Reviewer stage already
  // ran deterministic gates before reaching here.
  await commitAndPush(taskId);
  process.exit(0);
} catch (err) {
  // Praveen's "no fallback strategies": no retry inside the worker.
  // Failure is observable: orchestrator marks the task failed; human decides.
  console.error(JSON.stringify({ taskId, err: String(err) }));
  process.exit(1);
}
```

**Why a child process and not just a Promise.all of graph.invoke calls?** Three reasons, in order of importance:

1. **Process isolation makes `process.chdir(worktreePath)` safe.** Multiple implementers in one process would fight over `cwd`.
2. It sidesteps the langgraphjs singleton-graph contamination class of bugs (issue #2040).
3. A crashed implementer (OOM, segfault in a native dep) does not kill the orchestrator.

**State channel design — what NOT to add.** CHIP's existing 15 channels are the per-task spine state. **Do not add cross-implementer aggregation channels to the spine state.** Instead, the Orchestrator reads completed-task results out of Postgres (either from the `tasks` table you control, or by introspecting checkpoints with `checkpointer.aget(thread_id)`).

If you ever genuinely need an "all implementers feeding one orchestrator graph" pattern (you probably won't), the right primitive is **a separate orchestrator graph with one accumulator channel and one thread**, where each implementer worker, on completion, calls `orchestratorGraph.updateState(orchestratorThreadId, { completedTasks: [{taskId, summary}] })`. This is `operator.add` semantics across processes, glued by Postgres. It is a strictly worse design than just reading the tasks table, and you should resist it until measurable failure forces it.

#### 2.3 Decision points (2-3 options each)

**Decision A: Where does the cross-task DAG executor live?**

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **A1. Plain Node TaskQueue + Postgres** (above) | ~300 LOC, no new deps; Postgres already required for HITL; transparent failure modes | You write the topo-sort and dependency promotion logic | **Pick this.** Simplest workable path; honors "defer complexity until measurable need." |
| A2. BullMQ + Redis | Battle-tested job queue, retries, dashboards | New infra dep (Redis); retry semantics conflict with "no fallback strategies"; ID stitching with Postgres | Reject for now. |
| A3. LangGraph orchestrator graph with `Send()` to per-task subgraphs | Looks elegant on paper | `Send()` runs in one process / one thread; it is *not* a cross-process dispatcher; subgraph parallelism + persistence has known sharp edges | Reject. The LangGraph maintainers' position is that `Send()` is map-reduce in-process; it is not what you want for filesystem-bound long-running workers. |

**Decision B: How are the parallel implementers' threads modeled?**

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **B1. One LangGraph thread per task; `thread_id = task_id`; one OS process per worker** | Clean isolation; safe with `PostgresSaver`; HITL resume works per task; matches industry orchestrator-worker | Slight memory overhead (Node child process per worker; 3–6 in flight ≈ a few hundred MB) | **Pick this.** |
| B2. One thread per task, but all workers share one Node.js process | Less RAM | `process.chdir` race; possible langgraphjs cross-thread contamination under concurrency | Reject. |
| B3. Subgraph per implementer inside one orchestrator graph | "All in LangGraph" feel | Loses per-task resume; cannot run for hours; checkpoint-namespace conflicts on parallel same-subgraph calls | Reject. |

**Decision C: Conflict prevention strategy at dispatch time.**

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **C1. Architect emits per-task `fileScopes` (glob list); Orchestrator rejects any pair of concurrently-dispatched tasks whose globs overlap** | Cheap, deterministic, debuggable; aligns with the Architect being the "design authority" in CHIP's spine | Architect must be honest about scope; some overlap will still happen on shared files (router tables, lockfile) | **Pick this.** Add a single-writer rule for `pnpm-lock.yaml` (only the post-merge step regenerates it). |
| C2. Read-only merge simulation à la Clash, run pre-dispatch | Catches more conflicts | New dependency; non-trivial false positives; not how anyone in production actually operates | Defer until C1 produces measurable pain. |
| C3. No prevention; treat all conflicts as merge-time concerns | Operationally simplest | Predictable wasted work when two implementers touch the same file for hours | Reject; cheap prevention via globs is worth the cost. |

#### 2.4 Failure modes specific to CHIP's design — and how to handle them

1. **Lockfile churn on merge.** Two implementers each run `pnpm install` after adding a dep; their lockfiles differ on hundreds of lines. **Handler:** designate `pnpm-lock.yaml` and `pnpm-workspace.yaml` as "Reviewer-only writable"; per-implementer changes to `package.json` deps are permitted, but the post-merge MergeCoordinator regenerates the lockfile against the merged `package.json` from all branches. Add `.gitattributes`: `pnpm-lock.yaml merge=ours` plus an explicit re-resolution step in MergeCoordinator. (Alternative: prohibit dep additions inside parallel implementers; that's stricter but cleaner.)
2. **Port collisions on dev servers / DBs.** Two implementers running tests both want port 5432. **Handler:** WorktreeManager assigns a port range per worktree (e.g., `5432 + 10*slotIndex`), exported as env vars; the test scripts read `process.env.DB_PORT`. This is mundane and unavoidable.
3. **Postgres checkpointer connection pool exhaustion.** Each implementer process opens its own pool. **Handler:** small pools (size 2 per worker) plus `autocommit=true` per the LangGraph forum guidance. Cap concurrency at 3–6 to keep total connections small.
4. **HITL during a parallel implementer.** Implementer pauses on `interrupt()`, but the Orchestrator has dispatched 2 other implementers that may also be requesting human input. **Handler:** the Orchestrator surfaces *all* pending interrupts in a single UI list; resume is per-thread (`graph.updateState(thread_id, ...)`). Praveen's "deterministic gates own done" principle applies: the spine's gate, not the LLM, decides what counts as a complete answer to a HITL question.
5. **Implementer crash mid-superstep.** Process dies; checkpoint is at the last successful superstep. **Handler:** Orchestrator's TaskQueue detects via process exit code; flips task to `failed`; a human re-enqueues by setting status back to `ready` (which causes `task_id`-keyed thread to be resumed from the checkpoint). No automatic retry — that violates "no fallback strategies."
6. **Worktree drift from `main`.** Long-running implementer's base commit is now hours old; merge is messy. **Handler:** MergeCoordinator does `git rebase main` on the task branch *before* attempting merge; if rebase has conflicts, mark task `needs_human` and stop. Do not attempt automated rebase conflict resolution.
7. **Disk pressure from accumulated worktrees.** **Handler:** Codex-style policy — keep last N (default 15) merged worktrees; auto-prune older with snapshot to a `.chip/snapshots/` tarball before deletion. Cheap, recoverable.
8. **The langgraphjs cross-thread contamination class (issue #2040).** **Handler:** the worker-per-process design + concurrency=1 inside each worker process makes this a non-issue. This is the single biggest reason to reject "share one Node process."

#### 2.5 Build sequencing (what to ship, in order)

The integration spike comes first, per Praveen's principles. Each step ends with something runnable end-to-end on a real two-task DAG.

**Spike (Day 1–3):** WorktreeManager + a smoke test that creates two worktrees, installs deps via pnpm global virtual store, runs `pnpm test` in both, removes them. Goal: prove the local environment can sustain 2–3 concurrent worktrees. **Exit gate:** two `pnpm test` runs complete green in parallel on a real CHIP package.

**Build 1 (Week 1):** TaskQueue with hard-coded 2-task DAG, no real implementer (just a stub that writes a file and exits 0). Postgres `tasks` table; topo-sort; concurrency cap. **Exit gate:** scheduler runs the DAG to completion, status transitions visible in DB.

**Build 2 (Week 2):** Implementer worker as a child process, but using a *trivial* one-node LangGraph graph with PostgresSaver. **Exit gate:** kill -9 the worker mid-run, restart, observe resume from checkpoint. This proves the durability story before the real spine is wired in.

**Build 3 (Week 3):** Wire CHIP's actual SPINE graph into the worker. Per-task gates (test/lint/typecheck) run inside the spine's Reviewer stage. **Exit gate:** one real Architect-produced 2-task plan executes end-to-end, both tasks merge.

**Build 4 (Week 4):** MergeCoordinator with rebase-then-merge, `--no-ff`, post-merge integration gate. **Exit gate:** intentional file-overlap between two tasks produces a clear "needs human" status, not a silent corruption.

**Build 5 (Week 5+, only if measurable):** Streaming UI; cancellation; advanced cleanup; per-worktree port allocation if test infra demands it.

#### 2.6 Open questions / things requiring further investigation

1. **Does CHIP's existing humanResponses accumulator channel survive when an implementer runs in a child process?** The serialization round-trip through Postgres should be transparent, but verify with a test that interrupts mid-spine and resumes.
2. **What is the actual practical concurrency cap on Praveen's hardware?** This is "run the spike, measure, set the default." Don't guess.
3. **Should the Orchestrator be a LangGraph graph too?** Probably not initially — a plain async TS class is simpler and the Orchestrator is doing systems work (process management, git ops, DB queries), not LLM work. If the Orchestrator ever grows an LLM-driven re-planning step (Devin-style "read child trajectories to improve next dispatch"), revisit then.
4. **How do shared READ contexts (design system, API contracts) get into the implementer's worktree?** Default answer: they're in the repo, so they're in the worktree by definition. If they live outside the repo, mount them read-only via symlink at worktree creation. Avoid copying.
5. **What's the policy for task plans whose globs declare "everything"?** The Architect must be constrained to refuse such plans, or the Orchestrator must serialize them. This is a prompt/contract decision, not a code decision.

---

### Part 3 — Red flags and rejected approaches

**Patterns that will look attractive but conflict with CHIP's commitments:**

1. **"Use LangGraph subgraphs + `Send()` for the parallel implementers."** Conflicts with: HITL resume per task, long-running workers, sequential-spine-as-non-negotiable. The `Send()` API is map-reduce within one thread/process. The LangChain docs themselves warn against parallel calls to the same subgraph with stateful persistence. Reject.
2. **"Use accumulator reducers on the orchestrator state for cross-implementer aggregation."** This is the LangGraph idiom for in-process map-reduce; CHIP's parallelism is across processes/worktrees over hours. The right cross-process aggregator is a Postgres table. Reject the temptation to "stay inside LangGraph" for everything.
3. **"Add a multi-agent supervisor (langgraph-supervisor) to coordinate Implementers."** The supervisor pattern presupposes peer-to-peer LLM agents that hand off control via tool calls. CHIP's Implementers are not peers; they're parallel single-task pipelines. The supervisor library is also being deprecated in favor of the manual tool-calling pattern (per the langgraph-supervisor-py README, late 2025). Reject.
4. **"Build pre-dispatch conflict detection by simulating merges (Clash-style)."** Solves the wrong problem at the wrong cost. The cheap version (Architect declares file globs; Orchestrator checks overlap) catches 80% at 5% of the cost. Defer the merge-simulation approach until that 80% is empirically insufficient.
5. **"Run each Implementer in a Daytona/E2B sandbox for stronger isolation."** Sandboxes solve adversarial-code and environment-parity problems. Single-developer CHIP has neither. Worktrees on local disk are the right primitive until you scale beyond one dev or run third-party PRs.
6. **"Add automatic retry with exponential backoff in the Implementer worker."** Directly contradicts "no fallback strategies" and "deterministic gates own done." Failures should surface, not paper over. Reject.
7. **"Build a custom DAG scheduler with priorities, deadlines, and admission control like the academic 2025-2026 papers (DAG-Plan, Graph Harness, Routine, TDP)."** The production systems use a ready-queue with a concurrency cap. So should CHIP. Defer the research-grade scheduler until Praveen has measurable evidence the simple one is the bottleneck (he won't, for years).
8. **"Implement Devin-style 'manager agent reads child trajectories to learn'."** Cool, advanced, and only earns its complexity at a scale where the same DAG runs hundreds of times. Single developer, varied tasks: defer indefinitely.

**Industry approaches that don't translate to CHIP's TypeScript/LangGraph context:**

- **Cursor's "8 agents on the same prompt, pick the best."** This is best-of-N exploration, not DAG decomposition. CHIP's Architect produces *different* tasks, not N attempts at the *same* task. If you want best-of-N on a single task, that's a separate later feature, not part of the cross-task parallelism design.
- **Replit's "split a task into forks, recombine, sub-agents resolve conflicts."** Replit owns the runtime; conflicts are resolvable by re-running everything in a container. CHIP has a real git history; auto-conflict-resolution is the wrong default for human-reviewable code.
- **Anthropic's "lead agent prompts subagents with detailed task descriptions."** This pattern *does* translate — it's literally what the Architect → Implementer prompt should look like. The right CHIP version: the Architect's TaskPlan items each include objective, output format, file scopes, success criteria (deterministic gates), and explicit non-goals. This is mostly a prompt-engineering concern, not an architecture concern.

**Things to explicitly defer until measurable failure:**

- Per-worktree database / Docker isolation (current pattern: shared dev DB with namespaced schemas, accept the cruft).
- Streaming progress UI (until you actually run >2 implementers for >10 minutes, you don't need it).
- Cross-worker telemetry aggregation (Postgres rows + occasional `SELECT` is sufficient).
- Pause-all/resume-all semantics (cancel-and-re-enqueue covers it).
- Sandbox-per-implementer (zero-trust scenarios don't exist for solo dev).
- Pre-dispatch merge simulation (file-glob disjointness is enough until proven otherwise).
- LangGraph-orchestrator-graph (a plain TS class is simpler and the Orchestrator is doing systems work).
- Retry / fallback logic of any kind.

---

## Recommendations

1. **Adopt the "one task = one thread = one worktree = one OS process" rule as the foundational invariant.** Everything else (scheduling, channels, cleanup) gets simpler when this is fixed. *Threshold to revisit:* if you ever need two implementers to coordinate live (e.g., one consumes the other's partial output mid-run), which is *not* what cross-task parallelism is for. If that need appears, scope it as "split the task differently in the Architect," not "add inter-worker comms."

2. **Build the spike first (WorktreeManager + 2-worktree pnpm test).** Until two real `pnpm test` runs complete in parallel on Praveen's actual machine without disk/CPU/lockfile pain, no scheduling work matters. *Threshold to abandon worktrees entirely:* if pnpm global virtual store still produces >2× node_modules duplication or if test parallelism is hopelessly contended on shared dev DB, switch to Docker-Compose-per-worktree (the next step up in isolation). Empirically unlikely on a TS monorepo.

3. **Use a plain TS TaskQueue + Postgres `tasks` table for the cross-task DAG.** Do not put the DAG inside LangGraph. *Threshold to upgrade:* you'd switch to BullMQ only if you start needing reliable cron-driven dispatch or distributed workers across multiple machines. Single-developer local: never.

4. **Make the Architect commit to per-task file globs and let the Orchestrator check overlap pre-dispatch.** Reject any plan whose ready-set has overlapping globs; force the Architect to revise. *Threshold to add merge-simulation:* you observe ≥3 cases where overlap-by-globs returned "fine" but the actual files conflicted catastrophically. Until then, additive-only conventions plus a single-writer rule for `pnpm-lock.yaml` are enough.

5. **Set the default concurrency cap to 3, configurable.** Industry caps cluster at 3–8; for a solo developer reviewing PRs, 3 is the sweet spot for review attention. *Threshold to raise:* you measure that the bottleneck is implementer wall time, not your review time. Threshold to lower: laptop thrashes.

6. **Defer everything labeled "advanced": cancellation propagation, streaming UI, sandbox-per-agent, LLM-driven re-planning, automatic conflict resolution, retry logic.** Each of these has a real cost and no current use case. *Threshold to add any of them:* a written-down failure mode you have actually hit twice.

7. **Treat the "Dive into Claude Code" finding (98.4% of the codebase is operational infrastructure, 1.6% is AI logic) as the budget allocation guide.** CHIP's hard problems will be: pnpm worktree config, Postgres connection pooling, port allocation, merge gates, HITL resume across processes. They will not be: prompt engineering for the Implementer, LLM choice, agent-loop topology. Spend accordingly.

---

## Caveats

- **The "Dive into Claude Code" arXiv ID (2604.14228) is dated April 14, 2026 v1.** That's the actual paper ID; arXiv's 2604 prefix is correct (it's not a typo). The paper analyzes Claude Code v2.1.88's TypeScript source. I treat its claims about subagent/worktree isolation as authoritative because they are source-traced; its broader design-philosophy claims are interpretation.
- **Walden Yan's "Multi-Agents: What's Actually Working" is a Cognition company blog, not a peer-reviewed source.** It is clearly self-interested (Devin/Windsurf marketing) but the underlying technical claim — single-writer rule, read-only subagents work, parallel-writer swarms still don't — is corroborated by Anthropic's blog and by the Liu et al. paper.
- **Cursor 2.0's "up to 8 parallel agents" claim is a product claim, not an external benchmark.** Several third-party reports (Digital Applied, Grow Fast) repeat the figure but are SEO/affiliate-flavored; the primary source is cursor.com/changelog/2-0 and cursor.com/blog/2-0 (Oct 29, 2025), which I treat as authoritative on what shipped.
- **The langgraphjs cross-thread contamination issue (#2040) is open as of March 2026; the maintainers' workaround guidance is what I'm reporting, not a fix.** If the issue is closed by the time you implement, re-check whether worker-per-process is still necessary; it may not be. Worker-per-process is still defensible for the worktree-cwd-isolation reason alone.
- **The pnpm `enableGlobalVirtualStore` recipe is from pnpm's official docs (pnpm.io/next/git-worktrees) and is positioned as the recommended multi-agent setup.** It depends on pnpm version supporting that flag (verify on Praveen's pnpm version; this is a 2025-era feature and any current pnpm should have it).
- **Some 2026-dated sources (Augment Intent docs, agent-orchestrator templates, some Medium posts) are commercial product marketing.** I've used them only to corroborate patterns, not as primary architectural authority. The primary authorities are: cursor.com, anthropic.com/engineering, cognition.ai/blog, code.claude.com/docs, langchain-ai/langgraph GitHub, the Liu et al. paper, and the LangGraph official docs.
- **I deliberately did not search for or use sources behind paywalls or for content that requires authentication.** Some Cognition / Cursor enterprise deployment guides may exist but were not consulted; the public material is sufficient for the patterns claimed here.
- **The recommendation to use child processes (rather than `worker_threads` or async tasks) is conservative.** `worker_threads` would also work and use less RAM, but they share the parent's `process.cwd()` representation in some Node versions and would re-introduce the chdir race. Prefer the simpler, slightly heavier choice until you measure RAM as a constraint.