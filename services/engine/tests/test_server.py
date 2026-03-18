"""Tests for the FastAPI server endpoints."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from agentforge_engine.server import app


@pytest.fixture()
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac  # type: ignore[misc]


@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_start_invalid_phase(client: AsyncClient) -> None:
    resp = await client.post(
        "/phase/start",
        json={"phase": "invalid", "project_root": "/nonexistent"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_start_missing_project(client: AsyncClient) -> None:
    resp = await client.post(
        "/phase/start",
        json={"phase": "design", "project_root": "/nonexistent/path"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_start_and_status(client: AsyncClient, tmp_project: Path) -> None:
    """Start a design phase and check status."""
    resp = await client.post(
        "/phase/start",
        json={"phase": "design", "project_root": str(tmp_project)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "design"
    assert "thread_id" in data

    # Check status.
    resp = await client.get("/status", params={"project_root": str(tmp_project)})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_gate_approve_not_found(client: AsyncClient) -> None:
    resp = await client.post(
        "/gate/approve",
        json={
            "thread_id": "nonexistent",
            "gate_id": "g1",
            "decision": "approved",
        },
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_abort_not_found(client: AsyncClient) -> None:
    resp = await client.post(
        "/task/abort",
        json={"task_id": "nonexistent"},
    )
    assert resp.status_code == 404
