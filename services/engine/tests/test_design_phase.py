"""Tests for the design phase graph via the server API."""

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
async def test_design_happy_path(client: AsyncClient, tmp_project: Path) -> None:
    """Full design phase with approvals at both HITL gates."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "design", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200
    thread_id = resp.json()["thread_id"]
    await asyncio.sleep(0.3)

    # Approve wireframe (human_review).
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

    # Verify task completed.
    tasks = load_tasks(tmp_project)
    task_1 = next(t for t in tasks.tasks if t.id == "task-1")
    assert task_1.status == "completed"


@pytest.mark.asyncio
async def test_design_changes_requested_loops(
    client: AsyncClient, tmp_project: Path
) -> None:
    """Changes requested at human_review loops back to wireframe."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "design", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200
    thread_id = resp.json()["thread_id"]
    await asyncio.sleep(0.3)

    # Request changes — should loop back to wireframe then hit human_review again.
    resp = await client.post(
        "/gate/approve",
        json={
            "thread_id": thread_id,
            "gate_id": "human_review",
            "decision": "changes_requested",
        },
    )
    assert resp.status_code == 200
    await asyncio.sleep(0.3)

    # Now approve.
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
    task_1 = next(t for t in tasks.tasks if t.id == "task-1")
    assert task_1.status == "completed"
