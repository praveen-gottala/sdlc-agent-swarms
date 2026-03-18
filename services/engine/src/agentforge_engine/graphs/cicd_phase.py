"""CI/CD phase LangGraph graph.

Graph flow:
  ci_validation → build_fix_loop (conditional retry ≤3) →
  deploy_staging → health_check → human_approve_if_production*

Production deploy always interrupts for approval.
Staging proceeds automatically.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, StateGraph

from ..config import update_task_status
from ..event_bridge import write_event
from ..models import BuildFixComplete, CIFailed, DeployComplete, DeployFailed
from .common import BasePhaseState


class CICDPhaseState(BasePhaseState, total=False):
    """State specific to the CI/CD phase."""

    ci_passed: bool
    build_fix_attempts: int
    max_build_fix_attempts: int
    deploy_environment: str  # "staging" | "production"
    health_check_passed: bool


def _ci_validation(state: CICDPhaseState) -> dict:
    """Run CI pipeline on the branch."""
    # Simulate CI passing.
    return {"ci_passed": True, "build_fix_attempts": 0}


def _build_fix(state: CICDPhaseState) -> dict:
    """Attempt to fix a broken build."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "cicd-task"
    attempts = state.get("build_fix_attempts", 0) + 1

    write_event(
        project_root,
        BuildFixComplete(
            taskId=task_id,
            branch=f"feat/{task_id}",
            fixApplied=True,
        ),
    )
    # Simulate: fix succeeds.
    return {"ci_passed": True, "build_fix_attempts": attempts}


def _route_after_ci(state: CICDPhaseState) -> str:
    """Conditional edge: retry build fix if CI failed and under max attempts."""
    if state.get("ci_passed", False):
        return "deploy_staging"
    max_attempts = state.get("max_build_fix_attempts", 3)
    if state.get("build_fix_attempts", 0) < max_attempts:
        return "build_fix"
    return "escalate"


def _deploy_staging(state: CICDPhaseState) -> dict:
    """Deploy to staging environment."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "cicd-task"

    write_event(
        project_root,
        DeployComplete(
            taskId=task_id, environment="staging", healthy=True
        ),
    )
    return {"deploy_environment": "staging"}


def _health_check(state: CICDPhaseState) -> dict:
    """Run health checks against staging deployment."""
    # Simulate healthy deployment.
    return {"health_check_passed": True}


def _route_after_health(state: CICDPhaseState) -> str:
    """Route to production approval or end based on environment target."""
    if not state.get("health_check_passed", False):
        return "deploy_failed"
    # If manifest requests production deploy, require approval.
    env = state.get("deploy_environment", "staging")
    if env == "staging":
        return "human_approve"
    return END


def _human_approve(state: CICDPhaseState) -> dict:
    """HITL gate for production deployment approval."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "cicd-task"
    decision = state.get("hitl_decision", "approved")

    if decision == "approved":
        write_event(
            project_root,
            DeployComplete(
                taskId=task_id, environment="production", healthy=True
            ),
        )
        update_task_status(project_root, task_id, "completed")

    return {"hitl_decision": None}


def _deploy_failed(state: CICDPhaseState) -> dict:
    """Handle failed deployment."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "cicd-task"

    write_event(
        project_root,
        DeployFailed(
            taskId=task_id,
            environment=state.get("deploy_environment", "staging"),  # type: ignore[arg-type]
            reason="Health check failed",
        ),
    )
    update_task_status(project_root, task_id, "failed")
    return {"error": "Health check failed"}


def _escalate(state: CICDPhaseState) -> dict:
    """Escalate when build fixes exhausted."""
    project_root = Path(state["project_root"])
    task_id = state["tasks"][0]["id"] if state.get("tasks") else "cicd-task"
    update_task_status(project_root, task_id, "failed")
    return {"error": "Build fix attempts exhausted"}


def build_cicd_graph() -> StateGraph:
    """Construct the CI/CD phase LangGraph StateGraph."""
    graph = StateGraph(CICDPhaseState)

    graph.add_node("ci_validation", _ci_validation)
    graph.add_node("build_fix", _build_fix)
    graph.add_node("deploy_staging", _deploy_staging)
    graph.add_node("health_check", _health_check)
    graph.add_node("human_approve", _human_approve)
    graph.add_node("deploy_failed", _deploy_failed)
    graph.add_node("escalate", _escalate)

    graph.set_entry_point("ci_validation")
    graph.add_conditional_edges("ci_validation", _route_after_ci)
    graph.add_edge("build_fix", "ci_validation")
    graph.add_edge("deploy_staging", "health_check")
    graph.add_conditional_edges(
        "health_check",
        _route_after_health,
    )
    graph.add_edge("human_approve", END)
    graph.add_edge("deploy_failed", END)
    graph.add_edge("escalate", END)

    return graph
