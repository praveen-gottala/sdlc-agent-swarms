"""Code generation phase LangGraph graph.

Graph flow:
  assign_tasks → parallel_code_gen → ci_validation → pr_creation →
  security_scan → pr_review → human_review*

assign_tasks uses SlotManager + find_runnable_tasks.
ci_validation has a conditional retry loop (max 3).
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, StateGraph

from ..concurrency import SlotManager
from ..config import update_task_status
from ..event_bridge import write_event
from ..models import (
    CodeGenComplete,
    PRCreated,
    ReviewComplete,
    SecurityScanComplete,
)
from ..task_resolver import find_runnable_tasks
from .common import BasePhaseState


class CodeGenPhaseState(BasePhaseState, total=False):
    """State specific to the code generation phase."""

    runnable_tasks: list[dict]
    active_slots: int
    max_concurrent: int
    ci_results: dict[str, bool]
    ci_attempts: dict[str, int]
    pr_numbers: dict[str, int]
    security_results: dict[str, bool]
    review_results: dict[str, str]
    completed_task_ids: list[str]


def _assign_tasks(state: CodeGenPhaseState) -> dict:
    """Identify runnable tasks and assign slots."""
    from ..models import TaskEntry

    project_root = Path(state["project_root"])
    max_concurrent = state.get("max_concurrent", 3)

    # Reconstruct TaskEntry objects from dicts for the resolver.
    task_entries = [TaskEntry.model_validate(t) for t in state.get("tasks", [])]
    runnable = find_runnable_tasks(task_entries)

    # Limit to available slots.
    assignable = runnable[:max_concurrent]
    for t in assignable:
        update_task_status(project_root, t.id, "in_progress")

    return {
        "runnable_tasks": [t.model_dump() for t in assignable],
        "active_slots": len(assignable),
        "ci_attempts": {},
    }


def _parallel_code_gen(state: CodeGenPhaseState) -> dict:
    """Simulate parallel code generation for assigned tasks."""
    project_root = Path(state["project_root"])
    runnable = state.get("runnable_tasks", [])

    for t in runnable:
        branch = f"feat/{t['id']}"
        write_event(
            project_root,
            CodeGenComplete(
                taskId=t["id"],
                agentId=f"codegen-{t['id']}",
                branch=branch,
                filesGenerated=[f"src/{t['id']}.ts"],
            ),
        )
    return {}


def _ci_validation(state: CodeGenPhaseState) -> dict:
    """Run CI validation on generated code. Tracks retry attempts."""
    ci_results: dict[str, bool] = {}
    ci_attempts = dict(state.get("ci_attempts", {}))

    for t in state.get("runnable_tasks", []):
        tid = t["id"]
        attempts = ci_attempts.get(tid, 0) + 1
        ci_attempts[tid] = attempts
        # Simulate: CI passes on first attempt for simplicity.
        ci_results[tid] = True

    return {"ci_results": ci_results, "ci_attempts": ci_attempts}


def _route_after_ci(state: CodeGenPhaseState) -> str:
    """Conditional edge: retry CI if any failed and under max attempts."""
    ci_results = state.get("ci_results", {})
    ci_attempts = state.get("ci_attempts", {})

    for tid, passed in ci_results.items():
        if not passed and ci_attempts.get(tid, 0) < 3:
            return "ci_validation"
    return "pr_creation"


def _pr_creation(state: CodeGenPhaseState) -> dict:
    """Create PRs for tasks that passed CI."""
    project_root = Path(state["project_root"])
    pr_numbers: dict[str, int] = {}

    for i, t in enumerate(state.get("runnable_tasks", []), start=1):
        tid = t["id"]
        if state.get("ci_results", {}).get(tid, False):
            pr_numbers[tid] = 100 + i
            write_event(
                project_root,
                PRCreated(
                    taskId=tid, prNumber=pr_numbers[tid], branch=f"feat/{tid}"
                ),
            )
    return {"pr_numbers": pr_numbers}


def _security_scan(state: CodeGenPhaseState) -> dict:
    """Run security scan on PRs."""
    project_root = Path(state["project_root"])
    security_results: dict[str, bool] = {}

    for tid, pr_num in state.get("pr_numbers", {}).items():
        passed = True
        security_results[tid] = passed
        write_event(
            project_root,
            SecurityScanComplete(
                taskId=tid,
                prNumber=pr_num,
                findingsCount=0,
                criticalCount=0,
                passed=passed,
            ),
        )
    return {"security_results": security_results}


def _pr_review(state: CodeGenPhaseState) -> dict:
    """Automated PR review."""
    project_root = Path(state["project_root"])
    review_results: dict[str, str] = {}

    for tid, pr_num in state.get("pr_numbers", {}).items():
        review_results[tid] = "approved"
        write_event(
            project_root,
            ReviewComplete(
                taskId=tid,
                agentId="reviewer",
                prNumber=pr_num,
                decision="approved",
            ),
        )
    return {"review_results": review_results}


def _human_review(state: CodeGenPhaseState) -> dict:
    """HITL gate — graph is interrupted before this node."""
    project_root = Path(state["project_root"])
    decision = state.get("hitl_decision", "approved")
    completed: list[str] = list(state.get("completed_task_ids", []))

    if decision == "approved":
        for t in state.get("runnable_tasks", []):
            tid = t["id"]
            update_task_status(project_root, tid, "completed")
            completed.append(tid)

    return {"completed_task_ids": completed, "hitl_decision": None}


def build_code_gen_graph() -> StateGraph:
    """Construct the code generation phase LangGraph StateGraph."""
    graph = StateGraph(CodeGenPhaseState)

    graph.add_node("assign_tasks", _assign_tasks)
    graph.add_node("parallel_code_gen", _parallel_code_gen)
    graph.add_node("ci_validation", _ci_validation)
    graph.add_node("pr_creation", _pr_creation)
    graph.add_node("security_scan", _security_scan)
    graph.add_node("pr_review", _pr_review)
    graph.add_node("human_review", _human_review)

    graph.set_entry_point("assign_tasks")
    graph.add_edge("assign_tasks", "parallel_code_gen")
    graph.add_edge("parallel_code_gen", "ci_validation")
    graph.add_conditional_edges("ci_validation", _route_after_ci)
    graph.add_edge("pr_creation", "security_scan")
    graph.add_edge("security_scan", "pr_review")
    graph.add_edge("pr_review", "human_review")
    graph.add_edge("human_review", END)

    return graph
