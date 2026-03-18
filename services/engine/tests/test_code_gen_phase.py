"""Tests for the code generation phase graph via the server API."""

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


@pytest.fixture(autouse=True)
def _clear_active_phases():
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


@pytest.fixture()
def codegen_project(tmp_project: Path) -> Path:
    """Project with tasks ready for code generation."""
    tasks = TasksFile(
        tasks=[
            TaskEntry(
                id="code-1",
                title="Build login",
                phase="code",
                agent="codegen",
                status="pending",
                depends_on=[],
                spec_ref="specs/login.yaml",
            ),
            TaskEntry(
                id="code-2",
                title="Build dashboard",
                phase="code",
                agent="codegen",
                status="pending",
                depends_on=[],
                spec_ref="specs/dashboard.yaml",
            ),
        ]
    )
    with (tmp_project / "agentforge.tasks.yaml").open("w") as f:
        _yaml.dump(tasks.model_dump(), f)
    return tmp_project


@pytest.mark.asyncio
async def test_codegen_happy_path(
    client: AsyncClient, codegen_project: Path
) -> None:
    """Assign → generate → CI → PR → security → review → approve."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "code", "project_root": str(codegen_project)},
    )
    assert resp.status_code == 200
    thread_id = resp.json()["thread_id"]
    await asyncio.sleep(0.5)

    # Approve human_review.
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

    tasks_after = load_tasks(codegen_project)
    for t in tasks_after.tasks:
        assert t.status == "completed"


@pytest.mark.asyncio
async def test_codegen_respects_max_concurrent(
    client: AsyncClient, codegen_project: Path
) -> None:
    """Only max_concurrent tasks are assigned at once.

    The manifest fixture sets max_concurrent_agents=3, so both tasks
    should be assigned. We verify both reach in_progress or beyond.
    """
    resp = await client.post(
        "/phase/start",
        json={"phase": "code", "project_root": str(codegen_project)},
    )
    assert resp.status_code == 200
    await asyncio.sleep(0.5)

    # Both tasks should have been assigned (moved past pending).
    tasks = load_tasks(codegen_project)
    for t in tasks.tasks:
        assert t.status != "pending"
