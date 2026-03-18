"""Design phase LangGraph graph.

Graph flow:
  page_request → ux_research → wireframe → human_review* →
  visual_design → design_review → human_approve*

Nodes marked with * use interrupt_before for HITL gates.
Conditional edge after human_review: changes_requested loops to wireframe.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, StateGraph

from ..config import load_tasks, save_tasks, update_task_status
from ..event_bridge import write_event
from ..models import (
    DesignPhaseComplete,
    DesignReviewComplete,
    PageRequested,
    TasksFile,
    UXResearchComplete,
    VisualDesignComplete,
    WireframeApproved,
    WireframeComplete,
)
from .common import BasePhaseState


class DesignPhaseState(BasePhaseState, total=False):
    """State specific to the design phase."""

    page_id: str
    page_description: str
    ux_research_output: list[str]
    wireframe_ref: str
    visual_design_ref: str
    review_result: str  # "approved" | "changes_requested"


def _page_request(state: DesignPhaseState) -> dict:
    """Emit PageRequested event and initialise phase tracking."""
    project_root = Path(state["project_root"])
    page_id = state.get("page_id", "page-1")
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "design-task"
    description = state.get("page_description", "")

    write_event(
        project_root,
        PageRequested(
            pageId=page_id, taskId=task_id, description=description
        ),
    )
    update_task_status(project_root, task_id, "in_progress")
    return {"page_id": page_id}


def _ux_research(state: DesignPhaseState) -> dict:
    """Simulate UX research step."""
    project_root = Path(state["project_root"])
    page_id = state.get("page_id", "page-1")
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "design-task"
    suggestions = ["responsive-grid", "card-layout", "minimal-nav"]

    write_event(
        project_root,
        UXResearchComplete(
            pageId=page_id, taskId=task_id, layoutSuggestions=suggestions
        ),
    )
    return {"ux_research_output": suggestions}


def _wireframe(state: DesignPhaseState) -> dict:
    """Generate wireframe artifact."""
    project_root = Path(state["project_root"])
    page_id = state.get("page_id", "page-1")
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "design-task"
    wireframe_ref = f"designs/{page_id}/wireframe.fig"

    write_event(
        project_root,
        WireframeComplete(
            pageId=page_id, taskId=task_id, designRef=wireframe_ref
        ),
    )
    update_task_status(project_root, task_id, "awaiting_approval")
    return {"wireframe_ref": wireframe_ref}


def _human_review(state: DesignPhaseState) -> dict:
    """HITL gate — graph is interrupted before this node.

    When resumed, hitl_decision will contain the human's choice.
    """
    project_root = Path(state["project_root"])
    page_id = state.get("page_id", "page-1")
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "design-task"
    decision = state.get("hitl_decision", "approved")

    if decision == "approved":
        write_event(
            project_root,
            WireframeApproved(
                pageId=page_id,
                taskId=task_id,
                designRef=state.get("wireframe_ref", ""),
            ),
        )
        update_task_status(project_root, task_id, "in_progress")
    return {"review_result": decision, "hitl_decision": None}


def _visual_design(state: DesignPhaseState) -> dict:
    """Generate visual design from approved wireframe."""
    project_root = Path(state["project_root"])
    page_id = state.get("page_id", "page-1")
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "design-task"
    design_ref = f"designs/{page_id}/visual.fig"

    write_event(
        project_root,
        VisualDesignComplete(
            pageId=page_id, taskId=task_id, designRef=design_ref
        ),
    )
    return {"visual_design_ref": design_ref}


def _design_review(state: DesignPhaseState) -> dict:
    """Automated design review."""
    project_root = Path(state["project_root"])
    page_id = state.get("page_id", "page-1")
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "design-task"

    write_event(
        project_root,
        DesignReviewComplete(
            pageId=page_id, taskId=task_id, passed=True, issues=[]
        ),
    )
    update_task_status(project_root, task_id, "awaiting_approval")
    return {}


def _human_approve(state: DesignPhaseState) -> dict:
    """Final HITL approval gate for design phase."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "design-task"
    decision = state.get("hitl_decision", "approved")

    if decision == "approved":
        write_event(
            project_root,
            DesignPhaseComplete(
                specRef=f"specs/{state.get('page_id', 'page-1')}.yaml",
                designRef=state.get("visual_design_ref", ""),
            ),
        )
        update_task_status(project_root, task_id, "completed")
    return {"review_result": decision, "hitl_decision": None}


def _route_after_review(state: DesignPhaseState) -> str:
    """Conditional edge: loop back to wireframe on changes_requested."""
    if state.get("review_result") == "changes_requested":
        return "wireframe"
    return "visual_design"


def build_design_graph() -> StateGraph:
    """Construct the design phase LangGraph StateGraph."""
    graph = StateGraph(DesignPhaseState)

    graph.add_node("page_request", _page_request)
    graph.add_node("ux_research", _ux_research)
    graph.add_node("wireframe", _wireframe)
    graph.add_node("human_review", _human_review)
    graph.add_node("visual_design", _visual_design)
    graph.add_node("design_review", _design_review)
    graph.add_node("human_approve", _human_approve)

    graph.set_entry_point("page_request")
    graph.add_edge("page_request", "ux_research")
    graph.add_edge("ux_research", "wireframe")
    graph.add_edge("wireframe", "human_review")
    graph.add_conditional_edges("human_review", _route_after_review)
    graph.add_edge("visual_design", "design_review")
    graph.add_edge("design_review", "human_approve")
    graph.add_edge("human_approve", END)

    return graph
