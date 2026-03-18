"""Spec phase LangGraph graph.

Graph flow:
  spec_writing → task_decomposition → human_review*

Nodes marked with * use interrupt_before for HITL gates.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, StateGraph

from ..config import update_task_status
from ..event_bridge import write_event
from ..models import SpecComplete, TasksCreated
from .common import BasePhaseState


class SpecPhaseState(BasePhaseState, total=False):
    """State specific to the spec phase."""

    design_ref: str
    spec_output: str
    tasks_decomposed: list[str]


def _spec_writing(state: SpecPhaseState) -> dict:
    """Generate specifications from design artifacts."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "spec-task"
    spec_ref = f"specs/{task_id}.yaml"

    update_task_status(project_root, task_id, "in_progress")
    write_event(
        project_root,
        SpecComplete(specRef=spec_ref, taskId=task_id),
    )
    return {"spec_output": spec_ref}


def _task_decomposition(state: SpecPhaseState) -> dict:
    """Decompose spec into implementation tasks."""
    project_root = Path(state["project_root"])
    # Generate placeholder task IDs for decomposed work.
    new_task_ids = [f"code-task-{i}" for i in range(1, 4)]

    write_event(
        project_root,
        TasksCreated(taskCount=len(new_task_ids), taskIds=new_task_ids),
    )
    return {"tasks_decomposed": new_task_ids}


def _human_review(state: SpecPhaseState) -> dict:
    """HITL gate — graph is interrupted before this node."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "spec-task"
    decision = state.get("hitl_decision", "approved")

    if decision == "approved":
        update_task_status(project_root, task_id, "completed")
    elif decision == "changes_requested":
        update_task_status(project_root, task_id, "changes_requested")

    return {"hitl_decision": None}


def build_spec_graph() -> StateGraph:
    """Construct the spec phase LangGraph StateGraph."""
    graph = StateGraph(SpecPhaseState)

    graph.add_node("spec_writing", _spec_writing)
    graph.add_node("task_decomposition", _task_decomposition)
    graph.add_node("human_review", _human_review)

    graph.set_entry_point("spec_writing")
    graph.add_edge("spec_writing", "task_decomposition")
    graph.add_edge("task_decomposition", "human_review")
    graph.add_edge("human_review", END)

    return graph
