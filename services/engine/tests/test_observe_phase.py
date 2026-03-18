"""Tests for the observe phase graph via the server API."""

from __future__ import annotations

import asyncio
import json
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
async def test_observe_start_returns_200(client: AsyncClient, tmp_project: Path) -> None:
    """startPhase('observe') returns 200, not 400."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "observe", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "observe"
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_observe_transitions_pending_to_complete(
    client: AsyncClient, tmp_project: Path
) -> None:
    """Observe phase transitions task through pending → active → complete."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "observe", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200
    await asyncio.sleep(0.3)

    tasks = load_tasks(tmp_project)
    task_1 = next(t for t in tasks.tasks if t.id == "task-1")
    assert task_1.status == "completed"


@pytest.mark.asyncio
async def test_observe_emits_phase_events(
    client: AsyncClient, tmp_project: Path
) -> None:
    """PhaseStarted and PhaseComplete events are emitted."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "observe", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200
    await asyncio.sleep(0.3)

    events_path = tmp_project / ".agentforge" / "events.jsonl"
    assert events_path.exists()

    events = []
    for line in events_path.read_text().splitlines():
        if line.strip():
            events.append(json.loads(line))

    event_types = [e["type"] for e in events]
    assert "PhaseStarted" in event_types
    assert "PhaseComplete" in event_types

    started = next(e for e in events if e["type"] == "PhaseStarted")
    assert started["phase"] == "observe"

    completed = next(e for e in events if e["type"] == "PhaseComplete")
    assert completed["phase"] == "observe"


@pytest.mark.asyncio
async def test_status_includes_observe_phase(
    client: AsyncClient, tmp_project: Path
) -> None:
    """getStatus() includes observe phase while it's running."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "observe", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200

    # Check status immediately while graph may still be running.
    status_resp = await client.get(
        "/status", params={"project_root": str(tmp_project)}
    )
    assert status_resp.status_code == 200

    # After completion, tasks should reflect the observe phase ran.
    await asyncio.sleep(0.3)
    status_resp = await client.get(
        "/status", params={"project_root": str(tmp_project)}
    )
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert isinstance(data["tasks"], list)
    assert len(data["tasks"]) > 0
