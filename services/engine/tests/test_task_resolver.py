"""Tests for dependency resolution."""

from __future__ import annotations

from agentforge_engine.models import TaskEntry
from agentforge_engine.task_resolver import (
    detect_circular_deps,
    find_runnable_tasks,
    on_task_completed,
)


def _task(
    tid: str,
    status: str = "pending",
    depends: list[str] | None = None,
) -> TaskEntry:
    return TaskEntry(
        id=tid,
        title=tid,
        phase="code",
        agent="agent",
        status=status,
        depends_on=depends or [],
        spec_ref="s",
    )


def test_find_runnable_no_deps() -> None:
    tasks = [_task("a"), _task("b")]
    assert len(find_runnable_tasks(tasks)) == 2


def test_find_runnable_with_deps() -> None:
    tasks = [
        _task("a", status="completed"),
        _task("b", depends=["a"]),
        _task("c", depends=["b"]),
    ]
    runnable = find_runnable_tasks(tasks)
    assert [t.id for t in runnable] == ["b"]


def test_diamond_deps() -> None:
    """B and C depend on A; D depends on both B and C."""
    tasks = [
        _task("a", status="completed"),
        _task("b", depends=["a"], status="completed"),
        _task("c", depends=["a"]),
        _task("d", depends=["b", "c"]),
    ]
    runnable = find_runnable_tasks(tasks)
    assert [t.id for t in runnable] == ["c"]


def test_on_task_completed_unblocks() -> None:
    tasks = [
        _task("a", status="completed"),
        _task("b", depends=["a"]),
    ]
    newly = on_task_completed("a", tasks)
    assert [t.id for t in newly] == ["b"]


def test_on_task_completed_diamond() -> None:
    """Completing C unblocks D (B already completed)."""
    tasks = [
        _task("a", status="completed"),
        _task("b", status="completed", depends=["a"]),
        _task("c", status="completed", depends=["a"]),
        _task("d", depends=["b", "c"]),
    ]
    newly = on_task_completed("c", tasks)
    assert [t.id for t in newly] == ["d"]


def test_circular_dep_detection() -> None:
    tasks = [
        _task("a", depends=["c"]),
        _task("b", depends=["a"]),
        _task("c", depends=["b"]),
    ]
    cycles = detect_circular_deps(tasks)
    assert len(cycles) > 0
    # All three should appear in at least one cycle.
    all_ids = {tid for cycle in cycles for tid in cycle}
    assert {"a", "b", "c"} <= all_ids
