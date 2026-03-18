"""Tests for Pydantic model YAML round-trip fidelity."""

from __future__ import annotations

from pathlib import Path

from ruamel.yaml import YAML

from agentforge_engine.models import (
    AgentStarted,
    ProjectManifest,
    TaskEntry,
    TasksFile,
)

_yaml = YAML()


def test_task_entry_roundtrip(tmp_path: Path) -> None:
    """Write TaskEntry → YAML → read back, verify fidelity."""
    entry = TaskEntry(
        id="t-1",
        title="Build login page",
        phase="code",
        agent="codegen",
        status="pending",
        depends_on=["t-0"],
        spec_ref="specs/login.yaml",
        branch=None,
        pr_number=None,
        cost_usd=0.0,
        tokens_used=0,
        attempts=0,
        max_attempts=3,
        hitl_status="",
        hitl_channel=None,
    )
    yaml_path = tmp_path / "task.yaml"
    with yaml_path.open("w") as f:
        _yaml.dump(entry.model_dump(), f)
    with yaml_path.open() as f:
        data = _yaml.load(f)
    restored = TaskEntry.model_validate(data)
    assert restored == entry


def test_tasks_file_roundtrip(tmp_path: Path) -> None:
    """Write TasksFile → YAML → read back."""
    tasks = TasksFile(
        tasks=[
            TaskEntry(
                id="a",
                title="A",
                phase="design",
                agent="x",
                status="completed",
                spec_ref="s",
            ),
            TaskEntry(
                id="b",
                title="B",
                phase="code",
                agent="y",
                status="pending",
                depends_on=["a"],
                spec_ref="s",
            ),
        ]
    )
    yaml_path = tmp_path / "tasks.yaml"
    with yaml_path.open("w") as f:
        _yaml.dump(tasks.model_dump(), f)
    with yaml_path.open() as f:
        data = _yaml.load(f)
    restored = TasksFile.model_validate(data)
    assert len(restored.tasks) == 2
    assert restored.tasks[0].id == "a"
    assert restored.tasks[1].depends_on == ["a"]


def test_manifest_roundtrip(tmp_project: Path) -> None:
    """Load a full manifest from the fixture and verify fields."""
    manifest = ProjectManifest.model_validate(
        _yaml.load((tmp_project / "agentforge.yaml").open())
    )
    assert manifest.project.name == "test-project"
    assert manifest.agents.orchestration.max_concurrent_agents == 3
    assert manifest.budget.per_task_max_usd == 5.0


def test_domain_event_serialization() -> None:
    """Verify domain events serialize with correct type discriminator."""
    event = AgentStarted(agentId="a1", taskId="t1", timestamp=100.0)
    data = event.model_dump()
    assert data["type"] == "AgentStarted"
    assert data["agentId"] == "a1"
    restored = AgentStarted.model_validate(data)
    assert restored.agentId == "a1"
