"""Orchestration engine test suite.

Validates the five SDLC phase transitions, pause/resume behaviour,
HITL gate approval/rejection, status reporting, and phase sequencing
constraints per PRD v2.0 Section 4.4.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from ruamel.yaml import YAML

from agentforge_engine.config import load_tasks
from agentforge_engine.models import TaskEntry, TasksFile
from agentforge_engine.server import _active_phases, app

_yaml = YAML()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_active_phases():
    """Ensure no leftover phase state between tests."""
    _active_phases.clear()
    yield
    for entry in _active_phases.values():
        task: asyncio.Task = entry.get("task")
        if task and not task.done():
            task.cancel()
    _active_phases.clear()


@pytest.fixture()
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac  # type: ignore[misc]


def _write_tasks(project_root: Path, tasks: list[dict]) -> None:
    """Helper: overwrite the tasks YAML file."""
    data = {"tasks": tasks}
    with (project_root / "agentforge.tasks.yaml").open("w") as f:
        _yaml.dump(data, f)


def _make_task(
    task_id: str,
    phase: str,
    status: str = "pending",
    depends_on: list[str] | None = None,
    agent: str = "test-agent",
    pr_number: int | None = None,
    cost_usd: float = 0.0,
) -> dict:
    """Build a minimal task dict."""
    return {
        "id": task_id,
        "title": f"Task {task_id}",
        "phase": phase,
        "agent": agent,
        "status": status,
        "depends_on": depends_on or [],
        "spec_ref": f"specs/{task_id}.yaml",
        "branch": f"feat/{task_id}" if status != "pending" else None,
        "pr_number": pr_number,
        "cost_usd": cost_usd,
        "tokens_used": 0,
        "attempts": 0,
        "max_attempts": 3,
        "hitl_status": "",
        "hitl_channel": None,
    }


def _project_with_phase_tasks(tmp_project: Path, phase: str) -> Path:
    """Write tasks for a specific phase and return the project root."""
    _write_tasks(tmp_project, [_make_task(f"{phase}-task-1", phase)])
    return tmp_project



# ---------------------------------------------------------------------------
# 1. Phase transitions: pending → active → complete for each SDLC phase
# ---------------------------------------------------------------------------


class TestPhaseTransitions:
    """startPhase() correctly transitions project state through
    pending -> active -> complete for each of the 5 SDLC phases."""

    @pytest.mark.parametrize("phase", ["design", "spec", "code", "cicd"])
    @pytest.mark.asyncio
    async def test_start_phase_returns_running(
        self, client: AsyncClient, tmp_project: Path, phase: str
    ) -> None:
        """Starting any valid phase via server returns status=running."""
        _project_with_phase_tasks(tmp_project, phase)
        resp = await client.post(
            "/phase/start",
            json={"phase": phase, "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["phase"] == phase
        assert data["status"] == "running"
        assert "thread_id" in data

    @pytest.mark.asyncio
    async def test_design_phase_pending_to_complete(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Design phase end-to-end via server: pending → in_progress → complete."""
        _project_with_phase_tasks(tmp_project, "design")

        tasks_before = load_tasks(tmp_project)
        assert tasks_before.tasks[0].status == "pending"

        resp = await client.post(
            "/phase/start",
            json={"phase": "design", "project_root": str(tmp_project)},
        )
        thread_id = resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        # Task should be active (in_progress or awaiting_approval).
        tasks_mid = load_tasks(tmp_project)
        assert tasks_mid.tasks[0].status in ("in_progress", "awaiting_approval")

        # Approve wireframe review.
        await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        await asyncio.sleep(0.3)

        # Approve final design.
        await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_approve",
                "decision": "approved",
            },
        )
        await asyncio.sleep(0.3)

        tasks_after = load_tasks(tmp_project)
        assert tasks_after.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_spec_phase_pending_to_complete(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Spec phase via server: pending → in_progress → complete."""
        _project_with_phase_tasks(tmp_project, "spec")

        resp = await client.post(
            "/phase/start",
            json={"phase": "spec", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        thread_id = resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        tasks_mid = load_tasks(tmp_project)
        assert tasks_mid.tasks[0].status == "in_progress"

        # Approve human_review gate.
        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks_after = load_tasks(tmp_project)
        assert tasks_after.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_code_phase_pending_to_complete(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Code gen phase via server: tasks transition pending → complete."""
        _write_tasks(
            tmp_project,
            [_make_task("code-task-1", "code"), _make_task("code-task-2", "code")],
        )

        resp = await client.post(
            "/phase/start",
            json={"phase": "code", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        thread_id = resp.json()["thread_id"]
        await asyncio.sleep(0.5)

        # Approve human_review gate.
        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks_after = load_tasks(tmp_project)
        completed_ids = [t.id for t in tasks_after.tasks if t.status == "completed"]
        assert "code-task-1" in completed_ids
        assert "code-task-2" in completed_ids

    @pytest.mark.asyncio
    async def test_cicd_phase_pending_to_complete(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """CICD phase via server: task transitions pending → complete."""
        _project_with_phase_tasks(tmp_project, "cicd")

        resp = await client.post(
            "/phase/start",
            json={"phase": "cicd", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        thread_id = resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        # Approve human_approve gate (production deployment).
        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_approve",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks_after = load_tasks(tmp_project)
        assert tasks_after.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_observe_phase_pending_to_complete(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Observe phase: starts successfully and transitions task to complete."""
        _project_with_phase_tasks(tmp_project, "observe")
        resp = await client.post(
            "/phase/start",
            json={"phase": "observe", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks_after = load_tasks(tmp_project)
        assert tasks_after.tasks[0].status == "completed"


# ---------------------------------------------------------------------------
# 2. pausePhase() freezes active tasks and sets status to paused
# ---------------------------------------------------------------------------


class TestPausePhase:
    """pausePhase() freezes all active tasks and sets status to paused."""

    @pytest.mark.asyncio
    async def test_pause_sets_status_to_paused(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Pausing a running phase sets the entry status to 'paused'."""
        _project_with_phase_tasks(tmp_project, "design")

        start_resp = await client.post(
            "/phase/start",
            json={"phase": "design", "project_root": str(tmp_project)},
        )
        thread_id = start_resp.json()["thread_id"]
        await asyncio.sleep(0.2)

        pause_resp = await client.post(
            "/phase/pause", json={"thread_id": thread_id}
        )
        assert pause_resp.status_code == 200
        assert pause_resp.json()["status"] == "paused"
        assert _active_phases[thread_id]["status"] == "paused"

    @pytest.mark.asyncio
    async def test_pause_cancels_asyncio_task(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Pausing cancels the underlying asyncio task so no new work proceeds."""
        _project_with_phase_tasks(tmp_project, "design")

        start_resp = await client.post(
            "/phase/start",
            json={"phase": "design", "project_root": str(tmp_project)},
        )
        thread_id = start_resp.json()["thread_id"]
        await asyncio.sleep(0.2)

        await client.post("/phase/pause", json={"thread_id": thread_id})
        await asyncio.sleep(0.1)

        task: asyncio.Task = _active_phases[thread_id]["task"]
        assert task.done()

    @pytest.mark.asyncio
    async def test_pause_blocks_new_agent_spawns(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """After pause, the phase no longer appears in active_phases for status."""
        _project_with_phase_tasks(tmp_project, "design")

        start_resp = await client.post(
            "/phase/start",
            json={"phase": "design", "project_root": str(tmp_project)},
        )
        thread_id = start_resp.json()["thread_id"]
        await asyncio.sleep(0.2)

        await client.post("/phase/pause", json={"thread_id": thread_id})

        status_resp = await client.get(
            "/status", params={"project_root": str(tmp_project)}
        )
        data = status_resp.json()
        assert "design" not in data["active_phases"]

    @pytest.mark.asyncio
    async def test_pause_nonexistent_thread_returns_404(
        self, client: AsyncClient
    ) -> None:
        resp = await client.post(
            "/phase/pause", json={"thread_id": "nonexistent"}
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 3. approveGate() with decision=approve/reject
# ---------------------------------------------------------------------------


class TestApproveGate:
    """approveGate() with decision=approve resumes blocked tasks;
    decision=reject creates a revision task (changes_requested)."""

    @pytest.mark.asyncio
    async def test_approve_resumes_and_completes_spec(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Spec: approving at HITL gate via server resumes graph to completion."""
        _project_with_phase_tasks(tmp_project, "spec")

        start_resp = await client.post(
            "/phase/start",
            json={"phase": "spec", "project_root": str(tmp_project)},
        )
        assert start_resp.status_code == 200
        thread_id = start_resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "resumed"
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        assert tasks.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_reject_sets_changes_requested_spec(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Spec: rejecting at HITL gate via server sets task to changes_requested."""
        _project_with_phase_tasks(tmp_project, "spec")

        start_resp = await client.post(
            "/phase/start",
            json={"phase": "spec", "project_root": str(tmp_project)},
        )
        assert start_resp.status_code == 200
        thread_id = start_resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "changes_requested",
                "feedback": "Needs more detail on auth flow",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        assert tasks.tasks[0].status == "changes_requested"

    @pytest.mark.asyncio
    async def test_design_approve_via_server(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Design: server gate/approve returns resumed status."""
        _project_with_phase_tasks(tmp_project, "design")

        start_resp = await client.post(
            "/phase/start",
            json={"phase": "design", "project_root": str(tmp_project)},
        )
        thread_id = start_resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "resumed"

    @pytest.mark.asyncio
    async def test_design_reject_loops_back_to_wireframe(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Design: rejecting wireframe review loops back to wireframe node."""
        _project_with_phase_tasks(tmp_project, "design")

        start_resp = await client.post(
            "/phase/start",
            json={"phase": "design", "project_root": str(tmp_project)},
        )
        thread_id = start_resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        # Reject → loops back to wireframe → pauses at human_review again.
        await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "changes_requested",
                "feedback": "Wireframe needs revision",
            },
        )
        await asyncio.sleep(0.3)

        # Approve second time.
        await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        await asyncio.sleep(0.3)

        # Approve final design.
        await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_approve",
                "decision": "approved",
            },
        )
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        assert tasks.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_approve_with_feedback_propagates(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Feedback string is propagated through server gate approval."""
        _project_with_phase_tasks(tmp_project, "spec")

        start_resp = await client.post(
            "/phase/start",
            json={"phase": "spec", "project_root": str(tmp_project)},
        )
        assert start_resp.status_code == 200
        thread_id = start_resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
                "feedback": "Looks good, minor style nit",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "resumed"
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        assert tasks.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_approve_nonexistent_thread_returns_404(
        self, client: AsyncClient
    ) -> None:
        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": "nonexistent",
                "gate_id": "g1",
                "decision": "approved",
            },
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 4. getStatus() returns ProjectState object
# ---------------------------------------------------------------------------


class TestGetStatus:
    """getStatus() returns a ProjectState object with current phase,
    all task statuses, active agent count, and budget consumed."""

    @pytest.mark.asyncio
    async def test_status_returns_all_tasks(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        _write_tasks(
            tmp_project,
            [
                _make_task("t1", "design", "completed", cost_usd=1.50),
                _make_task("t2", "spec", "in_progress", cost_usd=0.75),
                _make_task("t3", "code", "pending"),
            ],
        )

        resp = await client.get(
            "/status", params={"project_root": str(tmp_project)}
        )
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["tasks"]) == 3
        assert [t["id"] for t in data["tasks"]] == ["t1", "t2", "t3"]

    @pytest.mark.asyncio
    async def test_status_reflects_task_statuses(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        _write_tasks(
            tmp_project,
            [
                _make_task("t1", "design", "completed"),
                _make_task("t2", "spec", "awaiting_approval"),
                _make_task("t3", "code", "failed"),
            ],
        )

        resp = await client.get(
            "/status", params={"project_root": str(tmp_project)}
        )
        statuses = {t["id"]: t["status"] for t in resp.json()["tasks"]}
        assert statuses == {
            "t1": "completed",
            "t2": "awaiting_approval",
            "t3": "failed",
        }

    @pytest.mark.asyncio
    async def test_status_shows_active_phases(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        _project_with_phase_tasks(tmp_project, "design")

        await client.post(
            "/phase/start",
            json={"phase": "design", "project_root": str(tmp_project)},
        )
        await asyncio.sleep(0.2)

        resp = await client.get(
            "/status", params={"project_root": str(tmp_project)}
        )
        data = resp.json()
        assert "active_phases" in data
        assert isinstance(data["active_phases"], list)

    @pytest.mark.asyncio
    async def test_status_includes_budget_fields(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        _write_tasks(
            tmp_project,
            [
                _make_task("t1", "code", "completed", cost_usd=2.50),
                _make_task("t2", "code", "in_progress", cost_usd=1.00),
            ],
        )

        resp = await client.get(
            "/status", params={"project_root": str(tmp_project)}
        )
        data = resp.json()
        total_cost = sum(t["cost_usd"] for t in data["tasks"])
        assert total_cost == pytest.approx(3.50)
        assert data["budget_consumed"] == pytest.approx(3.50)

    @pytest.mark.asyncio
    async def test_status_missing_project_returns_404(
        self, client: AsyncClient
    ) -> None:
        resp = await client.get(
            "/status", params={"project_root": "/nonexistent/path"}
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_status_matches_project_state_interface(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """StatusResponse contains all fields expected by ProjectState
        per PRD v2.0 Section 4.4: current phase, all task statuses,
        active agent count, and budget consumed."""
        _write_tasks(
            tmp_project,
            [_make_task("t1", "design", "in_progress", cost_usd=1.0)],
        )

        resp = await client.get(
            "/status", params={"project_root": str(tmp_project)}
        )
        data = resp.json()

        assert "tasks" in data
        assert "active_phases" in data
        assert "active_agent_count" in data
        assert "budget_consumed" in data

        task = data["tasks"][0]
        for field in ("id", "title", "phase", "agent", "status", "cost_usd"):
            assert field in task, f"Missing field: {field}"

    @pytest.mark.asyncio
    async def test_status_active_agent_count(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """active_agent_count counts tasks with in_progress or awaiting_approval status."""
        _write_tasks(
            tmp_project,
            [
                _make_task("t1", "code", "in_progress", cost_usd=0.50),
                _make_task("t2", "code", "awaiting_approval", cost_usd=1.20),
                _make_task("t3", "code", "completed", cost_usd=0.30),
            ],
        )

        resp = await client.get(
            "/status", params={"project_root": str(tmp_project)}
        )
        data = resp.json()
        assert data["active_agent_count"] == 2

    @pytest.mark.asyncio
    async def test_status_budget_consumed(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """budget_consumed sums cost_usd across all tasks."""
        _write_tasks(
            tmp_project,
            [
                _make_task("t1", "code", "in_progress", cost_usd=0.50),
                _make_task("t2", "code", "awaiting_approval", cost_usd=1.20),
                _make_task("t3", "code", "completed", cost_usd=0.30),
            ],
        )

        resp = await client.get(
            "/status", params={"project_root": str(tmp_project)}
        )
        data = resp.json()
        assert data["budget_consumed"] == pytest.approx(2.00)


# ---------------------------------------------------------------------------
# 5. Phase sequencing: enforce phase ordering constraints
# ---------------------------------------------------------------------------


class TestPhaseSequencing:
    """Phase dependency enforcement: code_gen cannot start until spec is complete;
    cicd cannot start until code_gen has at least one merged PR."""

    @pytest.mark.asyncio
    async def test_code_cannot_start_without_completed_spec(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Code gen via server with incomplete spec dep has no runnable tasks."""
        _write_tasks(
            tmp_project,
            [
                _make_task("spec-1", "spec", "in_progress"),
                _make_task("code-1", "code", "pending", depends_on=["spec-1"]),
            ],
        )

        resp = await client.post(
            "/phase/start",
            json={"phase": "code", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        code_task = next(t for t in tasks.tasks if t.id == "code-1")
        assert code_task.status == "pending"

    @pytest.mark.asyncio
    async def test_code_starts_when_spec_is_complete(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Code gen via server: tasks become runnable once spec dep completes."""
        _write_tasks(
            tmp_project,
            [
                _make_task("spec-1", "spec", "completed"),
                _make_task("code-1", "code", "pending", depends_on=["spec-1"]),
            ],
        )

        resp = await client.post(
            "/phase/start",
            json={"phase": "code", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        code_task = next(t for t in tasks.tasks if t.id == "code-1")
        assert code_task.status in ("in_progress", "awaiting_approval", "completed")

    @pytest.mark.asyncio
    async def test_cicd_requires_completed_code_task(
        self, tmp_project: Path
    ) -> None:
        """CICD tasks with in-progress code dependencies remain blocked.

        DEVIATION LOG: PRD specifies 'at least one merged PR' as a cicd gate.
        The current implementation uses task dependency resolution (code task
        must be 'completed') as the proxy rather than checking PR merge status.
        """
        _write_tasks(
            tmp_project,
            [
                _make_task("code-1", "code", "in_progress", pr_number=101),
                _make_task("cicd-1", "cicd", "pending", depends_on=["code-1"]),
            ],
        )

        from agentforge_engine.task_resolver import find_runnable_tasks

        tasks = load_tasks(tmp_project)
        runnable = find_runnable_tasks(tasks.tasks)
        runnable_ids = [t.id for t in runnable]
        assert "cicd-1" not in runnable_ids

    @pytest.mark.asyncio
    async def test_cicd_proceeds_after_code_complete(
        self, tmp_project: Path
    ) -> None:
        """CICD task becomes runnable when code dependency is completed."""
        _write_tasks(
            tmp_project,
            [
                _make_task("code-1", "code", "completed", pr_number=101),
                _make_task("cicd-1", "cicd", "pending", depends_on=["code-1"]),
            ],
        )

        from agentforge_engine.task_resolver import find_runnable_tasks

        tasks = load_tasks(tmp_project)
        runnable = find_runnable_tasks(tasks.tasks)
        runnable_ids = [t.id for t in runnable]
        assert "cicd-1" in runnable_ids


# ---------------------------------------------------------------------------
# Task resolver unit tests (dependency enforcement)
# ---------------------------------------------------------------------------


class TestTaskResolver:
    """Unit tests for the task dependency resolution logic."""

    def test_find_runnable_no_deps(self) -> None:
        from agentforge_engine.task_resolver import find_runnable_tasks

        tasks = [
            TaskEntry(
                id="t1", title="T1", phase="spec", agent="a",
                status="pending", spec_ref="s",
            ),
        ]
        assert [t.id for t in find_runnable_tasks(tasks)] == ["t1"]

    def test_find_runnable_blocks_on_incomplete_dep(self) -> None:
        from agentforge_engine.task_resolver import find_runnable_tasks

        tasks = [
            TaskEntry(
                id="t1", title="T1", phase="spec", agent="a",
                status="in_progress", spec_ref="s",
            ),
            TaskEntry(
                id="t2", title="T2", phase="code", agent="a",
                status="pending", depends_on=["t1"], spec_ref="s",
            ),
        ]
        assert len(find_runnable_tasks(tasks)) == 0

    def test_find_runnable_unblocks_on_completed_dep(self) -> None:
        from agentforge_engine.task_resolver import find_runnable_tasks

        tasks = [
            TaskEntry(
                id="t1", title="T1", phase="spec", agent="a",
                status="completed", spec_ref="s",
            ),
            TaskEntry(
                id="t2", title="T2", phase="code", agent="a",
                status="pending", depends_on=["t1"], spec_ref="s",
            ),
        ]
        assert [t.id for t in find_runnable_tasks(tasks)] == ["t2"]

    def test_circular_dependency_detected(self) -> None:
        from agentforge_engine.task_resolver import detect_circular_deps

        tasks = [
            TaskEntry(
                id="t1", title="T1", phase="code", agent="a",
                status="pending", depends_on=["t2"], spec_ref="s",
            ),
            TaskEntry(
                id="t2", title="T2", phase="code", agent="a",
                status="pending", depends_on=["t1"], spec_ref="s",
            ),
        ]
        assert len(detect_circular_deps(tasks)) > 0

    def test_on_task_completed_unblocks_dependents(self) -> None:
        from agentforge_engine.task_resolver import on_task_completed

        tasks = [
            TaskEntry(
                id="t1", title="T1", phase="spec", agent="a",
                status="completed", spec_ref="s",
            ),
            TaskEntry(
                id="t2", title="T2", phase="code", agent="a",
                status="pending", depends_on=["t1"], spec_ref="s",
            ),
        ]
        assert [t.id for t in on_task_completed("t1", tasks)] == ["t2"]


# ---------------------------------------------------------------------------
# SlotManager tests
# ---------------------------------------------------------------------------


class TestSlotManager:
    """SlotManager enforces max_concurrent_agents and slot semantics."""

    def test_acquire_and_release(self) -> None:
        from agentforge_engine.concurrency import SlotManager

        sm = SlotManager(max_slots=2)
        assert sm.can_start()
        assert sm.acquire("t1")
        assert sm.acquire("t2")
        assert not sm.can_start()
        assert not sm.acquire("t3")

        sm.release("t1")
        assert sm.can_start()
        assert sm.acquire("t3")

    def test_ci_waiting_keeps_slot(self) -> None:
        """CI-waiting tasks retain their slot per PRD 11.3.4."""
        from agentforge_engine.concurrency import SlotManager

        sm = SlotManager(max_slots=1)
        sm.acquire("t1")
        sm.mark_ci_waiting("t1")

        assert sm.active_count == 1
        assert not sm.can_start()
        assert "t1" in sm.ci_waiting_ids
        assert "t1" not in sm.executing_ids


# ---------------------------------------------------------------------------
# Regression: per-phase interrupt_before (was hardcoded, now per-phase)
# ---------------------------------------------------------------------------


class TestPerPhaseInterruptRegression:
    """Regression tests for the fix where server.py hardcoded
    interrupt_before=["human_review", "human_approve"] for all graphs.

    Each test starts a phase through the real server endpoint and approves
    through its actual HITL gates to completion.
    """

    @pytest.mark.asyncio
    async def test_spec_start_and_approve_via_server(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Spec phase: start + approve human_review through server endpoint."""
        _project_with_phase_tasks(tmp_project, "spec")

        resp = await client.post(
            "/phase/start",
            json={"phase": "spec", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        thread_id = resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        assert tasks.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_code_start_and_approve_via_server(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Code phase: start + approve human_review through server endpoint."""
        _write_tasks(tmp_project, [_make_task("code-1", "code")])

        resp = await client.post(
            "/phase/start",
            json={"phase": "code", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        thread_id = resp.json()["thread_id"]
        await asyncio.sleep(0.5)

        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        assert tasks.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_cicd_start_and_approve_via_server(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """CICD phase: start + approve human_approve through server endpoint."""
        _project_with_phase_tasks(tmp_project, "cicd")

        resp = await client.post(
            "/phase/start",
            json={"phase": "cicd", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        thread_id = resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_approve",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        assert tasks.tasks[0].status == "completed"

    @pytest.mark.asyncio
    async def test_design_start_and_full_approve_via_server(
        self, client: AsyncClient, tmp_project: Path
    ) -> None:
        """Design phase: start + approve both HITL gates through server."""
        _project_with_phase_tasks(tmp_project, "design")

        resp = await client.post(
            "/phase/start",
            json={"phase": "design", "project_root": str(tmp_project)},
        )
        assert resp.status_code == 200
        thread_id = resp.json()["thread_id"]
        await asyncio.sleep(0.3)

        # Approve wireframe review (human_review).
        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_review",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        # Approve final design (human_approve).
        resp = await client.post(
            "/gate/approve",
            json={
                "thread_id": thread_id,
                "gate_id": "human_approve",
                "decision": "approved",
            },
        )
        assert resp.status_code == 200
        await asyncio.sleep(0.3)

        tasks = load_tasks(tmp_project)
        assert tasks.tasks[0].status == "completed"
