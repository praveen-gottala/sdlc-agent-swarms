"""FastAPI server for the AgentForge orchestration engine.

Endpoints:
  POST /phase/start   — start a phase graph as a background task
  POST /phase/pause   — pause a running phase
  GET  /status        — read current task + phase state
  POST /gate/approve  — resume an interrupted graph with a HITL decision
  POST /task/abort    — cancel a graph node and fail a task
  GET  /health        — liveness check
"""

from __future__ import annotations

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel

from .config import load_manifest, load_tasks, save_tasks
from .models import TasksFile
from .event_bridge import read_events, truncate
from .graphs.cicd_phase import build_cicd_graph
from .graphs.code_gen_phase import build_code_gen_graph
from .graphs.design_phase import build_design_graph
from .graphs.observe_phase import build_observe_graph
from .graphs.spec_phase import build_spec_graph

# ---------------------------------------------------------------------------
# In-memory registry of running phase graphs
# ---------------------------------------------------------------------------

_active_phases: dict[str, dict[str, Any]] = {}
_checkpointer = MemorySaver()

_PHASE_CONFIGS: dict[str, dict[str, Any]] = {
    "design": {"builder": build_design_graph, "interrupt_before": ["human_review", "human_approve"]},
    "spec": {"builder": build_spec_graph, "interrupt_before": ["human_review"]},
    "code": {"builder": build_code_gen_graph, "interrupt_before": ["human_review"]},
    "cicd": {"builder": build_cicd_graph, "interrupt_before": ["human_approve"]},
    "observe": {"builder": build_observe_graph, "interrupt_before": []},
}

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class PhaseStartRequest(BaseModel):
    phase: str
    project_root: str


class PhaseStartResponse(BaseModel):
    thread_id: str
    phase: str
    status: str


class PhasePauseRequest(BaseModel):
    thread_id: str


class GateApproveRequest(BaseModel):
    thread_id: str
    gate_id: str
    decision: str
    feedback: str | None = None


class TaskAbortRequest(BaseModel):
    task_id: str


class HealthResponse(BaseModel):
    status: str
    version: str
    active_phases: list[str]


class StatusResponse(BaseModel):
    tasks: list[dict[str, Any]]
    active_phases: list[str]
    active_agent_count: int
    budget_consumed: float


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    """Write PID file on startup, clean up on shutdown."""
    pid_dir = Path(".agentforge")
    pid_dir.mkdir(parents=True, exist_ok=True)
    pid_file = pid_dir / "engine.pid"
    pid_file.write_text(str(os.getpid()))
    yield
    pid_file.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="AgentForge Engine", version="0.1.0", lifespan=lifespan)


@app.post("/phase/start", response_model=PhaseStartResponse)
async def start_phase(req: PhaseStartRequest) -> PhaseStartResponse:
    """Start an SDLC phase graph as a background asyncio task."""
    if req.phase not in _PHASE_CONFIGS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown phase '{req.phase}'. Valid: {list(_PHASE_CONFIGS)}",
        )

    project_root = Path(req.project_root)
    if not project_root.exists():
        raise HTTPException(status_code=404, detail="Project root not found")

    # Truncate event log at phase start.
    truncate(project_root)

    thread_id = uuid.uuid4().hex[:12]

    # Load initial state from YAML.
    manifest = load_manifest(project_root)
    tasks_file = load_tasks(project_root)

    # Seed a task if none exist for this phase.
    phase_tasks = [t for t in tasks_file.tasks if t.phase == req.phase]
    if not phase_tasks:
        from .models import TaskEntry as TE

        seed_task = TE(
            id=f"{req.phase}-task-{thread_id[:6]}",
            title=f"{req.phase.capitalize()} phase task",
            phase=req.phase,
            agent=f"{req.phase}-agent",
            status="pending",
            spec_ref=f"agentforge/spec/{req.phase}.yaml",
        )
        all_tasks = list(tasks_file.tasks) + [seed_task]
        tasks_file = TasksFile(tasks=all_tasks)
        save_tasks(project_root, tasks_file)

    initial_state: dict[str, Any] = {
        "project_root": str(project_root),
        "phase": req.phase,
        "manifest": manifest.model_dump(),
        "tasks": [t.model_dump() for t in tasks_file.tasks],
        "events": [],
        "hitl_decision": None,
        "hitl_feedback": None,
        "error": None,
    }

    phase_cfg = _PHASE_CONFIGS[req.phase]
    graph = phase_cfg["builder"]()
    compiled = graph.compile(
        checkpointer=_checkpointer,
        interrupt_before=phase_cfg["interrupt_before"],
    )

    async def _run() -> None:
        config = {"configurable": {"thread_id": thread_id}}
        try:
            async for _ in compiled.astream(initial_state, config=config):
                pass
        except Exception as exc:
            _active_phases[thread_id]["error"] = str(exc)
        finally:
            _active_phases[thread_id]["status"] = "completed"

    task = asyncio.create_task(_run())
    _active_phases[thread_id] = {
        "phase": req.phase,
        "project_root": str(project_root),
        "task": task,
        "compiled": compiled,
        "status": "running",
        "error": None,
    }

    return PhaseStartResponse(
        thread_id=thread_id, phase=req.phase, status="running"
    )


