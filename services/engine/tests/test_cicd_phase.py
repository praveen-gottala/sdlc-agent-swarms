"""Tests for the CI/CD phase graph via the server API."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from agentforge_engine.config import load_tasks
from agentforge_engine.server import _active_phases, app


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


@pytest.mark.asyncio
async def test_cicd_happy_path(client: AsyncClient, tmp_project: Path) -> None:
    """CI passes → staging deploy → health check → human approve."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "cicd", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200
    thread_id = resp.json()["thread_id"]
    await asyncio.sleep(0.3)

    # Approve production deployment (human_approve).
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
    task_1 = next(t for t in tasks.tasks if t.id == "task-1")
    assert task_1.status == "completed"


@pytest.mark.asyncio
async def test_cicd_staging_auto_deploy(
    client: AsyncClient, tmp_project: Path
) -> None:
    """Staging deployment proceeds automatically through CI and deploy steps.

    The graph runs CI → deploy_staging → health_check before pausing at
    human_approve. The task is not yet completed — it awaits human approval.
    We verify by checking the task status is not yet "completed".
    """
    resp = await client.post(
        "/phase/start",
        json={"phase": "cicd", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200
    thread_id = resp.json()["thread_id"]
    await asyncio.sleep(0.3)

    # Task should NOT be completed yet — graph is paused at human_approve.
    tasks = load_tasks(tmp_project)
    task_1 = next(t for t in tasks.tasks if t.id == "task-1")
    assert task_1.status != "completed"

    # Gate approve should still work (graph is resumable).
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

    # Now task should be completed.
    tasks = load_tasks(tmp_project)
    task_1 = next(t for t in tasks.tasks if t.id == "task-1")
    assert task_1.status == "completed"
