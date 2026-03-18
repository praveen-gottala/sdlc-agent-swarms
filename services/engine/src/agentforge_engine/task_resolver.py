"""Dependency resolution for SDLC tasks.

Determines which tasks are runnable based on their status and
the completion status of their dependencies.
"""

from __future__ import annotations

from .models import TaskEntry


def find_runnable_tasks(tasks: list[TaskEntry]) -> list[TaskEntry]:
    """Return tasks that are pending and have all dependencies completed."""
    completed_ids = {t.id for t in tasks if t.status == "completed"}
    return [
        t
        for t in tasks
        if t.status == "pending"
        and all(dep in completed_ids for dep in t.depends_on)
    ]


def on_task_completed(
    task_id: str, tasks: list[TaskEntry]
) -> list[TaskEntry]:
    """Return newly unblocked tasks after *task_id* completes.

    A task is "newly unblocked" when it is pending, all of its
    dependencies are now completed (including *task_id*), and it was
    *not* already runnable before this completion.
    """
    completed_ids = {t.id for t in tasks if t.status == "completed"}
    # task_id might not be in completed_ids yet if the caller hasn't
    # updated the status, so add it defensively.
    completed_ids.add(task_id)

    previously_completed = completed_ids - {task_id}

    newly_unblocked: list[TaskEntry] = []
    for t in tasks:
        if t.status != "pending":
            continue
        all_deps_done = all(dep in completed_ids for dep in t.depends_on)
        was_runnable = all(dep in previously_completed for dep in t.depends_on)
        if all_deps_done and not was_runnable:
            newly_unblocked.append(t)
    return newly_unblocked


def detect_circular_deps(tasks: list[TaskEntry]) -> list[list[str]]:
    """Return a list of cycles found in the task dependency graph.

    Each cycle is a list of task IDs forming a loop.
    """
    task_map = {t.id: t for t in tasks}
    visited: set[str] = set()
    in_stack: set[str] = set()
    path: list[str] = []
    cycles: list[list[str]] = []

    def _dfs(tid: str) -> None:
        if tid in in_stack:
            # Extract cycle from path.
            idx = path.index(tid)
            cycles.append(path[idx:] + [tid])
            return
        if tid in visited:
            return
        visited.add(tid)
        in_stack.add(tid)
        path.append(tid)
        task = task_map.get(tid)
        if task:
            for dep in task.depends_on:
                _dfs(dep)
        path.pop()
        in_stack.discard(tid)

    for t in tasks:
        if t.id not in visited:
            _dfs(t.id)

    return cycles
