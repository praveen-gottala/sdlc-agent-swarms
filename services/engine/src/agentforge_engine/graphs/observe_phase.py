"""Observe phase LangGraph graph.

Graph flow:
  monitor → END

Minimal scaffolding for the observe phase. The single "monitor" node
transitions the first task through pending → active → complete and
emits PhaseStarted / PhaseComplete events.  No actual agent execution
— this is a placeholder for future observability agents.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, StateGraph

from ..config import update_task_status
from ..event_bridge import write_event
from ..models import PhaseStarted, PhaseComplete
from .common import BasePhaseState


class ObservePhaseState(BasePhaseState, total=False):
    """State specific to the observe phase."""

    monitor_status: str


def _monitor(state: ObservePhaseState) -> dict:
    """Placeholder monitor node — transitions task pending → active → complete."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "observe-task"

    write_event(project_root, PhaseStarted(phase="observe"))

    update_task_status(project_root, task_id, "in_progress")
    update_task_status(project_root, task_id, "completed")

    write_event(project_root, PhaseComplete(phase="observe"))

    return {"monitor_status": "complete"}


def build_observe_graph() -> StateGraph:
    """Construct the observe phase LangGraph StateGraph."""
    graph = StateGraph(ObservePhaseState)

    graph.add_node("monitor", _monitor)

    graph.set_entry_point("monitor")
    graph.add_edge("monitor", END)

    return graph