@app.post("/phase/pause")
async def pause_phase(req: PhasePauseRequest) -> dict[str, str]:
    """Flag a running phase for pause."""
    entry = _active_phases.get(req.thread_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Thread not found")

    task: asyncio.Task[None] = entry["task"]
    if not task.done():
        task.cancel()
    entry["status"] = "paused"
    return {"status": "paused", "thread_id": req.thread_id}


@app.get("/status", response_model=StatusResponse)
async def get_status(project_root: str) -> StatusResponse:
    """Read current tasks and active phase metadata."""
    pr = Path(project_root)
    if not pr.exists():
        raise HTTPException(status_code=404, detail="Project root not found")

    tasks_file = load_tasks(pr)
    active = [
        v["phase"]
        for v in _active_phases.values()
        if v["status"] == "running" and v["project_root"] == str(pr)
    ]
    _ACTIVE_STATUSES = {"in_progress", "awaiting_approval"}
    active_agent_count = sum(
        1 for t in tasks_file.tasks if t.status in _ACTIVE_STATUSES
    )
    budget_consumed = sum(t.cost_usd for t in tasks_file.tasks)
    return StatusResponse(
        tasks=[t.model_dump() for t in tasks_file.tasks],
        active_phases=active,
        active_agent_count=active_agent_count,
        budget_consumed=budget_consumed,
    )


@app.post("/gate/approve")
async def gate_approve(req: GateApproveRequest) -> dict[str, str]:
    """Resume an interrupted graph with a HITL decision."""
    entry = _active_phases.get(req.thread_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Thread not found")

    compiled = entry["compiled"]
    config = {"configurable": {"thread_id": req.thread_id}}

    # Update state with the decision.
    compiled.update_state(
        config,
        {
            "hitl_decision": req.decision,
            "hitl_feedback": req.feedback,
        },
    )

    # Resume graph execution in a new async task.
    async def _resume() -> None:
        try:
            async for _ in compiled.astream(None, config=config):
                pass
        except Exception as exc:
            entry["error"] = str(exc)
        finally:
            entry["status"] = "completed"

    entry["status"] = "running"
    task = asyncio.create_task(_resume())
    entry["task"] = task

    return {"status": "resumed", "thread_id": req.thread_id}


@app.post("/task/abort")
async def abort_task(req: TaskAbortRequest) -> dict[str, str]:
    """Cancel the graph node for a task and mark it failed."""
    from .config import update_task_status

    # Find which thread is handling this task.
    for tid, entry in _active_phases.items():
        pr = Path(entry["project_root"])
        result = update_task_status(pr, req.task_id, "failed")
        if result is not None:
            task: asyncio.Task[None] = entry["task"]
            if not task.done():
                task.cancel()
            return {"status": "aborted", "task_id": req.task_id}

    raise HTTPException(status_code=404, detail="Task not found")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness check."""
    active = [
        v["phase"] for v in _active_phases.values() if v["status"] == "running"
    ]
    return HealthResponse(
        status="ok", version="0.1.0", active_phases=active
    )
